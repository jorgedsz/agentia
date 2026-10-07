// The issuer side of invoicing: a partner's tax, its invoice numbering, and
// everything printed on the documents it issues.
//
// Who may touch this, read and write alike, is canConfigureBillingProfile in
// utils/accountAccess: the OWNER on any account, a WHITELABEL or an AGENCY on
// ITS OWN and nowhere else, a CLIENT nowhere. A partner configures its own
// issuer identity — nobody should have to ask the platform owner to fix their
// own RNC — but nothing below a partner may read it (a client has no business
// knowing its provider's bank account) and no partner may write one under an
// account it does not own.

const { logAudit } = require('../utils/auditLog');
const { canConfigureBillingProfile } = require('../utils/accountAccess');

// What a profile looks like before anyone has configured one. Mirrors the
// column defaults in schema.prisma, so the form a partner opens for the first
// time shows exactly what it would get by saving untouched.
const DEFAULTS = {
  taxEnabled: false,
  chargeTaxToClient: false,
  taxRate: 0,
  taxLabel: 'ITBIS',
  retentionRate: 0,
  invoicePrefix: 'FAC-',
  invoiceNextNumber: 1,
  invoicePadding: 6,
  issuerName: null,
  issuerRnc: null,
  logoUrl: null,
  brandName: null,
  slogan: null,
  bankName: null,
  bankAccount: null,
  swift: null,
  routingNumber: null,
  paymentMethod: null,
  paymentTerms: null,
  dueDays: 0,
  site1Name: null,
  site1Phone: null,
  site1City: null,
  site1Address: null,
  site2Name: null,
  site2Phone: null,
  site2City: null,
  site2Address: null,
  contactEmail: null,
  contactWeb: null,
};

// The editable fields, by kind. This allow-list IS the write surface: `req.body`
// is never spread into the update, so a request carrying `id`, `ownerId`,
// `createdAt` or anything else that is not listed here cannot reach the row —
// `ownerId` in particular would silently re-point a whole partner's fiscal
// history at another account.
const TEXT_FIELDS = [
  'issuerName', 'issuerRnc', 'logoUrl', 'brandName', 'slogan',
  'bankName', 'bankAccount', 'swift', 'routingNumber', 'paymentMethod', 'paymentTerms',
  'site1Name', 'site1Phone', 'site1City', 'site1Address',
  'site2Name', 'site2Phone', 'site2City', 'site2Address',
  'contactEmail', 'contactWeb',
];
// The two tax switches. Separate on purpose: `taxEnabled` makes this partner's
// INVOICES show the tax, `chargeTaxToClient` also charges it on top of every
// payment. See BillingProfile in schema.prisma and utils/taxes.js.
const BOOL_FIELDS = ['taxEnabled', 'chargeTaxToClient'];
const RATE_FIELDS = ['taxRate', 'retentionRate'];
const INT_FIELDS = ['invoiceNextNumber', 'invoicePadding', 'dueDays'];

const INT_BOUNDS = {
  // 1 is the first correlative; 0 or a negative would format a nonsense number.
  invoiceNextNumber: { min: 1, max: 99999999, label: 'El próximo número de factura' },
  // 20 zeros is already longer than any real fiscal number.
  invoicePadding: { min: 1, max: 20, label: 'La cantidad de dígitos del número' },
  dueDays: { min: 0, max: 365, label: 'Los días de vencimiento' },
};

const RATE_LABELS = {
  taxRate: 'La tasa de impuesto',
  retentionRate: 'La tasa de retención',
};

/** Shape a stored row (or the defaults) for the panel. */
function shape(profile) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = profile ? (profile[key] ?? DEFAULTS[key]) : DEFAULTS[key];
  }
  return out;
}

/**
 * Turn a request body into exactly the fields that may be written, coerced.
 * Pure: no database, no request, no response — only `{ data }` or `{ error }`,
 * which is what makes it testable on its own.
 *
 * Only keys actually present in the body are written, so a form that posts one
 * section never blanks the rest of the profile.
 */
function sanitizeProfileInput(body = {}) {
  const data = {};

  for (const key of BOOL_FIELDS) {
    if (body[key] === undefined) continue;
    data[key] = Boolean(body[key]);
  }

  for (const key of RATE_FIELDS) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    // Empty means "no rate", not "invalid": the column is NOT NULL, so it goes
    // to 0 rather than null.
    const value = raw === '' || raw === null ? 0 : parseFloat(raw);
    // A rate above 100 is always a typo (27 typed as 270, or a decimal written
    // as 0.27 and then "corrected" the wrong way) and it would multiply every
    // client's bill under this partner. Refused rather than stored.
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `${RATE_LABELS[key]} debe ser un número entre 0 y 100.` };
    }
    data[key] = value;
  }

  for (const key of INT_FIELDS) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    const value = raw === '' || raw === null ? DEFAULTS[key] : parseInt(raw, 10);
    const { min, max, label } = INT_BOUNDS[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      return { error: `${label} debe ser un número entero entre ${min} y ${max}.` };
    }
    data[key] = value;
  }

  // The tax label prints on every invoice and on the Stripe line item, and the
  // column is NOT NULL: blank falls back to the default instead of printing a
  // nameless tax row.
  if (body.taxLabel !== undefined) {
    data.taxLabel = String(body.taxLabel ?? '').trim() || DEFAULTS.taxLabel;
  }

  // An empty prefix is legitimate (numbering with nothing but digits), so it is
  // kept as the empty string rather than reset to the default.
  if (body.invoicePrefix !== undefined) {
    data.invoicePrefix = String(body.invoicePrefix ?? '').trim();
  }

  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined) continue;
    const value = String(body[key] ?? '').trim();
    // These columns are nullable, and the renderer already defaults an absent
    // value to '': storing '' would make "never filled in" and "deliberately
    // cleared" indistinguishable for no gain.
    data[key] = value || null;
  }

  return { data };
}

