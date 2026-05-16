// Fetch a call directly from VAPI's REST API and dump its full analysis object.
// Use this when the webhook says structuredData=null to see what VAPI itself
// has stored — including any extraction error messages.
//
// Usage: node scripts/inspect-vapi-call.js <vapi-call-id> [agent-id-for-key-lookup]
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('../src/services/vapiService');
const { getVapiKeyForUser } = require('../src/utils/getApiKeys');

const CALL_ID = process.argv[2];
const AGENT_ID = process.argv[3];
if (!CALL_ID) {
  console.error('Usage: node scripts/inspect-vapi-call.js <vapi-call-id> [agent-id]');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    let userId = 1;
    if (AGENT_ID) {
      const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID } });
      if (agent) userId = agent.userId;
    } else {
      const log = await prisma.callLog.findUnique({ where: { vapiCallId: CALL_ID } });
      if (log) userId = log.userId;
    }

    const vapiKey = await getVapiKeyForUser(prisma, userId);
    if (!vapiKey) throw new Error('No VAPI key resolved for user ' + userId);
    vapiService.setApiKey(vapiKey);

    const call = await vapiService.makeRequest(`/call/${CALL_ID}`, 'GET');
    console.log('=== CALL META ===');
    console.log('id:', call.id);
    console.log('status:', call.status);
    console.log('endedReason:', call.endedReason);
    console.log('startedAt:', call.startedAt, '| endedAt:', call.endedAt);
    console.log('assistantId:', call.assistantId);
    console.log('cost:', call.cost);

    console.log('\n=== ANALYSIS (raw) ===');
    console.log(JSON.stringify(call.analysis, null, 2));
    console.log('\n=== ANALYSIS keys ===', Object.keys(call.analysis || {}));
    console.log('\n=== TOP-LEVEL call keys ===', Object.keys(call));
    if (call.analysis?.structuredData === undefined) {
      console.log('\n!!! structuredData key is NOT in analysis at all (not even null) !!!');
    }

    console.log('\n=== ASSISTANT analysisPlan AT THE TIME OF THE CALL ===');
    console.log(JSON.stringify(call.assistant?.analysisPlan, null, 2));

    console.log('\n=== ARTIFACT.transcript (first 800 chars) ===');
    const tr = call.artifact?.transcript || call.transcript || '';
    console.log((typeof tr === 'string' ? tr : JSON.stringify(tr)).slice(0, 800));
  } catch (err) {
    console.error('ERROR:', err.message);
    if (err.response) console.error('Response:', JSON.stringify(err.response.data || err.response, null, 2));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
