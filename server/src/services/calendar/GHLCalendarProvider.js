const CalendarProvider = require('./CalendarProvider');
const { decrypt, encrypt } = require('../../utils/encryption');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

class GHLCalendarProvider extends CalendarProvider {
  constructor(integration, prisma) {
    super(integration, prisma);
    this.locationId = integration.externalAccountId || this._getLocationIdFromMetadata();
  }

  _getLocationIdFromMetadata() {
    if (this.integration.metadata) {
      try {
        const meta = JSON.parse(this.integration.metadata);
        return meta.locationId || null;
      } catch { return null; }
    }
    return null;
  }

  async getValidToken() {
    if (this.integration.accessToken) {
      const decryptedAccess = decrypt(this.integration.accessToken);

      if (this.integration.tokenExpiresAt) {
        const expiresAt = new Date(this.integration.tokenExpiresAt);
        const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

        if (expiresAt <= fiveMinFromNow) {
          return await this.refreshToken();
        }
      }

      return decryptedAccess;
    }

    // Legacy: apiKey field stores the PIT
    if (this.integration.apiKey) {
      return decrypt(this.integration.apiKey);
    }

    throw new Error('No valid GHL token found');
  }

  async refreshToken() {
    if (!this.integration.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const decryptedRefresh = decrypt(this.integration.refreshToken);
    const response = await fetch(`${GHL_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefresh
      })
    });

    if (!response.ok) {
      console.error('GHL token refresh failed:', await response.text());
      await this.markDisconnected();
      throw new Error('Token refresh failed - please reconnect GoHighLevel');
    }

    const tokenData = await response.json();

    await this.prisma.calendarIntegration.update({
      where: { id: this.integration.id },
      data: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      }
    });

    return tokenData.access_token;
  }

  async _ghlRequest(endpoint, token, options = {}, apiVersion = '2021-07-28') {
    const url = `${GHL_API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Version': apiVersion,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      }
    });

    const responseText = await response.text();
    if (!response.ok) {
      let error;
      try { error = JSON.parse(responseText); } catch { error = { message: responseText || 'Unknown error' }; }
      throw new Error(error.message || error.error || `GHL API error: ${response.status}`);
    }

    try { return JSON.parse(responseText); } catch { return responseText; }
  }

  async listCalendars() {
    const token = await this.getValidToken();
    const data = await this._ghlRequest(`/calendars/?locationId=${this.locationId}`, token);

    return (data.calendars || []).map(cal => ({
      id: cal.id,
      name: cal.name,
      description: cal.description,
      timezone: cal.timezone
    }));
  }

  async checkAvailability(calendarId, date, timezone) {
    const token = await this.getValidToken();

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const slotsData = await this._ghlRequest(
      `/calendars/${calendarId}/free-slots?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}${timezone ? `&timezone=${timezone}` : ''}`,
      token
    );

    const slots = (slotsData.slots || slotsData || []).map(slot => {
      if (typeof slot === 'string') return slot;
      return slot.startTime || slot.start || slot;
    });

    return {
      availableSlots: slots,
      message: slots.length > 0
        ? `Available times on ${date}: ${slots.join(', ')}`
        : `No available slots on ${date}`
    };
  }

  async bookAppointment(calendarId, params) {
    const token = await this.getValidToken();
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone } = params;

    // Find or create contact
    let contactId;
    const searchResponse = await this._ghlRequest(
      `/contacts/search?locationId=${this.locationId}&query=${encodeURIComponent(contactEmail)}`,
      token
    );

    if (searchResponse.contacts && searchResponse.contacts.length > 0) {
      contactId = searchResponse.contacts[0].id;
    } else {
      const createContactResponse = await this._ghlRequest('/contacts', token, {
        method: 'POST',
        body: JSON.stringify({
          locationId: this.locationId,
          email: contactEmail,
          name: contactName || '',
          phone: contactPhone || ''
        })
      });
      contactId = createContactResponse.contact?.id;
    }

    if (!contactId) {
      throw new Error('Failed to find or create contact');
    }

    // Calculate end time if not provided (default 30 min)
    let appointmentEndTime = endTime;
    if (!appointmentEndTime) {
      const start = new Date(startTime);
      start.setMinutes(start.getMinutes() + 30);
      appointmentEndTime = start.toISOString();
    }

    const appointmentResponse = await this._ghlRequest('/calendars/events/appointments', token, {
      method: 'POST',
      body: JSON.stringify({
        calendarId,
        locationId: this.locationId,
        contactId,
        startTime,
        endTime: appointmentEndTime,
        title: title || 'Appointment',
        appointmentStatus: 'confirmed',
        notes: notes || ''
      })
    });

    return {
      success: true,
      message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
      appointment: {
        id: appointmentResponse.id || appointmentResponse.event?.id,
        startTime,
        endTime: appointmentEndTime,
        contactName: contactName || contactEmail
      }
    };
  }
}

module.exports = GHLCalendarProvider;
