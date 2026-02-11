const { PrismaClient } = require('@prisma/client');
const { getApiKeys } = require('../utils/getApiKeys');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const prisma = new PrismaClient();

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Categorize outcome (same logic as callController)
const categorizeOutcome = (call) => {
  const reason = call.endedReason;

  const failedReasons = [
    'assistant-error', 'assistant-not-found', 'db-error', 'no-server-available',
    'pipeline-error-extra-function-failed', 'pipeline-error-first-message-failed',
    'pipeline-error-function-filler-failed', 'pipeline-error-function-failed',
    'pipeline-error-openai-llm-failed', 'pipeline-error-azure-openai-llm-failed',
    'pipeline-error-openai-voice-failed', 'pipeline-error-cartesia-voice-failed',
    'pipeline-error-eleven-labs-voice-failed', 'pipeline-error-deepgram-transcriber-failed',
    'pipeline-no-available-model', 'server-shutdown', 'twilio-failed-to-connect-call',
    'assistant-join-timed-out', 'customer-busy', 'customer-did-not-answer',
    'customer-did-not-give-microphone-permission', 'manually-canceled',
    'phone-call-provider-closed-websocket'
  ];

  if (failedReasons.includes(reason)) return 'failed';
  if (reason === 'voicemail') return 'voicemail';
  if (reason === 'assistant-forwarded-call') return 'transferred';

  const structured = call.analysis?.structuredData;
  if (structured) {
    const json = typeof structured === 'string'
      ? (() => { try { return JSON.parse(structured); } catch { return structured; } })()
      : structured;

    if (json.booked === true || json.appointmentBooked === true ||
        json.booking_status === 'booked' || json.outcome === 'booked') {
      return 'booked';
    }
    if (json.interested === false || json.not_interested === true ||
        json.outcome === 'not_interested') {
      return 'not_interested';
    }
  }

  const summary = (call.analysis?.summary || '').toLowerCase();
  if (summary.includes('appointment booked') || summary.includes('booking confirmed') ||
      summary.includes('scheduled an appointment') || summary.includes('successfully booked')) {
    return 'booked';
  }
  if (summary.includes('not interested') || summary.includes('declined') ||
      summary.includes('do not call')) {
    return 'not_interested';
  }

  const answeredReasons = [
    'customer-ended-call', 'assistant-ended-call', 'assistant-said-end-call-phrase',
    'silence-timed-out', 'exceeded-max-duration'
  ];
  if (answeredReasons.includes(reason)) return 'answered';

  return 'unknown';
};

// Download a file from URL to local path
const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    proto.get(url, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
};

// Build the public URL for our server
const getPublicBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.GHL_REDIRECT_URI) {
    try {
      const url = new URL(process.env.GHL_REDIRECT_URI);
      return url.origin;
    } catch {}
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
};

// Extract transcript text from VAPI transcript array
const extractTranscriptText = (transcript) => {
  if (!transcript) return null;
  if (typeof transcript === 'string') return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map(t => `${t.role === 'assistant' ? 'Agent' : 'Customer'}: ${t.message}`)
      .join('\n');
  }
  return null;
};

// Extract customer phone number from VAPI call data
const extractCustomerNumber = (call) => {
  return call.customer?.number || call.phoneNumber?.number || null;
};

/**
 * Handle VAPI webhook events
 * POST /api/vapi/events
 */
