# AZUL en NEBO (Plan 3) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las cuentas de NEBO en modo `platform` vuelven a pagar con tarjeta, ahora por AZUL (la cuenta de Nebo AI, S.R.L.) a través del servicio `pagos-azul` de nebocore: compra de créditos, tarjeta guardada, recarga automática, cortes y cobros recurrentes. Stripe (`own_stripe`) no cambia.

**Architecture:** NEBO nunca habla con AZUL ni ve un número de tarjeta: habla con `pagos-azul` (misma red docker en nebocore, `http://pagos:3100`) con la clave de la app `sword`. Una compra crea una orden en USD en pagos-azul y manda al cliente a la Página de Pago de AZUL; el resultado llega por un webhook firmado (`X-Pagos-Firma`, HMAC-SHA256) y se acredita con `settleCreditPurchase`, como Stripe. La tarjeta guardada es un `tarjetaId` de pagos-azul (el token de DataVault se queda allí); los cobros sin el cliente presente van por `POST /api/pagos/cobrar-tarjeta`, que es síncrono. Un helper nuevo, `cardProviderFor(mode)`, decide el proveedor: `own_stripe → 'stripe'`, `platform → 'azul'` (si pagos-azul está configurado), `manual → null`.

**Tech Stack:** Node 22, Express, Prisma (`db push` al arrancar), React/Vite, `node --test` con prisma y fetch falsos.

---

## Decisiones tomadas (no reabrir)

- AZUL reemplaza a Whop solo para `platform`. `own_stripe` sigue igual; `manual` sigue sin tarjeta.
- Sin impuesto en AZUL por ahora: `resolveTaxConfig` sigue devolviendo `NO_TAX` fuera de `own_stripe` (como era con Whop). Activarlo es una decisión de Jorge aparte.
- AZUL no tiene "guardar tarjeta sin cobrar": la tarjeta se guarda en la primera compra (`guardarTarjeta: true`). "Agregar tarjeta" para AZUL responde 409 con un mensaje y la UI lo oculta.
- Los cobros recurrentes de AZUL se quedan como los de Stripe (cobran el monto, no crean CreditPurchase): no se arregla aquí esa diferencia.
- Esquema: solo columnas nuevas opcionales (`db push` las agrega sin tocar datos).

## Fuera de este plan

- Producción de AZUL (credenciales reales). Todo esto corre contra el sandbox de pagos-azul.
- Indicador MIT/CIT definitivo (hoy `STANDING_ORDER` en pagos-azul).

## Mapa de archivos

**pagos-azul** (`C:\Users\Jorge\pagos-azul`):
- Modify `src/servidor.js`: `GET /api/pagos/tarjetas/:id` y `DELETE /api/pagos/tarjetas/:id` (por app).
- Test `test/tarjetas.test.js`.

**NEBO** (`C:\Users\Jorge\wt-azul-nebo`, rama `feat/azul-nebo`):
- Create `server/src/services/azulPagos.js`: cliente HTTP de pagos-azul + verificación de firma. Única pieza que conoce pagos-azul.
- Modify `server/src/utils/billingMode.js`: `cardProviderFor`, `isSelfServiceMode` usa el proveedor.
- Modify `server/prisma/schema.prisma`: `User.azulTarjetaId`, `User.azulTarjetaIdBackup`, `CreditPurchase.azulOrdenId` (+ índice), `RecurringPayment.provider` admite `azul_card`.
- Create `server/src/utils/savedCard.js`: `hasSavedCard(user, provider, slot)` y columnas por proveedor (reemplaza los `user.stripePaymentMethodId` sueltos).
- Modify `server/src/utils/autoRecharge.js`: `getSavedCards(user, provider)`.
- Modify `server/src/services/cardOnFile.js`: fetcher `azul`.
- Modify `server/src/services/creditCheckout.js`: rama AZUL en `createCreditCheckout`, `createCardSetupCheckout` (409), `confirmAzulOrder`.
- Create `server/src/controllers/azulController.js` + `server/src/routes/azul.js`: webhook.
- Modify `server/src/index.js`: `express.raw` para `/api/azul/webhook` y montar la ruta.
- Modify `server/src/controllers/creditsController.js`: `performOffSessionCharge` rama AZUL, guardas de modo, `removeCard`, `getAutoRecharge` (`cardSetupSupported`), reconciliación de pendientes AZUL en `processAutoRecharges`.
- Modify `server/src/services/cycleBilling.js`, `server/src/controllers/billingPeriodController.js`, `server/src/controllers/paymentPortalController.js` (y el bug `url`/`checkoutUrl`), `server/src/controllers/recurringPaymentController.js`.
- Client: `DashboardLayout.jsx`, `BillingPeriods.jsx`, `AccountManagement.jsx`, `Public/PaymentPortalPage.jsx`, `Public/WalletPage.jsx`.
- Tests en `server/tests/`: `azulPagos.test.js`, `azulWebhook.test.js`, `azulCheckout.test.js`, `azulOffSession.test.js`, y ajustar `noCardPayment.test.js`, `cardOnFile.test.js`.

**Variables de entorno de NEBO** (en `/opt/nebo/sword.env`, nunca en el repo):
`PAGOS_AZUL_URL=http://pagos:3100`, `PAGOS_AZUL_CLAVE`, `PAGOS_AZUL_SECRETO`. Si falta alguna, `platform` se queda sin tarjeta (como hoy).

---

### Task 1: pagos-azul — consultar y retirar una tarjeta guardada

**Files:**
- Modify: `C:\Users\Jorge\pagos-azul\src\servidor.js` (bloque de rutas con clave de app, antes de `cobrar-tarjeta`)
- Test: `C:\Users\Jorge\pagos-azul\test\tarjetas.test.js`

- [ ] **Step 1: Write the failing test** — copiar `montar()` y `apiFalsa()` de `test/cobroTarjeta.test.js` y probar:

