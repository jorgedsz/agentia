# Mudanza de Sword de Lightsail a nebocore — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Todo paso que toque producción (nebocore, Lightsail, GitHub Secrets, DNS) se hace solo con OK explícito de Jorge en ese momento.**

**Goal:** Que Sword (app.swordaisolutions.com y los dominios de sus partners) corra en el EC2 **nebocore** en lugar de Lightsail, sin cortar el servicio ni romper integraciones; y en una segunda etapa, que su base de datos también viva en nebocore.

**Architecture:** Los dominios no cambian: solo cambia el servidor detrás. Sword en nebocore usa la misma imagen (`Dockerfile`) y las mismas variables; Caddy de nebocore sirve los cuatro dominios. Durante el cambio las dos copias atienden contra la misma base, pero **solo una corre las tareas programadas** (interruptor `TAREAS=off`). La base se muda después, en una ventana nocturna corta, con la de Lightsail como respaldo.

**Tech Stack:** Docker Compose y Caddy 2 en nebocore (t3.medium, Ohio, Elastic IP 3.132.126.1), Lightsail Container Service y Postgres 18 (Virginia), Cloudflare y Squarespace (DNS), GitHub Actions.

---

## Estado actual (relevado el 2026-11-16)

| Pieza | Hoy |
|---|---|
| App | Lightsail `container-service-1`, potencia **micro** (1 GB, ¼ vCPU), 1 copia, imagen del commit **77d270a** (= `main`), health check `/api/health` |
| Base | Lightsail Postgres **18.4** `project-guille-jorge-db`, plan micro_2_0, pública, us-east-1a |
| Variables | 27, las del workflow `deploy-lightsail.yml` (DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET, VAPI_API_KEY, WHOP_*, PAYPAL_*, GHL_*, GOOGLE_*, S3 de grabaciones, …) |
| `app.swordaisolutions.com` | Cloudflare, **con proxy** |
| `lmconsultingai.com` | Cloudflare, **con proxy** |
| `goatai.us` | Cloudflare, sin proxy |
| `panel.neboaiconsulting.com` | Squarespace, CNAME a `container-service-1….cs.amazonlightsail.com` |
| nebocore | t3.small (2 GB), cuenta AWS 499290259495, **Elastic IP** 3.132.126.1; corre caddy, n8n, cotizador, pagos |
| Latencia nebocore → base de Lightsail | ~15 ms por conexión |

**Tareas programadas** que arranca `server.listen` (`server/src/index.js:511-519`): callbacks, follow-ups, follow-ups del chatbot, pagos recurrentes, recarga automática y refresco de calendarios. **Dos copias corriéndolas a la vez duplican llamadas y mensajes y cobran dos veces.**

**`prisma db push --accept-data-loss` al arrancar** (CMD del `Dockerfile`): cada copia ajusta la base a SU esquema. Mientras haya dos copias, las dos tienen que correr **el mismo commit**, y **no se fusiona nada a `main`** (incluida la rama de AZUL) hasta terminar la Etapa A.

---

# Etapa A — La app

### Task 1: Interruptor `TAREAS`

**Files:**
- Create: `server/src/utils/schedulers.js`
- Modify: `server/src/index.js:511-519`
- Test: `server/tests/schedulers.test.js`

- [ ] **Step 1: Test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { startSchedulers } = require('../src/utils/schedulers');

function arrancadores() {
  const llamados = [];
  const s = ['callbacks', 'followUps', 'chatbotFollowUps', 'recurring', 'autoRecharge', 'calendarMeta']
    .map((nombre) => ({ nombre, start: () => llamados.push(nombre) }));
  return { s, llamados };
}

test('arranca las seis tareas por defecto', () => {
  const { s, llamados } = arrancadores();
  assert.strictEqual(startSchedulers({}, s, {}), true);
  assert.strictEqual(llamados.length, 6);
});

test('con TAREAS=off no arranca ninguna', () => {
  const { s, llamados } = arrancadores();
  assert.strictEqual(startSchedulers({}, s, { TAREAS: 'off' }), false);
  assert.strictEqual(llamados.length, 0);
});

