# D-NOTIF-02 — Diseño de Notificaciones Push del Admin (login + apertura de turno)

**Rama:** `research/notificaciones-mvp` · **Estado:** diseño aprobado, pendiente de implementar · **Fecha:** 2026-07-05

---

## 1. Contexto

El panel Admin debe recibir notificaciones push cuando un cajero (1) **inicia sesión** y (2) **abre un turno**. Existe infraestructura FCM parcial pero el flujo no entrega notificaciones en producción.

Topología confirmada — **dos despliegues del mismo código Next.js sobre el mismo proyecto Firebase (`micafe-pos`)**:

| Despliegue | Qué corre | Runtime | Contexto |
|---|---|---|---|
| **Vercel** | Admin `/admin/*`, API `/api/*`, webhook Wompi | Servidor completo | Navegador / PWA del admin |
| **Electron** | POS del cajero `/pos` desde `out/` vía `electron-serve` (`main.js:8,68`) | **Export estático, sin servidor** | Estación de caja |

Ambos hablan con Firestore por el SDK cliente. **El emisor puede ejecutarse en cualquier plataforma (Electron POS, navegador, PWA) usando el mismo pipeline.** La **recepción** ocurre donde el admin abra el panel (navegador de escritorio, PWA Android, PWA iOS), sujeta a las capacidades de cada plataforma. **Electron participa únicamente como emisor de eventos; el POS no es un receptor de push.**

---

## 2. Problema actual

- **Login:** no llega ninguna notificación porque **no existe código emisor** en el flujo de login.
- **Apertura de turno:** el emisor existe pero hace un `fetch` **relativo** que, desde un origen empaquetado sin API server (caso confirmado: Electron), es **inalcanzable**; el error se traga silenciosamente. En `dev` (localhost con API) sí funciona — de ahí que el síntoma sea "no funciona en la app instalada".

---

## 3. Hallazgos confirmados

| ID | Hallazgo | Evidencia |
|---|---|---|
| **C-1 (Crítico)** | El login no emite push: `loginConUsername` solo hace `signIn` + `setDoc({ultimoAcceso})`. No hay `fetch` ni `enviarPushAdmins`. | `lib/auth-service.ts:74-118` |
| **C-2 (Crítico)** | El emisor de turno usa URL **relativa** `fetch('/api/notifications/send')`, inalcanzable desde un origen empaquetado sin servidor (Electron); error tragado en `.catch`. | `lib/turnos-service.ts:151-165`; `main.js:8,68`; `out/` export estático |
| **M-1 (Mayor)** | El endpoint no expone CORS ni handler `OPTIONS`; solo `POST`. Consumo cross-origin quedaría bloqueado por preflight. | `app/api/notifications/send/route.ts` |
| **M-3 (Mayor)** | Sin renovación (`onTokenRefresh`) ni des-registro en logout. Verificado en Firestore: **1 admin con 44 `fcmTokens`** acumulados (mayoría presumiblemente muertos). Con envío token-a-token, cada push hace ~44 `send`. | Verificación M-2 (solo lectura); `components/fcm-manager.tsx:36-65`; `lib/notificaciones-push.ts:33-49` |

**Verificación M-2 (solo lectura, `firebase-admin`):** 7 usuarios; **admin "Administrador" = 44 tokens**; cajeros/cocinero/marketing = 0 (esperado). → **Existen destinatarios**; la no-entrega no se debe a falta de tokens.

La cadena de **recepción** del admin (SW, foreground `onMessage`, background `onBackgroundMessage`, `notificationclick`/deep-link) está **completa y correcta** (`fcm-manager.tsx:84`, `public/firebase-push-sw.js:18,41`, `sw-register.tsx`). El corte está en el **emisor**, no en la recepción.

---

## 4. Arquitectura aprobada