```js
test('una app ve su tarjeta (sin token) y la puede retirar', async (t) => {
  const { base, tarjeta } = await montar(t, null);
  const h = { 'X-Api-Key': 'clave-sword' };
  let r = await fetch(`${base}/api/pagos/tarjetas/${tarjeta.id}`, { headers: h });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { id: tarjeta.id, marca: 'VISA', mascara: '****4977', vence: '202812', activa: true });
  r = await fetch(`${base}/api/pagos/tarjetas/${tarjeta.id}`, { headers: { 'X-Api-Key': 'clave-otra' } });
  assert.strictEqual(r.status, 404);
  r = await fetch(`${base}/api/pagos/tarjetas/${tarjeta.id}`, { method: 'DELETE', headers: h });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).activa, false);
});

test('una tarjeta retirada ya no se puede cobrar', async (t) => {
  const { api, enviados } = apiFalsa(() => ({ ResponseCode: 'ISO8583', IsoCode: '00' }));
  const { base, tarjeta } = await montar(t, api);
  await fetch(`${base}/api/pagos/tarjetas/${tarjeta.id}`, { method: 'DELETE', headers: { 'X-Api-Key': 'clave-sword' } });
  const r = await fetch(`${base}/api/pagos/cobrar-tarjeta`, { method: 'POST', headers: { 'X-Api-Key': 'clave-sword' },
    body: JSON.stringify({ tarjetaId: tarjeta.id, monto: 5, idempotencia: 'k1' }) });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(enviados.length, 0);
});
```

- [ ] **Step 2: Run** `cd C:\Users\Jorge\pagos-azul && node --test test/tarjetas.test.js` — Expected: FAIL (404 en la primera consulta).
- [ ] **Step 3: Implement** en `servidor.js`, después de la ruta `GET /api/pagos/ordenes/:id`:

```js
      if ((m = ruta.match(new RegExp(`^/api/pagos/tarjetas/${ID}$`))) && (req.method === 'GET' || req.method === 'DELETE')) {
        if (!app) return responder(res, 401, { error: 'clave inválida' });
        let tj = tarjetas.obtener(m[1]);
        if (!tj || tj.app !== app) return responder(res, 404, { error: 'no existe' });
        if (req.method === 'DELETE' && tj.activa !== false) tj = tarjetas.actualizar(tj.id, { activa: false });
        // El token de DataVault no sale del servicio.
        return responder(res, 200, { id: tj.id, marca: tj.marca || '', mascara: tj.mascara || '', vence: tj.vence || '', activa: tj.activa !== false });
      }
```

- [ ] **Step 4: Run** `node --test` — Expected: todo PASS.
- [ ] **Step 5: Commit** `git add src/servidor.js test/tarjetas.test.js && git commit -m "Let an app read and retire its saved card"`

### Task 2: NEBO — cliente de pagos-azul

**Files:**
- Create: `server/src/services/azulPagos.js`
- Test: `server/tests/azulPagos.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { crearCliente, firmaValida } = require('../src/services/azulPagos');

function fetchFalso(respuestas) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url, init });
    const r = respuestas.shift();
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  f.llamadas = llamadas;
  return f;
}

test('sin configuración no está habilitado', () => {
  assert.strictEqual(crearCliente({ env: {} }).habilitado, false);
});

test('crea una orden en USD con la clave de la app', async () => {
  const fetch = fetchFalso([{ status: 201, body: { id: 'a1b2c3d4e5f60718', urlPago: 'https://x/api/pagos/ir/a1b2c3d4e5f60718' } }]);
  const c = crearCliente({ env: { PAGOS_AZUL_URL: 'http://pagos:3100', PAGOS_AZUL_CLAVE: 'k', PAGOS_AZUL_SECRETO: 's' }, fetch });
  const o = await c.crearOrden({ monto: 25, cliente: 'u6', referencia: 'NEBO-9', descripcion: 'Créditos', guardarTarjeta: true, retorno: 'https://app.swordaisolutions.com/dashboard?checkout=success' });
  assert.strictEqual(o.id, 'a1b2c3d4e5f60718');
  const { url, init } = fetch.llamadas[0];
  assert.strictEqual(url, 'http://pagos:3100/api/pagos/ordenes');
  assert.strictEqual(init.headers['X-Api-Key'], 'k');
  assert.deepStrictEqual(JSON.parse(init.body), { moneda: 'USD', monto: 25, cliente: 'u6', referencia: 'NEBO-9', descripcion: 'Créditos', guardarTarjeta: true, retorno: 'https://app.swordaisolutions.com/dashboard?checkout=success' });
});

test('un cobro con tarjeta devuelve la orden aunque pagos-azul responda 502', async () => {
  const fetch = fetchFalso([{ status: 502, body: { id: 'f'.repeat(16), estado: 'por-verificar', error: 'x' } }]);
  const c = crearCliente({ env: { PAGOS_AZUL_URL: 'http://pagos:3100', PAGOS_AZUL_CLAVE: 'k', PAGOS_AZUL_SECRETO: 's' }, fetch });
  const o = await c.cobrarTarjeta({ tarjetaId: 't1', monto: 10, referencia: 'NEBO-1', idempotencia: 'nebo-cp-1' });
  assert.strictEqual(o.estado, 'por-verificar');
});

test('un 4xx de pagos-azul es un error', async () => {
  const fetch = fetchFalso([{ status: 404, body: { error: 'tarjeta no encontrada' } }]);
  const c = crearCliente({ env: { PAGOS_AZUL_URL: 'http://pagos:3100', PAGOS_AZUL_CLAVE: 'k', PAGOS_AZUL_SECRETO: 's' }, fetch });
  await assert.rejects(c.cobrarTarjeta({ tarjetaId: 't1', monto: 10, idempotencia: 'x' }), /tarjeta no encontrada/);
});

test('la firma del webhook se verifica sobre el cuerpo crudo', () => {
  const cuerpo = Buffer.from('{"evento":"pago.aprobado"}');
  const firma = crypto.createHmac('sha256', 's').update(cuerpo).digest('hex');
  assert.strictEqual(firmaValida(cuerpo, firma, 's'), true);
  assert.strictEqual(firmaValida(cuerpo, firma, 'otro'), false);
  assert.strictEqual(firmaValida(cuerpo, '', 's'), false);
});
```

- [ ] **Step 2: Run** `cd server && node --test tests/azulPagos.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `server/src/services/azulPagos.js`:

```js
// Client for the pagos-azul service (nebocore), the only piece of NEBO that talks to it.
// NEBO never sees a card number: pagos-azul holds AZUL's DataVault token and NEBO keeps
// the tarjetaId it hands back. Configured by PAGOS_AZUL_URL / _CLAVE / _SECRETO.
const crypto = require('crypto');

