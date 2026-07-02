const { decrypt } = require('../utils/encryption');

/**
 * Log a message from an external agent (outside the app) into Messages Logs and
 * charge the account's credits. Authenticated by the account's trigger API key.
 *
 * POST /api/messages/log
 * Body: {
 *   clientId,            // account (user) id
 *   apiKey,              // the account's trigger API key
 *   input | message,     // the incoming user message (required)
 *   output | response,   // the agent's reply (optional)
 *   agentId?,            // groups messages in logs/analytics (default "external")
 *   agentName?,          // display name (default "External Agent")
 *   sessionId?, contactId?, contactName?,
 *   cost?                // $ to charge; defaults to the account's per-message price or $0.01
 * }
 */
const logExternalMessage = async (req, res) => {
  try {
    const {
      clientId, apiKey,
      input, message, output, response,
      agentId, agentName, sessionId, contactId, contactName, cost,
    } = req.body || {};

    const inputMessage = input ?? message;
    const outputMessage = output ?? response ?? null;

    if (!clientId || !apiKey) {
      return res.status(401).json({ success: false, error: 'clientId and apiKey are required' });
    }
    if (!inputMessage) {
      return res.status(400).json({ success: false, error: 'input (message) is required' });
    }

    const user = await req.prisma.user.findUnique({ where: { id: parseInt(clientId) } });
    if (!user) return res.status(404).json({ success: false, error: `Client not found (id ${clientId})` });

    if (!user.triggerApiKey) {
      return res.status(401).json({ success: false, error: 'No API key configured for this account. Generate one in Account Settings.' });
    }
    let storedKey = null;
    try { storedKey = decrypt(user.triggerApiKey); } catch { /* invalid */ }
    if (apiKey !== storedKey) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (user.messagesPaused) {
      return res.status(403).json({ success: false, error: 'Messages are currently paused for this account.' });
    }

    // Charge: explicit cost > per-account override > default $0.01.
    let charge = parseFloat(cost);
    if (!Number.isFinite(charge) || charge < 0) {
      charge = (typeof user.chatbotMessagePrice === 'number' && user.chatbotMessagePrice >= 0)
        ? user.chatbotMessagePrice
        : 0.01;
    }

    // Deduct credits, then log the message so it shows in Messages Logs.
    await req.prisma.user.update({ where: { id: user.id }, data: { vapiCredits: { decrement: charge } } });

    const logged = await req.prisma.chatbotMessage.create({
      data: {
        chatbotId: agentId ? String(agentId) : 'external',
        chatbotName: agentName || 'External Agent',
        userId: user.id,
        sessionId: sessionId || 'default',
        contactId: contactId || null,
        contactName: contactName || null,
        inputMessage: String(inputMessage),
        outputMessage: outputMessage != null ? String(outputMessage) : null,
        costCharged: charge,
        status: 'success',
      },
    });

    const refreshed = await req.prisma.user.findUnique({ where: { id: user.id }, select: { vapiCredits: true } });
    res.status(201).json({
      success: true,
      messageId: logged.id,
      charged: charge,
      remainingCredits: refreshed?.vapiCredits ?? null,
    });
  } catch (error) {
    console.error('Error logging external message:', error.message);
    res.status(500).json({ success: false, error: 'Failed to log message' });
  }
};

module.exports = { logExternalMessage };
