const jwt = require('jsonwebtoken');
const { encrypt, decrypt } = require('../utils/encryption');
const { createCalendarProvider, getSupportedProviders } = require('../services/calendar/calendarFactory');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_AUTH_BASE = 'https://marketplace.gohighlevel.com';

// OAuth config per provider
const OAUTH_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
    getClientId: () => process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID,
    getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    getRedirectUri: () => process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' }
  },
  ghl: {
    authUrl: `${GHL_AUTH_BASE}/oauth/chooselocation`,
    tokenUrl: `${GHL_API_BASE}/oauth/token`,
    userInfoUrl: null,
    scopes: 'calendars.readonly calendars.write calendars/events.readonly calendars/events.write contacts.readonly contacts.write',
    getClientId: () => process.env.GHL_CLIENT_ID,
    getClientSecret: () => process.env.GHL_CLIENT_SECRET,
    getRedirectUri: () => process.env.GHL_CALENDAR_REDIRECT_URI || process.env.GHL_REDIRECT_URI,
    extraAuthParams: {}
  },
  calendly: {
    authUrl: 'https://auth.calendly.com/oauth/authorize',
    tokenUrl: 'https://auth.calendly.com/oauth/token',
    userInfoUrl: 'https://api.calendly.com/users/me',
    scopes: '',
    getClientId: () => process.env.CALENDLY_CLIENT_ID,
    getClientSecret: () => process.env.CALENDLY_CLIENT_SECRET,
    getRedirectUri: () => process.env.CALENDLY_REDIRECT_URI,
    extraAuthParams: {}
  },
  hubspot: {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    userInfoUrl: null,
    scopes: 'crm.objects.contacts.read crm.objects.contacts.write scheduler.read.meetings scheduler.write.meetings',
    getClientId: () => process.env.HUBSPOT_CLIENT_ID,
    getClientSecret: () => process.env.HUBSPOT_CLIENT_SECRET,
    getRedirectUri: () => process.env.HUBSPOT_REDIRECT_URI,
    extraAuthParams: {}
  }
};

/**
 * List all connected calendar integrations for the authenticated user.
 * GET /api/calendar/integrations
 */
const listIntegrations = async (req, res) => {
  try {
    const integrations = await req.prisma.calendarIntegration.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        provider: true,
        externalAccountId: true,
        accountLabel: true,
        isConnected: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ integrations });
  } catch (error) {
    console.error('Error listing integrations:', error);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
};

/**
 * List calendars for a specific integration account.
 * GET /api/calendar/integrations/:id/calendars
 */
const getCalendars = async (req, res) => {
  try {
    const integrationId = parseInt(req.params.id);
    const integration = await req.prisma.calendarIntegration.findFirst({
      where: { id: integrationId, userId: req.user.id }
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    if (!integration.isConnected) {
      return res.status(400).json({ error: 'Integration is not connected' });
    }

    const provider = createCalendarProvider(integration, req.prisma);
    const calendars = await provider.listCalendars();

    res.json({ calendars });
  } catch (error) {
    console.error('Error fetching calendars:', error);
    res.status(400).json({ error: error.message || 'Failed to fetch calendars' });
  }
};

/**
 * Connect a provider using API key / bearer token.
 * POST /api/calendar/integrations/:provider/connect
 * Supports: Cal.com (API key), GHL (Private Integration Token / bearer token)
 */
const connectProvider = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    if (provider === 'ghl') {
      return await _connectGHLBearer(req, res, userId);
    }

    if (provider === 'calcom') {
      return await _connectCalcom(req, res, userId);
    }

    return res.status(400).json({ error: `Direct token connection not supported for ${provider}. Use OAuth.` });
  } catch (error) {
    console.error('Error connecting provider:', error);
    res.status(500).json({ error: 'Failed to connect provider' });
  }
};

/**
 * Connect GHL via Private Integration Token (bearer token).
 */
