const { decrypt } = require('./encryption');

/**
 * Fetch platform API keys from DB, falling back to env vars.
 * Returns { vapiApiKey, openaiApiKey, elevenLabsApiKey }
 */
async function getApiKeys(prisma) {
  let vapiApiKey = process.env.VAPI_API_KEY || '';
  let openaiApiKey = process.env.OPENAI_API_KEY || '';
  let elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';

  try {
    const settings = await prisma.platformSettings.findFirst();
    if (settings) {
      if (settings.vapiApiKey) {
        vapiApiKey = decrypt(settings.vapiApiKey);
      }
      if (settings.openaiApiKey) {
        openaiApiKey = decrypt(settings.openaiApiKey);
      }
      if (settings.elevenLabsApiKey) {
        elevenLabsApiKey = decrypt(settings.elevenLabsApiKey);
      }
    }
  } catch (err) {
    // DB table may not exist yet — fall back to env vars silently
  }

  return { vapiApiKey, openaiApiKey, elevenLabsApiKey };
}

module.exports = { getApiKeys };
