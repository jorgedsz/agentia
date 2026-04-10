const https = require('https');

function makeRequest(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telnyx.com',
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('INVALID_CREDENTIALS'));
        if (res.statusCode !== 200) return reject(new Error(`Telnyx API returned ${res.statusCode}`));
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse Telnyx response'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Telnyx request timed out')); });
    req.end();
  });
}

/**
 * Verify Telnyx credentials by fetching a single phone number.
 */
async function verifyCredentials(apiKey) {
  await makeRequest('/v2/phone_numbers?page[size]=1', apiKey);
  return { valid: true };
}

/**
 * List phone numbers owned by a Telnyx account.
 */
async function listPhoneNumbers(apiKey) {
  const json = await makeRequest('/v2/phone_numbers?page[size]=250', apiKey);
  return (json.data || []).map((n) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.connection_name || n.phone_number,
    sid: n.id,
    status: n.status,
  }));
}

module.exports = { verifyCredentials, listPhoneNumbers };