class PagosAzulError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function crearCliente({ env = process.env, fetch = globalThis.fetch } = {}) {
  const base = (env.PAGOS_AZUL_URL || '').replace(/\/$/, '');
  const clave = env.PAGOS_AZUL_CLAVE || '';
  const secreto = env.PAGOS_AZUL_SECRETO || '';
  const habilitado = !!(base && clave && secreto);

  async function llamar(metodo, ruta, cuerpo, { aceptar502 = false } = {}) {
    if (!habilitado) throw new PagosAzulError('AZUL is not configured', 503);
    const r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': clave },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(90000),
    });
    const datos = await r.json().catch(() => ({}));
    // cobrar-tarjeta answers 502 with the order when AZUL errored or could not confirm.
    if (r.ok || (aceptar502 && r.status === 502 && datos.id)) return datos;
    throw new PagosAzulError(datos.error || `pagos-azul answered ${r.status}`, r.status);
  }

  return {
    habilitado,
    secreto,
    crearOrden: ({ monto, cliente, referencia, descripcion, guardarTarjeta, retorno }) =>
      llamar('POST', '/api/pagos/ordenes', { moneda: 'USD', monto, cliente, referencia, descripcion, guardarTarjeta, retorno }),
    obtenerOrden: (id) => llamar('GET', `/api/pagos/ordenes/${encodeURIComponent(id)}`),
    cobrarTarjeta: ({ tarjetaId, monto, referencia, descripcion, idempotencia }) =>
      llamar('POST', '/api/pagos/cobrar-tarjeta', { tarjetaId, moneda: 'USD', monto, referencia, descripcion, idempotencia }, { aceptar502: true }),
    obtenerTarjeta: (id) => llamar('GET', `/api/pagos/tarjetas/${encodeURIComponent(id)}`),
    retirarTarjeta: (id) => llamar('DELETE', `/api/pagos/tarjetas/${encodeURIComponent(id)}`),
  };
}

function firmaValida(cuerpoCrudo, firma, secreto) {
  if (!firma || !secreto) return false;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
  return esperada.length === String(firma).length && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(String(firma)));
}

// One shared client for the app; tests build their own with crearCliente.
let compartido = null;
function cliente() { return (compartido ||= crearCliente()); }

module.exports = { crearCliente, firmaValida, cliente, PagosAzulError };
```

- [ ] **Step 4: Run** `node --test tests/azulPagos.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server/src/services/azulPagos.js server/tests/azulPagos.test.js && git commit -m "Add a client for the pagos-azul service"`

### Task 3: Proveedor por modo, esquema y tarjeta guardada

**Files:**
- Modify: `server/src/utils/billingMode.js` (agregar `cardProviderFor`, cambiar `isSelfServiceMode`)
- Modify: `server/prisma/schema.prisma`
- Create: `server/src/utils/savedCard.js`
- Modify: `server/src/utils/autoRecharge.js` (`getSavedCards`)
- Modify: `server/src/services/cardOnFile.js`
- Test: `server/tests/noCardPayment.test.js`, `server/tests/cardOnFile.test.js`, new `server/tests/savedCard.test.js`

- [ ] **Step 1: Tests.** En `noCardPayment.test.js` reemplazar el test de `isSelfServiceMode` por:

```js
test('the card provider follows the billing mode', () => {
  const { cardProviderFor, isSelfServiceMode } = require('../src/utils/billingMode');
  const azulOn = { habilitado: true };
  const azulOff = { habilitado: false };
  assert.strictEqual(cardProviderFor('own_stripe', azulOn), 'stripe');
  assert.strictEqual(cardProviderFor('platform', azulOn), 'azul');
  assert.strictEqual(cardProviderFor('platform', azulOff), null);
  assert.strictEqual(cardProviderFor('manual', azulOn), null);
  assert.strictEqual(cardProviderFor('own_whop', azulOn), 'azul'); // legacy reads as platform
  assert.strictEqual(isSelfServiceMode('manual', azulOn), false);
  assert.strictEqual(isSelfServiceMode('platform', azulOff), false);
});
```

Los tests existentes de 403 para `platform` deben seguir pasando: corren sin `PAGOS_AZUL_*` en el entorno, así que platform no tiene proveedor.

`server/tests/savedCard.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { savedCardId, cardColumn } = require('../src/utils/savedCard');
const { getSavedCards } = require('../src/utils/autoRecharge');

const user = { stripePaymentMethodId: 'pm_1', stripePaymentMethodIdBackup: null, azulTarjetaId: 'tj1', azulTarjetaIdBackup: 'tj2' };

test('each provider has its own card columns', () => {
  assert.strictEqual(savedCardId(user, 'stripe'), 'pm_1');
  assert.strictEqual(savedCardId(user, 'azul'), 'tj1');
  assert.strictEqual(savedCardId(user, 'azul', 'backup'), 'tj2');
  assert.strictEqual(savedCardId(user, null), null);
  assert.strictEqual(cardColumn('azul', 'backup'), 'azulTarjetaIdBackup');
  assert.strictEqual(cardColumn('stripe'), 'stripePaymentMethodId');
});

test('saved cards are listed for the account provider', () => {
  assert.deepStrictEqual(getSavedCards(user, 'azul').map((c) => [c.paymentMethodId, c.slot]), [['tj1', 'primary'], ['tj2', 'backup']]);
  assert.deepStrictEqual(getSavedCards(user, 'stripe').map((c) => c.paymentMethodId), ['pm_1']);
  assert.deepStrictEqual(getSavedCards(user), getSavedCards(user, 'stripe')); // default unchanged
});
```

En `cardOnFile.test.js` agregar:

```js
test('an AZUL account reads its card from pagos-azul', async () => {
  const fetchers = { azul: async (_p, _u, id) => ({ id, marca: 'VISA', mascara: '****0026', vence: '202812', activa: true }) };
  const card = await cardOnFile(null, { id: 6, azulTarjetaId: 'tj1' }, { mode: 'platform', provider: 'azul', fetchers });
  assert.deepStrictEqual(card, { brand: 'visa', last4: '0026', expMonth: 12, expYear: 2028 });
});
```

- [ ] **Step 2: Run** `node --test tests/noCardPayment.test.js tests/savedCard.test.js tests/cardOnFile.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**

`billingMode.js` — agregar y exportar (reemplaza `isSelfServiceMode`):