const _connectGHLBearer = async (req, res, userId) => {
  const { privateToken, locationId: providedLocationId } = req.body;

  if (!privateToken) {
    return res.status(400).json({ error: 'Private Integration Token is required' });
  }

  const cleanToken = privateToken.trim();

  if (!cleanToken.startsWith('pit-') && !cleanToken.startsWith('pit_')) {
    return res.status(400).json({
      error: 'Invalid token format. Private Integration Token should start with "pit-".'
    });
  }

  let locationId = providedLocationId?.trim() || null;
  let locationName = null;

  const ghlFetch = async (endpoint) => {
    const r = await fetch(`${GHL_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    if (!r.ok) {
      const errorText = await r.text();
      let err;
      try { err = JSON.parse(errorText); } catch { err = { message: errorText }; }
      throw new Error(err.message || err.error || `GHL API error: ${r.status}`);
    }
    return r.json();
  };

  // Helper: fetch location name from GHL
  const fetchLocationName = async (locId) => {
    // Method 1: GET /locations/{id}
    try {
      const locData = await ghlFetch(`/locations/${locId}`);
      const name = locData.location?.name || locData.name || locData.location?.businessName || locData.businessName;
      if (name) { console.log('GHL location name from /locations/:id:', name); return name; }
    } catch (e) {
      console.log('GHL /locations/:id failed:', e.message);
    }

    // Method 2: GET /locations/ (list all) and find matching
    try {
      const locData = await ghlFetch('/locations/');
      const locations = locData.locations || locData.location || (Array.isArray(locData) ? locData : []);
      const match = locations.find(l => (l.id || l._id || l.locationId) === locId);
      if (match) {
        const name = match.name || match.businessName;
        if (name) { console.log('GHL location name from /locations/ list:', name); return name; }
      }
      // Even if no match, first location might be the one (PIT is scoped to one location)
      if (locations.length === 1) {
        const name = locations[0].name || locations[0].businessName;
        if (name) { console.log('GHL location name from single location:', name); return name; }
      }
    } catch (e) {
      console.log('GHL /locations/ list failed:', e.message);
    }

    // Method 3: GET /locations/search
    try {
      const locData = await ghlFetch('/locations/search');
      const locations = locData.locations || (Array.isArray(locData) ? locData : []);
      const match = locations.find(l => (l.id || l._id || l.locationId) === locId);
      if (match) {
        const name = match.name || match.businessName;
        if (name) { console.log('GHL location name from /locations/search:', name); return name; }
      }
    } catch (e) {
      console.log('GHL /locations/search failed:', e.message);
    }

    return null;
  };

  // Validate token / detect location
  if (locationId) {
    try {
      await ghlFetch(`/calendars/?locationId=${locationId}`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('Invalid JWT') || msg.includes('401')) {
        return res.status(400).json({ error: 'Invalid token. Check your PIT and ensure it has calendar scopes.' });
      }
      return res.status(400).json({ error: `Unable to validate token: ${msg}` });
    }
    // Fetch location name
    locationName = await fetchLocationName(locationId) || `GHL - ${locationId}`;
  } else {
    // Auto-detect location
    try {
      let locData;
      try { locData = await ghlFetch('/locations/'); } catch {
        try { locData = await ghlFetch('/locations/search'); } catch {
          return res.status(400).json({ error: 'Could not auto-detect location. Please provide Location ID.', needsLocationId: true });
        }
      }
      const locations = locData.locations || locData.location || (Array.isArray(locData) ? locData : [locData]);
      if (locations && locations.length > 0) {
        const loc = locations[0];
        locationId = loc.id || loc._id || loc.locationId;
        locationName = loc.name || loc.businessName || null;
      } else if (locData.id) {
        locationId = locData.id;
        locationName = locData.name || locData.businessName || null;
      } else {
        return res.status(400).json({ error: 'Could not find location. Please provide Location ID.', needsLocationId: true });
      }
    } catch {
      return res.status(400).json({ error: 'Could not auto-detect location. Please provide Location ID.', needsLocationId: true });
    }

    // If auto-detect didn't return a name, try fetching it
    if (!locationName && locationId) {
      locationName = await fetchLocationName(locationId) || `GHL - ${locationId}`;
    }
  }

  const encryptedToken = encrypt(cleanToken);
  const externalAccountId = locationId;
  const accountLabel = locationName || `GHL - ${locationId}`;

  // Check if this location is already connected
  const existing = await req.prisma.calendarIntegration.findFirst({
    where: { userId, provider: 'ghl', externalAccountId }
  });

  let integration;
  if (existing) {
    integration = await req.prisma.calendarIntegration.update({
      where: { id: existing.id },
      data: { apiKey: encryptedToken, isConnected: true, accountLabel, metadata: JSON.stringify({ locationId, connectionType: 'bearer' }) }
    });
  } else {
    integration = await req.prisma.calendarIntegration.create({
      data: {
        provider: 'ghl',
        apiKey: encryptedToken,
        externalAccountId,
        accountLabel,
        isConnected: true,
        userId,
        metadata: JSON.stringify({ locationId, connectionType: 'bearer' })
      }
    });
  }

  res.json({
    message: 'GoHighLevel connected successfully',
    integration: { id: integration.id, provider: 'ghl', accountLabel, isConnected: true }
  });
};

/**
 * Connect Cal.com via API key.
 */
const _connectCalcom = async (req, res, userId) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    const testResponse = await fetch(`https://api.cal.com/v1/event-types?apiKey=${apiKey.trim()}`);
    if (!testResponse.ok) {
      return res.status(400).json({ error: 'Invalid Cal.com API key' });
    }
  } catch {
    return res.status(400).json({ error: 'Could not validate Cal.com API key' });
  }

  const encryptedKey = encrypt(apiKey.trim());
  const externalAccountId = 'calcom-default';
  const accountLabel = 'Cal.com';

  const existing = await req.prisma.calendarIntegration.findFirst({
    where: { userId, provider: 'calcom', externalAccountId }
  });

  let integration;
  if (existing) {
    integration = await req.prisma.calendarIntegration.update({
      where: { id: existing.id },
      data: { apiKey: encryptedKey, isConnected: true }
    });
  } else {
    integration = await req.prisma.calendarIntegration.create({
      data: { provider: 'calcom', apiKey: encryptedKey, externalAccountId, accountLabel, isConnected: true, userId }
    });
  }

  res.json({
    message: 'Cal.com connected successfully',
    integration: { id: integration.id, provider: 'calcom', accountLabel, isConnected: true }
  });
};

/**
 * Disconnect a specific integration account.
 * DELETE /api/calendar/integrations/:id/disconnect
 */
const disconnectIntegration = async (req, res) => {
  try {
    const integrationId = parseInt(req.params.id);

    const integration = await req.prisma.calendarIntegration.findFirst({
      where: { id: integrationId, userId: req.user.id }
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    await req.prisma.calendarIntegration.delete({
      where: { id: integrationId }
    });

    res.json({ message: `${integration.provider} integration disconnected successfully` });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
};

/**
 * Start OAuth authorization flow.
 * GET /api/calendar/oauth/:provider/authorize
 */
const oauthAuthorize = async (req, res) => {
  try {
    const { provider } = req.params;
    const config = OAUTH_CONFIG[provider];

    if (!config) {
      return res.status(400).json({ error: `OAuth not supported for provider: ${provider}` });
    }

    const clientId = config.getClientId();
    const redirectUri = config.getRedirectUri();

    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: `${provider} OAuth is not configured on the server` });
    }

    // Create JWT state with userId and provider
    const state = jwt.sign(
      { userId: req.user.id, provider },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      ...(config.scopes && { scope: config.scopes }),
      ...config.extraAuthParams
    });

    const authorizationUrl = `${config.authUrl}?${params.toString()}`;

    res.json({ authorizationUrl });
  } catch (error) {
    console.error('Error creating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
};

/**
 * OAuth callback - receives code from provider redirect.
 * GET /api/calendar/oauth/:provider/callback
 */
const oauthCallback = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const { provider } = req.params;
  const config = OAUTH_CONFIG[provider];

  if (!config) {
    return res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent('Unknown provider')}`);
  }

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent('Missing authorization code')}`);
    }

    // Verify JWT state
    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent('Authorization expired - please try again')}`);
    }

    if (decoded.provider !== provider) {
      return res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent('Provider mismatch')}`);
    }

    const userId = decoded.userId;

    // Exchange code for tokens
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.getClientId(),
        client_secret: config.getClientSecret(),
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.getRedirectUri()
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`${provider} token exchange failed:`, errorText);
      return res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent('Failed to exchange authorization code')}`);
    }

    const tokenData = await tokenResponse.json();

    // Get external account info
    let externalAccountId = null;
    let accountLabel = null;

    if (provider === 'google') {
      // Try userinfo endpoint first
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        console.log('Google userinfo response status:', userInfoRes.status);
        const userInfoText = await userInfoRes.text();
        console.log('Google userinfo response:', userInfoText);
        if (userInfoRes.ok) {
          const userInfo = JSON.parse(userInfoText);
          externalAccountId = userInfo.email || userInfo.id;
          accountLabel = userInfo.email || userInfo.name || 'Google Calendar';
        }
      } catch (e) {
        console.log('Could not fetch Google user info:', e.message);
      }

      // Fallback: try to decode id_token if present
      if (!externalAccountId && tokenData.id_token) {
        try {
          const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
          externalAccountId = payload.email || payload.sub;
          accountLabel = payload.email || 'Google Calendar';
          console.log('Got email from id_token:', accountLabel);
        } catch (e) {
          console.log('Could not decode id_token:', e.message);
        }
      }
    }

    if (provider === 'calendly' && config.userInfoUrl) {
      try {
        const userInfoRes = await fetch(config.userInfoUrl, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          externalAccountId = userInfo.resource?.uri || 'calendly-default';
          accountLabel = userInfo.resource?.name || userInfo.resource?.email || 'Calendly';
          // Store userUri in metadata
          var metadata = JSON.stringify({ userUri: userInfo.resource?.uri });
        }
      } catch (e) {
        console.log('Could not fetch Calendly user info:', e.message);
      }
    }

    if (provider === 'hubspot') {
      externalAccountId = tokenData.hub_id?.toString() || `hubspot-${userId}`;
      accountLabel = `HubSpot (${tokenData.hub_id || 'Portal'})`;
    }

    if (provider === 'ghl') {
      const locationId = tokenData.locationId || null;
      externalAccountId = locationId || `ghl-${Date.now()}`;

      // Fetch location/sub-account name
      let locationName = null;
      if (locationId) {
        const ghlHeaders = {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };

        // Try GET /locations/{id}
        try {
          const locRes = await fetch(`${GHL_API_BASE}/locations/${locationId}`, { headers: ghlHeaders });
          if (locRes.ok) {
            const locData = await locRes.json();
            locationName = locData.location?.name || locData.name || locData.location?.businessName || locData.businessName;
            console.log('GHL OAuth location name from /locations/:id:', locationName);
          }
        } catch (e) {
          console.log('Could not fetch GHL location by id:', e.message);
        }

        // Fallback: GET /locations/ (list)
        if (!locationName) {
          try {
            const locRes = await fetch(`${GHL_API_BASE}/locations/`, { headers: ghlHeaders });
            if (locRes.ok) {
              const locData = await locRes.json();
              const locations = locData.locations || [];
              const match = locations.find(l => l.id === locationId) || locations[0];
              if (match) {
                locationName = match.name || match.businessName;
                console.log('GHL OAuth location name from /locations/ list:', locationName);
              }
            }
          } catch (e) {
            console.log('Could not fetch GHL locations list:', e.message);
          }
        }
      }

      accountLabel = locationName || `GHL - ${locationId || 'Unknown'}`;
      var metadata = JSON.stringify({ locationId, companyId: tokenData.companyId || null, connectionType: 'oauth' });
    }

    // Default fallbacks
    if (!externalAccountId) externalAccountId = `${provider}-${Date.now()}`;
    if (!accountLabel) accountLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

    const encryptedAccess = encrypt(tokenData.access_token);
    const encryptedRefresh = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    const tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    // For single-account providers (calendly, hubspot), delete existing before creating
    const multiAccountProviders = ['google', 'ghl'];
    if (!multiAccountProviders.includes(provider)) {
      await req.prisma.calendarIntegration.deleteMany({
        where: { userId, provider }
      });
    }

    // Check if this exact account already exists (for multi-account providers)
    const existing = await req.prisma.calendarIntegration.findFirst({
      where: { userId, provider, externalAccountId }
    });

    const data = {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt,
      externalAccountId,
      accountLabel,
      isConnected: true,
      metadata: metadata || null
    };

    if (existing) {
      await req.prisma.calendarIntegration.update({
        where: { id: existing.id },
        data
      });
    } else {
      await req.prisma.calendarIntegration.create({
        data: { ...data, provider, userId }
      });
    }

    res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_connected=${provider}`);
  } catch (error) {
    console.error('OAuth callback error:', error.message, error.stack);
    const errorMsg = error.message?.includes('calendarIntegration')
      ? 'Database table not found - please redeploy to run migrations'
      : `OAuth error: ${error.message || 'An unexpected error occurred'}`;
    res.redirect(`${clientUrl}/dashboard/settings?tab=calendars&calendar_error=${encodeURIComponent(errorMsg)}`);
  }
};

