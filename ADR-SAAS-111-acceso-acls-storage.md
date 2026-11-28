# ADR-SAAS-111 — Alcance de ACL heredadas en Firebase Storage

## Estado

**Propuesto**, 2026-11-28. No cambiar ACL, IAM ni configuración del bucket hasta aprobar la decisión y completar el preflight técnico.

Goal: `G-SAAS-02 → M2 → E2.2`.

## Contexto y evidencia

La lectura de metadatos del bucket productivo `micafe-pos.firebasestorage.app` en `US-CENTRAL1` encontró:

- `uniformBucketLevelAccess=false` y `publicAccessPrevention=inherited`.
- La ACL predeterminada de objetos concede `READER` al grupo `projectViewer`; `projectEditor` y `projectOwner` reciben `OWNER`.
- IAM del bucket concede `roles/storage.legacyBucketReader` a `projectViewer`. La jerarquía Resource Manager devuelve solo el proyecto, sin carpeta u organización padre. La política directa del proyecto muestra tres cuentas de servicio con `roles/editor`, un usuario con `roles/owner`, y ningún miembro/grupo con `roles/viewer`, `roles/storage.objectViewer` o `roles/storage.legacyObjectReader`.
- Cloud Monitoring, para los 24 meses terminados en `2026-11-28T07:57:51Z`, registra 20 operaciones `OBJECT_ACCESS_REQUIRED_OBJECT_ACL` y 20 solicitudes concedidas exclusivamente por ACL de objeto. Las métricas agregadas no identifican objetos ni solicitantes.
- Se consultó metadata ACL, sin descargar contenidos, para los 7 objetos activos del bucket. Todos tienen `projectViewers:READER`, `projectEditors:OWNER`, `projectOwners:OWNER` y un propietario `user` directo. No apareció `allUsers` ni `allAuthenticatedUsers` en esos 7 objetos; no se guardaron nombres ni identidades. No se consultaron generaciones históricas ni objetos en soft delete.
- La política efectiva `constraints/storage.publicAccessPrevention` no está marcada `enforced`.
- La política de auditoría del proyecto no contiene un bloque `auditConfigs` para `storage.googleapis.com`; no se inspeccionaron logs. La atribución histórica podría no estar disponible en auditoría de datos.
- Correlación minimizada a las 08:14 UTC: inicialmente se interpretó que la ACL `OWNER` de usuario no aparecía en IAM. La relectura posterior de las ACL con `projection=full` y su comparación normalizada con IAM corrigió esa interpretación: el principal coincide con una cuenta de servicio enlazada a `roles/firebasestorage.serviceAgent`. No coincide con el operador activo. El valor de identidad no se emitió ni conservó; véase la reconciliación al final de este ADR.
- La regla de Storage desplegada, creada el 2026-08-14, tiene el mismo SHA-256 que `storage.rules` en esta rama. Las reglas permiten lectura pública en `landing`, `marketing`, `eventos` y `reservas`, y niegan otras rutas. El código encontrado carga archivos en `eventos` y `productos`; no se halló una carga que use `reservas`.

Cloud Storage autoriza si IAM **o** ACL concede el acceso. Firebase Storage Rules controlan solicitudes cursadas por APIs de Firebase; el acceso directo a Cloud Storage también depende de IAM y ACL. La telemetría confirma uso de ACL para conceder acceso, pero no determina si esas solicitudes fueron públicas, de identidades autorizadas o de objetos que ya no están activos. El censo actual de 7 objetos no halló grants públicos. El `OWNER` directo de usuario está atribuido a una cuenta de servicio de Firebase Storage en IAM; no es evidencia de una identidad externa sin mapear. Las 20 solicitudes históricas siguen sin identidad ni objeto atribuible. No se confirma una exposición anónima ni se puede descartar una histórica. Firebase Rules por sí solas no gobiernan permisos directos concedidos por IAM o ACL.

La guía de Google recomienda Uniform bucket-level access (UBLA) para reducir exposiciones por ACL, pero exige comprobar uso de ACL y mapear permisos antes de habilitarlo. UBLA desactiva ACL y no puede revertirse después de 90 días consecutivos. La telemetría confirma 20 solicitudes concedidas exclusivamente por ACL en el periodo consultable; los solicitantes y objetos afectados siguen sin atribución. Tampoco se encontró configuración explícita de Data Access audit logs para Storage en el proyecto.

## Decisión requerida

Definir cómo eliminar o limitar la autorización paralela por ACL sin romper los flujos autorizados ni hacer cambios no reversibles sin inventario.

## Alternativas

### A. Migrar gradualmente a UBLA — estrategia objetivo, sujeta a preflight

