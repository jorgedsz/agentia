const { PrismaClient } = require('@prisma/client');
const { getApiKeys } = require('../utils/getApiKeys');
const { encryptPHI, encryptFile } = require('../utils/phiEncryption');
const { getAgentRate } = require('../utils/pricingUtils');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { getValidToken, ghlRequest, findGhlConnection } = require('./ghlController');

const prisma = new PrismaClient();

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Categorize outcome (same logic as callController)
const categorizeOutcome = (call, overrideReason) => {
  const reason = overrideReason || call.endedReason;

  const noAnswerReasons = [
    'customer-did-not-answer', 'voicemail', 'customer-busy'
  ];
  if (noAnswerReasons.includes(reason)) return 'no_answer';

  const failedReasons = [
    'assistant-error', 'assistant-not-found', 'db-error', 'no-server-available',
    'pipeline-error-extra-function-failed', 'pipeline-error-first-message-failed',
    'pipeline-error-function-filler-failed', 'pipeline-error-function-failed',
    'pipeline-error-openai-llm-failed', 'pipeline-error-azure-openai-llm-failed',
    'pipeline-error-openai-voice-failed', 'pipeline-error-cartesia-voice-failed',
    'pipeline-error-eleven-labs-voice-failed', 'pipeline-error-deepgram-transcriber-failed',
    'pipeline-no-available-model', 'server-shutdown', 'twilio-failed-to-connect-call',
    'assistant-join-timed-out',
    'customer-did-not-give-microphone-permission', 'manually-canceled',
    'phone-call-provider-closed-websocket'
  ];

  if (failedReasons.includes(reason)) return 'failed';
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

  console.log(`[Outcome] Unrecognized endedReason: "${reason}" — returning unknown`);
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
 * Process GHL CRM actions after a call (tags + pipeline)
 * Fire-and-forget — errors are logged but never propagated.
 */
const processGhlCrmActions = async (userId, agentConfig, outcome, customerNumber, callData) => {
  try {
    const ghlCrmConfig = agentConfig?.ghlCrmConfig;
    if (!ghlCrmConfig?.enabled) {
      console.log(`[GHL CRM] Not enabled for user ${userId}`);
      return;
    }
    console.log(`[GHL CRM] Processing: user=${userId}, outcome=${outcome}, phone=${customerNumber}`);

    // Find GHL integration (checks GHLIntegration + CalendarIntegration)
    const conn = await findGhlConnection(userId, prisma);
    if (!conn) {
      console.log(`[GHL CRM] No GHL integration found for user ${userId}`);
      return;
    }

    const { token, locationId } = conn;

    if (!locationId) {
      console.log(`[GHL CRM] No locationId for user ${userId}`);
      return;
    }

    // --- Find or create contact by phone number ---
    let contactId = null;
    let contactName = null;
    if (customerNumber) {
      try {
        const searchRes = await ghlRequest(
          `/contacts/search`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              locationId,
              pageLimit: 1,
              filters: [{
                field: 'phone',
                operator: 'eq',
                value: customerNumber
              }]
            })
          }
        );
        if (searchRes.contacts && searchRes.contacts.length > 0) {
          contactId = searchRes.contacts[0].id;
          const c = searchRes.contacts[0];
          contactName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || null;
        } else {
          const createRes = await ghlRequest('/contacts', token, {
            method: 'POST',
            body: JSON.stringify({ locationId, phone: customerNumber, name: customerNumber })
          });
          contactId = createRes.contact?.id;
        }
      } catch (contactErr) {
        console.error('[GHL CRM] Contact search/create error:', contactErr.message);
        return;
      }
    }

    if (!contactId) {
      console.log('[GHL CRM] No contact ID — skipping CRM actions');
      return;
    }

    // --- Tag management ---
    const tagMapping = ghlCrmConfig.tagMapping || {};
    const outcomeTags = tagMapping[outcome] || [];

    if (ghlCrmConfig.deleteOldTags || outcomeTags.length > 0) {
      try {
        // Collect all managed tags (every tag across all outcomes)
        const allManagedTags = new Set();
        for (const tags of Object.values(tagMapping)) {
          if (Array.isArray(tags)) tags.forEach(t => allManagedTags.add(t));
        }

        // Get contact's current tags
        const contactRes = await ghlRequest(`/contacts/${contactId}`, token);
        const currentTags = contactRes.contact?.tags || [];

        let newTags;
        if (ghlCrmConfig.deleteOldTags) {
          // Remove all managed tags, then add current outcome's tags
          newTags = currentTags.filter(t => !allManagedTags.has(t));
          newTags.push(...outcomeTags.filter(t => !newTags.includes(t)));
        } else {
          // Just add outcome tags without removing anything
          newTags = [...currentTags];
          outcomeTags.forEach(t => { if (!newTags.includes(t)) newTags.push(t); });
        }

        await ghlRequest(`/contacts/${contactId}`, token, {
          method: 'PUT',
          body: JSON.stringify({ tags: newTags })
        });
        console.log(`[GHL CRM] Updated tags for contact ${contactId}: [${newTags.join(', ')}]`);
      } catch (tagErr) {
        console.error('[GHL CRM] Tag update error:', tagErr.message);
      }
    }

    // --- Pipeline / Opportunity management ---
    const pipelineId = ghlCrmConfig.pipelineId;
    const pipelineMapping = ghlCrmConfig.pipelineMapping || {};
    const stageId = pipelineMapping[outcome];
    let opportunityId = null;

    if (pipelineId && stageId) {
      try {
        // Search for existing opportunity in this pipeline for this contact
        const oppSearch = await ghlRequest(
          `/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&contact_id=${contactId}`,
          token
        );

        const existingOpp = (oppSearch.opportunities || []).find(o => o.pipelineId === pipelineId);

        if (existingOpp) {
          opportunityId = existingOpp.id;
          // Update stage
          await ghlRequest(`/opportunities/${existingOpp.id}`, token, {
            method: 'PUT',
            body: JSON.stringify({ pipelineStageId: stageId })
          });
          console.log(`[GHL CRM] Updated opportunity ${existingOpp.id} to stage ${stageId}`);
        } else {
          // Create new opportunity with contact name
          const oppName = contactName || customerNumber || `Call - ${outcome}`;
          const createRes = await ghlRequest('/opportunities/', token, {
            method: 'POST',
            body: JSON.stringify({
              locationId,
              pipelineId,
              pipelineStageId: stageId,
              contactId,
              name: oppName,
              status: 'open'
            })
          });
          opportunityId = createRes.opportunity?.id || createRes.id || null;
          console.log(`[GHL CRM] Created opportunity "${oppName}" for contact ${contactId} in pipeline ${pipelineId}`);
        }
      } catch (oppErr) {
        console.error('[GHL CRM] Opportunity error:', oppErr.message);
      }
    }

    // --- Assign User per stage ---
    const userMapping = ghlCrmConfig.userMapping || {};
    const assignUserId = userMapping[outcome];

    if (assignUserId && opportunityId) {
      try {
        await ghlRequest(`/opportunities/${opportunityId}`, token, {
          method: 'PUT',
          body: JSON.stringify({ assignedTo: assignUserId })
        });
        console.log(`[GHL CRM] Assigned user ${assignUserId} to opportunity ${opportunityId}`);
      } catch (assignErr) {
        console.error('[GHL CRM] User assignment error:', assignErr.message);
      }
    }

    // --- Create Contact Note per stage ---
    const noteMapping = ghlCrmConfig.noteMapping || {};
    const noteConfig = noteMapping[outcome];

    if (noteConfig && noteConfig.type && noteConfig.type !== 'none') {
      try {
        let noteText = '';

        if (noteConfig.type === 'manual') {
          noteText = noteConfig.text || '';
        } else if (noteConfig.type === 'ai') {
          const summaryText = callData?.summary || '';
          noteText = `AI Note (${outcome}): ${summaryText || 'No summary available'}`;
        }

        if (noteText) {
          const noteBody = { body: noteText };
          if (assignUserId) {
            noteBody.userId = assignUserId;
          }
          await ghlRequest(`/contacts/${contactId}/notes`, token, {
            method: 'POST',
            body: JSON.stringify(noteBody)
          });
          console.log(`[GHL CRM] Created ${noteConfig.type} note on contact ${contactId}`);
        }
      } catch (noteErr) {
        console.error('[GHL CRM] Note creation error:', noteErr.message);
      }
    }
  } catch (err) {
    console.error('[GHL CRM] Unexpected error:', err.message);
  }
};

