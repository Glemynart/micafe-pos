# ADR-SAAS-018 — Eventos operativos confiables y notificaciones FCM

- **Estado:** PROPUESTO
- **Fecha:** 2026-08-03
- **Decision makers:** Lead Engineer; propietario del Goal pendiente de aceptación formal
- **Alcance:** MVP comercial reusable para cualquier tenant
- **Relacionados:** ADR-SAAS-001, ADR-SAAS-011, ADR-SAAS-012, ADR-SAAS-015, D-NOTIF-02
- **No incluye:** `cuentas_cobro`, cambios de Firestore Rules, cambios de autoridad financiera o notificaciones implementadas

> Este ADR formaliza la arquitectura. No implementa productores de eventos,
> dispatcher ni notificaciones mientras permanezca en estado `PROPUESTO`.

---

## 1. Contexto y problema

El SaaS ya tiene infraestructura FCM funcional para registrar tokens, recibir
notificaciones foreground/background y purgar tokens inválidos. También existe un
endpoint Next `/api/notifications/send` y un emisor cliente reusable. Ese camino es
útil para mensajes best-effort iniciados por una interfaz, pero no es autoridad para
hechos operativos.

Los hechos que el propietario necesita comunicar nacen de mutaciones críticas del
POS:

- apertura de turno;
- cierre de turno;
- relevo de turno;
- faltante de caja;
- sobrante de caja.

Hoy el emisor cliente puede perderse por una caída de red, un POS Electron sin
servidor Next local, una pestaña cerrada o un error silencioso posterior a la
transacción. En particular, la UI no puede ser la fuente de verdad de que un turno
se abrió o cerró: el backend ya decide esos hechos mediante callables
server-authoritative.

La solución debe hacer confiable la **emisión durable del evento**, no prometer que
FCM o el dispositivo del administrador garantizan recepción. La entrega externa
seguirá siendo `at-least-once` y best-effort, pero nunca se perderá el hecho de que
debe intentarse notificarlo.

## 2. Drivers de la decisión

- El evento debe nacer en la misma transacción que el hecho operativo.
- La autoridad debe permanecer en Functions/Admin SDK; el cliente solo consume o
  registra tokens.
- El diseño debe reutilizar la infraestructura FCM, la selección server-side de
  administradores y la purga de tokens inválidos.
- Un fallo de FCM no puede revertir ni bloquear una venta, apertura, cierre o
  relevo ya válido.
- Los reintentos deben ser auditables y no producir una nueva mutación de dominio.
- El aislamiento tenant debe ser explícito en cada evento y consulta backend.
- No se deben modificar Firestore Rules ni permitir que el cliente escriba eventos.
- Debe ser posible añadir eventos futuros sin acoplar los servicios de dominio a
  HTTP, Next o FCM.
- La primera implementación debe probarse con Emulator, sin producción ni datos de
  Café Atrato.

## 3. Opciones consideradas

### 3.1 Mantener el emisor cliente best-effort

**Rechazada para hechos operativos.** Es adecuado para mensajes no críticos, pero
una notificación originada después de la transacción puede perderse sin registro y
no permite reconciliar qué eventos quedaron sin intento de entrega.

### 3.2 Enviar FCM dentro de la transacción de dominio

**Rechazada.** FCM es una llamada externa y no participa en la transacción de
Firestore. Mantenerla dentro del callback introduce reintentos no deterministas,
duplicados y un acoplamiento entre disponibilidad de FCM y confirmación de caja.

### 3.3 Trigger directo sobre cualquier documento de dominio

**Rechazada como contrato general.** Detectar cambios en `turnos` o `movimientos`
sin un evento canónico obliga a inferir intención, puede duplicar eventos por
reintentos y mezcla hechos históricos con proyecciones. Cada comando conoce mejor
el resultado que debe publicar.

### 3.4 Outbox/evento durable server-side y dispatcher FCM

**Recomendada.** El productor escribe el evento en la misma transacción del hecho;
un dispatcher separado lo reclama, registra intentos y usa el transporte FCM
existente fuera de la transacción. El dominio no conoce HTTP ni FCM, y la pérdida de
red se convierte en un estado reconciliable.

## 4. Decisión propuesta

Se adopta un patrón de **evento operativo durable + outbox de notificación**.

```text
comando server-side
   └─ transacción Firestore
       ├─ hecho de dominio (turno, movimiento, relevo)
       └─ evento_operativo/{eventoId} = PENDIENTE
                 │ commit
                 ▼
        dispatcher backend / trigger
                 ├─ notificacion_operativa/{id, destinatario}
                 └─ adaptador FCM existente
                         └─ tokens admin, purga y reintento
```

