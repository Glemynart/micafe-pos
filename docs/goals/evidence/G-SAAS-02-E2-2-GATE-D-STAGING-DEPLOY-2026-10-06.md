# G-SAAS-02 / M2 / E2.2 — Gate D: deploy staging (2026-10-06)

## Dictamen

`STAGING_DEPLOY = PASS` para la superficie `saas-bodega` preparada en Gate C.
Esto cierra únicamente Gate D; no declara completas las revalidaciones de
Gate F/G/H, no crea/configura el tenant real y no autoriza producción.

## Identidad y procedencia

- Proyecto destino: `micafe-pos-staging`.
- SHA de `origin/main` en el deploy: `62fab28fdabf9941cbb25b437263c52eed59efbd`
  (merge de PR #464); CI post-merge run `37532798668`: `success`.
- El cambio de PR #464 fue documental: `firebase.json` y
  `functions-bodega` no difieren de la base del preflight de Gate C en
  `f337758aa675f8aaa5307e64601c0a14af26c800`.
- Codebase desplegado: `saas-bodega`; source: `functions-bodega`.
- Comando ejecutado:
  `firebase deploy --only functions:saas-bodega --project micafe-pos-staging --non-interactive`.
- Cloud Build observado: `c44909f5-e76d-4a4a-bb3c-fa405b95aeb1`, `SUCCESS`,
  `2026-10-06T21:42:12Z`–`21:42:54Z`, Node.js `22.23.2`.
- No se usó `--force`; el despliegue no incluyó otros codebases.

La auditoría efectiva de Cloud Functions registra 6 actualizaciones, 4 altas
y 0 bajas. Las cuatro altas fueron `crearSolicitudVentaBodegaV1`,
`consultarSolicitudesVentaBodegaV1`, `resolverSolicitudVentaBodegaV1` y
`cancelarSolicitudVentaBodegaV1`.

## Superficie remota posterior

Las diez Functions están `ACTIVE`, `us-central1`, Node.js 22, y su revisión
`Ready` recibe el 100 % del tráfico:

| Callable | Revisión activa |
| --- | --- |
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00002-lod` |
| `cancelarSolicitudVentaBodegaV1` | `cancelarsolicitudventabodegav1-00001-civ` |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00004-yiv` |
| `consultarSolicitudesVentaBodegaV1` | `consultarsolicitudesventabodegav1-00001-wew` |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00002-suz` |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00002-luk` |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00002-mag` |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00002-zuw` |
| `crearSolicitudVentaBodegaV1` | `crearsolicitudventabodegav1-00001-sef` |
| `resolverSolicitudVentaBodegaV1` | `resolversolicitudventabodegav1-00001-yis` |

El inventario Firebase devuelve exactamente esas diez Functions bajo
`saas-bodega`; ninguna declara `secretEnvironmentVariables`.

## Proveniencia y hash

- El source ZIP subido mide `118382` bytes y contiene 62 entradas.
- SHA-256 del ZIP remoto leído desde la generación desplegada:
  `47d7257696d0b40976a58ea9ab886be3d0df3dc99a50ba42384cc684143e592b`.
- Cada una de sus 62 entradas coincide byte por byte con el paquete compilado
  local del árbol de `origin/main`; faltantes: 0; diferencias de contenido: 0.
- El source hash Firebase recalculado sobre esas entradas es
  `5ec2fb6088dce9df23cd300e7b743c13a0eae0ab`, idéntico al source hash de Gate C.
- El digest del ZIP comprimido no es igual al ZIP local de Gate C
  (`c5182c717db551c3beb728a195a607df809ba17f36a9a61bef52d8f31c2fa830`),
  aunque tamaño, número y contenido de las entradas sí coinciden. La
  diferencia observada está en la serialización del contenedor ZIP; la
  identidad del contenido se verificó por archivo y por el source hash de
  Firebase, no por igualdad de los bytes del ZIP completo.
- El hash remoto Firebase Functions es
  `5a749224a7ce9743b8b12d5dadc32626b3bfe163` en las diez Functions. Coincide
  con el endpoint hash de Gate C una vez incluido el entorno estándar que
  Firebase inyecta (`FIREBASE_CONFIG` y `GCLOUD_PROJECT`) y el hash de Secrets
  vacío. El hash `0ba0e563847656d92e777cd2a27f2a3ef278540a` de Gate C asumía
  entorno vacío; no representa una divergencia de código.

## Validación posterior

| Comprobación | Resultado |
| --- | --- |
| `npm run build` en `functions-bodega` | PASS |
| `npm test` en `functions-bodega` | PASS — 2/2 |
| `npm run test:discovery` | PASS — 1/1; exactamente diez callables |
| `npm run test:module-load` | PASS — 1/1; cero I/O de Firestore/Auth/Secrets al importar |
| Sonda sin Auth a cada callable | PASS — 10/10 respondieron `401 UNAUTHENTICATED` desde el handler |
| Logs Cloud Run `severity >= ERROR` | Ningún evento para las diez superficies en la consulta posterior |
| Revisión y tráfico | PASS — 10/10 Ready; 100 % en la revisión más reciente |
| Secrets | PASS — 0 en `saas-bodega` |
| `git diff --check` | PASS |

Las sondas no incluyeron Auth. El guard compartido rechaza la petición antes
de leer Firestore o ejecutar el comando de negocio; no se escribieron
Firestore/Auth ni se creó fixture/tenant.

## IAM y auditoría del deploy

Firebase aplicó automáticamente `roles/run.invoker: allUsers` a los cuatro
nuevos servicios HTTP callable. No hubo cambios manuales de IAM ni
`SetIamPolicy` en el servicio IAM; se observaron llamadas `iam.serviceAccounts.actAs`
sobre la cuenta runtime existente. Esta invocación pública de transporte es
la configuración que Firebase requiere para HTTPS callable; la autoridad de
usuario/tenant permanece dentro del handler. La respuesta
`401 UNAUTHENTICATED` de las diez sondas confirma que no se aceptó una sesión
anónima.

En la ventana auditada no se observaron habilitaciones de APIs ni generación
de identidades administradas Eventarc/Pub/Sub. Las cuatro políticas de
invocación recién creadas quedan registradas explícitamente, no se presentan
como “cero cambios IAM”.

## Mutation audit

- Archivos/commits/push/PR/merge durante el deploy: `0`.
- Cloud Functions staging: `6 update / 4 create / 0 delete`.
- Revisiones de `saas-bodega`: 10 activas; `100 %` de tráfico en cada nueva
  revisión.
- IAM administrado por Firebase: 4 bindings `roles/run.invoker: allUsers` en
  los cuatro endpoints creados; cambios manuales de política IAM: `0`.
- APIs habilitadas: `0`; Secrets añadidos/cambiados: `0`.
- Firestore/Auth/Rules: escrituras/cambios `0`.
- Bootstrap/Activation/fixture nuevo/tenant real: `0`.
- Producción/tráfico de producción: `0`.
- Sondas de callable staging sin Auth: `10`, rechazadas antes de negocio.

## Estado siguiente

- Gate D: `PASS`.
- Gate E: `PASS` — se conserva el fixture sintético ya autorizado; no crear
  otro.
- Siguiente: **Gate F — repetir la matriz funcional en staging** sobre el
  deploy actual, luego repetir Gate G y emitir la certificación Gate H.
- Gate I/J/K/L y E2.2 continúan pendientes.