```js
/**
 * Which card processor collects for a billing mode: Stripe for own_stripe, AZUL (through
 * pagos-azul, Nebo AI's own merchant) for platform, none for manual. `azul` is the
 * pagos-azul client; platform has no card payment while it is not configured.
 */
function cardProviderFor(mode, azul = require('../services/azulPagos').cliente()) {
  if (mode === 'own_stripe') return 'stripe';
  if (mode === 'manual') return null;
  return azul.habilitado ? 'azul' : null; // platform (and legacy own_whop)
}

function isSelfServiceMode(mode, azul) {
  return cardProviderFor(mode, azul) !== null;
}
```

`schema.prisma` — en `User`, junto a las columnas de Stripe:

```prisma
  azulTarjetaId               String? // pagos-azul saved card (tarjetaId); AZUL's DataVault token stays in pagos-azul
  azulTarjetaIdBackup         String? // Backup card, tried if the primary declines
```

En `CreditPurchase`: `azulOrdenId String? // pagos-azul order id` y `@@index([azulOrdenId])`. En `RecurringPayment.provider` cambiar el comentario a `// stripe_card | azul_card (legacy: whop)` (el default no cambia).

`server/src/utils/savedCard.js`:

```js
// Where each card processor keeps an account's saved cards.
const COLUMNS = {
  stripe: { primary: 'stripePaymentMethodId', backup: 'stripePaymentMethodIdBackup' },
  azul: { primary: 'azulTarjetaId', backup: 'azulTarjetaIdBackup' },
};

function cardColumn(provider, slot = 'primary') {
  return COLUMNS[provider]?.[slot === 'backup' ? 'backup' : 'primary'] || null;
}

function savedCardId(user, provider, slot = 'primary') {
  const col = cardColumn(provider, slot);
  return (col && user?.[col]) || null;
}

module.exports = { cardColumn, savedCardId, COLUMNS };
```

`autoRecharge.js` — `getSavedCards(user, provider = 'stripe')` usando `savedCardId(user, provider, 'primary'|'backup')` (mismo formato de salida `{ paymentMethodId, memberId: null, slot }`).

`cardOnFile.js`:
- `columnsFor(mode, slot, provider)`: `provider = provider || cardProviderFor(mode)`; si es null → null; si no → `{ provider, field: cardColumn(provider, slot) }`.
- `cardOnFile(prisma, user, { slot, mode, provider, fetchers })` pasa `provider`.
- Fetcher `azul` en `defaultFetchers()`: `azul: async (_prisma, _user, id) => require('./azulPagos').cliente().obtenerTarjeta(id)`.
- `toCard(pm)` acepta también la forma de pagos-azul: si `pm.mascara` → `brand = (pm.marca||'').toLowerCase()`, `last4 = pm.mascara.replace(/\D/g,'').slice(-4)`, `expYear = Number(pm.vence.slice(0,4))`, `expMonth = Number(pm.vence.slice(4,6))`. Una tarjeta con `activa === false` → null.

- [ ] **Step 4: Run** `cd server && npm test` — Expected: todo PASS (incluye los existentes).
- [ ] **Step 5: Commit** `git commit -am "Pick the card processor by billing mode: Stripe or AZUL" && git add server/src/utils/savedCard.js server/tests/savedCard.test.js && git commit --amend --no-edit`

### Task 4: Compra de créditos por la Página de Pago de AZUL

**Files:**
- Modify: `server/src/services/creditCheckout.js` (`manualTopUpBlocker` l.55, `createCreditCheckout`, `createCardSetupCheckout`, nueva `confirmAzulOrder`)
- Test: `server/tests/azulCheckout.test.js`

- [ ] **Step 1: Write the failing test** (prisma falso como en `noCardPayment.test.js`; inyectar el cliente AZUL):

```js
const test = require('node:test');
const assert = require('node:assert');
const checkout = require('../src/services/creditCheckout');

function prismaFor(user) {
  const compras = [];
  return {
    compras,
    user: { findUnique: async ({ where }) => (where.id === user.id ? user : null), findFirst: async () => null },
    creditPurchase: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => { const row = { id: compras.length + 1, ...data }; compras.push(row); return row; },
      update: async ({ where, data }) => Object.assign(compras.find((c) => c.id === where.id), data),
    },
    billingProfile: { findFirst: async () => null },
  };
}

const azul = (o) => ({ habilitado: true, crearOrden: async (args) => { azul.ultima = args; return { id: 'ab12cd34ef56ab78', urlPago: 'https://www.neboaiconsulting.com/api/pagos/ir/ab12cd34ef56ab78', ...o }; } });

test('a platform account buys credits on AZUL and saves the card', async () => {
  const prisma = prismaFor({ id: 6, role: 'CLIENT', billingMode: 'platform', email: 'd@rpm.do', name: 'RPM', vapiCredits: 1 });
  const r = await checkout.createCreditCheckout(prisma, 6, 25, { successUrl: 'https://app.swordaisolutions.com/dashboard?checkout=success', cancelUrl: 'x', azul: azul() });
  assert.strictEqual(r.provider, 'azul');
  assert.strictEqual(r.checkoutUrl, 'https://www.neboaiconsulting.com/api/pagos/ir/ab12cd34ef56ab78');
  assert.strictEqual(prisma.compras[0].status, 'pending');
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'ab12cd34ef56ab78');
  assert.strictEqual(azul.ultima.monto, 25);
  assert.strictEqual(azul.ultima.guardarTarjeta, true);
  assert.strictEqual(azul.ultima.cliente, 'u6');
  assert.strictEqual(azul.ultima.referencia, `NEBO-${prisma.compras[0].id}`);
});

test('AZUL cannot save a card without a purchase', async () => {
  const prisma = prismaFor({ id: 6, role: 'CLIENT', billingMode: 'platform' });
  await assert.rejects(checkout.createCardSetupCheckout(prisma, 6, 'primary', { successUrl: 'x', cancelUrl: 'y', azul: azul() }),
    (e) => e.status === 409);
});

test('confirming an approved AZUL order settles the purchase once', async () => {
  const prisma = prismaFor({ id: 6, role: 'CLIENT', billingMode: 'platform' });
  let settled = 0;
  const purchase = { id: 3, userId: 6, status: 'pending', azulOrdenId: 'ab12cd34ef56ab78', credits: 25 };
  const r = await checkout.confirmAzulOrder(prisma, purchase, {
    azul: { obtenerOrden: async () => ({ id: 'ab12cd34ef56ab78', estado: 'aprobada', tarjetaId: 'tj9' }) },
    settle: async () => { settled += 1; return true; },
  });
  assert.deepStrictEqual(r, { paid: true, credited: true });
  assert.strictEqual(settled, 1);
});
```

