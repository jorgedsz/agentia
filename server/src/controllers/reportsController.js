const anthropicService = require('../services/anthropicService');
const { logAudit } = require('../utils/auditLog');

const MAX_ROWS = 500;
const TRANSCRIPT_TRIM = 2000;
const MESSAGE_TRIM = 1500;

const parseFilters = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const buildDateRange = (filters) => {
  const range = {};
  if (filters.dateFrom) {
    const d = new Date(filters.dateFrom);
    if (!isNaN(d)) range.gte = d;
  }
  if (filters.dateTo) {
    const d = new Date(filters.dateTo);
    if (!isNaN(d)) range.lte = d;
  }
  return Object.keys(range).length ? range : null;
};

const fetchCallRows = async (prisma, userId, filters) => {
  const where = { userId };
  const dateRange = buildDateRange(filters);
  if (dateRange) where.createdAt = dateRange;
  if (Array.isArray(filters.agentIds) && filters.agentIds.length) {
    where.agentId = { in: filters.agentIds };
  }
  if (Array.isArray(filters.outcomes) && filters.outcomes.length) {
    where.outcome = { in: filters.outcomes };
  }
  const rows = await prisma.callLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit || MAX_ROWS, MAX_ROWS)
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    outcome: r.outcome,
    durationSeconds: r.durationSeconds,
    customerNumber: r.customerNumber,
    agentId: r.agentId,
    createdAt: r.createdAt,
    summary: r.summary || null,
    transcript: r.transcript ? r.transcript.slice(0, TRANSCRIPT_TRIM) : null
  }));
};

const fetchChatbotRows = async (prisma, userId, filters) => {
  const where = { userId };
  const dateRange = buildDateRange(filters);
  if (dateRange) where.createdAt = dateRange;
  if (Array.isArray(filters.chatbotIds) && filters.chatbotIds.length) {
    where.chatbotId = { in: filters.chatbotIds };
  }
  const rows = await prisma.chatbotMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit || MAX_ROWS, MAX_ROWS)
  });
  return rows.map((r) => ({
    id: r.id,
    chatbotId: r.chatbotId,
    chatbotName: r.chatbotName,
    sessionId: r.sessionId,
    contactName: r.contactName,
    status: r.status,
    createdAt: r.createdAt,
    input: r.inputMessage ? r.inputMessage.slice(0, MESSAGE_TRIM) : '',
    output: r.outputMessage ? r.outputMessage.slice(0, MESSAGE_TRIM) : null
  }));
};

const formatCallsForPrompt = (rows) => {
  if (!rows.length) return 'No call records matched the filters.';
  return rows.map((r) => (
    `Call ${r.id} | ${r.type} | ${r.outcome} | ${Math.round(r.durationSeconds || 0)}s | ${r.createdAt.toISOString()} | agent=${r.agentId || '-'} | customer=${r.customerNumber || '-'}\n` +
    (r.summary ? `  Summary: ${r.summary}\n` : '') +
    (r.transcript ? `  Transcript: ${r.transcript}\n` : '')
  )).join('\n');
};

const formatChatbotsForPrompt = (rows) => {
  if (!rows.length) return 'No chatbot messages matched the filters.';
  return rows.map((r) => (
    `Msg ${r.id} | bot=${r.chatbotName} | session=${r.sessionId} | ${r.createdAt.toISOString()} | status=${r.status}\n` +
    `  USER: ${r.input}\n` +
    (r.output ? `  BOT: ${r.output}\n` : '')
  )).join('\n');
};

const buildDataBlock = ({ dataset, calls, chatbots }) => {
  const sections = [];
  if (dataset === 'calls' || dataset === 'both') {
    sections.push(`# CALL LOGS (${calls.length} rows)\n${formatCallsForPrompt(calls)}`);
  }
  if (dataset === 'chatbots' || dataset === 'both') {
    sections.push(`# CHATBOT MESSAGES (${chatbots.length} rows)\n${formatChatbotsForPrompt(chatbots)}`);
  }
  return sections.join('\n\n');
};

