require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const vapiService = require('./src/services/vapiService');
const prisma = new PrismaClient();

async function check() {
  console.log('=== LOCAL DATABASE AGENTS ===');
  const localAgents = await prisma.agent.findMany();
  localAgents.forEach(a => {
    console.log(`- ${a.name} (id: ${a.id}, vapiId: ${a.vapiId || 'NONE'})`);
  });

  console.log('\n=== VAPI AGENTS ===');
  const vapiAgents = await vapiService.listAgents();
  vapiAgents.forEach(a => {
    console.log(`- ${a.name} (id: ${a.id})`);
    console.log(`  Voice: ${a.voice?.provider} - ${a.voice?.voiceId}`);
    if (a.voice?.stability !== undefined) {
      console.log(`  Stability: ${a.voice.stability}, Similarity: ${a.voice.similarityBoost}`);
    }
  });

  await prisma.$disconnect();
}
check();
