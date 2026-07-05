# MASTER SECURITY PLAN — MiCafe POS

> Documento de arquitectura de seguridad. Cubre el estado actual (piloto single-tenant) y la evolución a SaaS multi-tenant.
> **Versión:** 2.0 · **Fecha:** 2026-07-02 · **Clasificación:** Interno / Confidencial
> **Estado:** Borrador para aprobación. Incorpora la revisión crítica independiente (ver §8 Changelog).
> **Alcance:** Landing, Catálogo, Reservas, PWA, POS, Cocina, Producción, Inventario, Compras, Clientes, Caja, Turnos, Reportes, Configuración, Facturación electrónica (Factus/DIAN), Firebase (Firestore/Auth/Storage), Electron Desktop, SQLite local.

---

## 0. Cómo leer este documento

Este no es un listado de hallazgos. Es una **hoja de ruta** que debe acompañar al producto desde el primer cliente hasta el SaaS multi-tenant maduro. Está organizado así:

1. **Resumen ejecutivo** — el veredicto y los riesgos que bloquean producción.
2. **Modelo de amenazas (STRIDE)** — activos, actores, superficie, vectores.
3. **Análisis por capa** — Frontend, Electron, Firebase, SQLite, Facturación, Auth, Authz, Multi-tenant, Auditoría, Backups, Actualizaciones, Operaciones, Cumplimiento.
4. **Roadmap SEC-XXX** — priorizado por riesgo × impacto ÷ esfuerzo, con orden de ejecución.
5. **Gobernanza** — cómo se aprueba, quién responde, cómo se mide.

Cada hallazgo sigue el formato: **qué es · por qué es riesgo · cómo se explota · impacto · mitigación**. No se propone código; se define la estrategia.

**Metodología de severidad.** La severidad se deriva de **probabilidad × impacto** (matriz §2.4) y se ajusta por **reachability** (¿remota por cualquiera, o requiere acceso local privilegiado?) y por **fase** (el impacto "toda la flota" no aplica con un solo cliente). Escala: **CRÍTICO** (bloquea producción) · **ALTO** · **MEDIO** · **BAJO** · **OK**. Esfuerzo: S (≤1 día), M (días), L (semanas). El esfuerzo de **calendario** (p. ej. compra de certificados) se anota aparte del esfuerzo de ingeniería.

---

## 1. Resumen ejecutivo

MiCafe POS tiene una **base de seguridad mejor que el promedio** para su etapa: `contextIsolation: true` y `nodeIntegration: false` en Electron, un `preload.js` que expone API envueltas (no `ipcRenderer` crudo), Firestore Rules con modelo de roles real y colecciones append-only (ledger de inventario, transacciones financieras, auditoría) con `fallback deny`, backups AES-256-GCM cuya clave vive en `safeStorage` (DPAPI), rate limiting con backoff en el login local, bcrypt (cost 12) y firma HMAC en el webhook de Wompi. Los secretos reales (`.env.local`, `credentials.json`, service account) **nunca se commitearon** (verificado con `git log --all`).

Riesgos que condicionan el paso a producción, ordenados por reachability:

| # | Riesgo | Severidad | Reachability |
|---|--------|-----------|--------------|
| 1 | **"Cifrado" de secretos Factus en SQLite es solo Base64** — credenciales de emisión fiscal en claro efectivo | CRÍTICO | Local (activo fiscal = joya) |
| 2 | **Canal de actualización: `update-server.js` por HTTP en LAN + `update:configure` sin validar URL + binario sin firma** | CRÍTICO | LAN / IPC |
| 3 | **`credentials.json` empaquetado en el instalador** — extraíble del `.exe` | ALTO (ver FP: secret desktop no confidencial por diseño) | Remota (cualquiera con el instalador) |
| 4 | **El control primario (Firestore/Storage Rules) no tiene tests** — cualquier edición es una brecha silenciosa | ALTO | N/A (riesgo de proceso) |
| 5 | **Sin App Check en web pública + creación anónima de `reservas`/`agendas` sin rate limit** | ALTO | Remota |
| 6 | **Sin `tenantId` en datos ni reglas** — bloquea el SaaS; retrofit en caliente es caro y peligroso | ALTO (bloqueante SaaS) | N/A (deuda de arquitectura) |
| 7 | **Sin track de privacidad/cumplimiento** (Ley 1581 Habeas Data, retención DIAN) pese a recolectar PII en producción | ALTO | Regulatorio |

**Veredicto:** apto para piloto controlado tras cerrar la Fase P0. **No** apto para SaaS multi-tenant hasta ejecutar la fundación de tenant (P3). El bloque de cumplimiento (P2) **no es opcional** desde el momento en que se recolecta PII de clientes reales.

> **Nota de priorización:** la firma de código (code-signing) es importante pero **no debe bloquear el piloto**: es un trámite de compra de semanas y coste recurrente. El piloto se protege con las medidas baratas de SEC-003 (HTTPS, eliminar servidor HTTP, validar `update:configure`); la firma es un fast-follow con presupuesto propio (SEC-012).

