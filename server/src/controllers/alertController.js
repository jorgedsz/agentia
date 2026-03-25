/**
 * GET /api/wa-alerts
 * All unresolved alerts across user's projects
 */
const listAlerts = async (req, res) => {
  try {
    const alerts = await req.prisma.waProjectAlert.findMany({
      where: {
        project: { userId: req.user.id },
        resuelta: false
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, nombre: true, colorEmoji: true } },
        message: { select: { contenido: true, sender: true, timestamp: true } }
      }
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Error listing alerts:', error);
    res.status(500).json({ error: 'Failed to list alerts' });
  }
};

/**
 * PATCH /api/wa-alerts/:id/resolve
 * Resolve a single alert
 */
const resolveAlert = async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);

    // Verify ownership
    const alert = await req.prisma.waProjectAlert.findFirst({
      where: { id: alertId, project: { userId: req.user.id } }
    });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    await req.prisma.waProjectAlert.update({
      where: { id: alertId },
      data: { resuelta: true }
    });

    // Update project alertasCount
    const unresolvedCount = await req.prisma.waProjectAlert.count({
      where: { projectId: alert.projectId, resuelta: false }
    });
    await req.prisma.waProject.update({
      where: { id: alert.projectId },
      data: { alertasCount: unresolvedCount }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

/**
 * PATCH /api/wa-alerts/project/:projectId/resolve-all
 * Resolve all alerts for a project
 */
const resolveAllForProject = async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Verify ownership
    const project = await req.prisma.waProject.findFirst({
      where: { id: projectId, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await req.prisma.waProjectAlert.updateMany({
      where: { projectId, resuelta: false },
      data: { resuelta: true }
    });

    await req.prisma.waProject.update({
      where: { id: projectId },
      data: { alertasCount: 0 }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error resolving all alerts:', error);
    res.status(500).json({ error: 'Failed to resolve alerts' });
  }
};

module.exports = { listAlerts, resolveAlert, resolveAllForProject };
