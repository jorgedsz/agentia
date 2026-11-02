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
const { listIssuerProfiles, findOwnedProfile } = require('../utils/issuerProfile');

// What a profile looks like before anyone has configured one. Mirrors the
// column defaults in schema.prisma, so the form a partner opens for the first
// time shows exactly what it would get by saving untouched.
const DEFAULTS = {
  taxEnabled: false,
  chargeTaxToClient: false,
  taxRate: 0,
  taxLabel: 'ITBIS',
  retentionRate: 0,
  retentionLabel: 'RETENCIÓN',
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
    // THE RETENTION IS THE ONE THAT CANNOT REACH 100, and that is arithmetic,
    // not taste. The invoice's net is grossed up from what the client paid by
    // dividing it by (1 - rate/100) — see services/invoiceService.js — so a rate
    // of exactly 100 divides by zero. `taxRate` at 100 is merely a strange
    // choice (it doubles the bill), not an undefined one, so it keeps the 0-100
    // range above untouched.
    if (key === 'retentionRate' && value >= 100) {
      return {
        error: 'La tasa de retención debe ser menor que 100: el neto de la factura se calcula '
          + 'dividiendo lo que el cliente paga entre (1 − tasa), y una retención del 100% no '
          + 'dejaría nada que pagar.',
      };
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

  // Same treatment for the retention's label, and for the same reason: it is
  // free text (an issuer writes its own form's name, "Ret. 27% IR-17"), the
  // column is NOT NULL, and a blank one would print a row with an amount under
  // a nameless header. Falls back to the literal the format has always used.
  if (body.retentionLabel !== undefined) {
    data.retentionLabel = String(body.retentionLabel ?? '').trim() || DEFAULTS.retentionLabel;
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

  // The company's name in the panel. Free text, short, never printed on a
  // document. Blank is refused rather than defaulted: two companies both called
  // "Principal" in one selector is how somebody invoices from the wrong one.
  if (body.label !== undefined) {
    const label = String(body.label ?? '').trim();
    if (!label) return { error: 'Ponle un nombre a la empresa.' };
    if (label.length > 60) return { error: 'El nombre de la empresa es demasiado largo (máximo 60 caracteres).' };
    data.label = label;
  }

  return { data };
}

// The 403 both handlers answer with. Worded the same way whether the account
// exists or not, and checked BEFORE the account is looked up, so an id that is
// refused tells the caller nothing about whether that account is real.
const FORBIDDEN = 'No puedes configurar la facturación de esta cuenta.';

/** A company for the panel: its identity in the selector plus every profile field. */
function shapeCompany(profile) {
  return { id: profile.id, label: profile.label, isDefault: !!profile.isDefault, ...shape(profile) };
}

// The guard + account check every handler starts with. Returns the ownerId, or
// null after answering.
//
// The permission is checked FIRST, before the id is looked up and before the
// body is parsed: a profile carries bank details and an RNC, so reading
// somebody else's is as much of a leak as writing it, and an unguarded :userId
// on a write would mint an issuer identity (RNC, bank account, numbering) under
// an account the requester does not own, switching on a tax for that account's
// whole subtree. One function, so no handler can get the order wrong.
async function ownerFrom(req, res) {
  const ownerId = parseInt(req.params.userId);
  if (!Number.isFinite(ownerId)) { res.status(400).json({ error: 'Cuenta no válida.' }); return null; }
  if (!canConfigureBillingProfile(req.user, ownerId)) { res.status(403).json({ error: FORBIDDEN }); return null; }
  const owner = await req.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) { res.status(404).json({ error: 'Cuenta no encontrada.' }); return null; }
  return ownerId;
}

// Write `data` onto one company (`existing`), or create the owner's FIRST one.
//
// The numbering sequence is guarded, not just validated, and per company.
// Invoice carries @@unique([profileId, number]), so moving the counter back
// into a range it has already issued does not fail here — it fails LATER,
// inside issueInvoiceForPurchase, on the next payment that settles. And
// emission there is fire-and-forget behind a real card charge: the client
// would be charged and credited correctly and quietly receive no invoice, with
// the only trace a log line. That is much worse than refusing the edit, so a
// backward move is refused outright once the company has issued anything.
// Moving it FORWARD is always allowed (skipping a range is normal when a
// partner migrates a sequence it was already using elsewhere), and a company
// with no invoices on file can be set to anything, which is what makes
// first-time configuration unrestricted.
async function writeCompany(req, ownerId, existing, data) {
  if (existing && data.invoiceNextNumber !== undefined && data.invoiceNextNumber < existing.invoiceNextNumber) {
    const issued = await req.prisma.invoice.count({ where: { profileId: existing.id } });
    if (issued > 0) {
      return {
        error: `El próximo número de factura no puede retroceder por debajo de ${existing.invoiceNextNumber}: `
          + `ya hay ${issued} factura(s) emitidas con esa secuencia y los números se repetirían.`,
      };
    }
  }
  const profile = existing
    ? await req.prisma.billingProfile.update({ where: { id: existing.id }, data })
    : await req.prisma.billingProfile.create({
      data: { ownerId, isDefault: true, label: data.label || data.issuerName || 'Principal', ...data },
    });
  return { profile };
}

function audit(req, ownerId, action, profile, fields) {
  logAudit(req.prisma, {
    userId: ownerId,
    actorId: req.user.id,
    actorType: 'user',
    action,
    resourceType: 'billing_profile',
    resourceId: String(profile.id),
    // The fields touched, not their values: these rows hold bank details.
    details: {
      fields,
      label: profile.label,
      taxEnabled: profile.taxEnabled,
      // Logged next to taxEnabled because this is the one that moves money:
      // turning it on makes every client of this company pay the tax on top of
      // what it asked for.
      chargeTaxToClient: profile.chargeTaxToClient,
      taxRate: profile.taxRate,
      // Logged for the same reason as the rate above, though it moves something
      // else: the TOTAL A PAGAR stays equal to the money that arrived whatever
      // this says (the net is grossed up from it), so a typo here never
      // mis-asks for money — it inflates the NETO and RETENCIÓN rows of every
      // document this company issues, which is a fiscal misstatement rather
      // than a billing one.
      retentionRate: profile.retentionRate,
    },
    req,
  });
}

/**
 * The issuer's companies, default first, plus the default in the shape every
 * caller written before companies existed reads (AccountManagement).
 * GET /api/billing-profile/:userId
 */
const get = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const profiles = await listIssuerProfiles(req.prisma, ownerId);
    const def = profiles[0] || null;
    res.json({
      // So the panel can tell "not configured yet" (defaults shown) from a
      // saved profile that happens to match them.
      exists: !!def,
      ownerId,
      profile: shape(def),
      defaultId: def ? def.id : null,
      profiles: profiles.map(shapeCompany),
    });
  } catch (error) {
    console.error('Error reading the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el perfil de facturación' });
  }
};

