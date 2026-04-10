const { encrypt, decrypt, mask } = require('../utils/encryption');
const twilioService = require('../services/twilioService');
const vonageService = require('../services/vonageService');
const telnyxService = require('../services/telnyxService');
const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

const VALID_PROVIDERS = ['twilio', 'vonage', 'telnyx'];

/**
 * Save telephony credentials for any provider
 * POST /api/telephony/credentials
 */
const saveCredentials = async (req, res) => {
  try {
    const { provider, accountSid, authToken, apiKey, apiSecret, telnyxApiKey } = req.body;
    const userId = req.user.id;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be twilio, vonage, or telnyx' });
    }

    // Check if user already has credentials for this provider
    const existing = await req.prisma.telephonyCredential.findUnique({
      where: { userId_provider: { userId, provider } }
    });

    if (existing) {
      return res.status(400).json({ error: `Credentials for ${provider} already exist. Use PUT to update.` });
    }

    const data = { provider, userId };

    if (provider === 'twilio') {
      if (!accountSid || !authToken) return res.status(400).json({ error: 'accountSid and authToken are required' });
      data.accountSid = encrypt(accountSid);
      data.authToken = encrypt(authToken);
    } else if (provider === 'vonage') {
      if (!apiKey || !apiSecret) return res.status(400).json({ error: 'apiKey and apiSecret are required' });
      data.apiKey = encrypt(apiKey);
      data.apiSecret = encrypt(apiSecret);
      // Register credential with VAPI
      const vapiKey = await getVapiKeyForUser(req.prisma, userId);
      if (vapiKey) vapiService.setApiKey(vapiKey);
      if (vapiService.isConfigured()) {
        try {
          const vapiCred = await vapiService.addVonageCredential(apiKey, apiSecret);
          data.vapiCredentialId = vapiCred.id;
        } catch (e) {
          console.error('[Telephony] VAPI vonage credential error:', e.message);
        }
      }
    } else if (provider === 'telnyx') {
      if (!telnyxApiKey) return res.status(400).json({ error: 'telnyxApiKey is required' });
      data.telnyxApiKey = encrypt(telnyxApiKey);
      // Register credential with VAPI
      const vapiKey = await getVapiKeyForUser(req.prisma, userId);
      if (vapiKey) vapiService.setApiKey(vapiKey);
      if (vapiService.isConfigured()) {
        try {
          const vapiCred = await vapiService.addTelnyxCredential(telnyxApiKey);
          data.vapiCredentialId = vapiCred.id;
        } catch (e) {
          console.error('[Telephony] VAPI telnyx credential error:', e.message);
        }
      }
    }

    const credential = await req.prisma.telephonyCredential.create({ data });

    res.status(201).json({
      message: 'Credentials saved successfully',
      credentials: maskCredential(credential)
    });
  } catch (error) {
    console.error('[Telephony] saveCredentials error:', error);
    res.status(500).json({ error: 'Failed to save credentials' });
  }
};

/**
 * Get all telephony credentials (masked) for the authenticated user
 * GET /api/telephony/credentials
 */
const getCredentials = async (req, res) => {
  try {
    const credentials = await req.prisma.telephonyCredential.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { phoneNumbers: true } } }
    });

    res.json({
      credentials: credentials.map(maskCredential)
    });
  } catch (error) {
    console.error('[Telephony] getCredentials error:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
};

/**
 * Update credentials for a specific provider
 * PUT /api/telephony/credentials/:id
 */
const updateCredentials = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await req.prisma.telephonyCredential.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Credential not found' });
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { accountSid, authToken, apiKey, apiSecret, telnyxApiKey } = req.body;
    const data = { isVerified: false };

    if (existing.provider === 'twilio') {
      if (accountSid) data.accountSid = encrypt(accountSid);
      if (authToken) data.authToken = encrypt(authToken);
    } else if (existing.provider === 'vonage') {
      if (apiKey) data.apiKey = encrypt(apiKey);
      if (apiSecret) data.apiSecret = encrypt(apiSecret);
      if (apiKey && apiSecret) {
        const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
        if (vapiKey) vapiService.setApiKey(vapiKey);
        if (vapiService.isConfigured()) {
          try {
            if (existing.vapiCredentialId) await vapiService.deleteVapiCredential(existing.vapiCredentialId).catch(() => {});
            const vapiCred = await vapiService.addVonageCredential(apiKey, apiSecret);
            data.vapiCredentialId = vapiCred.id;
          } catch (e) {
            console.error('[Telephony] VAPI vonage update error:', e.message);
          }
        }
      }
    } else if (existing.provider === 'telnyx') {
      if (telnyxApiKey) {
        data.telnyxApiKey = encrypt(telnyxApiKey);
        const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
        if (vapiKey) vapiService.setApiKey(vapiKey);
        if (vapiService.isConfigured()) {
          try {
            if (existing.vapiCredentialId) await vapiService.deleteVapiCredential(existing.vapiCredentialId).catch(() => {});
            const vapiCred = await vapiService.addTelnyxCredential(telnyxApiKey);
            data.vapiCredentialId = vapiCred.id;
          } catch (e) {
            console.error('[Telephony] VAPI telnyx update error:', e.message);
          }
        }
      }
    }

    const credential = await req.prisma.telephonyCredential.update({ where: { id }, data });

    res.json({
      message: 'Credentials updated successfully',
      credentials: maskCredential(credential)
    });
  } catch (error) {
    console.error('[Telephony] updateCredentials error:', error);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
};

