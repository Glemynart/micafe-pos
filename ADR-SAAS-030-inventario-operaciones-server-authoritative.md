# ADR-SAAS-030 — Cutover server-authoritative de inventario, ajustes y mermas

## Estado

**Aceptado — alcance acotado a G-SAAS-02.** La auditoría global confirmó una
divergencia P1 entre la arquitectura server-authoritative y las mutaciones de
stock/mermas del cliente. Se acepta la alternativa B para cerrar esa frontera.
Esta aceptación no autoriza escrituras productivas ni acepta el resto de R1;
autoriza únicamente la implementación, pruebas y despliegue controlado de los
comandos descritos en este ADR.

- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M3 / E3.1-E3.2`
- **ADRs relacionados:** `ADR-SAAS-019`, `ADR-SAAS-021`, `ADR-SAAS-023`
- **Diseño relacionado:** `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`

## Contexto

La auditoría y revalidación de `origin/main @ 3a02dbb` confirma que ventas y compras aplican
el ledger de inventario mediante Functions/Admin SDK. Sin embargo, permanecen
rutas cliente para mutaciones críticas:

- edición de stock de productos e insumos mediante transacción Firestore del
  navegador;
- creación de mermas y su movimiento de kardex mediante transacción cliente;
- `firestore.rules` permite actualmente crear `movimientos_inventario` a roles
  operativos y crear `mermas` a administradores.

El ledger es append-only y tiene validaciones útiles, pero una transacción
cliente no puede constituir la autoridad completa sobre actor, lifecycle,
secuencia, saldo, costo, idempotencia y auditoría. R1 describe la frontera
server-authoritative para inventario, ajustes y mermas, pero permanece como
`DISEÑO PROPUESTO` y sus textos no autorizan por sí solos un cutover.

## Decisión aceptada

Se adopta la alternativa B: una autoridad única server-side para:

1. ajustes positivos y negativos de stock;
2. mermas/waste;
3. cambios de stock iniciados desde edición de productos e insumos.

El contrato implementado es:

- `crearArticuloInventarioV1`: crea producto o insumo y, si recibe stock
  inicial, emite el primer ajuste y la proyección de stock en la misma
  transacción.
- `actualizarArticuloInventarioV1`: actualiza metadatos y transforma `stock`
  en una intención de stock objetivo; el servidor calcula el delta y emite el
  ajuste correspondiente.
- `registrarMermaOperativaV1`: recibe únicamente insumo, cantidad, motivo y
  notas; resuelve nombre, unidad, costo, espacio y actor en el servidor, y
  persiste merma, kardex, stock, secuencia, recibo idempotente y auditoría
  atómicamente.

Todos reciben el envelope R1 (`commandId`, `idempotencyKey`, `correlationId`,
`motivo` y `payload`). Empresa, actor, rol, membresía, lifecycle, artículo,
espacio, costo unitario, saldo, secuencia e identificadores de hechos se
resuelven o validan en Functions. El cliente no escribe `productos`, `insumos`,
`mermas` ni `movimientos_inventario`; las Rules quedan read-only para esas
colecciones.

## Alternativas

### A. Mantener escrituras cliente

No recomendada para el Trial: conserva compatibilidad inmediata, pero deja una
superficie de integridad crítica fuera de la autoridad server-side.

### B. Callables server-side por intención — recomendada

Crear comandos tenant-aware e idempotentes que resuelvan actor, membresía,
lifecycle y artículo en backend, ejecuten el ledger y la proyección de stock en
una sola transacción Admin SDK, y escriban auditoría. Después del cutover,
Rules deniega las escrituras cliente críticas y los servicios cliente solo
solicitan comandos.

### C. Reglas de campo sobre transacciones cliente

No recomendada: Rules no puede verificar de forma completa la relación entre
secuencia, saldo, costo, motivo, turno, idempotencia y el resto de efectos.

## Consecuencias y migración requerida

La migración conserva documentos históricos: no hace backfill destructivo ni
recalcula saldos legados. El orden de despliegue es Functions nuevas y cliente
compatible, pruebas de Functions/Rules/Emulator, verificación read-only del
release y después el deny de Rules. En este cambio ambos lados se versionan
juntos porque las Functions nuevas son backward-compatible con los documentos
existentes y el cliente deja de usar las escrituras antiguas antes del cambio
de Rules.

El rollback de código consiste en volver al SHA anterior únicamente si las
Rules anteriores siguen desplegadas; después del deny no se reabre la escritura
cliente. Los hechos ya creados se conservan y cualquier corrección se realiza
por un nuevo comando compensatorio. No se permite rollback por edición directa
de stock, secuencia, movimientos o mermas.

## Criterios para aceptar el ADR

- comandos y contratos de ajustes/mermas aprobados;
- autoridad de actor, tenant, lifecycle, secuencia, saldo e idempotencia
  definida en backend;
- separación explícita entre metadata de catálogo y stock;
- plan de compatibilidad y rollback sin mutar históricos;
- Rules y pruebas de Emulator cubren todos los roles y tenants;
- auditoría productiva read-only y smoke antes del cutover;
- aprobación explícita del Product Owner/arquitectura, registrada con la
  decisión de continuidad de G-SAAS-02 del 2026-08-14.

## Estado de implementación

La implementación se entrega en un PR separado del checkout histórico y debe
pasar CI, auditoría `APROBADO PARA MERGE`, deploy controlado y verificación
post-merge antes de considerarse integrada. La aceptación del ADR no cambia
ningún tenant productivo ni modifica por sí sola los datos de Café Atrato.
