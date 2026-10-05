# G-SAAS-02 / M2 / E2.2 — corrección de claims de membresía (2026-10-05)

## Alcance y resultado

Esta evidencia registra la corrección de código integrada por PR #447 para el
flujo de claims de `actualizarMembresiaBodegaV1`. No declara el deploy de la
corrección, la validación funcional staging, Gate F completo ni E2.2 completo.

En la ejecución canónica de Gate F, la desactivación seguida de activación y
replay exacto no restauró los claims tenant del vendedor. La prueba local
reprodujo el fallo antes de la corrección. PR #447 cambió la sincronización
para restaurar claims cuando la membresía resultante queda activa y el claim
`empresaId` está ausente, sin sobrescribir claims cuyo tenant sea otro. Su
cobertura aislada terminó con 11/11 pruebas; el job remoto `Tipos y pruebas`
del run `37326403119` y Vercel/Vercel Preview Comments terminaron PASS.

PR #447 se fusionó el 2026-10-05 a las 14:58:49 UTC:

- HEAD del PR: `38af2d0da5d0ec0620046418fb8952f19b3d8a59`.
- Merge commit y `origin/main`: `59365d1b916d740f6f0d96c4edb570c2df9c86f8`.
- CI post-merge: run `37329105800`, conclusión `success`.
- El diff funcional del PR se limitó al handler de membresía Bodega y sus
  pruebas. No cambió contratos públicos ni topología Firebase.

## Estado staging y preflight

El endpoint consultado antes y después del dry-run fue
`micafe-pos-staging / saas-bodega-membership / actualizarMembresiaBodegaV1`,
`us-central1`, Node.js 22, cero Secrets. La revisión de Cloud Run permaneció
`actualizarmembresiabodegav1-00001-cuj`, `Ready=True`, 100 % de tráfico; el
hash desplegado permaneció `e436c21e90afb71cc88e3b557ec2e82b97b094fe`.

El comando ejecutado fue exclusivamente:

```powershell
firebase deploy --project micafe-pos-staging --only functions:saas-bodega-membership:actualizarMembresiaBodegaV1 --dry-run
```

Terminó `Dry run complete!`; no creó una revisión de Functions ni cambió
tráfico. Durante la preparación el CLI informó que generaba identidades de
servicio para `pubsub.googleapis.com` y `eventarc.googleapis.com`. La lectura
de política IAM del proyecto no mostró bindings para esas identidades y la
consulta de registros de actividad/IAM no mostró cambios de política desde el
preflight. Sin embargo, la operación Service Usage
`GenerateServiceIdentity` no produce audit log, y las identidades administradas
por Google no aparecen en la lista normal de cuentas de servicio del proyecto.
Por ello no se puede distinguir con evidencia disponible si el dry-run generó
una identidad que faltaba o reutilizó una preexistente. No se intentó revertir
ni modificar esas identidades o sus políticas.

Referencias oficiales sobre esta limitación:

- [Service Usage audit logging](https://docs.cloud.google.com/service-usage/docs/audit-logging)
- [Service account types — service agents](https://docs.cloud.google.com/iam/docs/service-account-types)

## Decisión y siguiente condición

No se ejecutó el deploy mientras siga sin resolverse si el preflight activó una
identidad de servicio fuera del alcance IAM autorizado. Para reanudar Gate F,
el gate siguiente debe establecer de forma explícita que las identidades
administradas necesarias ya existían o autorizar únicamente la generación
administrada requerida por Firebase CLI, sin cambios manuales de política IAM.
Después podrá evaluarse un deploy dirigido a la única callable y el replay del
envelope de activación ya existente para comprobar la restauración de claims y
la auditoría append-only, sin crear otro fixture ni escribir claims
directamente.

## Mutation audit del preflight staging descrito

- El preflight descrito no modificó archivos, commits ni ramas.
- Deploy Functions / nueva revisión / tráfico: 0.
- Cambios manuales de política IAM: 0 observados.
- Generación efectiva de identidades Pub/Sub/Eventarc por el dry-run: UNKNOWN.
- Firestore/Auth/Rules/Secrets/fixture/Bootstrap/Activation/producción: 0 en el
  preflight descrito aquí.
- Gate F: `BLOCKED / PENDING CONTROLLED UPDATE AND REPLAY`.
