# G-SAAS-02 — Evidencia read-only de release — `origin/main @ 53ed743`

## Resultado

La recolección se ejecutó el 2026-08-14 contra `origin/main` y el proyecto
productivo `micafe-pos`, sin credenciales ni escrituras productivas.

```text
observedAt: 2026-08-14T07:08:43.468Z
targetSha: 53ed743ba9d1467afa6588740c02c5f7f229b2d5
status: INCOMPLETE
readOnly: true
productionWrites: false
```

## Gates observados

| Gate | Estado | Evidencia |
|---|---|---|
| `origin/main` coincide con el objetivo | PASS | SHA `53ed743ba9d1467afa6588740c02c5f7f229b2d5` |
| CI para el objetivo | PASS | Run `31777951408`, `success`, head SHA coincidente |
| Vercel | PASS | Deployment del objetivo en estado `success` |
| Functions | PASS | 74/74 activas, todas en Node.js 22 |
| Hashes de Functions | PASS | 3 hashes observados; distribución 3, 12 y 59; mapa por Function reconciliado |
| Rules independiente | MISSING | El collector no obtuvo una atestación independiente para este objetivo |
| Storage independiente | MISSING | El collector no obtuvo una atestación independiente para este objetivo |
| Smoke productivo independiente | MISSING | No existe cuenta/ventana segura ni ejecución autorizada |
| Recovery independiente | MISSING | No existe ensayo productivo de restore |
| `RECOVERY_POINT_OBSERVED` | MISSING | No se observó PITR, schedule ni backup disponible |

La ausencia de token `FIREBASE_ACCESS_TOKEN` solo impidió que el collector
revalidara Rules y Storage mediante la API; no se convirtió en un PASS
indirecto. La evidencia previa de postdeploy permanece histórica y no
sustituye una atestación independiente del release actual.

## Recovery observado

Las lecturas read-only de Firebase CLI confirmaron:

```text
location: southamerica-east1
pointInTimeRecovery: POINT_IN_TIME_RECOVERY_DISABLED
backupSchedules: 0
backups: 0
```

No se ejecutaron comandos de habilitación, creación de schedules, backup ni
restore. ADR-SAAS-031 permanece `Propuesto` y `NO ACEPTADO PARA EJECUCIÓN`.

## Tenant de referencia

No se inició ni reinició ningún Trial y no se realizaron escrituras sobre
Café Atrato. El tenant conserva el Trial mensual histórico y la relación anual
no está materializada.

## Comando reproducible

```text
npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos --sha 53ed743ba9d1467afa6588740c02c5f7f229b2d5
```

El comando consulta GitHub, Vercel, Functions y recovery en modo read-only.
No imprime credenciales ni ejecuta deploy o escrituras de tenant.
