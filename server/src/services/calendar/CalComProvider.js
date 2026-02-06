const CalendarProvider = require('./CalendarProvider');
const { decrypt } = require('../../utils/encryption');

const CALCOM_API_BASE = 'https://api.cal.com/v1';

class CalComProvider extends CalendarProvider {
  /**
   * Cal.com uses API key auth, no OAuth refresh needed.
   */
  async getValidToken() {
    if (!this.integration.apiKey) {
      throw new Error('No Cal.com API key configured');
    }
    return decrypt(this.integration.apiKey);
  }

  async _calcomRequest(endpoint, apiKey, options = {}) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${CALCOM_API_BASE}${endpoint}${separator}apiKey=${apiKey}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try { error = JSON.parse(errorText); } catch { error = { message: errorText }; }
      throw new Error(error.message || `Cal.com API error: ${response.status}`);
    }

    return response.json();
  }

  async listCalendars() {
    const apiKey = await this.getValidToken();
    const data = await this._calcomRequest('/event-types', apiKey);

    return (data.event_types || []).map(et => ({
      id: et.id.toString(),
      name: et.title,
      description: et.description || '',
      timezone: '',
      slug: et.slug,
      length: et.length
    }));
  }

  async checkAvailability(calendarId, date, timezone) {
    const apiKey = await this.getValidToken();

    const dateFrom = `${date}T00:00:00.000Z`;
    const dateTo = `${date}T23:59:59.999Z`;

    try {
      const data = await this._calcomRequest(
        `/availability?eventTypeId=${calendarId}&dateFrom=${dateFrom}&dateTo=${dateTo}${timezone ? `&timeZone=${timezone}` : ''}`,
        apiKey
      );

      // Cal.com returns busy times; we need to invert
      const busySlots = data.busy || [];
      const slots = [];

      // Generate available slots: 9AM-5PM, 30-min intervals
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
    } catch (err) {
      console.error('Cal.com availability error:', err);
      return {
        availableSlots: [],
        message: `Could not check availability: ${err.message}`
      };
    }
  }

  async bookAppointment(calendarId, params) {
    const apiKey = await this.getValidToken();
    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone } = params;

    // Get event type details for length
    let eventLength = 30;
    try {
      const eventTypes = await this._calcomRequest(`/event-types/${calendarId}`, apiKey);
      eventLength = eventTypes.event_type?.length || 30;
    } catch { /* use default */ }

    const bookingData = await this._calcomRequest('/bookings', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        eventTypeId: parseInt(calendarId),
        start: startTime,
        end: endTime || new Date(new Date(startTime).getTime() + eventLength * 60000).toISOString(),
        responses: {
          name: contactName || '',
          email: contactEmail,
          phone: contactPhone || '',
          notes: notes || ''
        },
        timeZone: timezone || 'America/New_York',
        language: 'en',
        title: title || undefined,
        metadata: {}
      })
    });

    return {
      success: true,
      message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
      appointment: {
        id: bookingData.id || bookingData.booking?.id,
        startTime,
        contactName: contactName || contactEmail
      }
    };
  }
}

module.exports = CalComProvider;
