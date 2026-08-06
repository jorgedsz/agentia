// ─────────────────────────────────────────────────────────────────────────
// Mini-servidor LOCAL para el generador de reportes de consumo
// (tools/reporte-consumo.html). Lee la BD real directo con la DATABASE_URL
// de server/.env y sirve el HTML + los datos, así no hace falta subir CSVs.
//
// Uso (desde la carpeta server/):
//     node scripts/reporte-consumo-server.js
// Luego abrí:  http://localhost:5055
//
// Es solo para uso local; no se despliega. Solo lee (SELECT), nunca escribe.
// ─────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { decryptPHI } = require('../src/utils/phiEncryption');

const PORT = parseInt(process.env.REPORT_PORT) || 5055;
const HTML_PATH = path.join(__dirname, '..', '..', 'tools', 'reporte-consumo.html');

// Lee tools/db.local.json (fuera de git) una sola vez.
function configLocal() {
  const f = path.join(__dirname, '..', '..', 'tools', 'db.local.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; }
  catch (e) { console.error('  ⚠  tools/db.local.json no es JSON válido:', e.message); return {}; }
}
const LOCAL = configLocal();

// ── Base de esta app (llamadas, cuentas, chatbotMessage) ────────────────────
// A propósito NO se toca server/.env: si ahí quedara la URL de producción,
// cualquier `npm run dev` escribiría contra producción sin querer. Este script
// solo lee, así que recibe su propia URL y deja el .env como esté.
const APP_URL = process.env.REPORT_DATABASE_URL || LOCAL.appDbUrl || null;
const prisma = new PrismaClient(
  APP_URL ? { datasources: { db: { url: APP_URL } } } : {}
);
const app = express();

// ── Base de WhatsApp (dashboard) ────────────────────────────────────────────
// Es una base DISTINTA a la de esta app: ahí vive la tabla `messages` con el
// coste real por mensaje. El string de conexión no se versiona; sale de
// WHATSAPP_DB_URL o de tools/db.local.json (ambos fuera de git).
const WA_URL = process.env.WHATSAPP_DB_URL || LOCAL.messagesDbUrl || null;

// La base de WhatsApp es de UNA sola instancia: su tabla `messages` no tiene
// columna de cuenta, así que todo su consumo pertenece a un único cliente. Se
// declara aquí para no imputarle ese gasto a otra cuenta por descuido.
const WA_ACCOUNT_ID = process.env.WHATSAPP_ACCOUNT_ID
  ? parseInt(process.env.WHATSAPP_ACCOUNT_ID)
  : (LOCAL.whatsappAccountId != null ? parseInt(LOCAL.whatsappAccountId) : null);
const waPool = WA_URL
  ? new Pool({
      connectionString: WA_URL,
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 15000,
      // Candado aplicado al abrir la conexión: cualquier escritura falla en el
      // servidor de base de datos, no depende de que el código se porte bien.
      options: '-c default_transaction_read_only=on'
    })
  : null;
if (waPool) waPool.on('error', e => console.error('  ⚠  pool WhatsApp:', e.message));

// Postgres acepta nombres IANA; se valida para no concatenar texto del cliente.
const TZ_OK = /^[A-Za-z][A-Za-z0-9+_\/-]{1,63}$/;

// Serve the report tool itself
app.get('/', (req, res) => res.sendFile(HTML_PATH));

// ── Alcance del reporte ─────────────────────────────────────────────────────
// Si se declara una cuenta raíz, el desplegable muestra solo esa cuenta y todo
// lo que cuelga de ella. La jerarquía es WHITELABEL → agencias (whitelabelId)
// → clientes (agencyId), y un CLIENT puede colgar directo del whitelabel.
// Sin raíz declarada se listan todas las cuentas, como antes.
const SCOPE_ID = process.env.REPORT_SCOPE_ACCOUNT_ID
  ? parseInt(process.env.REPORT_SCOPE_ACCOUNT_ID)
  : (LOCAL.reportScopeAccountId != null ? parseInt(LOCAL.reportScopeAccountId) : null);

// La conexión al Lightsail se corta de forma intermitente ("Can't reach database
// server", ENOTFOUND, ECONNRESET) aunque la base esté perfectamente viva. No es
// un fallo del código, así que los errores de red se reintentan en vez de
// convertirse en un 500 delante del usuario.
const TRANSITORIO = /Can't reach database server|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|Connection terminated|Timed out fetching|server closed the connection/i;

async function reintentar(fn, intentos = 3, espera = 1200) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e && e.message) || '';
      if (i >= intentos || !TRANSITORIO.test(msg)) throw e;
      console.warn(`  ↻ reintento ${i}/${intentos - 1}: ${msg.split('\n').find(l => l.trim()) || msg}`);
      await new Promise(r => setTimeout(r, espera * i));
    }
  }
}

