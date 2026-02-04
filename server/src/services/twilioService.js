/**
 * Twilio Service
 *
 * This service handles integration with Twilio for phone number management.
 * Each user can have their own Twilio credentials stored (encrypted) in the database.
 */

class TwilioService {
  /**
   * Create a Twilio client instance from credentials
   * @param {Object} credentials - Decrypted credentials
   * @param {string} credentials.accountSid - Twilio Account SID
   * @param {string} credentials.authToken - Twilio Auth Token
   * @returns {Object} - Twilio client instance
   */
  createClient(credentials) {
    const twilio = require('twilio');
    return twilio(credentials.accountSid, credentials.authToken);
  }

  /**
   * Verify Twilio credentials by making a test API call
   * @param {string} accountSid - Twilio Account SID
   * @param {string} authToken - Twilio Auth Token
   * @returns {Promise<Object>} - Account info if valid
   */
  async verifyCredentials(accountSid, authToken) {
    try {
      const client = this.createClient({ accountSid, authToken });
      const account = await client.api.v2010.accounts(accountSid).fetch();
      return {
        valid: true,
        accountName: account.friendlyName,
        status: account.status
      };
    } catch (error) {
      if (error.code === 20003) {
        throw new Error('Invalid credentials: Authentication failed');
      }
      throw new Error(`Failed to verify credentials: ${error.message}`);
    }
  }

  /**
   * List all phone numbers from a Twilio account
   * @param {Object} credentials - Decrypted credentials
   * @returns {Promise<Array>} - Array of phone number objects
   */
  async listPhoneNumbers(credentials) {
    const client = this.createClient(credentials);
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list();

    return incomingPhoneNumbers.map(number => ({
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: {
        voice: number.capabilities.voice,
        sms: number.capabilities.sms,
        mms: number.capabilities.mms
      },
      status: number.status,
      dateCreated: number.dateCreated
    }));
  }

  /**
   * Get a specific phone number from Twilio
   * @param {Object} credentials - Decrypted credentials
   * @param {string} phoneNumberSid - The SID of the phone number
   * @returns {Promise<Object>} - Phone number object
   */
  async getPhoneNumber(credentials, phoneNumberSid) {
    const client = this.createClient(credentials);
    const number = await client.incomingPhoneNumbers(phoneNumberSid).fetch();

    return {
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: {
        voice: number.capabilities.voice,
        sms: number.capabilities.sms,
        mms: number.capabilities.mms
      },
      status: number.status
    };
  }

  /**
   * Update phone number webhook URLs for VAPI integration
   * @param {Object} credentials - Decrypted credentials
   * @param {string} phoneNumberSid - The SID of the phone number
   * @param {Object} webhooks - Webhook URLs to set
   * @returns {Promise<Object>} - Updated phone number object
   */
  async updatePhoneNumberWebhooks(credentials, phoneNumberSid, webhooks) {
    const client = this.createClient(credentials);
    const number = await client.incomingPhoneNumbers(phoneNumberSid).update(webhooks);

    return {
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      voiceUrl: number.voiceUrl,
      statusCallback: number.statusCallback
    };
  }

  /**
   * Get account balance from Twilio
   * @param {Object} credentials - Decrypted credentials
   * @returns {Promise<string>} - Account balance
   */
  async getAccountBalance(credentials) {
    const client = this.createClient(credentials);
    const balance = await client.balance.fetch();
    return balance.balance;
  }
}

module.exports = new TwilioService();
