# G-SAAS-02 — Verificación postdeploy de Rules y Storage — 2026-08-14

## Resultado

El deploy controlado se ejecutó contra `micafe-pos` desde
`origin/main @ a644d1d002d733b9ef2ea637894ff362c01ee59d`, después de que la CI
post-merge `31758861716` terminara en `success`.

```text
observedAt: 2026-08-14T01:10:36.466Z
configurationDeploy: firestore:rules, storage
tenantDataWrites: false
readOnlyVerification: true
releaseEvidence: INCOMPLETE
```

El comando ejecutado fue:

```text
firebase deploy --only firestore:rules,storage --project micafe-pos --non-interactive
```

No se ejecutaron Functions, callables, comandos comerciales ni escrituras de
datos del tenant.

## Verificación independiente

La API GET de Firebase Rules confirmó que el source desplegado coincide con la
fuente versionada del SHA objetivo:

| Servicio | Ruleset posterior | Hash local | Hash desplegado | Resultado |
|---|---|---|---|---|
| Firestore | `f634a73d-5942-49d6-864c-a4e2f2a0a3b8` | `35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee` | `35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee` | `PASS` |
| Storage | `1df06087-5bca-4822-ba5a-50ac951c9cf4` | `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` | `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` | `PASS` |

Los releases previos para rollback documentado fueron Firestore
`b62eb3e4-d174-4b8e-971c-b7139130d4b9` y Storage
`b6354bf9-ca50-4cfd-8198-350e1f089645`; no se ejecutó rollback.

## Gates que siguen abiertos

- Recovery: PITR deshabilitado, cero schedules y cero backups observables en
  `southamerica-east1`.
- Smoke productivo del tenant Café Atrato: pendiente.
- Reconciliación del release por Function: pendiente porque se observan tres
  hashes de Functions, aunque las 74 están activas y en Node.js 22.
- El Trial anual no está iniciado; Café Atrato conserva el Trial mensual
  histórico hasta `2026-09-02` y no existe relación anual materializada.

Esta evidencia no autoriza todavía la transición contractual ni el inicio de
un Trial nuevo.
