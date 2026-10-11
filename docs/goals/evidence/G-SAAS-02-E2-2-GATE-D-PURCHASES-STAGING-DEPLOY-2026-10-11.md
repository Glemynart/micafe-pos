# G-SAAS-02 / M2 / E2.2 — Gate D deploy de compras Bodega (2026-10-11)

## Dictamen

`STAGING_DEPLOY = PASS` para el codebase `saas-bodega-operations` en
`micafe-pos-staging`, `us-central1`: se actualizaron exactamente las seis
Functions existentes del preflight y se creó `registrarCompraBodegaV1`; no se
eliminó ninguna Function ni se modificó otro codebase. Las siete revisiones
están `Ready`, Node.js 22, cero Secrets y 100 % del tráfico en la revisión
verificada.

Este resultado certifica el despliegue de Functions, no el Gate F funcional.
El corte de Rules ADR-SAAS-072 no se desplegó y permanece separado; por tanto,
Gate D completo para Rules no se declara `PASS`.

## Identidad y comando

- Candidato: PR #539, `main @ 504342634e25a6929f12fc2ab1669f350e54b644`.
- PR #547 (`test(e2e): stabilize bodega approval flow`) quedó integrado en
  `main @ 71f1b0b1aaeb5a0b0018f40008526c617a737645`; su cambio es solo de
  estabilidad E2E y no altera `functions-bodega-operations` ni Rules.
- Preflight que autoriza el delta:
  [`Gate C compras`](G-SAAS-02-E2-2-GATE-C-PREFLIGHT-PURCHASES-2026-10-11.md),
  `PREFLIGHT = PASS`. El ZIP del codebase seleccionado fue 134.491 bytes,
  `sourceHash` `81db62915887743ab1e64ae19ffb420ad737ef9d`, SHA-256
  `bd42e9cf3a9311c2d33716da08377c9693ec4756ba09bef21b9413e582e8743f`.
- Comando ejecutado desde el paquete del candidato:

```text
firebase deploy --only functions:saas-bodega-operations --project micafe-pos-staging --non-interactive
```

- Cloud Build compartido por las siete Functions:
  `854a2ac1-fb3b-4038-b1c1-54f85df835de`, `SUCCESS`, creado a las
  `2026-10-11T13:53:59.382597Z` y finalizado a las `13:54:34.126495Z`.
- La nueva callable reporta source generation `1791726838799048`; la revisión
  inicial es `registrarcomprabodegav1-00001-viw`.

## Verificación de superficie y tráfico

El inventario posterior muestra 44 Functions en el proyecto, frente a 43 en el
preflight. Las únicas siete del codebase operativo están listadas abajo; las
seis anteriores conservan el nombre y tienen revisión nueva.

| Function | Revisión anterior | Revisión posterior | Estado / tráfico |
|---|---|---|---|
| `abrirTurnoOperativoV1` | `abrirturnooperativov1-00001-noy` | `abrirturnooperativov1-00002-bap` | `ACTIVE` / `Ready` / 100 % |
| `actualizarArticuloInventarioV1` | `actualizararticuloinventariov1-00002-yoc` | `actualizararticuloinventariov1-00003-tew` | `ACTIVE` / `Ready` / 100 % |
| `cerrarTurnoOperativoV1` | `cerrarturnooperativov1-00001-bef` | `cerrarturnooperativov1-00002-xow` | `ACTIVE` / `Ready` / 100 % |
| `consultarCatalogoPresentacionesVendedorV1` | `consultarcatalogopresentacionesvendedorv1-00002-kiy` | `consultarcatalogopresentacionesvendedorv1-00003-voy` | `ACTIVE` / `Ready` / 100 % |
| `consultarClientesVendedorV1` | `consultarclientesvendedorv1-00001-peg` | `consultarclientesvendedorv1-00002-gof` | `ACTIVE` / `Ready` / 100 % |
| `consultarMisVentasVendedorV1` | `consultarmisventasvendedorv1-00001-buk` | `consultarmisventasvendedorv1-00002-tam` | `ACTIVE` / `Ready` / 100 % |
| `registrarCompraBodegaV1` | — | `registrarcomprabodegav1-00001-viw` | `ACTIVE` / `Ready` / 100 % |

