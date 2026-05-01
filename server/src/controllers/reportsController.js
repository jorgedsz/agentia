const anthropicService = require('../services/anthropicService');
const { logAudit } = require('../utils/auditLog');

const MAX_ROWS = 5000;
// Total budget (chars) we want to spend on per-row transcripts/messages across
// the whole prompt. Sonnet 4.6 has a 200K-token input window; reserving ~20K
// for system + user + response leaves ~180K → ~720K chars. We give half of
// that to the variable-length text fields and let the structured metadata
// take the rest. Each row's transcript/message trim is computed dynamically
// from this budget so users can ask for 5000 rows without blowing the window.
const TRANSCRIPT_BUDGET_CHARS = 500_000;
const MAX_PER_ROW_TRIM = 2000;
const MIN_PER_ROW_TRIM = 100;

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
    transcript: r.transcript || null
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
    input: r.inputMessage || '',
    output: r.outputMessage || null
  }));
};

// Compute a per-row character budget for the variable-length transcript /
// message text so the total prompt stays within Sonnet's input window even
// when the user asks for thousands of rows. Returns MAX_PER_ROW_TRIM (2000)
// for small batches and shrinks down to MIN_PER_ROW_TRIM (100) at 5000 rows.
const perRowTrim = (rowCount) => {
  if (rowCount <= 0) return MAX_PER_ROW_TRIM;
  const computed = Math.floor(TRANSCRIPT_BUDGET_CHARS / rowCount);
  return Math.max(MIN_PER_ROW_TRIM, Math.min(MAX_PER_ROW_TRIM, computed));
};

const trimText = (text, limit) => {
  if (!text) return text;
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '…';
};

const formatCallsForPrompt = (rows) => {
  if (!rows.length) return 'No call records matched the filters.';
  const trim = perRowTrim(rows.length);
  return rows.map((r) => (
    `Call ${r.id} | ${r.type} | ${r.outcome} | ${Math.round(r.durationSeconds || 0)}s | ${r.createdAt.toISOString()} | agent=${r.agentId || '-'} | customer=${r.customerNumber || '-'}\n` +
    (r.summary ? `  Summary: ${trimText(r.summary, trim)}\n` : '') +
    (r.transcript ? `  Transcript: ${trimText(r.transcript, trim)}\n` : '')
  )).join('\n');
};

const formatChatbotsForPrompt = (rows) => {
  if (!rows.length) return 'No chatbot messages matched the filters.';
  const trim = perRowTrim(rows.length);
  return rows.map((r) => (
    `Msg ${r.id} | bot=${r.chatbotName} | session=${r.sessionId} | ${r.createdAt.toISOString()} | status=${r.status}\n` +
    `  USER: ${trimText(r.input, trim)}\n` +
    (r.output ? `  BOT: ${trimText(r.output, trim)}\n` : '')
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

const SYSTEM_PROMPT = `You are an analytics assistant generating polished, document-style reports from voice-call and chatbot conversation data for a customer-engagement platform.

You will receive:
1. A block of structured data (call logs, chatbot messages, or both).
2. A user prompt describing what they want to extract or summarize.

Output format — produce a self-contained Markdown document that reads like a real report:

- Start with a top-level heading "# <Report title>" followed by a one-paragraph executive summary.
- Use H2 / H3 sub-sections to organize the analysis (e.g. "## Key findings", "## By outcome", "## Recommendations").
- Use **bold** for emphasis, bulleted lists for parallel points, and Markdown tables (GFM pipe syntax) when comparing numbers across categories.
- When the data has natural categorical or time-series structure, include a chart by emitting a fenced code block with the language tag "chart" containing a JSON object on a single block, like:
  \`\`\`chart
  { "type": "bar", "title": "Calls per outcome", "xKey": "outcome", "yKey": "count", "data": [ { "outcome": "answered", "count": 42 }, { "outcome": "voicemail", "count": 11 } ] }
  \`\`\`
  Supported types: "bar", "line", "pie". For "pie", use { "type": "pie", "title": "...", "nameKey": "label", "valueKey": "value", "data": [...] }. Embed charts inline where they best support the surrounding prose. Use them sparingly — only when a chart adds clarity (typically 1–3 per report).
- Do not put chart JSON inside any other code block; only the dedicated \`\`\`chart\`\`\` form.
- Quote concrete evidence (call ID, customer phone, message ID) when calling out specific examples.
- Be honest about gaps — if the data does not answer the prompt, say so plainly.
- Match the language of the user's prompt: respond in Spanish if the prompt is Spanish, English if English, and so on.
- Keep the report focused and scannable; cut filler. Aim for analysis, not a data dump.`;

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