/**
 * Check calendar availability (called by VAPI tool - public endpoint).
 * POST /api/calendar/check-availability
 */
const checkAvailability = async (req, res) => {
  try {
    let functionArgs = {};
    if (req.body.message?.toolCalls?.[0]?.function?.arguments) {
      functionArgs = req.body.message.toolCalls[0].function.arguments;
    } else {
      functionArgs = req.body;
    }

    const provider = req.query.provider;
    const integrationId = req.query.integrationId;
    const calendarId = req.query.calendarId || functionArgs.calendarId;
    const timezone = req.query.timezone || functionArgs.timezone;
    const userId = req.query.userId || functionArgs.userId;
    let date = functionArgs.date;

    console.log('Check availability - provider:', provider, 'integrationId:', integrationId, 'calendarId:', calendarId, 'date:', date);

    if (!calendarId || !date) {
      return res.json({ results: [{ error: 'calendarId and date are required' }] });
    }
    if (!userId) {
      return res.json({ results: [{ error: 'userId is required' }] });
    }

    // Validate date — reject past dates and auto-correct obvious hallucinations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestedDate = new Date(date + 'T00:00:00');
    const todayStr = today.toISOString().split('T')[0];

    if (isNaN(requestedDate.getTime())) {
      return res.json({ results: [{ success: false, correctedDate: todayStr, error: `INVALID_DATE_FORMAT: "${date}" is not valid. Use YYYY-MM-DD. Current date: ${todayStr}` }] });
    }

    if (requestedDate < today) {
      // Calculate what the user likely meant (e.g. same month/day but current year, or tomorrow)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      return res.json({ results: [{ success: false, currentDate: todayStr, suggestedDate: tomorrowStr, error: `PAST_DATE: ${date} is in the past. Current date is ${todayStr}. Retry with a correct date like ${tomorrowStr}. Do NOT read this message to the customer.` }] });
    }

    // Reject dates more than 90 days in the future
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    if (requestedDate > maxDate) {
      return res.json({ results: [{ success: false, currentDate: todayStr, error: `DATE_TOO_FAR: Max 90 days from today (${todayStr}). Do NOT read this message to the customer.` }] });
    }

    const integration = await req.prisma.calendarIntegration.findFirst({
      where: {
        id: integrationId ? parseInt(integrationId) : undefined,
        userId: parseInt(userId),
        ...(provider && !integrationId ? { provider } : {})
      }
    });

    if (!integration || !integration.isConnected) {
      return res.json({ results: [{ error: `Calendar provider is not connected. Please connect in Settings.` }] });
    }

    const calendarProvider = createCalendarProvider(integration, req.prisma);
    const result = await calendarProvider.checkAvailability(calendarId, date, timezone);

    res.json({
      results: [{
        success: true,
        date,
        availableSlots: result.availableSlots,
        message: result.message
      }]
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.json({ results: [{ error: 'Failed to check availability', details: error.message }] });
  }
};

/**
 * Book an appointment (called by VAPI tool - public endpoint).
 * POST /api/calendar/book-appointment
 */
const bookAppointment = async (req, res) => {
  try {
    let functionArgs = {};
    if (req.body.message?.toolCalls?.[0]?.function?.arguments) {
      functionArgs = req.body.message.toolCalls[0].function.arguments;
    } else {
      functionArgs = req.body;
    }

    const provider = req.query.provider;
    const integrationId = req.query.integrationId;
    const calendarId = req.query.calendarId || functionArgs.calendarId;
    const timezone = req.query.timezone || functionArgs.timezone;
    const userId = req.query.userId || functionArgs.userId;

    const { startTime, endTime, title, contactName, contactEmail, contactPhone, notes } = functionArgs;

    console.log('Book appointment - provider:', provider, 'integrationId:', integrationId, 'calendarId:', calendarId, 'contactEmail:', contactEmail);

    if (!calendarId || !startTime || !contactEmail) {
      return res.json({ results: [{ error: 'calendarId, startTime, and contactEmail are required' }] });
    }
    if (!userId) {
      return res.json({ results: [{ error: 'userId is required' }] });
    }

    // Validate startTime — reject past dates
    const now = new Date();
    const bookingTime = new Date(startTime);
    const todayStr = now.toISOString().split('T')[0];

    if (isNaN(bookingTime.getTime())) {
      return res.json({ results: [{ success: false, error: `INVALID_TIME_FORMAT: Use ISO 8601 (e.g., ${todayStr}T10:00:00). Do NOT read this to the customer.` }] });
    }

    if (bookingTime < now) {
      return res.json({ results: [{ success: false, currentDate: todayStr, error: `PAST_TIME: ${startTime} is in the past. Current date: ${todayStr}. Retry with a future time. Do NOT read this to the customer.` }] });
    }

    const integration = await req.prisma.calendarIntegration.findFirst({
      where: {
        id: integrationId ? parseInt(integrationId) : undefined,
        userId: parseInt(userId),
        ...(provider && !integrationId ? { provider } : {})
      }
    });

    if (!integration || !integration.isConnected) {
      return res.json({ results: [{ error: 'Calendar provider is not connected. Please connect in Settings.' }] });
    }

    const calendarProvider = createCalendarProvider(integration, req.prisma);
    const result = await calendarProvider.bookAppointment(calendarId, {
      startTime, endTime, title, contactName, contactEmail, contactPhone, notes, timezone
    });

    res.json({ results: [result] });
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.json({ results: [{ error: 'Failed to book appointment', details: error.message }] });
  }
};

module.exports = {
  listIntegrations,
  getCalendars,
  connectProvider,
  disconnectIntegration,
  oauthAuthorize,
  oauthCallback,
  checkAvailability,
  bookAppointment
};
