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
    const { label, vapiApiKey, vapiPublicKey } = req.body;

    if (!vapiApiKey || !vapiPublicKey) {
      return res.status(400).json({ error: 'Both VAPI API Key and Public Key are required' });
    }

    const entry = await req.prisma.vapiKeyPool.create({
      data: {
        label: label || null,
        vapiApiKey: encrypt(vapiApiKey),
        vapiPublicKey: encrypt(vapiPublicKey)
      }
    });

    res.status(201).json({
      message: 'Key pair added to pool',
      key: {
        id: entry.id,
        label: entry.label,
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
  removeKey
};
