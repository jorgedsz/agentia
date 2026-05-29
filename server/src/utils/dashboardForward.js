/**
 * Pre-call balance gate for agents that mirror their activity to an
 * external dashboard (the dashboardForwardUrl + dashboardForwardSecret
 * fields on the Agent row, OWNER-only).
 *
 * Returns:
 *   - { skipped: true } when the agent has no external dashboard wired.
 *   - { allowed: true, availableBalance, ratePerMinute } when there's
 *     enough balance to start the call.
 *   - { allowed: false, reason, noBalanceMessage, availableBalance } when
 *     the dashboard reports no balance.
 *   - { skipped: true, error } when the dashboard call itself failed —
 *     we deliberately let the call proceed so sword-ai's own credit
 *     check remains the source of truth and a dashboard outage doesn't
 *     break the whole platform.
 *
 * `estimatedMinutes` is forwarded to the dashboard so it can decide
 * whether the projected cost fits. 5 is a sensible default for outbound
 * agents; pass the actual config when you know it.
 */
async function checkDashboardBalance(agent, { estimatedMinutes = 5 } = {}) {
  if (!agent?.dashboardForwardUrl || !agent?.dashboardForwardSecret) {
    return { skipped: true };
  }
  try {
    const url = new URL('/api/calls/check-balance', baseOf(agent.dashboardForwardUrl));
    if (estimatedMinutes) url.searchParams.set('estimatedMinutes', String(estimatedMinutes));
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'x-ingest-secret': agent.dashboardForwardSecret },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      console.warn(`[dashboardForward] check-balance HTTP ${res.status} on agent ${agent.id} — allowing call to proceed`);
      return { skipped: true, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    if (data.hasBalance) {
      return {
        allowed: true,
        availableBalance: data.availableBalance,
        ratePerMinute: data.ratePerMinute
      };
    }
    return {
      allowed: false,
      reason: 'no_balance',
      noBalanceMessage: data.noBalanceMessage || 'External dashboard reports no balance for this account.',
      availableBalance: data.availableBalance
    };
  } catch (err) {
    console.warn(`[dashboardForward] check-balance threw for agent ${agent.id}: ${err.message} — allowing call to proceed`);
    return { skipped: true, error: err.message };
  }
}

// Resolve the base origin of the forward URL. We assume the ingest path
// lives on the same host as the dashboard; agents store the ingest URL
// (POST /api/calls/ingest) and we derive /api/calls/check-balance from it.
function baseOf(forwardUrl) {
  try {
    const u = new URL(forwardUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return forwardUrl.replace(/\/api\/.*$/, '');
  }
}

module.exports = { checkDashboardBalance };