/**
 * Delete credentials
 * DELETE /api/telephony/credentials/:id
 */
const deleteCredentials = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await req.prisma.telephonyCredential.findUnique({
      where: { id },
      include: { phoneNumbers: true }
    });
    if (!existing) return res.status(404).json({ error: 'Credential not found' });
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiKey) vapiService.setApiKey(vapiKey);

    // Clean up VAPI resources
    if (vapiService.isConfigured()) {
      for (const pn of existing.phoneNumbers) {
        if (pn.vapiPhoneNumberId) {
          await vapiService.deletePhoneNumber(pn.vapiPhoneNumberId).catch(() => {});
        }
      }
      if (existing.vapiCredentialId) {
        await vapiService.deleteVapiCredential(existing.vapiCredentialId).catch(() => {});
      }
    }

    await req.prisma.telephonyCredential.delete({ where: { id } });
    res.json({ message: 'Credentials deleted successfully' });
  } catch (error) {
    console.error('[Telephony] deleteCredentials error:', error);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
};

/**
 * Verify credentials with the provider API and auto-import phone numbers
 * POST /api/telephony/credentials/:id/verify
 */
const verifyCredentials = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const credential = await req.prisma.telephonyCredential.findUnique({ where: { id } });
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    if (credential.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    let verifyResult = {};
    let providerNumbers = [];

    if (credential.provider === 'twilio') {
      const sid = decrypt(credential.accountSid);
      const token = decrypt(credential.authToken);
      verifyResult = await twilioService.verifyCredentials(sid, token);
      providerNumbers = await twilioService.listPhoneNumbers({ accountSid: sid, authToken: token });
    } else if (credential.provider === 'vonage') {
      const key = decrypt(credential.apiKey);
      const secret = decrypt(credential.apiSecret);
      verifyResult = await vonageService.verifyCredentials(key, secret);
      providerNumbers = await vonageService.listPhoneNumbers(key, secret);
    } else if (credential.provider === 'telnyx') {
      const key = decrypt(credential.telnyxApiKey);
      verifyResult = await telnyxService.verifyCredentials(key);
      providerNumbers = await telnyxService.listPhoneNumbers(key);
    }

    // Update verification status
    await req.prisma.telephonyCredential.update({
      where: { id },
      data: { isVerified: true }
    });

    // Auto-import phone numbers
    let importedCount = 0;
    let failedCount = 0;
    const importResults = [];

    const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiKey) vapiService.setApiKey(vapiKey);

    // Get already imported numbers
    const existingNumbers = await req.prisma.phoneNumber.findMany({
      where: { telephonyCredentialId: credential.id },
      select: { providerPhoneId: true }
    });
    const existingIds = new Set(existingNumbers.map(n => n.providerPhoneId));

    for (const number of providerNumbers) {
      const providerPhoneId = number.sid || number.phoneNumber;
      if (existingIds.has(providerPhoneId)) continue;

      let vapiPhoneNumberId = null;
      let status = 'pending';

      if (vapiService.isConfigured()) {
        try {
          const existingVapi = await vapiService.findPhoneNumberByNumber(number.phoneNumber);
          if (existingVapi) {
            vapiPhoneNumberId = existingVapi.id;
            status = 'active';
            importedCount++;
          } else {
            let vapiResult;
            if (credential.provider === 'twilio') {
              const sid = decrypt(credential.accountSid);
              const token = decrypt(credential.authToken);
              vapiResult = await vapiService.importTwilioNumber({
                number: number.phoneNumber,
                twilioAccountSid: sid,
                twilioAuthToken: token,
                name: number.friendlyName
              });
            } else if (credential.provider === 'vonage') {
              vapiResult = await vapiService.importVonageNumber({
                number: number.phoneNumber,
                credentialId: credential.vapiCredentialId,
                name: number.friendlyName
              });
            } else if (credential.provider === 'telnyx') {
              vapiResult = await vapiService.importTelnyxNumber({
                number: number.phoneNumber,
                credentialId: credential.vapiCredentialId,
                name: number.friendlyName
              });
            }
            vapiPhoneNumberId = vapiResult?.id || null;
            status = vapiPhoneNumberId ? 'active' : 'error';
            if (vapiPhoneNumberId) importedCount++;
            else failedCount++;
          }
        } catch (vapiError) {
          console.error(`VAPI import failed for ${number.phoneNumber}:`, vapiError.message);
          status = 'error';
          failedCount++;
        }
      }

      await req.prisma.phoneNumber.create({
        data: {
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName,
          provider: credential.provider,
          providerPhoneId,
          vapiPhoneNumberId,
          status,
          telephonyCredentialId: credential.id
        }
      });

      importResults.push({ phoneNumber: number.phoneNumber, status, vapiConnected: !!vapiPhoneNumberId });
    }

    res.json({
      message: 'Credentials verified successfully',
      account: credential.provider === 'twilio'
        ? { name: verifyResult.accountName, status: verifyResult.status }
        : { provider: credential.provider, verified: true },
      phoneNumbers: {
        imported: importedCount,
        failed: failedCount,
        details: importResults
      }
    });
  } catch (error) {
    if (error.message?.includes('INVALID_CREDENTIALS') || error.message?.includes('Authentication failed')) {
      await req.prisma.telephonyCredential.update({
        where: { id: parseInt(req.params.id) },
        data: { isVerified: false }
      }).catch(() => {});
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    console.error('[Telephony] verifyCredentials error:', error);
    res.status(400).json({ error: error.message || 'Failed to verify credentials' });
  }
};