- **Un único emisor cliente, genérico y platform-agnostic:** módulo nuevo `lib/notificaciones-cliente.ts` con una sola función `notificar({ title, message, url? })`. **Describe un evento**, no destinatarios. Login y turno lo invocan; **sin segundo pipeline**. Abstrae completamente el origen del evento y la plataforma: cualquier consumidor (Electron, Web de escritorio, PWA Android/iOS) usa exactamente el mismo camino.
- **La selección de destinatarios pertenece al backend.** El emisor y el endpoint no deciden roles en el cliente. En el **MVP**, el backend (`enviarPushAdmins`) envía **únicamente a usuarios con rol administrador**; ampliar a otros roles (cocina, marketing, supervisores…) será un cambio **solo de backend**, sin rediseñar el emisor ni los consumidores.
- **Endpoint existente reutilizado:** `/api/notifications/send` **forma parte de la infraestructura existente y permanece como único punto de entrada al backend de notificaciones** (`app/api/notifications/send/route.ts` → `enviarPushAdmins` → FCM). **No se crea otro backend**; solo se le añade CORS/`OPTIONS`.
- **FCM se mantiene** como tecnología.
- **Rol de Electron:** participa **solo como emisor**. La recepción está destinada al panel administrativo (navegador de escritorio o PWA Android/iOS). Las limitaciones de Electron como receptor de Web Push **no afectan este diseño**.
- **Responsabilidades:**
  - `turnos-service.ts`: detecta `turnoCreado` y delega; deja de contener HTTP/auth/errores.
  - `auth-service.ts`: permanece como identidad pura; la única adición es la limpieza de token en `logout()` (chokepoint común).
  - `contexts/auth-context.tsx`: orquesta el disparo de login (conoce `Usuario` y `rol`).

---

## 5. Principios (regla arquitectónica permanente)

Estos principios rigen este diseño y **cualquier evento de notificación futuro**:

1. **Un único pipeline de envío.** Todo push del sistema fluye por el mismo camino.
2. **El cliente nunca envía directamente a FCM.** El SDK de FCM del cliente solo recibe/registra tokens; jamás emite.
3. **Toda notificación pasa por el endpoint existente** `/api/notifications/send`.
4. **El endpoint desconoce el origen funcional del evento.** Recibe `{ title, message, url? }`; no sabe si fue login, turno u otro.
5. **Los consumidores solo describen el evento; nunca implementan transporte.** Arman el mensaje y llaman al emisor compartido.
6. **Los servicios de dominio (Turnos, Auth, etc.) no conocen HTTP ni FCM.** Solo notifican eventos al emisor compartido.
7. **El motor de envío permanece intacto.** `enviarPushAdmins` y la infraestructura Admin no se modifican.
8. **Compatibilidad multiplataforma con un único diseño.** El mismo pipeline sirve a **navegador de escritorio, PWA Android, PWA iOS y Electron (POS)**. No hay diseños específicos por plataforma.
9. **La única diferencia entre plataformas es la obtención del token FCM y las capacidades propias del navegador/runtime.** El tramo **emisor → endpoint → Firebase Admin → FCM es idéntico** en todas las plataformas.
10. **Separación emisor / destinatario.** El emisor describe eventos de forma genérica; **la selección de destinatarios pertenece al backend**. El diseño no queda acoplado al caso "admin": en el MVP el backend envía solo a administradores, pero admitir otros roles es un cambio de backend, no de arquitectura.
11. **Idempotencia — sin garantía de entrega única.** El emisor **no garantiza entrega única**. Cada emisión representa un **evento independiente**. Si en el futuro se requiere deduplicación o supresión de eventos repetidos, será un problema separado y **no forma parte del MVP**. El emisor **no incorpora lógica para evitar dobles envíos**.

---

## 6. Decisiones arquitectónicas (D-NOTIF-02)

**D1 · Emisor único.** `lib/notificaciones-cliente.ts` centraliza: resolución de origen, `idToken`, `POST`, errores/retry. Único punto de entrada para ambos eventos, en cualquier plataforma. Firma genérica `notificar({ title, message, url? })`.
*Archivos:* crear `lib/notificaciones-cliente.ts`; editar `lib/turnos-service.ts`, `contexts/auth-context.tsx`.

**D2 · Origen de la API sin hardcode.** Variable pública `NEXT_PUBLIC_APP_URL` inlinada en build. Base = `NEXT_PUBLIC_APP_URL || ''` (vacío ⇒ relativo). Un build **same-origin** (Vercel PWA/web, dev) la deja vacía; un build **empaquetado/cross-origin** (p. ej. Electron) inyecta la URL de Vercel. Guardia platform-neutral: en contexto **cross-origin** con base vacía → **log de error explícito** de configuración (no fetch condenado).
*Archivos:* `lib/notificaciones-cliente.ts`, `.env.example`, env del build empaquetado.

