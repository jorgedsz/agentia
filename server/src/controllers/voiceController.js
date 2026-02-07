const axios = require('axios');

// In-memory cache
let cachedVoices = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Hardcoded VAPI voices with preview URLs
const VAPI_VOICES = [
  { voiceId: 'Lily', name: 'Lily', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/lily.mp3' },
  { voiceId: 'Kylie', name: 'Kylie', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/kylie.mp3' },
  { voiceId: 'Savannah', name: 'Savannah', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/savannah.mp3' },
  { voiceId: 'Hana', name: 'Hana', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/hana.mp3' },
  { voiceId: 'Neha', name: 'Neha', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/neha.mp3' },
  { voiceId: 'Paige', name: 'Paige', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/paige.mp3' },
  { voiceId: 'Leah', name: 'Leah', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/leah.mp3' },
  { voiceId: 'Tara', name: 'Tara', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/tara.mp3' },
  { voiceId: 'Jess', name: 'Jess', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/jess.mp3' },
  { voiceId: 'Mia', name: 'Mia', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/mia.mp3' },
  { voiceId: 'Zoe', name: 'Zoe', gender: 'female', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/zoe.mp3' },
  { voiceId: 'Elliot', name: 'Elliot', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/elliot.mp3' },
  { voiceId: 'Rohan', name: 'Rohan', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/rohan.mp3' },
  { voiceId: 'Cole', name: 'Cole', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/cole.mp3' },
  { voiceId: 'Harry', name: 'Harry', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/harry.mp3' },
  { voiceId: 'Spencer', name: 'Spencer', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/spencer.mp3' },
  { voiceId: 'Leo', name: 'Leo', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/leo.mp3' },
  { voiceId: 'Dan', name: 'Dan', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/dan.mp3' },
  { voiceId: 'Zac', name: 'Zac', gender: 'male', languages: ['en'], previewUrl: 'https://files.buildwithfern.com/vapi/voices/zac.mp3' },
];

// All ElevenLabs multilingual_v2 premade voices support these languages
const ELEVENLABS_SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'nl', 'ru', 'ja',
  'zh', 'ko', 'hi', 'ar', 'cs', 'da', 'fi', 'el', 'he', 'hu',
  'id', 'ms', 'no', 'ro', 'sk', 'sv', 'tr', 'uk', 'vi'
];

async function fetchElevenLabsVoices() {
  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      timeout: 10000,
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

    const vapiNormalized = VAPI_VOICES.map(v => ({
      provider: 'vapi',
      voiceId: v.voiceId,
      name: v.name,
      gender: v.gender,
      description: null,
      languages: v.languages,
      previewUrl: v.previewUrl,
    }));

    const elevenLabsVoices = await fetchElevenLabsVoices();

    const premadeVoices = [...vapiNormalized, ...elevenLabsVoices];
    cachedVoices = premadeVoices;
    cacheTimestamp = now;

    res.json([...premadeVoices, ...customVoices]);
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

    const { voiceId } = req.body;
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

    // Fetch voice details from ElevenLabs
    let voiceData;
    try {
      const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(trimmedId)}`, {
        timeout: 10000,
      });
      voiceData = response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({ error: 'Voice ID not found on ElevenLabs' });
      }
      return res.status(502).json({ error: 'Failed to fetch voice details from ElevenLabs' });
    }

    // Extract voice info
    const name = voiceData.name || 'Unknown Voice';
    const gender = (voiceData.labels?.gender || '').toLowerCase() || null;
    const description = voiceData.labels?.description || voiceData.labels?.accent || null;
    const previewUrl = voiceData.preview_url || null;

    const languages = [];
    const verified = voiceData.verified_languages || [];
    for (const vl of verified) {
      if (vl.language && !languages.includes(vl.language)) {
        languages.push(vl.language);
      }
    }
    if (languages.length === 0) languages.push('en');

    const saved = await req.prisma.customVoice.create({
      data: {
        voiceId: trimmedId,
        name,
        gender,
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
      description: saved.description,
      languages: JSON.parse(saved.languages || '[]'),
      previewUrl: saved.previewUrl,
      isCustom: true,
      customId: saved.id,
    });
  } catch (error) {
    console.error('Error adding custom voice:', error);
    res.status(500).json({ error: 'Failed to add custom voice' });
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
