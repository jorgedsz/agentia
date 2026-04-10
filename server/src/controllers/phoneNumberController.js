const { decrypt } = require('../utils/encryption');
const twilioService = require('../services/twilioService');
const vonageService = require('../services/vonageService');
const telnyxService = require('../services/telnyxService');
const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

/**
 * List phone numbers imported by the authenticated user
 * GET /api/phone-numbers
 */
const listPhoneNumbers = async (req, res) => {
  try {
    const userId = req.user.id;

    const phoneNumbers = await req.prisma.phoneNumber.findMany({
      where: { telephonyCredential: { userId } },
      include: {
        agent: {
          select: { id: true, name: true, vapiId: true }
        },
        telephonyCredential: {
          select: { id: true, provider: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ phoneNumbers });
  } catch (error) {
    console.error('Error listing phone numbers:', error);
    res.status(500).json({ error: 'Failed to list phone numbers' });
  }
};

/**
 * List available phone numbers from a specific credential
 * GET /api/phone-numbers/available/:credentialId
 */
const listAvailableNumbers = async (req, res) => {
  try {
    const userId = req.user.id;
    const credentialId = parseInt(req.params.credentialId);

    const credential = await req.prisma.telephonyCredential.findUnique({
      where: { id: credentialId }
    });

    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    if (credential.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    if (!credential.isVerified) return res.status(400).json({ error: 'Please verify your credentials first.' });

    let providerNumbers = [];

    if (credential.provider === 'twilio') {
      const sid = decrypt(credential.accountSid);
      const token = decrypt(credential.authToken);
      providerNumbers = await twilioService.listPhoneNumbers({ accountSid: sid, authToken: token });
    } else if (credential.provider === 'vonage') {
      const key = decrypt(credential.apiKey);
      const secret = decrypt(credential.apiSecret);
      providerNumbers = await vonageService.listPhoneNumbers(key, secret);
    } else if (credential.provider === 'telnyx') {
      const key = decrypt(credential.telnyxApiKey);
      providerNumbers = await telnyxService.listPhoneNumbers(key);
    }

    // Get already imported numbers
    const importedNumbers = await req.prisma.phoneNumber.findMany({
      where: { telephonyCredentialId: credential.id },
      select: { providerPhoneId: true }
    });
    const importedIds = new Set(importedNumbers.map(n => n.providerPhoneId));

    const numbersWithStatus = providerNumbers.map(number => ({
      ...number,
      isImported: importedIds.has(number.sid || number.phoneNumber)
    }));

    res.json({ phoneNumbers: numbersWithStatus });
  } catch (error) {
    console.error('Error listing available numbers:', error);
    res.status(500).json({ error: error.message || 'Failed to list available numbers' });
  }
};

/**
 * Import a phone number from any provider to VAPI
 * POST /api/phone-numbers/import
 */
const importPhoneNumber = async (req, res) => {
  try {
    const { credentialId, providerPhoneId, phoneNumber, friendlyName } = req.body;
    const userId = req.user.id;

    if (!credentialId || !phoneNumber) {
      return res.status(400).json({ error: 'credentialId and phoneNumber are required' });
    }

    const credential = await req.prisma.telephonyCredential.findUnique({
      where: { id: credentialId }
    });

    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    if (credential.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    if (!credential.isVerified) return res.status(400).json({ error: 'Please verify your credentials first' });

    // Check if already imported
    if (providerPhoneId) {
      const existing = await req.prisma.phoneNumber.findUnique({
        where: {
          providerPhoneId_telephonyCredentialId: {
            providerPhoneId,
            telephonyCredentialId: credential.id
          }
        }
      });
      if (existing) {
        if (!existing.vapiPhoneNumberId) {
          return res.status(400).json({ error: 'This phone number is already imported but not connected to VAPI. Use the retry button.' });
        }
        return res.status(400).json({ error: 'This phone number is already imported' });
      }
    }

    let vapiPhoneNumberId = null;
    let status = 'pending';

    // Set per-account VAPI key
    const vapiKey = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKey) vapiService.setApiKey(vapiKey);

    if (vapiService.isConfigured()) {
      try {
        const existingVapi = await vapiService.findPhoneNumberByNumber(phoneNumber);
        if (existingVapi) {
          vapiPhoneNumberId = existingVapi.id;
          status = 'active';
        } else {
          let vapiResult;
          if (credential.provider === 'twilio') {
            const sid = decrypt(credential.accountSid);
            const token = decrypt(credential.authToken);
            vapiResult = await vapiService.importTwilioNumber({
              number: phoneNumber,
              twilioAccountSid: sid,
              twilioAuthToken: token,
              name: friendlyName
            });
          } else if (credential.provider === 'vonage') {
            vapiResult = await vapiService.importVonageNumber({
              number: phoneNumber,
              credentialId: credential.vapiCredentialId,
              name: friendlyName
            });
          } else if (credential.provider === 'telnyx') {
            vapiResult = await vapiService.importTelnyxNumber({
              number: phoneNumber,
              credentialId: credential.vapiCredentialId,
              name: friendlyName
            });
          }
          vapiPhoneNumberId = vapiResult?.id || null;
          status = vapiPhoneNumberId ? 'active' : 'error';
        }
      } catch (vapiError) {
        console.error('VAPI import failed:', vapiError.message);
        status = 'error';
      }
    }

    const newPhoneNumber = await req.prisma.phoneNumber.create({
      data: {
        phoneNumber,
        friendlyName,
        provider: credential.provider,
        providerPhoneId: providerPhoneId || null,
        vapiPhoneNumberId,
        status,
        telephonyCredentialId: credential.id
      }
    });

    res.status(201).json({
      message: vapiPhoneNumberId ? 'Phone number imported successfully' : 'Phone number stored (VAPI import pending)',
      phoneNumber: newPhoneNumber
    });
  } catch (error) {
    console.error('Error importing phone number:', error);
    res.status(500).json({ error: error.message || 'Failed to import phone number' });
  }
};

/**
 * Assign a phone number to an agent
 * PATCH /api/phone-numbers/:id/assign
 */
const assignToAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;
    const userId = req.user.id;

    const phoneNumber = await req.prisma.phoneNumber.findUnique({
      where: { id: parseInt(id) },
      include: { telephonyCredential: true }
    });

    if (!phoneNumber) return res.status(404).json({ error: 'Phone number not found' });
    if (phoneNumber.telephonyCredential.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    let agent = null;
    if (agentId) {
      agent = await req.prisma.agent.findUnique({ where: { id: agentId } });
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      if (agent.userId !== userId) return res.status(403).json({ error: 'Access denied to this agent' });
    }

    const vapiKey = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKey) vapiService.setApiKey(vapiKey);

    if (vapiService.isConfigured() && phoneNumber.vapiPhoneNumberId) {
      try {
        if (agentId && agent?.vapiId) {
          await vapiService.assignPhoneToAssistant(phoneNumber.vapiPhoneNumberId, agent.vapiId);
        } else if (!agentId) {
          await vapiService.unassignPhoneFromAssistant(phoneNumber.vapiPhoneNumberId);
        }
      } catch (vapiError) {
        console.error('VAPI assignment failed:', vapiError.message);
      }
    }

    const updated = await req.prisma.phoneNumber.update({
      where: { id: parseInt(id) },
      data: { agentId: agentId || null },
      include: {
        agent: { select: { id: true, name: true, vapiId: true } }
      }
    });

    res.json({
      message: agentId ? 'Phone number assigned to agent' : 'Phone number unassigned',
      phoneNumber: updated
    });
  } catch (error) {
    console.error('Error assigning phone number:', error);
    res.status(500).json({ error: 'Failed to assign phone number' });
  }
};

/**
 * Remove a phone number
 * DELETE /api/phone-numbers/:id
 */
const removePhoneNumber = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const phoneNumber = await req.prisma.phoneNumber.findUnique({
      where: { id: parseInt(id) },
      include: { telephonyCredential: true }
    });

    if (!phoneNumber) return res.status(404).json({ error: 'Phone number not found' });
    if (phoneNumber.telephonyCredential.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    const vapiKey = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKey) vapiService.setApiKey(vapiKey);

    if (vapiService.isConfigured() && phoneNumber.vapiPhoneNumberId) {
      try {
        await vapiService.deletePhoneNumber(phoneNumber.vapiPhoneNumberId);
      } catch (vapiError) {
        console.error('VAPI deletion failed:', vapiError.message);
      }
    }

    await req.prisma.phoneNumber.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Phone number removed successfully' });
  } catch (error) {
    console.error('Error removing phone number:', error);
    res.status(500).json({ error: 'Failed to remove phone number' });
  }
};

