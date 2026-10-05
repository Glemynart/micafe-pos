# G-SAAS-02 / M2 / E2.2 — corrección y despliegue de claims de membresía (2026-10-05)

## Alcance y resultado

Esta evidencia registra la corrección de código integrada por PR #447 para el
flujo de claims de `actualizarMembresiaBodegaV1`, el preflight inicial y la
reconciliación posterior del update staging. El checkpoint previo al replay
quedó supersedido por la reconciliación funcional al final de este documento;
Gate G/H y E2.2 permanecen pendientes.

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

## Estado staging y preflight — checkpoint previo al update

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

## Decisión registrada en ese checkpoint

En ese checkpoint no se ejecutó el deploy mientras seguía sin resolverse si el
preflight había activado una identidad de servicio fuera del alcance IAM
autorizado. La sección de reconciliación posterior registra el estado que
resultó del update controlado y mantiene `UNKNOWN` la generación/reutilización
efectiva de las identidades administradas. En ese momento, el siguiente paso
propuesto era el deploy dirigido y el replay del envelope de activación
existente, sin crear otro fixture ni escribir claims directamente.

## Mutation audit del preflight staging descrito

- El preflight descrito no modificó archivos, commits ni ramas.
- Deploy Functions / nueva revisión / tráfico: 0.
- Cambios manuales de política IAM: 0 observados.
- Generación efectiva de identidades Pub/Sub/Eventarc por el dry-run: UNKNOWN.
- Firestore/Auth/Rules/Secrets/fixture/Bootstrap/Activation/producción: 0 en el
  preflight descrito aquí.
- Gate F: `BLOCKED / PENDING CONTROLLED UPDATE AND REPLAY`.

## Reconciliación posterior — update dirigido staging (2026-10-05)

Esta sección supersede únicamente el estado de despliegue anterior; no convierte
la validación funcional pendiente en `PASS`.

### Artefacto y build

- Código auditado: `origin/main @
  6896886e91812eb73f345b08739d71ac6f3e2d01`; CI post-merge del commit:
  run `37336822064`, `success`.
- Target: proyecto `micafe-pos-staging`, codebase
  `saas-bodega-membership`, callable `actualizarMembresiaBodegaV1`, región
  `us-central1`, runtime Node.js 22.
- Firebase Functions hash: `795e32a293708f60528c80d1463e2dd8fcc055e0`.
- Cloud Build: `3b319894-1013-4f9f-a458-36ea80753122`, `SUCCESS`, iniciado
  `2026-10-05T16:34:59.968Z`, terminado `2026-10-05T16:35:27.833Z`.
- Source ZIP inmutable: generación `1791218098935244`, tamaño `79817`, MD5
  `a14vZatRrLviqTTI+zqz/Q==`, CRC32C `+U94hQ==`.
- `sourceProvenance` del Cloud Build es `{}`; por tanto, la procedencia Git
  declarada por el build es `UNKNOWN`. Como comprobación separada, se descargó
  ese ZIP y sus 39 archivos coincidieron byte por byte con los archivos
  correspondientes del paquete `functions-bodega-membership` en el checkout
  limpio de `main @ 6896886...`. Esto demuestra equivalencia de contenido con
  ese commit, no una attestation Git firmada por Cloud Build.

### Estado remoto posterior

- Cloud Run revision `actualizarmembresiabodegav1-00002-zog`: `Ready=True`,
  creada `2026-10-05T16:35:33.736Z`, con 100 % del tráfico. Imagen:
  `sha256:26a41c5cbfb36404132a75f2404305cac190d9c8d5971ddd6340d27c2fc50e3d`.
- Service account: `192423427245-compute@developer.gserviceaccount.com`;
  Secrets configurados: `0`.
- Revisión previa `actualizarmembresiabodegav1-00001-cuj` sigue retenida, sin
  tráfico y sin eliminación; Cloud Run la marca `Retired` tras el cambio de
  tráfico. Su imagen conserva digest
  `sha256:d7a13c6b6ef79d6f340eb7f5368c3b1b589e05f7b8c84ffe1b80891694cdb3d5`.
- La política IAM leída para el servicio contiene `allUsers` con
  `roles/run.invoker`, consistente con `invoker: "public"` en el entrypoint.
  No se encontró evento
  `SetIamPolicy` ni `GenerateServiceIdentity` entre 16:30 y 16:40 UTC. La
  generación/reutilización efectiva de los service agents Pub/Sub/Eventarc
  sigue `UNKNOWN`; no se atribuye un cambio IAM no demostrado.

### Sonda pre-replay — checkpoint histórico

