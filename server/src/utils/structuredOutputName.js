// Name for an agent's VAPI Structured Output. VAPI rejects names outside
// 1–40 characters ("Name must be between 1 and 40 characters"), so the agent
// name is trimmed to leave room for the " extraction" suffix.
const MAX_NAME = 40;
const SUFFIX = ' extraction';

const structuredOutputName = (agentName) => {
  const base = String(agentName || '').trim() || 'Agent';
  const cut = base.slice(0, MAX_NAME - SUFFIX.length).replace(/[\s\-–—]+$/, '') || 'Agent';
  return cut + SUFFIX;
};

module.exports = { structuredOutputName, MAX_NAME };
