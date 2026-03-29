const googleCalendarService = require('../services/googleCalendarService');

exports.getStatus = async (req, res) => {
  try {
    const status = await googleCalendarService.getConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('Google Calendar status error:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
};

exports.connect = async (req, res) => {
  try {
    const url = googleCalendarService.getAuthUrl();
    res.json({ url });
  } catch (error) {
    console.error('Google Calendar connect error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

exports.callback = async (req, res) => {
  try {
    const { code, error: authError } = req.query;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (authError) {
      return res.redirect(`${clientUrl}/dashboard/calendar?error=${encodeURIComponent(authError)}`);
    }

    if (!code) {
      return res.redirect(`${clientUrl}/dashboard/calendar?error=no_code`);
    }

    const email = await googleCalendarService.handleCallback(code);
    res.redirect(`${clientUrl}/dashboard/calendar?connected=true&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/dashboard/calendar?error=${encodeURIComponent(error.message)}`);
  }
};

exports.disconnect = async (req, res) => {
  try {
    await googleCalendarService.disconnect();
    res.json({ success: true });
  } catch (error) {
    console.error('Google Calendar disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};

exports.getEvents = async (req, res) => {
  try {
    const { timeMin, timeMax } = req.query;
    const events = await googleCalendarService.fetchDWYEvents(timeMin, timeMax);
    res.json({ events });
  } catch (error) {
    console.error('Google Calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

exports.getEventsForClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { timeMin, timeMax } = req.query;

    // Look up the client's name
    const client = await req.prisma.user.findUnique({
      where: { id: parseInt(clientId, 10) },
      select: { name: true, email: true },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientName = client.name || client.email;
    const events = await googleCalendarService.fetchDWYEventsForClient(clientName, timeMin, timeMax);
    res.json({ events, clientName });
  } catch (error) {
    console.error('Google Calendar client events error:', error);
    res.status(500).json({ error: 'Failed to fetch client events' });
  }
};