const SYSTEM_PROMPT = `You are an analytics assistant generating reports from voice-call and chatbot conversation data for a customer-engagement platform.

You will receive:
1. A block of structured data (call logs, chatbot messages, or both).
2. A user prompt describing what they want to extract or summarize.

Guidelines:
- Ground every claim in the supplied data. Do not invent facts.
- Quote concrete examples (call ID, customer phone, message ID) when relevant.
- Use clear, scannable Markdown: short headings, bullets, tables when comparing.
- Be honest about gaps — if the data does not answer the prompt, say so plainly.
- Default to English unless the user's prompt is clearly in another language.
- Keep the response focused; cut filler.`;

const serializeReport = (report) => ({
  ...report,
  filters: parseFilters(report.filters)
});

const listReports = async (req, res) => {
  try {
    const reports = await req.prisma.report.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        dataset: true,
        model: true,
        status: true,
        rowsUsed: true,
        createdAt: true,
        updatedAt: true,
        error: true
      }
    });
    res.json({ reports });
  } catch (error) {
    console.error('List reports error:', error);
    res.status(500).json({ error: 'Failed to list reports' });
  }
};

const getReport = async (req, res) => {
  try {
    const report = await req.prisma.report.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report: serializeReport(report) });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to load report' });
  }
};

const deleteReport = async (req, res) => {
  try {
    const existing = await req.prisma.report.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    await req.prisma.report.delete({ where: { id: existing.id } });
    res.json({ message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
};

const createReport = async (req, res) => {
  try {
    const { name, prompt, dataset, filters, model } = req.body || {};
    if (!name || !prompt || !dataset) {
      return res.status(400).json({ error: 'name, prompt and dataset are required' });
    }
    if (!['calls', 'chatbots', 'both'].includes(dataset)) {
      return res.status(400).json({ error: 'dataset must be calls | chatbots | both' });
    }

    const apiKey = await anthropicService.getApiKey(req.prisma);
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is not configured. Add it in Settings.' });
    }

    const chosenModel = anthropicService.isModelAllowed(model) ? model : anthropicService.DEFAULT_MODEL;
    const parsedFilters = parseFilters(filters);

    // Persist as 'running' so the user can poll history if the call is slow.
    const report = await req.prisma.report.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        prompt: prompt.trim(),
        dataset,
        filters: filters ? JSON.stringify(parsedFilters) : null,
        model: chosenModel,
        status: 'running'
      }
    });

    let calls = [];
    let chatbots = [];
    try {
      if (dataset === 'calls' || dataset === 'both') {
        calls = await fetchCallRows(req.prisma, req.user.id, parsedFilters);
      }
      if (dataset === 'chatbots' || dataset === 'both') {
        chatbots = await fetchChatbotRows(req.prisma, req.user.id, parsedFilters);
      }

      const dataBlock = buildDataBlock({ dataset, calls, chatbots });
      const rowsUsed = calls.length + chatbots.length;

      const result = await anthropicService.runReport({
        apiKey,
        model: chosenModel,
        system: SYSTEM_PROMPT,
        userPrompt: report.prompt,
        dataBlock
      });

      const updated = await req.prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'done',
          result: result.text,
          tokensIn: result.usage.input_tokens,
          tokensOut: result.usage.output_tokens,
          rowsUsed,
          model: result.model
        }
      });

      logAudit(req.prisma, {
        userId: req.user.id,
        actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
        actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
        actorType: req.isTeamMember ? 'team_member' : 'user',
        action: 'report.create',
        resourceType: 'report',
        resourceId: report.id,
        details: { dataset, model: chosenModel, rowsUsed },
        req
      });

      res.status(201).json({ report: serializeReport(updated) });
    } catch (runError) {
      console.error('Report run failed:', runError);
      const updated = await req.prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'failed',
          error: runError?.message?.slice(0, 1000) || 'Unknown error'
        }
      });
      res.status(502).json({
        error: 'Report generation failed',
        report: serializeReport(updated)
      });
    }
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
};

module.exports = {
  listReports,
  getReport,
  createReport,
  deleteReport
};
