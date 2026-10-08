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

## Validación

- `node --experimental-test-coverage --import tsx --test lib/__tests__/firebase-push-service-worker.test.ts` — PASS; cobertura agregada: 100% líneas, 94.34% branches, 97.14% funciones; helpers/worker tienen 100% líneas.
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
payload de datos; no añade PII. No se modificaron Firebase remoto, Vercel,
agenda persistida ni producción. El build local no demuestra todavía la
respuesta del service worker en Preview, la recepción push en segundo plano ni
el procesamiento automático del outbox; eso permanece pendiente para Gate F.
