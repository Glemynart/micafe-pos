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
  pero no cambia la identidad de las otras 113 Functions allí ni las 117 de
  producción.
- Producción sigue bloqueada por el runtime común con `roles/editor`. No se
  migra como parte de este corte porque el gate aprobado habilitó el piloto en
  staging únicamente; un despliegue a producción requiere completar el diseño,
  inventario de permisos, simulación de impacto, plan de reversión y autorización
  operativa de ese entorno.
- El estado de `GenerateServiceIdentity` sigue sin resolución verificable. Las
  búsquedas anteriores no devolvieron eventos correlacionados, lo cual no prueba
  que la identidad no se haya creado ni que el problema esté corregido.

## Comandos de consulta

```powershell
gcloud functions list --project=micafe-pos --regions=us-central1 --v2 --format="json(name,state,serviceConfig.serviceAccountEmail)"
gcloud projects get-iam-policy micafe-pos --flatten="bindings[].members" --filter="bindings.role=roles/editor AND bindings.members:serviceAccount:882525811433-compute@developer.gserviceaccount.com" --format="value(bindings.role,bindings.members)"
gcloud functions list --project=micafe-pos-staging --regions=us-central1 --v2 --format="json(name,state,serviceConfig.serviceAccountEmail)"
```

## Fuentes oficiales

- [gcloud functions list](https://docs.cloud.google.com/sdk/gcloud/reference/functions/list)
- [Identidad de Cloud Run functions](https://docs.cloud.google.com/functions/docs/concepts/iam)
- [Configurar identidad de Functions](https://docs.cloud.google.com/functions/docs/securing/function-identity)
- [Tipos de cuentas de servicio y agentes de servicio](https://docs.cloud.google.com/iam/docs/service-account-types)
