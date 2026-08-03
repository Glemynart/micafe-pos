# ADR-SAAS-017 — Recuperación segura de credenciales del administrador y operadores

- **Estado:** PROPUESTO
- **Fecha:** 2026-08-03
- **Decision makers:** Lead Engineer; propietario del Goal pendiente de aceptación formal
- **Alcance:** MVP comercial transversal del SaaS; no requiere datos ni escrituras de producción
- **Relacionados:** ADR-SAAS-006, ADR-SAAS-011, ADR-SAAS-012, ADR-SAAS-013
- **Cierra:** D-013-1 para la recuperación del administrador del tenant

> Este ADR documenta la decisión arquitectónica. Mientras permanezca en estado
> `PROPUESTO` no se implementa el comando, la persistencia, la nueva facultad ni
> la UI descritos aquí.

---

## 1. Contexto y problema

El modelo operativo de acceso usa `credenciales_operativas/{empresaId}_{codigo}`
con código y PIN. El alta inicial y la incorporación directa tienen una máquina
de activación temporal, pero la recuperación de una credencial ya activada no
está resuelta como operación comercial reusable.

La inspección de `main @ 0bed313` muestra tres límites concretos:

1. `provisionarCredencialOperativa` exige que el administrador ya esté dentro del
   tenant, recibe un PIN elegido por el administrador, no marca
   `requiereCambio` y no es una operación de recuperación explícita.
2. `rotarPinOperativo` solo sirve para el propio usuario que todavía conoce su
   PIN actual; no recupera un acceso perdido.
3. El Backoffice puede emitir o reemitir la credencial inicial temporal, pero
   ADR-SAAS-013 prohíbe que esa operación reemplace una credencial `ACTIVE`.

Por tanto, un operador puede quedar bloqueado después de perder su PIN y el
administrador inicial puede quedar bloqueado sin una salida canónica. La solución
no puede abrir `ProvisionarCredencialInicialTenant` a cualquier credencial activa:
eso convertiría una operación de arranque en una puerta de toma de control.

La recuperación también debe conservar la separación de responsabilidades ya
adoptada:

- `membresias/{empresaId}_{uid}` decide la autoridad del administrador dentro del
  tenant;
- `saas_operadores/{uid}` decide las facultades del plano SaaS;
- `credenciales_operativas` autentica al operador, pero no decide sus permisos;
- `saas_auditoria`/`saas_auditoria_obligaciones` conserva la evidencia de los
  comandos de plataforma.

## 2. Drivers de la decisión

- El administrador debe poder recuperar a un operador sin conocer el PIN anterior.
- El administrador inicial no debe poder recuperarse por una facultad tenant que
  dependa de la sesión que perdió.
- Ningún PIN, hash, código operativo ni token debe persistirse en auditoría o
  proyectarse al cliente después de su entrega única.
- La autoridad debe permanecer server-side, con transacción, idempotencia,
  revocación de sesiones y auditoría.
- La recuperación no debe reutilizar `incorporaciones` como segunda fuente de
  autoridad sobre el alta de una persona.
- No se deben relajar Firestore Rules ni crear escrituras directas desde el PWA.
- La decisión debe ser reusable para cualquier tenant y compatible con el flujo de
  activación temporal ya existente.
- El primer PR de implementación debe poder probarse completamente con Emulator;
  no debe depender de una resolución DIAN, de Café Atrato ni de datos productivos.

## 3. Opciones consideradas

### 3.1 Abrir `ProvisionarCredencialInicialTenant` a `ACTIVE`

**Rechazada.** Mezcla bootstrap y recuperación, permite que la autoridad de
plataforma reemplace credenciales activas mediante un comando diseñado para el
primer acceso y no ofrece el control específico ni la evidencia necesaria.

### 3.2 Exponer `provisionarCredencialOperativa` como “restablecer”

**Rechazada como solución.** No cubre al administrador que perdió su acceso,
acepta un PIN permanente elegido por el actor, no fuerza activación de un secreto
temporal y no deja un agregado durable que diferencie una recuperación de un alta.
Sus primitivas de hash, revocación y actualización de credencial pueden ser
reutilizadas o extraídas, pero el entrypoint actual no será la autoridad final.

