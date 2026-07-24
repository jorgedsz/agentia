/**
 * External phone-switch API.
 *
 * Lets a client move one of its phone numbers between its own agents from an
 * outside system (no dashboard login). Only agents the account explicitly marked
 * as switchable (Agent.phoneSwitchEnabled) can be targeted, so the API can never
 * point a number at an unintended agent.
 *
 *   GET  /api/phone-switch/agents?clientId=..&apiKey=..
 *   POST /api/phone-switch   { clientId, apiKey, agentId, phoneNumberId? }
 *
 * Auth is the account's trigger API key (same credential as /api/call/trigger).
 */

const { decrypt } = require('../utils/encryption');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const vapiService = require('../services/vapiService');

// Resolve + authenticate the caller from clientId + apiKey (query or body).
// Returns the user row, or sends the error response and returns null.
async function authenticate(req, res) {
  const clientId = req.body?.clientId ?? req.query?.clientId;
  const apiKey = req.body?.apiKey ?? req.query?.apiKey;

  if (!clientId || !apiKey) {
    res.status(401).json({ success: false, error: 'clientId and apiKey are required' });
    return null;
  }

  const user = await req.prisma.user.findUnique({ where: { id: parseInt(clientId) } });
  if (!user) {
    res.status(404).json({ success: false, error: `Client not found (id ${clientId})` });
    return null;
  }
  if (!user.triggerApiKey) {
    res.status(401).json({ success: false, error: 'No API key configured for this account. Generate one in Account Settings.' });
    return null;
  }
  let storedKey = null;
  try { storedKey = decrypt(user.triggerApiKey); } catch { /* invalid */ }
  if (apiKey !== storedKey) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return null;
  }
  return user;
}

// Phone numbers owned by this account (via their telephony credentials).
async function getAccountPhoneNumbers(prisma, userId) {
  return prisma.phoneNumber.findMany({
    where: { telephonyCredential: { userId } },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' },
  });
}

/**
 * GET /api/phone-switch/agents
 * Returns the agents this account allows the API to switch to, plus its phone
 * numbers and which agent each one currently points at.
 */
const listSwitchableAgents = async (req, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user) return;

    const agents = await req.prisma.agent.findMany({
      where: { userId: user.id, phoneSwitchEnabled: true },
      select: { id: true, name: true, agentType: true, vapiId: true },
      orderBy: { name: 'asc' },
    });

    const numbers = await getAccountPhoneNumbers(req.prisma, user.id);

    res.json({
      success: true,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        agentType: a.agentType,
        connected: !!a.vapiId,
      })),
      phoneNumbers: numbers.map(n => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        currentAgentId: n.agentId,
        currentAgentName: n.agent?.name || null,
      })),
    });
  } catch (error) {
    console.error('[PhoneSwitch] list error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list switchable agents' });
  }
};

/**
 * POST /api/phone-switch
 * Body: { clientId, apiKey, agentId, phoneNumberId? }
 * Points the phone number at the given agent. phoneNumberId is optional when the
 * account has exactly one number. Passing agentId: null unassigns the number.
 */
