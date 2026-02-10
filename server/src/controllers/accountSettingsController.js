const { encrypt, decrypt, mask } = require('../utils/encryption');

/**
 * Check if the current request has admin-level access to the account.
 * Allowed: account owner (direct login), admin team member, or impersonating OWNER.
 */
function hasAccountAdminAccess(req) {
  // Direct user login (not team member) — always has access to own account
  if (!req.isTeamMember) return true;
  // Team member with admin role
  if (req.teamMember?.teamRole === 'admin') return true;
  return false;
}

/**
 * GET /api/account-settings/vapi-keys
 * Returns masked VAPI keys for the current account.
 */
const getVapiKeys = async (req, res) => {
  try {
    if (!hasAccountAdminAccess(req)) {
      return res.status(403).json({ error: 'Only account owners and admin team members can access VAPI keys' });
    }

    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { vapiApiKey: true, vapiPublicKey: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const decryptedVapi = user.vapiApiKey ? decrypt(user.vapiApiKey) : '';
    const decryptedVapiPublic = user.vapiPublicKey ? decrypt(user.vapiPublicKey) : '';

    res.json({
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      hasVapi: !!decryptedVapi,
      hasVapiPublicKey: !!decryptedVapiPublic
    });
  } catch (error) {
    console.error('Get account VAPI keys error:', error);
    res.status(500).json({ error: 'Failed to fetch VAPI keys' });
  }
};

/**
 * PUT /api/account-settings/vapi-keys
 * Saves encrypted VAPI keys on the User record.
 */
const updateVapiKeys = async (req, res) => {
  try {
    if (!hasAccountAdminAccess(req)) {
      return res.status(403).json({ error: 'Only account owners and admin team members can update VAPI keys' });
    }

    const { vapiApiKey, vapiPublicKey } = req.body;

    const data = {};
    if (vapiApiKey !== undefined) {
      data.vapiApiKey = vapiApiKey ? encrypt(vapiApiKey) : null;
    }
    if (vapiPublicKey !== undefined) {
      data.vapiPublicKey = vapiPublicKey ? encrypt(vapiPublicKey) : null;
    }

    const user = await req.prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { vapiApiKey: true, vapiPublicKey: true }
    });

    const decryptedVapi = user.vapiApiKey ? decrypt(user.vapiApiKey) : '';
    const decryptedVapiPublic = user.vapiPublicKey ? decrypt(user.vapiPublicKey) : '';

    res.json({
      message: 'VAPI keys updated',
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      hasVapi: !!decryptedVapi,
      hasVapiPublicKey: !!decryptedVapiPublic
    });
  } catch (error) {
    console.error('Update account VAPI keys error:', error);
    res.status(500).json({ error: 'Failed to update VAPI keys' });
  }
};

/**
 * GET /api/account-settings/vapi-public-key
 * Returns decrypted public key for the current account (for test calls).
 * Falls back to global PlatformSettings.
 */
const getAccountVapiPublicKey = async (req, res) => {
  try {
    // First check per-account key
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { vapiPublicKey: true }
    });

    if (user?.vapiPublicKey) {
      const decrypted = decrypt(user.vapiPublicKey);
      if (decrypted) {
        return res.json({ vapiPublicKey: decrypted });
      }
    }

    // Fall back to global PlatformSettings
    const settings = await req.prisma.platformSettings.findFirst();
    if (settings?.vapiPublicKey) {
      const decrypted = decrypt(settings.vapiPublicKey);
      if (decrypted) {
        return res.json({ vapiPublicKey: decrypted });
      }
    }

    return res.status(404).json({ error: 'VAPI Public Key not configured' });
  } catch (error) {
    console.error('Get account VAPI public key error:', error);
    res.status(500).json({ error: 'Failed to fetch VAPI public key' });
  }
};

module.exports = { getVapiKeys, updateVapiKeys, getAccountVapiPublicKey };
