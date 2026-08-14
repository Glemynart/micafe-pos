# G-SAAS-02 — Evidencia automática de release — 2026-08-14

## Resultado

El colector read-only se ejecutó el `2026-08-14T00:30:08Z` contra el proyecto
Firebase `micafe-pos`, el repositorio `Glemynart/micafe-pos` y
`origin/main @ d36a2548cfc75442ad9272229550dd142e202c31`.

```text
status: INCOMPLETE
readOnly: true
productionWrites: false
collectionErrors: []
```

## Evidencia automática positiva

- CI del SHA objetivo: run `31756067841`, `completed`, `success`.
- Vercel para el SHA objetivo: `success`, deployment `EJ6j2k8QVcUxALeUHWcAqGgLcNG7`.
- Functions observadas: `74` activas de `74` y todas en `nodejs22`.
- La distribución de hashes de Functions fue observada: `59`, `12` y `3`.
- La lectura de Firestore confirmó el proyecto y la base `(default)` en
  `southamerica-east1`.

## Drift de Rules detectado

La API read-only de Firebase Rules permitió comparar el source desplegado con
la fuente versionada del checkout:

| Servicio | Release observado | Ruleset observado | Fuente local | Resultado |
|---|---|---|---|---|
| Firestore | `cloud.firestore` | `b62eb3e4-d174-4b8e-971c-b7139130d4b9` | `firestore.rules` | `MISMATCH` |
| Storage | `firebase.storage/micafe-pos.firebasestorage.app` | `b6354bf9-ca50-4cfd-8198-350e1f089645` | `storage.rules` | `MISMATCH` |

El drift no se interpreta como una certificación parcial. En particular, el
Storage desplegado corresponde a una versión histórica y no coincide con el
contrato tenant-aware actual del repositorio. Debe sincronizarse mediante el
comando de deploy aprobado después de validar CI, rollback y verificación
read-only posterior.

## Recovery faltante

La lectura read-only de `micafe-pos` observó:

- `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED`;
- cero schedules de backup;
- cero backups observables en `southamerica-east1`.

Por ello no existe todavía un punto de recuperación verificable para el Trial.
La evidencia de un ensayo de restore sigue siendo obligatoria; no se sustituye
por una referencia declarada.

## Otros gates faltantes

- smoke productivo del tenant;
- recovery verificable;
- reconciliación del release por Function para los hashes múltiples.

No se ejecutaron callables, deploys, comandos comerciales ni escrituras
productivas. La evidencia no autoriza iniciar el Trial anual.

## Reproducción

```text
$env:FIREBASE_ACCESS_TOKEN = (Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" | ConvertFrom-Json).tokens.access_token
npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos
```

El token se entrega por el entorno local y nunca se imprime ni se guarda en la
evidencia.
