# G-SAAS-02 — Preflight read-only vigente contra `origin/main` — 2026-08-14

- **Observación:** `2026-08-14T23:17:32Z`
- **Proyecto:** `micafe-pos`
- **Tenant:** Café Atrato — `1ae0rD9H8t3ZFSBKrrHR`
- **SHA observado:** `origin/main @ 83aa5c2a08fcbcf3bef85dd3d1d11ad66a7525a6`
- **Decisión:** `G-SAAS-02-PO-DECISION-CIERRE-ANTICIPADO-2026-08-14`
- **ADR:** `ADR-SAAS-032-cierre-anticipado-trial-historico.md`

## Resultado

La ejecución fue estrictamente read-only:

```text
readOnly=true
productionWrites=false
commandExecutionAllowed=false
status=BLOQUEADO
readyForCanonicalCommands=false
```

Todos los controles de identidad, contrato histórico, plan anual, configuración
histórica y release quedaron en `PASS`. La callable productiva
`consultarContextoPlataforma` verificó el UID de operador
`lNTK76Nf2TO5PSAOFPeHJx6PLRZ2`, estado `ACTIVO`, versión de autorización `1` y
las facultades `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR`, con HTTP `200`.

La sesión Firebase fue efímera, se entregó fuera del repositorio y no se
guardó en la evidencia. No se modificaron contraseñas, claims persistentes,
membresías ni datos del tenant.

## Estado del tenant

- Empresa `activa`, revisión `2`.
- Suscripción raíz `trialing`, `mvp_comercial` v1, revisión `1`.
- Trial histórico `2026-08-03` a `2026-09-02`.
- Snapshot contractual raíz ausente.
- Configuración histórica con siete capacidades.
- Plan anual v2 publicado, `ANUAL`, `1.800.000 COP`, nueve capacidades.
- Relación contractual anual inexistente.

## Único bloqueo restante

`RECOVERY_EVIDENCE_MISSING` continúa bloqueando cualquier escritura:

- el schedule diario de 35 días existe con ID
  `fa16b7c4-ecb8-418f-bf3a-815da592fabc`;
- el listado REST y `firebase firestore:backups:list` siguen devolviendo cero
  backups observables;
- por tanto todavía no hay atestación independiente, restore aislado ni RPO/RTO
  medidos.

El smoke productivo independiente de la aplicación sigue siendo un gate
separado y tampoco se declara cumplido por este preflight.

## Escrituras

Ninguna. No se canceló el Trial histórico, no se creó relación anual, no se
modificó la Empresa y no se cambió la configuración.

## Siguiente acción

Cuando el primer backup sea observable, ejecutar el restore guardado hacia una
base nueva con prefijo `gsaas02-recovery-`, verificar integridad y aislamiento,
medir RPO/RTO, publicar la atestación y repetir este preflight. Solo entonces
se ejecutará la secuencia canónica de cierre anticipado y materialización del
Trial anual.
