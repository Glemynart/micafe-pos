# ADR-SAAS-023 — Operaciones de salón y cocina server-authoritative

- **Estado:** ACEPTADO
- **Fecha:** 2026-08-04
- **Decision makers:** Lead Engineer; propietario del Goal
- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial
- **Milestone:** línea paralela del núcleo POS reusable
- **Epic:** `E2.7` — Salón y cocina
- **Backlog:** `P1-04`
- **Relacionados:** `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`, ADR-SAAS-001, ADR-SAAS-015, ADR-SAAS-018

> Este ADR resuelve una brecha arquitectónica detectada antes de implementar
> P1-04. Su aceptación autoriza únicamente el PR de implementación de P1-04;
> no autoriza despliegues ni escrituras en producción.

## 1. Contexto y problema

El repositorio ya dispone de UI y servicios para mesas, cuentas múltiples,
comandas y cocina. Sin embargo, las mutaciones críticas todavía se ejecutan
directamente desde el cliente:

- `pedidos_activos` permite crear, actualizar y eliminar desde el cliente;
- `comandas_cocina` permite crear desde caja y actualizar desde cocina;
- separar, unir y trasladar cuentas usan transacciones del SDK cliente;
- el actor (`cajeroId`) se recibe como argumento del cliente;
- no existe un recibo de comando ni una auditoría server-side para estas
  operaciones;
- los reintentos de separar, unir o trasladar no devuelven un resultado estable
  de la intención original;
- no existe una suite reusable de concurrencia para estos flujos.

Las Firestore Rules actuales protegen tenant y rol, pero no pueden garantizar
por sí solas la relación entre pedido, mesa, comanda, actor, estado, transición,
reintento y consistencia de todos los documentos involucrados.

Certificar P1-04 sin resolver esta frontera declararía como comercial una
operación que todavía depende de autoridad cliente.

## 2. Drivers de la decisión

1. El SaaS debe poder operar salón y cocina de forma reusable para cualquier
   tenant.
2. Las operaciones deben conservar la frontera server-authoritative de R1.
3. La separación, unión y traslado deben ser atómicos y no perder ni duplicar
   líneas o comandas ante concurrencia o reintento.
4. El actor, tenant, rol efectivo y lifecycle deben derivarse de la sesión y de
   fuentes canónicas del backend, nunca del payload.
5. La confirmación de la venta y sus efectos financieros continúa perteneciendo
   a las callables existentes, en especial
   `aplicarEfectosVentaOperativaV1`.
6. La solución debe probarse completamente con Emulator, fixtures multi-tenant
   y CI, sin hardware, producción ni datos fiscales reales.
7. No se debe introducir un sistema de eventos, notificaciones, fiscalidad,
   offline ni un agregado ERP nuevo dentro de P1-04.

## 3. Alternativas consideradas

### A. Mantener las escrituras directas y reforzar únicamente las Rules

**Rechazada.** Las Rules no pueden resolver de forma completa la autoridad del
actor, la idempotencia durable, las transiciones de cocina, las relaciones
entre múltiples pedidos y comandas ni el plan de lecturas/escrituras de una
operación atómica.

### B. Callables server-authoritative reutilizando R1

**Recomendada.** Mantiene Firebase y el modelo de datos existente, conserva la
UX y extiende la autoridad ya aceptada mediante comandos, transacciones Admin
SDK, auditoría e idempotencia.

### C. Cola externa, microservicio o event sourcing completo

**Rechazada.** Introduce operación y latencia adicionales sin ser necesaria
para el MVP ni para las invariantes de salón/cocina.

## 4. Decisión propuesta

Adoptar la alternativa B: las mutaciones operativas de pedidos, comandas y
transiciones de cocina se ejecutarán mediante callables autenticadas que
reutilicen el envelope y las primitivas de R1.

El cliente conservará sus lecturas tenant-aware y su UX. Las acciones de la UI
expresarán intención; no escribirán directamente los documentos críticos.

El servidor deberá:

1. autenticar la llamada y resolver `empresaId`, actor, membresía, rol efectivo
   y lifecycle;
2. validar la intención y derivar datos autoritativos desde documentos
   canónicos;
3. leer todas las fuentes antes de escribir;
4. ejecutar una transacción Admin SDK con recibo, índice de idempotencia,
   hechos/proyecciones y auditoría;
5. devolver un resultado estable para replay de la misma intención;
6. rechazar conflictos de `commandId` o `idempotencyKey` con otra huella.

Las Rules deberán negar las escrituras directas del cliente sobre
`pedidos_activos` y `comandas_cocina`, manteniendo las lecturas tenant-aware y
los permisos de lectura necesarios para POS y cocina. El backend seguirá
escribiendo mediante Admin SDK.

La configuración administrativa del mapa de mesas (`mesas`) permanece fuera de
la autoridad de operaciones de cuentas y cocina en este corte. Su eventual
auditoría o migración no forma parte de P1-04.

## 5. Operaciones cubiertas

El PR derivado deberá cubrir únicamente las intenciones necesarias para el
criterio de aceptación de P1-04:

