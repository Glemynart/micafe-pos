# G-SAAS-02 — Evidencia read-only de release — `origin/main @ 3d5ef26`

## Resultado

La recolección se ejecutó el `2026-08-14T09:56:41.577Z` contra el proyecto
Firebase `micafe-pos`, el repositorio `Glemynart/micafe-pos` y
`origin/main @ 3d5ef26ce67af82978067617fa03472eadb063c0`.

```text
status: INCOMPLETE
readOnly: true
productionWrites: false
collectionErrors: []
```

## Gates observados

| Gate | Estado | Evidencia |
|---|---|---|
| `origin/main` coincide con el objetivo | PASS | SHA objetivo observado en `origin/main` |
| CI post-merge | PASS | Run `31789044305`, `success` |
| Vercel | PASS | Deployment del SHA objetivo en estado `success` |
| Functions | PASS | 74/74 activas, todas en Node.js 22 |
| Hashes de Functions | PASS | 3 hashes observados: 3, 12 y 59 Functions; mapa individual completo |
| Firestore Rules | PASS | Fuente desplegada coincide; SHA `35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee` |
| Storage Rules | PASS | Fuente desplegada coincide; SHA `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` |
| Smoke productivo independiente | MISSING | El deployment público observado devuelve `302` a Vercel SSO; los dominios `cafeatrato.com` y `www.cafeatrato.com` no resuelven |
| Recovery independiente | MISSING | No existe todavía un punto observable ni un ensayo productivo de restore |

La observación fue read-only y no ejecutó callables, deploys, comandos
comerciales ni escrituras de tenant. El estado global permanece `INCOMPLETE`.

## Recovery observado

La lectura read-only de Firestore confirmó:

```text
location: southamerica-east1
pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED
backupSchedules: 0
backups: 0
```

Por tanto, `RECOVERY_POINT_OBSERVED` y
`RECOVERY_INDEPENDENT_ATTESTATION` permanecen `MISSING`. `ADR-SAAS-031`
continúa `Propuesto`; no se habilitó PITR, no se creó un schedule y no se
ejecutó un restore.

## Smoke observado

La solicitud GET read-only al deployment
`cafeatrato-1y24o8ofp-glemynarts-projects.vercel.app` respondió `HTTP 302`
hacia Vercel SSO. Sin una cuenta y una ventana segura del tenant no se puede
certificar smoke productivo independiente.

## Comando reproducible

```text
$env:FIREBASE_ACCESS_TOKEN = (Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" | ConvertFrom-Json).tokens.access_token
npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos --sha 3d5ef26ce67af82978067617fa03472eadb063c0
```

El token se utilizó únicamente fuera del repositorio, en memoria, y no se
imprime ni se guarda en la evidencia.
