# ADR-SAAS-077 — Alcance vertical de lecturas Firestore del rol vendedor

## Estado

**Propuesto — requiere aprobación explícita.** No es una decisión aceptada y no
autoriza modificar ni desplegar Rules.

- **Fecha de propuesta:** 2026-10-14.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2` / Gate I.
- **Decisor:** responsable del proyecto.
- **Recomendación técnica:** Lead Engineer.
- **Relacionado:** ADR-SAAS-041, ADR-SAAS-069 y ADR-SAAS-072.
- **Límite:** esta propuesta no cambia código, Rules, datos, producción ni
  configuración de tenant. La implementación requiere que el responsable
  acepte una opción y un PR separado; cualquier deploy conserva sus gates y
  autorización operativa propios.

## Contexto

La política Bodega MVP-1 usa el rol `vendedor` con una superficie dedicada. Los
ADRs 041 y 069 mantienen catálogo base, presentaciones y operaciones críticas
tras callables con DTOs; las Rules impiden que el vendedor de Bodega lea
directamente datos que deben pasar por esas fronteras.

El código también conserva `GENERAL + vendedor -> LEGACY` en
`lib/bodega/ui-contract.ts`. Esa superficie genérica lee directamente datos de
Firestore: la venta se suscribe a `/productos` y `/clientes`, el historial a
`/ventas`, y el flujo de turnos consulta `/turnos`. En cambio, varias reglas de
`firestore.rules` aplican `!esVendedor()` solo por rol y no limitan el rechazo a
`BODEGA_MVP1`. Al desplegar esa fuente, un vendedor de un tenant `GENERAL` que
use esas pantallas perdería lecturas que el ruleset productivo actual permite.

La revisión de `micafe-pos` encontró el ruleset activo
`d5e205db-0ab4-4db1-b5ec-1534bee39d35`, que conserva las lecturas amplias de
producción. En el source de `main`, además de las diferencias de escritura
Bodega, los bloqueos de lectura por rol alcanzan `/productos`, `/ventas`,
`/clientes` y `/movimientos_inventario`; `/turnos` se limita al turno propio.
La UI genérica y el policy de superficie muestran un posible consumidor legado
para ese mismo rol.

Las pruebas actuales de Rules verifican restricciones del vendedor Bodega,
pero `firestore-rules/role-invariants.test.ts` no siembra
`configuraciones/{empresaId}` en esos casos. Por ello sus fixtures no comparan
`BODEGA_MVP1` con `GENERAL` ni prueban la compatibilidad del vendedor legado.
El Gate I no debe publicar el ruleset completo hasta resolver ese alcance y
probarlo.

## Problema y decisión requerida

¿Cómo limitar el acceso directo del vendedor Bodega a los datos de negocio sin
interrumpir el contrato del POS legado en otros verticales, o se debe migrar
primero ese POS para aplicar una política global de no-lectura directa?

## Invariantes

- El aislamiento por `empresaId` se mantiene en todas las opciones.
- Bodega conserva sus fronteras server-authoritative aprobadas: el vendedor no
  accede a productos/costos/presentaciones/ventas ajenas o ledger por lecturas
  directas que evadan las callables/DTOs diseñados para su vertical.
- Las opciones no alteran las escrituras de categorías y compras que ya tienen
  guardas verticales bajo ADR-SAAS-072.
- No se despliega Rules hasta certificar el cliente compatible, la callable
  legacy de compras y la matriz de impacto del proyecto correspondiente.

## Opciones

### Opción 1 — Acotar las restricciones de lectura Bodega por vertical

Aplicar las denegaciones directas requeridas al vendedor únicamente cuando el
tenant tenga `vertical == 'BODEGA_MVP1'`. Para `GENERAL` y otros verticales se
conserva el contrato vigente de sus clientes hasta que una migración posterior
sea aprobada y certificada. Los paths sin consumidor legado confirmado se
clasifican en una matriz antes de decidir si necesitan la misma excepción.

**Ventajas:** mantiene el alcance de E2.2; preserva las pantallas genéricas
actuales; el corte Bodega queda explícitamente tenant/vertical-aware.

**Costes:** mantiene en verticales legados el acceso de lectura que ya permite
producción; aplaza su endurecimiento hasta migrar sus consumidores.

### Opción 2 — Mantener la política global y migrar los clientes legados

Conservar las denegaciones para todo usuario `vendedor` y migrar antes los
consumidores de `GENERAL` a callables/DTOs apropiados para catálogo, clientes,
ventas e historial de turnos.

**Ventajas:** reduce las lecturas cliente y unifica la política una vez migrados
todos los consumidores.

**Costes:** amplía el alcance de E2.2 a los clientes de otros verticales; no se
puede hacer un corte parcial sin romper pantallas. Requiere diseño, pruebas y
planificación separados para cada lector afectado.

### Opción 3 — Introducir una capacidad de acceso distinta del rol

Separar autorización de lectura mediante una capacidad/permiso explícito
tenant-aware en lugar de inferirla del nombre del rol `vendedor`.

**Ventajas:** expresa el permiso con más precisión que un rol compartido entre
verticales.

**Costes:** introduce un nuevo contrato de autorización y sincronización de
claims/membresías, con migración de plantillas, reglas, callables, clientes y
pruebas. Amplía más el alcance y las dependencias de Gate I.

## Recomendación

Se recomienda la **Opción 1** para el corte de Gate I: las restricciones de
lectura aprobadas para Bodega deben depender del vertical, como las reglas de
escritura de categorías y compras. Esto conserva `GENERAL + vendedor -> LEGACY`
y no transforma la certificación Bodega en una migración global no aprobada.
La revisión de acceso de lectura en los otros verticales debe quedar como
trabajo separado, no como autorización implícita para perpetuarla.

La recomendación no equivale a aceptación. Hasta recibir una opción explícita,
no implementar ni desplegar el cambio.

## Consecuencias si se acepta la Opción 1

- Se mantiene el contrato de lectura vigente de `GENERAL` y otros verticales.
- El vendedor Bodega continúa sin lectura directa de las colecciones cubiertas
  por su flujo de callables/DTOs.
- Debe existir una suite Emulator con fixtures distintos para `GENERAL` y
  `BODEGA_MVP1`, incluyendo lectura permitida/denegada, aislamiento entre
  tenants y pruebas de los consumidores genéricos.
- La matriz de los demás paths distintos entre Rules remoto y `main` permanece
  como precondición del corte productivo; aceptar esta opción no certifica el
  ruleset completo.

## Validación previa a cualquier implementación

1. Enumerar consumidores de cada path con diferencia de Rules y asociarlos a
   vertical, rol y superficie.
2. Añadir fixtures explícitos de configuración `GENERAL` y `BODEGA_MVP1`; no
   inferir el vertical a partir del nombre del test o del rol.
3. Probar el flujo de venta/consulta legado `GENERAL + vendedor` y sus límites
   tenant-aware en Emulator.
4. Probar que `BODEGA_MVP1 + vendedor` sigue usando las callables aprobadas y
   no puede leer los datos base protegidos directamente.
5. Completar el preflight y plan de rollback por proyecto antes de cualquier
   publicación de Rules.

## Fuera de alcance

- Modificar la política global de todos los roles o verticales.
- Migrar el POS genérico a callables.
- Cambiar el contrato de membresías, claims, catálogo o modelo de datos.
- Aceptar el ADR, desplegar Rules/Functions/Vercel o escribir datos de
  producción.

## Referencias

- [ADR-SAAS-041 — Bodega MVP-1](ADR-SAAS-041-bodega-mvp1-contado-presentaciones.md)
- [ADR-SAAS-069 — Sincronización viva Bodega](ADR-SAAS-069-bodega-sincronizacion-viva.md)
- [ADR-SAAS-072 — Corte seguro de compras Bodega](ADR-SAAS-072-corte-seguro-compras-bodega.md)
- `firestore.rules`
- `firestore-rules/role-invariants.test.ts`
- `lib/bodega/ui-contract.ts`
- `lib/productos-service.ts`, `lib/clientes-service.ts`, `lib/ventas-service.ts` y
  `lib/turnos-service.ts`
- [PR #590 — evidencia de Gate I y comparación read-only de Rules](https://github.com/Glemynart/micafe-pos/pull/590)
