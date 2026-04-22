require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// test RPM Autos chatbot (same id as check-rpm-rules.js)
const CHATBOT_ID = 'cmo1zuyqz0001rccd4z8e690k';

const DONE_STATUSES = ['completed', 'failed_permanent'];

function getThresholdMs(rule) {
  let value = rule.thresholdValue ?? rule.daysThreshold;
  if (!value) return null;
  const unit = rule.thresholdUnit || 'days';
  if (unit === 'minutes') value = Math.max(30, Math.round(value / 30) * 30);
  const mult = unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000;
  return value * mult;
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const bot = await prisma.chatbot.findUnique({ where: { id: CHATBOT_ID } });
    if (!bot) { console.log('Chatbot not found'); return; }
    const cfg = JSON.parse(bot.config || '{}');
    const fr = cfg.followUpRulesConfig;

    console.log(`Chatbot: ${bot.name}`);
    console.log(`isActive=${bot.isActive}  isArchived=${bot.isArchived}  rulesEnabled=${fr?.enabled}`);
    console.log('');

    if (!fr?.enabled || !fr.rules?.length) {
      console.log('No active rules — nothing would fire.');
      return;
    }

    for (let i = 0; i < fr.rules.length; i++) {
      const rule = fr.rules[i];
      const thresholdMs = getThresholdMs(rule);
      const cutoff = new Date(Date.now() - thresholdMs);

      console.log(`── Rule #${i} [${rule.conditionType}] "${rule.name || '(no name)'}" ──`);
      console.log(`  threshold: ${rule.thresholdValue ?? rule.daysThreshold} ${rule.thresholdUnit || 'days'}  → cutoff: ${cutoff.toISOString()}`);
      console.log(`  pipelineId: ${rule.pipelineId || '(none — fires for all inactive)'}`);
      if (rule.pipelineId && rule.excludedStageIds?.length) {
        console.log(`  excludedStageIds: ${JSON.stringify(rule.excludedStageIds)}`);
      }
      console.log(`  actions: ${(rule.actions || []).map(a => a.type).join(', ') || '(none)'}`);

      if (rule.conditionType !== 'inactive_conversation') {
        console.log('  (skipping detailed check — only inactive_conversation simulated)\n');
        continue;
      }

      const inactive = await prisma.$queryRaw`
        SELECT "contactId", MAX("createdAt") as "lastMessageAt"
        FROM "ChatbotMessage"
        WHERE "chatbotId" = ${CHATBOT_ID}
          AND "contactId" IS NOT NULL
          AND "contactId" != ''
        GROUP BY "contactId"
        HAVING MAX("createdAt") < ${cutoff}
      `;

      const actionTypes = (rule.actions || []).map(a => a.type);
      const doneLogs = await prisma.chatbotFollowUpLog.findMany({
        where: {
          chatbotId: CHATBOT_ID,
          ruleIndex: i,
          actionType: { in: actionTypes },
          status: { in: DONE_STATUSES },
        },
        select: { targetId: true, actionType: true, createdAt: true },
      });
      // Time-aware dedup: a log is "done" only if it was written AFTER the
      // contact's last message (same convo cycle). Older logs are stale.
      const doneAt = new Map();
      for (const l of doneLogs) doneAt.set(`${l.targetId}::${l.actionType}`, l.createdAt);

      const wouldFire = [];
      const allDone = [];
      for (const c of inactive) {
        const pending = actionTypes.filter(t => {
          const at = doneAt.get(`${c.contactId}::${t}`);
          return !(at && new Date(at) > new Date(c.lastMessageAt));
        });
        if (pending.length) wouldFire.push({ contactId: c.contactId, lastMessageAt: c.lastMessageAt, pending });
        else allDone.push(c.contactId);
      }

      console.log(`  inactive contacts past cutoff: ${inactive.length}`);
      console.log(`  already done (won't re-fire): ${allDone.length}`);
      console.log(`  WOULD FIRE on next tick: ${wouldFire.length}`);
      for (const w of wouldFire) {
        console.log(`    • ${w.contactId}  lastMsg=${new Date(w.lastMessageAt).toISOString()}  pending=[${w.pending.join(',')}]`);
      }
      console.log('');
    }
  } finally {
    await prisma.$disconnect();
  }
})();
