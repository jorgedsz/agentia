const { encrypt, decrypt, mask } = require('../utils/encryption');
const twilioService = require('../services/twilioService');
const vapiService = require('../services/vapiService');

/**
 * Save Twilio credentials for the authenticated user
 * POST /api/twilio/credentials
 */
const saveCredentials = async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    const userId = req.user.id;

    if (!accountSid || !authToken) {
      return res.status(400).json({ error: 'Account SID and Auth Token are required' });
    }

    // Check if user already has credentials
    const existing = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (existing) {
      return res.status(400).json({ error: 'Credentials already exist. Use PUT to update.' });
    }

    // Encrypt credentials before storing
    const encryptedSid = encrypt(accountSid);
    const encryptedToken = encrypt(authToken);

    const credentials = await req.prisma.twilioCredentials.create({
      data: {
        accountSid: encryptedSid,
        authToken: encryptedToken,
        userId,
        isVerified: false
      }
    });

    res.status(201).json({
      message: 'Credentials saved successfully',
      credentials: {
        id: credentials.id,
        accountSid: mask(accountSid),
        isVerified: credentials.isVerified,
        createdAt: credentials.createdAt
      }
    });
  } catch (error) {
    console.error('Error saving Twilio credentials:', error);
    res.status(500).json({ error: 'Failed to save credentials' });
  }
};

/**
 * Get Twilio credentials (masked) for the authenticated user
 * GET /api/twilio/credentials
 */
const getCredentials = async (req, res) => {
  try {
    const userId = req.user.id;

    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId },
      include: {
        _count: {
          select: { phoneNumbers: true }
        }
      }
    });

    if (!credentials) {
      return res.status(404).json({ error: 'No credentials found' });
    }

    // Decrypt to mask properly (show last 4 chars of actual value)
    const decryptedSid = decrypt(credentials.accountSid);

    res.json({
      credentials: {
        id: credentials.id,
        accountSid: mask(decryptedSid),
        authToken: '****',
        isVerified: credentials.isVerified,
        phoneNumberCount: credentials._count.phoneNumbers,
        createdAt: credentials.createdAt,
        updatedAt: credentials.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching Twilio credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
};

/**
 * Update Twilio credentials for the authenticated user
 * PUT /api/twilio/credentials
 */
const updateCredentials = async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    const userId = req.user.id;

    if (!accountSid && !authToken) {
      return res.status(400).json({ error: 'At least one field (accountSid or authToken) is required' });
    }

    const existing = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'No credentials found. Use POST to create.' });
    }

    const updateData = {
      isVerified: false // Reset verification when credentials change
    };

    if (accountSid) {
      updateData.accountSid = encrypt(accountSid);
    }
    if (authToken) {
      updateData.authToken = encrypt(authToken);
    }

    const credentials = await req.prisma.twilioCredentials.update({
      where: { userId },
      data: updateData
    });

    // Get the actual SID for masking
    const decryptedSid = decrypt(credentials.accountSid);

    res.json({
      message: 'Credentials updated successfully',
      credentials: {
        id: credentials.id,
        accountSid: mask(decryptedSid),
        isVerified: credentials.isVerified,
        updatedAt: credentials.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating Twilio credentials:', error);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
};

/**
 * Delete Twilio credentials for the authenticated user
 * DELETE /api/twilio/credentials
 */
const deleteCredentials = async (req, res) => {
  try {
    const userId = req.user.id;

    const existing = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'No credentials found' });
    }

    await req.prisma.twilioCredentials.delete({
      where: { userId }
    });

    res.json({ message: 'Credentials deleted successfully' });
  } catch (error) {
    console.error('Error deleting Twilio credentials:', error);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
};

/**
 * Verify Twilio credentials by making a test API call
 * Also automatically imports all phone numbers to VAPI
 * POST /api/twilio/credentials/verify
 */
