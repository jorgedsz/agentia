// Patch an agent's VAPI assistant so its structuredDataPlan.schema includes
// `required` (all keys) and `additionalProperties: false`. Needed because
// VAPI runs OpenAI structured-outputs in strict mode and silently returns
// null without them. After this runs once you can also re-save the agent
// from AgentEdit and it'll stay correct via the normal sync path.
//
// Usage: node scripts/fix-structured-data-strict.js <local-agent-id>
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('../src/services/vapiService');
const { getVapiKeyForUser } = require('../src/utils/getApiKeys');

const AGENT_ID = process.argv[2];
if (!AGENT_ID) {
  console.error('Usage: node scripts/fix-structured-data-strict.js <local-agent-id>');
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
    if (schema.type !== 'object' || !schema.properties) {
      throw new Error('Schema root must be {type:"object", properties:{...}}');
    }

    const propKeys = Object.keys(schema.properties);
    const needsRequired = !Array.isArray(schema.required) || schema.required.length !== propKeys.length;
    const needsAddProps = schema.additionalProperties !== false;

    const hasGuard = (plan.messages || []).some(m => /MUST return a JSON object/.test(m.content || ''));
    if (!needsRequired && !needsAddProps && hasGuard) {
      console.log('Already strict and guarded — nothing to do.');
      return;
    }

    schema.required = propKeys;
    schema.additionalProperties = false;

    const guard = {
      role: 'system',
      content: 'You MUST return a JSON object that matches the provided schema exactly. For any field not present in the conversation, use an empty string "" for strings, false for booleans, 0 for numbers, or null. NEVER return "N/A", explanatory text, or anything other than a valid JSON object matching the schema. Always include every field listed in the schema.'
    };
    const existingUserMsg = (plan.messages || []).find(m => m.role === 'system' && !/MUST return a JSON object/.test(m.content));
    const newMessages = existingUserMsg ? [guard, existingUserMsg] : [guard];

    const newAnalysisPlan = {
      ...(vapiAgent.analysisPlan || {}),
      structuredDataPlan: {
        ...plan,
        schema,
        messages: newMessages
      }
    };

    console.log('Patching assistant', agent.vapiId, 'with schema:');
    console.log(JSON.stringify(schema, null, 2));

    // vapiService doesn't expose a raw PATCH, use makeRequest directly.
    const updated = await vapiService.makeRequest(`/assistant/${agent.vapiId}`, 'PATCH', {
      analysisPlan: newAnalysisPlan
    });

    const after = updated.analysisPlan?.structuredDataPlan?.schema;
    console.log('\nAfter patch — VAPI schema:');
    console.log(JSON.stringify(after, null, 2));
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
