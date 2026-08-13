# G-SAAS-02 — Evidencia de publicación del plan anual

- **Fecha de ejecución local:** 2026-08-12 (la evidencia de Firestore quedó estampada en UTC el 2026-08-13)
- **Proyecto:** `micafe-pos`
- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M2 / E2.1`
- **Tenant de referencia:** Café Atrato — `1ae0rD9H8t3ZFSBKrrHR`
- **Resultado:** publicación técnica del catálogo anual; **no inicia todavía el Trial anual**.

## Alcance autorizado

Se materializó y publicó la versión anual aprobada de `mvp_comercial`. El cambio fue aditivo y se ejecutó mediante la operación comercial server-side `ejecutarComandoComercial`, con el operador `lNTK76Nf2TO5PSAOFPeHJx6PLRZ2`, facultad `COMERCIAL_GOBERNAR`, preflight de revisión e idempotencia. No se escribió directamente ningún documento Firestore.

La publicación del plan no autoriza por sí misma una relación contractual nueva ni modifica el Trial mensual histórico. La transición de Café Atrato sigue sujeta a `ADR-SAAS-029` y a su implementación aceptada.

## Preflight

| Recurso | Estado antes de la ejecución |
|---|---|
| `planes/mvp_comercial` | `revision=1`, `versionActual=1` |
| `planes/mvp_comercial/versiones/1` | `PUBLICADA`, revisión 2, `MENSUAL`, siete capacidades históricas |
| `planes/mvp_comercial/versiones/2` | ausente |
| Operador | `ACTIVO`, `COMERCIAL_GOBERNAR`, autorización v1 |
| `suscripciones/1ae0rD9H8t3ZFSBKrrHR` | existente; no se usó para crear Trial |

## Comandos y resultado durable

1. `CrearNuevaVersionPlan`
   - `commandId`: `f8d064a7-8964-4aaf-a36a-d2d757bdb000`
   - `idempotencyKey`: `dd753aaf-a480-4dec-9483-bccdaae39179`
   - resultado: versión 2 creada como borrador.
2. `PublicarPlan`
   - `commandId`: `27a3481d-aaf5-4db3-94eb-12c9ad4219b0`
   - `idempotencyKey`: `410edfca-d2f3-407f-b614-7b320b3a6b45`
   - resultado: versión 2 publicada, revisión 2.

Ambos comandos tienen registros `auditoria_logs` con `origen=PLATFORM`, agregado `PLAN` y el UID del operador autorizado.

## Verificación posterior

- raíz `mvp_comercial`: `revision=2`, `versionActual=2`;
- v1 permanece `PUBLICADA`, `MENSUAL`, revisión 2 y con sus siete capacidades históricas;
- v2 está `PUBLICADA`, `ANUAL`, revisión 2, precio `{ importe: 1800000, moneda: "COP" }`, límites vacíos y exactamente:
  `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`, `shifts`, `cuentas_cobro`;
- suscripción de Café Atrato permanece `trialing`, `planVersion=1`, `trialInicio=2026-08-03`, `trialFin=2026-09-02`, `revision=1`, sin `snapshotContrato`;
- configuración permanece en revisión 3 con siete módulos históricos;
- los seis espacios históricos permanecen intactos;
- no se creó relación contractual anual ni se reinició el Trial.

## Estado de certificación

Esta evidencia **no certifica G-SAAS-02 completo** ni constituye el inicio del Trial anual. El Goal continúa abierto. Falta aceptar e implementar `ADR-SAAS-029`, cerrar canónicamente el Trial mensual sin mutarlo y materializar entonces la relación anual con snapshot inmutable, seguida de los 30 días reales, soporte, recuperación, evidencia y cierre contractual.

## Rollback

No se ejecutó rollback. Si la publicación resultara inválida, el rollback permitido es retirar v2 mediante el comando comercial canónico con revisión esperada; v1 y la suscripción/configuración históricas no se editan ni eliminan.