**D3 · CORS + OPTIONS.** En `route.ts`: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`, y handler `OPTIONS`→`204`. `*` es seguro porque la auth es Bearer idToken (no cookies), sin `Allow-Credentials`.
*Archivos:* `app/api/notifications/send/route.ts`.

**D4 · Emisión en login.** Tras `loginConUsername` OK en `auth-context.tsx`, si `rol === 'cajero'` → `notificar({ title:'Cajero inició sesión', message:'{nombre} inició sesión', url:'/admin/turnos' })`. (El gate `rol==='cajero'` es del **emisor del evento**; la selección de **destinatarios** —admins en el MVP— la hace el backend.)
*Archivos:* `contexts/auth-context.tsx`.

**D5 · Emisión en apertura de turno.** En `abrirTurno`, si `turnoCreado` → mismo `notificar({ title:'¡Nuevo turno abierto!', message:'{cajeroNombre} abrió con base ${base}', url:'/admin/turnos' })`. Se elimina el `fetch` inline.
*Archivos:* `lib/turnos-service.ts`.

**D6 · Manejo de errores (sin silencios).** Fire-and-forget en beneficio del destinatario, disparado por el cajero:
- **Logging** con prefijo `[push]` diferenciando causa (`token` / `network` / `http-4xx` / `http-5xx`). Nunca `catch` mudo.
- **UX cajero:** sin toast de error (no es su tarea). Indicador visible solo en `dev`.
- **Retry:** 1 reintento (backoff corto) solo para transitorios (red, `429`, `5xx`); máx. 2 intentos.
- **No reintentar (log-only):** `400`, `401/403` (bugs de config).
*Archivos:* `lib/notificaciones-cliente.ts`.

**D7 · Política de tokens FCM.** Único tramo con diferencias por plataforma (obtención del token + capacidades del runtime); el almacenamiento/eliminación es idéntico:
- **Alta:** en `permission==='granted'`, `arrayUnion`; VAPID desde `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (no hardcode).
- **Renovación:** manejar rotación → `arrayUnion` (idempotente).
- **Logout:** antes de `signOut`, `arrayRemove` del token en `usuarios/{uid}` (centralizado en `auth-service.logout()`).
- **Inválidos:** purga server-side existente **sin cambios**.
*Archivos:* `components/fcm-manager.tsx`, `lib/auth-service.ts`.

---

## 7. Riesgos aceptados

- **R-a1 — Pérdida offline:** si el cajero está sin red al abrir turno/iniciar sesión, el push se pierde (best-effort, sin cola). Aceptado en MVP.
- **R-a2 — Doble notificación:** cajero inicia sesión e inmediatamente abre turno → dos push seguidos. Aceptado por diseño (Principio 11); vigilable.
- **R-a3 — Envío token-a-token:** ~44 `send` por push con la implementación actual del motor. Aceptado en MVP (no se toca el motor).
- **R-a4 — Capacidades de recepción por plataforma:** iOS exige **PWA instalada + iOS ≥16.4**; Electron no es receptor de push (solo emisor). Se aceptan como **diferencias de capacidad de plataforma** (Principio 9); **no afectan al pipeline emisor**, idéntico en todas.

---

## 8. Riesgos descartados

- **R-d1 — Falta de tokens de admin (antes R-M1):** **descartado** por verificación M-2 (44 tokens en el admin).
- **R-d2 — Incompatibilidad de plataforma en el emisor:** **descartado**; el emisor es idéntico en todas las plataformas (Web/PWA/Electron). Las diferencias se limitan a la obtención del token y a las capacidades de recepción (ver R-a4), no al pipeline. Electron es **solo emisor**, por lo que su limitación como receptor de Web Push es irrelevante para este diseño.
- **R-d3 — Fuga de la service account:** **descartado**; `micafe-pos-firebase-adminsdk-*.json` está gitignored y no trackeada.

---

## 9. Roadmap aprobado (PR-1 → PR-4)

**PR-1 · Emisor compartido (`lib/notificaciones-cliente.ts`).** Objetivo: crear el emisor único **genérico y platform-agnostic** (resolución de origen, `idToken`, `POST`, errores/retry) y migrar apertura de turno a él, eliminando el `fetch` inline. Es una **refactorización interna** que desacopla la arquitectura sin depender todavía de CORS. Archivos: crear `lib/notificaciones-cliente.ts`; editar `lib/turnos-service.ts`, `.env.example`. Pruebas: turno dispara POST a base resuelta; `turnoCreado=false` no emite; errores logueados con causa; guardia cross-origin (log de config si falta `NEXT_PUBLIC_APP_URL` en build empaquetado). Riesgo: medio (ruta de turno).

