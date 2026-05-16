// One-time migration: convert an agent from the old analysisPlan.structuredDataPlan
// path to a dedicated VAPI Structured Output attached via artifactPlan.structuredOutputIds.
//
// Idempotent: skips agents that already have vapiStructuredOutputId set unless
// you pass --recreate.
//
// Usage:
//   node scripts/migrate-to-structured-output.js <local-agent-id>
//   node scripts/migrate-to-structured-output.js <local-agent-id> --recreate
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('../src/services/vapiService');
const { getVapiKeyForUser } = require('../src/utils/getApiKeys');

const AGENT_ID = process.argv[2];
const RECREATE = process.argv.includes('--recreate');
if (!AGENT_ID) {
  console.error('Usage: node scripts/migrate-to-structured-output.js <local-agent-id> [--recreate]');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID } });
    if (!agent) throw new Error('Agent not found: ' + AGENT_ID);
    if (!agent.vapiId) throw new Error('Agent has no vapiId — sync it first via the dashboard.');

    const cfg = agent.config ? JSON.parse(agent.config) : {};
    if (!cfg.structuredDataEnabled) {
      console.log('Agent has structuredDataEnabled=false. Nothing to migrate.');
      return;
    }
    let schema;
    try { schema = JSON.parse(cfg.structuredDataSchema || '{}'); }
    catch { throw new Error('Invalid structuredDataSchema JSON'); }
    if (!schema?.properties || !Object.keys(schema.properties).length) {
      throw new Error('Schema has no properties — add fields in AgentEdit first.');
    }

    const vapiKey = await getVapiKeyForUser(prisma, agent.userId);
    if (!vapiKey) throw new Error('No VAPI key resolved for user ' + agent.userId);
    vapiService.setApiKey(vapiKey);

    let soId = agent.vapiStructuredOutputId;
    if (soId && !RECREATE) {
      console.log('Agent already has vapiStructuredOutputId:', soId, '— pass --recreate to make a fresh one.');
    } else {
      if (soId && RECREATE) {
        console.log('Deleting old structured output:', soId);
        try { await vapiService.deleteStructuredOutput(soId); } catch (e) { console.warn('  (delete failed, ignoring):', e.message); }
      }
      const name = `${agent.name} extraction`.slice(0, 80);
      const description = (cfg.structuredDataPrompt || `Post-call structured data extraction for ${agent.name}`).slice(0, 1000);
      console.log('Creating structured output with name:', name);
      const created = await vapiService.createStructuredOutput({ type: 'ai', name, description, schema });
      soId = created.id;
      console.log('Created structured output id:', soId);
      await prisma.agent.update({ where: { id: agent.id }, data: { vapiStructuredOutputId: soId } });
    }

    // Patch the assistant so its artifactPlan.structuredOutputIds includes our SO.
    const vapiAgent = await vapiService.getAgent(agent.vapiId);
    const existingArtifactPlan = vapiAgent.artifactPlan || {};
    const existingIds = Array.isArray(existingArtifactPlan.structuredOutputIds) ? existingArtifactPlan.structuredOutputIds : [];
    const newIds = existingIds.includes(soId) ? existingIds : [...existingIds, soId];

    // Also strip the old analysisPlan.structuredDataPlan so VAPI doesn't run
    // two extraction paths and confuse the result shape.
    const newAnalysisPlan = { ...(vapiAgent.analysisPlan || {}) };
    delete newAnalysisPlan.structuredDataPlan;

    console.log('Patching assistant', agent.vapiId, '→ artifactPlan.structuredOutputIds:', newIds);
    const updated = await vapiService.makeRequest(`/assistant/${agent.vapiId}`, 'PATCH', {
      artifactPlan: { ...existingArtifactPlan, structuredOutputIds: newIds },
      analysisPlan: newAnalysisPlan
    });

    console.log('\nDone. Assistant artifactPlan.structuredOutputIds is now:',
      updated.artifactPlan?.structuredOutputIds);
    console.log('Assistant analysisPlan.structuredDataPlan removed:', !updated.analysisPlan?.structuredDataPlan);
  } catch (err) {
    console.error('ERROR:', err.message);
    if (err.response?.data) console.error('Response:', JSON.stringify(err.response.data, null, 2));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
