const { logAudit } = require('../utils/auditLog');

const listFolders = async (req, res) => {
  try {
    const folders = await req.prisma.agentFolder.findMany({
      where: { userId: req.user.id },
      orderBy: { name: 'asc' },
      include: { _count: { select: { agents: true } } }
    });
    res.json({
      folders: folders.map(f => ({
        id: f.id,
        name: f.name,
        agentCount: f._count.agents,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
      }))
    });
  } catch (error) {
    console.error('List folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

const createFolder = async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    if (name.length > 60) return res.status(400).json({ error: 'Folder name too long (max 60 chars)' });

    const folder = await req.prisma.agentFolder.create({
      data: { name, userId: req.user.id }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'folder.create',
      resourceType: 'folder',
      resourceId: folder.id,
      details: { name: folder.name },
      req
    });

    res.status(201).json({ folder: { ...folder, agentCount: 0 } });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

const renameFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    if (name.length > 60) return res.status(400).json({ error: 'Folder name too long (max 60 chars)' });

    const existing = await req.prisma.agentFolder.findFirst({
      where: { id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Folder not found' });

    const folder = await req.prisma.agentFolder.update({
      where: { id },
      data: { name }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'folder.rename',
      resourceType: 'folder',
      resourceId: folder.id,
      details: { from: existing.name, to: folder.name },
      req
    });

    res.json({ folder });
  } catch (error) {
    console.error('Rename folder error:', error);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
};

// Deletes the folder. Agents previously in it become Uncategorized
// (folderId becomes null via the SetNull cascade in the schema).
const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await req.prisma.agentFolder.findFirst({
      where: { id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Folder not found' });

    await req.prisma.agentFolder.delete({ where: { id } });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'folder.delete',
      resourceType: 'folder',
      resourceId: id,
      details: { name: existing.name },
      req
    });

    res.json({ message: 'Folder deleted' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

module.exports = { listFolders, createFolder, renameFolder, deleteFolder };