const verifyCredentials = async (req, res) => {
  try {
    const userId = req.user.id;

    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (!credentials) {
      return res.status(404).json({ error: 'No credentials found' });
    }

    // Decrypt credentials
    const decryptedSid = decrypt(credentials.accountSid);
    const decryptedToken = decrypt(credentials.authToken);

    // Verify with Twilio API
    const result = await twilioService.verifyCredentials(decryptedSid, decryptedToken);

    // Update verification status
    await req.prisma.twilioCredentials.update({
      where: { userId },
      data: { isVerified: true }
    });

    // Auto-import phone numbers from Twilio to VAPI
    let importedCount = 0;
    let failedCount = 0;
    const importResults = [];

    try {
      // Get phone numbers from Twilio
      const twilioNumbers = await twilioService.listPhoneNumbers({
        accountSid: decryptedSid,
        authToken: decryptedToken
      });

      // Get already imported numbers
      const existingNumbers = await req.prisma.phoneNumber.findMany({
        where: { twilioCredentialsId: credentials.id },
        select: { twilioSid: true }
      });
      const existingSids = new Set(existingNumbers.map(n => n.twilioSid));

      // Import each new number
      for (const number of twilioNumbers) {
        if (existingSids.has(number.sid)) {
          continue; // Skip already imported numbers
        }

        let vapiPhoneNumberId = null;
        let status = 'pending';

        // Import to VAPI if configured
        if (vapiService.isConfigured()) {
          try {
            // First check if this number already exists in VAPI
            const existingVapiNumber = await vapiService.findPhoneNumberByNumber(number.phoneNumber);

            if (existingVapiNumber) {
              // Reuse existing VAPI phone number
              vapiPhoneNumberId = existingVapiNumber.id;
              status = 'active';
              importedCount++;
              console.log(`Reusing existing VAPI phone number for ${number.phoneNumber}: ${vapiPhoneNumberId}`);
            } else {
              // Import new number to VAPI
              const vapiResult = await vapiService.importTwilioNumber({
                number: number.phoneNumber,
                twilioAccountSid: decryptedSid,
                twilioAuthToken: decryptedToken,
                name: number.friendlyName
              });
              vapiPhoneNumberId = vapiResult.id;
              status = 'active';
              importedCount++;
            }
          } catch (vapiError) {
            console.error(`VAPI import failed for ${number.phoneNumber}:`, vapiError.message);
            status = 'error';
            failedCount++;
          }
        }

        // Store in database
        await req.prisma.phoneNumber.create({
          data: {
            phoneNumber: number.phoneNumber,
            friendlyName: number.friendlyName,
            twilioSid: number.sid,
            vapiPhoneNumberId,
            status,
            twilioCredentialsId: credentials.id
          }
        });

        importResults.push({
          phoneNumber: number.phoneNumber,
          status,
          vapiConnected: !!vapiPhoneNumberId
        });
      }
    } catch (importError) {
      console.error('Error auto-importing phone numbers:', importError);
      // Don't fail the verification if phone import fails
    }

    res.json({
      message: 'Credentials verified successfully',
      account: {
        name: result.accountName,
        status: result.status
      },
      phoneNumbers: {
        imported: importedCount,
        failed: failedCount,
        details: importResults
      }
    });
  } catch (error) {
    console.error('Error verifying Twilio credentials:', error);
    res.status(400).json({ error: error.message || 'Failed to verify credentials' });
  }
};

/**
 * Get account balances for Twilio and VAPI
 * GET /api/twilio/balances
 */
const getBalances = async (req, res) => {
  try {
    const userId = req.user.id;
    let twilioBalance = null;
    let vapiBalance = null;

    // Get Twilio balance
    const credentials = await req.prisma.twilioCredentials.findUnique({
      where: { userId }
    });

    if (credentials && credentials.isVerified) {
      try {
        const decryptedSid = decrypt(credentials.accountSid);
        const decryptedToken = decrypt(credentials.authToken);
        const balance = await twilioService.getAccountBalance({
          accountSid: decryptedSid,
          authToken: decryptedToken
        });
        twilioBalance = parseFloat(balance);
      } catch (err) {
        console.error('Error fetching Twilio balance:', err.message);
      }
    }

    // Get VAPI balance
    if (vapiService.isConfigured()) {
      try {
        const vapiInfo = await vapiService.getAccountInfo();
        vapiBalance = vapiInfo?.balance ?? vapiInfo?.credits ?? null;
      } catch (err) {
        console.error('Error fetching VAPI balance:', err.message);
      }
    }

    res.json({
      twilio: twilioBalance,
      vapi: vapiBalance
    });
  } catch (error) {
    console.error('Error fetching balances:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};

module.exports = {
  saveCredentials,
  getCredentials,
  updateCredentials,
  deleteCredentials,
  verifyCredentials,
  getBalances
};
