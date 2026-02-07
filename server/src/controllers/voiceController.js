const axios = require('axios');

// In-memory cache
let cachedVoices = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Hardcoded VAPI voices with preview URLs
const VAPI_VOICES = [
  { voiceId: 'Lily', name: 'Lily', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/lily.mp3' },
  { voiceId: 'Kylie', name: 'Kylie', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/kylie.mp3' },
  { voiceId: 'Savannah', name: 'Savannah', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/savannah.mp3' },
  { voiceId: 'Hana', name: 'Hana', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/hana.mp3' },
  { voiceId: 'Neha', name: 'Neha', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/neha.mp3' },
  { voiceId: 'Paige', name: 'Paige', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/paige.mp3' },
  { voiceId: 'Leah', name: 'Leah', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/leah.mp3' },
  { voiceId: 'Tara', name: 'Tara', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/tara.mp3' },
  { voiceId: 'Jess', name: 'Jess', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/jess.mp3' },
  { voiceId: 'Mia', name: 'Mia', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/mia.mp3' },
  { voiceId: 'Zoe', name: 'Zoe', gender: 'female', previewUrl: 'https://files.buildwithfern.com/vapi/voices/zoe.mp3' },
  { voiceId: 'Elliot', name: 'Elliot', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/elliot.mp3' },
  { voiceId: 'Rohan', name: 'Rohan', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/rohan.mp3' },
  { voiceId: 'Cole', name: 'Cole', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/cole.mp3' },
  { voiceId: 'Harry', name: 'Harry', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/harry.mp3' },
  { voiceId: 'Spencer', name: 'Spencer', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/spencer.mp3' },
  { voiceId: 'Leo', name: 'Leo', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/leo.mp3' },
  { voiceId: 'Dan', name: 'Dan', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/dan.mp3' },
  { voiceId: 'Zac', name: 'Zac', gender: 'male', previewUrl: 'https://files.buildwithfern.com/vapi/voices/zac.mp3' },
];

async function fetchElevenLabsVoices() {
  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      timeout: 10000,
    });
    const voices = response.data?.voices || [];
    return voices
      .filter(v => v.category === 'premade')
      .map(v => ({
        provider: '11labs',
        voiceId: v.voice_id,
        name: v.name,
        gender: (v.labels?.gender || '').toLowerCase() || null,
        description: v.labels?.description || v.labels?.accent || null,
        previewUrl: v.preview_url || null,
      }));
  } catch (err) {
    console.error('Failed to fetch ElevenLabs voices:', err.message);
    return [];
  }
}

exports.listVoices = async (req, res) => {
  try {
    const now = Date.now();
    if (cachedVoices && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json(cachedVoices);
    }

    const vapiNormalized = VAPI_VOICES.map(v => ({
      provider: 'vapi',
      voiceId: v.voiceId,
      name: v.name,
      gender: v.gender,
      description: null,
      previewUrl: v.previewUrl,
    }));

    const elevenLabsVoices = await fetchElevenLabsVoices();

    const allVoices = [...vapiNormalized, ...elevenLabsVoices];
    cachedVoices = allVoices;
    cacheTimestamp = now;

    res.json(allVoices);
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
};