Las descripciones remotas de las siete Functions muestran `nodejs22`,
`us-central1` y ninguna variable secreta. Los logs de Cloud Run consultados
desde `2026-10-11T13:45:00Z` no contienen entradas de severidad `ERROR` para
ninguna de estas siete revisiones.

La función nueva recibió una sola sonda callable sin autenticación
(`POST {"data":{}}`) y respondió HTTP `401`, `UNAUTHENTICATED`,
`Autenticación requerida.`. Esto demuestra que el endpoint y el handler
responden y aplican la primera barrera de autenticación. La sonda fue rechazada
antes de validar tenant o iniciar la compra; no prueba autorización de un
administrador ni creó/escribió documentos. El discovery/build/module-load
local y las pruebas de la candidata están registrados en Gate C; no se
presentan como compra staging autenticada.

## Auditoría de mutaciones

- Functions: exactamente seis actualizaciones y una creación; cero deletes.
- Cloud Run: una política de servicio `roles/run.invoker` → `allUsers` para el
  servicio callable nuevo, coherente con la superficie callable; la
  autenticación Firebase sigue siendo exigida por el handler.
- IAM de proyecto: no hubo `SetIamPolicy` durante el deploy. El único evento de
  política posterior fue el del servicio Cloud Run nuevo. En la ventana no se
  observaron `EnableService` ni `CreateServiceAccount`.
- El estado actual conserva un sexto binding filtrado en la lectura IAM:
  `roles/iam.serviceAccountTokenCreator` para
  `firebase-adminsdk-fbsvc@micafe-pos-staging.iam.gserviceaccount.com`, además
  de los cinco bindings exactos enumerados por ADR-SAAS-067. Los logs de
  auditoría sitúan su creación el `2026-10-08T05:20:58Z`, antes de este deploy;
  no lo creó ni modificó Gate D. Su presencia no coincide con el alcance
  aprobado de cinco bindings. No se retiró ni se alteró: requiere análisis y
  decisión separada antes de cualquier nuevo cambio IAM.
- Firestore/datos, Auth, Rules, fixture, tenant real, Secrets y producción:
  sin cambios por este despliegue.

## Reconciliación de Gate C Rules

La lectura GET del release `cloud.firestore` en este checkpoint mantiene el
ruleset `30df41d0-bd59-4c91-80ea-65576afd436b`, actualizado el
`2026-10-02T06:06:09.78389Z`. El SHA-256 normalizado del contenido remoto es
`0d983a0730debe84790916f6eaedb822bcb1e2905acebba3f58aae7342c4481e`; el valor
`00e8ef...` en el preflight anterior era erróneo y se corrige en ese documento.
El archivo candidato actual `firestore.rules` tiene SHA-256 normalizado
`69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`.
Rules no se desplegó ni modificó.

## Estado posterior y siguiente paso

Gate E conserva `PASS` para el fixture sintético retenido
`E2_2-BODEGA-STAGING-FIXTURE`; no se creó ni alteró fixture en este checkpoint.
Gate F sigue `EN CURSO`: después del deploy falta validar con una sesión de
tenant Bodega compatible la ruta de cliente que usa
`registrarCompraBodegaV1`, además de revalidar los escenarios F afectados por
la compra y los cambios recientes. No se registra compra sintética aquí. Gate G
y Gate H se repiten después de cerrar F, según la secuencia del Goal. Gate I
continúa `BLOCKED`; no se configuró tenant real ni se inició el Trial.

La CI post-merge de PR #547, run `38144529463`, terminó `success` a las
`2026-10-11T14:07:21Z`. Su E2E Bodega —solicitud, aprobación y venta canónica—
terminó `success` a las `14:04:12Z`. Esta suite usa Emulator y no sustituye la
validación autenticada del despliegue en staging descrita arriba.

**Resultado de este checkpoint:** Gate D Functions `PASS`; Gate D Rules `NOT
EXECUTED`; Gate F continúa abierto. Producción y tenant real permanecen sin
cambios.