const handleEvent = async (req, res) => {
  try {
    // Verify VAPI webhook secret if configured
    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
    if (expectedSecret) {
      const receivedSecret = req.headers['x-vapi-secret'];
      if (receivedSecret !== expectedSecret) {
        console.warn('[VAPI Webhook] Invalid or missing x-vapi-secret header');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const payload = req.body;
    const messageType = payload.message?.type;

    console.log('[VAPI Webhook] Received event:', messageType);

    // Only process end-of-call-report
    if (messageType !== 'end-of-call-report') {
      return res.status(200).json({ ok: true });
    }

    const message = payload.message;
    const call = message.call || {};
    const vapiCallId = call.id;

    if (!vapiCallId) {
      console.error('[VAPI Webhook] No call ID in end-of-call-report');
      return res.status(200).json({ ok: true });
    }

    console.log(`[VAPI Webhook] Processing end-of-call-report for call ${vapiCallId}`);

    // Find the agent by VAPI assistant ID
    const assistantId = call.assistantId;
    let agent = null;
    let userId = null;

    if (assistantId) {
      agent = await prisma.agent.findFirst({
        where: { vapiId: assistantId },
        include: { user: { select: { id: true, outboundRate: true, inboundRate: true } } }
      });
      if (agent) {
        userId = agent.userId;
      }
    }

    if (!userId) {
      // Try to find from existing call log
      const existingLog = await prisma.callLog.findUnique({ where: { vapiCallId } });
      if (existingLog) {
        userId = existingLog.userId;
        if (!agent && existingLog.agentId) {
          agent = await prisma.agent.findUnique({ where: { id: existingLog.agentId } });
        }
      }
    }

    if (!userId) {
      console.error(`[VAPI Webhook] Could not find user for call ${vapiCallId}, assistantId=${assistantId}`);
      return res.status(200).json({ ok: true });
    }

    // 1. Download recording
    let localRecordingUrl = null;
    const vapiRecordingUrl = message.recordingUrl || call.recordingUrl;

    if (vapiRecordingUrl) {
      try {
        const ext = vapiRecordingUrl.includes('.mp3') ? '.mp3' : '.wav';
        const filename = `${vapiCallId}${ext}`;
        const destPath = path.join(recordingsDir, filename);

        await downloadFile(vapiRecordingUrl, destPath);

        const baseUrl = getPublicBaseUrl();
        localRecordingUrl = `${baseUrl}/api/recordings/${filename}`;
        console.log(`[VAPI Webhook] Recording saved: ${localRecordingUrl}`);
      } catch (dlError) {
        console.error(`[VAPI Webhook] Recording download failed:`, dlError.message);
      }
    }

    // 2. Extract transcript, summary, structured data
    const transcriptText = extractTranscriptText(message.transcript || call.artifact?.transcript);
    const summary = message.analysis?.summary || call.analysis?.summary || null;
    const structuredData = message.analysis?.structuredData || call.analysis?.structuredData || null;
    const endedReason = call.endedReason || null;
    const customerNumber = extractCustomerNumber(call);

    // 3. Calculate duration and billing
    const isOutbound = call.type === 'outboundPhoneCall';
    let durationSeconds = call.duration || call.durationSeconds || 0;
    if (!durationSeconds && call.startedAt && call.endedAt) {
      durationSeconds = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { outboundRate: true, inboundRate: true }
    });

    const rate = isOutbound ? (user?.outboundRate ?? 0.10) : (user?.inboundRate ?? 0.05);
    const durationMinutes = durationSeconds / 60;
    const cost = durationMinutes * rate;
    const outcome = categorizeOutcome(call);

    // 4. Update or create CallLog
    const existingLog = await prisma.callLog.findUnique({ where: { vapiCallId } });
    const callLogData = {
      durationSeconds,
      costCharged: cost,
      billed: true,
      outcome,
      recordingUrl: localRecordingUrl,
      transcript: transcriptText,
      summary,
      structuredData: structuredData ? (typeof structuredData === 'string' ? structuredData : JSON.stringify(structuredData)) : null,
      endedReason,
      customerNumber,
      ...(agent ? { agentId: agent.id } : {})
    };

    let callLog;
    if (existingLog) {
      callLog = await prisma.callLog.update({
        where: { id: existingLog.id },
        data: callLogData
      });
    } else {
      callLog = await prisma.callLog.create({
        data: {
          vapiCallId,
          userId,
          type: isOutbound ? 'outbound' : 'inbound',
          ...callLogData
        }
      });
    }

    // 5. Deduct credits
    if (cost > 0 && (!existingLog || !existingLog.billed || existingLog.costCharged === 0)) {
      await prisma.user.update({
        where: { id: userId },
        data: { vapiCredits: { decrement: cost } }
      });
      console.log(`[VAPI Webhook] Billed user ${userId}: $${cost.toFixed(4)}`);
    }

    // 6. Forward to user's webhook URL if configured
    if (agent) {
      const agentConfig = agent.config ? JSON.parse(agent.config) : {};
      const webhookUrl = agentConfig.serverUrl;

      if (webhookUrl) {
        const cleanPayload = {
          type: 'end-of-call-report',
          call: {
            id: callLog.id,
            type: isOutbound ? 'outbound' : 'inbound',
            duration: durationSeconds,
            outcome,
            customerNumber,
            endedReason,
            startedAt: call.startedAt || null,
            endedAt: call.endedAt || null
          },
          recording: localRecordingUrl ? { url: localRecordingUrl } : null,
          transcript: transcriptText,
          summary,
          structuredData: structuredData || null,
          agent: {
            id: agent.id,
            name: agent.name
          }
        };

        // Forward webhook asynchronously (don't block response to VAPI)
        const headers = { 'Content-Type': 'application/json' };
        if (agentConfig.serverUrlSecret) {
          headers['x-webhook-secret'] = agentConfig.serverUrlSecret;
        }

        fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(cleanPayload)
        }).then(response => {
          console.log(`[VAPI Webhook] Forwarded to user webhook ${webhookUrl}: ${response.status}`);
        }).catch(err => {
          console.error(`[VAPI Webhook] Failed to forward to ${webhookUrl}:`, err.message);
        });
      }
    }

    console.log(`[VAPI Webhook] Processed call ${vapiCallId}: outcome=${outcome}, duration=${durationSeconds}s, cost=$${cost.toFixed(4)}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[VAPI Webhook] Error:', error);
    // Always return 200 to VAPI so it doesn't retry
    return res.status(200).json({ ok: true });
  }
};

module.exports = { handleEvent };
