# ADR-SAAS-014 — Trial para una Empresa existente

## Estado

Aprobado — aprobado explícitamente por el responsable el 2026-08-02.

## Fecha

2026-08-02

## Contexto

P0-01 de `G-MVP-01` debe dejar certificable el tenant productivo de Café
Atrato. La Empresa `1ae0rD9H8t3ZFSBKrrHR` ya existe y está activa, y su
Configuración B1 ya existe. Sin embargo, no tiene un documento canónico en
`suscripciones/{empresaId}`.

El negocio ha confirmado que la suscripción inicial debe ser un Trial de 30
días. La ruta actual de Bootstrap crea Empresa, Configuración, espacio,
membresía, numeración y Trial dentro de una única transacción, pero rechaza una
Empresa existente con `EMPRESA_ALREADY_EXISTS`. Reutilizar Bootstrap, por
tanto, no es una migración válida para el tenant fundacional.

El dominio B3 ya contiene la primitiva atómica
`crearSuscripcionTrialEnTransaccion`, pero el catálogo de comandos de plataforma
solo expone `CrearSuscripcionActiva`. Una escritura directa o un script nuevo
que edite `suscripciones` evitaría la autoridad comercial, la auditoría, la
idempotencia y el control de revisiones definidos por B3.

La evidencia productiva actual también muestra que el único plan publicado
(`basico`, versión 1) declara capacidades históricas `VENTAS` e `INVENTARIO`,
que no coinciden literalmente con los IDs de módulos B1 (`sell`, `inventory`,
etc.). La selección del plan y sus capacidades se resolverá como dato
comercial aprobado de P0-01; este ADR no publica ni modifica ningún plan.

## Alcance y restricciones

- Aplica únicamente a la creación inicial de la Suscripción Trial de una
  Empresa existente que no tenga Suscripción.
- No crea ni modifica Empresa, Configuración, espacios, categorías,
  numeración, membresías, claims o credenciales.
- No cambia el estado de lifecycle de la Empresa; P0-01 conserva el estado
  actual `activa` salvo una decisión de producto posterior.
- No ejecuta escrituras productivas sin confirmación explícita del responsable.
- No resuelve la identidad fiscal definitiva, que corresponde al administrador
  del tenant y a P0-02.

## Alternativas consideradas

### A. Usar `CrearSuscripcionActiva` con un periodo de 30 días

Se rechaza. Representaría el contrato como `active`, no como `trialing`, y
perdería la semántica, los gates y la expiración propios del Trial confirmado
por el negocio.

### B. Reintentar Bootstrap sobre el tenant existente

Se rechaza. El servicio lo bloquea expresamente y, aunque se forzara, mezclaría
la creación de un núcleo nuevo con un tenant que ya tiene datos, contradiciendo
la idempotencia y la separación entre Bootstrap y backfill.

### C. Escribir `suscripciones/{empresaId}` mediante una migración directa

Se rechaza. Bypassearía la autoridad de B3, los registros de comando y evento,
la obligación de auditoría de plataforma y las protecciones de idempotencia.

### D. Exponer `CrearSuscripcionTrial` para una Empresa existente

Es la opción recomendada. Reutiliza la primitiva B3 existente, mantiene la
facultad `COMERCIAL_GOBERNAR`, registra auditoría y evento, verifica una
versión de Plan publicada y crea únicamente la Suscripción faltante dentro de
una transacción idempotente.

## Decisión propuesta

Añadir el comando de plataforma `CrearSuscripcionTrial` como una operación
comercial explícita para una Empresa existente.

La operación deberá:

1. exigir `empresaId`, `planId`, `planVersion` y `trialDias` aprobados;
2. derivar `trialInicio` y `trialFin` con el reloj del servidor;
3. exigir una versión de Plan `PUBLICADA`;
4. exigir que la Empresa exista en estado operativo (`trial` o `activa`);
5. rechazar si ya existe una Suscripción, sin sobrescribirla;
6. crear una única Suscripción `trialing` con revisión 1;
7. reutilizar la primitiva B3 y el mecanismo de auditoría/idempotencia vigente;
8. no tocar ningún otro agregado del tenant;
9. permitir la cancelación auditada mediante la transición existente, sin
   borrar el documento para hacer rollback.

El valor de negocio confirmado para P0-01 será `trialDias = 30`. El comando
solo podrá ejecutarse contra producción después del gate operativo y de una
confirmación explícita.

## Consecuencias

### Positivas

- Permite completar el contrato comercial de un tenant preexistente sin
  reejecutar Bootstrap.
- Conserva una sola autoridad para la Suscripción y una sola forma de auditar
  la mutación.
- Hace reusable el flujo para futuros tenants preexistentes que requieran una
  regularización comercial equivalente.
- Mantiene separado el Trial comercial de la configuración fiscal definitiva.

### Negativas y riesgos

- Añade un comando de plataforma y una superficie que debe protegerse con
  `COMERCIAL_GOBERNAR`.
- Debe evitarse que el comando se convierta en una vía para reabrir Trials
  cancelados o duplicar Suscripciones.
- Requiere que exista previamente un Plan publicado cuyas capacidades sean
  compatibles con el catálogo B1; este ADR no resuelve la oferta comercial.
- La creación de la Suscripción no garantiza por sí sola login, configuración
  fiscal, módulos, espacios ni readiness completa.

## Plan de implementación posterior a la aprobación

1. Añadir el tipo al catálogo de comandos y la traducción de operaciones.
2. Implementar la envoltura transaccional sobre la primitiva B3 existente.
3. Cubrir validación, idempotencia, conflicto de revisión, plan no publicado,
   Suscripción duplicada y tenant no operativo.
4. Ejecutar typecheck, build de Functions y las suites B3/plataforma afectadas.
5. Auditar el PR con resultado binario antes de cualquier ejecución real.
6. Preparar un dry-run read-only y solicitar confirmación explícita antes de
   crear el Trial productivo.

## Rollback

No se borrará la Suscripción ni se editará directamente. Si la ejecución
confirmada debe revertirse, se utilizará la transición comercial auditada a
`canceled`, conservando la evidencia y el documento original.

## Decisión aprobada

La aprobación explícita recibida habilita la implementación de
`CrearSuscripcionTrial` conforme a este ADR. La ejecución productiva permanece
prohibida hasta recibir una confirmación separada justo antes de la escritura.

## Referencias

- `ADR-SAAS-003-suscripciones-ciclo-vida.md`
- `ADR-SAAS-007-bootstrap-empresarial.md`
- `ADR-SAAS-013-bootstrap-primer-administrador-tenant.md`
- `MT-U6-U8-B0-contratos-invariantes-dominio.md`
- `INVESTIGACION-AUTH-RECUPERACION-CONFIG.md`
- `docs/goals/P0-01-CERTIFICACION-DATOS-INICIALES.md`
