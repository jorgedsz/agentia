const CalendarProvider = require('./CalendarProvider');
const { decrypt, encrypt } = require('../../utils/encryption');

const CALENDLY_API_BASE = 'https://api.calendly.com';
const CALENDLY_TOKEN_URL = 'https://auth.calendly.com/oauth/token';

class CalendlyProvider extends CalendarProvider {
  async refreshToken() {
    if (!this.integration.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const decryptedRefresh = decrypt(this.integration.refreshToken);
    const response = await fetch(CALENDLY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CALENDLY_CLIENT_ID,
        client_secret: process.env.CALENDLY_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefresh
      })
    });

    if (!response.ok) {
      console.error('Calendly token refresh failed:', await response.text());
      await this.markDisconnected();
      throw new Error('Token refresh failed - please reconnect Calendly');
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

  async _calendlyRequest(url, token, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try { error = JSON.parse(errorText); } catch { error = { message: errorText }; }
      throw new Error(error.message || `Calendly API error: ${response.status}`);
    }

    return response.json();
  }

  _getUserUri() {
    if (this.integration.metadata) {
      try {
        const meta = JSON.parse(this.integration.metadata);
        return meta.userUri || null;
      } catch { return null; }
    }
    return null;
  }

  async listCalendars() {
    const token = await this.getValidToken();
    const userUri = this._getUserUri();

    if (!userUri) {
      // Get current user URI first
      const userData = await this._calendlyRequest(`${CALENDLY_API_BASE}/users/me`, token);
      const uri = userData.resource?.uri;
      if (uri) {
        await this.prisma.calendarIntegration.update({
          where: { id: this.integration.id },
          data: { metadata: JSON.stringify({ ...(this._parseMeta()), userUri: uri }) }
        });
      }
    }

    const actualUserUri = userUri || (await this._calendlyRequest(`${CALENDLY_API_BASE}/users/me`, token)).resource?.uri;

    const data = await this._calendlyRequest(
      `${CALENDLY_API_BASE}/event_types?user=${encodeURIComponent(actualUserUri)}&active=true`,
      token
    );

    return (data.collection || []).map(et => ({
      id: et.uri,
      name: et.name,
      description: et.description_plain || '',
      timezone: et.scheduling_url ? '' : '',
      schedulingUrl: et.scheduling_url
    }));
  }

  async checkAvailability(calendarId, date, timezone) {
    const token = await this.getValidToken();

    const startTime = `${date}T00:00:00.000000Z`;
    const endTime = `${date}T23:59:59.000000Z`;

    try {
      const data = await this._calendlyRequest(
        `${CALENDLY_API_BASE}/event_type_available_times?event_type=${encodeURIComponent(calendarId)}&start_time=${startTime}&end_time=${endTime}`,
        token
      );

      const slots = (data.collection || []).map(slot => slot.start_time);

      return {
        availableSlots: slots,
        message: slots.length > 0
          ? `Available times on ${date}: ${slots.map(s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })).join(', ')}`
          : `No available slots on ${date}`
      };
    } catch (err) {
      console.error('Calendly availability error:', err);
      return {
        availableSlots: [],
        message: `Could not check availability: ${err.message}`
      };
    }
  }

  async bookAppointment(calendarId, params) {
    const token = await this.getValidToken();
    const { startTime, contactName, contactEmail, contactPhone, notes } = params;

    // Calendly direct booking via API
    try {
      const bookingData = await this._calendlyRequest(`${CALENDLY_API_BASE}/scheduled_events`, token, {
        method: 'POST',
        body: JSON.stringify({
          event_type: calendarId,
          start_time: startTime,
          invitee: {
            name: contactName || '',
            email: contactEmail,
            questions_and_answers: contactPhone ? [
              { question: 'Phone Number', answer: contactPhone }
            ] : []
          },
          notes: notes || ''
        })
      });

      return {
        success: true,
        message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
        appointment: {
          id: bookingData.resource?.uri || bookingData.uri,
          startTime,
          contactName: contactName || contactEmail
        }
      };
    } catch (err) {
      // Fallback: return scheduling link
      const calendars = await this.listCalendars();
      const eventType = calendars.find(c => c.id === calendarId);
      if (eventType?.schedulingUrl) {
        return {
          success: true,
          message: `Please use this link to book: ${eventType.schedulingUrl}`,
          schedulingUrl: eventType.schedulingUrl
        };
      }
      throw err;
    }
  }

  _parseMeta() {
    try { return JSON.parse(this.integration.metadata || '{}'); } catch { return {}; }
  }
}

module.exports = CalendlyProvider;
