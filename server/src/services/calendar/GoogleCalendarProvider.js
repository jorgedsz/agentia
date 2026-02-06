const CalendarProvider = require('./CalendarProvider');
const { decrypt, encrypt } = require('../../utils/encryption');

const GOOGLE_API_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GoogleCalendarProvider extends CalendarProvider {
  async refreshToken() {
    if (!this.integration.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const decryptedRefresh = decrypt(this.integration.refreshToken);
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefresh
      })
    });

    if (!response.ok) {
      console.error('Google token refresh failed:', await response.text());
      await this.markDisconnected();
      throw new Error('Token refresh failed - please reconnect Google Calendar');
    }

    const tokenData = await response.json();

    // Google doesn't always return a new refresh token
    await this.prisma.calendarIntegration.update({
      where: { id: this.integration.id },
      data: {
        accessToken: encrypt(tokenData.access_token),
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      }
    });

    return tokenData.access_token;
  }

  async _googleRequest(url, token, options = {}) {
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
      try { error = JSON.parse(errorText); } catch { error = { error: { message: errorText } }; }
      throw new Error(error.error?.message || `Google API error: ${response.status}`);
    }

    return response.json();
  }

  async listCalendars() {
    const token = await this.getValidToken();
    const data = await this._googleRequest(`${GOOGLE_API_BASE}/users/me/calendarList`, token);

    return (data.items || []).map(cal => ({
      id: cal.id,
      name: cal.summary || cal.id,
      description: cal.description || '',
      timezone: cal.timeZone || ''
    }));
  }

  async checkAvailability(calendarId, date, timezone) {
    const token = await this.getValidToken();
    const tz = timezone || 'America/New_York';

    const startDate = new Date(date + 'T00:00:00');
    const endDate = new Date(date + 'T23:59:59');

    // Use freeBusy API
    const freeBusyData = await this._googleRequest(`${GOOGLE_API_BASE}/freeBusy`, token, {
      method: 'POST',
      body: JSON.stringify({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        timeZone: tz,
        items: [{ id: calendarId }]
      })
    });

    const busySlots = freeBusyData.calendars?.[calendarId]?.busy || [];

    // Generate available slots: business hours 9AM-5PM, 30-min intervals, excluding busy
    const slots = [];
    const dayStart = new Date(date + 'T09:00:00');
    const dayEnd = new Date(date + 'T17:00:00');

    for (let time = new Date(dayStart); time < dayEnd; time.setMinutes(time.getMinutes() + 30)) {
      const slotStart = new Date(time);
      const slotEnd = new Date(time);
      slotEnd.setMinutes(slotEnd.getMinutes() + 30);

      const isBusy = busySlots.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        slots.push(slotStart.toISOString());
      }
    }

    return {
      availableSlots: slots,
      message: slots.length > 0
        ? `Available times on ${date}: ${slots.map(s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })).join(', ')}`
        : `No available slots on ${date}`
    };
  }

  async bookAppointment(calendarId, params) {
    const token = await this.getValidToken();
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone } = params;

    let appointmentEndTime = endTime;
    if (!appointmentEndTime) {
      const start = new Date(startTime);
      start.setMinutes(start.getMinutes() + 30);
      appointmentEndTime = start.toISOString();
    }

    const event = {
      summary: title || `Appointment with ${contactName || contactEmail}`,
      description: [
        contactName && `Contact: ${contactName}`,
        contactEmail && `Email: ${contactEmail}`,
        contactPhone && `Phone: ${contactPhone}`,
        notes && `Notes: ${notes}`
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: startTime,
        timeZone: timezone || 'America/New_York'
      },
      end: {
        dateTime: appointmentEndTime,
        timeZone: timezone || 'America/New_York'
      },
      attendees: contactEmail ? [{ email: contactEmail }] : []
    };

    const eventData = await this._googleRequest(
      `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      token,
      { method: 'POST', body: JSON.stringify(event) }
    );

    return {
      success: true,
      message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
      appointment: {
        id: eventData.id,
        startTime,
        endTime: appointmentEndTime,
        contactName: contactName || contactEmail,
        htmlLink: eventData.htmlLink
      }
    };
  }
}

module.exports = GoogleCalendarProvider;