**PR-2 · CORS + OPTIONS.** Objetivo: habilitar el emisor desde **cualquier contexto cross-origin** (apps empaquetadas como Electron y cualquier origen distinto al del endpoint). Archivos: `app/api/notifications/send/route.ts`. Pruebas: `OPTIONS`→204 con cabeceras; `POST` cross-origin 200; same-origin (Web/PWA en Vercel) sigue OK. Riesgo: bajo (no cambia lógica de envío).

**PR-3 · Emisión en login.** Objetivo: push en login de cajero reutilizando el emisor, en cualquier plataforma. Archivos: `contexts/auth-context.tsx`. Pruebas: cajero→POST; admin→no emite; login fallido→no emite. Riesgo: bajo.

**PR-4 · Ciclo de vida de tokens.** Objetivo: VAPID-env, renovación, `arrayRemove` en logout. Contempla las diferencias de obtención de token por plataforma (Android PWA, iOS PWA instalada, navegador de escritorio, Electron), manteniendo idéntico el almacenamiento/eliminación. Archivos: `components/fcm-manager.tsx`, `lib/auth-service.ts`. Pruebas: alta en grant; token renovado se añade; logout elimina el token del `uid`. Riesgo: bajo/medio.

**Justificación del orden:** el emisor compartido (PR-1) es refactor interno que funciona same-origin (dev/Vercel) sin CORS; PR-2 lo habilita desde contextos cross-origin (Electron y otros); PR-3 y PR-4 se apoyan en el emisor ya establecido. PRs pequeños, de objetivo único y fáciles de revisar. Ningún PR toca archivos protegidos. Nota: el turno solo entrega **end-to-end desde un consumidor empaquetado (Electron)** una vez mergeados PR-1 **y** PR-2.

---

## 10. Fuera de alcance

- Disparadores server-side vía Cloud Functions / triggers Firestore (no existe infra de Functions).
- Cola offline durable con reintentos.
- Deduplicación / supresión de eventos repetidos (ver Principio 11).
- UX avanzada de error / centro de notificaciones.
- Eventos adicionales (venta, pedidos, cambios de estado, cierre de turno) — otros documentos.

---

## 11. Futuras mejoras

Fuera del MVP, candidatas a trabajo posterior:

- **Segmentación de destinatarios por rol** (cocina, marketing, supervisores) — cambio solo de backend, sin tocar emisor ni consumidores.
- **Purga inicial de tokens muertos** (limpieza única de los ~44 `fcmTokens` acumulados en el admin).
- **`sendEachForMulticast`** en el motor de envío (reemplaza el bucle token-a-token).
- **Deduplicación de dispositivos** (un token efectivo por dispositivo).
- **Métricas de entrega** (enviados / purgados / fallidos).

---

## 12. Checklist de implementación

**Pre-requisitos (cerrar antes de empezar):**
- [ ] URL real de la deployment Vercel para `NEXT_PUBLIC_APP_URL`.
- [ ] Confirmado que el build empaquetado (Electron, `npm run dist`) puede inyectar esa env pública.
- [x] Existencia de tokens de admin (M-2: 44 tokens).
- [ ] Valor de `Access-Control-Allow-Origin` (`*` recomendado) aceptado bajo auth Bearer.
- [ ] Textos y `url` de cada push aprobados; gate de login `rol==='cajero'` confirmado.

**Definición de terminado (por PR):**
- [ ] PR-1: turno abre → POST a base resuelta (relativa same-origin, absoluta en build empaquetado); `turnoCreado=false` no emite; errores con causa en log; guardia cross-origin activa.
- [ ] PR-2: preflight `OPTIONS`→204; POST cross-origin 200; same-origin intacto.
- [ ] PR-3: login cajero emite; admin no; login fallido no.
- [ ] PR-4: token en alta/renovación (`arrayUnion`) y eliminado en logout (`arrayRemove`); VAPID desde env.

**Validación end-to-end (multiplataforma, mismo pipeline):**
- [ ] **Navegador de escritorio:** cajero abre turno / inicia sesión → admin recibe push.
- [ ] **PWA Android (instalada):** recepción foreground y background + `notificationclick`.
- [ ] **PWA iOS (instalada, iOS ≥16.4):** recepción (aceptando la capability de plataforma).
- [ ] **Electron (paquete real):** cajero abre turno → POST a URL absoluta → admin recibe **en su plataforma** (no en el POS).
- [ ] Ningún PR modifica `notificaciones-push.ts`, `firebase-admin.ts`, `firebase-push-sw.js`, `firestore.rules`.
