const axios = require('axios');
const { URL } = require('url');

// Block private/internal IPs to prevent SSRF
const isPrivateIP = (hostname) => {
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    // 10.x.x.x
    if (parts[0] === 10) return true;
    // 172.16-31.x.x
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.x.x
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.x.x.x
    if (parts[0] === 127) return true;
    // 0.x.x.x
    if (parts[0] === 0) return true;
    // 169.254.x.x (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
  }
  // Block localhost variants
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  return false;
};

exports.testRequest = async (req, res) => {
  try {
    const { method, url, headers, body } = req.body;

    if (!url || !method) {
      return res.status(400).json({ error: 'URL and method are required' });
    }

    // Validate URL format
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only HTTP and HTTPS protocols are allowed' });
    }

    // Block private IPs (SSRF protection)
    if (isPrivateIP(parsed.hostname)) {
      return res.status(400).json({ error: 'Requests to private/internal addresses are not allowed' });
    }

    const startTime = Date.now();

    // Build request config
    const config = {
      method: method.toLowerCase(),
      url,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true, // Accept any status code
      headers: headers || {},
    };

    // Only attach body for methods that support it
    if (['post', 'put', 'patch'].includes(config.method) && body !== undefined) {
      config.data = body;
    }

    const response = await axios(config);
    const duration = Date.now() - startTime;

    // Truncate large response bodies
    let responseBody = response.data;
    const MAX_BODY_SIZE = 100 * 1024; // 100KB
    if (typeof responseBody === 'string' && responseBody.length > MAX_BODY_SIZE) {
      responseBody = responseBody.substring(0, MAX_BODY_SIZE) + '\n...[truncated]';
    } else if (typeof responseBody === 'object') {
      const serialized = JSON.stringify(responseBody);
      if (serialized.length > MAX_BODY_SIZE) {
        responseBody = serialized.substring(0, MAX_BODY_SIZE) + '\n...[truncated]';
      }
    }

    res.json({
      request: {
        method: method.toUpperCase(),
        url,
        headers: config.headers,
        body: config.data,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: responseBody,
      },
      duration,
    });
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timed out (30s limit)' });
    }
    if (error.code === 'ENOTFOUND') {
      return res.status(400).json({ error: `DNS lookup failed for host: ${error.hostname}` });
    }
    if (error.code === 'ECONNREFUSED') {
      return res.status(400).json({ error: 'Connection refused by the target server' });
    }
    res.status(500).json({ error: error.message || 'Failed to send request' });
  }
};
