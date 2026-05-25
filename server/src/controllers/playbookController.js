// CRUD for the agent playbook (knowledge built by Training Mode, manageable by hand).
const { appendPlaybook } = require('../utils/playbook');
const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

const ALLOWED_CATS = ['faq', 'objection', 'rule', 'example'];

// Confirm the agent belongs to the requesting user; returns the agent or null.
async function ownedAgent(prisma, agentId, userId) {
  if (!agentId) return null;
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.userId !== userId) return null;
  return agent;
}

// Re-sync the agent to Vapi so playbook edits take effect on the live agent.
async function resyncAgent(prisma, agent, userId) {
  if (!agent?.vapiId) return;
  try {
    const vapiKey = await getVapiKeyForUser(prisma, userId);
    if (!vapiKey) return;
    vapiService.setApiKey(vapiKey);
    const config = agent.config ? JSON.parse(agent.config) : {};
    const payload = await appendPlaybook(prisma, agent.id, { name: agent.name, ...config });
    await vapiService.updateAgent(agent.vapiId, payload);
  } catch (err) {
    console.error('[Playbook] resync failed:', err.message);
  }
}

// GET /api/playbook?agentId=...
const listPlaybook = async (req, res) => {
  try {
    const agent = await ownedAgent(req.prisma, req.query.agentId, req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const entries = await req.prisma.agentPlaybook.findMany({
      where: { agentId: agent.id },
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ entries });
  } catch (error) {
    console.error('[Playbook] list error:', error);
    res.status(500).json({ error: 'Failed to load playbook' });
  }
};

// POST /api/playbook  { agentId, category, title, content }
const createEntry = async (req, res) => {
  try {
    const { agentId, category, title, content } = req.body;
    const agent = await ownedAgent(req.prisma, agentId, req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!ALLOWED_CATS.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    const entry = await req.prisma.agentPlaybook.create({
      data: { agentId: agent.id, category, title: title.trim(), content: (content || '').trim(), enabled: true },
    });
    resyncAgent(req.prisma, agent, req.user.id);
    res.json({ entry });
  } catch (error) {
    console.error('[Playbook] create error:', error);
    res.status(500).json({ error: 'Failed to create entry' });
  }
};

// PATCH /api/playbook/:id  { title?, content?, category?, enabled?, order? }
const updateEntry = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await req.prisma.agentPlaybook.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Entry not found' });
    const agent = await ownedAgent(req.prisma, existing.agentId, req.user.id);
    if (!agent) return res.status(403).json({ error: 'Not authorized' });

    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title).trim();
    if (req.body.content !== undefined) data.content = String(req.body.content).trim();
    if (req.body.category !== undefined && ALLOWED_CATS.includes(req.body.category)) data.category = req.body.category;
    if (req.body.enabled !== undefined) data.enabled = !!req.body.enabled;
    if (req.body.order !== undefined && Number.isFinite(parseInt(req.body.order))) data.order = parseInt(req.body.order);

    const entry = await req.prisma.agentPlaybook.update({ where: { id }, data });
    resyncAgent(req.prisma, agent, req.user.id);
    res.json({ entry });
  } catch (error) {
    console.error('[Playbook] update error:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
};

// DELETE /api/playbook/:id
const deleteEntry = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await req.prisma.agentPlaybook.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Entry not found' });
    const agent = await ownedAgent(req.prisma, existing.agentId, req.user.id);
    if (!agent) return res.status(403).json({ error: 'Not authorized' });

    await req.prisma.agentPlaybook.delete({ where: { id } });
    resyncAgent(req.prisma, agent, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Playbook] delete error:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
};

module.exports = { listPlaybook, createEntry, updateEntry, deleteEntry };
