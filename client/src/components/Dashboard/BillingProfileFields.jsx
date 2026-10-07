// The invoicing profile form — ONE copy, used by both screens that edit it.
//
// It is the same row either way (BillingProfile, keyed on the partner it hangs
// off), so it has to be the same fields, the same coercions and the same
// payload. Two places edit it:
//
//   · AccountManagement's per-account modal — the OWNER configuring a partner
//     BELOW it, alongside that partner's Whop/Stripe setup;
//   · the Facturas page — a partner configuring ITSELF, which is the only
//     surface where a partner can see its own account at all.
//
// Keeping the field list, `invoiceFormFrom` and `invoicePayloadFrom` here is
// what stops the two from drifting: a field added to the server's allow-list is
// added once, and neither screen can quietly post a shape the other does not.
//
// This component owns no state. The form object and its setter stay with the
// caller, because each screen saves it differently (the modal saves it as part
// of a larger Stripe save; the Facturas panel saves it on its own).

// Everything printed on the invoices a partner issues, grouped the way the
// document itself reads. Keys match the BillingProfile columns the server's
// allow-list accepts — nothing else is ever sent.
export const INVOICE_TEXT_GROUPS = [
  {
    title: 'Emisor',
    fields: [
      ['issuerName', 'Razón social', 'Nombre legal que emite la factura'],
      ['issuerRnc', 'RNC / ID', '1-31-12345-6'],
      ['brandName', 'Nombre comercial', 'El nombre grande del encabezado'],
      ['slogan', 'Eslogan', 'La línea pequeña bajo el nombre'],
      ['logoUrl', 'URL del logo', 'https://…/logo.png'],
    ],
  },
  {
    title: 'Datos de pago',
    fields: [
      ['bankName', 'Banco', 'Banco Popular'],
      ['bankAccount', 'Número de cuenta', '000000000'],
      ['swift', 'SWIFT', 'BPDODOSX'],
      ['routingNumber', 'Número de ruta', '021000021'],
      ['paymentMethod', 'Modalidad de pago', 'Transferencia bancaria'],
      ['paymentTerms', 'Condiciones de pago', 'Contado'],
    ],
  },
  {
    title: 'Sucursal 1',
    fields: [
      ['site1Name', 'Nombre', 'Oficina principal'],
      ['site1Phone', 'Teléfono', '809-000-0000'],
      ['site1City', 'Ciudad', 'Santo Domingo'],
      ['site1Address', 'Dirección', 'Av. …'],
    ],
  },
  {
    title: 'Sucursal 2',
    fields: [
      ['site2Name', 'Nombre', 'Opcional'],
      ['site2Phone', 'Teléfono', ''],
      ['site2City', 'Ciudad', ''],
      ['site2Address', 'Dirección', ''],
    ],
  },
  {
    title: 'Contacto',
    fields: [
      ['contactEmail', 'Email', 'facturacion@empresa.com'],
      ['contactWeb', 'Web', 'www.empresa.com'],
    ],
  },
]

export const INVOICE_TEXT_KEYS = INVOICE_TEXT_GROUPS.flatMap(g => g.fields.map(([key]) => key))

// Mirrors the server's own DEFAULTS, as strings so the inputs are controlled.
export const EMPTY_INVOICE_PROFILE = {
  taxEnabled: false,
  taxRate: '0',
  taxLabel: 'ITBIS',
  invoicePrefix: 'FAC-',
  invoiceNextNumber: '1',
  invoicePadding: '6',
  dueDays: '0',
  ...Object.fromEntries(INVOICE_TEXT_KEYS.map(key => [key, ''])),
}

// A stored profile, as the form holds it: nulls become '' and numbers become
// strings, or the inputs would flip between controlled and uncontrolled.
export const invoiceFormFrom = (profile = {}) => ({
  taxEnabled: !!profile.taxEnabled,
  taxRate: profile.taxRate != null ? String(profile.taxRate) : '0',
  taxLabel: profile.taxLabel || 'ITBIS',
  invoicePrefix: profile.invoicePrefix ?? 'FAC-',
  invoiceNextNumber: profile.invoiceNextNumber != null ? String(profile.invoiceNextNumber) : '1',
  invoicePadding: profile.invoicePadding != null ? String(profile.invoicePadding) : '6',
  dueDays: profile.dueDays != null ? String(profile.dueDays) : '0',
  ...Object.fromEntries(INVOICE_TEXT_KEYS.map(key => [key, profile[key] ?? ''])),
})

