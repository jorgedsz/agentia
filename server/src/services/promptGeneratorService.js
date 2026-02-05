const OpenAI = require('openai');

const META_PROMPT = `You are an expert at writing system prompts for voice AI agents. Given a user's description of what they want their agent to do, generate a complete, professional system prompt.

Important guidelines:
- This is for a VOICE AI agent (phone calls), not a text chatbot
- Use natural spoken language: contractions, short sentences, conversational tone
- Include clear conversation flow (greeting, discovery, handling, closing)
- Define the agent's personality and tone
- Include instructions for handling common edge cases (confused caller, off-topic, angry caller)
- Keep it concise but comprehensive (aim for 200-400 words)
- Do NOT include any markdown formatting, headers, or bullet points in the output — write it as a continuous set of instructions
- Do NOT wrap the prompt in quotes or add meta-commentary — just output the system prompt directly`;

const generatePrompt = async (description, agentType, apiKey) => {
  const openai = new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });

  const typeContext = agentType === 'inbound'
    ? 'This agent RECEIVES incoming phone calls. It should greet callers warmly and help them with their needs.'
    : 'This agent MAKES outbound phone calls. It should introduce itself, state the purpose of the call, and guide the conversation toward the goal.';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: META_PROMPT },
      { role: 'user', content: `Agent type: ${agentType}\n${typeContext}\n\nUser's description: ${description}` }
    ],
    temperature: 0.8,
    max_tokens: 1024
  });

  return response.choices[0].message.content.trim();
};

module.exports = { generatePrompt };
