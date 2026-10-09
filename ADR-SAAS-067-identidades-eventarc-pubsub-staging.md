# ADR-SAAS-067 — Identidades administradas para el trigger de Bodega en staging

- **Estado:** PROPUESTO.
- **Fecha:** 2026-10-09.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2` (Gate C/D/F).
- **Decisores:** responsable del proyecto; recomendación del Lead Engineer.
- **Relacionado:** ADR-SAAS-065 y ADR-SAAS-066.

## Contexto

ADR-SAAS-066 aceptó únicamente tres bindings directos para desplegar el trigger
de solicitudes de venta en `micafe-pos-staging`. La inspección del Firebase CLI
15.32.1 reveló que el preflight Gen 2 también invoca
`services.generateServiceIdentity` para Pub/Sub y Eventarc antes de evaluar
`--dry-run`. La política leída no contiene `roles/pubsub.serviceAgent` ni
`roles/eventarc.serviceAgent`; el inventario no devolvió los agentes esperados.
La consulta de uno de ellos no pudo confirmar existencia por falta de
`iam.serviceAccounts.get`. No se ha ejecutado el POST ni se ha hecho un deploy.

La documentación oficial de Google indica que los agentes de servicio creados
explícitamente a solicitud del usuario no reciben automáticamente sus roles
predeterminados; esos roles deben concederse para que el servicio funcione. La
aprobación de ADR-SAAS-066 no incluye creación de estas identidades ni los roles
de agente de servicio. Gate C y, por dependencia, Gate D permanecen detenidos.

## Problema de decisión

¿Se amplía de forma explícita y limitada la autorización de staging para
provisionar los dos agentes de servicio requeridos y otorgar solo sus roles
predeterminados, manteniendo los tres bindings ya aprobados, o se conserva el
bloqueo/retira el trigger inmediato?

## Opciones

### Opción 1 — Provisionamiento explícito mínimo (recomendada)

Autorizar en `micafe-pos-staging` únicamente la generación idempotente de:

| Servicio | Principal esperado | Único rol de agente autorizado |
|---|---|---|
| Pub/Sub | `service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com` | `roles/pubsub.serviceAgent` |
| Eventarc | `service-192423427245@gcp-sa-eventarc.iam.gserviceaccount.com` | `roles/eventarc.serviceAgent` |

Se conservan, sin ampliarlos, los tres bindings de ADR-SAAS-066. La autorización
no incluye otros agentes, identidades, roles, principales, APIs, Rules, Secrets,
tenant real o producción. Si Firebase CLI propone cualquier delta adicional,
se detiene el deploy y se presenta otra decisión.

**Ventaja:** permite completar el preflight de Gate C y, si su delta final es
exacto, ejecutar el Gate D staging del trigger inmediato ya aprobado por
ADR-SAAS-065.

**Riesgo/costo:** crea o reconcilia dos identidades administradas y modifica
IAM de proyecto en staging con dos roles de agente de servicio. Las identidades
no se borran como parte del rollback del código.

### Opción 2 — Mantener los tres bindings y no desplegar el trigger

Conservar exactamente ADR-SAAS-066; Gate C/D permanecen bloqueados para este
artefacto. El despacho inmediato de nuevas solicitudes no queda validado; usar
solo la recuperación periódica requeriría revisar ADR-SAAS-065 y su latencia.

**Ventaja:** no agrega identidades ni permisos IAM.

**Costo:** no habilita la notificación inmediata de solicitudes y no permite
cerrar los gates que dependen de ese despliegue.

## Recomendación

Recomiendo la **Opción 1** por ser el delta adicional mínimo que corresponde a
los dos servicios que Firebase CLI solicita explícitamente, siempre sujeto a
la aprobación del responsable. La autorización no existe hasta que el usuario
acepte esta ADR. No se ejecutará `--dry-run`, generación de identidades, cambio
IAM ni deploy mientras permanezca `PROPUESTO`.

Si se aprueba, se cambiará su estado a `ACEPTADO` y se actualizarán los
documentos maestros antes de reanudar Gate C. La aceptación de la ADR tampoco
declara Gate C `PASS`: el preflight aún debe demostrar el delta exacto y el
rollback antes de Gate D.

## Referencias

- `ADR-SAAS-065-notificacion-solicitud-venta-bodega.md`.
- `ADR-SAAS-066-iam-acotado-eventarc-bodega-staging.md`.
- `docs/goals/evidence/G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR065-2026-10-09.md`.
- Google Cloud: [Create and grant roles to service agents](https://docs.cloud.google.com/iam/docs/create-service-agents?hl=en).
- Service Usage: [services.generateServiceIdentity](https://cloud.google.com/service-usage/docs/reference/rest/v1beta1/services/generateServiceIdentity).