---

## 2. Modelo de amenazas (STRIDE)

### 2.1 Activos

| Activo | Confid. | Integr. | Disp. | Notas |
|--------|:---:|:---:|:---:|-------|
| Credenciales Factus (facturación DIAN) | Alta | Alta | Media | Su robo permite emitir facturas fraudulentas a nombre del negocio |
| Service account Firebase Admin | **Crítica** | Crítica | Alta | Bypassa todas las reglas; acceso total al proyecto |
| Datos financieros (`ventas`, `transacciones_financieras`, `cuentas_bancarias`) | Alta | **Crítica** | Alta | Base contable/fiscal; la integridad es lo más sensible |
| Ledger de inventario (`movimientos_inventario`) | Media | **Crítica** | Media | Fuente de verdad append-only del stock |
| PII de clientes (`clientes`, `reservas`) | Alta | Media | Media | Nombre, email, teléfono, documento → Habeas Data (Ley 1581) |
| Credenciales de usuarios del POS (bcrypt local + Firebase Auth) | Alta | Alta | Alta | Acceso operativo |
| OAuth token de Google Drive (backups) | Alta | Media | Media | Acceso a la copia de seguridad completa |
| Base local SQLite (`pos_tienda.db`) | Alta | Media | Alta | Secretos + config del dispositivo |
| Binario/instalador y canal de actualización | Media | **Crítica** | Alta | Comprometerlo = RCE en las cajas (una hoy; la flota mañana) |

### 2.2 Actores de amenaza

- **A1 — Cliente/comensal anónimo (internet):** landing, catálogo, reservas. Sin credenciales.
- **A2 — Empleado malicioso o descuidado (cajero/cocinero):** credenciales de bajo privilegio + acceso físico a la máquina Electron.
- **A3 — Atacante en red local (LAN de la cafetería):** el update-server opcional corre en HTTP :3457; el Wi-Fi de local suele compartirse.
- **A4 — Atacante remoto oportunista:** usa la API key pública para hablar con Firestore, busca reglas laxas y endpoints.
- **A5 — Insider con acceso al repo/CI o a la cuenta de releases:** puede inyectar en el pipeline de actualización.
- **A6 — Tenant vecino (futuro SaaS):** un negocio intentando leer/escribir datos de otro.
- **A7 — Atacante de cadena de suministro:** dependencia npm comprometida.

### 2.3 Superficie de ataque

```
INTERNET
 ├─ Landing / Catálogo (Vercel, público, read: if true → coste de lectura)  → A1, A4
 ├─ Reservas públicas → Firestore create anónimo (sin App Check/rate limit)   → A1, A4
 ├─ agendas → create/update SIN auth                                          → A1, A4
 ├─ Webhook Wompi (/api/webhooks/wompi)  [firma HMAC ✓]                        → A4
 ├─ API routes Next.js con Admin SDK (bypassan reglas)                        → A4
 └─ Firestore/Auth/Storage (API key pública, sin App Check)                   → A4, A6

LAN LOCAL
 └─ update-server.js :3457 (HTTP, CORS *) — OPCIONAL, no es el feed default   → A3

DISPOSITIVO (Electron)
 ├─ 30+ handlers IPC (mayoría sin validación de entrada)                      → A2
 ├─ pos_tienda.db (secretos en Base64, sin cifrado en reposo)                 → A2
 ├─ credentials.json empaquetado en el .exe                                   → A2, cualquiera con el instalador
 ├─ shell.openExternal sin validar URL (app:openUrl)                          → A2
 └─ AutoUpdater (feed default github: HTTPS; reconfigurable sin validar; sin firma) → A3, A5

CADENA DE SUMINISTRO
 └─ 64 deps directas, sin CodeQL/secret-scanning/SBOM                         → A7
```

### 2.4 STRIDE por vector (matriz prob × impacto)

| STRIDE | Vector | Actor | Prob. | Impacto |
|--------|--------|:-----:|:-----:|:-------:|
| **S**poofing | Escribir en Firestore desde curl con la API key pública (sin App Check) | A4/A6 | Alta | Alto |
| **S**poofing | Suplantar feed de actualización (solo si se usa el HTTP server; sin firma) | A3/A5 | Media | **Crítico** |
| **T**ampering | Modificar `pos_tienda.db` (config, secretos Base64, precios cacheados) | A2 | Alta | Alto |
| **T**ampering | Inyectar binario de update no firmado (vía releases comprometidas) | A5 | Baja-Media | **Crítico** |
| **T**ampering | CSV/Excel formula injection en reportes | A2/A1 | Media | Medio |
| **R**epudiation | Acciones sin trazar (handlers IPC sin log; auditoría no exhaustiva) | A2 | Media | Medio |
| **I**nfo disclosure | `credentials.json` extraíble del instalador (secret desktop, ver FP-1) | A2/A1 | Alta | Medio-Alto |
| **I**nfo disclosure | `config:get` devuelve secretos descifrados al renderer | A2 | Media | Alto |
| **I**nfo disclosure | Enumeración/lectura cross-tenant (futuro SaaS) | A4/A6 | Alta | **Crítico** (SaaS) |
| **D**enial of wallet | Creación/lectura pública masiva sin límites → costos Firestore | A1/A4 | Alta | Alto |
| **E**levation of priv. | Rol vive en `usuarios/{uid}.rol`; escritura a ese doc = admin | A4/A2 | Baja | **Crítico** |
| **E**levation of priv. | Marketing ve `/pos` un instante antes del redirect (guard client-side) | A2 | Baja | Bajo |

