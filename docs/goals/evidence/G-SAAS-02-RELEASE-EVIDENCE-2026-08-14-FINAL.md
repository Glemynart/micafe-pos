# G-SAAS-02 — Evidencia final read-only de release — 2026-08-14

## Resultado

La recolección final se ejecutó contra `origin/main @
edede7ac600b0524ac15683b4356bce715c171e7` y el proyecto productivo
`micafe-pos`.

```text
observedAt: 2026-08-14T04:25:19.373Z
targetSha: edede7ac600b0524ac15683b4356bce715c171e7
status: INCOMPLETE
readOnly: true
productionWrites: false
```

## Gates observados

| Gate | Estado | Evidencia |
|---|---|---|
| `origin/main` coincide con el objetivo | PASS | SHA objetivo observado en `origin/main` |
| CI post-merge | PASS | Run `31769104806`, `success` |
| Vercel | PASS | Deployment del SHA objetivo en estado `success` |
| Functions | PASS | 74/74 activas, todas en Node.js 22 |
| Hashes de Functions | PASS | 3 hashes observados: 3, 12 y 59 Functions; mapa individual completo |
| Firestore Rules | PASS | Fuente desplegada coincide; SHA `35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee` |
| Storage Rules | PASS | Fuente desplegada coincide; SHA `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` |
| Smoke productivo independiente | MISSING | No existe cuenta/ventana segura ni evidencia ejecutada |
| Recovery independiente | MISSING | No existe ensayo productivo de restore |

El mapa completo `Function → hash` está registrado en
`G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-FUNCTIONS.md`. La multiplicidad de
hashes está reconciliada por Function y no requiere redeploy.

## Recovery observado

La lectura read-only de Firestore confirmó:

```text
location: southamerica-east1
pointInTimeRecovery: DISABLED
backupSchedules: 0
backups: 0
```

Por ello `RECOVERY_POINT_OBSERVED` permanece `MISSING`. La política y la
aceptación requeridas están en `ADR-SAAS-031`; no se habilitó PITR ni se creó
un schedule.

## Estado productivo del tenant

No se inició ni reinició ningún Trial y no se realizaron escrituras de tenant.
Café Atrato conserva la suscripción mensual histórica hasta el cierre de su
ventana contractual; la relación anual todavía no está materializada.

## Comando reproducible

```text
npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos --sha edede7ac600b0524ac15683b4356bce715c171e7
```

El comando requiere el token Firebase fuera del repositorio, no imprime
credenciales y no ejecuta escrituras.
