// Removes `required` and `additionalProperties` from an assistant's
// structuredDataPlan schema. VAPI's analysis silently drops the plan
// when those strict-mode fields are present, so we ship plain schemas
// and rely on a guard prompt message instead.
//
// Usage: node scripts/strip-strict-fields.js <local-agent-id>
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('../src/services/vapiService');
const { getVapiKeyForUser } = require('../src/utils/getApiKeys');

const AGENT_ID = process.argv[2];
if (!AGENT_ID) {
  console.error('Usage: node scripts/strip-strict-fields.js <local-agent-id>');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID } });
    if (!agent) throw new Error('Agent not found: ' + AGENT_ID);
    if (!agent.vapiId) throw new Error('Agent has no vapiId');

    const vapiKey = await getVapiKeyForUser(prisma, agent.userId);
    if (!vapiKey) throw new Error('No VAPI key resolved for user ' + agent.userId);
    vapiService.setApiKey(vapiKey);

    const vapiAgent = await vapiService.getAgent(agent.vapiId);
    const plan = vapiAgent.analysisPlan?.structuredDataPlan;
    if (!plan?.schema) throw new Error('Assistant has no structuredDataPlan.schema set');

    const schema = JSON.parse(JSON.stringify(plan.schema));
    delete schema.required;
    delete schema.additionalProperties;

    const newAnalysisPlan = {
      ...(vapiAgent.analysisPlan || {}),
      structuredDataPlan: { ...plan, schema }
    };

    console.log('Patching assistant', agent.vapiId, '→ removing required/additionalProperties from schema');
    const updated = await vapiService.makeRequest(`/assistant/${agent.vapiId}`, 'PATCH', {
      analysisPlan: newAnalysisPlan
    });

    console.log('\nAfter patch — schema:');
    console.log(JSON.stringify(updated.analysisPlan?.structuredDataPlan?.schema, null, 2));
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
