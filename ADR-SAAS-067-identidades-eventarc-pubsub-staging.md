# ADR-SAAS-067 — Identidades administradas para el trigger de Bodega en staging

- **Estado:** ACEPTADO.
- **Fecha:** 2026-10-09.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2` (Gate C/D/F).
- **Decisores:** responsable del proyecto; recomendación del Lead Engineer.
- **Relacionado:** ADR-SAAS-065 y ADR-SAAS-066.

El responsable del proyecto aprobó explícitamente la **Opción 1** el
2026-10-09. La autorización se limita a los dos agentes de servicio y sus dos
roles predeterminados enumerados abajo en `micafe-pos-staging`, además de los
tres bindings exactos ya aceptados en ADR-SAAS-066. Esta decisión complementa
esa excepción; no autoriza ningún otro principal, rol, API, cambio a Rules o
Secrets, tenant real ni producción.

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

La **Opción 1** fue aprobada explícitamente por el responsable el 2026-10-09.
La aceptación documental no declara Gate C `PASS` ni es por sí sola evidencia
de que las identidades o bindings existan. Antes de Gate D, el preflight debe
confirmar el delta exacto de Functions e IAM y el rollback. Si Firebase CLI
solicita cualquier identidad, rol, principal o superficie adicional, el
despliegue se detiene y se requiere una decisión separada.

La autorización permite solicitar de manera idempotente la generación de los
dos service agents indicados y, únicamente si faltan, asignarles sus roles
predeterminados indicados. No se ejecutaron todavía `--dry-run`, generación de
identidades, cambios IAM ni deploy; la autorización operativa se ejercerá
después de integrar esta decisión y completar el preflight controlado.

## Decisión aceptada

Se acepta la **Opción 1**, con este alcance acumulado y cerrado para el
artefacto de ADR-SAAS-065 en `micafe-pos-staging`:

1. Solicitar la generación idempotente de los agentes Pub/Sub y Eventarc con
   los principals exactos de la tabla de Opción 1.
2. Asignar únicamente `roles/pubsub.serviceAgent` al agente Pub/Sub y
   `roles/eventarc.serviceAgent` al agente Eventarc, si esos bindings faltan.
3. Conservar, sin ampliar, los tres bindings de ADR-SAAS-066.
4. Detener el preflight/deploy si aparece cualquier delta IAM, identidad,
   principal o superficie distinto a los anteriores.

La Opción 1 fue aprobada por el responsable del proyecto el 2026-10-09. No se
autoriza producción, tenant real, otros proyectos, otros codebases, Rules,
Secrets ni tráfico productivo. Gate C debe producir `PREFLIGHT = PASS` antes
de cualquier despliegue; Gate D y Gate F siguen abiertos.

## Consecuencias de la decisión aceptada

- ADR-SAAS-065 y ADR-SAAS-066 permanecen vigentes, extendidas solo por las dos
  identidades y roles de esta ADR; el resultado acumulado son exactamente cinco
  bindings de proyecto y dos service agents autorizados en staging.
- El preflight final aún debe probar idempotencia, delta de Functions, IAM
  efectivo y rollback; la aceptación no ejecuta ninguna mutación remota.
- No se agrega permiso humano ni se amplía la autoridad de runtime de la
  aplicación más allá de los service agents explícitos.
- Cualquier diferencia frente al alcance exacto requiere detenerse y abrir
  una decisión nueva antes de aplicar cambios.

## Referencias

- `ADR-SAAS-065-notificacion-solicitud-venta-bodega.md`.
- `ADR-SAAS-066-iam-acotado-eventarc-bodega-staging.md`.
- `docs/goals/evidence/G-SAAS-02-E2-2-ADR-SAAS-067-ACCEPTANCE-2026-10-09.md`.
- `docs/goals/evidence/G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR065-2026-10-09.md`.
- Google Cloud: [Create and grant roles to service agents](https://docs.cloud.google.com/iam/docs/create-service-agents?hl=en).
- Service Usage: [services.generateServiceIdentity](https://cloud.google.com/service-usage/docs/reference/rest/v1beta1/services/generateServiceIdentity).
