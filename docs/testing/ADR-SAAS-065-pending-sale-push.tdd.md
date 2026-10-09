# ADR-SAAS-065 — Evidencia TDD de avisos de solicitudes Bodega

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`, Gate F.
- **Decisión:** evento/outbox atómico, trigger inmediato, reconciliación por
  Scheduler y conservación del token solo ante timeout por inactividad del
  administrador.
- **Entorno:** las pruebas de esta evidencia usan dobles locales y Firebase
  Emulator cuando se indique; no representan un despliegue ni tráfico real.

## RED / GREEN

| Etapa | Commit | Comando | Resultado |
|---|---|---|---|
| RED | `7b61e51` | `npx tsx --test functions/src/bodega-vendedor/solicitudes-venta.test.ts` | 10 PASS / 1 FAIL esperado: solicitud sin evento durable atómico. |
| RED | `7b61e51` | `npx tsx --test functions-bodega/src/agenda-worker.test.ts` | 2 PASS / 8 FAIL esperados: faltaba dispatch del tipo nuevo y su API. |
| RED | `7b61e51` | `npx tsx --test lib/__tests__/fcm-logout-policy.test.ts` | FAIL esperado: política aún no implementada. |
| GREEN | rama `codex/e2-2-bodega-pending-sale-push` | `npx tsx --test functions/src/bodega-vendedor/solicitudes-venta.test.ts lib/__tests__/fcm-logout-policy.test.ts` | PASS, 14/14, incluye atomicidad del evento, replay idempotente y política timeout/logout manual. |
| GREEN | misma rama | `npm --prefix functions-bodega run build` y `npm --prefix functions-bodega test` | PASS, build y 12/12: despacho a admin activo del tenant, payload genérico sin ID de solicitud, evento obsoleto omitido, carrera concurrente sin doble envío, regresión de agenda y discovery del trigger sin Secrets. |
| GREEN | misma rama | `npm run e2e:bodega-u4-u5` | PASS, 9/9 en Firebase Emulator (`demo-bodega-u4-u5-ui`); el flujo integrado observa el evento durable atómico, trigger ejecutado y estado `SIN_DESTINATARIO` sin token, además de confirmar cero ventas/ledger antes de aprobar. |
| GREEN | misma rama | `npm run e2e:bodega-agenda` | PASS, 6/6 en Firestore Emulator (`demo-bodega-agenda`), regresión de reservas, conversión, aislamiento y paginación. |
| GREEN | misma rama | `npm --prefix functions test` | PASS, 422 pruebas: 417 PASS, 5 omitidas, 0 FAIL. |
| GREEN | misma rama | `npm run test:firebase-push-service-worker`; `npm run test:bodega-ui`; `npm run build:functions`; `$env:POS_DEPLOY_ENV='staging'; $env:NEXT_PUBLIC_FIREBASE_PROJECT_ID='micafe-pos-staging'; npm run build:vercel`; `npx tsc --noEmit`; `npm run lint`; `git diff --check` | PASS; push worker 9/9, UI Bodega 12/12; build Vercel/staging, builds/typecheck/lint y diff limpios. |

## Controles cubiertos

- La solicitud y el evento se crean en una sola transacción. Si falla la
  escritura del evento, no se conserva la solicitud.
- Repetir el mismo comando devuelve la solicitud original y conserva un solo
  evento con ID determinista.
- El worker revalida que la solicitud esté pendiente y selecciona únicamente
  membresías activas `admin` del mismo tenant. Vendedor, tenant ajeno y
  membresía suspendida no reciben el push.
- El payload solo incluye texto genérico y URL interna `/admin/solicitudes`; no
  contiene IDs de tenant, solicitud o evento, ni cliente, artículos o valor de
  la solicitud. El ID interno del evento es reversible y permanece solo en el
  backend/outbox, nunca se envía al navegador.
- El trigger inmediato y el Scheduler comparten el claim transaccional. El
  push no ocurre dentro de la transacción de dominio.
- La prueba E2E consulta el outbox mediante Firestore y no importa módulos del
  backend; así el build de Vercel no debe resolver dependencias exclusivas de
  Cloud Functions.
- El timeout conserva el token únicamente cuando el rol autenticado es admin;
  timeout de otros roles y logout manual eliminan el token según el flujo
  existente.

## Evidencia todavía pendiente

La verificación local no demuestra recepción push desde el nuevo preview, la
expiración de Auth y posterior entrega real en Edge, el sonido del dispositivo,
ni el despliegue de `saas-bodega` en `micafe-pos-staging`. Esos resultados
requieren CI/PR y los gates de preflight/deploy y smoke de Gate F. El sonido no
se garantiza: depende del navegador, permisos y sistema operativo conforme a
ADR-SAAS-065. Durante E2E, Firebase Emulator advirtió que el secreto
`OPERATIONAL_PIN_PEPPER` no estaba disponible para `demo-bodega-u4-u5-ui`;
las 9 pruebas terminaron PASS y no se consultó ni modificó ningún secreto real.
