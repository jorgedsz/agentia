const { decrypt } = require('../utils/encryption');
const twilioService = require('../services/twilioService');
const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

/**
 * List phone numbers imported by the authenticated user
 * GET /api/phone-numbers
 */
const listPhoneNumbers = async (req, res) => {
  try {
    const userId = req.user.id;

    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!credentials) {
      return res.status(404).json({ error: 'No Twilio credentials found. Please set up your credentials first.' });
    }

    const phoneNumbers = await req.prisma.phoneNumber.findMany({
      where: { twilioCredentialsId: credentials.id },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            vapiId: true
          }
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
 * List available phone numbers from user's Twilio account
 * GET /api/phone-numbers/available
 */
const listAvailableNumbers = async (req, res) => {
  try {
    const userId = req.user.id;

    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!credentials) {
      return res.status(404).json({ error: 'No Twilio credentials found. Please set up your credentials first.' });
    }

    if (!credentials.isVerified) {
      return res.status(400).json({ error: 'Please verify your Twilio credentials first.' });
    }

    // Decrypt credentials
    const decryptedSid = decrypt(credentials.accountSid);
    const decryptedToken = decrypt(credentials.authToken);

    // Get phone numbers from Twilio
    const twilioNumbers = await twilioService.listPhoneNumbers({
      accountSid: decryptedSid,
      authToken: decryptedToken
    });

    // Get already imported numbers
    const importedNumbers = await req.prisma.phoneNumber.findMany({
      where: { twilioCredentialsId: credentials.id },
      select: { twilioSid: true }
    });

    const importedSids = new Set(importedNumbers.map(n => n.twilioSid));

    // Mark which numbers are already imported
    const numbersWithStatus = twilioNumbers.map(number => ({
      ...number,
      isImported: importedSids.has(number.sid)
    }));

    res.json({ phoneNumbers: numbersWithStatus });
  } catch (error) {
    console.error('Error listing available numbers:', error);
    res.status(500).json({ error: error.message || 'Failed to list available numbers' });
  }
};

/**
 * Import a phone number from Twilio to VAPI
 * POST /api/phone-numbers/import
 */
const importPhoneNumber = async (req, res) => {
  try {
    const { twilioSid, phoneNumber, friendlyName } = req.body;
    const userId = req.user.id;

    console.log('Import request:', { twilioSid, phoneNumber, friendlyName, userId });

    if (!twilioSid || !phoneNumber) {
      return res.status(400).json({ error: 'twilioSid and phoneNumber are required' });
    }

    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!credentials) {
      return res.status(404).json({ error: 'No Twilio credentials found' });
    }

    if (!credentials.isVerified) {
      return res.status(400).json({ error: 'Please verify your Twilio credentials first' });
    }

    // Check if already imported by this user
    const existing = await req.prisma.phoneNumber.findUnique({
      where: {
        twilioSid_twilioCredentialsId: {
          twilioSid,
          twilioCredentialsId: credentials.id
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'This phone number is already imported' });
    }

    // Decrypt credentials for VAPI import
    const decryptedSid = decrypt(credentials.accountSid);
    const decryptedToken = decrypt(credentials.authToken);

    let vapiPhoneNumberId = null;
    let status = 'pending';

    // Set per-account VAPI key
    const vapiKeyImport = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKeyImport) vapiService.setApiKey(vapiKeyImport);

    // Import to VAPI if configured
    if (vapiService.isConfigured()) {
      try {
        // First check if this number already exists in VAPI
        const existingVapiNumber = await vapiService.findPhoneNumberByNumber(phoneNumber);

        if (existingVapiNumber) {
          // Reuse existing VAPI phone number
          vapiPhoneNumberId = existingVapiNumber.id;
          status = 'active';
          console.log(`Reusing existing VAPI phone number: ${vapiPhoneNumberId}`);
        } else {
          // Import new number to VAPI
          const vapiResult = await vapiService.importTwilioNumber({
            number: phoneNumber,
            twilioAccountSid: decryptedSid,
            twilioAuthToken: decryptedToken,
            name: friendlyName
          });
          vapiPhoneNumberId = vapiResult.id;
          status = 'active';
        }
      } catch (vapiError) {
        console.error('VAPI import failed:', vapiError.message);
        status = 'error';
      }
    }

    // Store in database
    const newPhoneNumber = await req.prisma.phoneNumber.create({
      data: {
        phoneNumber,
        friendlyName,
        twilioSid,
        vapiPhoneNumberId,
        status,
        twilioCredentialsId: credentials.id
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
      include: {
        twilioCredentials: true
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    // Verify ownership
    if (phoneNumber.twilioCredentials.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If agentId is null, we're unassigning
    let agent = null;
    if (agentId) {
      agent = await req.prisma.agent.findUnique({
        where: { id: parseInt(agentId) }
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Verify agent ownership
      if (agent.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this agent' });
      }
    }

    // Set per-account VAPI key
    const vapiKeyAssign = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKeyAssign) vapiService.setApiKey(vapiKeyAssign);

    // Update in VAPI if we have VAPI IDs
    if (vapiService.isConfigured() && phoneNumber.vapiPhoneNumberId) {
      try {
        if (agentId && agent?.vapiId) {
          await vapiService.assignPhoneToAssistant(phoneNumber.vapiPhoneNumberId, agent.vapiId);
        } else if (!agentId) {
          await vapiService.unassignPhoneFromAssistant(phoneNumber.vapiPhoneNumberId);
        }
      } catch (vapiError) {
        console.error('VAPI assignment failed:', vapiError.message);
        // Continue with local update even if VAPI fails
      }
    }

    // Update in database
    const updated = await req.prisma.phoneNumber.update({
      where: { id: parseInt(id) },
      data: { agentId: agentId ? parseInt(agentId) : null },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            vapiId: true
          }
        }
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
      include: {
        twilioCredentials: true
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    // Verify ownership
    if (phoneNumber.twilioCredentials.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Set per-account VAPI key
    const vapiKeyRemove = await getVapiKeyForUser(req.prisma, userId);
    if (vapiKeyRemove) vapiService.setApiKey(vapiKeyRemove);

    // Delete from VAPI if imported
    if (vapiService.isConfigured() && phoneNumber.vapiPhoneNumberId) {
      try {
        await vapiService.deletePhoneNumber(phoneNumber.vapiPhoneNumberId);
      } catch (vapiError) {
        console.error('VAPI deletion failed:', vapiError.message);
        // Continue with local deletion
      }
    }

    // Delete from database
    await req.prisma.phoneNumber.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Phone number removed successfully' });
  } catch (error) {
    console.error('Error removing phone number:', error);
    res.status(500).json({ error: 'Failed to remove phone number' });
  }
};

module.exports = {
  listPhoneNumbers,
  listAvailableNumbers,
  importPhoneNumber,
  assignToAgent,
  removePhoneNumber
};
