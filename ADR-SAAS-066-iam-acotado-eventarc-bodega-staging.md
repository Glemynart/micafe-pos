# ADR-SAAS-066 — IAM acotado para el trigger Eventarc de Bodega en staging

- **Estado:** ACEPTADO.
- **Fecha:** 2026-10-09.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2` (Gate C/D/F).
- **Decisores:** responsable del proyecto; recomendación del Lead Engineer.
**Relacionados:** ADR-SAAS-049 y ADR-SAAS-065. Esta ADR reemplaza exclusivamente
la prohibición IAM de ADR-SAAS-065 para los tres bindings definidos aquí; las
demás decisiones de ADR-SAAS-065 permanecen vigentes.

El responsable del proyecto aprobó explícitamente la Opción 1 el 2026-10-09.
La decisión autoriza únicamente los tres bindings enumerados para
`micafe-pos-staging`; cualquier otro principal o binding queda fuera de
alcance. La aceptación no declara `PREFLIGHT = PASS` ni autoriza un deploy antes
de completar Gate C. No autoriza cambios a Rules, Secrets, producción o tenant
real.

## Contexto

PR #499 integró en `main @ 705585c90afe3fe6fca8ce44067b19ff22186158` el trigger
Gen 2 `notificarSolicitudVentaBodegaPendienteV1` (`onDocumentCreated`) para
despachar rápidamente el outbox durable aprobado por ADR-SAAS-065. El Scheduler
existente continúa como recuperación. El proyecto staging tiene 42 Functions,
ninguna con trigger de evento; `saas-bodega` tiene 15 callables y un Scheduler.
El trigger nuevo todavía no está desplegado.

El preflight local inspeccionó Firebase CLI 15.32.1. Al añadir el primer
servicio de eventos Firestore, `ensureServiceAgentRoles` prepara estos tres
bindings de proyecto si no existen:

| Rol | Principal | Propósito |
|---|---|---|
| `roles/iam.serviceAccountTokenCreator` | agente Pub/Sub `service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com` | Entrega autenticada del transporte de eventos |
| `roles/eventarc.eventReceiver` | cuenta Compute predeterminada `192423427245-compute@developer.gserviceaccount.com` | Recepción de eventos Eventarc |
| `roles/run.invoker` | la misma cuenta Compute predeterminada | Invocar el servicio Cloud Run de la Function |

El código de Firebase CLI fusiona esos bindings en la política IAM del proyecto
durante un deploy normal cuando faltan. La política leída en staging muestra
`roles/editor` en la cuenta Compute, pero no los bindings directos anteriores;
el agente Pub/Sub tampoco tiene el binding directo `roles/iam.serviceAccountTokenCreator`.
La cuenta de despliegue figura como `roles/owner`. No se ejecutó `deploy` ni
`deploy --dry-run`: las decisiones anteriores registran que dry-run puede
ocasionar preparación de APIs o identidades administradas y el ADR vigente
prohíbe cambios IAM.

ADR-SAAS-065 permite desplegar solo el codebase `saas-bodega` en staging y
excluye IAM. Esta ADR acepta una excepción estricta para los tres bindings
anteriores; Gate C sigue pendiente de demostrar el artefacto, el delta de
Functions/IAM y el rollback exactos antes de Gate D.

## Drivers

- Mantener la notificación durable de solicitud pendiente, sin esperar a la
  próxima ejecución del Scheduler.
- Limitar toda mutación a staging y a identidades de servicio; no agregar
  principales humanos ni permisos de producción.
- No relajar Rules ni añadir Secrets.
- Conservar una salida técnica documentada si el despliegue falla.

## Opciones consideradas

### Opción 1 — Permitir los bindings administrados mínimos en staging

Autorizar únicamente los tres roles y principales enumerados en esta ADR para
el despliegue de `notificarSolicitudVentaBodegaPendienteV1` en
`micafe-pos-staging`. Cualquier binding adicional —incluida una nueva
identidad/función de servicio Eventarc— detiene Gate D y requiere aprobación
separada. No se conceden roles a personas.

**Ventajas:** conserva el comportamiento inmediato aprobado por ADR-SAAS-065 y
la recuperación por Scheduler; permite a Firebase CLI configurar la frontera
Eventarc/Run requerida.

**Costos y riesgos:** modifica IAM de proyecto en staging; el token creator de
Pub/Sub y la cuenta Compute predeterminada deben auditarse explícitamente. Los
roles no se quitan automáticamente tras Gate F si el trigger sigue activo.

### Opción 2 — Mantener la prohibición de IAM y retirar el trigger inmediato

Sustituir el despacho inmediato por el Scheduler de cinco minutos y conservar
el outbox durable. Requiere una decisión arquitectónica que reemplace la
Opción 2 aceptada por ADR-SAAS-065 y puede retrasar el aviso hasta cinco minutos.

**Ventajas:** no agrega los tres bindings del preflight.

**Costos y riesgos:** cambia el requisito de baja latencia y deja de cumplir el
diseño implementado y ya integrado. No puede hacerse como ajuste silencioso.

### Opción 3 — Mantener Gate C/D detenidos

No cambiar arquitectura ni IAM hasta que exista otra ruta aprobada que cumpla
ADR-SAAS-065.

**Ventajas:** conserva íntegramente la frontera IAM actual.

**Costos y riesgos:** impide desplegar y validar Gate F; E2.2 no avanza a los
gates dependientes.

## Decisión aceptada

Se acepta la **Opción 1**, estrictamente acotada a staging y a los tres bindings
enumerados. Antes del deploy, Gate C debe demostrar con evidencia reproducible
el artefacto exacto, el delta de Functions, el rollback y que el delta IAM se
limita a esos roles y principales. Si Firebase/Google solicita otro rol,
principal, identidad administrada no contemplada o cambio de superficie, se
detiene Gate D sin aplicarlo y se requiere una decisión separada. La aceptación
no equivale a `PREFLIGHT = PASS`; eso requiere completar Gate C.

## Consecuencias de la decisión aceptada

- ADR-SAAS-065 conserva el despacho inmediato y la recuperación Scheduler;
  sonido y presentación continúan sujetos al navegador y sistema operativo.
- Solo cuando Gate C pase, Gate D podrá crear una Function de evento y
  actualizar únicamente el codebase `saas-bodega`.
- El rollback de código puede retirar el trigger nuevo y volver a la revisión
  previa, conservando solicitudes/outbox y sin borrar datos de negocio. Los
  bindings IAM no se eliminan automáticamente: cualquier limpieza posterior
  requiere comprobar que ningún consumidor los usa.
- La decisión no autoriza Rules, Secrets, tenant real, tráfico o recursos de
  producción.

## Referencias

- `ADR-SAAS-065-notificacion-solicitud-venta-bodega.md`.
- `docs/goals/evidence/G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR065-2026-10-09.md`.
- Firebase CLI 15.32.1, `lib/deploy/functions/checkIam.js`, inspeccionado sin
  ejecutar el deploy.
- [Cloud Functions for Firebase: Firestore triggers](https://firebase.google.com/docs/functions/firestore-events).
- [Eventarc: troubleshooting service-agent permissions](https://docs.cloud.google.com/eventarc/docs/troubleshooting).

---

**Decisión final:** aceptada explícitamente por el responsable del proyecto el
2026-10-09, con el alcance exacto de la tabla de bindings. Gate C sigue
pendiente de preflight final; Gate D no se ejecuta hasta que ese preflight
termine `PASS`.
