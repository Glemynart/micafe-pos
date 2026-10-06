# G-SAAS-02 / M2 / E2.2 — Aceptación de ADR-SAAS-062

## Dictamen

`ACCEPTED` el 2026-10-06 bajo la autorización delegada por el responsable del
proyecto para evaluar, aceptar/rechazar decisiones y continuar E2.2 de forma
autónoma. El requisito funcional confirmado fue que el vendedor envíe una
solicitud con cliente y artículos para que la administradora la apruebe antes
de cerrar la venta.

## Decisión y alcance

- Los miembros `vendedor` crean solicitudes tenant-aware. El servidor resuelve
  el cliente, las presentaciones, los precios y el total desde el catálogo
  canónico. El total enviado por el cliente nunca es autoridad.
- Un miembro `admin` autorizado aprueba o rechaza la solicitud. La aprobación
  queda ligada a su actor, al tenant y a una revisión inmutable.
- La autorización vence a las 24 horas. El timestamp y la validez son
  server-side; esta duración es una decisión de ingeniería dentro de la
  delegación recibida, no un plazo comercial proporcionado por el cliente.
- La aprobación no reserva stock. Si el catálogo/precio cambió, la revisión
  queda inválida. Si falta stock en la confirmación, no hay efectos parciales y
  la aprobación puede reintentarse mientras siga vigente.
- Solo `confirmarVentaBodegaV1` puede materializar venta, caja, inventario y
  auditoría de venta. El vendedor consume la autorización en la misma
  transacción idempotente.
- Las ventas iniciadas por `admin` usan el comando canónico directo y requieren
  permiso explícito `sell`; no pasan por autoaprobación. Esto habilita la
  operación de Diana como administradora y vendedora sin crear una segunda
  identidad o confiar autoridad financiera al cliente.
- En el corte de la aceptación se planificó implementar cuatro callables sin Secrets dentro del `saas-bodega`
  existente: crear solicitud, consultar solicitudes según rol, aprobar/rechazar
  y cancelar una solicitud propia no ejecutada. No cambia Firebase manifest ni
  la frontera de despliegue.

## Reconciliación documental

ADR-SAAS-041 conserva su historial; su exclusión de pedidos persistentes queda
limitada por ADR-SAAS-062 a no incluir solicitudes previas a la venta para
aprobación. ADR-SAAS-042 continúa como única autoridad atómica de venta y recibe
solo la referencia no autoritativa de la solicitud aprobada para `vendedor`.
No se introduce despacho, reserva, crédito, entrega parcial, facturación
electrónica ni producción.

## Gates y evidencia pendiente

En el corte de aceptación, la decisión reabrió `GATE B — IMPLEMENTACIÓN`. La certificación F/G/H existente
es válida para el flujo anterior, pero no demuestra el nuevo control de
aprobación. Después de implementar e integrar ADR-SAAS-062 deben repetirse las
pruebas afectadas de F, el rehearsal G y la certificación H antes de crear o
configurar el tenant real en Gate I. Gate I continúa pendiente: ni la oferta de
1.600.000 COP ni el tenant real están persistidos.

## Mutation audit de la aceptación documental

- Código funcional y tests: `0`.
- Commits, push, PR y merge: `0` al redactar esta evidencia; se tramitan por el
  PR documental correspondiente.
- Deploy, tráfico, Functions, Firestore, Auth, Rules, IAM, Secrets: `0`.
- Bootstrap, Activation, fixtures nuevos, tenant real y producción: `0`.

## Reconciliación post-merge — PR #461 (2026-10-06)

La implementación autorizada por ADR-SAAS-062 quedó integrada en `main` por
PR #461. HEAD del PR: `e7d028a25300117bf1dec800fc01905dff9fdb49`; merge commit:
`d5cd66e5bc02a06bcb5c318fce989e75e897c8bc`. Los checks del PR pasaron y el CI
post-merge de `main`, run `37516562659`, terminó `success`. El E2E de CI
comprobó en Emulator la secuencia solicitud, aprobación y venta canónica.

Gate B queda completado para la implementación y su CI. Esto no certifica el
flujo en staging: las cuatro nuevas callables no aparecen en el inventario
remoto de `micafe-pos-staging`. Por ADR-SAAS-062 deben reabrirse las
validaciones staging afectadas de Gate F, repetirse el rehearsal G y emitirse
una nueva certificación H después de superar el preflight C y el deploy D.
Gate I continúa pendiente; esta implementación no registra la oferta, no
crea/configura el tenant real ni autoriza producción.

### Evidencia local de Gate B

En `functions-bodega` con Node.js `v22.23.2` y npm `10.9.8`:

| Comando | Resultado |
| --- | --- |
| `npm run build` | PASS (`tsc -p tsconfig.json`). |
| `npm test` | PASS: 2/2, 0 fallos, 0 skips. |
| `npm run test:discovery` | PASS: 1/1; diez callables Gen 2, `us-central1`, cero Secrets. |
| `npm run test:module-load` | PASS: 1/1; sin I/O de Firestore/Auth/Secrets durante module-load. |

El CI post-merge incluye además `Build, pruebas, discovery y module-load del
codebase Bodega` y `E2E Bodega — solicitud, aprobación y venta canónica`, ambos
`success`.

### Estado remoto read-only al 2026-10-06

`micafe-pos-staging` tiene seis callables `saas-bodega` activas, todas
`us-central1`/Node.js 22, con 100 % del tráfico en la revisión lista y cero
referencias de Secret en variables/volúmenes de Cloud Run. No están presentes
las cuatro callables nuevas de ADR-SAAS-062. La revisión de la venta canónica
es `confirmarventabodegav1-00003-cud`, creada el `2026-10-03T09:23:50Z`.
Esta lectura no alteró Firebase ni sus datos.

### Mutation audit de esta reconciliación

- Lecturas de GitHub, Vercel, Firebase Functions y Cloud Run: solo lectura.
- Build/tests locales: solo artefactos ignorados de `functions-bodega`.
- Firebase deploy, Functions, tráfico, Firestore, Auth, Rules, IAM, Secrets,
  fixture, Bootstrap, Activation, tenant real y producción: `0`.
