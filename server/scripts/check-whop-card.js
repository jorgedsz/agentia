// Inspect the Whop card/auto-recharge state for a user (by partial email).
// Usage: node server/scripts/check-whop-card.js jhelectr
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const needle = process.argv[2] || 'jhelectr';

(async () => {
  const users = await prisma.user.findMany({
    where: { email: { contains: needle, mode: 'insensitive' } },
    select: {
      id: true, email: true, name: true, vapiCredits: true,
      whopCustomerId: true, whopMemberId: true, whopPaymentMethodId: true,
      autoRechargeEnabled: true, autoRechargeThreshold: true, autoRechargeAmount: true,
      autoRechargeFailCount: true, autoRechargeLastAt: true,
    },
  });

  if (!users.length) {
    console.log(`No user matches email containing "${needle}"`);
    return;
  }

  for (const u of users) {
    console.log('\n=== USER', u.id, u.email, '===');
    console.log('  name              :', u.name);
    console.log('  vapiCredits       :', u.vapiCredits);
    console.log('  whopCustomerId    :', u.whopCustomerId || '(null)');
    console.log('  whopMemberId      :', u.whopMemberId || '(null)   <-- needed for off-session');
    console.log('  whopPaymentMethodId:', u.whopPaymentMethodId || '(null)   <-- THE SAVED CARD');
    console.log('  autoRechargeEnabled:', u.autoRechargeEnabled);
    console.log('  threshold / amount :', u.autoRechargeThreshold, '/', u.autoRechargeAmount);
    console.log('  failCount          :', u.autoRechargeFailCount, '(disables at 3)');
    console.log('  lastAttemptAt      :', u.autoRechargeLastAt);

    const purchases = await prisma.creditPurchase.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, amount: true, status: true, kind: true, whopPlanId: true, createdAt: true },
    });
    console.log('  --- last credit purchases ---');
    for (const p of purchases) {
      console.log(`   #${p.id} $${p.amount} ${p.status.padEnd(9)} kind=${(p.kind || '-').padEnd(13)} plan=${p.whopPlanId || '-'} ${p.createdAt.toISOString()}`);
    }
  }
})()
  .catch((e) => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());
