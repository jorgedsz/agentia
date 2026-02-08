const axios = require('axios');
const { getApiKeys } = require('../utils/getApiKeys');

// In-memory cache
let cachedVoices = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// All ElevenLabs multilingual_v2 premade voices support these languages
const ELEVENLABS_SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'nl', 'ru', 'ja',
  'zh', 'ko', 'hi', 'ar', 'cs', 'da', 'fi', 'el', 'he', 'hu',
  'id', 'ms', 'no', 'ro', 'sk', 'sv', 'tr', 'uk', 'vi'
];

async function fetchElevenLabsVoices(elevenLabsApiKey) {
  try {
    const headers = {};
    if (elevenLabsApiKey) headers['xi-api-key'] = elevenLabsApiKey;
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      timeout: 10000,
      headers,
    });
    const voices = response.data?.voices || [];
    return voices
      .filter(v => v.category === 'premade')
      .map(v => {
        const accent = (v.labels?.accent || '').toLowerCase() || null;
        const age = v.labels?.age || null;
        const useCase = v.labels?.use_case || v.labels?.['use case'] || null;
        return {
          provider: '11labs',
          voiceId: v.voice_id,
          name: v.name,
          gender: (v.labels?.gender || '').toLowerCase() || null,
          accent,
          age,
          useCase,
          description: v.labels?.description || null,
          languages: ELEVENLABS_SUPPORTED_LANGUAGES,
          previewUrl: v.preview_url || null,
        };
      });
  } catch (err) {
    console.error('Failed to fetch ElevenLabs voices:', err.message);
    return [];
  }
}

async function getCustomVoicesFromDB(prisma) {
  const rows = await prisma.customVoice.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(row => ({
    provider: row.provider,
    voiceId: row.voiceId,
    name: row.name,
    gender: row.gender || null,
    accent: row.accent || null,
    description: row.description || null,
    languages: row.languages ? JSON.parse(row.languages) : [],
    previewUrl: row.previewUrl || null,
    isCustom: true,
    customId: row.id,
  }));
}

exports.listVoices = async (req, res) => {
  try {
    const now = Date.now();

    // Custom voices always fetched fresh from DB (they're local, fast)
    const customVoices = await getCustomVoicesFromDB(req.prisma);

    if (cachedVoices && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json([...cachedVoices, ...customVoices]);
    }

    // Use ElevenLabs API key if available for authenticated access
    let elevenLabsKey = '';
    try {
      const keys = await getApiKeys(req.prisma);
      elevenLabsKey = keys.elevenLabsApiKey;
    } catch (_) {}
    const elevenLabsVoices = await fetchElevenLabsVoices(elevenLabsKey);

    cachedVoices = elevenLabsVoices;
    cacheTimestamp = now;

    res.json([...elevenLabsVoices, ...customVoices]);
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
};

exports.addCustomVoice = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can add custom voices' });
    }

    const {
      voiceId,
      name: customName,
      gender: userGender,
      accent: userAccent,
      languages: userLanguages,
      previewUrl: userPreviewUrl,
    } = req.body;
    if (!voiceId || typeof voiceId !== 'string' || !voiceId.trim()) {
      return res.status(400).json({ error: 'voiceId is required' });
    }

    const trimmedId = voiceId.trim();

    // Check if already exists
    const existing = await req.prisma.customVoice.findUnique({
      where: { voiceId_provider: { voiceId: trimmedId, provider: '11labs' } }
    });
    if (existing) {
      return res.status(409).json({ error: 'This voice ID has already been added' });
    }

    // Use user-provided values, fall back to defaults
    let name = customName || 'Custom Voice';
    let gender = userGender || null;
    let accent = userAccent || null;
    let description = null;
    let previewUrl = userPreviewUrl || null;
    let languages = Array.isArray(userLanguages) && userLanguages.length > 0 ? userLanguages : ['en'];

    let elevenLabsApiKey = '';
    try {
      const keys = await getApiKeys(req.prisma);
      elevenLabsApiKey = keys.elevenLabsApiKey || '';
    } catch (_) {}

    if (elevenLabsApiKey) {
      try {
        const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(trimmedId)}`, {
          timeout: 10000,
          headers: { 'xi-api-key': elevenLabsApiKey },
        });
        const voiceData = response.data;
        if (!customName) name = voiceData.name || name;
        if (!userGender) gender = (voiceData.labels?.gender || '').toLowerCase() || null;
        if (!userAccent) accent = (voiceData.labels?.accent || '').toLowerCase() || null;
        description = voiceData.labels?.description || null;
        previewUrl = previewUrl || voiceData.preview_url || null;
        if (!userLanguages || userLanguages.length === 0) {
          const verified = voiceData.verified_languages || [];
          if (verified.length > 0) {
            languages = verified.map(vl => vl.language).filter(Boolean);
            if (languages.length === 0) languages = ['en'];
          }
        }
      } catch (err) {
        // API enrichment failed - that's OK, save with basic info
        console.log('ElevenLabs metadata fetch skipped:', err.response?.status || err.message);
      }
    }

    const saved = await req.prisma.customVoice.create({
      data: {
        voiceId: trimmedId,
        name,
        gender,
        accent,
        languages: JSON.stringify(languages),
        description,
        previewUrl,
        provider: '11labs',
      }
    });

    // Invalidate cache so listVoices picks up new custom voice
    cachedVoices = null;
    cacheTimestamp = 0;

    res.status(201).json({
      id: saved.id,
      provider: saved.provider,
      voiceId: saved.voiceId,
      name: saved.name,
      gender: saved.gender,
      accent: saved.accent,
      description: saved.description,
      languages: JSON.parse(saved.languages || '[]'),
      previewUrl: saved.previewUrl,
      isCustom: true,
      customId: saved.id,
    });
  } catch (error) {
    console.error('Error adding custom voice:', error.message);
    res.status(500).json({ error: 'Failed to add custom voice: ' + error.message });
  }
};

exports.listCustomVoices = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can manage custom voices' });
    }

    const voices = await getCustomVoicesFromDB(req.prisma);
    res.json(voices);
  } catch (error) {
    console.error('Error listing custom voices:', error);
    res.status(500).json({ error: 'Failed to list custom voices' });
  }
};

exports.refreshCustomVoice = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can manage custom voices' });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid voice ID' });
    }

    const voice = await req.prisma.customVoice.findUnique({ where: { id } });
    if (!voice) {
      return res.status(404).json({ error: 'Custom voice not found' });
    }

    let elevenLabsApiKey = '';
    try {
      const keys = await getApiKeys(req.prisma);
      elevenLabsApiKey = keys.elevenLabsApiKey || '';
    } catch (_) {}

    if (!elevenLabsApiKey) {
      return res.status(400).json({ error: 'ElevenLabs API key not configured. Add it in Settings > API Keys.' });
    }

    const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice.voiceId)}`, {
      timeout: 10000,
      headers: { 'xi-api-key': elevenLabsApiKey },
    });
    const voiceData = response.data;

    const updateData = {
      name: voiceData.name || voice.name,
      gender: (voiceData.labels?.gender || '').toLowerCase() || null,
      description: voiceData.labels?.description || voiceData.labels?.accent || null,
      previewUrl: voiceData.preview_url || null,
    };
    const verified = voiceData.verified_languages || [];
    if (verified.length > 0) {
      const langs = verified.map(vl => vl.language).filter(Boolean);
      updateData.languages = JSON.stringify(langs.length > 0 ? langs : ['en']);
    }

    const updated = await req.prisma.customVoice.update({ where: { id }, data: updateData });

    cachedVoices = null;
    cacheTimestamp = 0;

    res.json({
      id: updated.id,
      provider: updated.provider,
      voiceId: updated.voiceId,
      name: updated.name,
      gender: updated.gender,
      description: updated.description,
      languages: JSON.parse(updated.languages || '[]'),
      previewUrl: updated.previewUrl,
      isCustom: true,
      customId: updated.id,
    });
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      return res.status(422).json({ error: 'Invalid ElevenLabs API key' });
    }
    if (status === 404) {
      return res.status(404).json({ error: 'Voice ID not found on ElevenLabs' });
    }
    console.error('Error refreshing custom voice:', error.message);
    res.status(500).json({ error: 'Failed to refresh voice metadata' });
  }
};

