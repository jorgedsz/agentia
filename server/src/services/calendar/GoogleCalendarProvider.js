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

  async checkAvailability(calendarId, date, timezone, duration) {
    const token = await this.getValidToken();
    const tz = timezone || 'America/New_York';
    const slotDuration = duration || 30;

    // Send freeBusy request using naive datetimes + timeZone so Google interprets in user's timezone
    const freeBusyData = await this._googleRequest(`${GOOGLE_API_BASE}/freeBusy`, token, {
      method: 'POST',
      body: JSON.stringify({
        timeMin: `${date}T00:00:00`,
        timeMax: `${date}T23:59:59`,
        timeZone: tz,
        items: [{ id: calendarId }]
      })
    });

    const busySlots = freeBusyData.calendars?.[calendarId]?.busy || [];

    // Generate available slots using naive time strings (no Date objects that convert to UTC)
    // Business hours: 9AM-5PM in the user's timezone, using configured duration intervals
    const slots = [];
    const startHour = 9;
    const endHour = 17;

    // Get current time in user's timezone to filter past slots for "today"
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const todayInTz = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
    const isToday = date === todayInTz;

    for (let totalMinutes = startHour * 60; totalMinutes + slotDuration <= endHour * 60; totalMinutes += slotDuration) {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      const slotStartStr = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

      const endTotalMin = totalMinutes + slotDuration;
      const endH = Math.floor(endTotalMin / 60);
      const endM = endTotalMin % 60;
      const slotEndStr = `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

      // Skip past slots if checking today
      if (isToday) {
        const slotHour = h;
        const slotMin = m;
        const nowHour = nowInTz.getHours();
        const nowMin = nowInTz.getMinutes();
        if (slotHour < nowHour || (slotHour === nowHour && slotMin <= nowMin)) {
          continue;
        }
      }

      // Check against busy slots (busy times from Google are in ISO/UTC format)
      const isBusy = busySlots.some(busy => {
        // Convert busy times to the naive format in user timezone for comparison
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        const bsInTz = new Date(busyStart.toLocaleString('en-US', { timeZone: tz }));
        const beInTz = new Date(busyEnd.toLocaleString('en-US', { timeZone: tz }));

        // Compare as minutes-of-day
        const busyStartMin = bsInTz.getHours() * 60 + bsInTz.getMinutes();
        const busyEndMin = beInTz.getHours() * 60 + beInTz.getMinutes();
        const slotStartMin = totalMinutes;
        const slotEndMin = endTotalMin;

        return slotStartMin < busyEndMin && slotEndMin > busyStartMin;
      });

      if (!isBusy) {
        // Return naive datetime string so VAPI/AI can use it directly for booking
        slots.push(slotStartStr);
      }
    }

    // Format times for human-readable message
    const formatTime = (naiveStr) => {
      const [, timePart] = naiveStr.split('T');
      const [hh, mm] = timePart.split(':').map(Number);
      const period = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 || 12;
      return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
    };

    return {
      availableSlots: slots,
      message: slots.length > 0
        ? `Available times on ${date}: ${slots.map(formatTime).join(', ')}`
        : `No available slots on ${date}`
    };
  }

  async bookAppointment(calendarId, params) {
    const token = await this.getValidToken();
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone, duration } = params;
    const tz = timezone || 'America/New_York';
    const appointmentDuration = duration || 30;

    // Normalize startTime: strip trailing Z/offset so Google uses the timeZone field
    let normalizedStart = startTime.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    // Ensure it has seconds
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizedStart)) {
      normalizedStart += ':00';
    }

    let normalizedEnd = endTime;
    if (!normalizedEnd) {
      // Parse the naive datetime and add configured duration
      const [datePart, timePart] = normalizedStart.split('T');
      const [h, m, s] = timePart.split(':').map(Number);
      const totalMin = h * 60 + m + appointmentDuration;
      const endH = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const endM = String(totalMin % 60).padStart(2, '0');
      normalizedEnd = `${datePart}T${endH}:${endM}:${s || '00'}`;
    } else {
      normalizedEnd = normalizedEnd.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
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
        dateTime: normalizedStart,
        timeZone: tz
      },
      end: {
        dateTime: normalizedEnd,
        timeZone: tz
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
        endTime: normalizedEnd,
        contactName: contactName || contactEmail,
        htmlLink: eventData.htmlLink
      }
    };
  }
}

module.exports = GoogleCalendarProvider;
