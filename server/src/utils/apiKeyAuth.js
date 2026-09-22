// Authenticating an outside system as one account, by that account's own
// trigger API key (generated in Account Settings).
//
// Returns { user } on success, or { status, error } to send back.

const { decrypt } = require('./encryption');

async function authenticateAccountKey(prisma, clientId, apiKey) {
  if (!clientId || !apiKey) return { status: 401, error: 'clientId and apiKey are required' };

  const user = await prisma.user.findUnique({ where: { id: parseInt(clientId) } });
  if (!user) return { status: 404, error: `Client not found (id ${clientId})` };
  if (!user.triggerApiKey) {
    return { status: 401, error: 'No API key configured for this account. Generate one in Account Settings.' };
  }

  let stored = null;
  try { stored = decrypt(user.triggerApiKey); } catch { /* unreadable key */ }
  if (apiKey !== stored) return { status: 401, error: 'Invalid API key' };

  return { user };
}

module.exports = { authenticateAccountKey };
