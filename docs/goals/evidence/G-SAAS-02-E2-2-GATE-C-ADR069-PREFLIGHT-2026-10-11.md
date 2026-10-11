# G-SAAS-02 / M2 / E2.2 — Gate C preflight ADR-SAAS-069 (2026-10-11)

## Dictamen

`PREFLIGHT = BLOCKED — LA RUTA CANÓNICA DE COMPRAS QUEDA FUERA DEL BOUNDARY AUTORIZADO`.

No se ejecutó deploy ni se cambiaron Functions, Rules, IAM, Secrets, Firestore,
Auth, tráfico, fixture, tenant real o producción. Este dictamen bloquea Gate D
hasta resolver la frontera de compra descrita en
[`ADR-SAAS-071`](../../../ADR-SAAS-071-frontera-compras-bodega.md). Los datos
del candidato y las superficies que sí podrían desplegarse quedan registrados
para no repetir la auditoría.

## Identidad y alcance inspeccionado

- **Proyecto remoto consultado:** `micafe-pos-staging` (`us-central1`).
- **Commit candidato:** `main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4`;
  PR #537 y su CI post-merge run `38110437457` terminaron `success`.
- **Codebases Bodega del candidato:** `saas-bodega` y
  `saas-bodega-operations`; Rules `firestore.rules`.
- **No seleccionados:** todos los demás codebases, especialmente `saas-auth`.
- **Límite:** inspección read-only; no se hizo dry-run de Firebase ni se
  escribieron recursos remotos.

## Artifacts locales reproducibles

Después de compilar ambas fronteras con `npm --prefix … run build`, el hash de
fuente se calculó invocando el algoritmo de Firebase CLI 15.32.1
(`prepareFunctionsUpload`) y el manifiesto SHA-256 se calculó sobre la lista
ordenada `ruta relativa + SHA-256 de contenido` incluida por el empaquetador.

| Codebase | Archivos / bytes | Firebase sourceHash | Manifiesto SHA-256 | Discovery |
|---|---:|---|---|---|
| `saas-bodega` | 70 / 479.588 | `dcf842ff4bc9a47585eec0cdf4f4d8d4b4d1038a` | `ad3af006b43b40fb123364e62c900924acf1cb26fae2e54fe55b73bc4ffa1e3d` | PASS: 15 callables, un trigger, un scheduler, cero Secrets |
| `saas-bodega-operations` | 63 / 394.726 | `6c5986ec8f74e1c51a93f3a90643911ebc18246c` | `6fc06dccccaf559c422ce51b7768780a7a0b658ed24e897d9a525dee42f3f783` | PASS: 6 callables, cero Secrets |

Los builds locales y `test:discovery` de ambos codebases terminaron `PASS`. Los
sourceHash son distintos de los hashes actuales de staging, por lo que las 23
Functions de estas dos fronteras recibirían actualización; sus nombres
coinciden, sin creación ni eliminación. Ninguna de las dos compilaciones
incluye `functions/src/finanzas/compras.ts`.

## Estado remoto y rollback

La lectura de Cloud Functions y Cloud Run observó 43 Functions en staging:

- 17 `saas-bodega`, todas `ACTIVE`, Node.js 22, `us-central1`, cero Secrets,
  `Ready=True`, 100 % del tráfico en la revisión listada; hash común
  `fb454ff5e6f4138203389e308840feead931f19e`.
- 6 `saas-bodega-operations`, también `ACTIVE`, Node.js 22, cero Secrets y
  100 % de tráfico: cuatro con hash
  `1cb4b5476b2edb5eb976f6bff0fa6b38c4b44d21` y dos con hash
  `6ed63ebadff83be08bb45a35ea2fca729b0e3ca3`.
- No aparece `saas-auth` ni `registrarCompraOperativaV1` en el inventario de
  staging. Por tanto, staging no posee hoy la ruta canónica que registra
  compras y no puede verificar su actualización de disponibilidad.

Revisiones listas capturadas para rollback de las 23 superficies:

