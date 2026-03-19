const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// ── Cached Access Token ──
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

// ── Helper: authenticated request ──
async function paypalRequest(method, path, body = null) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${PAYPAL_BASE}${path}`, opts);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`PayPal ${method} ${path} failed: ${res.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// ── Catalog Products ──

async function createCatalogProduct(name, description) {
  return paypalRequest('POST', '/v1/catalogs/products', {
    name,
    description: description || name,
    type: 'SERVICE',
    category: 'SOFTWARE',
  });
}

// ── Billing Plans ──

function buildIntervalUnit(cycle) {
  switch (cycle) {
    case 'monthly': return { interval_unit: 'MONTH', interval_count: 1 };
    case 'quarterly': return { interval_unit: 'MONTH', interval_count: 3 };
    case 'annual': return { interval_unit: 'YEAR', interval_count: 1 };
    default: return { interval_unit: 'MONTH', interval_count: 1 };
  }
}

async function createBillingPlan(paypalProductId, name, cycle, price) {
  const { interval_unit, interval_count } = buildIntervalUnit(cycle);

  return paypalRequest('POST', '/v1/billing/plans', {
    product_id: paypalProductId,
    name,
    billing_cycles: [
      {
        frequency: { interval_unit, interval_count },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // infinite
        pricing_scheme: {
          fixed_price: {
            value: price.toFixed(2),
            currency_code: 'USD',
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      payment_failure_threshold: 3,
    },
  });
}

// ── Subscriptions ──

async function createSubscription(planId, returnUrl, cancelUrl, customId, priceOverride = null) {
  const body = {
    plan_id: planId,
    application_context: {
      brand_name: 'Sword AI Solutions',
      return_url: returnUrl,
      cancel_url: cancelUrl,
      user_action: 'SUBSCRIBE_NOW',
    },
    custom_id: customId,
  };

  // Price override for discounts (keeps single plan, adjusts per-user)
  if (priceOverride !== null) {
    body.plan = {
      billing_cycles: [
        {
          sequence: 1,
          pricing_scheme: {
            fixed_price: {
              value: priceOverride.toFixed(2),
              currency_code: 'USD',
            },
          },
        },
      ],
    };
  }

  return paypalRequest('POST', '/v1/billing/subscriptions', body);
}

async function getSubscriptionDetails(subscriptionId) {
  return paypalRequest('GET', `/v1/billing/subscriptions/${subscriptionId}`);
}

async function cancelSubscription(subscriptionId, reason = 'Cancelled by user') {
  const token = await getAccessToken();
  const res = await fetch(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }
  );
  // 204 = success (no content)
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`PayPal cancel subscription failed: ${res.status} ${text}`);
  }
  return true;
}

// ── One-time Orders ──

async function createOrder(amount, description, customId) {
  return paypalRequest('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amount.toFixed(2),
        },
        description,
        custom_id: customId,
      },
    ],
    application_context: {
      brand_name: 'Sword AI Solutions',
    },
  });
}

async function captureOrder(orderId) {
  return paypalRequest('POST', `/v2/checkout/orders/${orderId}/capture`);
}

// ── Webhook Verification ──

async function verifyWebhookSignature(headers, body) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn('PAYPAL_WEBHOOK_ID not set — skipping verification');
    return true;
  }

  try {
    const result = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: body,
    });
    return result.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return false;
  }
}

module.exports = {
  getAccessToken,
  createCatalogProduct,
  createBillingPlan,
  createSubscription,
  getSubscriptionDetails,
  cancelSubscription,
  createOrder,
  captureOrder,
  verifyWebhookSignature,
};
