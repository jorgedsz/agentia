require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const n8nService = require('../src/services/n8nService');
const { getN8nConfig } = require('../src/utils/getN8nConfig');
const { decrypt } = require('../src/utils/encryption');

const parseConfig = (config) => {
  if (!config) return null;
  try { return JSON.parse(config); } catch { return null; }
};

const getServerBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.GHL_REDIRECT_URI) {
    try { return new URL(process.env.GHL_REDIRECT_URI).origin; } catch {}
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
};

(async () => {
  const prisma = new PrismaClient();
  const n8nConfig = await getN8nConfig(prisma);
  if (!n8nConfig) {
    console.error('n8n is not configured');
    await prisma.$disconnect();
    process.exit(1);
  }
  n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);

  const bots = await prisma.chatbot.findMany({
    where: { isArchived: false, n8nWorkflowId: { not: null } },
  });
  console.log(`Resyncing ${bots.length} chatbot workflow(s)...\n`);

  let ok = 0, fail = 0;
  for (const bot of bots) {
    const label = `${bot.name} (${bot.id})`;
    try {
      const decryptedOutputUrl = bot.outputUrl ? decrypt(bot.outputUrl) : null;
      const chatbotForN8n = {
        ...bot,
        outputUrl: decryptedOutputUrl,
        config: parseConfig(bot.config) || {},
        serverBaseUrl: getServerBaseUrl(),
      };
      await n8nService.updateWorkflow(bot.n8nWorkflowId, chatbotForN8n);
      await n8nService.activateWorkflow(bot.n8nWorkflowId);
      console.log(`  ok ${label}`);
      ok++;
    } catch (err) {
      console.log(`  fail ${label}  ->  ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} synced, ${fail} failed.`);
  await prisma.$disconnect();
})();
