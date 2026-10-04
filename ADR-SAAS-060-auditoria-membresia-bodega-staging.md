# ADR-SAAS-060 — Auditoría canónica de membresía Bodega en staging

## Estado

**ACEPTADO — 2026-10-04.**

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 —
Configuración inicial`.

La aceptación autoriza únicamente la implementación controlada del hecho
auditable de membresía Bodega y su integración con la frontera de ADR-SAAS-059.
No autoriza por sí sola deploy, tráfico, creación de fixture o tenant,
Bootstrap, Activation, cambios de Rules o IAM, ni producción.

## Contexto

ADR-SAAS-059 aprobó `saas-bodega-membership` para que un administrador Bodega
pueda cambiar exclusivamente el estado de otro vendedor de su mismo tenant. La
validación de ese ADR exige autoridad, aislamiento, idempotencia, claims y
auditoría.

La auditoría canónica de plataforma ya es append-only y se materializa mediante
`saas_auditoria_obligaciones` y `saas_auditoria`. Sin embargo, su contrato no
define todavía un tipo de hecho ni agregado para un cambio de estado de
membresía Bodega. Un `logger.info`, una escritura ad-hoc o reutilizar un tipo
de credencial no constituyen evidencia canónica y romperían la semántica de
ADR-SAAS-012.

## Decisión

Se extiende exclusivamente el contrato de auditoría canónica con:

```text
TipoAuditoria: MEMBRESIA_BODEGA_ESTADO_ACTUALIZADO
TipoAgregadoAuditoria: MEMBRESIA_BODEGA
```

`actualizarMembresiaBodegaV1` conserva la autoridad de ADR-SAAS-059 y acepta
únicamente el objetivo, el estado y el envelope canónico de comando:

```text
objetivoUid
estado: activa | inactiva
commandId
idempotencyKey
correlationId
causationId: string | null
motivoCodigo
```

Ninguno de esos campos determina Empresa, actor, rol, permisos, claims,
credencial o PIN. La Empresa y el actor se derivan de Auth y de la membresía
revalidada server-side. Solo el administrador activo de una Empresa
`BODEGA_MVP1` puede cambiar el estado de otro miembro con rol `vendedor` del
mismo tenant.

La operación crea, en la misma transacción que actualiza `estado` y `activo`,
una obligación de auditoría determinista por `empresaId + commandId`. La
evidencia registra actor, objetivo, estado anterior, estado solicitado,
`idempotencyKey`, correlación y motivo, sin credenciales, hashes, PINs ni
claims completos. La emisión append-only usa el mecanismo existente después de
la transacción.

Un replay con el mismo `commandId` y el mismo contenido confirmado no vuelve a
actualizar la membresía ni crea otra evidencia; reintenta de forma segura la
sincronización de claims y la emisión pendiente. El mismo `commandId` con
contenido distinto se rechaza como conflicto de idempotencia. Un comando nuevo
es un hecho distinto y conserva su propia evidencia.

La actualización de claims se conserva mediante la unidad neutral existente:
si el objetivo tiene el tenant afectado como contexto activo, una desactivación
revoca su sesión y elimina rol/Empresa de los claims tenant; una activación
restaura el rol `vendedor`. Si sus claims apuntan a otro tenant, no se alteran.

## Compatibilidad y límites

- ADR-SAAS-012 conserva auditoría backend-only, append-only y proyección
  sanitizada.
- ADR-SAAS-059 conserva sus roles Bodega (`admin`, `vendedor`), el endpoint
  único, cero Secrets y la prohibición de modificar roles o permisos.
- `actualizarMembresia` legacy permanece para verticales no Bodega; la UI
  Bodega no lo invoca ni puede usarlo como sustituto de esta frontera.
- No se modifica `saas-auth`, Rules, credenciales, incorporación, recuperación
  ni las operaciones de ventas/inventario Bodega.

## Implementación y validación requeridas

Un PR técnico posterior debe limitarse a:

1. extender los tipos de auditoría con los dos valores anteriores;
2. extraer una unidad neutral para el cambio transaccional de estado,
   idempotencia, obligación/evidencia y sincronización de claims;
3. conectar `saas-bodega-membership` y su UI con el envelope canónico; y
4. demostrar pruebas de autoridad, objetivo cruzado, vertical/rol inválidos,
   payload manipulado, replay, conflicto de idempotencia, claims y evidencia
   append-only, además de discovery/module-load sin Secrets.

El preflight posterior solo podrá desplegar
`saas-bodega-membership → actualizarMembresiaBodegaV1` y, en gate separado, el
update de `saas-operational-onboarding → crearIncorporacionDirecta`. No puede
haber deletes, replacements, codebases ajenos, tráfico manual ni producción.

## Alternativas rechazadas

| Alternativa | Resultado |
| --- | --- |
| Registrar solo en logs | Rechazada: no es evidencia append-only consultable ni idempotente. |
| Reutilizar un hecho de credencial | Rechazada: falsearía el agregado y la semántica de auditoría. |
| Escribir un documento de auditoría ad-hoc desde el handler | Rechazada: duplicaría ADR-SAAS-012 y el outbox canónico. |
| Omitir auditoría | Rechazada: incumple ADR-SAAS-059 y Gate F. |
| Extensión mínima del contrato canónico | Aceptada: conserva la frontera y permite evidencia transaccional reproducible. |

## Rollback y consecuencias

Antes del primer deploy, rollback es revertir el cambio técnico. Después de
deploy, rollback de revisión o tráfico requiere un gate operativo explícito.
La evidencia emitida y una desactivación de vendedor no se borran directamente;
se revierten únicamente mediante un nuevo comando canónico autorizado.

Esta decisión no cierra Gate E, Gate F, rehearsal, certificación, tenant real,
aceptación operativa ni producción.
