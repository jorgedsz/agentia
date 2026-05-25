/**
 * Agent Playbook compilation.
 *
 * The playbook is accumulated knowledge (FAQs, objections, rules, examples)
 * built by Training Mode. It is NOT stored inside the agent's systemPrompt —
 * it lives in the AgentPlaybook table and is compiled + appended to the prompt
 * ONLY in the payload sent to Vapi at sync time. This keeps the stored prompt
 * clean and avoids duplication on subsequent edits.
 */

const CATEGORY_ORDER = ['faq', 'objection', 'rule', 'example'];
const CATEGORY_HEADINGS = {
  faq: 'FAQs',
  objection: 'Objection handling',
  rule: 'Rules',
  example: 'Examples',
};

function renderEntry(category, e) {
  const title = (e.title || '').trim();
  const content = (e.content || '').trim();
  switch (category) {
    case 'faq':
      return `- Q: ${title}\n  A: ${content}`;
    case 'objection':
      return `- If the customer says "${title}", respond: ${content}`;
    case 'rule':
      // content optional for rules; title carries the rule
      return `- ${content || title}`;
    case 'example':
      return `- ${title ? title + ': ' : ''}${content}`;
    default:
      return `- ${title} ${content}`.trim();
  }
}

/**
 * Compile the agent's enabled playbook entries into a prompt section string.
 * Returns '' when there are no enabled entries.
 */
async function compilePlaybookSection(prisma, agentId) {
  const entries = await prisma.agentPlaybook.findMany({
    where: { agentId, enabled: true },
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
  if (!entries.length) return '';

  const byCategory = {};
  for (const e of entries) {
    (byCategory[e.category] = byCategory[e.category] || []).push(e);
  }

  const blocks = [];
  for (const category of CATEGORY_ORDER) {
    const list = byCategory[category];
    if (!list || !list.length) continue;
    const lines = list.map((e) => renderEntry(category, e)).join('\n');
    blocks.push(`### ${CATEGORY_HEADINGS[category]}\n${lines}`);
  }
  if (!blocks.length) return '';

  return `\n\n## Knowledge & Rules (from training)\n${blocks.join('\n\n')}`;
}

/**
 * Return a shallow copy of `config` whose systemPrompt has the compiled
 * playbook appended. Safe to pass straight to vapiService. Never mutates the
 * stored config — only the Vapi payload.
 */
async function appendPlaybook(prisma, agentId, config) {
  if (!config) return config;
  try {
    const section = await compilePlaybookSection(prisma, agentId);
    if (!section) return config;
    return { ...config, systemPrompt: `${config.systemPrompt || ''}${section}` };
  } catch (err) {
    console.error('[Playbook] appendPlaybook failed:', err.message);
    return config; // never block a sync because of the playbook
  }
}

module.exports = { compilePlaybookSection, appendPlaybook, CATEGORY_ORDER };
