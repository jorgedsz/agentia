const { encrypt, decrypt, mask } = require('../utils/encryption');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

/**
 * Helper function to make GHL API requests
 * GHL Private Integration tokens require specific headers
 */
const ghlRequest = async (endpoint, token, options = {}, apiVersion = '2021-07-28') => {
  const url = `${GHL_API_BASE}${endpoint}`;
  console.log('GHL API Request:', url, 'Version:', apiVersion);

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
  console.log('GHL API Response status:', response.status);

  if (!response.ok) {
    let error;
    try {
      error = JSON.parse(responseText);
    } catch {
      error = { message: responseText || 'Unknown error' };
    }
    console.error('GHL API Error:', error);
    throw new Error(error.message || error.error || `GHL API error: ${response.status}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
};

/**
 * Try different API versions to find one that works
 */
const tryGhlRequest = async (endpoint, token, options = {}) => {
  const versions = ['2021-07-28', '2021-04-15'];

  for (const version of versions) {
    try {
      return await ghlRequest(endpoint, token, options, version);
    } catch (error) {
      console.log(`Version ${version} failed:`, error.message);
      if (version === versions[versions.length - 1]) {
        throw error;
      }
    }
  }
};

/**
 * Save GHL integration token for the authenticated user
 * POST /api/ghl/connect
 */
const connect = async (req, res) => {
  try {
    const { privateToken, locationId: providedLocationId } = req.body;
    const userId = req.user.id;

    if (!privateToken) {
      return res.status(400).json({ error: 'Private Integration Token is required' });
    }

    // Clean the token (remove any whitespace)
    const cleanToken = privateToken.trim();

    // Debug: Log token info (not the actual token for security)
    console.log('Token length:', cleanToken.length);
    console.log('Token starts with:', cleanToken.substring(0, 4));
    console.log('Location ID provided:', providedLocationId);

    // Validate token format - Private Integration tokens start with "pit-" or "pit_"
    if (!cleanToken.startsWith('pit-') && !cleanToken.startsWith('pit_')) {
      return res.status(400).json({
        error: 'Invalid token format. Private Integration Token should start with "pit-". Please copy the correct token from GHL Settings > Integrations > Private Integrations.'
      });
    }

    let locationId = providedLocationId?.trim() || null;
    let locationName = null;

    // If locationId was provided, validate token by fetching calendars
    if (locationId) {
      try {
        // Try to fetch calendars to validate the token
        const calendarsData = await tryGhlRequest(`/calendars/?locationId=${locationId}`, cleanToken);
        locationName = 'GoHighLevel Location';
        console.log('Token validated with provided locationId:', locationId);
        console.log('Calendars found:', calendarsData);
      } catch (validationError) {
        console.error('Token validation failed:', validationError);

        // Provide more helpful error message
        const errorMsg = validationError.message || '';
        if (errorMsg.includes('Invalid JWT') || errorMsg.includes('401')) {
          return res.status(400).json({
            error: 'Invalid token. Please make sure you are using the correct Private Integration Token and it has the required scopes (calendars.readonly, calendars.write).'
          });
        }
        return res.status(400).json({
          error: `Unable to validate token: ${errorMsg}. Please check your token and location ID.`
        });
      }
    } else {
      // Try to auto-detect location
      try {
        // Method 1: Try locations endpoint
        let locationsData;
        try {
          locationsData = await tryGhlRequest('/locations/', cleanToken);
        } catch (e) {
          // Method 2: Try search endpoint
          try {
            locationsData = await tryGhlRequest('/locations/search', cleanToken);
          } catch (e2) {
            console.log('Could not auto-detect location, will ask user to provide it');
            return res.status(400).json({
              error: 'Could not auto-detect your location. Please check the checkbox below and provide your Location ID manually.',
              needsLocationId: true
            });
          }
        }

        // Handle different response formats
        const locations = locationsData.locations || locationsData.location || (Array.isArray(locationsData) ? locationsData : [locationsData]);

        if (locations && locations.length > 0) {
          const loc = locations[0];
          locationId = loc.id || loc._id || loc.locationId;
          locationName = loc.name || loc.businessName || 'GoHighLevel Location';
        } else if (locationsData.id) {
          locationId = locationsData.id;
          locationName = locationsData.name || locationsData.businessName || 'GoHighLevel Location';
        } else {
          return res.status(400).json({
            error: 'Could not find location. Please provide your Location ID manually.',
            needsLocationId: true
          });
        }
      } catch (ghlError) {
        console.error('GHL API error:', ghlError);
        return res.status(400).json({
          error: 'Could not auto-detect your location. Please provide your Location ID manually.',
          needsLocationId: true
        });
      }
    }

    // Check if user already has an integration
    const existing = await req.prisma.gHLIntegration.findUnique({
      where: { userId }
    });

    // Encrypt token before storing
    const encryptedToken = encrypt(cleanToken);

    if (existing) {
      // Update existing integration
      await req.prisma.gHLIntegration.update({
        where: { userId },
        data: {
          privateToken: encryptedToken,
          locationId,
          locationName,
          isConnected: true
        }
      });
    } else {
      // Create new integration
      await req.prisma.gHLIntegration.create({
        data: {
          privateToken: encryptedToken,
          locationId,
          locationName,
          isConnected: true,
          userId
        }
      });
    }

    res.json({
      message: 'GoHighLevel connected successfully',
      integration: {
        locationId,
        locationName,
        isConnected: true
      }
    });
  } catch (error) {
    console.error('Error connecting to GHL:', error);
    res.status(500).json({ error: 'Failed to connect to GoHighLevel' });
  }
};

/**
 * Get GHL integration status for the authenticated user
 * GET /api/ghl/status
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const integration = await req.prisma.gHLIntegration.findUnique({
      where: { userId }
    });

    if (!integration) {
      return res.json({
        isConnected: false,
        locationId: null,
        locationName: null
      });
    }

    res.json({
      isConnected: integration.isConnected,
      locationId: integration.locationId,
      locationName: integration.locationName,
      updatedAt: integration.updatedAt
    });
  } catch (error) {
    console.error('Error fetching GHL status:', error);
    res.status(500).json({ error: 'Failed to fetch integration status' });
  }
};

/**
 * Disconnect GHL integration for the authenticated user
 * DELETE /api/ghl/disconnect
 */
const disconnect = async (req, res) => {
  try {
    const userId = req.user.id;

    const existing = await req.prisma.gHLIntegration.findUnique({
      where: { userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'No GHL integration found' });
    }

    await req.prisma.gHLIntegration.delete({
      where: { userId }
    });

    res.json({ message: 'GoHighLevel disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting GHL:', error);
    res.status(500).json({ error: 'Failed to disconnect GoHighLevel' });
  }
};

/**
 * Get calendars from GHL for the authenticated user
 * GET /api/ghl/calendars
 */
const getCalendars = async (req, res) => {
  try {
    const userId = req.user.id;

    const integration = await req.prisma.gHLIntegration.findUnique({
      where: { userId }
    });

    if (!integration || !integration.isConnected) {
      return res.status(400).json({ error: 'GoHighLevel is not connected. Please connect first in Settings.' });
    }

    // Decrypt token
    const token = decrypt(integration.privateToken);

    try {
      // Get calendars from GHL
      const calendarsData = await ghlRequest(`/calendars/?locationId=${integration.locationId}`, token);

      const calendars = (calendarsData.calendars || []).map(cal => ({
        id: cal.id,
        name: cal.name,
        description: cal.description,
        timezone: cal.timezone
      }));

      res.json({ calendars });
    } catch (ghlError) {
      console.error('GHL API error fetching calendars:', ghlError);
      res.status(400).json({ error: 'Failed to fetch calendars from GoHighLevel. Token may have expired.' });
    }
  } catch (error) {
    console.error('Error fetching GHL calendars:', error);
    res.status(500).json({ error: 'Failed to fetch calendars' });
  }
};

/**
 * Check calendar availability (called by VAPI tool)
 * POST /api/ghl/check-availability
 * Accepts calendarId, timezone, userId from query params OR body
 */
const checkAvailability = async (req, res) => {
  try {
    // VAPI sends function args in message.toolCalls[].function.arguments
    // Also support direct body params for testing
    let functionArgs = {};
    if (req.body.message?.toolCalls?.[0]?.function?.arguments) {
      functionArgs = req.body.message.toolCalls[0].function.arguments;
    } else {
      functionArgs = req.body;
    }

    // Get static params from query string (set when tool was configured)
    // or fall back to body for backwards compatibility
    const calendarId = req.query.calendarId || functionArgs.calendarId;
    const timezone = req.query.timezone || functionArgs.timezone;
    const userId = req.query.userId || functionArgs.userId;
    const date = functionArgs.date;

    console.log('Check availability - calendarId:', calendarId, 'date:', date, 'userId:', userId);

    if (!calendarId || !date) {
      return res.status(400).json({
        results: [{ error: 'calendarId and date are required' }]
      });
    }

    if (!userId) {
      return res.status(400).json({
        results: [{ error: 'userId is required' }]
      });
    }

    // Get user's GHL integration
    const integration = await req.prisma.gHLIntegration.findUnique({
      where: { userId: parseInt(userId) }
    });

    if (!integration || !integration.isConnected) {
      return res.json({
        results: [{ error: 'GoHighLevel is not connected. Please connect in Settings.' }]
      });
    }

    const token = decrypt(integration.privateToken);

    // Calculate start and end of the requested date
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    try {
      const slotsData = await ghlRequest(
        `/calendars/${calendarId}/free-slots?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}${timezone ? `&timezone=${timezone}` : ''}`,
        token
      );

      // Format slots for easy reading by the AI
      const slots = (slotsData.slots || slotsData || []).map(slot => {
        if (typeof slot === 'string') {
          return slot;
        }
        return slot.startTime || slot.start || slot;
      });

      // VAPI expects results array format
      res.json({
        results: [{
          success: true,
          date: date,
          availableSlots: slots,
          message: slots.length > 0
            ? `Available times on ${date}: ${slots.join(', ')}`
            : `No available slots on ${date}`
        }]
      });
    } catch (ghlError) {
      console.error('GHL API error checking availability:', ghlError);
      res.json({
        results: [{ error: 'Failed to check availability', details: ghlError.message }]
      });
    }
  } catch (error) {
    console.error('Error checking availability:', error);
    res.json({
      results: [{ error: 'Failed to check availability' }]
    });
  }
};

/**
 * Book an appointment (called by VAPI tool)
 * POST /api/ghl/book-appointment
 * Accepts calendarId, timezone, userId from query params OR body
 */
const bookAppointment = async (req, res) => {
  try {
    // VAPI sends function args in message.toolCalls[].function.arguments
    let functionArgs = {};
    if (req.body.message?.toolCalls?.[0]?.function?.arguments) {
      functionArgs = req.body.message.toolCalls[0].function.arguments;
    } else {
      functionArgs = req.body;
    }

    // Get static params from query string (set when tool was configured)
    const calendarId = req.query.calendarId || functionArgs.calendarId;
    const timezone = req.query.timezone || functionArgs.timezone;
    const userId = req.query.userId || functionArgs.userId;

    // Get dynamic params from function arguments (provided by LLM)
    const {
      startTime,
      endTime,
      title,
      contactName,
      contactEmail,
      contactPhone,
      notes
    } = functionArgs;

    console.log('Book appointment - calendarId:', calendarId, 'userId:', userId, 'startTime:', startTime, 'contactEmail:', contactEmail);

    if (!calendarId || !startTime || !contactEmail) {
      return res.json({
        results: [{ error: 'calendarId, startTime, and contactEmail are required' }]
      });
    }

    if (!userId) {
      return res.json({
        results: [{ error: 'userId is required' }]
      });
    }

    // Get user's GHL integration
    const integration = await req.prisma.gHLIntegration.findUnique({
      where: { userId: parseInt(userId) }
    });

    if (!integration || !integration.isConnected) {
      return res.json({
        results: [{ error: 'GoHighLevel is not connected. Please connect in Settings.' }]
      });
    }

    const token = decrypt(integration.privateToken);
    const locationId = integration.locationId;

    try {
      // First, find or create the contact
      let contactId;

      // Try to find existing contact by email
      const searchResponse = await ghlRequest(
        `/contacts/search?locationId=${locationId}&query=${encodeURIComponent(contactEmail)}`,
        token
      );

      if (searchResponse.contacts && searchResponse.contacts.length > 0) {
        contactId = searchResponse.contacts[0].id;
      } else {
        // Create new contact
        const contactData = {
          locationId,
          email: contactEmail,
          name: contactName || '',
          phone: contactPhone || ''
        };

        const createContactResponse = await ghlRequest('/contacts', token, {
          method: 'POST',
          body: JSON.stringify(contactData)
        });

        contactId = createContactResponse.contact?.id;
      }

      if (!contactId) {
        return res.status(400).json({ error: 'Failed to find or create contact' });
      }

      // Calculate end time if not provided (default 30 min appointment)
      let appointmentEndTime = endTime;
      if (!appointmentEndTime) {
        const start = new Date(startTime);
        start.setMinutes(start.getMinutes() + 30);
        appointmentEndTime = start.toISOString();
      }

      // Book the appointment
      const appointmentData = {
        calendarId,
        locationId,
        contactId,
        startTime,
        endTime: appointmentEndTime,
        title: title || 'Appointment',
        appointmentStatus: 'confirmed',
        notes: notes || ''
      };

      const appointmentResponse = await ghlRequest('/calendars/events/appointments', token, {
        method: 'POST',
        body: JSON.stringify(appointmentData)
      });

      // VAPI expects results array format
      res.json({
        results: [{
          success: true,
          message: `Appointment booked successfully for ${contactName || contactEmail} on ${new Date(startTime).toLocaleString()}`,
          appointment: {
            id: appointmentResponse.id || appointmentResponse.event?.id,
            startTime,
            endTime: appointmentEndTime,
            contactName: contactName || contactEmail
          }
        }]
      });
    } catch (ghlError) {
      console.error('GHL API error booking appointment:', ghlError);
      res.json({
        results: [{ error: 'Failed to book appointment', details: ghlError.message }]
      });
    }
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.json({
      results: [{ error: 'Failed to book appointment' }]
    });
  }
};

module.exports = {
  connect,
  getStatus,
  disconnect,
  getCalendars,
  checkAvailability,
  bookAppointment
};
