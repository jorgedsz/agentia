const { logAudit } = require('../utils/auditLog');

/**
 * Check if user has compliance-admin access.
 * Allowed: OWNER, AGENCY (direct login or admin team member).
 */
function hasComplianceAccess(req) {
  const role = req.user?.role;
  if (role !== 'OWNER' && role !== 'AGENCY') return false;
  if (req.isTeamMember && req.teamMember?.teamRole !== 'admin') return false;
  return true;
}

/**
 * GET /api/compliance/settings
 * Returns compliance settings for the current account (defaults if none exist).
 */
const getSettings = async (req, res) => {
  try {
    if (!hasComplianceAccess(req)) {
      return res.status(403).json({ error: 'Only account owners and agency admins can access compliance settings' });
    }

    const setting = await req.prisma.complianceSetting.findUnique({
      where: { userId: req.user.id }
    });

    if (!setting) {
      return res.json({
        hipaaEnabled: false,
        baaSignedDate: null,
        baaCounterparty: '',
        baaDocumentUrl: '',
        complianceOfficer: '',
        dataRetentionDays: 365,
        lastReviewDate: null,
        nextReviewDate: null,
        notes: ''
      });
    }

    res.json({
      hipaaEnabled: setting.hipaaEnabled,
      baaSignedDate: setting.baaSignedDate,
      baaCounterparty: setting.baaCounterparty || '',
      baaDocumentUrl: setting.baaDocumentUrl || '',
      complianceOfficer: setting.complianceOfficer || '',
      dataRetentionDays: setting.dataRetentionDays,
      lastReviewDate: setting.lastReviewDate,
      nextReviewDate: setting.nextReviewDate,
      notes: setting.notes || ''
    });
  } catch (error) {
    console.error('Get compliance settings error:', error);
    res.status(500).json({ error: 'Failed to fetch compliance settings' });
  }
};

/**
 * PUT /api/compliance/settings
 * Upsert compliance settings for the current account.
 */
const updateSettings = async (req, res) => {
  try {
    if (!hasComplianceAccess(req)) {
      return res.status(403).json({ error: 'Only account owners and agency admins can update compliance settings' });
    }

    const {
      hipaaEnabled,
      baaSignedDate,
      baaCounterparty,
      baaDocumentUrl,
      complianceOfficer,
      dataRetentionDays,
      lastReviewDate,
      nextReviewDate,
      notes
    } = req.body;

    const data = {
      hipaaEnabled: !!hipaaEnabled,
      baaSignedDate: baaSignedDate ? new Date(baaSignedDate) : null,
      baaCounterparty: baaCounterparty || null,
      baaDocumentUrl: baaDocumentUrl || null,
      complianceOfficer: complianceOfficer || null,
      dataRetentionDays: dataRetentionDays != null ? parseInt(dataRetentionDays, 10) : 365,
      lastReviewDate: lastReviewDate ? new Date(lastReviewDate) : null,
      nextReviewDate: nextReviewDate ? new Date(nextReviewDate) : null,
      notes: notes || null
    };

    const setting = await req.prisma.complianceSetting.upsert({
      where: { userId: req.user.id },
      create: { ...data, userId: req.user.id },
      update: data
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'compliance.settings.update',
      resourceType: 'compliance_setting',
      resourceId: setting.id,
      details: { hipaaEnabled: setting.hipaaEnabled },
      req
    });

    res.json({
      message: 'Compliance settings updated',
      hipaaEnabled: setting.hipaaEnabled,
      baaSignedDate: setting.baaSignedDate,
      baaCounterparty: setting.baaCounterparty || '',
      baaDocumentUrl: setting.baaDocumentUrl || '',
      complianceOfficer: setting.complianceOfficer || '',
      dataRetentionDays: setting.dataRetentionDays,
      lastReviewDate: setting.lastReviewDate,
      nextReviewDate: setting.nextReviewDate,
      notes: setting.notes || ''
    });
  } catch (error) {
    console.error('Update compliance settings error:', error);
    res.status(500).json({ error: 'Failed to update compliance settings' });
  }
};

/**
 * GET /api/compliance/audit-logs
 * Returns paginated audit logs with optional filters.
 * Query params: page, limit, action, resourceType, startDate, endDate
 */
const getAuditLogs = async (req, res) => {
  try {
    if (!hasComplianceAccess(req)) {
      return res.status(403).json({ error: 'Only account owners and agency admins can view audit logs' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };

    if (req.query.action) {
      where.action = { contains: req.query.action };
    }
    if (req.query.resourceType) {
      where.resourceType = req.query.resourceType;
    }
    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) where.createdAt.gte = new Date(req.query.startDate);
      if (req.query.endDate) where.createdAt.lte = new Date(req.query.endDate);
    }

    const [logs, total] = await Promise.all([
      req.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      req.prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

module.exports = { getSettings, updateSettings, getAuditLogs };