const SELECT_CUENTA = { id: true, name: true, email: true, role: true, agencyId: true, whitelabelId: true };

async function cuentasDelAlcance() {
  if (SCOPE_ID == null) {
    const todas = await prisma.user.findMany({
      select: SELECT_CUENTA, orderBy: [{ name: 'asc' }, { email: 'asc' }]
    });
    return { clients: todas, scope: null };
  }

  const raiz = await prisma.user.findUnique({ where: { id: SCOPE_ID }, select: SELECT_CUENTA });
  if (!raiz) return { clients: [], scope: { id: SCOPE_ID, name: null, error: 'la cuenta raíz no existe' } };

  // Agencias del whitelabel, y clientes tanto de esas agencias como de la raíz
  const agencias = await prisma.user.findMany({ where: { whitelabelId: SCOPE_ID }, select: SELECT_CUENTA });
  const padres = [SCOPE_ID, ...agencias.map(a => a.id)];
  const clientes = await prisma.user.findMany({
    where: { agencyId: { in: padres } }, select: SELECT_CUENTA
  });

  const porId = new Map();
  for (const u of [raiz, ...agencias, ...clientes]) porId.set(u.id, u);
  const lista = [...porId.values()].sort((a, b) =>
    (a.name || a.email || '').localeCompare(b.name || b.email || ''));

  return {
    clients: lista,
    scope: { id: raiz.id, name: raiz.name || raiz.email, role: raiz.role, total: lista.length }
  };
}

// Ids del alcance, para autorizar qué cuentas pueden usar la base de WhatsApp
async function idsDelAlcance() {
  const { clients } = await cuentasDelAlcance();
  return new Set(clients.map(c => c.id));
}

// Accounts to pick from (dropdown)
app.get('/api/report/clients', async (req, res) => {
  try {
    res.json(await reintentar(() => cuentasDelAlcance()));
  } catch (err) {
    console.error('clients error:', err.message);
    res.status(500).json({ error: 'No se pudo listar cuentas' });
  }
});

function dateRange(desde, hasta) {
  const range = {};
  if (desde) { const d = new Date(desde + 'T00:00:00'); if (!isNaN(d)) range.gte = d; }
  if (hasta) { const d = new Date(hasta + 'T23:59:59.999'); if (!isNaN(d)) range.lte = d; }
  return Object.keys(range).length ? range : undefined;
}

