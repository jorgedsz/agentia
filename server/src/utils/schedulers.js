// The background jobs (calls, follow-ups, recurring charges, auto-recharge,
// calendar refresh) must run in ONE copy of Sword only: two copies against the
// same database would place calls twice and charge cards twice. TAREAS=off
// starts the web server without them - the copy that is serving but is not
// the one in charge (during a move between servers, or a standby).
function startSchedulers(prisma, schedulers, env = process.env) {
  if (String(env.TAREAS || '').trim().toLowerCase() === 'off') {
    console.log('[Tareas] TAREAS=off: background jobs NOT started in this copy');
    return false;
  }
  for (const { start } of schedulers) start(prisma);
  return true;
}

module.exports = { startSchedulers };
