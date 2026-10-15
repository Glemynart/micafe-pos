# ADR-SAAS-081 — Pausa técnica de compras durante un corte de Rules

## Estado

**ACEPTADO — 2026-10-14.**

- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial` / Gate I.
- **Decisor:** responsable del proyecto, autorización explícita registrada en la conversación de ejecución.
- **Relacionados:** ADR-SAAS-021, ADR-SAAS-071, ADR-SAAS-072, ADR-SAAS-075, R1 §§7 y 9.
- **Límite:** aceptar este ADR autoriza el cambio técnico y sus pruebas. No autoriza deploy de Functions, Rules o Vercel, smoke productivo, cambios de IAM/Secrets, ni datos de tenants.

## Decisión

Se adopta la **Opción 1: control server-authoritative por tenant para compras**.

`controles_release_compras/{empresaId}` es el documento canónico con:

- `empresaId` inmutable;
- `estado`: `ACTIVA` o `PAUSADA`;
- `revision` monotónica;
- `motivoCodigo`, `correlationId`, actor y timestamps de servidor;
- esquema versionado.

No hay estado implícito. Su ausencia, una revisión inválida o una forma ambigua
fallan cerradas para nuevas compras. El documento se inicializa explícitamente
mediante la transición de revisión esperada `0 → 1`.

La callable de plataforma `transicionarPausaComprasSaas` exige la facultad nueva
`RELEASE_COMPRAS_GOBERNAR`, que no se asigna por bootstrap. El comando es
idempotente por `commandId` e `idempotencyKey`, exige `expectedRevision`, deja
recibo y obligación de auditoría durable, y no altera `Empresa.estado` ni el
lifecycle comercial.

Las callables de compra leen el mismo documento dentro de la transacción que
materializa compra, inventario, ledger y recibo. Durante `PAUSADA`:

- una compra nueva devuelve `COMPRAS_EN_CORTE` y no escribe efectos;
- un replay cuyo recibo ya está confirmado devuelve solo ese resultado, sin
  efectos nuevos;
- un reintento sin recibo vuelve a ser rechazado;
- una modificación concurrente del control provoca el reintento normal de la
  transacción Firestore antes de confirmar.

Firestore Rules consulta el documento para negar escrituras directas de
`/compras` mientras el control no sea `ACTIVA`; el cliente no puede leer ni
escribir el control. Las escrituras offline se evalúan al sincronizar, por lo
que no reciben una excepción local.

## Alternativas descartadas

1. **`suspendida` de lifecycle:** bloquea ventas, inventario, caja y otros
   dominios; no es una pausa mínima y cambia estado comercial.
2. **Corte manual:** no impide llamadas directas, reintentos ambiguos ni
   sincronización offline. Solo podría usarse como excepción operativa con
   autorización específica; no es el mecanismo de este ADR.

## Recuperación y release

La reanudación es explícita, auditada y protegida por revisión. Si el control
venía de `PAUSADA`, el comando exige una atestación de `functionArtifactSha`,
`rulesetHash` y `releaseReferencia`, que se conserva junto al control y la
auditoría. Ante hash, Rules, cliente o verificación incompatible, el control
permanece `PAUSADA` y se aplica un forward-fix. Está prohibido restaurar
automáticamente una Ruleset que vuelva a permitir escrituras directas de compra.

El release requiere, como operaciones distintas y autorizadas por separado:

1. desplegar Functions con el guard y la callable de control;
2. inicializar los controles de los tenants alcanzados por el corte;
3. pausar por callable y verificar el estado/revisión;
4. desplegar Rules; verificar la denegación directa y la callable;
5. reanudar solo tras las comprobaciones posteriores;
6. conservar `PAUSADA` y hacer forward-fix si una comprobación falla.

No se inventan operadores, ventana ni tenants objetivo: se designan antes del
release. DIAN, catálogo, bootstrap y Trial no forman parte de esta decisión.

## Pruebas exigidas

- control con facultad específica, auditoría, idempotencia y revisión;
- compra nueva, replay confirmado y replay sin recibo durante pausa;
- reanudación, aislamiento tenant y ausencia/forma inválida fail-closed;
- Rules Emulator para bypass directo y mutación cliente del control;
- build de Functions y suites afectadas antes de cualquier PR o deploy.
