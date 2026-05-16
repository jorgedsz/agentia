require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('../src/services/vapiService');
const { getVapiKeyForUser } = require('../src/utils/getApiKeys');

const AGENT_ID = process.argv[2];
if (!AGENT_ID) {
  console.error('Usage: node inspect-structured-data.js <local-agent-id>');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID } });
    if (!agent) {
      console.error('Agent not found:', AGENT_ID);
      process.exit(1);
    }

    const cfg = agent.config ? JSON.parse(agent.config) : {};
    console.log('=== LOCAL DB CONFIG ===');
    console.log('Agent:', agent.name, '| vapiId:', agent.vapiId, '| userId:', agent.userId);
    console.log('structuredDataEnabled:', cfg.structuredDataEnabled);
    console.log('structuredDataSchema (raw):', cfg.structuredDataSchema);
    console.log('structuredDataPrompt:', cfg.structuredDataPrompt ? `(${cfg.structuredDataPrompt.length} chars) ${cfg.structuredDataPrompt.slice(0, 200)}` : '(empty)');

    if (!agent.vapiId) {
      console.log('\nNo vapiId — agent never synced to VAPI.');
      return;
    }

    const vapiKey = await getVapiKeyForUser(prisma, agent.userId);
    if (!vapiKey) {
      console.log('\nNo VAPI API key resolved for user', agent.userId);
      return;
    }
    vapiService.setApiKey(vapiKey);
    const vapiAgent = await vapiService.getAgent(agent.vapiId);

    console.log('\n=== VAPI ASSISTANT ===');
    console.log('VAPI assistant name:', vapiAgent.name);
    console.log('analysisPlan present:', !!vapiAgent.analysisPlan);
    const sdp = vapiAgent.analysisPlan?.structuredDataPlan;
    console.log('structuredDataPlan present:', !!sdp);
    if (sdp) {
      console.log('  enabled:', sdp.enabled);
      console.log('  schema:', JSON.stringify(sdp.schema, null, 2));
      console.log('  messages:', JSON.stringify(sdp.messages, null, 2));
    }
    console.log('summaryPlan enabled:', vapiAgent.analysisPlan?.summaryPlan?.enabled);
    console.log('successEvaluationPlan enabled:', vapiAgent.analysisPlan?.successEvaluationPlan?.enabled);
    console.log('serverUrl:', vapiAgent.serverUrl || vapiAgent.server?.url);
    console.log('serverMessages:', vapiAgent.serverMessages);
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
})();
