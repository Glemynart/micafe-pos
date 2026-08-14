# G-SAAS-02 — Preflight read-only de transición — `origin/main @ 8f0fa6f`

## Resultado

La ejecución se realizó el 2026-08-14 contra el proyecto productivo
`micafe-pos` y el tenant de referencia Café Atrato
(`1ae0rD9H8t3ZFSBKrrHR`).

```text
contract: G-SAAS-02-TRIAL-TRANSITION-PREFLIGHT
observedAt: 2026-08-14T11:00:56.374Z
targetSha: 8f0fa6f7bfe3dbd20aa15598bbdb281448f079b6
asOf: 2026-08-14
status: ESPERAR_VENTANA
readyForCanonicalCommands: false
readOnly: true
productionWrites: false
commandExecutionAllowed: false
```

## Findings

| Finding | Estado |
|---|---|
| Proyecto `micafe-pos` confirmado | PASS |
| Tenant Café Atrato, país `CO`, confirmado | PASS |
| Suscripción raíz histórica intacta: plan v1, fechas originales, sin snapshot | PASS |
| Trial mensual histórico abierto hasta `2026-09-02` | WAITING |
| Plan anual v2 publicado: `ANUAL`, `1.800.000 COP`, nueve capacidades | PASS |
| Configuración histórica conserva siete módulos | PASS |
| No existe relación contractual anual previa | PASS |
| Operador activo con `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR` | PASS |
| Evidencia de release declarada completa | PASS |
| Punto de recuperación verificable antes de escribir | BLOCKER |

La evidencia independiente de Rules y Storage permanece en PR #296; el merge
posterior de PR #297 solo reconcilió documentación y no cambió runtime ni
producción. La evidencia de Functions conserva el mapa individual de las 74
Functions activas en Node.js 22.

## Decisión operativa

El resultado no autoriza `suspenderTrialVencido`,
`CrearRelacionContractualTrial`, `TransicionarEmpresa` ni la actualización de
configuración. Antes del `2026-09-02` el Trial histórico no se reinicia ni se
modifica el tenant.

El bloqueo de recovery sigue gobernado por ADR-SAAS-031, que permanece
`Propuesto` / `NO ACEPTADO PARA EJECUCIÓN`. No se habilitan PITR, schedules ni
restores hasta que exista una política aceptada con mecanismo, retención,
RPO/RTO, destino, responsable, rollback y costo definidos.

## Reproducibilidad

```text
npx tsx scripts/g-saas-02/trial-transition-preflight.ts --project micafe-pos --tenant 1ae0rD9H8t3ZFSBKrrHR --as-of 2026-08-14 --main-sha 8f0fa6f7bfe3dbd20aa15598bbdb281448f079b6 --functions-hash ce73f42fa704c461257e87a809f45a264a7cbfc3 --ci-green true --rules-verified true --storage-verified true --vercel-verified true
```

El runner solo realiza lecturas `GET`, exige el token Firebase fuera del
repositorio y emite `productionWrites: false` y
`commandExecutionAllowed: false`.
