require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const CHATBOT_ID = process.argv[2] || 'cmoizdgkv00016n2w5a0zujaa';

(async () => {
  const prisma = new PrismaClient();
  try {
    const c = await prisma.chatbot.findUnique({ where: { id: CHATBOT_ID } });
    if (!c) { console.log('no chatbot'); return; }
    const cfg = c.config ? JSON.parse(c.config) : {};
    console.log('chatbot.name:', c.name);
    console.log('chatbot.userId:', c.userId);
    console.log('chatbot.n8nWorkflowId:', c.n8nWorkflowId);
    const ghl = cfg.ghlCrmConfig || cfg.ghlCrm || {};
    console.log('\nghlCrmConfig keys:', Object.keys(ghl));
    console.log('\nopportunities:');
    (ghl.opportunities || []).forEach((opp, i) => {
      console.log(`\n[${i}]`, JSON.stringify(opp, null, 2));
    });

    console.log('\n--- saved ghl_manage_opportunity tools ---');
    const tools = (cfg.tools || []).filter(t => (t.name || '').startsWith('ghl_manage_opportunity'));
    if (!tools.length) {
      console.log('No ghl_manage_opportunity tools found in saved config.');
    }
    tools.forEach((t, i) => {
      console.log(`\n[${i}] name: ${t.name}`);
      console.log('  url:', t.url);
      console.log('  body keys:', Object.keys(t.body?.properties || {}));
    });
  } catch (e) { console.error('ERR:', e.message); }
  finally { await prisma.$disconnect(); }
})();