- [ ] **Step 2: Run** `node --test tests/azulCheckout.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** en `creditCheckout.js`:
  - `manualTopUpBlocker` (l.55): "tiene tarjeta" = `savedCardId(user, cardProviderFor(mode))` con `mode` de `getEffectiveBilling`.
  - `createCreditCheckout(prisma, userId, amount, { successUrl, cancelUrl, azul = azulPagos.cliente() })`: después de `resolveCharge`, `const { mode } = await getEffectiveBilling(prisma, userId); const provider = cardProviderFor(mode, azul);` Si `provider === null` → 403 `MANUAL_BILLING_MSG`. Si `provider === 'stripe'` → el código actual sin cambios. Si `provider === 'azul'`:

```js
    const purchase = await prisma.creditPurchase.create({ data: { userId, amount: charge.total, credits: charge.subtotal,
      taxRate: charge.taxRate, taxAmount: charge.taxAmount, status: 'pending', kind: 'manual', ...period } });
    const orden = await azul.crearOrden({
      monto: charge.total, cliente: `u${userId}`, referencia: `NEBO-${purchase.id}`,
      descripcion: `${creditsLabel('manual')} ($${charge.subtotal})`,
      // AZUL has no card-only checkout: the card is kept from the first purchase.
      guardarTarjeta: true, retorno: successUrl,
    });
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { azulOrdenId: orden.id } });
    return { provider: 'azul', checkoutUrl: orden.urlPago, purchaseId: purchase.id, amount: charge.total, breakdown };
```

  (`breakdown` se arma igual que en la rama Stripe; extraerlo a una función local `publicBreakdown(charge)` y usarla en las dos ramas.) Un error de `crearOrden` marca la compra `failed` con `errorMessage` y lanza `CheckoutError('No se pudo iniciar el pago con AZUL', 502)`.
  - `createCardSetupCheckout(..., { azul })`: si el proveedor es `azul` → `throw new CheckoutError('Con AZUL la tarjeta se guarda al hacer tu primera compra de créditos.', 409)`.
  - Nueva y exportada:

```js
/**
 * Settle an AZUL purchase by asking pagos-azul for its order (used when the webhook was lost,
 * and by the public portal on return). Saves the card as primary if the account has none.
 */
async function confirmAzulOrder(prisma, purchase, { azul = azulPagos.cliente(), settle = settleCreditPurchase } = {}) {
  if (!purchase?.azulOrdenId) return { paid: false, credited: false };
  const orden = await azul.obtenerOrden(purchase.azulOrdenId);
  if (orden.estado === 'declinada' || orden.estado === 'cancelada') {
    await prisma.creditPurchase.updateMany({ where: { id: purchase.id, status: 'pending' },
      data: { status: 'failed', errorMessage: orden.error || orden.estado } });
    return { paid: false, credited: false };
  }
  if (orden.estado !== 'aprobada') return { paid: false, credited: false };
  const credited = await settle(prisma, purchase, { payload: orden });
  if (orden.tarjetaId) await saveAzulCardIfNone(prisma, purchase.userId, orden.tarjetaId);
  return { paid: true, credited };
}

async function saveAzulCardIfNone(prisma, userId, tarjetaId) {
  await prisma.user.updateMany({ where: { id: userId, azulTarjetaId: null }, data: { azulTarjetaId: tarjetaId } });
}
```

  Exportar `confirmAzulOrder` y `saveAzulCardIfNone`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Buy credits on AZUL's payment page for platform accounts"`

### Task 5: Webhook de pagos-azul

**Files:**
- Create: `server/src/controllers/azulController.js`, `server/src/routes/azul.js`
- Modify: `server/src/index.js` (junto a l.223 y l.283)
- Test: `server/tests/azulWebhook.test.js`

- [ ] **Step 1: Write the failing test** — llamar al handler con `req`/`res` falsos:

```js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { crearHandler } = require('../src/controllers/azulController');

function firmar(obj, s = 'sec') {
  const cuerpo = Buffer.from(JSON.stringify(obj));
  return { cuerpo, firma: crypto.createHmac('sha256', s).update(cuerpo).digest('hex') };
}
function res() { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }

test('an approved order settles its purchase and keeps the card', async () => {
  const llamadas = [];
  const handler = crearHandler({
    secreto: 'sec',
    confirmar: async (prisma, purchase, { orden }) => { llamadas.push([purchase.id, orden.tarjetaId]); return { paid: true, credited: true }; },
  });
  const purchase = { id: 7, userId: 6, status: 'pending', azulOrdenId: 'ab12cd34ef56ab78' };
  const prisma = { creditPurchase: { findFirst: async ({ where }) => (where.azulOrdenId === 'ab12cd34ef56ab78' ? purchase : null) } };
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'ab12cd34ef56ab78', estado: 'aprobada', tarjetaId: 'tj9' } });
  const r = res();
  await handler({ prisma, body: cuerpo, headers: { 'x-pagos-firma': firma } }, r);
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(llamadas, [[7, 'tj9']]);
});

test('a bad signature is refused and nothing is settled', async () => {
  let llamado = false;
  const handler = crearHandler({ secreto: 'sec', confirmar: async () => { llamado = true; } });
  const { cuerpo } = firmar({ evento: 'pago.aprobado', orden: { id: 'x' } });
  const r = res();
  await handler({ prisma: {}, body: cuerpo, headers: { 'x-pagos-firma': 'malo' } }, r);
  assert.strictEqual(r.code, 401);
  assert.strictEqual(llamado, false);
});

test('an order NEBO does not know is acknowledged and ignored', async () => {
  const handler = crearHandler({ secreto: 'sec', confirmar: async () => { throw new Error('no'); } });
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'otra' } });
  const r = res();
  await handler({ prisma: { creditPurchase: { findFirst: async () => null } }, body: cuerpo, headers: { 'x-pagos-firma': firma } }, r);
  assert.strictEqual(r.code, 200);
});
```