exports.deleteCustomVoice = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can delete custom voices' });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid voice ID' });
    }

    const voice = await req.prisma.customVoice.findUnique({ where: { id } });
    if (!voice) {
      return res.status(404).json({ error: 'Custom voice not found' });
    }

    await req.prisma.customVoice.delete({ where: { id } });

    // Invalidate cache
    cachedVoices = null;
    cacheTimestamp = 0;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom voice:', error);
    res.status(500).json({ error: 'Failed to delete custom voice' });
  }
};

// Proxy audio files to bypass CORS (Google Drive, etc.)
const ALLOWED_AUDIO_DOMAINS = [
  'drive.google.com',
  'drive.usercontent.google.com',
  'docs.google.com',
  'storage.googleapis.com',
  'files.buildwithfern.com',
  'api.elevenlabs.io',
];

exports.proxyAudio = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'url parameter required' });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!ALLOWED_AUDIO_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 15000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const contentType = response.headers['content-type'] || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error('Audio proxy error:', error.message);
    res.status(500).json({ error: 'Failed to proxy audio' });
  }
};

// GET /api/voices/lookup/:voiceId - Lookup voice name from ElevenLabs by ID
exports.lookupVoice = async (req, res) => {
  try {
    const { voiceId } = req.params;
    if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });

    let elevenLabsApiKey = '';
    try {
      const keys = await getApiKeys(req.prisma);
      elevenLabsApiKey = keys.elevenLabsApiKey || '';
    } catch (_) {}

    if (!elevenLabsApiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      timeout: 10000,
      headers: { 'xi-api-key': elevenLabsApiKey },
    });

    const v = response.data;
    res.json({
      voiceId: v.voice_id,
      name: v.name || 'Unknown',
      gender: (v.labels?.gender || '').toLowerCase() || null,
      accent: (v.labels?.accent || '').toLowerCase() || null,
      description: v.labels?.description || null,
      previewUrl: v.preview_url || null,
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Voice not found' });
    }
    console.error('Voice lookup error:', err.message);
    res.status(500).json({ error: 'Failed to lookup voice' });
  }
};
