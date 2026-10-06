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
- Se implementarán cuatro callables sin Secrets dentro del `saas-bodega`
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

La decisión reabre `GATE B — IMPLEMENTACIÓN`. La certificación F/G/H existente
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