### 3.3 Recuperación exclusiva por correo y contraseña

**Rechazada para el acceso operativo.** El personal operativo usa código + PIN y
el administrador inicial puede no tener correo en Firebase Auth. Introducir otro
modelo en paralelo duplicaría identidad, permisos, auditoría y superficie de
ataque. La capa EMAIL de ADR-SAAS-002 se conserva para la identidad SaaS, pero no
se convierte en sustituto del acceso POS.

### 3.4 Preguntas de seguridad o códigos de respaldo persistidos

**Rechazada.** Agrega un secreto permanente cuya recuperación sería otro problema
de seguridad y no ofrece una autoridad mejor que el proceso de soporte existente.

### 3.5 Comando dedicado con dos niveles de autoridad

**Recomendada.** Separa la recuperación de la incorporación, permite una política
distinta para operador y administrador, y reutiliza las primitivas criptográficas,
de sesión, auditoría y transacción existentes sin reabrir Bootstrap.

## 4. Decisión propuesta

Se adoptará una operación explícita denominada
`RestablecerCredencialOperativa`, con dos contratos de autorización y un agregado
de recuperación propio.

### 4.1 Nivel tenant: recuperación de un operador no administrador

- **Actor:** administrador activo del mismo tenant, autorizado por la membresía
  vigente y la capacidad de administración de usuarios.
- **Sujeto:** miembro activo del tenant que no sea el `ownerUid` y que no sea el
  propio actor.
- **Canal:** módulo de Permisos/Usuarios del PWA, a través de una callable
  server-side. El cliente no escribe `credenciales_operativas`.
- **Resultado:** invalida la credencial activa anterior, revoca las sesiones del
  UID, genera un nuevo código operativo único y un PIN temporal server-side, y
  marca la nueva credencial con `requiereCambio=true` y TTL de 72 horas.
- **Entrega:** el código y el PIN temporal se devuelven una sola vez al
  administrador en un diálogo de revelación única. Nunca se devuelve el PIN
  definitivo del operador.
- **Límites:** no cambia rol, permisos, membresía, owner, empresa ni estado del
  tenant. La reactivación de un miembro suspendido es otra operación.

### 4.2 Nivel plataforma: recuperación del administrador/owner

- **Actor:** operador SaaS activo con una facultad nueva y explícita
  `ACCESO_RESTABLECER`.
- **Sujeto:** exclusivamente `Empresa.ownerUid`, cuya membresía admin activa y
  relación con la empresa se revalidan dentro de la transacción.
- **Canal:** Backoffice, mediante un comando de plataforma distinto de
  `Provisionar`, `Reemitir`, `Desbloquear` y de las transiciones de lifecycle.
- **Verificación:** el comando exige evidencia fuera de banda: referencia del
  caso, método de verificación, actor verificador y fecha. La evidencia no puede
  contener PIN, código, token ni PII innecesaria. Sin esa evidencia, el comando
  falla cerrado.
- **Resultado:** invalida la credencial activa anterior, revoca las sesiones del
  owner, rota el código, genera PIN temporal server-side, marca
  `requiereCambio=true` y TTL de 72 horas, y entrega el secreto una sola vez al
  operador SaaS autorizado.
- **Límite:** no permite seleccionar un UID arbitrario, no cambia el owner, no
  crea otro administrador, no emite claims tenant permanentes y no modifica
  `Empresa.estado`, Suscripción, Bootstrap o configuración fiscal.

La primera implementación no introduce una demora automática de 24 horas: ese
control dependería de un canal de notificaciones confiable y se evaluará en el
ADR de eventos operativos. La verificación fuera de banda y la evidencia durable
son obligatorias desde la primera versión.

### 4.3 Agregado `restablecimientos_credencial`

Cada recuperación crea un documento backend-only en
`restablecimientos_credencial/{restablecimientoId}`. Es una evidencia operativa
del proceso, no una nueva autoridad de autenticación.

Campos canónicos mínimos:

