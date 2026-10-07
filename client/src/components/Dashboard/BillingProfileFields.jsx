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
  chargeTaxToClient: false,
  taxRate: '0',
  taxLabel: 'ITBIS',
  retentionRate: '0',
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
  chargeTaxToClient: !!profile.chargeTaxToClient,
  taxRate: profile.taxRate != null ? String(profile.taxRate) : '0',
  taxLabel: profile.taxLabel || 'ITBIS',
  retentionRate: profile.retentionRate != null ? String(profile.retentionRate) : '0',
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
  chargeTaxToClient: !!form.chargeTaxToClient,
  taxRate: form.taxRate,
  taxLabel: form.taxLabel,
  retentionRate: form.retentionRate,
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
 * @param {node}     taxHelp       what SHOWING the tax means, in the voice of
 *                                 whoever is reading it. Printed next to the
 *                                 checkbox, never in a tooltip: it is the one
 *                                 consequence nobody should discover afterwards.
 * @param {node}     chargeHelp    the same, for the switch that actually charges
 *                                 the tax to the client.
 * @param {node}     notConfiguredNote  the "no profile yet" line, same reason.
 */
export default function BillingProfileFields({ form, onChange, profileExists, taxHelp, chargeHelp, notConfiguredNote }) {
  const set = (patch) => onChange(patch)

  // The examples below use the rates actually typed into the fields, not a
  // hardcoded 27, so a partner on another rate reads its own arithmetic.
  const exampleRate = Number(form.taxRate) || 0
  const exampleTotal = (100 + exampleRate).toFixed(2)
  const exampleTax = exampleRate.toFixed(2)
  // The RETENCIÓN is the mirror image of the tax: it comes OFF the net instead
  // of going on top of it, and the money the client pays is the TOTAL A PAGAR
  // at the bottom of the block — so the net is the $100 GROSSED UP, 100 / (1 −
  // tasa), exactly as the server computes it (services/invoiceService.js). The
  // old text here said TOTAL NETO $100 / RETENCIÓN $27 / TOTAL A PAGAR $73,
  // which was the arithmetic the other way round.
  //
  // A rate at or above 100 has no net at all (the divisor is 0 or negative) and
  // the server refuses to store one, so the example simply goes quiet instead of
  // printing Infinity while the field is being typed into.
  const retRate = Number(form.retentionRate) || 0
  const retUsable = retRate > 0 && retRate < 100
  const retNet = retUsable ? 100 / (1 - retRate / 100) : 0
  const retNeto = retNet.toFixed(2)
  const retAmount = (retNet - 100).toFixed(2)
  // The combination the owner asked for, and the one whose consequence is
  // easiest to miss: the invoices carry the tax, nobody pays it. Spelled out
  // HERE rather than in each screen's `taxHelp`, so both screens say the same
  // thing about the same arithmetic and cannot drift apart.
  //
  // SILENT ONCE A RETENCIÓN IS SET, because its arithmetic stops being true
  // then: with both rates at 27 the document totals 100 against 100 collected
  // and nothing is uncollected at all. The both-rates warning down by the
  // retention field says what happens in that case instead, so there is one
  // explanation of one total rather than two that contradict each other.
  const shownNotCharged = !!form.taxEnabled && !form.chargeTaxToClient && retRate === 0
  // Both rows on one document: the tax adds, the retention subtracts — and the
  // tax is taken on the GROSSED-UP net, so it is no longer ${exampleRate} on
  // $100. The retention cancels itself against the gross-up and the total lands
  // on the $100 received PLUS that tax.
  const taxAndRetention = !!form.taxEnabled && exampleRate > 0 && retUsable
  const bothTax = ((retNet * exampleRate) / 100).toFixed(2)
  const bothTotal = (100 + (retNet * exampleRate) / 100).toFixed(2)

  return (
    <>
      {/* TWO SWITCHES, TWO DIFFERENT DECISIONS. The first governs the
          DOCUMENT, the second governs the CARD. Both off means the panel
          behaves exactly as it did before any of this existed. */}
      <label className="flex gap-2 p-3 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
        <input
          type="checkbox"
          checked={!!form.taxEnabled}
          onChange={(e) => set({ taxEnabled: e.target.checked })}
          className="mt-0.5 text-primary-600 focus:ring-primary-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">Mostrar el impuesto en las facturas</span>
          <div className="text-xs text-gray-500 dark:text-gray-400">{taxHelp}</div>
        </div>
      </label>

      <label className="flex gap-2 p-3 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
        <input
          type="checkbox"
          checked={!!form.chargeTaxToClient}
          onChange={(e) => set({ chargeTaxToClient: e.target.checked })}
          className="mt-0.5 text-primary-600 focus:ring-primary-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Cobrarle además el impuesto al cliente
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {chargeHelp || <>
              Encendido, el impuesto se suma <strong>por encima de cada pago</strong>: quien pida $100 de saldo paga
              $127 al 27% y recibe 100 créditos. Apagado, cada cuenta paga exactamente el monto que pide.
            </>}
            {' '}No hace nada si el impuesto no se muestra en las facturas.
          </div>
        </div>
      </label>

      {/* The consequence of the combination above, where it cannot be missed:
          next to the switches that cause it, in the same amber the panel uses
          for "pendiente" elsewhere. */}
      {shownNotCharged && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <strong>Así está ahora:</strong> la factura muestra el impuesto pero no se le cobra a nadie. Un cliente
          paga $100, recibe 100 créditos, y su factura dice <strong>TOTAL A PAGAR ${exampleTotal}</strong> al{' '}
          {exampleRate}%. Esos ${exampleTax} quedan sin cobrar en cada documento: la factura indica cuánto se
          recibió y cuánto falta, pero el dinero no entra. Para cobrarlos, enciende{' '}
          <strong>«Cobrarle además el impuesto al cliente»</strong>.
        </p>
      )}

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

      {/* THE RETENCIÓN, WHICH RESTA. Deliberately next to the tax fields and
          not in its own section: the two are the same kind of setting read in
          opposite directions, and seeing them together is what stops somebody
          typing 27 into the wrong one. The explanation says which way it goes
          and shows the resulting document, because that is the only part
          nobody can check afterwards without issuing a real invoice. */}
      <div>
        <label className={LABEL}>Tasa de retención (%)</label>
        <input type="number" min="0" max="99.99" step="0.01" value={form.retentionRate}
          onChange={(e) => set({ retentionRate: e.target.value })}
          placeholder="27" className={INPUT} />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          La retención <strong>se resta</strong> del neto de la factura: no se le cobra nada de más al cliente.
          Lo que el cliente paga es lo que tú <strong>recibes</strong>, así que va abajo, en el
          <strong> TOTAL A PAGAR</strong>, y el neto se calcula hacia arriba desde ahí —
          dividiéndolo entre (1 − tasa). Déjala en 0 y la fila sale vacía, como hasta ahora.
          {retUsable && <>
            {' '}Al {retRate}%, un cliente que paga $100 recibirá una factura que dice{' '}
            <strong>TOTAL NETO ${retNeto}</strong>, <strong>RETENCIÓN −${retAmount}</strong> y{' '}
            <strong>TOTAL A PAGAR $100.00</strong>: los $100 que entraron, ni un centavo más ni menos.
          </>}
          {' '}Tiene que ser menor que 100: al 100% no habría neto del que restar.
        </p>
        {taxAndRetention && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mt-2">
            <strong>Ojo, tienes las dos cosas puestas:</strong> sobre un pago de $100 el neto sube a{' '}
            <strong>${retNeto}</strong>, la retención <strong>resta</strong> ${retAmount} y la fila de{' '}
            {form.taxLabel || 'impuesto'} <strong>suma</strong> ${bothTax} —el {exampleRate}% se calcula
            sobre ese neto, no sobre los $100—, así que el <strong>TOTAL A PAGAR</strong> saldría{' '}
            <strong>${bothTotal}</strong>: los $100 que entraron más el impuesto. Si el impuesto no se le
            cobra al cliente, esos ${bothTax} quedan sin cobrar en cada documento. Si lo que quieres es el
            documento que usa tu contable — solo TOTAL NETO, RETENCIÓN y TOTAL A PAGAR — deja la{' '}
            <strong>tasa de impuesto en 0</strong>.
          </p>
        )}
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