- [ ] **Step 2: Run** `node --test tests/azulWebhook.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `server/src/controllers/azulController.js`:

```js
// Webhook from pagos-azul: an order of the "sword" app was approved or declined.
// The body is verified with X-Pagos-Firma (HMAC-SHA256 of the raw body) before anything else.
const azulPagos = require('../services/azulPagos');
const { settleCreditPurchase } = require('../utils/creditSettlement');
const { saveAzulCardIfNone } = require('../services/creditCheckout');

// The order in the webhook is trusted (signed), so it is settled from it directly.
async function confirmarDesdeAviso(prisma, purchase, { orden }) {
  if (orden.estado === 'aprobada') {
    const credited = await settleCreditPurchase(prisma, purchase, { payload: orden });
    if (orden.tarjetaId) await saveAzulCardIfNone(prisma, purchase.userId, orden.tarjetaId);
    return { paid: true, credited };
  }
  await prisma.creditPurchase.updateMany({ where: { id: purchase.id, status: 'pending' },
    data: { status: 'failed', errorMessage: orden.error || 'Declinada' } });
  return { paid: false, credited: false };
}

function crearHandler({ secreto = azulPagos.cliente().secreto, confirmar = confirmarDesdeAviso } = {}) {
  return async function handleWebhook(req, res) {
    const crudo = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
    if (!azulPagos.firmaValida(crudo, req.headers['x-pagos-firma'], secreto)) return res.status(401).json({ error: 'firma inválida' });
    let aviso;
    try { aviso = JSON.parse(crudo.toString('utf8')); } catch { return res.status(400).json({ error: 'JSON inválido' }); }
    const orden = aviso?.orden || {};
    try {
      const purchase = orden.id ? await req.prisma.creditPurchase.findFirst({ where: { azulOrdenId: orden.id } }) : null;
      if (purchase && (aviso.evento === 'pago.aprobado' || aviso.evento === 'pago.declinado')) {
        await confirmar(req.prisma, purchase, { orden });
      }
    } catch (err) {
      console.error('[AZUL webhook]', err.message);
      return res.status(500).json({ error: 'no procesado' }); // pagos-azul retries
    }
    return res.status(200).json({ received: true });
  };
}

module.exports = { crearHandler, confirmarDesdeAviso, handleWebhook: (req, res) => crearHandler()(req, res) };
```

`server/src/routes/azul.js`:

```js
const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/azulController');

// Public: verified by the pagos-azul signature, not by a session.
router.post('/webhook', handleWebhook);

module.exports = router;
```

`server/src/index.js`: junto a l.223 `app.use('/api/azul/webhook', express.raw({ type: 'application/json' }));` y junto a l.283 `app.use('/api/azul', require('./routes/azul'));`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server/src/controllers/azulController.js server/src/routes/azul.js server/tests/azulWebhook.test.js && git commit -am "Settle AZUL purchases from the pagos-azul webhook"`

### Task 6: Cobro sin el cliente presente (recarga automática, recargar ya, cortes, períodos)

**Files:**
- Modify: `server/src/controllers/creditsController.js` (`performOffSessionCharge` l.831-936, `chargeNextCard` l.949, `triggerAutoRecharge` l.969, `processAutoRecharges` l.1077, `getAutoRecharge` l.1174, `updateAutoRecharge` l.1244, `rechargeNow` l.1296, `getCardStatus` l.571, `chargeCardForUser` l.607, `removeCard` l.1138, y las comparaciones `=== 'own_stripe'` listadas en el mapa)
- Modify: `server/src/services/cycleBilling.js` (l.94-98), `server/src/controllers/billingPeriodController.js` (l.49, 290, 391)
- Test: `server/tests/azulOffSession.test.js`

- [ ] **Step 1: Write the failing test** para `performOffSessionCharge` con AZUL (exportarla si no lo está, con un parámetro de dependencias `deps = { azul, settle }`):

```js
const test = require('node:test');
const assert = require('node:assert');
const { performOffSessionCharge } = require('../src/controllers/creditsController');

function prismaPlatform() {
  const compras = [];
  return {
    compras,
    user: { findUnique: async () => ({ id: 6, role: 'CLIENT', billingMode: 'platform', azulTarjetaId: 'tj1' }), findFirst: async () => null },
    creditPurchase: {
      create: async ({ data }) => { const r = { id: compras.length + 1, ...data }; compras.push(r); return r; },
      update: async ({ where, data }) => Object.assign(compras.find((c) => c.id === where.id), data),
      updateMany: async ({ where, data }) => { const c = compras.find((x) => x.id === where.id && (!where.status || x.status === where.status)); if (!c) return { count: 0 }; Object.assign(c, data); return { count: 1 }; },
      findUnique: async ({ where }) => compras.find((c) => c.id === where.id),
    },
    billingProfile: { findFirst: async () => null },
  };
}
const user = { id: 6, role: 'CLIENT', billingMode: 'platform', azulTarjetaId: 'tj1', email: 'd@rpm.do' };

test('an approved AZUL charge settles at once and reads as succeeded', async () => {
  const prisma = prismaPlatform();
  let pedido;
  const azul = { habilitado: true, cobrarTarjeta: async (a) => { pedido = a; return { id: 'o1', estado: 'aprobada' }; } };
  let settled = 0;
  const r = await performOffSessionCharge(prisma, user, 10, 'auto_recharge', null, {}, { azul, settle: async () => { settled++; return true; } });
  assert.strictEqual(r.status, 'succeeded');
  assert.strictEqual(settled, 1);
  assert.strictEqual(pedido.tarjetaId, 'tj1');
  assert.strictEqual(pedido.idempotencia, `nebo-cp-${prisma.compras[0].id}`);
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'o1');
});

test('a declined AZUL charge marks the purchase failed and throws the reason', async () => {
  const prisma = prismaPlatform();
  const azul = { habilitado: true, cobrarTarjeta: async () => ({ id: 'o2', estado: 'declinada', error: 'DENEGADA' }) };
  await assert.rejects(performOffSessionCharge(prisma, user, 10, 'auto_recharge', null, {}, { azul, settle: async () => true }), /DENEGADA/);
  assert.strictEqual(prisma.compras[0].status, 'failed');
});

test('an unconfirmed AZUL charge stays pending for reconciliation', async () => {
  const prisma = prismaPlatform();
  const azul = { habilitado: true, cobrarTarjeta: async () => ({ id: 'o3', estado: 'por-verificar', error: 'x' }) };
  const r = await performOffSessionCharge(prisma, user, 10, 'auto_recharge', null, {}, { azul, settle: async () => true });
  assert.strictEqual(r.status, 'processing');
  assert.strictEqual(prisma.compras[0].status, 'pending');
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'o3');
});
```

