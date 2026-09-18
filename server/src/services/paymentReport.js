// The usage report emailed after a payment.
//
// A client pays their whole outstanding balance, so the report has to account
// for exactly that amount: every call and message between the end of the last
// settled period and the moment this payment was started, with the date and
// time of each one, grouped by day.
//
// The window is frozen on the CreditPurchase when the checkout is created
// (periodStart/periodEnd). Usage that lands while the client is paying belongs
// to the next report, not this one — that is what keeps report and amount equal.

const { decryptPHI } = require('../utils/phiEncryption');
const { resolveReceiptEmail } = require('./creditCheckout');
const gmailService = require('./gmailService');

// Day boundaries and clock times are shown in this zone. Override per install.
const TIMEZONE = process.env.PAYMENT_REPORT_TIMEZONE || 'America/Bogota';

// Past this many lines the email stops listing every entry and shows day totals
// instead — a month of chatbot traffic would otherwise be unreadable (and huge).
const MAX_DETAIL_ROWS = 400;

const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
const fmtDay = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TIMEZONE, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
const fmtTime = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(d);
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Work out the window a payment covers. Uses the frozen one when present;
 * otherwise falls back to "since the previous settled payment".
 */
async function resolvePeriod(prisma, purchase) {
  if (purchase.periodStart && purchase.periodEnd) {
    return { start: new Date(purchase.periodStart), end: new Date(purchase.periodEnd) };
  }
  const previous = await prisma.creditPurchase.findFirst({
    where: { userId: purchase.userId, status: 'completed', id: { lt: purchase.id } },
    orderBy: { id: 'desc' },
    select: { periodEnd: true, createdAt: true },
  });
  return {
    start: previous ? new Date(previous.periodEnd || previous.createdAt) : new Date(purchase.createdAt.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(purchase.createdAt),
  };
}

/** Everything the email needs: the window, the day-by-day usage and the totals. */
async function buildPaymentReport(prisma, purchase) {
  const { start, end } = await resolvePeriod(prisma, purchase);
  const window = { userId: purchase.userId, createdAt: { gte: start, lte: end } };

  const [calls, messages] = await Promise.all([
    prisma.callLog.findMany({ where: window, orderBy: { createdAt: 'asc' } }).catch(() => []),
    prisma.chatbotMessage.findMany({ where: { ...window, isTest: false }, orderBy: { createdAt: 'asc' } }).catch(() => []),
  ]);

  const items = [];
  for (const log of calls) {
    const d = decryptPHI(log);
    items.push({
      at: log.createdAt,
      kind: 'Llamada',
      detail: [d.customerNumber || log.type || 'Llamada', d.durationSeconds ? `${Math.round(d.durationSeconds / 60)} min` : null]
        .filter(Boolean).join(' · '),
      cost: d.costCharged || 0,
    });
  }
  for (const m of messages) {
    items.push({
      at: m.createdAt,
      kind: 'Mensaje',
      detail: [m.chatbotName, m.contactName || m.sessionId].filter(Boolean).join(' · '),
      cost: m.costCharged || 0,
    });
  }
  items.sort((a, b) => a.at - b.at);

  const days = [];
  for (const item of items) {
    const key = dayKey(item.at);
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, label: fmtDay(item.at), items: [], total: 0, calls: 0, messages: 0 };
      days.push(day);
    }
    day.items.push(item);
    day.total += item.cost;
    if (item.kind === 'Llamada') day.calls += 1; else day.messages += 1;
  }

  const callsCost = calls.reduce((sum, l) => sum + (decryptPHI(l).costCharged || 0), 0);
  const messagesCost = messages.reduce((sum, m) => sum + (m.costCharged || 0), 0);

  return {
    period: { start, end },
    timezone: TIMEZONE,
    days,
    totals: {
      calls: calls.length,
      messages: messages.length,
      callsCost,
      messagesCost,
      usage: callsCost + messagesCost,
      paid: purchase.amount,
    },
    detailed: items.length <= MAX_DETAIL_ROWS,
  };
}

