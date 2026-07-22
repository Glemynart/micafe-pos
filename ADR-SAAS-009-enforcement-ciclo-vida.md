# ADR-SAAS-009 — Enforcement del ciclo de vida empresarial

## Estado

Aceptado. Extiende ADR-SAAS-003 y supersede únicamente dos puntos que ese ADR dejó
abiertos: la política exacta de `Suspendida` y el uso de claims de suscripción como
enforcement suficiente. Se conserva la separación entre lifecycle empresarial y
relación comercial.

## Contexto

ADR-SAAS-003 estableció dos máquinas distintas: `Empresa.estado` para acceso y datos, y
`Suscripcion.estado` para la relación comercial. También propuso proyectar el estado de
suscripción al token, pero dejó pendiente decidir si una empresa suspendida tendría
bloqueo total o modo de solo lectura.

Los ID tokens ya emitidos pueden permanecer vigentes después de suspender o cancelar
una empresa. Actualizar claims, cerrar una sesión o revocar tokens ayuda a propagar el
cambio, pero no garantiza por sí solo que una sesión existente pierda inmediatamente
la capacidad de escribir en Firestore.

## Problema

Se necesita un enforcement que:

- sea inmediato para sesiones ya emitidas;
- no confunda mora o cancelación comercial con conservación de datos;
- permita regularización administrativa sin reabrir el POS;
- aplique la misma política en backend y Firestore;
- evite que el cliente cambie el estado empresarial o se autoactive;
- registre transiciones, origen y motivo de forma auditable.

## Decisión

### Autoridad canónica

`empresas/{empresaId}.estado` es la única autoridad sobre acceso interactivo,
escrituras operativas y conservación. `suscripciones/{empresaId}` describe la relación
comercial y puede solicitar una transición mediante el servicio de lifecycle, pero no
autoriza directamente.

`membresias` continúa siendo autoridad de rol, permisos y estado de una persona dentro
del tenant. El acceso efectivo requiere simultáneamente una membresía válida y un
estado empresarial compatible.

### Claims como proyección temporal

Los claims siguen siendo autoridad del tenant activo y del rol proyectado. Pueden
incluir estado empresarial, modo de acceso o versión para navegación y UX, pero esas
proyecciones no sustituyen el documento canónico.

Una transición actualiza o revoca el contexto de sesión cuando corresponda, sin
depender de que todos los clientes renueven el token para que la restricción sea
efectiva.

### Matriz de acceso

| Estado empresarial | Acceso tenant | Escrituras |
|---|---|---|
| `trial` | Completo | Permitidas, sujetas a readiness y permisos |
| `activa` | Completo | Permitidas según rol/permisos |
| `suspendida` | Owner/admin en administración de solo lectura | Ninguna escritura operativa |
| `cancelada` | Sin acceso interactivo; exportación por backend | Ninguna |
| `archivada` | Solo plataforma o soporte autorizado | Ninguna |
| `eliminada` | Ninguno | Ninguna |

Los roles operativos no acceden al POS de una empresa suspendida. La exportación de una
empresa cancelada es una operación backend controlada, no lectura general del cliente.

### Enforcement en profundidad

- **Backend:** todo comando privilegiado y toda transición valida el estado canónico.
- **Firestore Rules:** además del aislamiento tenant y rol, bloquean escrituras cuando
  la empresa no está en `trial` o `activa`; aplican las restricciones de lectura de la
  matriz.
- **UI:** representa el modo de acceso y evita acciones inválidas, sin considerarse
  barrera de seguridad.
- **Sesión:** las transiciones provocan renovación o revocación para reducir contexto
  obsoleto.

El costo adicional de consultar estado canónico en operaciones protegidas se acepta
para cerrar la ventana de tokens antiguos. Esta lectura no reemplaza claims para
resolver tenant ni membresía; se limita al lifecycle.

### Servicio único de transiciones

Todas las transiciones empresariales pasan por un servicio backend que:

1. valida transición, actor y revisión actual;
2. registra origen y motivo;
3. actualiza `Empresa.estado`;
4. coordina la suscripción cuando la transición tiene origen comercial;
5. emite auditoría;
6. renueva o revoca contexto de sesión.

Las transiciones comerciales son propuestas al lifecycle. Una suscripción `active` no
reactiva automáticamente una empresa suspendida por seguridad, soporte o decisión de
plataforma sin validar que el bloqueo haya desaparecido.

### Conservación

Suspender, cancelar o archivar no elimina datos. `Eliminada` es la única transición de
purga y queda sujeta a política legal, auditoría y autorización de plataforma.

## Consecuencias

- La suspensión es inmediata incluso para tokens previamente emitidos.
- Owner/admin pueden consultar información necesaria para regularizar sin operar POS.
- Suscripción y empresa conservan responsabilidades distintas.
- Rules y backend deben compartir una matriz coherente y probarse juntos.
- El enforcement canónico añade lecturas y complejidad frente a claims-only.
- Las transiciones necesitan control de revisión para evitar carreras.
- Cancelación y archivo requieren superficies backend específicas para exportación y
  soporte.
- Los límites comerciales futuros siguen requiriendo enforcement propio; no se
  confunden con el lifecycle.

## Alternativas consideradas

- **Confiar solo en claims.** Rechazada: una sesión antigua conserva claims hasta
  renovar y puede mantener capacidad durante una ventana inaceptable.
- **Usar `Suscripcion.estado` como autoridad de acceso.** Rechazada: mezcla cobro con
  retención, soporte, seguridad y decisiones de plataforma.
- **Bloqueo total para `suspendida`.** Rechazada: impide consulta administrativa y
  regularización sin aportar protección adicional sobre las escrituras, que ya están
  bloqueadas.
- **Permitir lectura general en `cancelada`.** Rechazada: prolonga acceso interactivo;
  la necesidad legítima se cubre con exportación controlada.
- **Aplicar la política solo en UI/backend.** Rechazada: las escrituras directas a
  Firestore necesitan una barrera independiente.
- **Consultar membresía desde rules para toda autorización.** Rechazada: altera la
  estrategia de claims de ADR-SAAS-001 y añade costo innecesario; la consulta canónica
  se limita al estado empresarial.

## Relación con otros ADR

- **ADR-SAAS-001** mantiene claims y rules como defensa de aislamiento tenant.
- **ADR-SAAS-002** define la identidad y el rol proyectado en claims.
- **ADR-SAAS-003** separa empresa y suscripción; este ADR supersede parcialmente su
  política abierta de suspensión y enforcement basado en proyección al token.
- **ADR-SAAS-004** define `Empresa` como unidad de aislamiento.
- **ADR-SAAS-006** conserva `membresias` como autoridad de acceso individual.
- **ADR-SAAS-007** crea la empresa inicialmente en `trial`.
- **ADR-SAAS-008** exige un estado empresarial escribible antes de emitir una venta.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§6, §10 y §11).
