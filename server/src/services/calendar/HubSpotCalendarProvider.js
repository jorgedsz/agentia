const CalendarProvider = require('./CalendarProvider');
const { decrypt, encrypt } = require('../../utils/encryption');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

class HubSpotCalendarProvider extends CalendarProvider {
  async refreshToken() {
    if (!this.integration.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const decryptedRefresh = decrypt(this.integration.refreshToken);
    const response = await fetch(HUBSPOT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefresh
      })
    });

    if (!response.ok) {
      console.error('HubSpot token refresh failed:', await response.text());
      await this.markDisconnected();
      throw new Error('Token refresh failed - please reconnect HubSpot');
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

  async _hubspotRequest(url, token, options = {}) {
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
      throw new Error(error.message || `HubSpot API error: ${response.status}`);
    }

    return response.json();
  }

  async listCalendars() {
    const token = await this.getValidToken();

    // HubSpot meeting links endpoint
    const data = await this._hubspotRequest(
      `${HUBSPOT_API_BASE}/scheduler/v3/meetings/meeting-links`,
      token
    );

    return (data.results || []).map(link => ({
      id: link.id || link.slug,
      name: link.name || link.slug,
      description: link.type || '',
      timezone: '',
      meetingUrl: link.link
    }));
  }

  async checkAvailability(calendarId, date, timezone) {
    const token = await this.getValidToken();

    const startMs = new Date(date + 'T00:00:00').getTime();
    const endMs = new Date(date + 'T23:59:59').getTime();

    try {
      const data = await this._hubspotRequest(
        `${HUBSPOT_API_BASE}/scheduler/v3/meetings/meeting-links/${calendarId}/availability?startTime=${startMs}&endTime=${endMs}${timezone ? `&timezone=${timezone}` : ''}`,
        token
      );

      const slots = (data.availableTimes || []).map(slot => {
        if (typeof slot === 'object' && slot.startTime) {
          return new Date(slot.startTime).toISOString();
        }
        return new Date(slot).toISOString();
      });

      return {
        availableSlots: slots,
        message: slots.length > 0
          ? `Available times on ${date}: ${slots.map(s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })).join(', ')}`
          : `No available slots on ${date}`
      };
    } catch (err) {
      console.error('HubSpot availability error:', err);
      return {
        availableSlots: [],
        message: `Could not check availability: ${err.message}`
      };
    }
  }

  async bookAppointment(calendarId, params) {
    const token = await this.getValidToken();
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes } = params;

    let appointmentEndTime = endTime;
    if (!appointmentEndTime) {
      const start = new Date(startTime);
      start.setMinutes(start.getMinutes() + 30);
      appointmentEndTime = start.toISOString();
    }

    // First find or create contact
    let contactId;
    try {
      const searchData = await this._hubspotRequest(
        `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: contactEmail }]
            }]
          })
        }
      );

      if (searchData.results?.length > 0) {
        contactId = searchData.results[0].id;
      }
    } catch { /* contact search failed, proceed */ }

    if (!contactId) {
      try {
        const createData = await this._hubspotRequest(
          `${HUBSPOT_API_BASE}/crm/v3/objects/contacts`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              properties: {
                email: contactEmail,
                firstname: contactName?.split(' ')[0] || '',
                lastname: contactName?.split(' ').slice(1).join(' ') || '',
                phone: contactPhone || ''
              }
            })
          }
        );
        contactId = createData.id;
      } catch (err) {
        console.error('HubSpot create contact error:', err);
      }
    }

    // Book the meeting
    try {
      const bookingData = await this._hubspotRequest(
        `${HUBSPOT_API_BASE}/scheduler/v3/meetings/meeting-links/${calendarId}/book`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            startTime: new Date(startTime).getTime(),
            endTime: new Date(appointmentEndTime).getTime(),
            contactId,
            firstName: contactName?.split(' ')[0] || '',
            lastName: contactName?.split(' ').slice(1).join(' ') || '',
            email: contactEmail,
            notes: notes || ''
          })
        }
      );

      return {
        success: true,
        message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
        appointment: {
          id: bookingData.id,
          startTime,
          endTime: appointmentEndTime,
          contactName: contactName || contactEmail
        }
      };
    } catch (err) {
      // Fallback: return meeting link
      const calendars = await this.listCalendars();
      const meeting = calendars.find(c => c.id === calendarId);
      if (meeting?.meetingUrl) {
        return {
          success: true,
          message: `Please use this link to book: ${meeting.meetingUrl}`,
          meetingUrl: meeting.meetingUrl
        };
      }
      throw err;
    }
  }
}

module.exports = HubSpotCalendarProvider;