---

## 3. Análisis por capa

### 3.1 Frontend (Next.js 16 / React 19)

**OK:** no se usa `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`; `vercel.json` ya publica `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS y `Permissions-Policy`; el webhook Wompi valida HMAC-SHA256.

**F-1 · CSP permisiva (`unsafe-inline`/`unsafe-eval`) — MEDIO.** La CSP de `vercel.json` habilita inline/eval para Wompi y Maps, neutralizando gran parte de la protección anti-XSS. Un sink de inyección ejecutaría JS arbitrario y robaría sesión de admin. *Mitigación (SEC-022):* CSP por **nonce donde haya render dinámico**; hash/SRI donde sea estático (ver F-2). Eliminar primero `unsafe-eval`, luego `unsafe-inline`.

**F-2 · La app servida por Electron no tiene CSP — MEDIO.** `next.config.mjs` no define `headers`; el bundle estático (`out/`) servido por `electron-serve` carga sin CSP. *Matiz técnico:* al ser **export estático**, la CSP por nonce (que exige render dinámico) **no aplica** aquí; corresponde CSP por **hash/SRI** o meta-CSP. *Mitigación:* SEC-022.

**F-3 · CSV/Excel formula injection — MEDIO.** `src/exportador.js` escribe texto (`v.resumen`, nombres) en celdas sin neutralizar `= + - @ \t \r`. Un dato controlable con `=HYPERLINK(...)` se ejecuta al abrir el reporte en el equipo del contador. *Mitigación:* SEC-021.

**F-4 · `typescript.ignoreBuildErrors: true` — BAJO (deuda).** Se compila ignorando errores de tipos. *Mitigación:* `tsc --noEmit` como gate en CI (SEC-011).

**F-5 · Inyección de HTML en tickets — BAJO / vigilar.** `historial.tsx` arma HTML por template y lo pasa a `api.print.*` (que lo carga en un `BrowserWindow`). Hoy los datos vienen de Firestore, pero nombre/documento del cliente es semi-controlable. *Mitigación:* SEC-021 + endurecer ventana de impresión (SEC-009).

**No es hallazgo:** la Firebase Web API key es **pública por diseño**. El control real es Rules + App Check, no ocultarla.

### 3.2 Electron (v42 — reciente, OK)

**OK:** ventana principal con `contextIsolation:true`/`nodeIntegration:false`; `preload.js` sin `ipcRenderer` crudo; sin `child_process`; `safeStorage` protege la clave de backups.

**E-1 · Canal de actualización — CRÍTICO.** El feed **por defecto** es `github:Glemynart/micafe-pos` (HTTPS). Los vectores reales son: (a) el `update-server.js` **opcional** sirve por HTTP en LAN → MITM (A3) instala binario malicioso; (b) `update:configure` guarda una URL arbitraria **sin validar** → un renderer comprometido redirige el feed; (c) el binario **no está firmado**, así que aunque el transporte sea HTTPS, unas releases de GitHub comprometidas (A5) instalan sin verificación. *Impacto:* RCE persistente (una caja hoy, la flota en SaaS). *Mitigación por fases:* SEC-003 (barato, bloqueante de piloto) + SEC-012 (firma, fast-follow).

**E-2 · `shell.openExternal` sin validar URL (`app:openUrl`) — ALTO.** Abre cualquier URL/esquema del renderer. Un XSS invoca `openUrl('file:///…')` o esquemas peligrosos → phishing o ejecución local. *Mitigación:* SEC-009 (allowlist de esquemas/host).

**E-3 · Sin `setWindowOpenHandler`/`will-navigate`; ventana de impresión sin `nodeIntegration:false` — ALTO.** Sin política de navegación; la ventana de impresión no fija `nodeIntegration:false`. Si un sink logra navegar/abrir popup, se amplía la superficie hacia Node. *Mitigación:* SEC-009.

**E-4 · `sandbox` no explícito — MEDIO.** Por defecto activo en Electron 20+, pero conviene fijarlo. *Mitigación:* SEC-009.

**E-5 · Handlers IPC sin validación — MEDIO.** La mayoría (`productos:*`, `ventas:*`, `backup:restoreLocal` con `filePath` sin validar, `facturas:parsePdf`) no valida tipos/estructura. Un renderer comprometido corrompe datos o hace path traversal en restore. *Mitigación:* SEC-020.

**E-6 · `config:get` devuelve secretos al renderer — MEDIO.** Amplía la exposición de secretos al proceso menos confiable. *Mitigación:* SEC-004.

### 3.3 Firebase (Firestore / Auth / Storage)

**OK:** `firestore.rules` es **sólido**: helpers de rol, ledgers append-only (`update/delete: if false`), `fallback deny`, self-update de `usuarios` limitado a `['ultimoAcceso','fcmTokens']`, y `cuentas_bancarias` operativo limitado a `['saldo']`.

**FB-1 · Sin App Check — ALTO.** Sin `initializeAppCheck`, cualquier script externo usa la API key pública para hablar con Firestore/Storage dentro de lo que permitan las reglas. *Mitigación (SEC-007):* enforce App Check con **reCAPTCHA Enterprise en la web pública** (ahí está el valor). *Caveat técnico:* **no hay proveedor de atestación nativo para Electron**; forzarlo ahí requiere atestación custom (secreto en cliente, spoofable) o debug tokens. Por eso SEC-007 lo trata como enforce-web + investigación-desktop, no como enforce universal.

**FB-2 · Creación pública `reservas`/`agendas` sin rate limit — ALTO.** `reservas` permite `create` anónimo; `agendas` permite `create/update` **sin auth**. Automatizable → costos de escritura, envenenamiento de disponibilidad, spam de PII. *Mitigación:* SEC-008 (mover tras API route con validación + rate limit; `agendas` solo confirmación server-side).

**FB-3 · Rol en documento (`get()` por evaluación) — MEDIO (coste/latencia) + ALTO (EoP).** `rol()` hace `get(/usuarios/{uid})` en cada evaluación (confirmado: cada `get()` se factura y añade latencia). Peor: atar el privilegio a un doc escribible es escalada directa a admin si se compromete la escritura. *Mitigación:* SEC-010 (migrar rol a **custom claims**; adelantado a P1 por su valor single-tenant).

**FB-4 · No existe `storage.rules` versionado — ALTO.** `firebase.json` solo declara `firestore`. Storage queda a merced de lo que haya en consola. Si es laxo, cualquier autenticado sube/lee archivos sin límite de tamaño/tipo. *Mitigación:* SEC-006.

**FB-5 · Admin SDK / API routes — MEDIO.** `lib/firebase-admin.ts` carga credencial por env (correcto). Existe `/api/debug-tokens` (deshabilitada en prod por bandera) que **no debería llegar al build**. *Mitigación:* SEC-025 (eliminar rutas debug del build) + SEC-017 (derivar tenant del token).

### 3.4 SQLite local (`sql.js`)

**SQL-1 · "Cifrado" de config = Base64 — CRÍTICO.** `_encryptConfigValue` produce `'ENC:'+base64`. Factus `client_secret/username/password` quedan en claro efectivo para cualquiera con acceso al `.db` (A2, malware, backup). Permite emisión fiscal fraudulenta. *Mitigación:* SEC-002 (cifrar con clave en `safeStorage`, como ya se hace con backups).

**SQL-2 · Credenciales Factus sandbox hardcodeadas en seed — MEDIO.** `database.js` siembra creds sandbox en código; normaliza un patrón peligroso. *Mitigación:* SEC-002 (cargar solo desde config cifrada; nunca sembrar secretos).

**SQL-3 · BD sin cifrado en reposo ni integridad — BAJO/MEDIO (piloto).** El archivo es legible/manipulable por cualquier proceso del perfil. *Matiz:* hecho SEC-002, las joyas ya están cubiertas; el resto (productos, config cacheada) es baja sensibilidad. *Mitigación:* SEC-025 (integridad/HMAC), **no** cifrado total de la BD para el piloto (sería sobreingeniería).

### 3.5 Facturación electrónica (Factus / DIAN)

**FE-1 · Secretos de emisión en almacén débil — CRÍTICO (= SQL-1).** Máxima prioridad porque el activo es fiscal. *Mitigación:* SEC-002.

**FE-2 · Trazabilidad/no repudio + retención legal — ALTO.** Cada emisión/nota/reimpresión debe quedar en auditoría append-only con `uid`, timestamp, CUFE y resultado; y las facturas deben conservarse el período legal DIAN con integridad. *Mitigación:* SEC-014.

**FE-3 · Validación de `facturas:parsePdf` — BAJO/MEDIO.** Buffer sin límites → DoS/explotación del parser. *Mitigación:* SEC-020 (límites/timeout; mantener `pdf-parse` al día).

### 3.6 Autenticación

**AU-1 · Sin MFA — MEDIO (ALTO para admin en SaaS).** Robo de credenciales de admin = control total. *Mitigación:* SEC-023 (MFA TOTP para admin/finanzas; el device registration se pospone por prematuro en piloto).

**AU-2 · Authz solo client-side en web — MEDIO.** No hay `middleware.ts`; marketing ve `/pos` un instante. *Matiz:* la autoridad real son las reglas; el riesgo es UX/exposición breve. *Mitigación:* aceptable en piloto; verificación server-side para SaaS (SEC-017).

**AU-3 · Recuperación/expiración/revocación — MEDIO.** Sin flujo de recuperación ni revocación. Además, los emails sintéticos `@micafe-pos.internal` **rompen la recuperación estándar por email**. *Mitigación:* SEC-023 (política de expiración, `revokeRefreshTokens` en baja, recuperación compatible con el diseño de usuarios).

**AU-4 · `localStorage` guarda el username — BAJO.** Solo username, no contraseña. Documentar: jamás persistir tokens/PIN.

### 3.7 Autorización (RBAC)

**AZ-1 · Doble fuente de verdad de permisos — MEDIO.** Permisos hardcodeados (`PERMISOS_POR_ROL`) y en `permisos_roles`, pero las reglas validan por rol. Divergencia UI vs. reglas. *Mitigación:* consolidar (idealmente en custom claims, SEC-010).

**AZ-2 · Rol `supervisor` inconsistente — BAJO (defecto latente).** `esOperativo()` incluye `'supervisor'` pero la app solo define `admin/cajero/cocinero/marketing`. Regla que referencia un rol inexistente = confusión y superficie muerta. *Mitigación:* resolver al consolidar permisos (SEC-010).

**AZ-3 · Mínimo privilegio en IPC — MEDIO (= E-5).** Extender `requireRole` a toda mutación. *Mitigación:* SEC-020.

### 3.8 Multi-tenant (evolución SaaS) — DISEÑAR AHORA

Hoy el sistema es **single-tenant**. Retrofit con datos reales es la operación más cara y peligrosa del roadmap.

**MT-1 · Aislamiento de tenant — bloqueante SaaS.** *Riesgo si se improvisa:* fuga cross-tenant (A6). *Estrategia:* `tenantId` inmutable en todo doc (o rutas `tenants/{tenantId}/…`); `tenantId` como **custom claim** (nunca campo escribible); reglas que fuercen `request.auth.token.tenantId == recurso.tenantId`; índices con prefijo `tenantId`; App Check + cuotas por tenant. *Mitigación:* SEC-016.

**MT-2 · Aislamiento en Admin SDK — bloqueante.** Las API routes **bypassan reglas**; deben derivar `tenantId` del token y filtrar toda operación. Prohibido aceptar `tenantId` del body. *Mitigación:* SEC-017.

**MT-3 · Secretos por tenant — a considerar.** Factus por negocio debe salir de SQLite local hacia almacén server-side cifrado por tenant. *Mitigación:* SEC-018.

### 3.9 Auditoría, logs y trazabilidad

**OK:** `auditoria_logs` append-only (solo admin lee); `electron-log`.

**AUD-1 · Cobertura incompleta — MEDIO.** No todo handler/mutación audita. *Mitigación:* SEC-024 (catálogo de eventos auditables: login/logout, cambios de rol, emisión/reimpresión fiscal, movimientos de caja, factory reset, restore, config, reconfiguración de updater).

**AUD-2 · Detección/respuesta — MEDIO.** Sin alertas ante anomalías. *Mitigación:* SEC-024 (Cloud Monitoring + runbook).

**AUD-3 · Higiene de logs — MEDIO.** El `SECURITY.md` afirma "sin PII en logs" pero no se verificó. Riesgo de fuga de secretos/PII en `electron-log` y logs de Vercel. *Mitigación:* SEC-024 (revisión + redacción).

### 3.10 Backups y recuperación

**OK:** backups locales AES-256-GCM con clave en `safeStorage`; a Drive vía OAuth.

**BK-1 · Backup de Firestore (fuente de verdad) — ALTO.** No consta backup programado y **probado** de Firestore. *Mitigación:* SEC-019 (exportaciones programadas, retención separada, PITR, pruebas de restauración).

**BK-2 · Ransomware — MEDIO.** Backups en Drive con el mismo OAuth de la app son alcanzables si el equipo se compromete. *Mitigación:* SEC-019 (copias inmutables/versionadas, regla 3-2-1).

**BK-3 · Token OAuth de Drive — MEDIO.** *Mitigación:* SEC-019 (mínimo scope, safeStorage, rotación/revocación).

### 3.11 Actualizaciones

Ver E-1. Complemento: **UP-1 · Rollback e integridad — ALTO.** Sin firma no hay garantía de integridad ni rollback seguro. *Mitigación:* SEC-012.

### 3.12 Seguridad operacional / cadena de suministro

**OK:** Dependabot semanal; `package-lock.json` versionado; secretos fuera de git; sin `postinstall` propios.

**OP-1 · Sin CI de seguridad — ALTO.** Sin workflows; `lint` roto; sin tests; sin SBOM. *Mitigación:* SEC-000 (cimientos) + SEC-011 (CodeQL, secret scanning + push protection, `npm audit`/osv gate, `tsc --noEmit`, SBOM).

**OP-2 · `credentials.json` en el instalador — ALTO (ver FP-1).** *Explotación:* extraíble del `.exe`. *Impacto real:* el client_secret de una app OAuth de **escritorio** no es confidencial por diseño (RFC 8252): permite phishing/abuso de cuota en el consentimiento, **no** acceso a datos sin que la víctima complete el flujo. Aun así es mala higiene y trivial de quitar. *Mitigación:* SEC-001 (sacarlo del build; flujo PKCE).

**OP-3 · Gestión de secretos y rotación — MEDIO.** Secretos dispersos (`.env.local`, SQLite, `credentials.json`, service account). *Mitigación:* SEC-011 (inventario, propietario, rotación; secretos server-side en Vercel/GCP).

**OP-4 · Lockfile inconsistente — BAJO.** Se versiona `package-lock.json` pero se ignora `pnpm-lock.yaml` mientras el workspace usa pnpm → builds no reproducibles. *Mitigación:* SEC-025 (elegir gestor, `--frozen-lockfile`/`npm ci`).

### 3.13 Cumplimiento y privacidad (NUEVO)

**CP-1 · Habeas Data (Ley 1581 de 2012) — ALTO.** Se recolecta PII de clientes por reservas públicas sin consentimiento explícito, política de retención, mecanismo de supresión, ni proceso de notificación de brechas ante la SIC. *Mitigación:* SEC-013.

**CP-2 · Retención fiscal DIAN — ALTO.** Las facturas electrónicas tienen obligación legal de conservación con integridad y disponibilidad. *Mitigación:* SEC-014.

**CP-3 · Alcance PCI-DSS — MEDIO.** Los pagos van por el widget hosted de Wompi, así que el sistema **probablemente queda fuera de alcance PCI** — pero esto debe **declararse y verificarse** (ningún dato de tarjeta transita ni se registra). *Mitigación:* SEC-015.

---

## 4. Roadmap SEC-XXX

Orden de ejecución de arriba hacia abajo. El bloque P2 (cumplimiento) corre **en paralelo** a P1, no después.

### Fase P0 — Cimientos + bloqueantes reales de piloto

| ID | Acción | Aborda | Sev. | Esf. |
|----|--------|--------|:----:|:----:|
| **SEC-000** | Fundaciones de ingeniería: arreglar `lint`, montar runner de CI, primeros tests. Prerequisito para que los gates de seguridad no arranquen en el vacío | OP-1, F-4 | ALTO | M |
| **SEC-001** | Sacar `credentials.json` del empaquetado Electron; OAuth Drive vía PKCE sin secretos embebidos | OP-2 | ALTO | S |
| **SEC-002** | Cifrado real (clave en `safeStorage`) de secretos Factus en SQLite; dejar de sembrarlos en código; rotar **solo si** hubo credenciales de producción almacenadas | SQL-1, SQL-2, FE-1 | CRÍTICO | M |
| **SEC-003** | Canal de actualización seguro (barato): HTTPS forzado, **eliminar `update-server.js` HTTP**, validar/allowlist en `update:configure` (rol admin) | E-1, UP-1 | CRÍTICO | S |
| **SEC-004** | `config:get` deja de devolver secretos al renderer; emisión Factus 100% en el main | E-6, FE-1 | ALTO | S |
| **SEC-005** | **Tests de Firestore/Storage Rules con emulador en CI** — protege el control primario ante cambios | C-1 (proceso), FB-* | ALTO | M |

### Fase P1 — Endurecimiento previo a exposición pública / escala

| ID | Acción | Aborda | Sev. | Esf. |
|----|--------|--------|:----:|:----:|
| **SEC-006** | Crear y versionar `storage.rules` (ruta, tamaño, content-type); declararlo en `firebase.json` | FB-4 | ALTO | S |
| **SEC-007** | App Check **enforce en web pública** (reCAPTCHA Enterprise). Electron/PWA: investigación de atestación, **no** enforce hasta tener proveedor viable | FB-1, FB-2 | ALTO | M |
| **SEC-008** | Mover creación pública `reservas`/`agendas` tras API route con validación + rate limiting; `agendas` solo confirmación server-side | FB-2 | ALTO | M |
| **SEC-009** | Endurecer navegación Electron: `setWindowOpenHandler` deny + `will-navigate` allowlist + `sandbox:true`/`nodeIntegration:false` en todas las ventanas (incl. impresión) + validar URL en `app:openUrl` | E-2, E-3, E-4, F-5 | ALTO | S |
| **SEC-010** | Migrar rol (y futuro `tenantId`) a **custom claims** server-side; reglas leen `request.auth.token.*`; consolidar `permisos_roles`; resolver rol `supervisor` | FB-3, AZ-1, AZ-2 | ALTO | M |
| **SEC-011** | CI de seguridad: CodeQL, secret scanning + push protection, `npm audit`/osv gate, `tsc --noEmit`, **SBOM**; inventario y rotación de secretos | OP-1, OP-3, F-4 | ALTO | M |
| **SEC-012** | *(Fast-follow, presupuesto propio — NO bloquea piloto)* Code-signing del binario + verificación de firma en electron-updater. **Calendario: L** (compra de certificado) | E-1, UP-1 | ALTO | M+cal. |

### Fase P2 — Cumplimiento y privacidad (EN PARALELO a P1, no opcional)

| ID | Acción | Aborda | Sev. | Esf. |
|----|--------|--------|:----:|:----:|
| **SEC-013** | Habeas Data (Ley 1581): consentimiento en reservas, política de retención, mecanismo de supresión, proceso de notificación de brechas ante la SIC | CP-1 | ALTO | M |
| **SEC-014** | Retención legal e integridad de facturas DIAN + trazabilidad append-only de emisión/nota/reimpresión | CP-2, FE-2 | ALTO | M |
| **SEC-015** | Declarar y **verificar** alcance PCI (Wompi hosted; sin datos de tarjeta en tránsito/logs) | CP-3 | MEDIO | S |

### Fase P3 — Fundación SaaS multi-tenant (diseñar ya; ejecutar antes del 2º cliente)

| ID | Acción | Aborda | Sev. | Esf. |
|----|--------|--------|:----:|:----:|
| **SEC-016** | `tenantId` inmutable en todo el modelo + reglas que fuercen `tenantId` del claim; índices con prefijo `tenantId` | MT-1 | ALTO | L |
| **SEC-017** | Capa de acceso server (Admin SDK/API) que derive `tenantId` del token y lo aplique a toda operación; prohibido `tenantId` del body; eliminar rutas debug del build | MT-2, FB-5, AU-2 | ALTO | M |
| **SEC-018** | Secretos por tenant (Factus por negocio) fuera de SQLite; cuotas por tenant | MT-3, OP-3 | MEDIO | L |

### Fase P4 — Robustez y operación continua

| ID | Acción | Aborda | Sev. | Esf. |
|----|--------|--------|:----:|:----:|
| **SEC-019** | Backups programados y **probados** de Firestore, retención inmutable separada, PITR, runbook | BK-1, BK-2, BK-3 | ALTO | M |
| **SEC-020** | Validación de esquema (zod) + `requireRole` en **todos** los handlers IPC/API; confinar rutas en `backup:restoreLocal`/`facturas:parsePdf` | E-5, AZ-3, FE-3 | MEDIO | M |
| **SEC-021** | Escapado anti-fórmula en CSV/Excel; escape de HTML en tickets | F-3, F-5 | MEDIO | S |
| **SEC-022** | CSP estricta: **nonce** donde haya render dinámico, **hash/SRI** en el bundle estático de Electron; eliminar `unsafe-eval` y luego `unsafe-inline` | F-1, F-2 | MEDIO | M |
| **SEC-023** | MFA TOTP para admin/finanzas; expiración/revocación de sesión; recuperación compatible con emails sintéticos | AU-1, AU-3 | MEDIO | M |
| **SEC-024** | Catálogo de eventos auditables + alertas de anomalías (Cloud Monitoring) + runbook de incidentes + higiene de logs (sin secretos/PII) | AUD-1, AUD-2, AUD-3 | MEDIO | M |
| **SEC-025** | Integridad (HMAC) de SQLite local; consolidar gestor/lockfile (`npm ci`/`--frozen-lockfile`) | SQL-3, OP-4 | BAJO | M |
| **SEC-026** | Throttling/anti-brute-force en login web; **pentest independiente antes de SaaS**; KPIs del programa de seguridad | AU-3, validación | MEDIO | M |

### Orden de ejecución recomendado

```
P0:  SEC-000 → SEC-002 → SEC-003 → SEC-001 → SEC-004 → SEC-005     (cerrar antes de producción)
P1:  SEC-006 → SEC-005(reglas listas) → SEC-009 → SEC-007 → SEC-008 → SEC-010 → SEC-011
     SEC-012 en paralelo como fast-follow (compra de certificado, no bloquea piloto)
