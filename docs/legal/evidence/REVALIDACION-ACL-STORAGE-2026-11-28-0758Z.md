# Revalidación ACL de Firebase Storage — 2026-11-28 07:58 UTC

**Entorno:** producción `micafe-pos`, bucket `micafe-pos.firebasestorage.app`.\
**Método:** lecturas de métricas agregadas y metadata ACL. No se descargó contenido; el informe no conserva nombres de objetos, direcciones ni identificadores de titulares.

## Métricas de Cloud Monitoring

Consulta para el intervalo de 24 meses terminado en `2026-11-28T07:57:51Z`:

- `storage.googleapis.com/authz/acl_operations_count`: serie `OBJECT_ACCESS_REQUIRED_OBJECT_ACL`, 119 muestras, suma `20`.
- `storage.googleapis.com/authz/acl_based_object_access_count`: 156 muestras, suma `20`.

Google define la primera como accesos que requieren ACL de objeto y la segunda como solicitudes concedidas exclusivamente por ACL. Los resultados no incluyen identidad ni nombre del objeto; prueban dependencia histórica de ACL, pero no determinan si las concesiones fueron públicas o autorizadas. La métrica de operaciones cubre los 24 meses previos. [Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access) · [métricas de Cloud Storage](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z).

## Inventario minimizado de metadata activa

La API de Cloud Storage devolvió metadata ACL para 7 objetos activos. Conteo agregado de grants:

| Clase de principal | Permiso | Grants |
|---|---|---:|
| `projectViewers` | `READER` | 7 |
| `projectEditors` | `OWNER` | 7 |
| `projectOwners` | `OWNER` | 7 |
| Usuario propietario del objeto (identidad omitida) | `OWNER` | 7 |
| `allUsers` | — | 0 |
| `allAuthenticatedUsers` | — | 0 |

El default ACL coincide con las clases de grants de los objetos activos. El inventario no incluye generaciones históricas, soft-deleted objects ni objetos borrados durante el intervalo de métricas.

## IAM y acceso público

- `gcloud projects get-ancestors micafe-pos` devuelve solo el recurso `project`; no hay organización/carpeta padre.
- La política directa del proyecto tiene tres principales de tipo service account con `roles/editor`, un principal de tipo usuario con `roles/owner`, cero grupos y ningún binding directo a `roles/viewer`, `roles/storage.objectViewer` o `roles/storage.legacyObjectReader`.
- El bucket concede `roles/storage.legacyBucketReader` a `projectViewer`; la ACL predeterminada también concede `READER` a `projectViewer`.
- La política efectiva `constraints/storage.publicAccessPrevention` no está marcada `enforced`. Las 7 ACL actuales no tienen grants públicos, pero esta configuración no bloquea por sí sola futuros grants públicos.
- La política IAM del proyecto no contiene configuración `auditConfigs` para `storage.googleapis.com`. No se inspeccionaron logs; no se confirmó si existe evidencia histórica atribuible a estas solicitudes.

## Resultado

No se halló grant público en los 7 objetos activos consultados. La correlación de las 08:14 interpretó inicialmente el grant `OWNER` directo como una identidad no mapeada en IAM; esa conclusión se corrigió con la relectura posterior registrada al final de este documento. **No se puede certificar aislamiento ni declarar ausencia histórica de exposición:** Cloud Monitoring registra 20 accesos concedidos exclusivamente por ACL y no identifica los objetos o solicitantes. La configuración de auditoría de Storage no permite atribuirlos. No se modificó Storage, IAM, Rules ni contenido productivo.

ADR-SAAS-111 continúa `Propuesto`: queda atribuir el uso ACL sin exponer PII y validar un bucket de staging antes de preparar cualquier cambio productivo.

## Correlación de grants OWNER — revalidación 2026-11-28 08:14 UTC

Se compararon en memoria las ACL de los siete objetos activos con las políticas IAM del proyecto y del bucket y con la identidad autenticada del operador. Una única identidad de tipo usuario tiene grant directo `OWNER` en los siete objetos; la primera normalización no la enlazó con el principal IAM correspondiente. El valor de identidad no se emitió ni conservó. Esta lectura inicial queda corregida por la reconciliación posterior.

La lectura inicial trató esta ruta como un acceso de identidad no mapeada y sugirió comprobar su vigencia antes de revocar. La revalidación posterior identifica el principal como una cuenta de servicio enlazada a `roles/firebasestorage.serviceAgent`; por tanto, no se justifica revocar ese grant. No se confirmó grant público (`allUsers`/`allAuthenticatedUsers`). No se hizo ninguna escritura.

## Preflight de bucket Storage en staging — revalidación 2026-11-28

La lista de Cloud Storage del proyecto `micafe-pos-staging` contiene únicamente los buckets de artefactos `gcf-v2-sources`, `gcf-v2-uploads` y los dos buckets `micafe-pos-staging-e2-2-*` de provisioning/source. No existe el bucket Firebase esperado `micafe-pos-staging.firebasestorage.app` (consulta `describe`: 404), ni se identificó otro bucket de aplicación en el proyecto. No se reutilizarán buckets de artefactos para probar las rutas de negocio. Por tanto, la prueba de ACL/UBLA con las mismas rutas e identidades de Storage no se ejecutó y no se afirma como validada en staging. Crear un bucket dedicado requiere un preflight y autorización operativa aparte; no se creó recurso alguno.

## Reconciliación de la identidad OWNER — 2026-11-28, lectura posterior

Se repitió la lectura con Cloud Storage JSON API y `projection=full`, sin descargar contenido ni emitir nombres de objetos o identidades. El bucket Firebase sigue teniendo 7 objetos activos; sus ACL suman 28 grants: 14 `OWNER` de grupos de proyecto, 7 `READER` de grupo de proyecto y 7 `OWNER` de una única identidad representada como usuario. No hay grants `allUsers` ni `allAuthenticatedUsers`.

La identidad propietaria de los 7 objetos sí coincide, normalizada en memoria, con una cuenta de servicio enlazada en IAM al rol `roles/firebasestorage.serviceAgent`; no coincide con la cuenta activa de esta auditoría. Por tanto, la afirmación anterior de que ese propietario no estaba mapeado en IAM era incorrecta. La evidencia no justifica revocar ese grant. Las ACL de grupos de proyecto, `uniformBucketLevelAccess=false` y las 20 concesiones históricas exclusivamente por ACL siguen requiriendo revisión; esta identificación no prueba qué identidad realizó aquellas solicitudes.

La configuración actual conserva `publicAccessPrevention=inherited` y soft delete de siete días. El proyecto no tiene `auditConfigs` para `storage.googleapis.com`; la consulta de logs no devolvió eventos de borrado de objetos, pero esa ausencia no demuestra que no ocurrieran porque Data Access no está habilitado. No se modificaron ACL, Storage, IAM ni datos. ADR-SAAS-111 sigue `Propuesto`; se debe retirar la alternativa de revocar una identidad supuestamente desconocida y reevaluar el alcance ACL/UBLA sin cambios productivos.
