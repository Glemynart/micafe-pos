# G-SAAS-02 / M2 / E2.2 — Aceptación ADR-SAAS-067 (2026-10-09)

## Dictamen

`ADR-SAAS-067 = ACEPTADO`, Opción 1, por aprobación explícita del responsable
del proyecto el 2026-10-09. La decisión amplía únicamente el IAM de staging
requerido para el trigger de notificaciones de solicitudes de venta Bodega.
No es evidencia de que las identidades existan, de que los roles estén
concedidos, ni de que el preflight o despliegue hayan sido ejecutados.

## Alcance aprobado

Proyecto único: `micafe-pos-staging` (project number `192423427245`).

| Servicio | Principal exacto | Único rol autorizado |
|---|---|---|
| Pub/Sub | `service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com` | `roles/pubsub.serviceAgent` |
| Eventarc | `service-192423427245@gcp-sa-eventarc.iam.gserviceaccount.com` | `roles/eventarc.serviceAgent` |

Se permite solicitar idempotentemente la generación de esos dos agentes y
asignar los roles de la tabla solo si faltan. Se conservan exactamente los tres
bindings de ADR-SAAS-066: Pub/Sub `roles/iam.serviceAccountTokenCreator` y la
cuenta Compute predeterminada `roles/eventarc.eventReceiver` y
`roles/run.invoker`. El resultado autorizado acumulado es dos service agents y
cinco bindings de proyecto; no se autoriza otro principal, rol, proyecto,
codebase, API, Rules, Secret, tenant real ni producción.

Cualquier delta adicional durante el preflight detiene Gate D y requiere una
decisión separada. La aceptación no sustituye la evidencia de Gate C sobre el
artefacto exacto, cambios de Functions, IAM efectivo y rollback.

## Estado de gates al checkpoint

- **Gate C:** no `PASS`. La aprobación elimina el bloqueo de autorización para
  los dos agentes; resta integrar esta decisión con CI post-merge y repetir el
  preflight controlado sobre el SHA vivo. No se ejecutó un `--dry-run` en este
  checkpoint: Firebase CLI 15.32.1 solicita `generateServiceIdentity` para
  Pub/Sub y Eventarc antes de evaluar esa opción, por lo que no se tratará como
  read-only. Una ejecución posterior debe respetar el alcance exacto aprobado y
  detenerse ante cualquier delta adicional.
- **Gate D:** `NOT EXECUTED` para el trigger de
  `notificarSolicitudVentaBodegaPendienteV1`.
- **Gate F:** `EN CURSO`, no `PASS`; véase el estado vivo de
  [`GOAL-MVP-COMERCIAL.md`](../GOAL-MVP-COMERCIAL.md).
- **Producción/tenant real:** fuera del alcance y sin cambios autorizados.

## Integración documental y verificación

- ADR-SAAS-066 fue integrado por PR #500 en
  `main @ 29fdadf0441b660dc4114edf6fd12cadc2365530`; su CI post-merge
  `37892240442` terminó `success`.
- PR #501 integró la corrección de serialización de timestamps del historial
  Backoffice en `main @ affb024d8621e13c47c022db7f314eb7534e8553`. Su CI
  post-merge `37895111671` estaba `in_progress` al preparar esta evidencia; se
  actualizará el registro al conocer su conclusión. No afecta el estado del
  preflight de Gate C.
- Archivos sincronizados por la aceptación: ADR-SAAS-067, estado vivo del Goal,
  esta evidencia y la fila de alcance del `MASTER-SECURITY-PLAN.md`.
- MT SaaS y R1 no se modifican: no se cambia la frontera de tenancy ni la
  autoridad de las operaciones críticas del dominio.
- `git diff --check`: `PASS` en el árbol documental de esta rama.

## Auditoría de mutaciones

- GitHub y Git local: lecturas de estado/merge/checks, más cambios documentales
  locales para revisión mediante PR.
- `micafe-pos-staging`: generación de identidades `0`; cambios IAM `0`; deploy
  `0`; cambios a Functions/tráfico/Rules/Secrets `0`.
- Tenant real y producción: cambios `0`.

**Resultado de auditoría del alcance de esta evidencia:** aprobación registrada;
preflight y despliegue siguen pendientes. No declara cierre de Gate C, D, F ni
E2.2.
