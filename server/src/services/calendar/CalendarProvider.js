const { decrypt, encrypt } = require('../../utils/encryption');

/**
 * Base class for all calendar providers.
 * Each provider must implement: listCalendars(), checkAvailability(), bookAppointment()
 */
class CalendarProvider {
  constructor(integration, prisma) {
    this.integration = integration;
    this.prisma = prisma;
  }

  /**
   * Get a valid access token, refreshing if needed.
   * Override in subclasses that need custom refresh logic.
   */
  async getValidToken() {
    if (!this.integration.accessToken) {
      throw new Error('No access token available');
    }

    const decryptedAccess = decrypt(this.integration.accessToken);

    // Check if token expires within 5 minutes
    if (this.integration.tokenExpiresAt) {
      const expiresAt = new Date(this.integration.tokenExpiresAt);
      const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinFromNow) {
        return await this.refreshToken();
      }
    }

    return decryptedAccess;
  }

  /**
   * Refresh the OAuth token. Override in subclasses.
   */
  async refreshToken() {
    throw new Error('refreshToken() not implemented');
  }

  /**
   * Update the stored tokens in the database.
   */
  async updateTokens(accessToken, refreshToken, expiresIn) {
    await this.prisma.calendarIntegration.update({
      where: { id: this.integration.id },
      data: {
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : this.integration.refreshToken,
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : this.integration.tokenExpiresAt
      }
    });
  }

  /**
   * Mark this integration as disconnected.
   */
  async markDisconnected() {
    await this.prisma.calendarIntegration.update({
      where: { id: this.integration.id },
      data: { isConnected: false }
    });
  }

  /**
   * List available calendars/event types for this integration.
   * @returns {Array<{id: string, name: string, description?: string, timezone?: string}>}
   */
  async listCalendars() {
    throw new Error('listCalendars() not implemented');
  }

  /**
   * Check availability for a given calendar and date.
   * @param {string} calendarId
   * @param {string} date - YYYY-MM-DD
   * @param {string} timezone
   * @param {number} duration - appointment duration in minutes (default 30)
   * @returns {Object} - { availableSlots: string[], message: string }
   */
  async checkAvailability(calendarId, date, timezone, duration) {
    throw new Error('checkAvailability() not implemented');
  }

  /**
   * Book an appointment on a calendar.
   * @param {string} calendarId
   * @param {Object} params - { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone, duration }
   * @returns {Object} - { success: boolean, message: string, appointment?: Object }
   */
  async bookAppointment(calendarId, params) {
    throw new Error('bookAppointment() not implemented');
  }
}

module.exports = CalendarProvider;
