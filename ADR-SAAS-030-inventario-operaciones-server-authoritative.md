# ADR-SAAS-030 — Cutover server-authoritative de inventario, ajustes y mermas

## Estado

**Propuesto.** Este ADR documenta una divergencia encontrada en la auditoría
global de G-SAAS-02. No autoriza todavía cambios de código, Rules, migraciones,
despliegues ni escrituras productivas.

- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M3 / E3.1-E3.2`
- **ADRs relacionados:** `ADR-SAAS-019`, `ADR-SAAS-021`, `ADR-SAAS-023`
- **Diseño relacionado:** `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`

## Contexto

La auditoría de `origin/main @ 54c1d0c` confirma que ventas y compras aplican
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

## Decisión pendiente

Evaluar y aceptar una autoridad única server-side para:

1. ajustes positivos y negativos de stock;
2. mermas/waste;
3. cambios de stock iniciados desde edición de productos e insumos.

Las mutaciones de metadatos de catálogo —nombre, precio, categoría y estado—
pueden conservar una ruta administrativa separada si no cambian existencias ni
ledger.

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

La alternativa B exige inventariar consumidores, definir contratos de comando,
mantener compatibilidad con documentos históricos, agregar tests de Functions,
Rules y Emulator, desplegar Functions antes del deny, y verificar rollback sin
editar ni borrar hechos históricos. No se debe cambiar `firestore.rules` para
denegar estas rutas antes de que el nuevo servicio cliente y sus comandos estén
desplegados y probados.

## Criterios para aceptar el ADR

- comandos y contratos de ajustes/mermas aprobados;
- autoridad de actor, tenant, lifecycle, secuencia, saldo e idempotencia
  definida en backend;
- separación explícita entre metadata de catálogo y stock;
- plan de compatibilidad y rollback sin mutar históricos;
- Rules y pruebas de Emulator cubren todos los roles y tenants;
- auditoría productiva read-only y smoke antes del cutover;
- aprobación explícita del Product Owner/arquitectura.
