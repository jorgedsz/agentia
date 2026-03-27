const { decrypt, encrypt } = require('../utils/encryption');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Get a valid access token from a CalendarIntegration record,
 * refreshing if expired (mirrors GoogleCalendarProvider pattern).
 */
async function getAccessToken(prisma, integration) {
  if (!integration.accessToken) throw new Error('No access token available');

  const decryptedAccess = decrypt(integration.accessToken);

  // Check if token expires within 5 minutes
  if (integration.tokenExpiresAt) {
    const expiresAt = new Date(integration.tokenExpiresAt);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinFromNow) {
      if (!integration.refreshToken) throw new Error('Token expired and no refresh token available');

      const decryptedRefresh = decrypt(integration.refreshToken);
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
        console.error('[GWS] Token refresh failed:', await response.text());
        throw new Error('Token refresh failed - please reconnect Google account');
      }

      const tokenData = await response.json();
      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(tokenData.access_token),
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        }
      });

      return tokenData.access_token;
    }
  }

  return decryptedAccess;
}

/**
 * Resolve a CalendarIntegration from userId + integrationId.
 */
async function getIntegration(prisma, userId, integrationId) {
  const integration = await prisma.calendarIntegration.findFirst({
    where: { id: parseInt(integrationId), userId: parseInt(userId), provider: 'google' },
  });
  if (!integration) throw new Error('Google integration not found');
  return integration;
}

/**
 * Helper for Google API requests with error handling.
 */
async function googleRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let error;
    try { error = JSON.parse(errorText); } catch { error = { error: { message: errorText } }; }
    throw new Error(error.error?.message || `Google API error: ${response.status}`);
  }

  return response.json();
}

// ─── Google Sheets ──────────────────────────────────────────

async function listSpreadsheets(prisma, userId, integrationId, query) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`;
  return (await googleRequest(url, token)).files || [];
}

async function getSpreadsheet(prisma, userId, integrationId, spreadsheetId) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`;
  const data = await googleRequest(url, token);

  return {
    id: data.spreadsheetId,
    title: data.properties.title,
    sheets: (data.sheets || []).map(s => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount,
      columnCount: s.properties.gridProperties?.columnCount,
    })),
  };
}

async function readSheet(prisma, userId, integrationId, spreadsheetId, range) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const data = await googleRequest(url, token);
  return { range: data.range, values: data.values || [] };
}

async function writeSheet(prisma, userId, integrationId, spreadsheetId, range, values) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const data = await googleRequest(url, token, {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  return { updatedRange: data.updatedRange, updatedRows: data.updatedRows, updatedColumns: data.updatedColumns };
}

async function appendSheet(prisma, userId, integrationId, spreadsheetId, range, values) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const data = await googleRequest(url, token, {
    method: 'POST',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  return { updatedRange: data.updates?.updatedRange, updatedRows: data.updates?.updatedRows };
}

async function createSpreadsheet(prisma, userId, integrationId, title) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const data = await googleRequest('https://sheets.googleapis.com/v4/spreadsheets', token, {
    method: 'POST',
    body: JSON.stringify({ properties: { title } }),
  });
  return { id: data.spreadsheetId, title: data.properties.title, url: data.spreadsheetUrl };
}

// ─── Google Docs ────────────────────────────────────────────

async function listDocuments(prisma, userId, integrationId, query) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
  if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`;
  return (await googleRequest(url, token)).files || [];
}

async function getDocument(prisma, userId, integrationId, documentId) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const doc = await googleRequest(`https://docs.googleapis.com/v1/documents/${documentId}`, token);

  // Extract plain text from structural content
  let text = '';
  for (const element of doc.body?.content || []) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun) text += el.textRun.content;
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        const cells = [];
        for (const cell of row.tableCells || []) {
          let cellText = '';
          for (const p of cell.content || []) {
            if (p.paragraph) {
              for (const el of p.paragraph.elements || []) {
                if (el.textRun) cellText += el.textRun.content;
              }
            }
          }
          cells.push(cellText.trim());
        }
        text += cells.join('\t') + '\n';
      }
    }
  }

  return { id: doc.documentId, title: doc.title, text: text.trim() };
}

async function createDocument(prisma, userId, integrationId, title) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  const doc = await googleRequest('https://docs.googleapis.com/v1/documents', token, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return { id: doc.documentId, title: doc.title };
}

async function appendToDocument(prisma, userId, integrationId, documentId, text) {
  const integration = await getIntegration(prisma, userId, integrationId);
  const token = await getAccessToken(prisma, integration);

  // First get the document to find the end index
  const doc = await googleRequest(`https://docs.googleapis.com/v1/documents/${documentId}`, token);
  const endIndex = doc.body?.content?.slice(-1)?.[0]?.endIndex || 1;
  const insertIndex = Math.max(endIndex - 1, 1);

  await googleRequest(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: insertIndex }, text: '\n' + text } }],
    }),
  });
  return { success: true };
}

module.exports = {
  listSpreadsheets,
  getSpreadsheet,
  readSheet,
  writeSheet,
  appendSheet,
  createSpreadsheet,
  listDocuments,
  getDocument,
  createDocument,
  appendToDocument,
};