const switchPhoneAgent = async (req, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user) return;

    const { agentId, phoneNumberId, phoneNumber: phoneNumberInput } = req.body || {};

    // Resolve the target phone number.
    const numbers = await getAccountPhoneNumbers(req.prisma, user.id);
    if (numbers.length === 0) {
      return res.status(404).json({ success: false, error: 'This account has no phone numbers' });
    }
    let target = null;
    if (phoneNumberId != null) {
      target = numbers.find(n => n.id === parseInt(phoneNumberId)) || null;
    } else if (phoneNumberInput) {
      const wanted = String(phoneNumberInput).replace(/\s+/g, '');
      target = numbers.find(n => n.phoneNumber.replace(/\s+/g, '') === wanted) || null;
    } else if (numbers.length === 1) {
      target = numbers[0];
    }
    if (!target) {
      return res.status(400).json({
        success: false,
        error: numbers.length > 1
          ? 'phoneNumberId (or phoneNumber) is required — this account has more than one number'
          : 'Phone number not found for this account',
        phoneNumbers: numbers.map(n => ({ id: n.id, phoneNumber: n.phoneNumber })),
      });
    }

    // Resolve the target agent — must belong to this account AND be switchable.
    let agent = null;
    if (agentId) {
      agent = await req.prisma.agent.findUnique({ where: { id: String(agentId) } });
      if (!agent || agent.userId !== user.id) {
        return res.status(404).json({ success: false, error: 'Agent not found for this account' });
      }
      if (!agent.phoneSwitchEnabled) {
        return res.status(403).json({ success: false, error: 'This agent is not enabled for phone switching. Enable it in the agent settings.' });
      }
    }

    // Mirror the change to VAPI so calls actually route to the new assistant.
    const vapiKey = await getVapiKeyForUser(req.prisma, user.id);
    if (vapiKey) vapiService.setApiKey(vapiKey);
    if (vapiService.isConfigured() && target.vapiPhoneNumberId) {
      try {
        if (agent?.vapiId) {
          await vapiService.assignPhoneToAssistant(target.vapiPhoneNumberId, agent.vapiId);
        } else if (!agentId) {
          await vapiService.unassignPhoneFromAssistant(target.vapiPhoneNumberId);
        }
      } catch (vapiError) {
        console.error('[PhoneSwitch] VAPI assignment failed:', vapiError.message);
        return res.status(502).json({ success: false, error: `VAPI assignment failed: ${vapiError.message}` });
      }
    }

    const updated = await req.prisma.phoneNumber.update({
      where: { id: target.id },
      data: { agentId: agentId ? String(agentId) : null },
      include: { agent: { select: { id: true, name: true } } },
    });

    console.log(`[PhoneSwitch] user ${user.id}: ${updated.phoneNumber} → ${updated.agent?.name || 'unassigned'}`);
    res.json({
      success: true,
      phoneNumber: { id: updated.id, phoneNumber: updated.phoneNumber },
      agent: updated.agent ? { id: updated.agent.id, name: updated.agent.name } : null,
      message: updated.agent ? `Número asignado a ${updated.agent.name}` : 'Número desasignado',
    });
  } catch (error) {
    console.error('[PhoneSwitch] switch error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to switch phone number' });
  }
};

// ── OWNER admin: curate which of an account's agents are switchable ──

/**
 * GET /api/phone-switch/admin/:userId/agents  (OWNER)
 * All of the account's agents (with the switchable flag) + its phone numbers, so
 * the OWNER can pick the specific agents the phone-switch API may use.
 */
const adminListAccountAgents = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const account = await req.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const agents = await req.prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true, agentType: true, vapiId: true, phoneSwitchEnabled: true },
      orderBy: { name: 'asc' },
    });
    const numbers = await getAccountPhoneNumbers(req.prisma, userId);

    res.json({
      account: { id: account.id, name: account.name, email: account.email },
      agents,
      phoneNumbers: numbers.map(n => ({ id: n.id, phoneNumber: n.phoneNumber, currentAgentName: n.agent?.name || null })),
    });
  } catch (error) {
    console.error('[PhoneSwitch] admin list error:', error.message);
    res.status(500).json({ error: 'Failed to load account agents' });
  }
};

/**
 * PUT /api/phone-switch/admin/:userId/agents  (OWNER)
 * Body: { agentIds: string[] }
 * Sets exactly these agents (which must belong to the account) as switchable and
 * turns the flag off on all the account's other agents.
 */
const adminSetSwitchableAgents = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const requested = Array.isArray(req.body?.agentIds) ? req.body.agentIds.map(String) : [];

    // Only allow ids that actually belong to this account.
    const owned = await req.prisma.agent.findMany({ where: { userId }, select: { id: true } });
    const ownedIds = new Set(owned.map(a => a.id));
    const enableIds = requested.filter(id => ownedIds.has(id));

    await req.prisma.$transaction([
      req.prisma.agent.updateMany({ where: { userId }, data: { phoneSwitchEnabled: false } }),
      ...(enableIds.length
        ? [req.prisma.agent.updateMany({ where: { userId, id: { in: enableIds } }, data: { phoneSwitchEnabled: true } })]
        : []),
    ]);

    res.json({ success: true, enabledAgentIds: enableIds });
  } catch (error) {
    console.error('[PhoneSwitch] admin set error:', error.message);
    res.status(500).json({ error: 'Failed to update switchable agents' });
  }
};

module.exports = { listSwitchableAgents, switchPhoneAgent, adminListAccountAgents, adminSetSwitchableAgents };