/**
 * Retry VAPI import for a phone number that failed previously
 * POST /api/phone-numbers/:id/retry-vapi
 */
const retryVapiImport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const phoneNumber = await req.prisma.phoneNumber.findUnique({
      where: { id: parseInt(id) },
      include: { telephonyCredential: true }
    });

    if (!phoneNumber) return res.status(404).json({ error: 'Phone number not found' });
    if (phoneNumber.telephonyCredential.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    if (phoneNumber.vapiPhoneNumberId) return res.json({ message: 'Already imported to VAPI', phoneNumber });

    const vapiKey = await getVapiKeyForUser(req.prisma, userId);
    if (!vapiKey) return res.status(400).json({ error: 'VAPI API key not configured' });
    vapiService.setApiKey(vapiKey);

    const cred = phoneNumber.telephonyCredential;
    let vapiPhoneNumberId = null;

    const existingVapi = await vapiService.findPhoneNumberByNumber(phoneNumber.phoneNumber);
    if (existingVapi) {
      vapiPhoneNumberId = existingVapi.id;
    } else {
      let vapiResult;
      if (cred.provider === 'twilio') {
        const sid = decrypt(cred.accountSid);
        const token = decrypt(cred.authToken);
        vapiResult = await vapiService.importTwilioNumber({
          number: phoneNumber.phoneNumber,
          twilioAccountSid: sid,
          twilioAuthToken: token,
          name: phoneNumber.friendlyName
        });
      } else if (cred.provider === 'vonage') {
        vapiResult = await vapiService.importVonageNumber({
          number: phoneNumber.phoneNumber,
          credentialId: cred.vapiCredentialId,
          name: phoneNumber.friendlyName
        });
      } else if (cred.provider === 'telnyx') {
        vapiResult = await vapiService.importTelnyxNumber({
          number: phoneNumber.phoneNumber,
          credentialId: cred.vapiCredentialId,
          name: phoneNumber.friendlyName
        });
      }
      vapiPhoneNumberId = vapiResult?.id || null;
    }

    const updated = await req.prisma.phoneNumber.update({
      where: { id: parseInt(id) },
      data: { vapiPhoneNumberId, status: vapiPhoneNumberId ? 'active' : 'error' }
    });

    res.json({ message: 'Phone number imported to VAPI successfully', phoneNumber: updated });
  } catch (error) {
    console.error('Retry VAPI import error:', error);
    res.status(500).json({ error: error.message || 'Failed to import to VAPI' });
  }
};

module.exports = {
  listPhoneNumbers,
  listAvailableNumbers,
  importPhoneNumber,
  assignToAgent,
  removePhoneNumber,
  retryVapiImport
};
