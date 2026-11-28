# Revalidación ACL de Firebase Storage — 2026-11-28 07:58 UTC

**Entorno:** producción `micafe-pos`, bucket `micafe-pos.firebasestorage.app`.  
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

No se halló grant público en los 7 objetos activos consultados. Sí existe un grant directo `OWNER` de una identidad no mapeada en IAM en todos ellos. **No se puede certificar aislamiento ni declarar ausencia histórica de exposición:** Cloud Monitoring registra 20 accesos concedidos exclusivamente por ACL y no identifica los objetos o solicitantes. La configuración de auditoría de Storage no permite afirmar que exista una fuente histórica para atribuirlos. No se modificó Storage, IAM, Rules ni contenido productivo.

ADR-SAAS-111 continúa `Propuesto`: queda atribuir el uso ACL sin exponer PII y validar un bucket de staging antes de preparar cualquier cambio productivo.

## Correlación de grants OWNER — revalidación 2026-11-28 08:14 UTC

Se compararon en memoria las ACL de los siete objetos activos con las políticas IAM del proyecto y del bucket y con la identidad autenticada del operador. Una única identidad de tipo usuario tiene grant directo `OWNER` en los siete objetos; no aparece en ninguna política IAM actual y no coincide con la identidad operadora. El valor de identidad no se emitió ni conservó.

Esto confirma una ruta de acceso directa por ACL a los siete objetos para una cuenta no mapeada en las políticas IAM actuales. No se puede concluir que sea una cuenta obsoleta ni que su acceso carezca de autorización. No se confirmó grant público (`allUsers`/`allAuthenticatedUsers`). La corrección requiere verificar con el responsable si la cuenta conserva autorización y, de ser obsoleta, revocar esos grants con rollback documentado; no se hizo ninguna escritura.