Una llamada HTTP sin Firebase Auth al endpoint devolvió `401 UNAUTHENTICATED`
(`Autenticación requerida.`), coherente con la primera barrera del handler.
La lectura posterior confirmó que no produjo cambios: la membresía sintética
del vendedor `fdea8e9a…230fe` permanece `activa`/`vendedor`, su obligación de
activación preexistente continúa `EMITIDA` y sus custom claims siguen `{}`.

En este checkpoint todavía no se había ejecutado el replay autenticado. Ese
estado quedó supersedido por la reconciliación posterior documentada abajo; no
se creó un comando nuevo ni se escribieron claims directamente.

### Mutation audit del update y la sonda pre-replay

- Functions: 1 callable actualizada; 1 revisión nueva; traffic shift normal del
  deploy a `00002-zog` al 100 %; `00001-cuj` retenida a 0 %.
- Source ZIP/build/image: 1 artifact/build de la callable objetivo.
- Firestore/Auth/Rules/Secrets: 0 escrituras o cambios manuales observados en
  este gate; el probe fue rechazado antes de procesar payload.
- Política IAM: 0 cambios `SetIamPolicy` observados; generación de service
  agents Pub/Sub/Eventarc: `UNKNOWN`.
- Otros codebases, fixtures, Bootstrap, Activation, producción: 0.
- Durante el deploy y el probe: archivos/commits/push/PR/merge: 0. Esta
  actualización de evidencia es documental y se tramita mediante su propia PR.
- En ese checkpoint Gate F estaba `BLOCKED / PENDING AUTHENTICATED CANONICAL
  REPLAY`; su estado vigente se reconcilia en la sección siguiente.

### Reconciliación funcional posterior — replay exacto (2026-10-05)

La verificación previa confirmó en `micafe-pos-staging` el vendedor sintético
`fdea8e9a…230fe`, con membresía `activa`/`vendedor`, la obligación de auditoría
determinista `EMITIDA` y su hecho append-only preexistente. El envelope del
comando existente coincidía exactamente con tenant, objetivo, estado,
`commandId`, `idempotencyKey`, correlación, causación nula y motivo; no se creó
otro comando.

El 2026-10-05T20:31:35.434Z se ejecutó una sola vez, con un administrador
autenticado del mismo tenant, `actualizarMembresiaBodegaV1` en
`micafe-pos-staging`, codebase `saas-bodega-membership`, región `us-central1`,
revisión `actualizarmembresiabodegav1-00002-zog`, Node.js 22 y hash
`795e32a293708f60528c80d1463e2dd8fcc055e0`. Cloud Run registró HTTP 200. La
transacción tomó la rama de replay compatible: no volvió a actualizar la
membresía y la obligación `EMITIDA` no volvió a escribirse.

Como comprobación funcional posterior, la credencial sintética ya existente
autenticó al mismo vendedor sin registrar el código ni el PIN. El ID token
emitido contenía el `empresaId` del fixture y rol `vendedor`; una lectura
autenticada de `consultarCatalogoPresentacionesVendedorV1` respondió
correctamente con una presentación. Las consultas read-only contaron un solo
documento de auditoría y una sola obligación para el `commandId`. La lectura
administrativa independiente de custom claims no está disponible para la
identidad local (`firebaseauth.users.get` denegado), pero el token real emitido
por la autenticación operativa y el callable de catálogo confirman el contexto
tenant/rol efectivo.

Resultado del subgate: `PASS` para replay canónico, sincronización efectiva de
claims, auditoría append-only/idempotente y acceso autenticado posterior del
vendedor. Combinado con los escenarios `PASS` anteriores de Gate F, el gate
queda `PASS`; el siguiente es Gate G — rehearsal.

#### Mutation audit del replay

- `actualizarMembresiaBodegaV1`: 1 invocación autenticada; HTTP 200.
- Membresía y documentos canónicos de auditoría: 0 escrituras por el replay;
  1 obligación y 1 hecho existentes, sin duplicados.
- Autenticación operativa auxiliar: 3 sesiones de tenant-admin (dos terminaron
  antes de invocar la callable por guardas de identidad; la tercera autorizó el
  replay) y 1 sesión del vendedor para verificación. Cada login actualizó sus
  contadores/timestamp de credencial y sincronizó/revocó claims de sesión por
  el flujo canónico.
- Auth: sincronización de claims/revocación de sesiones del administrador por
  los logins y del vendedor por replay y login posterior. No se crearon ni
  eliminaron identidades.
- Deploy, tráfico manual, Rules, IAM, Secrets, fixture adicional, Bootstrap,
  Activation, producción: 0.
- Archivos/commits/push/PR/merge durante la ejecución remota: 0.