// Exactly the keys the server's allow-list accepts, and nothing else: a body
// carrying `id` or `ownerId` would be refused, and `ownerId` in particular
// would re-point a whole partner's fiscal history at another account.
export const invoicePayloadFrom = (form) => ({
  taxEnabled: !!form.taxEnabled,
  taxRate: form.taxRate,
  taxLabel: form.taxLabel,
  invoicePrefix: form.invoicePrefix,
  invoiceNextNumber: form.invoiceNextNumber,
  invoicePadding: form.invoicePadding,
  dueDays: form.dueDays,
  ...Object.fromEntries(INVOICE_TEXT_KEYS.map(key => [key, form[key]])),
})

const INPUT = 'w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm'
const LABEL = 'block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1'

/**
 * @param {object}   form          the form object, as invoiceFormFrom returns it
 * @param {function} onChange      called with a patch to merge into it
 * @param {boolean}  profileExists false while the account has no saved profile
 * @param {node}     taxHelp       what switching the tax on means, in the voice
 *                                 of whoever is reading it. Printed next to the
 *                                 checkbox, never in a tooltip: it is the one
 *                                 consequence nobody should discover afterwards.
 * @param {node}     notConfiguredNote  the "no profile yet" line, same reason.
 */
export default function BillingProfileFields({ form, onChange, profileExists, taxHelp, notConfiguredNote }) {
  const set = (patch) => onChange(patch)

  return (
    <>
      {/* The switch the whole feature hangs off. Off means the panel behaves
          exactly as it did before this existed. */}
      <label className="flex gap-2 p-3 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
        <input
          type="checkbox"
          checked={!!form.taxEnabled}
          onChange={(e) => set({ taxEnabled: e.target.checked })}
          className="mt-0.5 text-primary-600 focus:ring-primary-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">Cobrar impuesto sobre cada pago</span>
          <div className="text-xs text-gray-500 dark:text-gray-400">{taxHelp}</div>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Tasa de impuesto (%)</label>
          <input type="number" min="0" max="100" step="0.01" value={form.taxRate}
            onChange={(e) => set({ taxRate: e.target.value })}
            placeholder="27" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Nombre del impuesto</label>
          <input type="text" value={form.taxLabel}
            onChange={(e) => set({ taxLabel: e.target.value })}
            placeholder="ITBIS" className={INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Prefijo del número</label>
          <input type="text" value={form.invoicePrefix}
            onChange={(e) => set({ invoicePrefix: e.target.value })}
            placeholder="FAC-" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Dígitos del número</label>
          <input type="number" min="1" max="20" step="1" value={form.invoicePadding}
            onChange={(e) => set({ invoicePadding: e.target.value })}
            placeholder="6" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Próximo número</label>
          <input type="number" min="1" step="1" value={form.invoiceNextNumber}
            onChange={(e) => set({ invoiceNextNumber: e.target.value })}
            placeholder="1" className={INPUT} />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            No puede retroceder una vez que la secuencia ya emitió facturas: los números se repetirían.
          </p>
        </div>
        <div>
          <label className={LABEL}>Días de vencimiento</label>
          <input type="number" min="0" max="365" step="1" value={form.dueDays}
            onChange={(e) => set({ dueDays: e.target.value })}
            placeholder="0" className={INPUT} />
        </div>
      </div>

      {INVOICE_TEXT_GROUPS.map(group => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{group.title}</p>
          <div className="grid grid-cols-2 gap-3">
            {group.fields.map(([key, label, placeholder]) => (
              <div key={key}>
                <label className={LABEL}>{label}</label>
                <input type="text" value={form[key]}
                  onChange={(e) => set({ [key]: e.target.value })}
                  placeholder={placeholder} className={INPUT} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {!profileExists && notConfiguredNote && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{notConfiguredNote}</p>
      )}
    </>
  )
}
