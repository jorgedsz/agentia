const OpenAI = require('openai');
const { decrypt } = require('../utils/encryption');
const { getApiKeys } = require('../utils/getApiKeys');
const { decryptCredentialData } = require('./credentialsController');

const ENCRYPTED_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;
const isEncrypted = (val) => typeof val === 'string' && ENCRYPTED_RE.test(val);

function parseConfig(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

// Resolve the effective vector-store config for a chatbot. If the chatbot
// references a saved credential of type 'supabase_vector', that credential's
// data takes precedence. Otherwise, fall back to inline values stored on the
// chatbot's databaseConfig.vectorStore (legacy path, kept for backwards
// compat).
async function resolveVectorStoreConfig(prisma, chatbot) {
  const cfg = parseConfig(chatbot.config) || {};
  const inline = cfg.database?.vectorStore || {};
  const credentialId = cfg.database?.vectorStoreCredentialId;

  if (credentialId) {
    const credential = await prisma.credential.findFirst({
      where: { id: credentialId, userId: chatbot.userId, type: 'supabase_vector' },
    });
    if (!credential) {
      return { enabled: !!inline.enabled, error: 'Vector store credential not found or unauthorized.' };
    }
    const data = decryptCredentialData(credential);
    return {
      enabled: !!inline.enabled,
      url: data.url || '',
      serviceRoleKey: data.serviceRoleKey || '',
      matchFunction: data.matchFunction || inline.matchFunction || 'match_documents',
      matchTable: data.matchTable || inline.matchTable || 'documents',
      matchCount: Number.isFinite(data.matchCount) ? data.matchCount : inline.matchCount,
      matchThreshold: Number.isFinite(data.matchThreshold) ? data.matchThreshold : inline.matchThreshold,
    };
  }

  // Legacy inline path
  let serviceRoleKey = inline.serviceRoleKey || '';
  if (serviceRoleKey && isEncrypted(serviceRoleKey)) {
    try { serviceRoleKey = decrypt(serviceRoleKey); } catch { serviceRoleKey = ''; }
  }
  return {
    enabled: !!inline.enabled,
    url: inline.url || '',
    serviceRoleKey,
    matchFunction: inline.matchFunction || 'match_documents',
    matchTable: inline.matchTable || 'documents',
    matchCount: inline.matchCount,
    matchThreshold: inline.matchThreshold,
  };
}

/**
 * POST /api/chatbot-sql/search-knowledge-base?chatbotId=X
 * Body: { query }
 *
 * AI tool entry-point for Supabase pgvector RAG. Called by n8n's
 * toolHttpRequest when the bot decides to look up knowledge-base
 * material. Server-side: embed the query via the platform OpenAI key,
 * POST to the chatbot's configured Supabase `match_documents`-style
 * RPC, return the top matches.
 *
 * Public endpoint — no auth. Same security model as the other
 * `/api/chatbot-*` tool endpoints: the chatbotId is the secret.
 */
async function searchKnowledgeBase(req, res) {
  try {
    const chatbotId = req.query.chatbotId || req.body?.chatbotId;
    const query = (req.body?.query || '').toString().trim();

    if (!chatbotId) {
      return res.json({ success: false, message: 'Missing required query param: chatbotId' });
    }
    if (!query) {
      return res.json({ success: false, message: 'Missing required body parameter: query' });
    }

    const chatbot = await req.prisma.chatbot.findUnique({ where: { id: chatbotId } });
    if (!chatbot) {
      return res.json({ success: false, message: 'Chatbot not found.' });
    }

    const vs = await resolveVectorStoreConfig(req.prisma, chatbot);
    if (vs.error) {
      return res.json({ success: false, message: vs.error });
    }
    if (!vs.enabled) {
      return res.json({ success: false, message: 'Vector store is not enabled for this chatbot.' });
    }

    const url = (vs.url || '').replace(/\/+$/, '');
    if (!url) {
      return res.json({ success: false, message: 'Vector store URL is not configured.' });
    }
    if (!vs.serviceRoleKey) {
      return res.json({ success: false, message: 'Vector store service-role key is not configured.' });
    }
    const serviceRoleKey = vs.serviceRoleKey;
    const matchFunction = vs.matchFunction || 'match_documents';
    const matchCount = Number.isFinite(vs.matchCount) && vs.matchCount > 0 ? Math.min(vs.matchCount, 50) : 5;
    const matchThreshold = Number.isFinite(vs.matchThreshold) ? Math.max(0, Math.min(1, vs.matchThreshold)) : 0.7;

    // 1) Embed the query
    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.json({ success: false, message: 'OpenAI API key is not configured for embeddings.' });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    let embedding;
    try {
      const embedResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      embedding = embedResp.data?.[0]?.embedding;
    } catch (embedErr) {
      console.error('[Chatbot SQL] embedding failed:', embedErr.message);
      return res.json({ success: false, message: `Embedding failed: ${embedErr.message}` });
    }
    if (!Array.isArray(embedding)) {
      return res.json({ success: false, message: 'Embedding response was empty.' });
    }

    // 2) Call the Supabase RPC. Standard `match_documents(query_embedding, match_threshold, match_count)`
    //    signature returning rows like { id, content, similarity }.
    const rpcUrl = `${url}/rest/v1/rpc/${encodeURIComponent(matchFunction)}`;
    let matches;
    try {
      const r = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          query_embedding: embedding,
          match_threshold: matchThreshold,
          match_count: matchCount,
        }),
      });
      const text = await r.text();
      if (!r.ok) {
        console.error('[Chatbot SQL] Supabase RPC failed:', r.status, text);
        return res.json({ success: false, message: `Supabase RPC failed (${r.status}): ${text.slice(0, 300)}` });
      }
      try { matches = JSON.parse(text); } catch { matches = []; }
    } catch (rpcErr) {
      console.error('[Chatbot SQL] Supabase RPC error:', rpcErr.message);
      return res.json({ success: false, message: `Supabase RPC error: ${rpcErr.message}` });
    }

    if (!Array.isArray(matches) || matches.length === 0) {
      return res.json({
        success: true,
        message: 'No matching documents found.',
        matches: [],
      });
    }

    // Trim long content to keep tool responses bounded.
    const MAX_PER_MATCH = 1500;
    const summary = matches.map((m) => {
      const content = typeof m.content === 'string' ? m.content : (m.text || JSON.stringify(m));
      return {
        id: m.id ?? null,
        similarity: typeof m.similarity === 'number' ? Number(m.similarity.toFixed(4)) : null,
        content: content.length > MAX_PER_MATCH ? content.slice(0, MAX_PER_MATCH) + '…' : content,
      };
    });

    return res.json({
      success: true,
      message: `Found ${summary.length} match${summary.length === 1 ? '' : 'es'}.`,
      matches: summary,
    });
  } catch (error) {
    console.error('[Chatbot SQL] searchKnowledgeBase error:', error);
    return res.json({ success: false, message: `Error: ${error.message}` });
  }
}

module.exports = {
  searchKnowledgeBase,
};