| Campo | Regla |
|---|---|
| `schemaVersion` | `1`; obligatorio |
| `empresaId` | tenant objetivo; inmutable |
| `uidObjetivo` | UID del operador; inmutable |
| `nivel` | `TENANT_OPERADOR` o `PLATAFORMA_ADMIN` |
| `estado` | `PENDIENTE_ACTIVACION`, `ACTIVADO`, `EXPIRADO` o `CANCELADO` |
| `credencialAnteriorId` / `credencialNuevaId` | referencias técnicas; nunca secretos |
| `actor` | tipo y UID del actor; sin sustitución de identidad |
| `evidenciaVerificacion` | obligatoria para `PLATAFORMA_ADMIN`; sin secretos |
| `commandId`, `idempotencyKey`, `fingerprint` | deduplicación y conflicto seguro |
| `creadoEn`, `expiraEn`, `activadoEn`, `actualizadoEn` | timestamps server-side |
| `obligacionAuditoriaId` | vínculo con la evidencia de ADR-SAAS-012 |

No se almacenan PIN, hash, código operativo, token, respuesta completa de Auth ni
secreto recuperable. El código y el PIN solo existen en la respuesta de la
operación que los emitió; un reintento idempotente devuelve el resultado durable
sin volver a revelar secretos.

La colección será inaccesible para clientes mediante las Rules vigentes. Las
lecturas del Backoffice y del PWA serán proyecciones mínimas servidas por
Functions, nunca consultas directas. Se requiere un índice por
`empresaId, uidObjetivo, creadoEn DESC`; cualquier índice adicional deberá
justificarse por un comando backend.

### 4.4 Activación de una recuperación

La credencial temporal de recuperación no se registra como `incorporacion`
`DIRECTA`: hacerlo alteraría la decisión canónica de ADR-SAAS-006 sobre la entrada
de una persona al tenant.

Se define una sesión temporal separada, `RESTABLECIMIENTO_TEMP`, y una operación
`activarRestablecimientoCredencial`. El flujo es:

```text
código + PIN temporal
  → autenticarOperativo
  → sesión RESTABLECIMIENTO_TEMP sin claims tenant
  → activarRestablecimientoCredencial(PIN temporal, PIN definitivo)
  → credencial definitiva + claims tenant vigentes
```

La activación valida, dentro de una transacción, el `restablecimientoId`, el UID
de la sesión, la empresa, la credencial vigente, el estado `PENDIENTE_ACTIVACION`,
el TTL y el PIN temporal. Al ganar la carrera, fija el hash del PIN definitivo,
marca `ACTIVADO`, deja la credencial sin `requiereCambio` y emite la sesión tenant
normal. Reintentos sobre `ACTIVADO` son idempotentes solo si coinciden con el
resultado canónico; nunca reabren ni rotan una credencial.

La activación no crea membresías, no copia permisos desde un input del cliente y
no convierte una recuperación en una incorporación.

### 4.5 Autoridad, transacción y auditoría

La operación de emisión y el registro de recuperación se ejecutan en una única
transacción Firestore junto con:

1. revalidación del tenant, sujeto, actor, membresía y facultad;
2. deduplicación por `commandId` e `idempotencyKey` con fingerprint;
3. reserva global del código mediante la primitiva existente;
4. inactivación de la credencial anterior y creación de la temporal nueva;
5. creación de la obligación de auditoría en el mismo commit.

Después del commit se revocan los refresh tokens de Firebase Auth, siguiendo la
frontera ya usada por ADR-SAAS-011. Si la revocación o la proyección de claims
falla, el hecho durable no se deshace: queda una tarea reconciliable y el acceso
normal continúa bloqueado por la credencial temporal hasta que el backend
complete la revocación/proyección. Nunca se compensa con una escritura de cliente.

Eventos mínimos de evidencia:

- `RESTABLECIMIENTO_CREDENCIAL_EMITIDO`;
- `RESTABLECIMIENTO_CREDENCIAL_ACTIVADO`;
- `RESTABLECIMIENTO_CREDENCIAL_EXPIRADO`;
- `RESTABLECIMIENTO_CREDENCIAL_CANCELADO`;
- `FACULTAD_AUSENTE`/`AUTORIZACION_DENEGADA` cuando corresponda.