function renderPaymentReportHtml(report, { brandName, accountName, paidAt }) {
  const { period, totals, days, detailed } = report;

  const rows = days.map((day) => {
    const header = `
      <tr style="background:#f3f4f6">
        <td colspan="3" style="padding:8px 10px;font-weight:600;color:#111827;text-transform:capitalize">
          ${escape(day.label)}
        </td>
        <td style="padding:8px 10px;font-weight:600;text-align:right;color:#111827">${money(day.total)}</td>
      </tr>`;

    if (!detailed) {
      return `${header}
      <tr>
        <td colspan="4" style="padding:6px 10px;color:#6b7280;font-size:13px">
          ${day.calls} llamada(s) · ${day.messages} mensaje(s)
        </td>
      </tr>`;
    }

    const lines = day.items.map((item) => `
      <tr>
        <td style="padding:6px 10px;color:#6b7280;font-size:13px;white-space:nowrap">${escape(fmtTime(item.at))}</td>
        <td style="padding:6px 10px;font-size:13px">${escape(item.kind)}</td>
        <td style="padding:6px 10px;color:#6b7280;font-size:13px">${escape(item.detail)}</td>
        <td style="padding:6px 10px;font-size:13px;text-align:right">${money(item.cost)}</td>
      </tr>`).join('');

    return header + lines;
  }).join('');

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;color:#111827">
    <h2 style="margin:0 0 4px">Reporte de consumo pagado</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">
      ${escape(brandName || '')}${brandName ? ' · ' : ''}${escape(accountName || '')}
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:10px;background:#ecfdf5;border-radius:8px">
          <div style="font-size:12px;color:#065f46;text-transform:uppercase">Pago recibido</div>
          <div style="font-size:24px;font-weight:700;color:#065f46">${money(totals.paid)}</div>
          <div style="font-size:12px;color:#065f46">${escape(fmtDay(paidAt))} · ${escape(fmtTime(paidAt))}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;margin:0 0 6px">
      <strong>Período cubierto:</strong><br>
      Desde ${escape(fmtDay(period.start))} · ${escape(fmtTime(period.start))}<br>
      Hasta ${escape(fmtDay(period.end))} · ${escape(fmtTime(period.end))}
    </p>
    <p style="font-size:12px;color:#6b7280;margin:0 0 20px">Horas en zona ${escape(report.timezone)}.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Llamadas (${totals.calls})</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${money(totals.callsCost)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">Mensajes (${totals.messages})</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${money(totals.messagesCost)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:700">Consumo del período</td>
        <td style="padding:8px 10px;font-weight:700;text-align:right">${money(totals.usage)}</td>
      </tr>
    </table>

    <h3 style="font-size:15px;margin:0 0 8px">Detalle por día</h3>
    ${days.length === 0
      ? '<p style="font-size:14px;color:#6b7280">No hubo consumo registrado en este período.</p>'
      : `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">${rows}</table>`}
    ${detailed ? '' : `<p style="font-size:12px;color:#6b7280;margin-top:8px">Se muestran totales por día: el período tiene demasiadas líneas para listarlas una por una. El detalle completo está en el panel.</p>`}

    <p style="font-size:12px;color:#9ca3af;margin-top:24px">
      El recibo del pago lo envía Stripe por separado. Este correo es el detalle de lo que cubre ese pago.
    </p>
  </div>`;
}

/**
 * Build and email the report for a settled payment. Fire-and-forget: a failure
 * here is logged and never touches the payment, which already went through.
 */
async function sendPaymentReport(prisma, purchase) {
  try {
    if (purchase.reportSentAt) return { sent: false, reason: 'already sent' };

    const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
    if (!user) return { sent: false, reason: 'account not found' };

    const [report, to] = await Promise.all([
      buildPaymentReport(prisma, purchase),
      resolveReceiptEmail(prisma, user),
    ]);

    const { partnerBrandName } = await brandOf(prisma, user);
    const accountName = user.companyName || user.name || user.email;
    const html = renderPaymentReportHtml(report, {
      brandName: partnerBrandName,
      accountName,
      paidAt: new Date(),
    });

    const result = await gmailService.sendEmail(prisma, user, {
      to,
      subject: `Reporte de consumo pagado · ${money(purchase.amount)} · ${accountName}`,
      html,
    });

    if (result.sent) {
      await prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: { reportSentAt: new Date() },
      }).catch(() => {});
      console.log(`[PaymentReport] Sent to ${to} for purchase #${purchase.id}`);
    } else {
      console.warn(`[PaymentReport] Not sent for purchase #${purchase.id}: ${result.reason}`);
    }
    return result;
  } catch (error) {
    console.error('[PaymentReport] Failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

/** The brand the client knows: the nearest partner above with a company name. */
async function brandOf(prisma, user) {
  const { getAncestorPartners } = require('../utils/whopConfig');
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  for (const a of ancestors) {
    const partner = await prisma.user.findUnique({ where: { id: a.id }, select: { companyName: true } });
    if (partner?.companyName) return { partnerBrandName: partner.companyName };
  }
  return { partnerBrandName: null };
}

module.exports = {
  buildPaymentReport,
  renderPaymentReportHtml,
  sendPaymentReport,
  TIMEZONE,
};
