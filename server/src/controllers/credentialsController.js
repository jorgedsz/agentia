const { encrypt, decrypt } = require('../utils/encryption');

const CREDENTIAL_TYPES = ['postgres_connection', 'supabase_vector'];

// Field shapes per type. `secret: true` fields are masked back to the client
// and treated as "leave blank to keep" on update. Plain fields are stored
// alongside secrets in the encrypted JSON for simplicity (the whole `data`
// blob is encrypted at rest regardless).
const TYPE_SCHEMA = {
  postgres_connection: {
    secret: ['connectionString'],
    plain: [],
  },
  supabase_vector: {
    secret: ['serviceRoleKey'],
    plain: ['url', 'matchFunction', 'matchTable', 'matchCount', 'matchThreshold'],
  },
};

const ENCRYPTED_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;
const isEncrypted = (val) => typeof val === 'string' && ENCRYPTED_RE.test(val);

const maskSecret = (raw) => {
  if (!raw) return '';
  const tail = raw.slice(-6);
  return `••••••••${tail}`;
};

const parseData = (raw) => {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
};

// Decrypt every secret field in a credential's stored data blob. Used by
// integrations that resolve a credential by id at tool-fire time.
function decryptCredentialData(credential) {
  const schema = TYPE_SCHEMA[credential.type];
  if (!schema) return parseData(credential.data);
  const data = parseData(credential.data);
  for (const key of schema.secret) {
    if (data[key] && isEncrypted(data[key])) {
      try { data[key] = decrypt(data[key]); } catch { data[key] = ''; }
    }
  }
  return data;
}

// Mask a credential for client responses: secrets become previews, plain
// fields pass through. Never sends ciphertext or plaintext secrets back.
function toClientShape(credential) {
  const schema = TYPE_SCHEMA[credential.type] || { secret: [], plain: [] };
  const data = parseData(credential.data);
  const out = { id: credential.id, name: credential.name, type: credential.type, createdAt: credential.createdAt, updatedAt: credential.updatedAt, data: {} };
  for (const key of schema.plain) {
    if (data[key] !== undefined) out.data[key] = data[key];
  }
  for (const key of schema.secret) {
    const stored = data[key];
    if (stored) {
      let preview = '';
      try {
        const plaintext = isEncrypted(stored) ? decrypt(stored) : stored;
        preview = maskSecret(plaintext);
      } catch {
        preview = '••••••••';
      }
      out.data[`${key}Preview`] = preview;
      out.data[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = true;
    }
  }
  return out;
}

// Build the JSON-stringified `data` blob to persist. Encrypts secret fields,
// preserving prior ciphertext when the incoming value is empty (the masked
// "leave blank to keep" UX).
function buildDataBlob(type, incoming, prevData) {
  const schema = TYPE_SCHEMA[type];
  if (!schema) throw new Error(`Unsupported credential type: ${type}`);
  const out = {};
  for (const key of schema.plain) {
    if (incoming[key] !== undefined) out[key] = incoming[key];
  }
  for (const key of schema.secret) {
    let value = incoming[key];
    if (!value) {
      // empty → keep previous ciphertext if any
      const prev = prevData?.[key];
      if (prev) out[key] = prev;
    } else if (isEncrypted(value)) {
      out[key] = value;
    } else {
      out[key] = encrypt(value);
    }
  }
  return JSON.stringify(out);
}

// ── GET /api/credentials ──
const listCredentials = async (req, res) => {
  try {
    const credentials = await req.prisma.credential.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ credentials: credentials.map(toClientShape) });
  } catch (err) {
    console.error('listCredentials error:', err);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
};

// ── GET /api/credentials/:id ──
const getCredential = async (req, res) => {
  try {
    const c = await req.prisma.credential.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!c) return res.status(404).json({ error: 'Credential not found' });
    res.json({ credential: toClientShape(c) });
  } catch (err) {
    console.error('getCredential error:', err);
    res.status(500).json({ error: 'Failed to fetch credential' });
  }
};

// ── POST /api/credentials ──
const createCredential = async (req, res) => {
  try {
    const { name, type, data } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!CREDENTIAL_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Allowed: ${CREDENTIAL_TYPES.join(', ')}` });
    }
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data must be an object' });

    const blob = buildDataBlob(type, data, null);
    const created = await req.prisma.credential.create({
      data: { userId: req.user.id, name: name.trim(), type, data: blob },
    });
    res.status(201).json({ credential: toClientShape(created) });
  } catch (err) {
    console.error('createCredential error:', err);
    res.status(500).json({ error: err.message || 'Failed to create credential' });
  }
};

// ── PUT /api/credentials/:id ──
const updateCredential = async (req, res) => {
  try {
    const existing = await req.prisma.credential.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Credential not found' });

    const { name, data } = req.body || {};
    const update = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (data && typeof data === 'object') {
      const prevData = parseData(existing.data);
      update.data = buildDataBlob(existing.type, data, prevData);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const updated = await req.prisma.credential.update({
      where: { id: existing.id },
      data: update,
    });
    res.json({ credential: toClientShape(updated) });
  } catch (err) {
    console.error('updateCredential error:', err);
    res.status(500).json({ error: err.message || 'Failed to update credential' });
  }
};

// ── DELETE /api/credentials/:id ──
const deleteCredential = async (req, res) => {
  try {
    const existing = await req.prisma.credential.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Credential not found' });
    await req.prisma.credential.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteCredential error:', err);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
};

module.exports = {
  CREDENTIAL_TYPES,
  TYPE_SCHEMA,
  decryptCredentialData,
  listCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
};