/**
 * Get account balances (Twilio + VAPI) - backward compat
 * GET /api/telephony/balances
 */
const getBalances = async (req, res) => {
  try {
    const userId = req.user.id;
    let twilioBalance = null;
    let vapiBalance = null;

    // Get Twilio balance if credentials exist
    const twilioCred = await req.prisma.telephonyCredential.findUnique({
      where: { userId_provider: { userId, provider: 'twilio' } }
    });

    if (twilioCred && twilioCred.isVerified) {
      try {
        const sid = decrypt(twilioCred.accountSid);
        const token = decrypt(twilioCred.authToken);
        const balance = await twilioService.getAccountBalance({ accountSid: sid, authToken: token });
        twilioBalance = parseFloat(balance);
      } catch (err) {
        console.error('Error fetching Twilio balance:', err.message);
      }
    }

    // Get VAPI balance
    const vapiKey = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKey) vapiService.setApiKey(vapiKey);
    if (vapiService.isConfigured()) {
      try {
        const vapiInfo = await vapiService.getAccountInfo();
        vapiBalance = vapiInfo?.balance ?? vapiInfo?.credits ?? null;
      } catch (err) {
        console.error('Error fetching VAPI balance:', err.message);
      }
    }

    res.json({ twilio: twilioBalance, vapi: vapiBalance });
  } catch (error) {
    console.error('Error fetching balances:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};

// ── Helpers ──────────────────────────────────────────────

function maskCredential(cred) {
  const masked = {
    id: cred.id,
    provider: cred.provider,
    isVerified: cred.isVerified,
    vapiCredentialId: cred.vapiCredentialId,
    phoneNumberCount: cred._count?.phoneNumbers ?? undefined,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };

  if (cred.provider === 'twilio' && cred.accountSid) {
    try { masked.accountSid = mask(decrypt(cred.accountSid)); } catch {}
    masked.authToken = '****';
  } else if (cred.provider === 'vonage' && cred.apiKey) {
    try { masked.apiKey = mask(decrypt(cred.apiKey)); } catch {}
    masked.apiSecret = '****';
  } else if (cred.provider === 'telnyx' && cred.telnyxApiKey) {
    try { masked.telnyxApiKey = mask(decrypt(cred.telnyxApiKey)); } catch {}
  }

  return masked;
}

module.exports = {
  saveCredentials,
  getCredentials,
  updateCredentials,
  deleteCredentials,
  verifyCredentials,
  getBalances
};
