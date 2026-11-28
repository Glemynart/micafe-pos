# ADR-SAAS-105 — Identidades de runtime de Cloud Functions con mínimo privilegio

## Estado

**Aceptado para implementación y pruebas en Emulator/staging**, 2026-11-26.
El responsable eligió la alternativa C recomendada. No autoriza cambios IAM ni
despliegues en producción.

- Goal: `G-SAAS-02`.
- Milestone/Epic: `M2 → E2.2`, con impacto de seguridad transversal que debe
  quedar incluido en la planificación vigente antes de abrir un PR de migración.
- Fecha de propuesta y aceptación: 2026-11-26.
- Evidencia: [`PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md`](docs/legal/evidence/PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md).

## Contexto

Una consulta read-only de Cloud Functions v2 en `micafe-pos` encontró 117
funciones activas. Las 117 usan
`882525811433-compute@developer.gserviceaccount.com`. La política IAM del
proyecto asigna `roles/editor` a esa cuenta. Las funciones legales
`consultarEstadoLegalTenant` y `aceptarDocumentosLegalesTenant` también la usan.

La documentación de Cloud Run functions confirma que la cuenta Compute
predeterminada es la identidad runtime por defecto y que puede tener Editor;
Google recomienda sustituir ese rol por permisos menos amplios. `roles/editor`
permite a los workloads modificar muchos recursos del proyecto, no solo los
datos que requieren las operaciones POS. Además, Admin SDK no aplica Firestore
Rules: la validación server-side y el aislamiento de cada callable siguen siendo
necesarios cualquiera sea la identidad elegida.

La evidencia no demuestra abuso ni un acceso cruzado ocurrido. Sí demuestra un
radio de impacto mayor al necesario y una identidad compartida que impide
retirar Editor sin evaluar todos sus consumidores. Ningún cambio de IAM o de
runtime se ha ejecutado como parte de este hallazgo.

## Problema de decisión

¿Se mantiene la identidad Compute predeterminada con Editor para las Functions,
se migra todo a una cuenta dedicada compartida, o se separan las identidades y
permisos por codebase con una migración gradual y verificable?

## Alternativas

### A. Mantener el estado y aceptar el riesgo temporal

No cambia runtime ni IAM. Documenta la excepción y aplaza la mitigación.

- Ventaja: no introduce riesgo de indisponibilidad.
- Costo: las 117 funciones conservan permisos de Editor y un compromiso de
  cualquier workload que use la cuenta puede afectar otros servicios del
  proyecto.

### B. Una cuenta runtime dedicada común para todas las Functions

Cambiar las funciones a una cuenta administrada por el proyecto y retirar sus
permisos amplios de infraestructura, otorgando solo roles de datos y APIs que
requiera el conjunto.

- Ventaja: elimina la dependencia runtime de la cuenta predeterminada con
  Editor y es más sencilla de operar.
- Costo: toda Function comparte la unión de permisos y el mismo radio de impacto
  entre codebases; la superficie común sigue creciendo con cada capacidad.

### C. Cuentas runtime separadas por codebase — recomendada

Crear una identidad por cada codebase de Functions y asignar a cada una solo
los permisos justificados por su inventario de operaciones. Migrar por etapas:

1. Inventariar los 117 endpoints, codebases, llamadas a Firebase Admin/Google
   APIs, recursos externos y todos los demás workloads que usan la cuenta
   Compute predeterminada.
2. Construir una matriz de permisos por codebase, demostrada con código,
   pruebas y logs de staging. No conceder roles `Owner` o `Editor`.
3. Hacer un piloto de `saas-legal` en staging con una cuenta runtime propia y
   permisos mínimos para Firestore y la comprobación de revocación de Auth.
   Si las funciones necesitan permisos incompatibles o más amplios, detener el
   piloto y revisar la matriz.
4. Desplegar por codebase en staging, verificar los flujos y observar errores
   de autorización antes de migrar el siguiente grupo.
5. Migrar producción por codebase en un corte separado, con rollback probado.
   Mantener los permisos actuales de la cuenta Compute durante la transición.
6. Retirar `roles/editor` de la cuenta predeterminada solo tras verificar que
   ninguna Function, servicio Cloud Run, job, VM u otro workload activo la usa
   y que Policy Simulator no revela dependencias no cubiertas. Si esto requiere
   un corte adicional de IAM, aprobarlo como gate operativo separado.

- Ventaja: reduce el radio de impacto por dominio sin atribuir aislamiento de
  tenant a IAM.
- Costo: aumenta el número de identidades, bindings, mantenimiento y gates de
  despliegue; un permiso omitido puede interrumpir una operación del codebase
  afectado.

## Recomendación

Adoptar la alternativa C. Mantener el rol Editor actual solo mientras se
completa una migración ordenada. No cambiarlo directamente en producción: la
misma cuenta aparece en las 117 Functions y retirar el binding sin inventario
puede interrumpir operaciones críticas.

El permiso de Firestore seguirá siendo de alcance de proyecto si la API y el
modelo actuales lo requieren. La separación por codebase reduce privilegios de
infraestructura y el radio entre funciones, pero **no** sustituye las
comprobaciones de tenant de las callables ni promete una frontera IAM por
documento. Las Rules y las pruebas de aislamiento continúan siendo obligatorias.

## Consecuencias y límites

- La aceptación autoriza implementar la arquitectura y probarla en Emulator.
  El piloto de runtime en staging requiere crear una identidad, asignarle
  bindings IAM y desplegar el codebase como gate operativo separado. El
  responsable autorizó ese piloto únicamente para `micafe-pos-staging` el
  2026-11-26; su resultado y los límites de verificación están en
  [`RESULTADO-PILOTO-SAAS-LEGAL-STAGING-2026-11-26.md`](docs/legal/evidence/RESULTADO-PILOTO-SAAS-LEGAL-STAGING-2026-11-26.md).
  La autorización no incluye IAM ni despliegues en producción ni quitar el
  binding `roles/editor`.
- La matriz de permisos, nombres de cuentas y roles concretos se deben incluir
  en un PR de implementación revisable antes de crear las cuentas o bindings.
- Los permisos runtime deben distinguirse de permisos de despliegue y de roles
  de agentes de servicio. No se cambiarán roles de service agents.
- El rollback de cada codebase restaura su runtime previo mientras el binding
  Compute Editor siga presente. El rollback no incluye eliminar nuevas cuentas
  o bindings sin comprobar sus consumidores.
- Un hallazgo del Policy Simulator o un permiso requerido que no esté en la
  matriz detiene únicamente el codebase afectado; no se agrega Editor como
  solución automática.
- No se incorporan secretos, tokens, contenido de tenants ni PII a la matriz.

## Referencias

- [Cloud Run functions — control de acceso IAM y cuentas runtime](https://docs.cloud.google.com/functions/docs/concepts/iam).
- [Cloud IAM — tipos de cuentas de servicio](https://docs.cloud.google.com/iam/docs/service-account-types).
- [Cloud Firestore — roles y permisos IAM](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore).
- Firebase Functions v2 `HttpsOptions.serviceAccount`, definición oficial:
  <https://github.com/firebase/firebase-functions/blob/master/src/v2/providers/https.ts>.
- `ADR-SAAS-066` y `ADR-SAAS-067`, alcance anterior y limitado a staging para
  identidades Eventarc/Pub/Sub; no autorizan esta migración ni producción.
