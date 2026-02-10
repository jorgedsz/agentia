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

/**
 * Get the VAPI API key for a specific user, with fallback chain:
 * 1. User.vapiApiKey (per-account, encrypted)
 * 2. PlatformSettings.vapiApiKey (global, encrypted)
 * 3. process.env.VAPI_API_KEY (env var)
 */
async function getVapiKeyForUser(prisma, userId) {
  try {
    // 1. Check per-account key
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { vapiApiKey: true }
    });

    if (user?.vapiApiKey) {
      const decrypted = decrypt(user.vapiApiKey);
      if (decrypted) return decrypted;
    }
  } catch (err) {
    // Fall through to global key
  }

  try {
    // 2. Check global PlatformSettings
    const settings = await prisma.platformSettings.findFirst();
    if (settings?.vapiApiKey) {
      const decrypted = decrypt(settings.vapiApiKey);
      if (decrypted) return decrypted;
    }
  } catch (err) {
    // Fall through to env var
  }

  // 3. Env var fallback
  return process.env.VAPI_API_KEY || '';
}

module.exports = { getApiKeys, getVapiKeyForUser };
