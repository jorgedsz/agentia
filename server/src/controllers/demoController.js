const crypto = require('crypto');
const OpenAI = require('openai');
const { generatePrompt } = require('../services/promptGeneratorService');
const { getApiKeys } = require('../utils/getApiKeys');
const { decrypt } = require('../utils/encryption');

// In-memory store for demo sessions (30-min TTL)
const demoSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of demoSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      demoSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

const CHATBOT_ADAPT_PROMPT = `You are an expert at adapting voice AI agent prompts into text chatbot prompts.

Given a voice agent system prompt, adapt it for a text-based chatbot by:
- Removing all references to phone calls, TTS, speech, voice, pronunciation rules
- Removing IVR/voicemail handling sections
- Removing rules about how to say phone numbers, emails, or addresses out loud
- Keeping the core personality, objective, script flow, FAQ, and objection handling
- Adapting "say" to "respond" or "write" where appropriate
- Keeping it concise and natural for text chat
- Preserving the same language as the original prompt

Return ONLY the adapted chatbot system prompt text. No explanations, no markdown code blocks.`;

const generateDemo = async (req, res) => {
  try {
    const { callerName, businessName, industry, agentObjective, agentType, language, tone, faq, objections } = req.body;

    // Validate required fields
    if (!businessName || !industry || !agentObjective || !agentType || !language) {
      return res.status(400).json({ error: 'Missing required fields: businessName, industry, agentObjective, agentType, language' });
    }

    if (!['inbound', 'outbound'].includes(agentType)) {
      return res.status(400).json({ error: 'agentType must be "inbound" or "outbound"' });
    }

    // Get OpenAI key
    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Map language codes
    const langMap = { English: 'en', Spanish: 'es', French: 'fr', German: 'de', Italian: 'it', Portuguese: 'pt' };
    const langCode = langMap[language] || 'en';

    // Build wizardData for the updated generatePrompt signature
    const wizardData = {
      botType: 'sales',
      direction: agentType === 'inbound' ? 'inbound' : 'outbound',
      language: langCode,
      companyName: businessName,
      industry: industry || '',
      tone: tone || 'professional',
      goals: agentObjective,
      typeConfig: {
        ...(faq ? { qualifyingQuestions: faq } : {}),
        ...(objections ? { commonObjections: objections } : {})
      },
      additionalNotes: ''
    };

    // Generate voicebot prompt using existing service
    const { prompt: voicebotPrompt, firstMessage } = await generatePrompt(wizardData, openaiApiKey);

    // Adapt voice prompt to chatbot prompt
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const adaptResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CHATBOT_ADAPT_PROMPT },
        { role: 'user', content: voicebotPrompt }
      ],
      temperature: 0.5,
      max_tokens: 3000
    });

    let chatbotPrompt = adaptResponse.choices[0].message.content.trim();
    if (chatbotPrompt.startsWith('```')) {
      chatbotPrompt = chatbotPrompt.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '');
    }

    // Generate a clean first message for the chatbot
    const nameOrFallback = callerName?.trim() || 'there';
    const chatFirstMessage = firstMessage
      ? firstMessage.replace(/\{\{contact\.first_name\}\}/g, nameOrFallback).replace(/\{\{[^}]+\}\}/g, '')
      : callerName?.trim()
        ? `Hi ${callerName.trim()}! Welcome to ${businessName}. How can I help you today?`
        : `Hi! Welcome to ${businessName}. How can I help you today?`;

    // Store session
    const demoId = crypto.randomUUID();
    demoSessions.set(demoId, {
      chatbotPrompt,
      voicebotPrompt,
      firstMessage: chatFirstMessage,
      chatHistory: [
        { role: 'system', content: chatbotPrompt },
        { role: 'assistant', content: chatFirstMessage }
      ],
      createdAt: Date.now()
    });

    res.json({
      demoId,
      chatbotPrompt,
      voicebotPrompt,
      firstMessage: chatFirstMessage
    });
  } catch (error) {
    console.error('Demo generate error:', error);
    res.status(500).json({ error: 'Failed to generate demo. Please try again.' });
  }
};

const chatDemo = async (req, res) => {
  try {
    const { demoId, message } = req.body;

    if (!demoId || !message) {
      return res.status(400).json({ error: 'Missing demoId or message' });
    }

    const session = demoSessions.get(demoId);
    if (!session) {
      return res.status(404).json({ error: 'Demo session expired or not found. Please generate a new demo.' });
    }

    // Append user message
    session.chatHistory.push({ role: 'user', content: message });

    // Cap history at 30 messages (keep system prompt + last 29)
    if (session.chatHistory.length > 30) {
      session.chatHistory = [
        session.chatHistory[0],
        ...session.chatHistory.slice(-29)
      ];
    }

    // Get OpenAI key
    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: session.chatHistory,
      temperature: 0.7,
      max_tokens: 1000,
      stream: true
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Append assistant response to history
    session.chatHistory.push({ role: 'assistant', content: fullResponse });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Demo chat error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Chat failed. Please try again.' });
    }
    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    res.end();
  }
};

const getDemoVapiKey = async (req, res) => {
  try {
    // 1. Check PlatformSettings
    const settings = await req.prisma.platformSettings.findFirst();
    if (settings?.vapiPublicKey) {
      const decrypted = decrypt(settings.vapiPublicKey);
      if (decrypted) {
        return res.json({ vapiPublicKey: decrypted });
      }
    }

    // 2. Fallback to env var
    const envKey = process.env.VAPI_PUBLIC_KEY;
    if (envKey) {
      return res.json({ vapiPublicKey: envKey });
    }

    return res.status(404).json({ error: 'VAPI Public Key not configured' });
  } catch (error) {
    console.error('Get demo VAPI key error:', error);
    res.status(500).json({ error: 'Failed to fetch VAPI public key' });
  }
};

module.exports = { generateDemo, chatDemo, getDemoVapiKey };
