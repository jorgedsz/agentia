require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const rows = await prisma.chatbotTokenUsage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        chatbotId: true, model: true, promptTokens: true, completionTokens: true,
        costUsd: true, createdAt: true
      }
    });
    console.log('Most recent 10 ChatbotTokenUsage rows:');
    console.table(rows);

    const n8nService = require('../src/services/n8nService');
    const { getN8nConfig } = require('../src/utils/getN8nConfig');
    const cfg = await getN8nConfig(prisma);
    if (cfg) {
      n8nService.setConfig(cfg.url, cfg.apiKey);
      const wf = await n8nService.makeRequest('/workflows/dDv1wiI2Lv843yoQ');
      const llmNodes = (wf?.nodes || []).filter(n =>
        n.type?.toLowerCase().includes('lmchat') ||
        n.type?.toLowerCase().includes('openai') ||
        n.type?.toLowerCase().includes('anthropic')
      );
      console.log('\nLLM nodes in RPM Autos (Imported) workflow:');
      for (const n of llmNodes) {
        console.log({
          name: n.name,
          type: n.type,
          parametersModel: n.parameters?.model,
          parametersOptions: n.parameters?.options,
        });
      }
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
