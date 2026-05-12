require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const matches = await prisma.chatbot.findMany({
      where: { name: { contains: 'rpm', mode: 'insensitive' } },
      select: { id: true, name: true, isArchived: true, n8nWorkflowId: true, userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`Found ${matches.length} chatbot(s) matching "rpm":\n`);
    for (const c of matches) {
      const msgs = await prisma.chatbotMessage.count({ where: { chatbotId: c.id } });
      const tokens = await prisma.chatbotTokenUsage.count({ where: { chatbotId: c.id } });
      const lastTok = await prisma.chatbotTokenUsage.findFirst({
        where: { chatbotId: c.id }, orderBy: { createdAt: 'desc' },
        select: { model: true, costUsd: true, promptTokens: true, completionTokens: true, createdAt: true }
      });
      console.log({
        id: c.id, name: c.name, isArchived: c.isArchived,
        n8nWorkflowId: c.n8nWorkflowId,
        messageCount: msgs, tokenUsageCount: tokens,
        lastTokenUsage: lastTok,
      });
    }

    const known = 'cmoizdgkv00016n2w5a0zujaa';
    const known_c = await prisma.chatbot.findUnique({
      where: { id: known },
      select: { id: true, name: true, isArchived: true, userId: true, n8nWorkflowId: true, createdAt: true }
    });
    console.log('\nChatbot owning the 2 existing token-usage rows:');
    console.log(known_c);
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