test('acepta OFF en mayúsculas y con espacios', () => {
  const { s, llamados } = arrancadores();
  startSchedulers({}, s, { TAREAS: ' OFF ' });
  assert.strictEqual(llamados.length, 0);
});
```

- [ ] **Step 2: Ver que falla** — `cd server && node --test tests/schedulers.test.js` → `Cannot find module`

- [ ] **Step 3: `server/src/utils/schedulers.js`**

```js
// The background jobs (calls, follow-ups, recurring charges, auto-recharge,
// calendar refresh) must run in ONE copy of Sword only: two copies against the
// same database would place calls twice and charge cards twice. TAREAS=off
// starts the web server without them - the copy that is serving but is not
// the one in charge (during a move between servers, or a standby).
function startSchedulers(prisma, schedulers, env = process.env) {
  if (String(env.TAREAS || '').trim().toLowerCase() === 'off') {
    console.log('[Tareas] TAREAS=off: background jobs NOT started in this copy');
    return false;
  }
  for (const { start } of schedulers) start(prisma);
  return true;
}

module.exports = { startSchedulers };
```

- [ ] **Step 4: `server/src/index.js`** — reemplazar las seis llamadas dentro de `server.listen` por:

```js
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  require('./utils/schedulers').startSchedulers(prisma, [
    { start: (p) => callbackController.startScheduler(p) },
    { start: (p) => followUpController.startScheduler(p) },
    { start: (p) => chatbotFollowUpController.startScheduler(p) },
    { start: (p) => recurringPaymentController.startScheduler(p) },
    { start: (p) => startAutoRechargeScheduler(p) },
    { start: (p) => startCalendarMetaRefresher(p) },
  ]);
});
```

- [ ] **Step 5: Ver que pasa** — `cd server && node --test tests/schedulers.test.js && npm test 2>&1 | tail -4` → PASS

- [ ] **Step 6: Que el workflow de Lightsail pase `TAREAS`** — en `.github/workflows/deploy-lightsail.yml`, junto a `WHOP_WEBHOOK_SECRET` (tres lugares): `TAREAS: ${{ secrets.TAREAS }}`, `--arg TAREAS "$TAREAS" \` y `TAREAS: $TAREAS,`. Comprobar el YAML con `python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-lightsail.yml', encoding='utf-8'))"`.

- [ ] **Step 7: Commit, PR y merge (OK de Jorge).** Sin el secret `TAREAS`, Lightsail sigue igual (tareas encendidas). Desde este commit `C1`, Lightsail y nebocore corren `C1`.

---

### Task 2: Agrandar nebocore (Jorge, en la consola de la cuenta 499290259495)

- [ ] **Step 1:** Avisar: ~2 minutos sin web, cotizador, pagos ni n8n de los agentes de texto. Hacerlo de noche.
- [ ] **Step 2:** EC2 → `i-058052d20584ebdcc` → Stop → Actions → Instance settings → Change instance type → **t3.medium** → Start. La Elastic IP no cambia.
- [ ] **Step 3:** Comprobar: `ssh … 'free -m; sudo docker ps'` (4 GB, los 4 contenedores arriba) y `curl -s https://www.neboaiconsulting.com/api/pagos/salud`.

---

### Task 3: Sword en nebocore, sin tareas

- [ ] **Step 1: Acceso de lectura al repo** — en GitHub `jorgedsz/agentia` → Settings → Deploy keys → agregar la llave pública que se genera en nebocore (`ssh-keygen -t ed25519 -f ~/.ssh/sword_deploy -N ''`), **solo lectura**. Entrada `Host github-sword` en `~/.ssh/config` de nebocore con esa llave.
- [ ] **Step 2: Código** — `git clone git@github-sword:jorgedsz/agentia.git /opt/nebo/sword-repo && git -C /opt/nebo/sword-repo checkout <C1>`.
- [ ] **Step 3: Variables** — leerlas del despliegue activo de Lightsail con la API y escribirlas **directo** a `/opt/nebo/sword.env` (600) sin mostrarlas, más `TAREAS=off`:

```powershell
$d = python -m awscli lightsail get-container-service-deployments --profile nebo --region us-east-1 --service-name container-service-1 --output json | ConvertFrom-Json
$env_ = ($d.deployments | Where-Object state -eq 'ACTIVE' | Select-Object -First 1).containers.web.environment
($env_.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) + 'TAREAS=off' | ssh -i $HOME\.ssh\nebocore.pem ubuntu@3.132.126.1 'umask 077; cat > /opt/nebo/sword.env; wc -l /opt/nebo/sword.env'
```
Expected: `28 /opt/nebo/sword.env`

- [ ] **Step 4: Servicio en `docker-compose.yml`** (respaldo antes):

```yaml
  # Sword (antes Lightsail). Variables en sword.env (600). TAREAS=off mientras no sea la copia a cargo.
  sword:
    build: ./sword-repo
    image: nebo-sword:actual
    restart: unless-stopped
    env_file: ./sword.env
    environment:
      - PORT=8080
    mem_limit: 1g
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - nebo
```