P2:  SEC-013 ‖ SEC-014 ‖ SEC-015     (en paralelo a P1, no después)
P3:  SEC-016 → SEC-017 → SEC-018     (empezar DISEÑO en paralelo a P1)
P4:  SEC-019 … SEC-026               (mejora continua)
```

---

## 5. Gobernanza

Una estrategia sin dueños ni fechas es un PDF. Cada ítem SEC-XXX debe registrarse con:

| Campo | Descripción |
|-------|-------------|
| **Owner** | Persona responsable (no un equipo) |
| **Fecha objetivo** | Compromiso, revisable |
| **Coste** | Ingeniería + coste recurrente (p. ej. certificado code-signing, reCAPTCHA Enterprise) |
| **Criterio de aceptación** | Definición verificable de "hecho" (p. ej. "test de emulador falla si una regla permite lectura cross-rol") |
| **Riesgo residual** | Qué queda sin cubrir y quién lo **acepta explícitamente** |

**Riesgo residual aceptado para el piloto (a completar y firmar por el responsable):** items diferidos a P4, ausencia de code-signing hasta SEC-012, App Check no forzado en Electron. Deben quedar documentados y aceptados por escrito, no asumidos.

**Cadencia:** revisión del plan en cada cambio de arquitectura y auditoría trimestral contra documentación oficial (Electron Security, Firebase Rules/App Check, Next.js CSP, OWASP ASVS). Validación independiente (pentest) antes de escalar a SaaS (SEC-026).

---

## 6. Principios permanentes

1. **La autoridad es el servidor.** Firestore Rules + Admin SDK con verificación de token son la frontera; los guards del cliente son UX. **Y las reglas se prueban en CI** (SEC-005): un control sin tests no es un control.
2. **Ningún secreto en el cliente ni en el binario.** API keys públicas ≠ secretos. Nada confidencial en `NEXT_PUBLIC_*`, SQLite Base64, ni empaquetado.
3. **`tenantId` y rol vienen de custom claims**, jamás de un campo escribible por el cliente.
4. **Append-only para lo financiero/fiscal/inventario.** Nunca relajar `update/delete: if false`.
5. **Deny-by-default** en reglas, navegación Electron, apertura de ventanas, esquemas de URL y feed de actualización.
6. **Todo binario se firma y se verifica.** El canal de actualización es infraestructura crítica.
7. **Un backup no probado no existe.**
8. **Todo cambio de seguridad entra por CI** y **todo ítem tiene owner, coste y criterio de aceptación**.
9. **Cumplimiento no es opcional** desde el primer dato personal recolectado.

---

## 7. Riesgos residuales conocidos (a vigilar)

- App Check en Electron carece de proveedor nativo: mitigación parcial hasta que exista atestación viable.
- Retrofit multi-tenant sobre datos de producción es intrínsecamente riesgoso: exige ventana de migración y pruebas de aislamiento antes del 2º cliente.
- El equipo parte sin cultura de tests: los gates de CI aportarán valor progresivamente, no de inmediato.

---

## 8. Changelog

**v2.0 (2026-07-02)** — Incorpora revisión crítica independiente:
- **Reclasificado** SEC-001 (`credentials.json`) de CRÍTICO a ALTO (secret OAuth desktop no confidencial por diseño, RFC 8252); se mantiene la acción.
- **Dividido** el antiguo SEC-003: fix barato (HTTPS/eliminar HTTP server/validar `update:configure`) queda como bloqueante de piloto (SEC-003); code-signing pasa a fast-follow con presupuesto propio (SEC-012), **no** bloquea el piloto.
- **Añadido** SEC-005: tests de reglas con emulador en CI (el control primario carecía de verificación).
- **Añadido** SEC-000: fundaciones de ingeniería (lint/CI/tests) como prerequisito.
- **Añadida** Fase P2 de cumplimiento: Habeas Data (SEC-013), retención DIAN (SEC-014), alcance PCI (SEC-015).
- **Adelantado** SEC-010 (custom claims) de P2 a P1 por su valor single-tenant (mitiga EoP + coste de `get()`).
- **Corregido** SEC-007 (App Check): enforce en web pública; Electron como investigación, no enforce universal (sin proveedor nativo).
- **Corregido** SEC-022 (CSP): hash/SRI para el bundle estático de Electron (nonce exige render dinámico).
- **Estrechado** el antiguo cifrado total de SQLite a integridad/HMAC (SEC-025); las joyas ya las cubre SEC-002.
- **Añadidos:** SBOM (SEC-011), throttling login web + pentest + KPIs (SEC-026), higiene de logs (SEC-024), rol `supervisor` inconsistente (AZ-2), lectura pública como denial-of-wallet (§2.4).
- **Añadida** §5 Gobernanza (owner/fecha/coste/criterio/riesgo residual) y §7 riesgos residuales.
- **Reencuadrado** E-1: el feed por defecto es HTTPS (github:); el HTTP solo aplica al servidor opcional; impacto leído por fase (una caja hoy, flota en SaaS).

**v1.0 (2026-07-02)** — Versión inicial.

---

*Fin del Master Security Plan v2.0. Aprobación condicionada a completar la §5 Gobernanza (owners, fechas, coste, aceptación de riesgo residual).*
