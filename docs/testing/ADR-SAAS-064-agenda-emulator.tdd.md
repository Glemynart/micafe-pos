# ADR-SAAS-064 — Evidencia TDD de agenda en Firestore Emulator

Fecha de verificación: 2026-10-07 (America/Bogota).

## Recorrido cubierto

Un vendedor programa un pedido futuro; administración reserva stock; el
vendedor convierte la programación en solicitud; y las operaciones rechazan
concurrencia excesiva, identidades cruzadas y referencias comerciales inactivas
sin mutaciones indebidas.

## Garantías verificadas

| Garantía | Prueba | Tipo | Resultado |
|---|---|---|---|
| Dos aceptaciones concurrentes que exceden la disponibilidad no sobre-reservan; el stock físico queda intacto. | `functions/src/bodega-vendedor/emulator/agenda-pedidos.test.ts` — concurrencia de reservas | Firestore Emulator | PASS |
| Conversiones concurrentes crean una sola solicitud y mantienen el hold. | Mismo archivo — concurrencia de conversión | Firestore Emulator | PASS |
| Un tenant no consulta ni cancela agendas ajenas; cliente cruzado y tenant enviado en payload se rechazan. | Mismo archivo — tenant/actor/payload | Firestore Emulator | PASS |
| Cliente o presentación inactivos y vendedor sin permiso `sell` no crean agenda. | Mismo archivo — entidades/permiso inactivos | Firestore Emulator | PASS |

## Ejecución y evidencia

- Comando: `npm run e2e:bodega-agenda`.
- Resultado final observado: 4 pruebas, 4 PASS, 0 FAIL, 0 skipped; Firebase CLI
  ejecutó Firestore Emulator con proyecto `demo-bodega-agenda`.
- La primera ejecución tuvo 3 PASS y 1 fallo del predicado de prueba: este leía
  únicamente `details.code`, mientras el resolver de presentaciones expone
  `PRESENTACION_INACTIVA` en `Error.message`. Se amplió el helper de aserción,
  sin cambiar lógica de producto; la reejecución completa terminó 4/4 PASS.
- El runner rechaza `GOOGLE_APPLICATION_CREDENTIALS` y fija el proyecto demo;
  no se usó staging ni producción.
- Validaciones adicionales: `npm --prefix functions test` terminó con 413 PASS,
  5 skipped y 0 FAIL; `npm run build:functions`, `npx tsc --noEmit`,
  `npm run lint`, `npm run build` y `npm run test:bodega-ui` terminaron PASS.

## Alcance no demostrado aquí

Esta suite no demuestra despliegue, comportamiento de FCM en dispositivos,
validación en staging, ni cierre de los Gates F/G/H. Las pruebas unitarias
existentes del worker y de expiración/consumo se ejecutan además en CI, pero no
se presentan como evidencia de una ejecución real en staging.
