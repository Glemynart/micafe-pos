# TDD — Configuración de service worker FCM para E2.2

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`, Gate F.
- **Hallazgo:** la app obtiene Firebase de variables por entorno, pero el
  service worker estático fijaba `micafe-pos` (producción), desalineado con
  `micafe-pos-staging` usado por el Preview.
- **Recorrido esperado:** admin/vendedor de staging habilita notificaciones;
  el service worker usa la misma configuración Firebase de la app y no recurre
  a valores productivos si falta configuración.

## RED / GREEN

| Etapa | Commit | Comando | Resultado |
|---|---|---|---|
| RED | `a8f6ce99839d322ff603d01a6bd5f7a977174caf` | `npx tsx --test lib/__tests__/firebase-push-service-worker.test.ts` | Falló porque el helper esperado todavía no existía (`MODULE_NOT_FOUND`). |
| GREEN | `d76ce7c` | `npm run test:firebase-push-service-worker` | PASS, 2/2: configuración del proyecto correcto, sintaxis del worker y fallo cerrado si falta configuración. |

## Validación

- `node --experimental-test-coverage --import tsx --test lib/__tests__/firebase-push-service-worker.test.ts` — PASS; helper: 100% líneas, 93.33% branches, 100% funciones.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS; Next reconoció `/firebase-push-sw.js` como ruta dinámica.
- `npm run lint` — PASS.
- `git diff --check` — PASS.
- La prueba se añadió al job `Tipos y pruebas` de CI mediante
  `npm run test:firebase-push-service-worker`.

## Alcance y límite de evidencia

La ruta dinámica comparte `firebaseConfig` con el cliente y responde `503`
cuando falta cualquiera de los campos requeridos; no incluye fallback ni
secreto. No se modificaron Firebase remoto, FCM, Vercel, agenda ni producción.
El build local no demuestra todavía la respuesta del service worker en Preview,
la recepción push en segundo plano ni el procesamiento automático del outbox;
eso permanece pendiente para Gate F.
