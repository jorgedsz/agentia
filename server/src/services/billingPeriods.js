// Monthly statements: one calendar month of an account's usage that can be
// reported on and paid on its own.
//
// Months are derived, not bookkept by hand. Opening the screen recomputes every
// month that is still unsettled, so a statement always reflects the logs behind
// it; once a month is paid its amounts are frozen, because a paid statement has
// to keep showing what was actually charged.

const { decryptPHI } = require('../utils/phiEncryption');

// Month boundaries follow this zone, so "September" means the client's September.
const TIMEZONE = process.env.PAYMENT_REPORT_TIMEZONE || 'America/Bogota';

const round = (n) => Math.round((n || 0) * 100) / 100;

/** How far ahead of UTC `tz` is at that moment, in milliseconds. */
function zoneOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});

  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** The instant local midnight of year-month-1 happens, as a UTC Date. */
function monthStart(year, month, tz = TIMEZONE) {
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  // Two passes: the first offset is measured at the wrong instant when the guess
  // lands on the other side of a DST switch.
  let instant = naive - zoneOffsetMs(new Date(naive), tz);
  instant = naive - zoneOffsetMs(new Date(instant), tz);
  return new Date(instant);
}

/** [start, end] of a month, end being the last millisecond before the next one. */
function monthRange(year, month, tz = TIMEZONE) {
  const start = monthStart(year, month, tz);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(monthStart(nextYear, nextMonth, tz).getTime() - 1);
  return { start, end };
}

/** First instant of a YYYY-MM-DD in the billing zone. */
function dayStart(isoDate, tz = TIMEZONE) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  let instant = naive - zoneOffsetMs(new Date(naive), tz);
  instant = naive - zoneOffsetMs(new Date(instant), tz);
  return new Date(instant);
}

/** Last millisecond of a YYYY-MM-DD in the billing zone. */
function dayEnd(isoDate, tz = TIMEZONE) {
  const start = dayStart(isoDate, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** "1 de septiembre – 15 de septiembre de 2026", for a free range. */
function rangeLabel(start, end, tz = TIMEZONE) {
  const fmt = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Which month (in the billing zone) a moment belongs to. */
function monthOf(date, tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' })
    .format(date).split('-');
  return { year: Number(parts[0]), month: Number(parts[1]) };
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TIMEZONE, month: 'long', year: 'numeric' })
    .format(monthStart(year, month));
}

/** What an account used in a window: counts and cost, split by kind. */
async function usageIn(prisma, userId, start, end) {
  const window = { userId, createdAt: { gte: start, lte: end } };

  const [calls, messages] = await Promise.all([
    prisma.callLog.findMany({ where: window, select: { id: true, costCharged: true } }).catch(() => []),
    prisma.chatbotMessage.aggregate({
      where: { ...window, isTest: false },
      _count: true,
      _sum: { costCharged: true },
    }).catch(() => null),
  ]);

  // Call costs may be encrypted at rest, so they are summed row by row.
  const callsAmount = calls.reduce((sum, row) => sum + (decryptPHI(row).costCharged || 0), 0);
  const messagesAmount = messages?._sum?.costCharged || 0;

  return {
    callsCount: calls.length,
    messagesCount: messages?._count || 0,
    callsAmount: round(callsAmount),
    messagesAmount: round(messagesAmount),
    usageAmount: round(callsAmount + messagesAmount),
  };
}

/** The first month worth showing: the account's first usage, else when it was created. */
async function firstMonthFor(prisma, user) {
  const [firstCall, firstMessage] = await Promise.all([
    prisma.callLog.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }).catch(() => null),
    prisma.chatbotMessage.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }).catch(() => null),
  ]);

  const candidates = [firstCall?.createdAt, firstMessage?.createdAt, user.createdAt].filter(Boolean);
  const earliest = candidates.sort((a, b) => new Date(a) - new Date(b))[0] || new Date();
  return monthOf(new Date(earliest));
}

/**
 * Bring an account's statements up to date and return them, newest first.
 * Paid months are left untouched; the rest are recomputed from the logs.
 */
async function syncPeriods(prisma, user, { months = 24 } = {}) {
  const now = new Date();
  const current = monthOf(now);
  const first = await firstMonthFor(prisma, user);

  // Walk from the current month backwards, stopping at the first month with
  // usage (or at the cap) so an old account doesn't generate years of blanks.
  const wanted = [];
  let { year, month } = current;
  for (let i = 0; i < months; i += 1) {
    wanted.push({ year, month });
    if (year === first.year && month === first.month) break;
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }

  const existing = await prisma.billingPeriod.findMany({ where: { userId: user.id } });
  const byKey = new Map(existing.map((p) => [`${p.year}-${p.month}`, p]));

  for (const { year: y, month: m } of wanted) {
    const key = `${y}-${m}`;
    const row = byKey.get(key);
    if (row?.status === 'paid') continue; // frozen: it records what was charged

    const { start, end } = monthRange(y, m);
    const usage = await usageIn(prisma, user.id, start, end);
    const isCurrent = y === current.year && m === current.month;
    const settled = row?.settledAmount || 0;
    // A month still running is "open"; a closed one is pending until covered.
    const status = isCurrent ? 'open' : (settled >= usage.usageAmount && usage.usageAmount > 0 ? 'paid' : 'pending');

    const data = {
      periodStart: start, periodEnd: end, ...usage, status,
      ...(status === 'paid' && !row?.paidAt ? { paidAt: new Date() } : {}),
    };

    if (row) {
      await prisma.billingPeriod.update({ where: { id: row.id }, data });
    } else {
      await prisma.billingPeriod.create({ data: { userId: user.id, year: y, month: m, ...data } });
    }
  }

  const periods = await prisma.billingPeriod.findMany({
    where: { userId: user.id },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  return periods.map(decorate);
}

/** What the screen needs on top of the stored row. */
function decorate(period) {
  const outstanding = round(Math.max(0, (period.usageAmount || 0) - (period.settledAmount || 0)));
  return {
    ...period,
    label: monthLabel(period.year, period.month),
    outstanding,
    // Only a closed month with something still owed can be charged.
    payable: period.status === 'pending' && outstanding > 0,
  };
}

/**
 * Apply a payment to a month. Returns the updated statement. Used both by the
 * card charge and by marking one paid by hand.
 */
async function applyPayment(prisma, periodId, amount, { note } = {}) {
  const period = await prisma.billingPeriod.findUnique({ where: { id: periodId } });
  if (!period) return null;

  const settled = round((period.settledAmount || 0) + amount);
  const covered = settled >= round(period.usageAmount);

  return prisma.billingPeriod.update({
    where: { id: periodId },
    data: {
      settledAmount: settled,
      status: covered ? 'paid' : period.status,
      paidAt: covered ? new Date() : period.paidAt,
      ...(note ? { note } : {}),
    },
  });
}

module.exports = {
  TIMEZONE,
  dayStart,
  dayEnd,
  rangeLabel,
  monthRange,
  monthOf,
  monthLabel,
  usageIn,
  syncPeriods,
  decorate,
  applyPayment,
};