- [ ] **Step 5: Construir y levantar** — `sudo docker compose build sword && sudo docker compose up -d sword`. En los logs: `prisma db push` sin cambios ("already in sync"), `[Tareas] TAREAS=off` y `Server running`.
- [ ] **Step 6: Dirección temporal** — en el Caddyfile (respaldo antes), bloque nuevo:

```
sword-3-132-126-1.sslip.io {
	reverse_proxy sword:8080
	encode zstd gzip
}
```
`caddy validate` y `caddy reload`.

- [ ] **Step 7: Pruebas sin tocar producción** — en `https://sword-3-132-126-1.sslip.io`: `/api/health`, iniciar sesión, panel, créditos, un agente, un portal `/pay/<token>`. Comparar con Lightsail. Confirmar en los logs que no corre ninguna tarea.

---

### Task 4: Caddy para los cuatro dominios

**No agregar los dominios reales al Caddyfile antes de la noche del cambio:** con el DNS todavía en Lightsail, Caddy intentaría sacar certificados que fallan, y Let's Encrypt bloquea un dominio por una hora tras 5 validaciones fallidas.

- [ ] **Step 1: Certificado de origen de Cloudflare** (Jorge): Cloudflare → `swordaisolutions.com` y `lmconsultingai.com` → SSL/TLS → Origin Server → Create certificate (RSA, 15 años, hostnames `*.swordaisolutions.com, swordaisolutions.com` y `lmconsultingai.com, *.lmconsultingai.com`). Guardar certificado y llave en `/opt/nebo/certs/` (600) por SSH, sin pasarlos por el chat. Con esto esos dos dominios se cambian con el proxy de Cloudflare encendido (SSL **Full (strict)**), sin esperar ningún certificado.
- [ ] **Step 2: Dejar listo `/opt/nebo/sword-dominios.caddy`** (fuera del Caddyfile hasta el cambio):

```
app.swordaisolutions.com {
	tls /certs/swordaisolutions.pem /certs/swordaisolutions.key
	import sword_proxy
}
lmconsultingai.com {
	tls /certs/lmconsultingai.pem /certs/lmconsultingai.key
	import sword_proxy
}
panel.neboaiconsulting.com, goatai.us {
	import sword_proxy
}
```

y el fragmento común, que sí puede entrar ya al Caddyfile (no declara dominios):

```
(sword_proxy) {
	reverse_proxy sword:8080 {
		# Durante un reinicio de Sword las solicitudes esperan hasta 30 s en vez de fallar.
		lb_try_duration 30s
		lb_try_interval 500ms
		health_uri /api/health
		health_interval 10s
	}
	encode zstd gzip
}
```

`/opt/nebo/certs` se monta en el contenedor de Caddy como `/certs:ro` (cambio en `docker-compose.yml`).

---

### Task 5: El cambio (ventana corta, de noche, con Jorge)

- [ ] **Step 1: Lightsail suelta las tareas** — secret `TAREAS=off` en GitHub y re-ejecutar el último despliegue de `main` (mismo commit `C1`). Esperar a que el despliegue esté ACTIVE y ver en sus logs `[Tareas] TAREAS=off`.
- [ ] **Step 2: nebocore toma las tareas** — quitar `TAREAS=off` de `/opt/nebo/sword.env` y `docker compose up -d sword`. En los logs: las tareas arrancan. (Entre el Step 1 y este pasan uno o dos minutos sin tareas: la recarga automática corre cada 2 minutos y se pone al día sola.)
- [ ] **Step 3: Caddy toma los dominios** — `import /opt/nebo/sword-dominios.caddy` al final del Caddyfile (montado en el contenedor), `caddy validate`, `caddy reload`.
- [ ] **Step 4: DNS** (Jorge):
  - Cloudflare: `app.swordaisolutions.com` y `lmconsultingai.com` → registro **A 3.132.126.1** con la **nube naranja** (proxy) y SSL **Full (strict)**: usan el certificado de origen, el cambio es instantáneo.
  - Cloudflare: `goatai.us` → **A 3.132.126.1**, nube gris (como hoy).
  - Squarespace: `panel.neboaiconsulting.com` → quitar el CNAME, poner **A 3.132.126.1**.
  - Para `goatai.us` y `panel…`: apenas cambie el DNS, `caddy reload` para que pida el certificado en el acto, y vigilar `docker compose logs caddy` hasta ver `certificate obtained`.
