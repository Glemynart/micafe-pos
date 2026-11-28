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
- La regla de Storage desplegada, creada el 2026-08-14, tiene el mismo SHA-256 que `storage.rules` en esta rama. Las reglas permiten lectura pública en `landing`, `marketing`, `eventos` y `reservas`, y niegan otras rutas. El código encontrado carga archivos en `eventos` y `productos`; no se halló una carga que use `reservas`.

Cloud Storage autoriza si IAM **o** ACL concede el acceso. Firebase Storage Rules controlan solicitudes cursadas por APIs de Firebase; el acceso directo a Cloud Storage también depende de IAM y ACL. La telemetría confirma uso de ACL para conceder acceso, pero no determina si esas solicitudes fueron públicas, de identidades autorizadas o de objetos que ya no están activos. El censo de objetos activos no halló grants públicos, pero las 20 solicitudes históricas quedan sin atribución. No se confirma una exposición anónima; tampoco puede descartarse para objetos históricos. No se puede certificar aislamiento solo con Firebase Rules mientras no se expliquen esas solicitudes.

La guía de Google recomienda Uniform bucket-level access (UBLA) para reducir exposiciones por ACL, pero exige comprobar uso de ACL y mapear permisos antes de habilitarlo. UBLA desactiva ACL y no puede revertirse después de 90 días consecutivos. La telemetría confirma 20 solicitudes concedidas exclusivamente por ACL en el periodo consultable; la identidad y los objetos afectados siguen pendientes de atribución.

## Decisión requerida

Definir cómo eliminar o limitar la autorización paralela por ACL sin romper los flujos autorizados ni hacer cambios no reversibles sin inventario.

## Alternativas

### A. Migrar gradualmente a UBLA — recomendada

Primero comprobar métricas de uso ACL del periodo disponible, revisar IAM heredado y validar en un bucket de staging dedicado con las mismas rutas, identidades y reglas. Identificar permisos que hoy solo procedan de ACL y asignar equivalentes mínimos cuando sean necesarios. Después, en una operación productiva separada y aprobada, habilitar UBLA y verificar acceso privado, contenido público, rollback y logs. La reversión solo está disponible antes de 90 días con UBLA activo; se debe fijar una revisión antes de ese límite.

Ventaja: elimina el canal paralelo ACL y converge en IAM. Riesgo: al habilitarlo se revocan permisos concedidos solo por ACL y, tras 90 días, no se puede volver a ACL. Preflight y prueba de staging son obligatorios.

### B. Cambiar solo la ACL predeterminada de objetos

Aplicar una ACL más restrictiva a cargas nuevas. No corrige ACLs ya asignadas a objetos existentes y mantiene habilitada la administración de ACL; es mitigación parcial y no basta para certificar aislamiento.

### C. Mantener ACL y basarse en Firebase Rules

No cambia infraestructura, pero conserva permisos ACL que podrían autorizar acceso por otras APIs. No resuelve la frontera observada.

## Recomendación e invariantes

Recomiendo **A**, condicionada a explicar el uso ACL observado y validar un bucket de staging antes de cualquier cambio productivo.

- No enumerar ni descargar contenido de clientes; el preflight ejecutado solo leyó metadata ACL y emitió conteos anonimizados.
- La jerarquía de proyecto se comprobó y no tiene ancestros; atribuir las solicitudes ACL históricas sin exponer nombres o correos en evidencia.
- Mantener sin cambios Firebase Rules y cargas hasta validar identidades y flujos por ruta.
- Confirmar compatibilidad con las descargas firmadas de la aplicación y procesos administrativos.
- Registrar la ventana de reversión de 90 días y verificar que no haya dependencia de ACL tras habilitar UBLA.
- No conceder `allUsers` ni `allAuthenticatedUsers`.

## Alcance de una eventual aprobación

La aprobación permitiría completar la atribución metadata mínima del uso ACL, preparar una prueba sintética en un bucket de staging y recomendar un plan reversible. No autoriza cambiar el bucket productivo, descargar contenido, crear accesos públicos, desplegar producción ni borrar objetos. El cambio productivo requiere un preflight actualizado y autorización operativa separada.

## Referencias

- [Google Cloud: Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access).
- [Google Cloud: ACL y acceso predeterminado a objetos](https://docs.cloud.google.com/storage/docs/access-control/lists).
- [Firebase: Security Rules para Cloud Storage](https://firebase.google.com/docs/storage/security).
- `storage.rules` y el release `projects/micafe-pos/rulesets/1df06087-5bca-4822-ba5a-50ac951c9cf4`.
