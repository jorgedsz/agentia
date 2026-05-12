require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const rpm = await prisma.chatbot.findFirst({
      where: { name: { contains: 'rpm', mode: 'insensitive' } },
      select: { id: true, name: true, isArchived: true, n8nWorkflowId: true, userId: true, createdAt: true }
    });
    console.log('chatbot match:', rpm);

    if (!rpm) {
      console.log('No chatbot found matching "rpm".');
      const all = await prisma.chatbot.findMany({
        select: { id: true, name: true, isArchived: true },
        take: 20,
      });
      console.log('First 20 chatbots in DB:');
      console.table(all);
      return;
    }

    const [msgs, tokenRows, lastMsg, lastToken] = await Promise.all([
      prisma.chatbotMessage.count({ where: { chatbotId: rpm.id } }),
      prisma.chatbotTokenUsage.count({ where: { chatbotId: rpm.id } }),
      prisma.chatbotMessage.findFirst({ where: { chatbotId: rpm.id }, orderBy: { createdAt: 'desc' } }),
      prisma.chatbotTokenUsage.findFirst({ where: { chatbotId: rpm.id }, orderBy: { createdAt: 'desc' } }),
    ]);

    console.log({
      messageCount: msgs,
      tokenUsageCount: tokenRows,
      lastMessageAt: lastMsg?.createdAt,
      lastMessageCharged: lastMsg?.costCharged,
      lastTokenUsage: lastToken,
    });

    // Also check overall token usage across all chatbots
    const totalTokens = await prisma.chatbotTokenUsage.count();
    const recentTokens = await prisma.chatbotTokenUsage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { chatbotId: true, model: true, promptTokens: true, completionTokens: true, costUsd: true, createdAt: true }
    });
    console.log('\nTotal ChatbotTokenUsage rows in DB:', totalTokens);
    console.log('Most recent 3 token-usage rows (across all chatbots):');
    console.table(recentTokens);
  } catch (err) {
    console.error('ERROR:', err.message);
    if (err.code === 'P2021' || err.message?.includes('does not exist') || err.message?.includes('relation')) {
      console.error('\n>>> Looks like the ChatbotTokenUsage table does NOT exist. Run: npx prisma migrate deploy');
    }
  } finally {
    await prisma.$disconnect();
  }
})();