- [ ] **Step 5: Comprobar** — para cada dominio: `curl -sI https://<dominio>/api/health` responde desde nebocore; en `docker compose logs sword` entran webhooks de Vapi; una llamada de prueba de JH queda registrada con su costo. Mientras el DNS termina de propagar, quien todavía llegue a Lightsail sigue atendido normal (misma base, sin tareas).

**Volver atrás:** DNS a como estaba (Cloudflare a Lightsail; Squarespace al CNAME de Lightsail), `TAREAS=off` en nebocore y quitar el secret `TAREAS` + redeploy en Lightsail.

---

#### Lo que pasó la noche del cambio (2026-11-16)

- No se agrandó nebocore (Task 2 pendiente): con Sword y sus tareas quedan ~900 MB libres más 2 GB de swap. Se agranda si hace falta.
- Caddy no se recreó: los certificados de origen se copiaron al volumen `caddy_data` (`/data/sword-certs`) y los dominios se agregaron al Caddyfile con `caddy reload` (sin corte). Cada dominio de Cloudflare tiene además un bloque `http://` para que no haya bucle si la zona estuviera en SSL Flexible.
- Orden real: DNS de Cloudflare (A `3.132.126.1`, con proxy) → secret `TAREAS=off` y despliegue v127 de Lightsail → `TAREAS='on'` en nebocore → `panel.neboaiconsulting.com` en Squarespace (A) y luego en Caddy (Let's Encrypt al primer intento).
- `goatai.us` no está en Cloudflare de Jorge: se queda en Lightsail.
- Vuelta atrás: DNS a Lightsail, `TAREAS='off'` en nebocore, borrar el secret `TAREAS` y desplegar Lightsail a mano.

### Task 6: Despliegue automático en nebocore

Hecho el 2026-11-16: `/opt/nebo/actualizar-sword.sh` (copia en `deploy/nebocore/actualizar-sword.sh`), `nebo-sword.service` como `ubuntu` y `nebo-sword.timer` cada minuto; el commit desplegado se anota en `/opt/nebo/sword-commit`. Logs: `journalctl -u nebo-sword.service`. `--forzar` despliega aunque no haya commit nuevo.

- [ ] **Step 1:** `/opt/nebo/actualizar-sword.sh` + `nebo-sword.timer` (cada minuto), como el de la web: si `main` tiene commit nuevo → `git reset --hard` → `docker compose build sword` **con la versión vieja todavía atendiendo** → etiquetar la imagen actual como `nebo-sword:anterior` → `up -d` (10–20 s de reinicio, que Caddy cubre con `lb_try_duration`) → esperar el health check → si no queda sano, volver a `nebo-sword:anterior`.
- [ ] **Step 2:** En `deploy-lightsail.yml`, cambiar el disparador a `workflow_dispatch` (solo a mano) para que un push a `main` deje de desplegar en Lightsail.
- [ ] **Step 3:** Una semana después, sin incidentes: Jorge borra el contenedor de Lightsail (deja de cobrarse). La base de Lightsail sigue hasta la Etapa B.

---

# Etapa B — La base (plan propio, se detalla al terminar la Etapa A)

1. Postgres **18** en nebocore (contenedor `sword-db`, volumen propio, solo red interna, 512 MB).
2. Respaldo cada noche con `pg_dump` a un bucket S3, con 14 días de retención, y **una restauración de prueba** antes del cambio.
3. Ventana de madrugada: página de mantenimiento → `pg_dump` de Lightsail → `pg_restore` en nebocore → comparar conteos de las tablas principales → `DATABASE_URL` nuevo → arrancar → revisar llamadas y pagos.
4. La base de Lightsail queda encendida dos semanas como respaldo (volver = cambiar `DATABASE_URL`).

---

## Self-review

- Sin corte: dominios iguales, dos copias atendiendo durante el DNS, una sola con tareas (Tasks 1 y 5).
- Sin borrar columnas: mismo commit en las dos copias y sin merges a `main` durante la Etapa A (Estado actual, Task 1 Step 7).
- Secretos: leídos de Lightsail y escritos en nebocore sin mostrarse (Task 3 Step 3).
- Capacidad: t3.medium y `mem_limit` (Tasks 2 y 3).
- Certificados: Caddy con Let's Encrypt, nube gris durante el cambio (Tasks 4 y 5).
- Vuelta atrás documentada (Task 5) y Lightsail como respaldo una semana (Task 6).
- AZUL en Sword (rama `feat/azul-pagos`): se fusiona después de la Etapa A.
