const jwt = require('jsonwebtoken');
const { encrypt, decrypt } = require('../utils/encryption');
const { createCalendarProvider, getSupportedProviders } = require('../services/calendar/calendarFactory');

// OAuth config per provider
const OAUTH_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    getClientId: () => process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID,
    getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    getRedirectUri: () => process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' }
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
 * Connect a provider using API key (Cal.com).
 * POST /api/calendar/integrations/:provider/connect
 */
const connectProvider = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    if (provider !== 'calcom') {
      return res.status(400).json({ error: 'Only Cal.com supports API key connection. Use OAuth for other providers.' });
    }

    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Validate the API key by making a test request
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

    // Upsert integration
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
        data: {
          provider: 'calcom',
          apiKey: encryptedKey,
          externalAccountId,
          accountLabel,
          isConnected: true,
          userId
        }
      });
    }

    res.json({
      message: 'Cal.com connected successfully',
      integration: {
        id: integration.id,
        provider: 'calcom',
        accountLabel,
        isConnected: true
      }
    });
  } catch (error) {
    console.error('Error connecting provider:', error);
    res.status(500).json({ error: 'Failed to connect provider' });
  }
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
    const date = functionArgs.date;

    console.log('Check availability - provider:', provider, 'integrationId:', integrationId, 'calendarId:', calendarId, 'date:', date);

    if (!calendarId || !date) {
      return res.json({ results: [{ error: 'calendarId and date are required' }] });
    }
    if (!userId) {
      return res.json({ results: [{ error: 'userId is required' }] });
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
