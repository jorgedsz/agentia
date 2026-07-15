// Diagnose why auto-recharge isn't debiting for an account.
// Usage: node server/scripts/check-whop-card.js <email-substring>
//   e.g. node server/scripts/check-whop-card.js lmconsulting
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const needle = process.argv[2] || 'lmconsulting';

const AUTO_RECHARGE_MAX_FAILS = 3;

(async () => {
  const users = await prisma.user.findMany({
    where: { OR: [
      { email: { contains: needle, mode: 'insensitive' } },
      { name: { contains: needle, mode: 'insensitive' } },
    ] },
    select: {
      id: true, email: true, name: true, role: true, vapiCredits: true,
      whopCustomerId: true, whopMemberId: true, whopPaymentMethodId: true,
      whopPaymentMethodIdBackup: true, whopMemberIdBackup: true,
      autoRechargeEnabled: true, autoRechargeThreshold: true, autoRechargeAmount: true,
      autoRechargeFailCount: true, autoRechargeLastAt: true,
      autoRechargeLastError: true, autoRechargeLastErrorAt: true,
      // partner Whop (only meaningful on WHITELABEL)
      whopApiKey: true, whopCompanyId: true, whopWebhookSecret: true,
      whopWebhookToken: true, whopCreditsProductId: true,
      whitelabelId: true, agencyId: true,
    },
  });

  if (!users.length) { console.log(`No user matches "${needle}"`); return; }

  for (const u of users) {
    console.log('\n════════ USER', u.id, u.email, `(${u.role}) ════════`);
    console.log('  balance            :', u.vapiCredits);
    console.log('  auto-recharge ON   :', u.autoRechargeEnabled);
    console.log('  threshold / amount :', u.autoRechargeThreshold, '/', u.autoRechargeAmount);
    console.log('  primary card       :', u.whopPaymentMethodId || '(NONE)');
    console.log('  backup card        :', u.whopPaymentMethodIdBackup || '(none)');
    console.log('  whopMemberId       :', u.whopMemberId || '(none)');
    console.log('  whopCustomerId     :', u.whopCustomerId || '(none)');
    console.log('  failCount          :', u.autoRechargeFailCount, `(disables at ${AUTO_RECHARGE_MAX_FAILS})`);
    console.log('  lastAttemptAt      :', u.autoRechargeLastAt);
    console.log('  lastError          :', u.autoRechargeLastError || '(none)');
    console.log('  lastErrorAt        :', u.autoRechargeLastErrorAt);

    // Would the scheduler pick this account up?
    const reasons = [];
    if (!u.autoRechargeEnabled) reasons.push('auto-recharge is OFF (maybe disabled after 3 fails)');
    if (!u.whopPaymentMethodId) reasons.push('no saved primary card');
    if (!(u.autoRechargeThreshold > 0)) reasons.push('no/zero threshold');
    if (!(u.autoRechargeAmount > 0)) reasons.push('no/zero recharge amount');
    if (u.autoRechargeThreshold != null && u.vapiCredits >= u.autoRechargeThreshold) reasons.push('balance is NOT below threshold');
    console.log('  → SCHEDULER PICKS IT UP:', reasons.length ? 'NO — ' + reasons.join('; ') : 'YES, should charge');

    if (u.role === 'WHITELABEL') {
      console.log('  --- partner Whop ---');
      console.log('    configured       :', !!(u.whopApiKey && u.whopCompanyId));
      console.log('    companyId        :', u.whopCompanyId || '(none)');
      console.log('    hasApiKey        :', !!u.whopApiKey);
      console.log('    hasWebhookSecret :', !!u.whopWebhookSecret);
      console.log('    webhookToken     :', u.whopWebhookToken || '(none)');
    }

    const purchases = await prisma.creditPurchase.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' }, take: 8,
      select: { id: true, amount: true, status: true, kind: true, paymentMethodId: true, errorMessage: true, whopPlanId: true, createdAt: true },
    });
    console.log('  --- last credit purchases ---');
    if (!purchases.length) console.log('   (none)');
    for (const p of purchases) {
      console.log(`   #${p.id} $${p.amount} ${String(p.status).padEnd(9)} ${(p.kind||'-').padEnd(13)} card=${p.paymentMethodId||'-'} ${p.errorMessage ? 'ERR="'+p.errorMessage+'" ' : ''}${p.createdAt.toISOString()}`);
    }
  }
})()
  .catch((e) => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());
