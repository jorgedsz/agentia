const { encrypt, decrypt, mask } = require('../utils/encryption');

// GET /api/vapi-key-pool - List all pool entries (OWNER only)
const listKeys = async (req, res) => {
  try {
    const entries = await req.prisma.vapiKeyPool.findMany({
      include: {
        assignedUser: {
          select: { id: true, email: true, name: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const total = entries.length;
    const available = entries.filter(e => !e.assignedUserId).length;

    const keys = entries.map(entry => {
      let maskedPrivate = '****';
      let maskedPublic = '****';
      try {
        maskedPrivate = mask(decrypt(entry.vapiApiKey));
      } catch (e) { /* keep masked */ }
      try {
        maskedPublic = mask(decrypt(entry.vapiPublicKey));
      } catch (e) { /* keep masked */ }

      return {
        id: entry.id,
        label: entry.label,
        orgEmail: entry.orgEmail,
        maskedApiKey: maskedPrivate,
        maskedPublicKey: maskedPublic,
        assignedUserId: entry.assignedUserId,
        assignedUser: entry.assignedUser,
        createdAt: entry.createdAt
      };
    });

    res.json({ keys, total, available });
  } catch (error) {
    console.error('List VAPI key pool error:', error);
    res.status(500).json({ error: 'Failed to fetch key pool' });
  }
};

// POST /api/vapi-key-pool - Add a new key pair (OWNER only)
const addKey = async (req, res) => {
  try {
    const { label, orgEmail, vapiApiKey, vapiPublicKey } = req.body;

    if (!vapiApiKey || !vapiPublicKey) {
      return res.status(400).json({ error: 'Both VAPI API Key and Public Key are required' });
    }

    const entry = await req.prisma.vapiKeyPool.create({
      data: {
        label: label || null,
        orgEmail: orgEmail ? orgEmail.trim() : null,
        vapiApiKey: encrypt(vapiApiKey),
        vapiPublicKey: encrypt(vapiPublicKey)
      }
    });

    res.status(201).json({
      message: 'Key pair added to pool',
      key: {
        id: entry.id,
        label: entry.label,
        orgEmail: entry.orgEmail,
        maskedApiKey: mask(vapiApiKey),
        maskedPublicKey: mask(vapiPublicKey),
        assignedUserId: null,
        assignedUser: null,
        createdAt: entry.createdAt
      }
    });
  } catch (error) {
    console.error('Add VAPI key pool error:', error);
    res.status(500).json({ error: 'Failed to add key pair' });
  }
};

// PUT /api/vapi-key-pool/:id - Update label/orgEmail on an existing entry
// (OWNER only). Only the human-readable metadata is editable; rotating
// the actual keys requires removing + re-adding the pool entry to make
// the encryption explicit.
const updateKey = async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const { label, orgEmail } = req.body || {};

    const entry = await req.prisma.vapiKeyPool.findUnique({ where: { id: entryId } });
    if (!entry) return res.status(404).json({ error: 'Key pair not found' });

    const updated = await req.prisma.vapiKeyPool.update({
      where: { id: entryId },
      data: {
        label: label !== undefined ? (label || null) : entry.label,
        orgEmail: orgEmail !== undefined ? (orgEmail ? orgEmail.trim() : null) : entry.orgEmail,
      },
      include: { assignedUser: { select: { id: true, email: true, name: true, role: true } } },
    });

    let maskedPrivate = '****';
    let maskedPublic = '****';
    try { maskedPrivate = mask(decrypt(updated.vapiApiKey)); } catch {}
    try { maskedPublic = mask(decrypt(updated.vapiPublicKey)); } catch {}

    res.json({
      message: 'Key pair updated',
      key: {
        id: updated.id,
        label: updated.label,
        orgEmail: updated.orgEmail,
        maskedApiKey: maskedPrivate,
        maskedPublicKey: maskedPublic,
        assignedUserId: updated.assignedUserId,
        assignedUser: updated.assignedUser,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    console.error('Update VAPI key pool error:', error);
    res.status(500).json({ error: 'Failed to update key pair' });
  }
};

// DELETE /api/vapi-key-pool/:id - Remove an unassigned key pair (OWNER only)
const removeKey = async (req, res) => {
  try {
    const { id } = req.params;
    const entryId = parseInt(id);

    const entry = await req.prisma.vapiKeyPool.findUnique({
      where: { id: entryId }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Key pair not found' });
    }

    if (entry.assignedUserId) {
      return res.status(400).json({ error: 'Cannot remove an assigned key pair. Unassign it first by deleting the associated account.' });
    }

    await req.prisma.vapiKeyPool.delete({
      where: { id: entryId }
    });

    res.json({ message: 'Key pair removed from pool' });
  } catch (error) {
    console.error('Remove VAPI key pool error:', error);
    res.status(500).json({ error: 'Failed to remove key pair' });
  }
};

module.exports = {
  listKeys,
  addKey,
  updateKey,
  removeKey
};
