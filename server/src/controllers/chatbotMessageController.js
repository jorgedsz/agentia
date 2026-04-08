const listMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const { createdAtLt, createdAtGt, chatbotId, search } = req.query;

    const where = { userId };

    if (chatbotId) where.chatbotId = chatbotId;

    if (createdAtLt || createdAtGt) {
      where.createdAt = {};
      if (createdAtLt) where.createdAt.lt = new Date(createdAtLt);
      if (createdAtGt) where.createdAt.gt = new Date(createdAtGt);
    }

    if (search) {
      where.OR = [
        { sessionId: { contains: search, mode: 'insensitive' } },
        { inputMessage: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const messages = await req.prisma.chatbotMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const nextCursor = hasMore && messages.length > 0
      ? messages[messages.length - 1].createdAt.toISOString()
      : null;

    // Get distinct chatbots for the filter dropdown
    const chatbots = await req.prisma.chatbotMessage.findMany({
      where: { userId },
      distinct: ['chatbotId'],
      select: { chatbotId: true, chatbotName: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      messages,
      chatbots: chatbots.map(c => ({ id: c.chatbotId, name: c.chatbotName })),
      pagination: { limit, hasMore, nextCursor },
    });
  } catch (error) {
    console.error('List chatbot messages error:', error);
    res.status(500).json({ error: 'Failed to fetch chatbot messages' });
  }
};

const getMessageAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, chatbotId } = req.query;

    const where = { userId };
    if (chatbotId) where.chatbotId = chatbotId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const agg = await req.prisma.chatbotMessage.aggregate({
      where,
      _count: true,
      _sum: { costCharged: true },
    });

    const totalMessages = agg._count;
    const totalCost = agg._sum.costCharged || 0;

    // Chatbot breakdown
    const breakdown = await req.prisma.chatbotMessage.groupBy({
      by: ['chatbotId', 'chatbotName'],
      where,
      _count: true,
      _sum: { costCharged: true },
    });

    res.json({
      summary: { totalMessages, totalCost },
      chatbotBreakdown: breakdown.map(b => ({
        chatbotId: b.chatbotId,
        chatbotName: b.chatbotName,
        count: b._count,
        cost: b._sum.costCharged || 0,
      })),
    });
  } catch (error) {
    console.error('Message analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

const getMessageDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await req.prisma.chatbotMessage.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message });
  } catch (error) {
    console.error('Get message detail error:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
};

module.exports = { listMessages, getMessageAnalytics, getMessageDetail };