- crear o abrir una cuenta de mesa;
- agregar, modificar o retirar líneas de una cuenta abierta;
- enviar las líneas pendientes a cocina y crear su comanda;
- emitir una cancelación de cocina cuando corresponda;
- separar cuentas, incluyendo cantidades parciales;
- unir cuentas de la misma mesa;
- trasladar una cuenta a otra mesa válida del mismo espacio;
- avanzar una comanda por las transiciones de cocina permitidas.

El cierre por pago, la venta DEMO/FISCAL, el inventario, la tesorería y la
liquidación continúan bajo sus autoridades existentes. En particular, el
cliente no podrá cerrar un pedido como pagado: esa transición seguirá siendo
efecto de `aplicarEfectosVentaOperativaV1`.

## 6. Invariantes

- Toda operación resuelve el tenant desde la sesión, nunca desde un
  `empresaId` enviado como autoridad.
- El actor auditado se deriva del principal autenticado; un `cajeroId` enviado
  por el cliente no puede sustituirlo.
- Una cuenta pagada, cancelada o unificada no puede volver a operar.
- Separar, unir y trasladar son atómicos: no existe commit parcial entre
  pedidos, comandas y movimientos de cuenta.
- Una separación no duplica cantidades ni rompe la relación histórica de las
  comandas existentes.
- Una unión no modifica el contenido histórico de las comandas; solo actualiza
  su referencia operativa al pedido destino dentro de la transacción aprobada.
- Un traslado conserva la identidad del pedido y actualiza de forma atómica su
  ubicación y la ubicación denormalizada de sus comandas.
- Una comanda solo puede avanzar por transiciones permitidas; no puede
  retroceder desde un estado terminal.
- Todas las operaciones de salón son completamente idempotentes y seguras
  frente a reintentos, reconexiones y múltiples clientes concurrentes.
- Las transiciones de estado de pedidos y comandas siguen una máquina de
  estados válida y nunca permiten regresiones de estado.
- Un reintento con la misma intención devuelve el resultado original y no crea
  otra cuenta, comanda, movimiento ni auditoría confirmada.
- Un `commandId` o `idempotencyKey` reutilizado con otra huella se rechaza.
- Las operaciones de cocina no alteran precios, costos, inventario, finanzas ni
  snapshots de una venta.
- Una venta DEMO sigue siendo no fiscal y no puede convertirse posteriormente
  en FISCAL, conforme a ADR-SAAS-016.
- Los eventos/notificaciones de ADR-SAAS-018 no se producen ni implementan como
  parte de este PR; podrán consumir hechos confirmados en un PR posterior.

## 7. Alcance del PR derivado

### Incluido

- callables y servicios cliente para las operaciones cubiertas;
- reutilización de envelope, recibo, índice, auditoría y resolución tenant de
  R1;
- cierre de escrituras directas mediante Rules;
- pruebas unitarias de invariantes y transacciones;
- Emulator con al menos dos tenants, dos actores y concurrencia controlada;
- replay, conflicto de idempotencia y aislamiento tenant;
- pruebas de Rules para lecturas permitidas y escrituras directas denegadas;
- E2E reusable de POS, salón y cocina sin producción.

### Fuera de alcance

- rediseño visual del POS, mapa o navegación;
- reservas, Wompi, impresión, Electron u offline;
- notificaciones FCM y dispatcher de eventos;
- fiscalidad, DIAN, numeración o CUFE;
- inventario, finanzas o autoridad de venta nuevas;
- migraciones, dual-write o reparación masiva de pedidos históricos;
- escrituras en producción.

## 8. Compatibilidad, despliegue y rollback

- Se conservan los documentos y campos operativos existentes; no se cambia la
  semántica comercial de pedidos o comandas.
- No se ejecuta migración ni dual-write.
- La UI cambia su transporte de escritura a callable antes de activar las Rules
  restrictivas.
- El rollback debe revertir conjuntamente cliente, Functions y Rules, sin
  reabrir una autoridad cliente después de confirmar el corte.
- Los datos históricos no se reescriben como parte del PR.

## 9. Validación requerida tras la aceptación

- `npx tsc --noEmit`;
- `npm run build`;
- `npm run build:functions`;
- `npm run test:auth-foundation`;
- Rules tenant-aware y matriz de roles;
- Emulator multi-tenant para cada operación cubierta;
- concurrencia de dos operadores sobre la misma cuenta;
- replay y conflicto de idempotencia;
- fallo transaccional sin efectos parciales;
- E2E sin errores de consola, Rules, 401, 403 o 404;
- evidencia de que no se escribió en producción.

## 10. Consecuencias

### Positivas

- Salón y cocina quedan alineados con la frontera de autoridad del SaaS.
- Las operaciones son reutilizables y auditables para futuros tenants.
- Se conserva la UX existente y se evita introducir un sistema externo.
- P1-04 puede certificarse sin hardware ni datos fiscales.

### Negativas

- Requiere nuevas callables y pruebas de Rules.
- La certificación no puede ejecutarse como un simple smoke de UI.
- El corte exige coordinar cliente, backend y Rules en el mismo PR de
  implementación.

## 11. Estado de decisión

Este documento queda en estado **ACEPTADO** por aprobación explícita del
propietario del Goal. La implementación queda limitada a P1-04 y debe respetar
las invariantes, el alcance y las exclusiones definidos aquí.
