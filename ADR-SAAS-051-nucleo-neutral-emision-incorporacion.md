# ADR-SAAS-051 — Núcleo neutral de emisión e incorporación de credenciales

## Estado

**PROPUESTO — PENDIENTE DE APROBACIÓN.**

Pertenece a `G-SAAS-02 → M2 → E2.2`. No autoriza implementación, despliegue,
reemisión, Bootstrap, Activation, fixture adicional ni producción.

## Problema y evidencia

ADR-SAAS-050 aisló el acceso de plataforma, pero su reemisión canónica depende
de `emitir-credencial-inicial`, que hoy arrastra `incorporaciones-service` y
superficies de auth, activación y configuración. Importarla desde
`saas-platform-tenant-access` viola su closure. Copiar el algoritmo violaría
las invariantes de hash, transacción, incorporación, idempotencia y auditoría.

## Decisión propuesta

Extraer un núcleo compartido, sin endpoints ni `defineSecret`, para: planificar
la emisión/reemisión, reservar código, emitir la credencial, reemplazar la
incorporación temporal y devolver el resultado transaccional. El núcleo recibe
por inyección pepper, principal, permisos, autoridad y auditoría; no crea
claims, no inicia sesión, no activa incorporaciones ni lee configuración Web.

Los adapters `saas-bootstrap` y la futura reemisión de
`saas-platform-tenant-access` conservarán sus contratos y enlazarán el Secret
correspondiente. La autoridad, envelope, auditoría e idempotencia permanecen
canónicas y únicas.

## Límites

Permitido: contratos de incorporación, reserva de código, emisión, hash,
transacciones y auditoría estrictamente necesarias. Prohibido: entrypoints,
Bootstrap completo, operational-auth completo, activation, configuración Web,
commercial, Bodega, Wompi, Dusema, email, recovery, schedules e I/O al cargar
módulos.

## Alternativas

1. Desplegar `saas-auth`: rechazada por closure no acotable.
2. Copiar/reimplementar emisión: rechazada por divergencia de invariantes.
3. Nuevo núcleo neutral: recomendada; conserva una única implementación.

## Migración y validación

La implementación deberá mover —no duplicar— la lógica neutral, mantener los
adapters legacy hasta el cutover y demostrar contratos, autoridad, aislamiento,
idempotencia, auditoría, hash, discovery, module-load, Secret closure y
rollback. Deploy y reemisión seguirán siendo gates posteriores separados.

## Consecuencias

ADR-050 podrá reutilizar el núcleo sin importar `saas-auth`; no se cambia el
contrato público ni el lifecycle del fixture. E2.2 permanece `EN EJECUCIÓN`.
