# Identidades runtime de Functions — revisión de solo lectura — 2026-11-27

## Hallazgo de producción

Consulta con `gcloud functions list` contra `micafe-pos`, región `us-central1`,
API v2. Resultado: 117 de 117 Functions aparecen `ACTIVE`; las 117 usan
`882525811433-compute@developer.gserviceaccount.com` como identidad runtime.
`gcloud projects get-iam-policy` confirmó que esa cuenta conserva el binding
`roles/editor` en el proyecto.

La documentación de Cloud Run functions confirma que la identidad Compute
predeterminada es el runtime por defecto y que puede tener `Editor`; Google
recomienda sustituirlo por permisos de menor alcance y evaluar el cambio con
Policy Simulator antes de revocar permisos.

## Contraste de staging

En `micafe-pos-staging`, región `us-central1`, la consulta v2 devolvió 68
Functions `ACTIVE` en total. Las cuatro Functions legales observadas —
`consultarEstadoLegalTenant`, `aceptarDocumentosLegalesTenant`,
`tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas`— usan
`saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.

## Alcance, impacto y acción

- Son consultas de solo lectura; no se cambiaron bindings, despliegues, cuentas
  ni datos.
- El agente Firebase App Hosting
  `service-882525811433@gcp-sa-firebaseapphosting.iam.gserviceaccount.com`
  aparece en la política IAM del proyecto con
  `roles/firebaseapphosting.serviceAgent`. Que no aparezca en
  `gcloud iam service-accounts list` no indica ausencia: Google documenta que
  ese comando lista cuentas administradas por el usuario, no agentes de
  servicio.
- La búsqueda de Audit Logs entre `2026-10-20T00:00:00Z` y
  `2026-11-28T00:00:00Z`, filtrada por `serviceusage.googleapis.com` y
  `GenerateServiceIdentity`, no devolvió eventos. Esto no permite atribuir ni
  fechar una llamada anterior. El binding confirma que el agente existe hoy;
  no prueba que la llamada de la incidencia concluyera ni que el error interno
  de Cloud Run esté resuelto.
- El piloto de menor privilegio para `saas-legal` está comprobado en staging,
  pero no cambia la identidad de las otras 64 Functions allí ni las 117 de
  producción.
- Producción sigue bloqueada por el runtime común con `roles/editor`. No se
  migra como parte de este corte porque el gate aprobado habilitó el piloto en
  staging únicamente; un despliegue a producción requiere completar el diseño,
  inventario de permisos, simulación de impacto, plan de reversión y autorización
  operativa de ese entorno.
- El estado de `GenerateServiceIdentity` sigue sin resolución verificable. Las
  búsquedas anteriores no devolvieron eventos correlacionados, lo cual no prueba
  que la identidad no se haya creado ni que el problema esté corregido.

## Reconciliación de codebases y alcance de la identidad — 2026-11-27

Nueva consulta read-only con `gcloud functions list --v2` y políticas IAM de
proyecto. Los nombres y conteos de abajo son los observados, no permisos inferidos
por nombre:

| Codebase activo en producción | Functions | Identidad runtime observada |
| --- | ---: | --- |
| `saas-auth` | 65 | Compute predeterminada |
| `saas-bodega` | 23 | Compute predeterminada |
| `saas-bodega-operations` | 8 | Compute predeterminada |
| `saas-platform-credential-recovery` | 3 | Compute predeterminada |
| `saas-commercial` | 2 | Compute predeterminada |
| `saas-legal` | 2 | Compute predeterminada |
| `saas-platform-resources` | 2 | Compute predeterminada |
| `saas-platform-tenant-access` | 2 | Compute predeterminada |
| `saas-bodega-membership` | 1 | Compute predeterminada |
| `saas-bootstrap` | 1 | Compute predeterminada |
| `saas-operational-activation` | 1 | Compute predeterminada |
| `saas-operational-auth` | 1 | Compute predeterminada |
| `saas-operational-onboarding` | 1 | Compute predeterminada |
| `saas-operator-summary` | 1 | Compute predeterminada |
| `saas-platform-context` | 1 | Compute predeterminada |
| `saas-tenant-configuration` | 1 | Compute predeterminada |
| `saas-tenant-credential-recovery` | 1 | Compute predeterminada |
| `saas-tenant-profile` | 1 | Compute predeterminada |
| **Total activo** | **117** | **117 Compute predeterminada** |

`firebase.json` declara además `saas-dusema-binding`, `saas-dusema-platform` y
`saas-platform-financial-account-provisioning`, sin Functions activas de esos
codebases en producción en esta consulta. No se deben desplegar por inferencia.

En staging se observaron 68 Functions en 20 codebases: 64 usan
`192423427245-compute@developer.gserviceaccount.com` y cuatro de `saas-legal`
usan `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`. La cuenta
Compute de staging conserva bindings directos `roles/editor`,
`roles/eventarc.eventReceiver` y `roles/run.invoker`. La cuenta dedicada legal
tiene el rol personalizado `projects/micafe-pos-staging/roles/saasLegalRuntime`
(etapa `BETA`) con siete permisos: lectura de base y entidades de Firestore,
crear/consultar/listar/actualizar/borrar entidades, y consultar usuarios de
Firebase Auth. Esto verifica el piloto desplegado, pero no certifica permisos
mínimos para los otros codebases.

## Inventario de permisos y propuesta gradual

| Elemento | Estado de evidencia | Resultado operativo |
| --- | --- | --- |
| Identidad actual | Confirmada por configuración v2 de cada Function. | 117/117 comparten una cuenta de runtime; cualquier permiso suyo alcanza las 117. |
| Binding IAM directo | `roles/editor` confirmado para la cuenta Compute de producción en la política del proyecto. | El rol permite más administración de proyecto que la ejecución de Functions necesita; el conjunto excedente exacto no se ha simulado por flujo. |
| Permisos necesarios por función | Pendientes de inventario estático de llamadas Admin SDK, integraciones, triggers, secretos y dependencias de Scheduler, seguido de prueba por codebase. | No afirmar aún una matriz exacta de `allow` por codebase ni retirar `Editor`. |
| Asignaciones heredadas y recursos fuera de Cloud Run | No certificados: la lectura de la política de proyecto no inventaría IAM de cada recurso; Cloud Asset Inventory/Compute Engine no se habilitaron para este trabajo. Se observaron seis jobs de Scheduler productivos con OIDC de la cuenta compartida. | Falta resolver cualquier uso fuera de Functions antes de migrar o quitar el binding compartido. |
| Simulación y observabilidad | Policy Simulator, análisis de grant efectivo y pruebas de revocación no ejecutados. | El piloto de staging no sustituye esas comprobaciones productivas. |

### Permisos mínimos candidatos — sujetos a comprobación

- Crear una service account por codebase/grupo de despliegue, sin roles de
  despliegue ni `Owner`/`Editor` en runtime.
- Conceder acceso a Firestore solo cuando el código de ese grupo lo requiera;
  revisar CRUD, transacciones, queries y triggers por separado. Las Rules no
  restringen las llamadas de Admin SDK, por lo que la separación tenant sigue
  perteneciendo a la aplicación y debe mantenerse en pruebas.
- Conceder Firebase Auth Admin únicamente a endpoints que ejecutan operaciones
  Admin concretas (por ejemplo, búsqueda, creación, actualización o revocación
  de credenciales); validar las acciones exactas contra cada codebase.
- Revisar Storage, Secret Manager, Cloud Tasks, Pub/Sub/Eventarc y Scheduler como
  dependencias independientes; añadir solo permisos requeridos por los
  triggers/clientes existentes y sus identidades de invocación. No asignar esos
  permisos en bloque a las 117 Functions.
- Usar primero la identidad `saas-legal-runtime` de staging como patrón
  comprobado, no copiar su rol a codebases que tengan otras dependencias.

### Migración propuesta y rollback

1. Inventariar, para cada uno de los 18 codebases activos, llamadas Admin SDK,
   triggers, secretos, APIs externas, tareas programadas y asignaciones de IAM;
   cruzar los findings con Audit Logs disponibles, sin habilitar APIs ni cambiar
   producción.
2. Derivar un rol y una identidad separados por grupo; ejecutar análisis de
   políticas y pruebas de Emulator/estaging, incluido smoke de flujos críticos.
3. Tras autorización operativa de producción, desplegar un codebase cada vez con
   su nueva cuenta; comparar errores y registros antes de seguir. Mantener
   `roles/editor` en la cuenta antigua mientras cualquier Function o job la use.
4. Solo con inventario completo y evidencia sin dependencias, solicitar una
   autorización separada para retirar `roles/editor`; comprobar que las cuentas
   restantes no dependan de esa identidad.
5. Rollback por codebase: restaurar la identidad runtime anterior en el servicio
   de Cloud Run Functions y mantener vigente el binding original durante el
   periodo de observación. No borrar service accounts ni bindings comunes como
   parte del rollback inicial.

**Bloqueo vigente:** los permisos requeridos por codebase, IAM heredado/por
recurso y el análisis de impacto no están completos. Esta propuesta no autoriza
ningún cambio IAM en producción. La cuenta de producción y `roles/editor` siguen
sin cambios.

## Comandos de consulta

```powershell
gcloud functions list --project=micafe-pos --regions=us-central1 --v2 --format="json(name,state,serviceConfig.serviceAccountEmail)"
gcloud projects get-iam-policy micafe-pos --flatten="bindings[].members" --filter="bindings.role=roles/editor AND bindings.members:serviceAccount:882525811433-compute@developer.gserviceaccount.com" --format="value(bindings.role,bindings.members)"
gcloud functions list --project=micafe-pos-staging --regions=us-central1 --v2 --format="json(name,state,serviceConfig.serviceAccountEmail)"
```

## Reconsulta de bindings `roles/editor` — 2026-11-27T23:30Z

Una reconsulta read-only de `gcloud projects get-iam-policy micafe-pos`,
aplanando miembros y filtrando `roles/editor`, encontró tres bindings de nivel
proyecto:

| Miembro | Relación observada con Functions |
| --- | --- |
| `serviceAccount:882525811433-compute@developer.gserviceaccount.com` | Identidad runtime de las 117 Functions v2 activas |
| `serviceAccount:882525811433@cloudservices.gserviceaccount.com` | Uso por workload no atribuido en esta consulta |
| `serviceAccount:micafe-pos@appspot.gserviceaccount.com` | Uso por workload no atribuido en esta consulta |

Los dos últimos miembros amplían el inventario de bindings de proyecto frente a
la síntesis inicial. No se verificó su uso efectivo ni se les retiró permiso; no
se deben tratar como cuentas sin uso. Sigue pendiente atribuirlos a workloads y
terminar el inventario de permisos por codebase, recursos heredados, Policy
Simulator y rollback. No hubo cambios IAM ni despliegues productivos.

## Fuentes oficiales

- [gcloud functions list](https://docs.cloud.google.com/sdk/gcloud/reference/functions/list)
- [Identidad de Cloud Run functions](https://docs.cloud.google.com/functions/docs/concepts/iam)
- [Configurar identidad de Functions](https://docs.cloud.google.com/functions/docs/securing/function-identity)
- [Tipos de cuentas de servicio y agentes de servicio](https://docs.cloud.google.com/iam/docs/service-account-types)
