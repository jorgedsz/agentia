const https = require('https');

/**
 * Verify Vonage credentials by checking account balance.
 */
async function verifyCredentials(apiKey, apiSecret) {
  return new Promise((resolve, reject) => {
    const url = `https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('INVALID_CREDENTIALS'));
        if (res.statusCode !== 200) return reject(new Error(`Vonage API returned ${res.statusCode}`));
        try {
          const json = JSON.parse(data);
          if (json['error-code'] === '401') return reject(new Error('INVALID_CREDENTIALS'));
          resolve({ balance: json.value, autoReload: json.autoReload });
        } catch (e) {
          reject(new Error('Failed to parse Vonage response'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vonage request timed out')); });
  });
}

/**
 * List phone numbers owned by a Vonage account.
 */
async function listPhoneNumbers(apiKey, apiSecret) {
  return new Promise((resolve, reject) => {
    const url = `https://rest.nexmo.com/account/numbers?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}&size=100`;
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('INVALID_CREDENTIALS'));
        if (res.statusCode !== 200) return reject(new Error(`Vonage API returned ${res.statusCode}`));
        try {
          const json = JSON.parse(data);
          const numbers = (json.numbers || []).map((n) => ({
            phoneNumber: `+${n.msisdn}`,
            friendlyName: n.msisdn,
            sid: n.msisdn,
            country: n.country,
            type: n.type,
          }));
          resolve(numbers);
        } catch (e) {
          reject(new Error('Failed to parse Vonage response'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vonage request timed out')); });
  });
}

module.exports = { verifyCredentials, listPhoneNumbers };