| Codebase | Servicio → revisión lista |
|---|---|
| `saas-bodega` | `actualizarpresentacioncomercialv1` → `-00005-xiy`; `cancelarprogramacionpedidobodegav1` → `-00002-gap`; `cancelarsolicitudventabodegav1` → `-00004-hak`; `confirmarventabodegav1` → `-00007-veg`; `consultaragendapedidosbodegav1` → `-00002-vaz`; `consultarsolicitudesventabodegav1` → `-00004-jeq`; `convertirprogramacionpedidobodegav1` → `-00002-kej`; `creararticuloinventariov1` → `-00005-kow`; `crearcategoriabodegav1` → `-00005-dar`; `crearclientevendedorv1` → `-00005-fem`; `crearpresentacioncomercialv1` → `-00005-wol`; `crearprogramacionpedidobodegav1` → `-00002-lap`; `crearsolicitudventabodegav1` → `-00004-huq`; `notificarsolicitudventabodegapendientev1` → `-00001-raf`; `reconciliaragendapedidosbodegav1` → `-00002-fir`; `resolverprogramacionpedidobodegav1` → `-00002-ruw`; `resolversolicitudventabodegav1` → `-00004-zof`. |
| `saas-bodega-operations` | `abrirturnooperativov1` → `-00001-noy`; `actualizararticuloinventariov1` → `-00002-yoc`; `cerrarturnooperativov1` → `-00001-bef`; `consultarcatalogopresentacionesvendedorv1` → `-00002-kiy`; `consultarclientesvendedorv1` → `-00001-peg`; `consultarmisventasvendedorv1` → `-00001-buk`. |

Los sufijos identifican revisiones completas de Cloud Run; antes de Gate D debe
capturarse otra vez el nombre completo y tráfico para cada servicio. No se
asume que esta línea base siga vigente si el remoto cambia.

## Rules, IAM y servicios

- Rules release `projects/micafe-pos-staging/releases/cloud.firestore` apunta
  al ruleset `30df41d0-bd59-4c91-80ea-65576afd436b`. Su contenido coincide con
  el Rules de `main` previo a PR #537. El candidato añade únicamente el helper
  `membresiaBodegaActiva` y las dos rutas de lectura restringida
  `bodega_senales` / `bodega_senales_vendedor` (32 líneas de reglas); no
  permite escrituras cliente.
- Los cinco bindings aceptados por ADR-SAAS-066/067 ya existen. Se conserva un
  binding preexistente de `roles/iam.serviceAccountTokenCreator` para
  `firebase-adminsdk-fbsvc`; no es un binding nuevo ni parte de esa excepción.
  No se identificó necesidad de otro principal o rol para las 23 actualizaciones
  y el Ruleset. No se hizo `SetIamPolicy`.
- Las superficies afectadas usan Functions/Firestore ya activos en staging;
  no se solicitó habilitar APIs.

## Causa del bloqueo

PR #537 también cambia `functions/src/finanzas/compras.ts` para escribir la
señal dentro de la compra. Ese módulo se exporta únicamente desde el codebase
`saas-auth`; no está en los artefactos aislados anteriores. Desplegar `saas-auth`
está prohibido por ADR-SAAS-049/054 y no puede incluirse en el delta permitido.
Desplegar solo los dos codebases Bodega dejaría sin certificar la actualización
de disponibilidad después de compras, requerida por la semántica completa de
ADR-SAAS-069 y por el onboarding de inventario/costos.

Al momento de esta lectura, el boundary estaba pendiente de ADR-SAAS-071. Por
ello, para este candidato original **no ejecutar Gate D**. La aceptación
posterior y el nuevo paso autorizado están asentados en la reconciliación al
final de este informe. No era un bloqueo de usuario/sesión ni un fallo del CI.

## Evidencia ejecutada y auditoría de mutaciones

- `npm --prefix functions-bodega run build`: PASS.
- `npm --prefix functions-bodega run test:discovery`: PASS.
- `npm --prefix functions-bodega-operations run build`: PASS.
- `npm --prefix functions-bodega-operations run test:discovery`: PASS.
- CI post-merge de PR #537: `success`, run `38110437457`.
- Functions, Rules, IAM, APIs, Secrets, Auth, Firestore, tráfico, fixtures,
  tenant real y producción: escrituras observadas `0`.

## Reconciliación posterior a ADR-SAAS-071 — 2026-10-11

El responsable aprobó explícitamente la Opción 1: `registrarCompraBodegaV1` en
`saas-bodega-operations`, reutilizando el núcleo transaccional y sin cambiar
`saas-auth`. La aprobación supersede únicamente la lista de seis callables de
ADR-SAAS-054 al añadir esta séptima callable. Autoriza preparar la PR de
implementación, pero no deploy ni escrituras de datos.

Este informe sigue siendo `PREFLIGHT = BLOCKED` para el candidato que auditó:
no demuestra todavía discovery, source hash, Rules, IAM ni rollback del nuevo
código. Después de integrar la implementación y su CI/auditoría, se repetirá
Gate C read-only para el candidato completo. Solo un nuevo `PREFLIGHT = PASS`
permitirá proponer un Gate D separado para staging. No ejecutar deploy en esta
etapa. Gate I continúa bloqueado para Bootstrap/Activation y datos reales hasta
completar la secuencia de gates y las precondiciones documentadas.