### 4.1 Evento operativo canónico

Los eventos viven en una colección backend-only
`eventos_operativos/{eventoId}`. El productor asigna el ID de forma determinista a
partir de la identidad del comando y el tipo de evento, o usa una clave de
idempotencia equivalente. Nunca se usa un ID generado por el cliente para decidir
si el hecho ocurrió.

Contrato mínimo:

| Campo | Regla |
|---|---|
| `schemaVersion` | `1`; obligatorio |
| `eventoId` | coincide con el ID del documento; inmutable |
| `tipo` | enum cerrado del catálogo de §4.2 |
| `empresaId` | tenant de nacimiento; inmutable |
| `agregado` | `{ tipo, id }` del hecho operativo |
| `actor` | UID y rol que ejecutaron el comando; sin secretos |
| `commandId`, `causationId` | correlación e idempotencia server-side |
| `payloadOperativo` | datos mínimos para el mensaje; sin PIN, tokens, secretos o PII innecesaria |
| `estadoDespacho` | `PENDIENTE`, `EN_PROCESO`, `COMPLETADO` o `REQUIERE_REINTENTO` |
| `intentos` / `ultimoErrorCodigo` | métricas acotadas; nunca el error crudo con secretos |
| `creadoEn`, `actualizadoEn`, `ultimoIntentoEn` | timestamps server-side |

La transacción no hace llamadas externas. Si la escritura del evento no puede
confirmarse, el comando de dominio falla atómicamente; no existe una venta, un
cierre o una apertura “sin evento” cuando el comando declara que requiere
notificación.

### 4.2 Catálogo inicial de eventos

El catálogo inicial, cerrado para el primer PR, es:

- `TURNO_ABIERTO`;
- `TURNO_CERRADO`;
- `TURNO_RELEVO`;
- `TURNO_FALTANTE`;
- `TURNO_SOBRANTE`.

`TURNO_CERRADO` se emite siempre al cerrar. `TURNO_FALTANTE` y
`TURNO_SOBRANTE` se emiten en la misma transacción solo cuando la diferencia tiene
el signo correspondiente. Un relevo produce `TURNO_CERRADO` del turno anterior,
`TURNO_RELEVO` y la apertura del turno sucesor con sus respectivas identidades
canónicas; no se infiere un relevo leyendo la UI.

Ventas, reservas, compras, inventario, cuentas por cobrar y otros eventos no se
añaden al primer catálogo por conveniencia. Cada nueva familia debe justificar su
hecho durable y su destinatario antes de incorporarse.

### 4.3 Outbox y despacho

El dispatcher backend transforma cada evento en notificaciones dirigidas a los
administradores activos del tenant. La selección de destinatarios permanece en
backend y se revalida en el momento del despacho; el cliente no puede suministrar
UIDs ni roles.

La colección `notificaciones_operativas/{notificacionId}` conserva el estado por
`eventoId`, `uidDestino` y canal:

```text
PENDIENTE → ENVIANDO → ENVIADA
                    └→ REINTENTABLE → ENVIANDO
                    └→ DESCARTADA (token inválido o destinatario no elegible)
```

El ID lógico `(eventoId, uidDestino, FCM)` evita crear una nueva notificación
durable por cada reintento. El dispatcher puede repetir una llamada FCM después de
un crash, por lo que la garantía es **at-least-once**, no exactamente una entrega.
La aplicación registra el estado y el número de intentos; no presenta una entrega
FCM como prueba de lectura humana.

Los eventos permanecen conservados aunque no haya tokens de administrador. Cuando
se registra un token posteriormente, el dispatcher puede crear o reintentar la
notificación pendiente según la política de retención. La retención inicial y los
límites de reintento serán definidos por el PR de implementación sin cambiar el
contrato de dominio.

### 4.4 Reutilización de FCM

Se conserva:

- `usuarios/{uid}.fcmTokens` como proyección de tokens;
- `firebase-messaging` en el cliente para alta y recepción;
- el Service Worker y la recepción foreground/background;
- la purga server-side de tokens inválidos;
- la selección de miembros admin activos como destinatarios iniciales.

El adaptador de envío se extraerá a una superficie backend reusable para que el
dispatcher de Functions y el endpoint Next existente compartan la misma política
de FCM. El endpoint existente podrá seguir sirviendo mensajes client-initiated
best-effort; no será usado como autoridad de eventos de dominio. No se crea un
segundo proveedor push ni se envía FCM desde el cliente.

### 4.5 Autoridad e aislamiento