// The 403 both handlers answer with. Worded the same way whether the account
// exists or not, and checked BEFORE the account is looked up, so an id that is
// refused tells the caller nothing about whether that account is real.
const FORBIDDEN = 'No puedes configurar la facturación de esta cuenta.';

/**
 * The partner's invoicing profile, or the defaults when it has none yet.
 * GET /api/billing-profile/:userId
 */
const get = async (req, res) => {
  try {
    const ownerId = parseInt(req.params.userId);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ error: 'Cuenta no válida.' });

    // Before any lookup: a profile carries bank details and an RNC, so reading
    // somebody else's is as much of a leak as writing it.
    if (!canConfigureBillingProfile(req.user, ownerId)) {
      return res.status(403).json({ error: FORBIDDEN });
    }

    const owner = await req.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const profile = await req.prisma.billingProfile.findUnique({ where: { ownerId } });
    res.json({
      // So the panel can tell "not configured yet" (defaults shown) from a
      // saved profile that happens to match them.
      exists: !!profile,
      ownerId,
      profile: shape(profile),
    });
  } catch (error) {
    console.error('Error reading the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el perfil de facturación' });
  }
};

/**
 * Create or update the partner's invoicing profile.
 * PUT /api/billing-profile/:userId
 */
const set = async (req, res) => {
  try {
    const ownerId = parseInt(req.params.userId);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ error: 'Cuenta no válida.' });

    // FIRST, and before the upsert below for a reason: the write is keyed on
    // `ownerId` taken from the path, so an unguarded :userId is not merely a
    // way to edit somebody else's profile — upsert would CREATE one, minting an
    // issuer identity (RNC, bank account, numbering) under an account the
    // requester does not own, and switching on a tax that would then apply to
    // that account's whole subtree. Nothing is parsed, looked up or written
    // until this passes.
    if (!canConfigureBillingProfile(req.user, ownerId)) {
      return res.status(403).json({ error: FORBIDDEN });
    }

    const owner = await req.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para guardar.' });
    }

    const existing = await req.prisma.billingProfile.findUnique({ where: { ownerId } });

    // The numbering sequence is guarded, not just validated.
    //
    // Invoice carries @@unique([profileId, number]), so moving the counter back
    // into a range it has already issued does not fail here — it fails LATER,
    // inside issueInvoiceForPurchase, on the next payment that settles. And
    // emission there is fire-and-forget behind a real card charge: the client
    // would be charged and credited correctly and quietly receive no invoice,
    // with the only trace a log line. That is much worse than refusing the edit,
    // so a backward move is refused outright once the profile has issued
    // anything. Moving it FORWARD is always allowed (skipping a range is normal
    // when a partner migrates a sequence it was already using elsewhere), and a
    // profile with no invoices on file can be set to anything, which is what
    // makes first-time configuration unrestricted.
    if (existing && data.invoiceNextNumber !== undefined && data.invoiceNextNumber < existing.invoiceNextNumber) {
      const issued = await req.prisma.invoice.count({ where: { profileId: existing.id } });
      if (issued > 0) {
        return res.status(400).json({
          error: `El próximo número de factura no puede retroceder por debajo de ${existing.invoiceNextNumber}: `
            + `ya hay ${issued} factura(s) emitidas con esa secuencia y los números se repetirían.`,
        });
      }
    }

    const profile = await req.prisma.billingProfile.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data,
    });

    logAudit(req.prisma, {
      userId: ownerId,
      actorId: req.user.id,
      actorType: 'user',
      action: existing ? 'billing_profile.update' : 'billing_profile.create',
      resourceType: 'billing_profile',
      resourceId: String(profile.id),
      // The fields touched, not their values: this row holds bank details.
      details: {
        fields: Object.keys(data),
        taxEnabled: profile.taxEnabled,
        // Logged next to taxEnabled because this is the one that moves money:
        // turning it on makes every client under this partner pay the tax on
        // top of what it asked for.
        chargeTaxToClient: profile.chargeTaxToClient,
        taxRate: profile.taxRate,
        // Logged for the same reason as the rate above: it moves what every
        // document under this partner asks for. It is SUBTRACTED, so a typo
        // here does not overcharge anybody - it undercharges every invoice.
        retentionRate: profile.retentionRate,
      },
      req,
    });

    res.json({ exists: true, ownerId, profile: shape(profile) });
  } catch (error) {
    console.error('Error saving the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el perfil de facturación' });
  }
};

module.exports = {
  get,
  set,
  shape,
  sanitizeProfileInput,
  DEFAULTS,
};
