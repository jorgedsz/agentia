const OpenAI = require('openai');
const { getApiKeys } = require('../utils/getApiKeys');

const sendMessage = async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Get OpenAI API key
    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Fetch user's agents for context
    const agents = await req.prisma.agent.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, type: true, systemPrompt: true }
    });

    const agentSummary = agents.length > 0
      ? agents.map(a => `- "${a.name}" (${a.type})`).join('\n')
      : 'No agents created yet.';

    const systemPrompt = `You are a helpful AI assistant for the Appex Innovations AI voice agent platform. You help users manage their AI voice agents, understand platform features, and troubleshoot issues.

Platform features:
- Create and manage AI voice agents (inbound and outbound)
- Twilio integration for phone numbers
- Calendar integrations (GHL, Google, Calendly, HubSpot, Cal.com)
- Call analytics and logs
- Team member management
- Credit-based billing system

The user currently has these agents:
${agentSummary}

Be concise, helpful, and friendly. If asked about something outside the platform, you can still help but mention your primary expertise is with this platform.`;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1024
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Chat error:', error);
    // If headers already sent, end the stream with error
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  }
};

module.exports = { sendMessage };
