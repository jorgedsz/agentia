const jwt = require('jsonwebtoken');
const { encrypt, decrypt, mask } = require('../utils/encryption');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_AUTH_BASE = 'https://marketplace.gohighlevel.com';

/**
 * Get a valid token for GHL API requests.
 * - If OAuth token exists and is valid, return it
 * - If OAuth token is expiring soon, auto-refresh it
 * - If only legacy PIT exists, return that
 */
const getValidToken = async (integration, prisma) => {
  // OAuth token path
  if (integration.accessToken) {
    const decryptedAccess = decrypt(integration.accessToken);

    // Check if token expires within 5 minutes
    if (integration.tokenExpiresAt) {
      const expiresAt = new Date(integration.tokenExpiresAt);
      const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinFromNow) {
        // Token is expiring soon - refresh it
        if (!integration.refreshToken) {
          throw new Error('Token expired and no refresh token available');
        }

        try {
          const decryptedRefresh = decrypt(integration.refreshToken);
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
            const errorText = await response.text();
            console.error('Token refresh failed:', errorText);
            // Mark as disconnected
            await prisma.gHLIntegration.update({
              where: { id: integration.id },
              data: { isConnected: false }
            });
            throw new Error('Token refresh failed - please reconnect GoHighLevel');
          }

          const tokenData = await response.json();

          // GHL issues new refresh token on every refresh - must store it
          await prisma.gHLIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: encrypt(tokenData.access_token),
              refreshToken: encrypt(tokenData.refresh_token),
              tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
            }
          });

          return tokenData.access_token;
        } catch (refreshError) {
          if (refreshError.message.includes('reconnect')) throw refreshError;
          console.error('Token refresh error:', refreshError);
          throw new Error('Failed to refresh token - please reconnect GoHighLevel');
        }
      }
    }

    return decryptedAccess;
  }

  // Legacy PIT fallback
  if (integration.privateToken) {
    return decrypt(integration.privateToken);
  }

  throw new Error('No valid token found - please connect GoHighLevel');
};

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
        connectionType: null,
        locationId: null,
        locationName: null
      });
    }

    const connectionType = integration.accessToken ? 'oauth' : integration.privateToken ? 'legacy' : null;

    res.json({
      isConnected: integration.isConnected,
      connectionType,
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

    const token = await getValidToken(integration, req.prisma);

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

    const token = await getValidToken(integration, req.prisma);

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

    const token = await getValidToken(integration, req.prisma);
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

/**
 * Start OAuth authorization flow
 * GET /api/ghl/oauth/authorize
 */
const oauthAuthorize = async (req, res) => {
  try {
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'GHL OAuth is not configured on the server' });
    }

    // Create JWT state param with userId, 10min TTL
    const state = jwt.sign(
      { userId: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const scopes = [
      'calendars.readonly',
      'calendars.write',
      'calendars/events.readonly',
      'calendars/events.write',
      'contacts.readonly',
      'contacts.write'
    ];

    const authorizationUrl = `${GHL_AUTH_BASE}/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&scope=${encodeURIComponent(scopes.join(' '))}&state=${state}`;

    res.json({ authorizationUrl });
  } catch (error) {
    console.error('Error creating OAuth authorization URL:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
};

/**
 * OAuth callback - receives code from GHL redirect
 * GET /api/ghl/oauth/callback
 */
const oauthCallback = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  console.log('=== GHL OAuth Callback Hit ===');
  console.log('Query params:', req.query);
  console.log('Full URL:', req.originalUrl);

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.log('Missing code or state, redirecting with error');
      return res.redirect(`${clientUrl}/dashboard/settings?tab=ghl&ghl_error=${encodeURIComponent('Missing authorization code or state')}`);
    }

    // Verify JWT state to get userId
    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.redirect(`${clientUrl}/dashboard/settings?tab=ghl&ghl_error=${encodeURIComponent('Authorization expired - please try again')}`);
    }

    const userId = decoded.userId;

    // Exchange code for tokens
    const tokenResponse = await fetch(`${GHL_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.GHL_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return res.redirect(`${clientUrl}/dashboard/settings?tab=ghl&ghl_error=${encodeURIComponent('Failed to exchange authorization code')}`);
    }

    const tokenData = await tokenResponse.json();

    // Store encrypted tokens
    const encryptedAccess = encrypt(tokenData.access_token);
    const encryptedRefresh = encrypt(tokenData.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    const locationId = tokenData.locationId || null;
    const companyId = tokenData.companyId || null;

    // Try to get location name
    let locationName = 'GoHighLevel Location';
    if (locationId) {
      try {
        const locData = await ghlRequest(`/locations/${locationId}`, tokenData.access_token);
        locationName = locData.location?.name || locData.name || locationName;
      } catch (e) {
        console.log('Could not fetch location name:', e.message);
      }
    }

    // Check if user already has an integration
    const existing = await req.prisma.gHLIntegration.findUnique({
      where: { userId }
    });

    const data = {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt,
      locationId,
      companyId,
      locationName,
      privateToken: null, // Clear legacy PIT when upgrading to OAuth
      isConnected: true
    };

    if (existing) {
      await req.prisma.gHLIntegration.update({
        where: { userId },
        data
      });
    } else {
      await req.prisma.gHLIntegration.create({
        data: { ...data, userId }
      });
    }

    res.redirect(`${clientUrl}/dashboard/settings?tab=ghl&ghl_connected=true`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${clientUrl}/dashboard/settings?tab=ghl&ghl_error=${encodeURIComponent('An unexpected error occurred')}`);
  }
};

module.exports = {
  connect,
  getStatus,
  disconnect,
  getCalendars,
  checkAvailability,
  bookAppointment,
  oauthAuthorize,
  oauthCallback
};