- Solo los comandos server-side crean eventos y outbox.
- `empresaId` se valida contra la Empresa, membresía y autoridad del comando dentro
  de la misma transacción.
- Las colecciones de eventos y outbox son backend-only; no se agregan reglas de
  lectura o escritura para clientes.
- Los DTO de soporte y auditoría no exponen payloads secretos ni permiten mutar el
  estado de despacho.
- Un error del dispatcher nunca modifica el turno, ledger, venta, stock o caja.

## 5. Invariantes

1. Todo evento del catálogo inicial se crea en la misma transacción que su hecho de
   dominio.
2. Un reintento del comando no crea un segundo evento para la misma identidad
   idempotente.
3. El dispatcher nunca crea ni altera el hecho de dominio.
4. Un evento pertenece a un solo tenant y no puede ser redirigido por datos del
   cliente.
5. Ninguna notificación contiene PIN, hash, token, secreto o payload fiscal
   innecesario.
6. FCM no se invoca dentro de una transacción Firestore.
7. La pérdida de FCM, red, token o dispositivo deja el evento durable y su estado
   reconciliable.
8. La garantía declarada es emisión durable y despacho `at-least-once`; no se
   promete entrega única ni lectura humana.
9. No se modifican Rules, Bootstrap ni la autoridad server-side de los comandos
   financieros.

## 6. Consecuencias

### Positivas

- La apertura, cierre, relevo, faltante y sobrante dejan evidencia durable aunque
  el administrador esté offline.
- El mismo mecanismo se reutiliza por tenant y por nuevas familias de eventos.
- El POS Electron puede producir eventos sin depender de un servidor Next local.
- Los fallos y reintentos de FCM se pueden observar y reconciliar.

### Negativas

- Se introduce persistencia backend-only y un dispatcher adicional.
- At-least-once puede producir duplicados visibles ante un crash posterior al envío;
  FCM no ofrece una transacción con Firestore.
- El evento puede existir sin notificación inmediata si no hay tokens o el proveedor
  está degradado.
- El endpoint Next y el adaptador FCM requieren una extracción compatible para no
  duplicar lógica entre runtimes.

### Fuera de alcance

- Centro de notificaciones dentro del PWA.
- Preferencias de destinatarios por rol.
- Confirmación de lectura o recepción garantizada en dispositivo.
- Cola offline del POS.
- Eventos de login, ventas, reservas, compras, inventario y `cuentas_cobro`.
- Cambios en Firestore Rules, Bootstrap, autoridad financiera o plan comercial.

## 7. Plan de implementación posterior a la aceptación

1. Contratos, colecciones backend-only, índices, estados y pruebas de idempotencia
   y tenant isolation.
2. Productor de apertura y cierre en las callables server-side de turnos/finanzas,
   con faltante, sobrante y relevo en la misma transacción.
3. Dispatcher y adaptador FCM compartido con reintento, purga y auditoría de
   despacho.
4. Integración de registro/renovación de tokens sin modificar Rules.
5. E2E Emulator: cada evento, reintento, ausencia de token, token inválido, tenant
   ajeno, carrera e idempotencia; luego validación UI de recepción en PWA.

La implementación no comienza mientras este ADR siga `PROPUESTO`.

## 8. Compatibilidad con decisiones existentes

- **D-NOTIF-02:** se conserva para transporte, recepción y mensajes client-
  initiated best-effort; este ADR lo supersede únicamente para eventos nacidos de
  mutaciones de dominio que requieren emisión durable.
- **ADR-SAAS-015:** los productores se conectan después del commit lógico dentro de
  la misma transacción, sin mover autoridad de ventas al cliente.
- **ADR-SAAS-011/012:** el dispatcher y sus comandos son backend-side y su
  evidencia sigue la auditoría existente.
- **Rules:** no se relajan ni se crean excepciones.

## 9. Rollback

La implementación será aditiva. Si el dispatcher se degrada, se puede deshabilitar
su ejecución y conservar los eventos pendientes para reprocesarlos. No se borran
eventos ni se revierten hechos de dominio como compensación de un fallo de FCM. El
rollback del productor exige un PR posterior que preserve el contrato de eventos
ya emitidos.

## 10. Criterio de aceptación del ADR

La decisión queda lista para pasar a `ACEPTADO` cuando se confirme explícitamente:

- el evento durable en la transacción de dominio;
- el catálogo inicial de cinco eventos de turnos;
- el outbox/dispatcher con garantía at-least-once;
- la selección server-side de administradores y reutilización de FCM;
- el tratamiento de `D-NOTIF-02` como compatible solo para mensajes best-effort;
- la ausencia de cambios en Rules, Bootstrap, autoridad financiera y producción.
