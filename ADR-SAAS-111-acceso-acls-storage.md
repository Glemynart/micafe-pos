# ADR-SAAS-111 — Alcance de ACL heredadas en Firebase Storage

## Estado

**Propuesto**, 2026-11-28. No cambiar ACL, IAM ni configuración del bucket hasta aprobar la decisión y completar el preflight técnico.

Goal: `G-SAAS-02 → M2 → E2.2`.

## Contexto y evidencia

La lectura de metadatos del bucket productivo `micafe-pos.firebasestorage.app` en `US-CENTRAL1` encontró:

- `uniformBucketLevelAccess=false` y `publicAccessPrevention=inherited`.
- La ACL predeterminada de objetos concede `READER` al grupo `projectViewer`; `projectEditor` y `projectOwner` reciben `OWNER`.
- IAM del bucket concede `roles/storage.legacyBucketReader` a `projectViewer`, además de roles heredados de propietario/editor. IAM directo del proyecto no mostró miembros directos con `roles/viewer`, `roles/storage.objectViewer` o `roles/storage.legacyObjectReader`; no se consultaron políticas heredadas de organización/carpeta ni identidades derivadas de grupos.
- No se observó `allUsers` ni `allAuthenticatedUsers` en la metadata consultada.
- La regla de Storage desplegada, creada el 2026-08-14, tiene el mismo SHA-256 que `storage.rules` en esta rama. Las reglas permiten lectura pública en `landing`, `marketing`, `eventos` y `reservas`, y niegan otras rutas. El código encontrado carga archivos en `eventos` y `productos`; no se halló una carga que use `reservas`.

Cloud Storage autoriza si IAM **o** ACL concede el acceso. Firebase Storage Rules controlan las solicitudes cursadas por APIs de Firebase; el acceso directo a Cloud Storage también debe evaluarse contra IAM y ACL. Por ello, un principal `projectViewer` efectivo podría leer objetos con la ACL predeterminada aunque una Firebase Rule limite la lectura por tenant. La revisión no demuestra que exista hoy un principal heredado que explote este camino ni que haya acceso anónimo. Sí deja una vía alternativa de autorización que impide certificar aislamiento únicamente con Firebase Rules.

La guía de Google recomienda Uniform bucket-level access (UBLA) para reducir exposiciones por ACL, pero exige comprobar uso de ACL y mapear permisos antes de habilitarlo. UBLA desactiva ACL y no puede revertirse después de 90 días consecutivos. No se consultó telemetría de uso ACL en este corte.

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

Recomiendo **A**, condicionada a medir el uso de ACL y validar un bucket de staging antes de cualquier cambio productivo.

- No enumerar, descargar ni modificar contenido de clientes para esta auditoría.
- No inferir ausencia de acceso heredado a partir de la política directa del proyecto; comprobar ancestros y grupos autorizados.
- Mantener sin cambios Firebase Rules y cargas hasta validar identidades y flujos por ruta.
- Confirmar compatibilidad con las descargas firmadas de la aplicación y procesos administrativos.
- Registrar la ventana de reversión de 90 días y verificar que no haya dependencia de ACL tras habilitar UBLA.
- No conceder `allUsers` ni `allAuthenticatedUsers`.

## Alcance de una eventual aprobación

La aprobación permitiría medir telemetría ACL, completar el inventario IAM heredado y preparar una prueba sintética en un bucket de staging. No autoriza cambiar el bucket productivo, leer datos reales, crear accesos públicos, desplegar producción ni borrar objetos. El cambio productivo requiere un preflight actualizado y autorización operativa separada.

## Referencias

- [Google Cloud: Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access).
- [Google Cloud: ACL y acceso predeterminado a objetos](https://docs.cloud.google.com/storage/docs/access-control/lists).
- [Firebase: Security Rules para Cloud Storage](https://firebase.google.com/docs/storage/security).
- `storage.rules` y el release `projects/micafe-pos/rulesets/1df06087-5bca-4822-ba5a-50ac951c9cf4`.
