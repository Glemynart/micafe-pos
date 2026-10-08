# G-SAAS-02 / M2 / E2.2 — Gate F: evidencia parcial de verificación (2026-10-08)

**Última revisión:** 2026-10-08 12:27 UTC
**Estado:** `EN CURSO` — evidencia parcial; no certifica Gate F.

## Contexto y límites

Gate C, D y E están registrados como `PASS` en el Goal vivo. Gate F requiere una
matriz funcional de staging; las pruebas locales y las lecturas de datos no la
sustituyen. Esta nota conserva verificaciones reproducibles sobre el código de
`main` y una instantánea de solo lectura del fixture sintético existente.

Alcance de la instantánea remota: proyecto `micafe-pos-staging`, tenant
`E2_2-BODEGA-STAGING-FIXTURE`. No se crearon datos, no se aceptó ni canceló una
agenda, no se confirmó una venta y no se cambió configuración, tráfico o
permisos.

## Identidad del código

- `HEAD` y `origin/main`: `bf9d456b4c0a65493c6d13982eca6891f3da17a1`.
- La verificación se ejecutó en un worktree separado del checkout principal.
- Las pruebas E2E locales usaron proyectos Emulator `demo-bodega-agenda` y
  `demo-bodega-u4-u5-ui`; no apuntaron a Firebase staging o producción.

## Validaciones locales

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; compilación Next.js y generación de 49 páginas |
| `npm run build:functions` | PASS |
| `npm --prefix functions-bodega run build` | PASS |
| `npm --prefix functions-operational-auth run build` | PASS |
| `npm --prefix functions-tenant-configuration run build` | PASS |
| `npm run test:bodega-ui` | 12/12 PASS |
| `npm --prefix functions test` | 419 pruebas; 414 PASS, 5 skip, 0 fallos |
| `npm --prefix functions-bodega test` | 9/9 PASS |
| `npm run e2e:bodega-agenda` | 6/6 PASS en Emulator |
| `npm run e2e:bodega-u4-u5` | 9/9 PASS en Emulator |

Los skips de la suite de Functions no se presentan como pruebas aprobadas. Los
tests de Emulator acreditan los casos modelados por esas suites, no el estado
remoto de staging.

## Instantánea read-only de staging

Lecturas realizadas el 2026-10-08, aproximadamente a las 12:26 UTC:

- Agenda: 4 documentos; 1 `RESERVADA` y 3 `CANCELADA`.
- Reservas: 4 documentos; 1 `ACTIVA` por 2 unidades base y 3 `LIBERADA`.
- El producto sintético reporta 6 unidades físicas y 2 reservadas: quedan 4
  unidades base disponibles, equivalentes a 2 presentaciones de factor 2. La
  reserva activa se conservó intacta.
- Solicitudes de venta: 4 documentos; 3 `EJECUTADA` y 1 `CANCELADA`; no había
  solicitudes `PENDIENTE_APROBACION` ni `APROBADA` al consultar Firestore.
  La vista actual del POS del vendedor también muestra estados cancelado y
  ejecutado, no una solicitud esperando aprobación. Por lo tanto, la captura
  anterior con estado pendiente no describe el estado actual del documento.
- Membresías activas: 5; tokens FCM activos: 0. No se puede afirmar entrega
  push con este estado.
- Para la agenda activa, dos avisos previos ya constan como
  `SIN_DESTINATARIO`. El aviso del día anterior está `PENDIENTE` para
  `2026-10-08T13:00:00Z`; el aviso de fecha programada, para
  `2026-10-09T13:00:00Z`. La lectura ocurrió antes de que el primer aviso
  estuviera vencido. No se forzó la ejecución del Scheduler.
- Scheduler de ADR-064: job habilitado con frecuencia de cinco minutos UTC; la
  última inspección previa registró un intento a `2026-10-08T12:18:06Z`.

Estas lecturas confirman una reserva vigente y el estado persistido observado,
pero no prueban la entrega de recordatorios, conversión de agenda, liberación,
expiración ni consumo en staging.

## Matriz restante de Gate F

| Caso | Estado al cierre de esta evidencia |
| --- | --- |
| Aislamiento de tenant y roles en staging | Pendiente de evidencia completa |
| Revocación/restauración de membresía y replay autenticado | Pendiente en staging; Emulator PASS no la sustituye |
| Retry autenticado tras pérdida de respuesta | Pendiente en staging; Emulator PASS no la sustituye |
| Agenda: creación y aceptación con reserva | Reserva preexistente verificada; ciclo de prueba completo pendiente |
| Agenda: conversión a solicitud y venta idempotente | Pendiente de evidencia completa en staging |
| Agenda: cancelación/liberación y expiración | Tests locales PASS; validación remota pendiente |
| Recordatorio worker y entrega push | Pendiente; no hay tokens FCM activos; no se cambió el permiso del navegador |
| Venta, turnos, inventario, ledger y auditoría | La evidencia histórica no equivale a una revalidación integral de este checkpoint |
| Reportes, PWA y Backoffice | Pendiente de revalidación integral |

No se debe consumir ni cancelar la reserva activa para completar casos que
requieran una nueva autorización de negocio. Tampoco se debe crear otro fixture.
El permiso de notificaciones del navegador requiere la interacción del usuario;
no se aceptó ni se intentó eludir ese permiso.

## Dictamen y siguiente paso

Las verificaciones automatizadas enumeradas pasan y la instantánea no muestra
una solicitud de venta todavía pendiente. Sin embargo, falta evidencia remota de
varios escenarios obligatorios de la matriz. Por ello:

- Gate F: `EN CURSO`, no `PASS`.
- E2.2: `EN EJECUCIÓN`.
- Gate G debe repetirse y Gate H debe emitir una matriz nueva después de F.
- Gates I/J/K/L continúan sujetos a sus propios criterios; esta nota no inicia
  el tenant real, el Trial ni producción.

## Mutation audit

- Archivos de aplicación/Functions modificados: 0.
- Firebase staging: lecturas Firestore y lecturas de Scheduler; escrituras: 0.
- Firebase Auth, Rules, IAM, Secrets, tráfico y despliegues: 0 cambios.
- Agenda/reserva/venta/ledger: 0 mutaciones en este checkpoint.
- Fixture adicional, Bootstrap, Activation, tenant real y producción: 0.
