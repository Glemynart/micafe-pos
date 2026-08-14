# G-SAAS-02 — Preflight final read-only de transición — 2026-08-14

## Resultado

El preflight se ejecutó contra el proyecto `micafe-pos`, el tenant
`1ae0rD9H8t3ZFSBKrrHR` y `origin/main @
edede7ac600b0524ac15683b4356bce715c171e7`.

```text
observedAt: 2026-08-14T04:27:51.759Z
status: ESPERAR_VENTANA
readyForCanonicalCommands: false
readOnly: true
productionWrites: false
commandExecutionAllowed: false
```

## Findings

| Finding | Estado |
|---|---|
| Proyecto y tenant Café Atrato confirmados | PASS |
| Suscripción raíz histórica intacta | PASS |
| Trial mensual histórico aún abierto hasta `2026-09-02` | WAITING |
| Plan anual v2 publicado, `ANUAL`, `1.800.000 COP`, nueve capacidades | PASS |
| Configuración histórica de siete capacidades intacta | PASS |
| No existe relación contractual anual previa | PASS |
| Operador activo con facultades comerciales y de lifecycle | PASS |
| Evidencia de release declarada completa | PASS |
| Punto de recovery verificable | BLOCKER |

El resultado no autoriza `suspenderTrialVencido`,
`CrearRelacionContractualTrial`, `TransicionarEmpresa` ni la actualización de
configuración. La ventana histórica no se reinicia y no se modifican datos del
tenant antes de su cierre.

## Comando reproducible

```text
npx tsx scripts/g-saas-02/trial-transition-preflight.ts --project micafe-pos --tenant 1ae0rD9H8t3ZFSBKrrHR --as-of 2026-08-13 --main-sha edede7ac600b0524ac15683b4356bce715c171e7 --functions-hash ce73f42fa704c461257e87a809f45a264a7cbfc3 --ci-green true --rules-verified true --storage-verified true --vercel-verified true
```

El runner solo realiza lecturas `GET`, exige el token Firebase fuera del
repositorio y siempre emite `productionWrites: false`.
