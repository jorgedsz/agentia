const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
}

async function handleCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  // Get the user's email
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  await prisma.googleCalendarToken.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      email: profile.email,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      email: profile.email,
    },
  });

  return profile.email;
}

async function getCalendarClient() {
  const stored = await prisma.googleCalendarToken.findUnique({ where: { id: 1 } });
  if (!stored) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiryDate ? Number(stored.expiryDate) : undefined,
  });

  // Listen for token refresh events and persist the new tokens
  oauth2Client.on('tokens', async (tokens) => {
    const updateData = { accessToken: tokens.access_token };
    if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updateData.expiryDate = BigInt(tokens.expiry_date);
    await prisma.googleCalendarToken.update({ where: { id: 1 }, data: updateData });
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function fetchDWYEvents(timeMin, timeMax) {
  const calendar = await getCalendarClient();
  if (!calendar) return [];

  const params = {
    calendarId: 'primary',
    q: 'DWY',
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  };
  if (timeMin) params.timeMin = timeMin;
  if (timeMax) params.timeMax = timeMax;

  const { data } = await calendar.events.list(params);
  return (data.items || []).map(formatEvent);
}

async function fetchDWYEventsForClient(clientName, timeMin, timeMax) {
  const events = await fetchDWYEvents(timeMin, timeMax);
  if (!clientName) return events;

  const needle = clientName.toLowerCase();
  return events.filter(e => e.summary.toLowerCase().includes(needle));
}

function formatEvent(event) {
  return {
    id: event.id,
    summary: event.summary || '',
    description: event.description || '',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    location: event.location || '',
    htmlLink: event.htmlLink || '',
    status: event.status || '',
  };
}

async function getConnectionStatus() {
  const stored = await prisma.googleCalendarToken.findUnique({ where: { id: 1 } });
  return stored ? { connected: true, email: stored.email } : { connected: false, email: null };
}

async function disconnect() {
  await prisma.googleCalendarToken.deleteMany();
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getCalendarClient,
  fetchDWYEvents,
  fetchDWYEventsForClient,
  getConnectionStatus,
  disconnect,
};
