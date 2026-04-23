const CalendarProvider = require('./CalendarProvider');
const { decrypt, encrypt } = require('../../utils/encryption');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

// Format a UTC Date as a wall-time ISO string with the offset of the given IANA
// timezone — e.g. "2026-04-24T09:00:00-04:00". GHL's /calendars/events/appointments
// rejects UTC-with-Z ("slot no longer available") even when the instant is correct;
// it wants the startTime rendered in the calendar's local timezone with offset.
const formatInTimezone = (date, timezone) => {
  if (!timezone) return date.toISOString();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  const hh = parts.hour === '24' ? '00' : parts.hour;
  const wallMs = Date.UTC(
    parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day),
    parseInt(hh), parseInt(parts.minute), parseInt(parts.second)
  );
  const offsetMinutes = Math.round((wallMs - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const oh = Math.floor(abs / 60).toString().padStart(2, '0');
  const om = (abs % 60).toString().padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
};

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

  async checkAvailability(calendarId, date, timezone, duration) {
    const token = await this.getValidToken();

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const slotsData = await this._ghlRequest(
      `/calendars/${calendarId}/free-slots?startDate=${startDate.getTime()}&endDate=${endDate.getTime()}${timezone ? `&timezone=${timezone}` : ''}`,
      token
    );

    console.log('GHL free-slots response:', JSON.stringify(slotsData).substring(0, 500));

    // GHL returns slots in various formats:
    // - { "YYYY-MM-DD": { "slots": [ { "startTime": "...", "endTime": "..." } ] } }
    // - { "slots": [ ... ] }
    // - or directly an array
    let rawSlots = [];
    if (Array.isArray(slotsData)) {
      rawSlots = slotsData;
    } else if (slotsData.slots && Array.isArray(slotsData.slots)) {
      rawSlots = slotsData.slots;
    } else if (typeof slotsData === 'object') {
      // Keyed by date: { "2026-03-08": { "slots": [...] } } or { "2026-03-08": [...] }
      for (const key of Object.keys(slotsData)) {
        const dayData = slotsData[key];
        if (Array.isArray(dayData)) {
          rawSlots.push(...dayData);
        } else if (dayData && Array.isArray(dayData.slots)) {
          rawSlots.push(...dayData.slots);
        }
      }
    }

    const slots = rawSlots.map(slot => {
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
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone, duration, contactId: providedContactId, callerPhone } = params;
    const appointmentDuration = duration || 30;

    // Use provided contactId (from sessionId in production, or test config) or find/create by email/phone
    let contactId = providedContactId || null;

    // Phone to use for lookup/create: explicit contactPhone arg wins, else the caller's number
    const phoneForLookup = contactPhone || callerPhone || null;

    if (!contactId) {
      const searchQuery = contactEmail || phoneForLookup;
      if (!searchQuery) {
        throw new Error('Failed to find or create contact: need email, phone, or contactId');
      }

      const searchResponse = await this._ghlRequest(
        `/contacts/search?locationId=${this.locationId}&query=${encodeURIComponent(searchQuery)}`,
        token
      );

      if (searchResponse.contacts && searchResponse.contacts.length > 0) {
        contactId = searchResponse.contacts[0].id;
      } else {
        const body = { locationId: this.locationId };
        if (contactEmail) body.email = contactEmail;
        if (contactName) body.name = contactName;
        if (phoneForLookup) body.phone = phoneForLookup;
        const createContactResponse = await this._ghlRequest('/contacts', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        contactId = createContactResponse.contact?.id;
      }
    }

    if (!contactId) {
      throw new Error('Failed to find or create contact');
    }

    // Calculate end time if not provided (use configured duration)
    let appointmentEndTime = endTime;
    if (!appointmentEndTime) {
      const start = new Date(startTime);
      start.setMinutes(start.getMinutes() + appointmentDuration);
      appointmentEndTime = start.toISOString();
    }

    // GHL's appointment endpoint wants startTime/endTime rendered in the calendar's
    // timezone with offset (e.g. "2026-04-24T09:00:00-04:00"), not UTC with Z —
    // otherwise it replies "slot no longer available" even when the slot is free.
    const startForGhl = timezone ? formatInTimezone(new Date(startTime), timezone) : startTime;
    const endForGhl = timezone ? formatInTimezone(new Date(appointmentEndTime), timezone) : appointmentEndTime;

    const appointmentBody = {
      calendarId,
      locationId: this.locationId,
      contactId,
      startTime: startForGhl,
      endTime: endForGhl,
      title: title || 'Appointment',
      appointmentStatus: 'confirmed',
      notes: notes || ''
    };
    if (timezone) appointmentBody.timezone = timezone;

    const appointmentResponse = await this._ghlRequest('/calendars/events/appointments', token, {
      method: 'POST',
      body: JSON.stringify(appointmentBody)
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
