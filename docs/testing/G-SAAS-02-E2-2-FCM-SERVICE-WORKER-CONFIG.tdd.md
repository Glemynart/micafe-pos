# TDD — Configuración de service worker FCM para E2.2

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`, Gate F.
- **Hallazgo:** la app obtiene Firebase de variables por entorno, pero el
  service worker estático fijaba `micafe-pos` (producción), desalineado con
  `micafe-pos-staging` usado por el Preview.
- **Hallazgo adicional:** FCM muestra automáticamente en background los
  payloads con `notification`; el worker además llamaba `showNotification`, lo
  que podía duplicarlos. La agenda ahora envía título/cuerpo como `data` y el
  POS/worker los presenta en primer plano/segundo plano respectivamente. La
  guía oficial describe el display automático para payloads `notification`:
  [Receive messages in Web apps](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).
- **Hallazgo de scope:** el PWA registra `/sw.js` en `/` y FCM registraba
  `/firebase-push-sw.js` también en `/`; dos scripts competían por una única
  inscripción. FCM ahora usa `/firebase-push/`, permitida por el header
  `Service-Worker-Allowed: /`.
- **Recorrido esperado:** admin/vendedor de staging habilita notificaciones;
  el service worker usa la misma configuración Firebase de la app y no recurre
  a valores productivos si falta configuración.

## RED / GREEN

| Etapa | Commit | Comando | Resultado |
|---|---|---|---|
| RED | `a8f6ce99839d322ff603d01a6bd5f7a977174caf` | `npx tsx --test lib/__tests__/firebase-push-service-worker.test.ts` | Falló porque el helper esperado todavía no existía (`MODULE_NOT_FOUND`). |
| GREEN | `d76ce7c` | `npm run test:firebase-push-service-worker` | PASS, 2/2: configuración del proyecto correcto, sintaxis del worker y fallo cerrado si falta configuración. |
| RED | `2cee95e316ec6582d9496b6023d761c41e04c378` | `npx tsx --test lib/__tests__/firebase-push-service-worker.test.ts`; `npm --prefix functions-bodega test` | PASS previo 2/2 regresó a RED por helper ausente; función falló porque aún enviaba `notification` aparte de `data`. |
| GREEN | `e39df7a` | `npm run test:firebase-push-service-worker`; `npm --prefix functions-bodega test` | PASS, 4/4 y 9/9: un solo display de background, payload data-only para agenda y lectura foreground. |
| RED | `64fc77b` | `npm run test:firebase-push-service-worker` | Falló porque el callback background no devolvía la promesa de `showNotification`; el worker podía terminar antes de completar la notificación. |
| GREEN | `b6b9bcf` | `npm run test:firebase-push-service-worker` | PASS, 4/4: el callback espera la promesa de `showNotification` y mantiene la entrega dentro del ciclo de vida del push. |
| RED | `d344f94` | `npm run test:firebase-push-service-worker` | Falló porque aún no existía un registro FCM aislado del scope raíz del PWA. |
| GREEN | `09d74c8` | `npm run test:firebase-push-service-worker` | PASS, 5/5: el registro FCM usa `/firebase-push/` y el worker PWA conserva `/`. |
| RED | `dfa939acdee89c7d1a71158d865277581011ca60` | `npm run test:firebase-push-service-worker` | Falló como se esperaba: con una pestaña `/pos` ya abierta, el click llamaba `openWindow('/pos')` en vez de enfocar/navegar la pestaña existente. |
| GREEN | `f0293a64bcd28cd8dbd21c18583d98adcd69cb06` | `npm run test:firebase-push-service-worker` | PASS, 6/6: se reutiliza la pestaña POS y `waitUntil` espera a que terminen `focus()` y `navigate()`; se conserva fallback a `openWindow`. |

## Validación

- `npm run test:firebase-push-service-worker` — PASS, 6/6 después de corregir el caso de click.
- `node --experimental-test-coverage --import tsx --test lib/__tests__/firebase-push-service-worker.test.ts` — PASS, 6/6; cobertura agregada: 99.29% líneas, 95.35% branches, 95.38% funciones; el worker tiene 100% líneas.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS; Next reconoció `/firebase-push-sw.js` como ruta dinámica.
- `npm --prefix functions-bodega test` — PASS, 9/9.
- `npm --prefix functions-bodega run build` — PASS.
- `npm run lint` — PASS.
- `git diff --check` — PASS.
- La prueba se añadió al job `Tipos y pruebas` de CI mediante
  `npm run test:firebase-push-service-worker`.

## Alcance y límite de evidencia

La ruta dinámica comparte `firebaseConfig` con el cliente y responde `503`
cuando falta cualquiera de los campos requeridos; no incluye fallback ni
secreto. El mensaje de agenda conserva título, cuerpo, destinatario y URL en el
payload de datos; no añade PII. FCM tiene scope separado del PWA.

En `micafe-pos-staging`, el admin sintético autenticó el preview
`cafeatrato-ck4y429gi` durante la verificación inicial. Se observó un registro
de cuatro tokens FCM en su perfil (no se copiaron ni imprimieron los valores).
Dos mensajes data-only de prueba fueron aceptados por FCM; la captura del
usuario confirmó la recepción del reenvío `Prueba sintética Gate F — reenvío`.
Esta recepción corresponde a ese preview anterior; no acredita todavía la
entrega desde la última revisión de PR #490. No se oyó sonido; Web Push no
garantiza sonido y depende del navegador y del sistema operativo. Esta prueba
confirma recepción, no persistencia de una notificación dentro de la aplicación
ni el despacho automático del outbox.

Mutation audit: el registro FCM del admin sintético en staging fue actualizado
por la app y se enviaron dos mensajes FCM sintéticos; no se modificaron agenda,
reservas, stock, ventas, Auth, Rules, IAM, Secrets, despliegues, tráfico ni
producción. El procesamiento automático del outbox y los demás casos de la
matriz Gate F permanecen pendientes.

## Seguimiento — carrera de activación de Service Worker (2026-10-08)

- Síntoma reportado por el usuario: `PushManager.subscribe()` falló con
  `Subscription failed - no active Service Worker`. No se confirma como una
  reproducción en el navegador ni se atribuye todavía exclusivamente a esta
  carrera.
- [RED] Commit `9b4e93c82a7e530ac4f2bd724f36c018e6f09866`: la prueba nueva
  `espera a que el worker registrado esté activo antes de devolver el registro`
  falló porque el helper devolvió la inscripción mientras su worker seguía en
  estado `installing` (6 pruebas previas pasaban).
- [GREEN] Commit `1b4bf30`: el registro FCM espera el evento de activación de
  su propia inscripción `/firebase-push/`; ausencia de worker y transición a
  `redundant` producen errores explícitos. Se eliminó la espera global
  `navigator.serviceWorker.ready`, que no garantiza que el registro FCM
  separado sea el que quedó activo.
- `npm run test:firebase-push-service-worker` — PASS, 9/9.
- `npx tsc --noEmit` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS; la ruta dinámica `/firebase-push-sw.js` fue generada.
- `npm run e2e:bodega-agenda` — PASS, 6/6 en Emulator.
- `npm run e2e:bodega-u4-u5` — PASS, 9/9 en Emulator.
- CI del HEAD `059a7a7dc9c76961f3c6f9feb25c245adb63d0de`: PASS, run
  `37827633298`; `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`
  terminaron correctamente. Los E2E del flujo Bodega y la certificación
  integral de CI usaron Firebase Emulators (`demo-*`), no staging.
- Vercel Preview READY para el HEAD: `https://cafeatrato-q0oh6en21-glemynarts-projects.vercel.app`.
- Inspección del navegador Edge autenticado en ese origen: permiso de
  notificaciones concedido, worker FCM de scope `/firebase-push/` en estado
  `activated` y `PushManager.getSubscription()` presente; no se observaron
  errores FCM/Service Worker en la consola. Esto verifica que la precondición de
  suscripción no reproduce el error reportado en este preview. No demuestra una
  entrega push desde este origen: la recepción confirmada por el usuario fue en
  el preview anterior `cafeatrato-ck4y429gi`.
- Gate F continúa `EN CURSO`; la matriz funcional de staging y la recepción de
  un recordatorio automático en el origen vigente siguen pendientes. Este
  arreglo no cierra el gate.

Mutation audit de este seguimiento: dos commits de implementación y uno de
documentación en la rama de PR #490. Codex no desplegó Firebase ni escribió
directamente Firestore/Auth, Rules, IAM, Secrets, agenda, reserva, stock, venta
o tráfico. Tras autorizar notificaciones y autenticar el preview, la app puede
registrar un token FCM en el perfil del admin mediante su flujo normal; el
documento de token de este origen no se leyó de forma independiente, por lo que
no se atribuye una escritura concreta. No hubo mutaciones en producción. Las
pruebas E2E usaron solo Firebase Emulators de proyectos `demo-*`.
