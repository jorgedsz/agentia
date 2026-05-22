/**
 * Central failure reporter.
 *
 * Posts every agent/server failure (voice calls, chatbots, tools, unhandled
 * server errors) to a single webhook configured by the platform owner in
 * PlatformSettings.failureWebhookUrl (encrypted).
 *
 * Design rules:
 *  - Fire-and-forget: callers don't await and never get an exception. A problem
 *    delivering the webhook must NEVER break the flow that detected the failure.
 *  - No re-reporting: errors inside this module are only console.error'd, never
 *    fed back through reportFailure(), so a bad webhook URL can't cause a loop.
 */
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { decrypt } = require('../utils/encryption');

const prisma = new PrismaClient();

// Resolve the decrypted webhook URL. Returns null when not configured.
async function getFailureWebhookUrl(prismaClient) {
  const db = prismaClient || prisma;
  try {
    const settings = await db.platformSettings.findFirst({
      select: { failureWebhookUrl: true }
    });
    if (!settings || !settings.failureWebhookUrl) return null;
    return decrypt(settings.failureWebhookUrl) || null;
  } catch (e) {
    console.error('[failureReporter] could not read failureWebhookUrl:', e.message);
    return null;
  }
}

/**
 * Report a failure to the central webhook. Safe to call without awaiting.
 *
 * @param {Object} failure
 * @param {string} failure.type      - 'voice_call' | 'chatbot' | 'tool' | 'server_error'
 * @param {Object} [failure.client]  - { userId, email, role }
 * @param {Object} [failure.agent]   - { id, name, type } (type: 'voice' | 'chatbot')
 * @param {string} [failure.reason]  - short machine reason (endedReason, HTTP status, error name)
 * @param {string} [failure.detail]  - human-readable description
 * @param {Object} [failure.context] - extra data (callId, messageId, path, etc.)
 * @param {Object} [prismaClient]    - optional existing prisma instance to reuse
 */
async function reportFailure(failure = {}, prismaClient) {
  try {
    const url = await getFailureWebhookUrl(prismaClient);
    if (!url) return; // not configured — no-op

    const payload = {
      type: failure.type || 'unknown',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      client: failure.client || null,
      agent: failure.agent || null,
      reason: failure.reason || null,
      detail: failure.detail || null,
      context: failure.context || null
    };

    await axios.post(url, payload, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Swallow on purpose — reporting must never break the caller, and we never
    // re-report to avoid an infinite failure→report→failure loop.
    console.error('[failureReporter] failed to deliver failure webhook:', err.message);
  }
}

module.exports = { reportFailure };
