/**
 * Fire-and-forget audit logging utility.
 * Logs actions to the AuditLog table without blocking the caller.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Object} params
 * @param {number} params.userId        - Account ID this action belongs to
 * @param {number} [params.actorId]     - Who performed the action
 * @param {string} [params.actorEmail]  - Email of the actor
 * @param {string} [params.actorType]   - "user" | "team_member" | "system"
 * @param {string} params.action        - e.g. "login", "agent.create"
 * @param {string} [params.resourceType]- e.g. "agent", "compliance_setting"
 * @param {string} [params.resourceId]  - ID of the affected resource
 * @param {Object} [params.details]     - Extra context (will be JSON-stringified)
 * @param {import('express').Request} [params.req] - Express request for IP/UA
 */
function logAudit(prisma, params) {
  const {
    userId,
    actorId,
    actorEmail,
    actorType,
    action,
    resourceType,
    resourceId,
    details,
    req
  } = params;

  const ipAddress = req
    ? req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress
    : null;
  const userAgent = req ? req.headers['user-agent'] : null;

  prisma.auditLog
    .create({
      data: {
        userId,
        actorId,
        actorEmail,
        actorType,
        action,
        resourceType,
        resourceId: resourceId != null ? String(resourceId) : null,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent
      }
    })
    .catch((err) => {
      console.error('Audit log write failed:', err.message);
    });
}

module.exports = { logAudit };