- [ ] **Step 2: Run** `node --test tests/azulOffSession.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `performOffSessionCharge(prisma, user, amount, kind, card, options = {}, deps = {})`: `const azul = deps.azul || azulPagos.cliente(); const settle = deps.settle || settleCreditPurchase;` Resolver `mode` y `provider = cardProviderFor(mode, azul)`. `provider === null` → el `NO_CARD` actual. `provider === 'stripe'` → código actual. `provider === 'azul'`:

```js
    const tarjetaId = card?.paymentMethodId || user.azulTarjetaId;
    if (!tarjetaId) { const err = new Error('No saved card'); err.code = 'NO_CARD'; throw err; }
    const purchase = await prisma.creditPurchase.create({ data: { userId: user.id, amount: charge.total, credits: charge.subtotal,
      taxRate: charge.taxRate, taxAmount: charge.taxAmount, status: 'pending', kind, paymentMethodId: tarjetaId, ...periodData } });
    let orden;
    try {
      orden = await azul.cobrarTarjeta({ tarjetaId, monto: charge.total, referencia: `NEBO-${purchase.id}`,
        descripcion: `${creditsLabel(kind)} ($${charge.subtotal})`, idempotencia: `nebo-cp-${purchase.id}` });
    } catch (err) {
      await prisma.creditPurchase.updateMany({ where: { id: purchase.id, status: 'pending' }, data: { status: 'failed', errorMessage: err.message } });
      throw err;
    }
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { azulOrdenId: orden.id } });
    if (orden.estado === 'aprobada') {
      const fresh = await prisma.creditPurchase.findUnique({ where: { id: purchase.id } });
      await settle(prisma, fresh, { payload: orden });
      return { id: orden.id, status: 'succeeded' };
    }
    if (orden.estado === 'por-verificar') return { id: orden.id, status: 'processing' }; // reconciled by the scheduler
    await prisma.creditPurchase.updateMany({ where: { id: purchase.id, status: 'pending' },
      data: { status: 'failed', errorMessage: orden.error || orden.estado, rawPayload: JSON.stringify(orden).slice(0, 10000) } });
    throw Object.assign(new Error(orden.error || 'Card declined'), { declineReason: orden.error });
```

  - Las guardas de modo de `triggerAutoRecharge`, `rechargeNow`, `updateAutoRecharge`, `getCardStatus`, `chargeCardForUser`, `chargeNextCard`, `getAutoRecharge`: reemplazar `mode === 'own_stripe'` por `const provider = cardProviderFor(mode)` + `provider !== null`, y `user.stripePaymentMethodId` por `savedCardId(user, provider)`; `getSavedCards(user, provider)`. En las respuestas: `provider: provider || mode`. En `getAutoRecharge` agregar `cardSetupSupported: provider === 'stripe'` y pasar `provider` a `cardsOnFile`.
  - `removeCard`: limpiar `cardColumn(provider, slot)`; si `provider === 'azul'`, `azulPagos.cliente().retirarTarjeta(id).catch(() => {})`.
  - `processAutoRecharges`: antes de liberar pendientes viejos, para cada `creditPurchase` `status:'pending'`, `azulOrdenId` no nulo, `createdAt` de hace más de 5 min → `confirmAzulOrder(prisma, purchase)` (importado de creditCheckout); solo las que siguen pendientes después de 30 min se liberan como hoy.
  - `cycleBilling.blockedReason` (l.94-98) y `billingPeriodController` (l.49, 290, 391): mismo cambio (`cardProviderFor` + `savedCardId`). `list`/`cyclePlan` devuelven `provider` (`'stripe'|'azul'|mode`).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server/tests/azulOffSession.test.js && git commit -am "Charge a saved AZUL card for auto-recharge, cuts and periods"`

### Task 7: Cobros recurrentes con AZUL

**Files:**
- Modify: `server/src/controllers/recurringPaymentController.js` (`isLegacyEntry` l.39, `create` l.102-105, `chargeSavedCard` l.421-470, `chargeDueRecurringPayments` l.481, `hasCard` l.377-381)
- Test: agregar a `server/tests/azulOffSession.test.js`

- [ ] **Step 1: Test** (exportar `chargeSavedCard` con `deps`):

```js
test('a recurring AZUL charge uses one idempotency key per cycle', async () => {
  const { chargeSavedCard } = require('../src/controllers/recurringPaymentController');
  const pedidos = [];
  const azul = { habilitado: true, cobrarTarjeta: async (a) => { pedidos.push(a); return { id: 'r1', estado: 'aprobada' }; } };
  const prisma = { user: { findUnique: async () => ({ id: 6, role: 'CLIENT', billingMode: 'platform', azulTarjetaId: 'tj1', azulTarjetaIdBackup: null }) },
    recurringPayment: { update: async () => ({}) } };
  const entry = { id: 2, userId: 6, amount: 40, provider: 'azul_card', description: 'Plan', nextPaymentDate: new Date('2026-12-01T00:00:00Z') };
  const r = await chargeSavedCard(prisma, entry, { azul });
  assert.deepStrictEqual(r, { charged: true, paymentIntentId: 'r1' });
  assert.strictEqual(pedidos[0].idempotencia, 'nebo-rp-2-2026-12-01');
  assert.strictEqual(pedidos[0].monto, 40);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `isLegacyEntry(entry)`: `!['stripe_card', 'azul_card'].includes(entry.provider)`.
  - `create`: `const provider = cardProviderFor(mode)`; null → 400 actual; `provider: provider === 'azul' ? 'azul_card' : 'stripe_card'`.
  - `chargeSavedCard(prisma, entry, deps = {})`: si `entry.provider === 'azul_card'`:

```js
    const azul = deps.azul || azulPagos.cliente();
    if (!azul.habilitado) return { charged: false, reason: 'azul_not_configured' };
    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    const cards = getSavedCards(user, 'azul');
    if (!cards.length) return { charged: false, reason: 'no_card' };
    await prisma.recurringPayment.update({ where: { id: entry.id }, data: { lastChargeAttemptAt: new Date() } });
    const ciclo = new Date(entry.nextPaymentDate).toISOString().slice(0, 10);
    let declineReason = null;
    for (const card of cards) {
      try {
        const orden = await azul.cobrarTarjeta({ tarjetaId: card.paymentMethodId, monto: entry.amount,
          referencia: `NEBO-RP-${entry.id}`, descripcion: entry.description || 'Pago recurrente',
          idempotencia: `nebo-rp-${entry.id}-${ciclo}${card.slot === 'backup' ? '-b' : ''}` });
        if (orden.estado === 'aprobada') return { charged: true, paymentIntentId: orden.id };
        declineReason = orden.error || orden.estado;
      } catch (err) { declineReason = err.message; }
    }
    return { charged: false, reason: 'card_declined', declineReason };