Los eventos nunca contienen PIN, hash, código operativo, token o secreto. El
nivel `PLATAFORMA_ADMIN` además registra la evidencia de verificación y el actor
en `saas_auditoria` conforme a ADR-SAAS-012.

## 5. Invariantes

1. Una recuperación nunca modifica el owner, el rol, los permisos, la membresía,
   la Empresa, el Plan, la Suscripción ni la configuración fiscal.
2. Una credencial anterior queda inactiva antes de que la nueva pueda usarse; no
   existen dos credenciales activas para el mismo `(empresaId, uid)`.
3. Un PIN temporal solo puede activar el restablecimiento que lo emitió, una sola
   vez y dentro de su TTL.
4. Una recuperación `PLATAFORMA_ADMIN` solo puede apuntar al `ownerUid` canónico;
   ningún actor puede suministrar un UID de sustitución.
5. Un administrador tenant no puede restablecerse a sí mismo ni restablecer al
   owner mediante el Nivel 1.
6. Ningún secreto recuperable se persiste o se audita.
7. Ningún reset crea una incorporación ni una identidad Firebase nueva.
8. Los reintentos compatibles son idempotentes; el mismo idempotency key con otro
   payload se rechaza y no produce escrituras.
9. Las Firestore Rules no se relajan: la colección nueva y las credenciales
   siguen siendo autoridad de backend.

## 6. Consecuencias

### Positivas

- El SaaS obtiene recuperación reusable para administradores y operadores sin
  depender de datos fiscales ni de producción.
- Se mantiene la autoridad server-side y el modelo de dos capas.
- La recuperación queda separada de Bootstrap e incorporación, evitando una
  segunda fuente de autoridad.
- El flujo temporal reutiliza el contrato de expiración, hash, bloqueo,
  revocación y entrega única ya probado.

### Negativas

- Se necesita una nueva colección backend-only, un estado temporal de sesión y
  un callable de activación.
- Se agrega una facultad de plataforma que debe gobernarse y auditarse.
- El operador SaaS debe realizar verificación fuera de banda para recuperar al
  administrador; no es un flujo completamente autoservicio.
- Un fallo posterior a la transacción puede requerir reconciliación de revocación
  de tokens, como en las autoridades existentes.

### Fuera de alcance

- Recuperación por correo de la capa SaaS.
- Vinculación de correo al administrador inicial.
- Selector de tenant o subdominios.
- Eliminación del alta legacy por contraseña.
- Notificaciones FCM de recuperación; se resolverán en el ADR de eventos
  operativos confiables.
- Escrituras o pruebas con datos reales de producción.

## 7. Plan de implementación posterior a la aceptación

El PR de implementación se dividirá en cambios auditables, sin tocar Bootstrap ni
Rules:

1. Contratos, estado, primitiva segura de emisión y pruebas unitarias de
   idempotencia, TTL, concurrencia, bloqueo y secreto no persistido.
2. Callable tenant y callable plataforma, facultad `ACCESO_RESTABLECER`,
   auditoría y proyección mínima.
3. Extensión server/client del login temporal y activación segura.
4. UI de Permisos y Backoffice con revelación única y manejo de reintento sin
   reexposición.
5. E2E Emulator, revisión de Rules sin cambios, auditoría del PR y smoke de
   recuperación para dos tenants aislados.

La implementación no comienza mientras este ADR siga `PROPUESTO`.

## 8. Rollback

La entrega es aditiva. Antes de habilitar el comando se puede revertir el PR de
implementación y retirar la UI. Los documentos de recuperación ya emitidos no se
borran: se cancelan o expiran mediante una operación backend auditable. Nunca se
restaura una credencial anterior sin una nueva operación de recuperación validada.

## 9. Criterio de aceptación del ADR

La decisión queda lista para pasar a `ACEPTADO` cuando se confirme explícitamente:

- los dos niveles de autoridad;
- la facultad dedicada `ACCESO_RESTABLECER`;
- el agregado separado `restablecimientos_credencial`;
- la sesión `RESTABLECIMIENTO_TEMP` y su activación one-shot;
- la verificación fuera de banda para el administrador;
- la prohibición de PIN/código/hash/token en persistencia y auditoría;
- la ausencia de cambios en Rules, Bootstrap y producción.