// Calls + chatbot messages for one account, optionally within a date range.
app.get('/api/report/data', async (req, res) => {
  try {
    const clientId = parseInt(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

    // No se sirven datos de cuentas fuera del alcance declarado
    if (SCOPE_ID != null && !(await reintentar(() => idsDelAlcance())).has(clientId)) {
      return res.status(403).json({ error: `La cuenta ${clientId} está fuera del alcance del reporte.` });
    }

    const createdAt = dateRange(req.query.desde, req.query.hasta);
    const where = { userId: clientId, ...(createdAt ? { createdAt } : {}) };

    // vapiCredits es el saldo que el cliente ve en su panel: el reporte lo usa
    // para contrastar el saldo que calcula y delatar cualquier descuadre.
    const client = await reintentar(() => prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, email: true, vapiCredits: true },
    }));

    // Los mensajes del reporte son los de chatbotMessage: es lo que realmente
    // descuenta saldo (costCharged), así que el reporte cierra contra las
    // recargas de Whop. La base de WhatsApp cuenta la actividad de toda la
    // instancia y no cuadra con el saldo del cliente. Se puede omitir con
    // ?chatbot=0 cuando solo interesan las llamadas.
    const conChatbot = req.query.chatbot !== '0';
    const [callRows, msgRows] = await reintentar(() => Promise.all([
      prisma.callLog.findMany({ where, orderBy: { createdAt: 'desc' } }),
      conChatbot
        ? prisma.chatbotMessage.findMany({ where, orderBy: { createdAt: 'desc' } })
        : Promise.resolve([]),
    ]));

    // Agent names for the calls
    const agentIds = [...new Set(callRows.map(r => r.agentId).filter(Boolean))];
    const agents = agentIds.length
      ? await reintentar(() => prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }))
      : [];
    const agentName = Object.fromEntries(agents.map(a => [a.id, a.name]));

    const calls = callRows.map(row => {
      const d = decryptPHI(row);
      return {
        fecha: row.createdAt.toISOString(),
        costo: d.costCharged || 0,
        agente: row.agentId ? (agentName[row.agentId] || '(agente eliminado)') : '(sin agente)',
        seg: d.durationSeconds || 0,
        tipo: row.type || '',
        resultado: d.outcome || '',
        cliente: d.customerNumber || '',
      };
    });

    const messages = msgRows.map(m => ({
      fecha: m.createdAt.toISOString(),
      costo: m.costCharged || 0,
      contacto: m.contactName || m.sessionId || '',
      chatbot: m.chatbotName || '',
    }));

    res.json({ client, calls, messages });
  } catch (err) {
    console.error('data error:', err.message);
    res.status(500).json({ error: 'No se pudieron leer los datos' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Gmail: OAuth, PDF y envío
// ════════════════════════════════════════════════════════════════════════════

const { google } = require('googleapis');
const { spawn } = require('child_process');
const os = require('os');

const CONFIG_LOCAL = path.join(__dirname, '..', '..', 'tools', 'db.local.json');
function guardarLocal(cambios) {
  const actual = fs.existsSync(CONFIG_LOCAL)
    ? JSON.parse(fs.readFileSync(CONFIG_LOCAL, 'utf8')) : {};
  const nuevo = { ...actual, ...cambios };
  fs.writeFileSync(CONFIG_LOCAL, JSON.stringify(nuevo, null, 2) + '\n');
  Object.assign(LOCAL, cambios);
  return nuevo;
}

const GMAIL_REDIRECT = `http://localhost:${PORT}/auth/gmail/callback`;
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
];

// Las credenciales pueden venir del .env o de tools/db.local.json. Se admite el
// archivo local porque el .env de este proyecto las tiene vacías y su
// GOOGLE_REDIRECT_URI apunta a producción: mejor no tocarlo.
function credencialesGoogle() {
  return {
    id: process.env.GOOGLE_CLIENT_ID || LOCAL.googleClientId || null,
    secret: process.env.GOOGLE_CLIENT_SECRET || LOCAL.googleClientSecret || null
  };
}

function oauthGmail() {
  const { id, secret } = credencialesGoogle();
  if (!id || !secret) {
    throw new Error('Faltan las credenciales de Google. Agregá "googleClientId" y ' +
      '"googleClientSecret" a tools/db.local.json (o definilas en server/.env).');
  }
  return new google.auth.OAuth2(id, secret, GMAIL_REDIRECT);
}

// Cliente autenticado a partir del refresh token guardado en db.local.json
function clienteGmail() {
  const g = LOCAL.gmail;
  if (!g || !g.refreshToken) return null;
  const c = oauthGmail();
  c.setCredentials({ refresh_token: g.refreshToken });
  return c;
}

app.get('/auth/gmail', (req, res) => {
  try {
    // prompt=consent fuerza que Google devuelva refresh_token también en
    // reautorizaciones; sin esto solo llega la primera vez.
    res.redirect(oauthGmail().generateAuthUrl({
      access_type: 'offline', prompt: 'consent', scope: GMAIL_SCOPES
    }));
  } catch (e) {
    res.status(500).send('<pre>' + e.message + '</pre>');
  }
});

app.get('/auth/gmail/callback', async (req, res) => {
  const pagina = (titulo, cuerpo, color) => `<!doctype html><meta charset="utf-8">
    <body style="font:15px system-ui;padding:40px;max-width:640px;margin:auto;color:#0b0b0b">
    <h2 style="color:${color}">${titulo}</h2><p>${cuerpo}</p>
    <p><a href="/">Volver al generador de reportes</a></p></body>`;
  try {
    if (req.query.error) throw new Error('Google devolvió: ' + req.query.error);
    if (!req.query.code) throw new Error('Google no envió el código de autorización');

    const c = oauthGmail();
    const { tokens } = await c.getToken(req.query.code);
    if (!tokens.refresh_token) {
      throw new Error('Google no devolvió refresh_token. Revocá el acceso de esta app en ' +
        'myaccount.google.com/permissions y volvé a autorizar.');
    }
    c.setCredentials(tokens);
    const { data } = await google.oauth2({ version: 'v2', auth: c }).userinfo.get();

    guardarLocal({ gmail: { refreshToken: tokens.refresh_token, email: data.email } });
    console.log(`  ✓ Gmail conectado como ${data.email}`);
    res.send(pagina('Gmail conectado', `Los reportes se enviarán desde <b>${data.email}</b>.`, '#0a7d0a'));
  } catch (e) {
    console.error('gmail callback:', e.message);
    res.status(500).send(pagina('No se pudo conectar Gmail', e.message, '#c23434'));
  }
});

app.get('/api/report/gmail/estado', (req, res) => {
  const g = LOCAL.gmail;
  res.json({
    conectado: !!(g && g.refreshToken),
    email: g ? g.email : null,
    redirect: GMAIL_REDIRECT,
    configurado: !!(credencialesGoogle().id && credencialesGoogle().secret)
  });
});

// ── Correo del cliente ──────────────────────────────────────────────────────
// Se guarda en db.local.json (fuera de git) en vez de tocar el esquema de
// producción. Si no hay uno asignado se propone el email de la cuenta.
app.get('/api/report/email', async (req, res) => {
  try {
    const clientId = parseInt(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    const u = await reintentar(() => prisma.user.findUnique({
      where: { id: clientId }, select: { email: true, name: true }
    }));
    const asignado = (LOCAL.reportEmails || {})[String(clientId)] || null;
    res.json({ email: asignado || (u ? u.email : '') || '', asignado: !!asignado,
               emailCuenta: u ? u.email : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/report/email', express.json(), (req, res) => {
  const clientId = parseInt(req.body && req.body.clientId);
  const email = String((req.body && req.body.email) || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido' });
  }
  const mapa = { ...(LOCAL.reportEmails || {}) };
  if (email) mapa[String(clientId)] = email; else delete mapa[String(clientId)];
  guardarLocal({ reportEmails: mapa });
  res.json({ ok: true, email });
});

// ── PDF: se renderiza ESTA misma página con el Chrome ya instalado ──────────
// Evita depender de Puppeteer (~300 MB) y garantiza que el PDF sea idéntico a
// lo que se ve en pantalla, porque literalmente es la misma página.
function buscarChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidatos = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
       '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidatos.find(p => fs.existsSync(p)) || null;
}

function generarPDF({ clientId, desde, hasta, vista, margen }) {
  return new Promise((resolve, reject) => {
    const chrome = buscarChrome();
    if (!chrome) return reject(new Error('No se encontró Chrome ni Edge. Definí CHROME_PATH.'));

    const salida = path.join(os.tmpdir(), `reporte-${clientId}-${Date.now()}.pdf`);
    const perfil = path.join(os.tmpdir(), `reporte-chrome-${Date.now()}`);
    const q = new URLSearchParams({ clientId: String(clientId) });
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    // Por defecto se imprime la vista de cliente: es la que se manda fuera
    q.set('vista', vista === 'interna' ? 'interna' : 'cliente');
    if (margen !== undefined && margen !== null && margen !== '') q.set('margen', String(margen));

    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      `--user-data-dir=${perfil}`,
      '--virtual-time-budget=45000',      // margen para que la base responda
      '--no-pdf-header-footer',
      `--print-to-pdf=${salida}`,
      `http://localhost:${PORT}/?${q.toString()}`
    ];

    const p = spawn(chrome, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    const limite = setTimeout(() => { p.kill(); reject(new Error('El PDF tardó demasiado')); }, 90000);

    p.on('error', e => { clearTimeout(limite); reject(e); });
    p.on('exit', () => {
      clearTimeout(limite);
      try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (_) {}
      if (!fs.existsSync(salida)) {
        return reject(new Error('Chrome no generó el PDF. ' + err.split('\n')[0]));
      }
      const buf = fs.readFileSync(salida);
      try { fs.unlinkSync(salida); } catch (_) {}
      resolve(buf);
    });
  });
}

app.get('/api/report/pdf', async (req, res) => {
  try {
    const clientId = parseInt(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (SCOPE_ID != null && !(await reintentar(() => idsDelAlcance())).has(clientId)) {
      return res.status(403).json({ error: `La cuenta ${clientId} está fuera del alcance.` });
    }
    const pdf = await generarPDF({
      clientId, desde: req.query.desde, hasta: req.query.hasta,
      vista: req.query.vista, margen: req.query.margen
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${clientId}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('pdf error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Envío ───────────────────────────────────────────────────────────────────
// MIME multipart armado a mano: la API de Gmail recibe el mensaje crudo, así
// que no hace falta ninguna librería de correo.
function construirMIME({ de, para, cc, asunto, texto, adjuntos }) {
  const b = 'lim' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const utf8b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const cab = s => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

  let m = '';
  m += `From: ${de}\r\n`;
  m += `To: ${para}\r\n`;
  if (cc) m += `Cc: ${cc}\r\n`;
  m += `Subject: ${cab(asunto)}\r\n`;
  m += 'MIME-Version: 1.0\r\n';
  m += `Content-Type: multipart/mixed; boundary="${b}"\r\n\r\n`;

  m += `--${b}\r\nContent-Type: text/plain; charset="UTF-8"\r\n`;
  m += 'Content-Transfer-Encoding: base64\r\n\r\n' + utf8b64(texto) + '\r\n\r\n';

  for (const a of adjuntos) {
    m += `--${b}\r\nContent-Type: ${a.tipo}; name="${a.nombre}"\r\n`;
    m += `Content-Disposition: attachment; filename="${a.nombre}"\r\n`;
    m += 'Content-Transfer-Encoding: base64\r\n\r\n';
    m += a.datos.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n\r\n';
  }
  m += `--${b}--`;
  return Buffer.from(m, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

app.post('/api/report/enviar', express.json({ limit: '30mb' }), async (req, res) => {
  try {
    const auth = clienteGmail();
    if (!auth) return res.status(400).json({ error: 'Gmail no está conectado. Entrá a /auth/gmail.' });

    const { clientId, para, cc, asunto, texto, desde, hasta, excelBase64, nombreExcel,
            vista, margen } = req.body || {};
    const cid = parseInt(clientId);
    if (!cid) return res.status(400).json({ error: 'clientId requerido' });
    if (!para) return res.status(400).json({ error: 'Falta el correo del destinatario' });
    if (SCOPE_ID != null && !(await reintentar(() => idsDelAlcance())).has(cid)) {
      return res.status(403).json({ error: `La cuenta ${cid} está fuera del alcance.` });
    }

    const adjuntos = [];
    // Se envía SIEMPRE la vista de cliente salvo que se pida lo contrario a
    // propósito: un PDF interno lleva costos y márgenes que no se comparten.
    const pdf = await generarPDF({ clientId: cid, desde, hasta, vista, margen });
    adjuntos.push({ nombre: (req.body.nombrePdf || 'reporte.pdf'),
                    tipo: 'application/pdf', datos: pdf });
    if (excelBase64) {
      adjuntos.push({
        nombre: nombreExcel || 'detalle.xlsx',
        tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        datos: Buffer.from(excelBase64, 'base64')
      });
    }

    const raw = construirMIME({
      de: LOCAL.gmail.email, para, cc: cc || '', asunto: asunto || 'Reporte de consumo',
      texto: texto || '', adjuntos
    });

    const r = await google.gmail({ version: 'v1', auth })
      .users.messages.send({ userId: 'me', requestBody: { raw } });

    console.log(`  ✉ Reporte enviado a ${para} (${adjuntos.length} adjuntos)`);
    res.json({ ok: true, id: r.data.id, para,
               adjuntos: adjuntos.map(a => ({ nombre: a.nombre, bytes: a.datos.length })) });
  } catch (e) {
    console.error('enviar error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Detalle línea por línea, para el Excel ──────────────────────────────────
// Va aparte de /api/report/data porque incluye los textos de cada mensaje: son
// megas que no hacen falta para pintar el reporte, solo para exportarlo.
app.get('/api/report/detalle', async (req, res) => {
  try {
    const clientId = parseInt(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (SCOPE_ID != null && !(await reintentar(() => idsDelAlcance())).has(clientId)) {
      return res.status(403).json({ error: `La cuenta ${clientId} está fuera del alcance del reporte.` });
    }

    const createdAt = dateRange(req.query.desde, req.query.hasta);
    const where = { userId: clientId, ...(createdAt ? { createdAt } : {}) };

    const [callRows, msgRows] = await reintentar(() => Promise.all([
      prisma.callLog.findMany({ where, orderBy: { createdAt: 'asc' } }),
      prisma.chatbotMessage.findMany({ where, orderBy: { createdAt: 'asc' } })
    ]));

    const agentIds = [...new Set(callRows.map(r => r.agentId).filter(Boolean))];
    const agents = agentIds.length
      ? await reintentar(() => prisma.agent.findMany({
          where: { id: { in: agentIds } }, select: { id: true, name: true } }))
      : [];
    const agentName = Object.fromEntries(agents.map(a => [a.id, a.name]));

    // "inbound"/"outbound" en CallLog.type se traduce a entrante/saliente
    const sentido = (t) => {
      const s = String(t || '').toLowerCase();
      if (s.includes('inbound')) return 'Entrante';
      if (s.includes('outbound')) return 'Saliente';
      return '';
    };

    const llamadas = callRows.map(row => {
      const d = decryptPHI(row);
      return {
        fecha: row.createdAt.toISOString(),
        direccion: sentido(row.type),
        agente: row.agentId ? (agentName[row.agentId] || '(agente eliminado)') : '(sin agente)',
        contacto: d.customerNumber || '',
        seg: Math.round(d.durationSeconds || 0),
        resultado: d.outcome || '',
        razonFin: row.endedReason || '',
        costo: d.costCharged || 0
      };
    });

    const TOPE = 400;
    const recorta = (t) => {
      const s = String(t || '').replace(/\s+/g, ' ').trim();
      return s.length > TOPE ? s.slice(0, TOPE) + '…' : s;
    };
    // La fuente de los mensajes depende de la vista, igual que en el reporte.
    const vistaInterna = req.query.vista === 'interna';

    let mensajes = [];
    if (!vistaInterna) {
      // Vista cliente: ChatbotMessage. Cada fila es un intercambio, así que se
      // abre en dos (entrante y saliente) y el importe va en la saliente.
      for (const m of msgRows) {
        const base = {
          fecha: m.createdAt.toISOString(),
          modelo: m.chatbotName || '',
          contacto: m.contactName || m.sessionId || ''
        };
        if (m.inputMessage) {
          mensajes.push({ ...base, direccion: 'Entrante', texto: recorta(m.inputMessage),
                          facturado: 0, costo: 0 });
        }
        mensajes.push({ ...base, direccion: 'Saliente', texto: recorta(m.outputMessage),
                        facturado: m.costCharged || 0, costo: 0 });
      }
    } else if (waPool) {
      const cond = ['1=1'];
      const par = [];
      if (req.query.desde) { par.push(new Date(req.query.desde + 'T00:00:00')); cond.push(`m.created_at >= $${par.length}`); }
      if (req.query.hasta) {
        const h = new Date(req.query.hasta + 'T00:00:00'); h.setDate(h.getDate() + 1);
        par.push(h); cond.push(`m.created_at < $${par.length}`);
      }
      const { rows } = await reintentar(() => waPool.query(`
        SELECT m.created_at, m.direction, m.model, m.text, m.type,
               COALESCE(m.charged_usd, 0)::float8 AS charged_usd,
               COALESCE(m.cost_usd, 0)::float8    AS cost_usd,
               c.phone, c.name
        FROM messages m
        LEFT JOIN conversations cv ON cv.id = m.conversation_id
        LEFT JOIN contacts c ON c.id = cv.contact_id
        WHERE ${cond.join(' AND ')}
        ORDER BY m.created_at ASC`, par));

      mensajes = rows.map(r => ({
        fecha: r.created_at.toISOString(),
        direccion: r.direction === 'out' ? 'Saliente' : r.direction === 'in' ? 'Entrante' : (r.direction || ''),
        modelo: r.model || '',
        contacto: r.name || r.phone || '',
        texto: recorta(r.text || (r.type && r.type !== 'text' ? '[' + r.type + ']' : '')),
        facturado: r.charged_usd,
        costo: r.cost_usd
      }));
    }

    res.json({ llamadas, mensajes, interna: vistaInterna, sinWhatsapp: vistaInterna && !waPool });
  } catch (err) {
    console.error('detalle error:', err.message);
    res.status(500).json({ error: 'No se pudo leer el detalle: ' + err.message });
  }
});

// ── Recargas de saldo (Whop) ────────────────────────────────────────────────
// Sale de CreditPurchase, que ya registra cada cobro con su tarjeta
// (`paymentMethodId`), su id de pago en Whop y cómo se originó (`kind`).
// Devuelve también los rechazos y la configuración de auto-recarga, para poder
// contar "cuándo se le cobró a esta tarjeta" y "cuándo se le va a cobrar".
const ETIQUETA_KIND = {
  manual: 'Checkout manual',
  manual_card: 'Cobro a tarjeta (1 clic)',
  auto_recharge: 'Auto-recarga'
};

app.get('/api/report/recargas', async (req, res) => {
  try {
    const clientId = parseInt(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (SCOPE_ID != null && !(await reintentar(() => idsDelAlcance())).has(clientId)) {
      return res.status(403).json({ error: `La cuenta ${clientId} está fuera del alcance del reporte.` });
    }

    const createdAt = dateRange(req.query.desde, req.query.hasta);
    const [cuenta, compras] = await reintentar(() => Promise.all([
      prisma.user.findUnique({
        where: { id: clientId },
        select: {
          vapiCredits: true, whopPaymentMethodId: true, whopPaymentMethodIdBackup: true,
          autoRechargeEnabled: true, autoRechargeThreshold: true, autoRechargeAmount: true,
          autoRechargeLastAt: true, autoRechargeFailCount: true, autoRechargeLastError: true
        }
      }),
      prisma.creditPurchase.findMany({
        where: { userId: clientId, ...(createdAt ? { createdAt } : {}) },
        orderBy: { createdAt: 'desc' }
      })
    ]));
    if (!cuenta) return res.status(404).json({ error: 'cuenta no encontrada' });

    // Una tarjeta se identifica por su id de Whop (payt_xxx). No guardamos los
    // últimos 4 dígitos, así que se etiqueta por el papel que cumple hoy.
    const papel = (pm) => {
      if (!pm) return null;
      if (pm === cuenta.whopPaymentMethodId) return 'principal';
      if (pm === cuenta.whopPaymentMethodIdBackup) return 'backup';
      return 'anterior';
    };
    const corto = (pm) => pm ? '…' + pm.slice(-6) : null;

    const fila = (p) => ({
      id: p.id,
      fecha: p.createdAt.toISOString(),
      importe: p.amount,
      creditos: p.credits,
      estado: p.status,
      kind: p.kind,
      kindLabel: ETIQUETA_KIND[p.kind] || p.kind,
      tarjetaId: p.paymentMethodId || null,
      tarjetaPapel: papel(p.paymentMethodId),
      tarjetaCorta: corto(p.paymentMethodId),
      whopPaymentId: p.whopPaymentId || null,
      error: p.errorMessage || null
    });

    const completadas = compras.filter(p => p.status === 'completed').map(fila);
    const rechazadas = compras.filter(p => p.status === 'failed').map(fila);
    const pendientes = compras.filter(p => p.status === 'pending').map(fila);

    // Resumen por tarjeta: cuánto se le cobró a cada una y cuándo fue la última
    const porTarjeta = new Map();
    for (const r of completadas) {
      const clave = r.tarjetaId || '(sin tarjeta · checkout)';
      if (!porTarjeta.has(clave)) {
        porTarjeta.set(clave, {
          tarjetaId: r.tarjetaId, papel: r.tarjetaPapel, corta: r.tarjetaCorta,
          cobros: 0, total: 0, primera: r.fecha, ultima: r.fecha
        });
      }
      const t = porTarjeta.get(clave);
      t.cobros++; t.total += r.importe;
      if (r.fecha > t.ultima) t.ultima = r.fecha;
      if (r.fecha < t.primera) t.primera = r.fecha;
    }

    res.json({
      completadas, rechazadas, pendientes,
      porTarjeta: [...porTarjeta.values()].sort((a, b) => b.ultima.localeCompare(a.ultima)),
      total: completadas.reduce((a, r) => a + r.importe, 0),
      cuenta: {
        saldoActual: cuenta.vapiCredits,
        tarjetaPrincipal: corto(cuenta.whopPaymentMethodId),
        tarjetaPrincipalId: cuenta.whopPaymentMethodId,
        tarjetaBackup: corto(cuenta.whopPaymentMethodIdBackup),
        autoRecarga: {
          activa: cuenta.autoRechargeEnabled,
          umbral: cuenta.autoRechargeThreshold,
          monto: cuenta.autoRechargeAmount,
          ultima: cuenta.autoRechargeLastAt,
          fallosSeguidos: cuenta.autoRechargeFailCount,
          ultimoError: cuenta.autoRechargeLastError
        }
      }
    });
  } catch (err) {
    console.error('recargas error:', err.message);
    res.status(500).json({ error: 'No se pudieron leer las recargas: ' + err.message });
  }
});

// ── Mensajes de WhatsApp desde la base del dashboard ────────────────────────
// Devuelve filas AGREGADAS por día × dirección × modelo: una fila representa N
// mensajes (columna `n`). Así un mes de 20.000 mensajes viaja en ~100 filas.
app.get('/api/report/whatsapp', async (req, res) => {
  if (!waPool) {
    return res.status(503).json({
      error: 'Falta la conexión a la base de WhatsApp (WHATSAPP_DB_URL o tools/db.local.json)'
    });
  }
  // Cortafuegos: el consumo de esta instancia solo puede imputarse a cuentas
  // del alcance (y, si se declaró una cuenta dueña, únicamente a ella).
  if (req.query.clientId) {
    const cid = parseInt(req.query.clientId);
    if (WA_ACCOUNT_ID != null && cid !== WA_ACCOUNT_ID) {
      return res.status(403).json({
        error: `Esta base de WhatsApp está declarada como propia de la cuenta ${WA_ACCOUNT_ID}; ` +
               `no puede imputarse a la cuenta ${cid}.`
      });
    }
    if (WA_ACCOUNT_ID == null && SCOPE_ID != null) {
      try {
        if (!(await reintentar(() => idsDelAlcance())).has(cid)) {
          return res.status(403).json({
            error: `La cuenta ${cid} está fuera del alcance del reporte.`
          });
        }
      } catch (e) { /* base de la app caída: no se puede comprobar, se deja pasar */ }
    }
  }
  try {
    const tz = TZ_OK.test(req.query.tz || '') ? req.query.tz : 'UTC';
    const where = ['1=1'];
    const params = [tz];
    if (req.query.desde) {
      params.push(new Date(req.query.desde + 'T00:00:00'));
      where.push(`created_at >= $${params.length}`);
    }
    if (req.query.hasta) {
      const h = new Date(req.query.hasta + 'T00:00:00');
      h.setDate(h.getDate() + 1);           // el rango es [desde, hasta] inclusive
      params.push(h);
      where.push(`created_at < $${params.length}`);
    }

    // El DNS del proveedor falla de a ratos (ENOTFOUND en un host que resuelve
    // bien un segundo después), así que estas consultas también se reintentan.
    const { rows } = await reintentar(() => waPool.query(`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE $1), 'YYYY-MM-DD') AS dia,
             COALESCE(NULLIF(TRIM(direction), ''), 'desconocida')  AS direction,
             COALESCE(NULLIF(TRIM(model), ''), '')                 AS model,
             count(*)::int                                         AS n,
             COALESCE(SUM(cost_usd), 0)::float8                     AS cost_usd,
             COALESCE(SUM(charged_usd), 0)::float8                  AS charged_usd
      FROM messages
      WHERE ${where.join(' AND ')}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`, params));

    res.json({
      headers: ['dia', 'direction', 'model', 'n', 'cost_usd', 'charged_usd'],
      rows: rows.map(r => [r.dia, r.direction, r.model, r.n, r.cost_usd, r.charged_usd]),
      meta: {
        tz,
        grupos: rows.length,
        mensajes: rows.reduce((a, r) => a + r.n, 0),
        costUsd: rows.reduce((a, r) => a + r.cost_usd, 0),
        chargedUsd: rows.reduce((a, r) => a + r.charged_usd, 0)
      }
    });
  } catch (err) {
    console.error('whatsapp error:', err.message);
    res.status(500).json({ error: 'No se pudo leer la base de WhatsApp: ' + err.message });
  }
});

// Estado de la conexión a WhatsApp, para que la UI sepa si ofrecer esa fuente.
app.get('/api/report/whatsapp/estado', async (req, res) => {
  if (!waPool) return res.json({ ok: false, error: 'sin credenciales' });
  try {
    const { rows } = await reintentar(() => waPool.query(`
      SELECT count(*)::int AS total, min(created_at) AS desde, max(created_at) AS hasta,
             min(created_at) FILTER (WHERE cost_usd IS NOT NULL OR charged_usd IS NOT NULL) AS desde_costo
      FROM messages`));

    // Nombre de la cuenta dueña, para que la UI pueda decirlo con todas las letras
    let accountName = null;
    if (WA_ACCOUNT_ID != null) {
      try {
        const u = await prisma.user.findUnique({
          where: { id: WA_ACCOUNT_ID }, select: { name: true, email: true }
        });
        accountName = u ? (u.name || u.email) : null;
      } catch (e) { /* base de la app caída: se informa solo el id */ }
    }
    res.json({ ok: true, ...rows[0], accountId: WA_ACCOUNT_ID, accountName });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Solo 127.0.0.1: este servidor sirve datos de producción sin autenticación
// (teléfonos de contactos incluidos). Atado a localhost no queda expuesto al
// resto de la red — ni al wifi de un café.
app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Reporte de consumo — servidor local');
  console.log('  ▶  http://localhost:' + PORT);
  console.log('  (Ctrl+C para detener)');
  console.log('');
  const hostDe = u => { try { return new URL(u).host; } catch (e) { return '(ilegible)'; } };
  if (APP_URL) {
    console.log(`  Base de la app: ${hostDe(APP_URL)} (de ${process.env.REPORT_DATABASE_URL ? 'REPORT_DATABASE_URL' : 'tools/db.local.json'})`);
  } else if (process.env.DATABASE_URL) {
    console.log(`  Base de la app: ${hostDe(process.env.DATABASE_URL)} (de server/.env)`);
  } else {
    console.warn('  ⚠  Sin base de la app: definí REPORT_DATABASE_URL, appDbUrl en tools/db.local.json, o DATABASE_URL.');
  }
  prisma.callLog.count()
    .then(n => console.log(`  Conectada: ${n} llamadas registradas`))
    .catch(e => console.warn('  ⚠  No se pudo leer la base de la app:', e.message.split('\n')[0]));
  if (!waPool) {
    console.warn('  ⚠  Sin conexión a la base de WhatsApp: esa fuente de mensajes queda deshabilitada.');
    console.warn('     Definí WHATSAPP_DB_URL o creá tools/db.local.json con { "messagesDbUrl": "postgresql://…" }');
  } else {
    waPool.query('SELECT count(*)::int AS n FROM messages')
      .then(r => console.log(`  Base de WhatsApp conectada (solo lectura): ${r.rows[0].n} mensajes`))
      .catch(e => console.warn('  ⚠  No se pudo conectar a la base de WhatsApp:', e.message));
  }
});
