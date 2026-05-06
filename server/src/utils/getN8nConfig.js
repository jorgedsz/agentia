const { decrypt } = require('./encryption');

/**
 * Get n8n connection config from PlatformSettings
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{url: string, apiKey: string, pgMemoryCredentialId: string|null} | null>}
 */
async function getN8nConfig(prisma) {
  const settings = await prisma.platformSettings.findFirst();
  if (!settings?.n8nUrl || !settings?.n8nApiKey) return null;

  try {
    return {
      url: decrypt(settings.n8nUrl),
      apiKey: decrypt(settings.n8nApiKey),
      pgMemoryCredentialId: settings.n8nPostgresMemoryCredentialId || null
    };
  } catch (err) {
    console.error('Failed to decrypt n8n config:', err.message);
    return null;
  }
}

module.exports = { getN8nConfig };