Primero comprobar métricas de uso ACL del periodo disponible, revisar IAM heredado y validar en un bucket de staging dedicado con las mismas rutas, identidades y reglas. Identificar permisos que hoy solo procedan de ACL y asignar equivalentes mínimos cuando sean necesarios. Después, en una operación productiva separada y aprobada, habilitar UBLA y verificar acceso privado, contenido público, rollback y logs. La reversión solo está disponible antes de 90 días con UBLA activo; se debe fijar una revisión antes de ese límite.

Ventaja: elimina el canal paralelo ACL y converge en IAM. Riesgo: al habilitarlo se revocan permisos concedidos solo por ACL y, tras 90 días, no se puede volver a ACL. Preflight y prueba de staging son obligatorios.

### B. Revocar un grant directo `OWNER` no autorizado — no aplica al service agent identificado

La observación que motivó esta alternativa fue corregida: el grant `OWNER` presente en los siete objetos corresponde a una cuenta de servicio con `roles/firebasestorage.serviceAgent`. No se debe revocar ese grant como si fuera una identidad desconocida. Esta alternativa solo sería pertinente si una revalidación futura encuentra otro principal y el responsable confirma que no está autorizado; requeriría validar accesos e incluir rollback.

Ventaja: limitaría la revocación a un principal realmente no autorizado. Riesgo: revocar a ciegas puede interrumpir un acceso legítimo; no se propone para el service agent identificado.

### C. Cambiar solo la ACL predeterminada de objetos

Aplicar una ACL más restrictiva a cargas nuevas. No corrige ACLs ya asignadas a objetos existentes y mantiene habilitada la administración de ACL; es mitigación parcial y no basta para certificar aislamiento.

### D. Mantener ACL y basarse en Firebase Rules

No cambia infraestructura, pero conserva permisos ACL que podrían autorizar acceso por otras APIs. No resuelve la frontera observada.

## Recomendación e invariantes

No recomiendo revocar el `OWNER` atribuido al service agent. La decisión entre mantener las ACL de grupo o preparar una transición futura a UBLA requiere atribuir el uso histórico ACL tanto como permitan los logs, disponer de un bucket Firebase de staging y probar las rutas e identidades autorizadas. Esa prueba no puede realizarse con los buckets auxiliares existentes. No habilitar UBLA ni cambiar producción hasta completar preflight y aprobación operativa separada.

- No enumerar ni descargar contenido de clientes; el preflight ejecutado solo leyó metadata ACL y emitió conteos anonimizados.
- La jerarquía de proyecto se comprobó y no tiene ancestros; atribuir las solicitudes ACL históricas sin exponer nombres o correos en evidencia.
- Mantener sin cambios Firebase Rules y cargas hasta validar identidades y flujos por ruta.
- Confirmar compatibilidad con las descargas firmadas de la aplicación y procesos administrativos.
- Registrar la ventana de reversión de 90 días y verificar que no haya dependencia de ACL tras habilitar UBLA.
- No conceder `allUsers` ni `allAuthenticatedUsers`.

## Alcance de una eventual aprobación

La aprobación permitiría completar la atribución metadata mínima del uso ACL, preparar una prueba sintética en un bucket de staging y recomendar un plan reversible. No autoriza cambiar el bucket productivo, descargar contenido, crear accesos públicos, desplegar producción ni borrar objetos. El cambio productivo requiere un preflight actualizado y autorización operativa separada.

## Reconciliación factual posterior — 2026-11-28

La evidencia posterior en [`REVALIDACION-ACL-STORAGE-2026-11-28-0758Z.md`](docs/legal/evidence/REVALIDACION-ACL-STORAGE-2026-11-28-0758Z.md) corrige la atribución inicial: el grant `OWNER` que aparece en los siete objetos activos coincide con una cuenta de servicio enlazada al rol `roles/firebasestorage.serviceAgent`. No es una identidad ausente de IAM, y no hay base para revocarla como obsoleta. La alternativa B y la recomendación inicial de revocar ese grant quedan retiradas para ese principal.

Persisten la dependencia de ACL, `uniformBucketLevelAccess=false`, grupos de proyecto en las ACL predeterminadas y métricas históricas de 20 concesiones solo por ACL cuya identidad no se puede atribuir. El bucket Firebase de staging no existe y Data Access de Storage no está configurado en producción. Esta corrección factual no aprueba habilitar UBLA ni modificar producción; ADR-SAAS-111 sigue propuesto hasta rehacer su evaluación con evidencia y preflight adecuados.

## Referencias

- [Google Cloud: Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access).
- [Google Cloud: ACL y acceso predeterminado a objetos](https://docs.cloud.google.com/storage/docs/access-control/lists).
- [Firebase: Security Rules para Cloud Storage](https://firebase.google.com/docs/storage/security).
- `storage.rules` y el release `projects/micafe-pos/rulesets/1df06087-5bca-4822-ba5a-50ac951c9cf4`.