/**
 * Trigger a linked chatbot after a voice call ends (fire-and-forget).
 * Sends call context (summary, outcome, customer number, structured data) to the chatbot webhook.
 */
const triggerChatbotPostCall = async (chatbotTriggerConfig, callData, prisma) => {
  try {
    if (!chatbotTriggerConfig?.enabled || !chatbotTriggerConfig.chatbotId) return;

    const { outcome, summary, customerNumber, structuredData, agentName, vapiCallId } = callData;

    // Check trigger condition
    const triggerOn = chatbotTriggerConfig.triggerOn || 'always';
    let shouldTrigger = false;

    if (triggerOn === 'always') {
      shouldTrigger = true;
    } else if (triggerOn === 'outcomes') {
      const configuredOutcomes = chatbotTriggerConfig.outcomes || [];
      shouldTrigger = configuredOutcomes.includes(outcome);
    } else if (triggerOn === 'structuredData') {
      const field = chatbotTriggerConfig.structuredDataField;
      const expectedValue = chatbotTriggerConfig.structuredDataValue;
      if (field && structuredData) {
        const parsed = typeof structuredData === 'string'
          ? (() => { try { return JSON.parse(structuredData); } catch { return {}; } })()
          : structuredData;
        shouldTrigger = String(parsed[field]) === String(expectedValue);
      }
    }

    if (!shouldTrigger) {
      console.log(`[Chatbot Trigger] Condition not met (triggerOn=${triggerOn}, outcome=${outcome})`);
      return;
    }

    const fire = async () => {
      // Validate chatbot exists and is active
      const chatbot = await prisma.chatbot.findUnique({ where: { id: chatbotTriggerConfig.chatbotId } });
      if (!chatbot) {
        console.error(`[Chatbot Trigger] Chatbot ${chatbotTriggerConfig.chatbotId} not found`);
        return;
      }
      if (!chatbot.isActive) {
        console.log(`[Chatbot Trigger] Chatbot ${chatbot.id} is not active — skipping`);
        return;
      }
      if (!chatbot.n8nWebhookUrl) {
        console.log(`[Chatbot Trigger] Chatbot ${chatbot.id} has no workflow — skipping`);
        return;
      }

      // Build context message
      const message = chatbotTriggerConfig.messageTemplate
        ? chatbotTriggerConfig.messageTemplate
            .replace(/\{\{customerNumber\}\}/g, customerNumber || 'unknown')
            .replace(/\{\{outcome\}\}/g, outcome || 'unknown')
            .replace(/\{\{summary\}\}/g, summary || 'No summary available')
            .replace(/\{\{agentName\}\}/g, agentName || 'Voice Agent')
        : `Post-call follow-up for ${customerNumber || 'unknown'}. Call outcome: ${outcome || 'unknown'}. Summary: ${summary || 'No summary available'}. Agent: ${agentName || 'Voice Agent'}. Please send an appropriate follow-up message to the customer.`;

      const parsedSD = typeof structuredData === 'string'
        ? (() => { try { return JSON.parse(structuredData); } catch { return null; } })()
        : structuredData;

      const body = {
        message,
        sessionId: `call-${vapiCallId}`,
        contactId: customerNumber || '',
        variables: {
          customerNumber: customerNumber || '',
          outcome: outcome || '',
          summary: summary || '',
          agentName: agentName || '',
          structuredData: parsedSD || {}
        }
      };

      const resp = await fetch(chatbot.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      console.log(`[Chatbot Trigger] Sent to chatbot ${chatbot.id}: ${resp.status}`);
    };

    const delayMinutes = chatbotTriggerConfig.delayMinutes || 0;
    if (delayMinutes > 0) {
      console.log(`[Chatbot Trigger] Scheduling in ${delayMinutes} min for call ${vapiCallId}`);
      setTimeout(() => fire().catch(err => console.error('[Chatbot Trigger] Delayed fire error:', err.message)), delayMinutes * 60 * 1000);
    } else {
      fire().catch(err => console.error('[Chatbot Trigger] Fire error:', err.message));
    }
  } catch (err) {
    console.error('[Chatbot Trigger] Unexpected error:', err.message);
  }
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
        const tempFilename = `${vapiCallId}${ext}`;
        const tempPath = path.join(recordingsDir, tempFilename);

        await downloadFile(vapiRecordingUrl, tempPath);

        // Encrypt the recording file on disk
        const encFilename = `${vapiCallId}${ext}.enc`;
        const encPath = path.join(recordingsDir, encFilename);
        await encryptFile(tempPath, encPath);
        fs.unlinkSync(tempPath); // remove plaintext file

        const baseUrl = getPublicBaseUrl();
        localRecordingUrl = `${baseUrl}/api/recordings/public/${vapiCallId}`;
        console.log(`[VAPI Webhook] Encrypted recording saved: ${localRecordingUrl}`);
      } catch (dlError) {
        console.error(`[VAPI Webhook] Recording download failed:`, dlError.message);
      }
    }

    // 2. Extract transcript, summary, structured data
    const transcriptText = extractTranscriptText(message.transcript || call.artifact?.transcript);
    const summary = message.analysis?.summary || call.analysis?.summary || null;
    const structuredData = message.analysis?.structuredData || call.analysis?.structuredData || null;
    const endedReason = message.endedReason || call.endedReason || null;
    const customerNumber = extractCustomerNumber(call);

    console.log(`Call ${vapiCallId}: endedReason=${endedReason}, message.endedReason=${message.endedReason}, call.endedReason=${call.endedReason}`);

    // 3. Calculate duration and billing
    const isOutbound = call.type === 'outboundPhoneCall';
    let durationSeconds = call.duration || call.durationSeconds || message.durationSeconds || message.duration || 0;
    if (!durationSeconds && call.startedAt && call.endedAt) {
      durationSeconds = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
    }

    // Try dynamic per-agent pricing first, fallback to legacy per-user rates
    let rate;
    const dynamicRate = agent ? await getAgentRate(prisma, agent, userId) : null;

    if (dynamicRate) {
      rate = dynamicRate.totalRate;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { outboundRate: true, inboundRate: true }
      });
      rate = isOutbound ? (user?.outboundRate ?? 0.10) : (user?.inboundRate ?? 0.05);
    }

    const durationMinutes = durationSeconds / 60;
    const cost = durationMinutes * rate;
    const outcome = categorizeOutcome(call, endedReason);

    // 4. Update or create CallLog (encrypt PHI fields before DB write)
    const existingLog = await prisma.callLog.findUnique({ where: { vapiCallId } });
    const callLogData = encryptPHI({
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
    });

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

    // 6. GHL CRM post-call actions (fire-and-forget)
    if (agent) {
      const agentConfig = agent.config ? JSON.parse(agent.config) : {};

      processGhlCrmActions(userId, agentConfig, outcome, customerNumber, {
        summary,
        structuredData,
        transcript: transcriptText
      }).catch(err =>
        console.error('[GHL CRM] processGhlCrmActions failed:', err.message)
      );

      // 6b. Schedule follow-up if configured
      const followUpController = require('./followUpController');
      followUpController.scheduleFollowUp(prisma, callLog, agent, outcome, summary).catch(err =>
        console.error('[Follow-Up] scheduleFollowUp failed:', err.message)
      );

      // 6c. Trigger chatbot post-call if configured
      triggerChatbotPostCall(agentConfig.chatbotTriggerConfig, {
        outcome,
        summary,
        customerNumber,
        structuredData,
        agentName: agent.name,
        vapiCallId
      }, prisma);

      // 7. Forward to user's webhook URL if configured
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