```

  - `chargeDueRecurringPayments`: `provider: { in: ['stripe_card', 'azul_card'] }`.
  - `hasCard` (l.377-381): `savedCardId(user, entry.provider === 'azul_card' ? 'azul' : 'stripe')`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Charge recurring payments to a saved AZUL card"`

### Task 8: Portal público (y el arreglo de la recarga)

**Files:**
- Modify: `server/src/controllers/paymentPortalController.js` (l.75, 105, 110, 357-360, `confirmPayment` l.228-241, `startTopUp` l.394)
- Modify: `client/src/components/Public/PaymentPortalPage.jsx` (efecto de retorno l.74-88), `client/src/components/Public/WalletPage.jsx` (l.86-91, l.115)

- [ ] **Step 1:** `startTopUp` l.394: `res.json({ url: result.checkoutUrl, checkoutUrl: result.checkoutUrl, purchaseId: result.purchaseId })`. `WalletPage.jsx:115`: `goTo(res.checkoutUrl || res.url)`.
- [ ] **Step 2:** `hasCard`/`canPay`/`canTopUp` con `cardProviderFor(mode)` + `savedCardId(user, provider)`.
- [ ] **Step 3:** `confirmPayment`: si `req.body.purchaseId` y la compra es del usuario y tiene `azulOrdenId` → `confirmAzulOrder(req.prisma, purchase)` y devolver `{ ...result, balance }`; si no, el flujo Stripe actual. En `PaymentPortalPage.jsx` y `WalletPage.jsx`, guardar `purchaseId` en `sessionStorage` (try/catch) antes de ir a AZUL y, al volver con `?pago=<id>&estado=aprobada` (el formato de pagos-azul), llamar `payAPI.confirm(token, null, purchaseId)`; ajustar `payAPI.confirm` en `client/src/services/api.js` para mandar `{ sessionId, purchaseId }`.
- [ ] **Step 4: Run** `cd server && npm test` y `cd client && npx vite build` — Expected: PASS / build OK.
- [ ] **Step 5: Commit** `git commit -am "Pay the public portal and wallet through AZUL; fix the wallet top-up link"`

### Task 9: Pantallas

**Files:**
- Modify: `client/src/components/Dashboard/DashboardLayout.jsx` (`AddCreditsModal` l.801+), `BillingPeriods.jsx` (l.324), `AccountManagement.jsx` (l.1021, l.1805-1809)

- [ ] **Step 1:** `AddCreditsModal`: guardar `cardSetupSupported` de `getAutoRecharge`; ocultar "Agregar tarjeta" cuando es false y mostrar en su lugar: "Tu tarjeta se guarda al hacer tu primera compra (pago seguro con AZUL)." Al volver con `?checkout=success` (o `?pago=…&estado=aprobada`), recargar `fetchAr` y el saldo a los 3 s.
- [ ] **Step 2:** Etiquetas "· Stripe" fijas (`BillingPeriods.jsx:324`, `AccountManagement.jsx:1021`) → `· ${provider === 'azul' ? 'AZUL' : 'Stripe'}`.
- [ ] **Step 3:** `AccountManagement.jsx` opción `platform`: "Plataforma — los clientes pagan con tarjeta por AZUL (Nebo AI) o tú les cargas el saldo a mano."
- [ ] **Step 4: Run** `cd client && npx vite build` — Expected: OK.
- [ ] **Step 5: Commit** `git commit -am "Show AZUL as the card processor for platform accounts"`

### Task 10: Configurar y probar en nebocore (sandbox)

No es código del repo; lo hace quien despliega, con OK de Jorge en el momento.

- [ ] **Step 1:** En pagos-azul (`/opt/nebo/.env`, `PAGOS_APPS`): agregar la app `sword` con `clave` y `secreto` nuevos, `webhook: "http://sword:8080/api/azul/webhook"` y `retornos` = los orígenes https de NEBO (`https://app.swordaisolutions.com`, `https://lmconsultingai.com`, `https://panel.neboaiconsulting.com`). Publicar la Task 1 en `/opt/nebo/pagos` y recrear `pagos`.
- [ ] **Step 2:** En `/opt/nebo/sword.env`: `PAGOS_AZUL_URL=http://pagos:3100`, `PAGOS_AZUL_CLAVE`, `PAGOS_AZUL_SECRETO` (los mismos de la app `sword`), copiados de servidor a servidor sin imprimirlos.
- [ ] **Step 3:** PR → merge → despliegue automático. Comprobar `prisma db push` en el log (columnas nuevas) y salud.
- [ ] **Step 4:** Prueba con una cuenta `platform` de prueba: comprar US$1 con la tarjeta de prueba 3 → créditos acreditados, tarjeta guardada; "Recargar ya" US$1 → aprobada sin pasar por la página; quitar la tarjeta.

---

## Self-review

- Cobertura: compra (T4), webhook (T5), tarjeta guardada (T3/T4/T5), recarga automática + recargar ya + cortes + períodos (T6), recurrentes (T7), portal y bug de recarga (T8), UI (T9), despliegue (T10), consulta/retiro de tarjeta en pagos-azul (T1).
- Nombres: `cardProviderFor`, `savedCardId`, `cardColumn`, `getSavedCards(user, provider)`, `confirmAzulOrder`, `saveAzulCardIfNone`, `azulPagos.cliente()`, `crearCliente`, `firmaValida`, `azulOrdenId`, `azulTarjetaId(Backup)`, `azul_card` — usados igual en todas las tareas.
- Impuesto: sin cambio a propósito (gate `own_stripe` en `taxes.js:145`).
