// Sending mail through a connected Google account.
//
// The platform has no mail server of its own. Accounts already connect Google
// for Calendar, Sheets and Docs (CalendarIntegration, provider "google"), and
// that connection now also asks for gmail.send — permission to send as that
// account, and nothing else: it cannot read the mailbox.
//
// Mail for a client goes out from the partner that bills them when that partner
// has connected Google, so the client sees their provider as the sender rather
// than the platform.

const { getAccessToken } = require('./googleWorkspaceService');
const { getAncestorPartners } = require('../utils/whopConfig');

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/** A connected Google account for this user, or null. */
async function connectionFor(prisma, userId) {
  return prisma.calendarIntegration.findFirst({
    where: { userId, provider: 'google', isConnected: true, accessToken: { not: null } },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Who sends mail on behalf of this account: the nearest partner above it with
 * Google connected, else the platform OWNER, else nobody.
 * Returns { integration, senderEmail } or null.
 */
async function resolveSender(prisma, user) {
  const candidates = [];
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  candidates.push(...ancestors.map((a) => a.id));

  const owner = await prisma.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } });
  if (owner) candidates.push(owner.id);

  for (const id of candidates) {
    const integration = await connectionFor(prisma, id);
    if (integration) {
      return { integration, senderEmail: integration.externalAccountId || integration.accountLabel || null };
    }
  }
  return null;
}

// Gmail takes the whole RFC 2822 message, base64url encoded.
function encodeMessage({ to, from, subject, html, replyTo }) {
  const headers = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    replyTo ? `Reply-To: ${replyTo}` : null,
    // Anything beyond ASCII in a header (an accent in a company name) has to be
    // encoded or Gmail mangles it.
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);

  const body = Buffer.from(html, 'utf8').toString('base64');
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(message, 'utf8').toString('base64url');
}

/**
 * Send one email on behalf of `forUserId`'s provider. Returns
 * { sent, senderEmail } or { sent: false, reason } — never throws, since no
 * email must ever break a payment that already went through.
 */
async function sendEmail(prisma, forUser, { to, subject, html, replyTo }) {
  try {
    if (!to) return { sent: false, reason: 'no recipient' };

    const sender = await resolveSender(prisma, forUser);
    if (!sender) return { sent: false, reason: 'no Google account connected to send from' };

    const token = await getAccessToken(prisma, sender.integration);
    const raw = encodeMessage({
      to,
      from: sender.senderEmail || undefined,
      subject,
      html,
      replyTo: replyTo || sender.senderEmail || undefined,
    });

    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[Gmail] Send failed:', response.status, detail.slice(0, 400));
      // The most common cause by far: the account connected Google before
      // gmail.send was requested, so the token simply lacks the permission.
      const reason = response.status === 403
        ? 'the connected Google account has not granted permission to send mail — reconnect it'
        : `Gmail rejected the message (${response.status})`;
      return { sent: false, reason };
    }

    return { sent: true, senderEmail: sender.senderEmail };
  } catch (error) {
    console.error('[Gmail] Send error:', error.message);
    return { sent: false, reason: error.message };
  }
}

module.exports = { sendEmail, resolveSender };