/**
 * Update the DEFAULT company, or create the owner's first one.
 * PUT /api/billing-profile/:userId
 *
 * Kept so every caller written before companies existed still edits the
 * profile it always edited.
 */
const set = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para guardar.' });
    }

    const [existing] = await listIssuerProfiles(req.prisma, ownerId);
    const out = await writeCompany(req, ownerId, existing || null, data);
    if (out.error) return res.status(400).json({ error: out.error });
    audit(req, ownerId, existing ? 'billing_profile.update' : 'billing_profile.create', out.profile, Object.keys(data));
    res.json({ exists: true, ownerId, profile: shape(out.profile), company: shapeCompany(out.profile) });
  } catch (error) {
    console.error('Error saving the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el perfil de facturación' });
  }
};

/**
 * A new company, with its own numbering from wherever the body says. The first
 * company an owner creates is its default; every later one is not.
 * POST /api/billing-profile/:userId
 */
const createCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (!data.label) return res.status(400).json({ error: 'Ponle un nombre a la empresa.' });
    const count = await req.prisma.billingProfile.count({ where: { ownerId } });
    const profile = await req.prisma.billingProfile.create({ data: { ...data, ownerId, isDefault: count === 0 } });
    audit(req, ownerId, 'billing_profile.create', profile, Object.keys(data));
    res.status(201).json({ company: shapeCompany(profile) });
  } catch (error) {
    console.error('Error creating a company:', error.message);
    res.status(500).json({ error: 'No se pudo crear la empresa' });
  }
};

/**
 * One company.
 * PUT /api/billing-profile/:userId/:profileId
 */
const updateCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const existing = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada.' });
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para guardar.' });
    }
    const out = await writeCompany(req, ownerId, existing, data);
    if (out.error) return res.status(400).json({ error: out.error });
    audit(req, ownerId, 'billing_profile.update', out.profile, Object.keys(data));
    res.json({ company: shapeCompany(out.profile) });
  } catch (error) {
    console.error('Error saving a company:', error.message);
    res.status(500).json({ error: 'No se pudo guardar la empresa' });
  }
};

/**
 * Make one company the default. One transaction, so there is never a moment
 * with zero or two defaults.
 * POST /api/billing-profile/:userId/:profileId/default
 */
const makeDefault = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const target = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!target) return res.status(404).json({ error: 'Empresa no encontrada.' });
    await req.prisma.$transaction([
      req.prisma.billingProfile.updateMany({ where: { ownerId }, data: { isDefault: false } }),
      req.prisma.billingProfile.update({ where: { id: target.id }, data: { isDefault: true } }),
    ]);
    audit(req, ownerId, 'billing_profile.default', target, ['isDefault']);
    res.json({ defaultId: target.id });
  } catch (error) {
    console.error('Error choosing the default company:', error.message);
    res.status(500).json({ error: 'No se pudo cambiar la empresa predeterminada' });
  }
};

/**
 * Delete a company that never issued (its invoices are fiscal records, and
 * Invoice.profile is Restrict) and is not the default. Its assigned clients
 * fall back to the default (User.issuerProfileId is SetNull).
 * DELETE /api/billing-profile/:userId/:profileId
 */
const removeCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const target = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!target) return res.status(404).json({ error: 'Empresa no encontrada.' });
    if (target.isDefault) {
      return res.status(400).json({ error: 'No se puede eliminar la empresa predeterminada: elige otra como predeterminada primero.' });
    }
    const issued = await req.prisma.invoice.count({ where: { profileId: target.id } });
    if (issued > 0) {
      return res.status(409).json({ error: `No se puede eliminar: ya emitió ${issued} factura(s), y esas facturas tienen que seguir existiendo.` });
    }
    await req.prisma.billingProfile.delete({ where: { id: target.id } });
    audit(req, ownerId, 'billing_profile.delete', target, []);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting a company:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar la empresa' });
  }
};

module.exports = {
  get,
  set,
  createCompany,
  updateCompany,
  makeDefault,
  removeCompany,
  shape,
  shapeCompany,
  sanitizeProfileInput,
  DEFAULTS,
};
