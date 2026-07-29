# R1-A — Diseño de implementación: Turnos Server-Authoritative

> **Estado:** DISEÑO DE IMPLEMENTACIÓN — no autoriza ni contiene código, cambios de Rules, migraciones, despliegues ni PR.
>
> **Alcance:** únicamente la apertura de turnos y su consulta de solo lectura bajo autoridad servidor. Conserva la forma actual de `turnos` y `turnos_activos`, la UX de apertura y el aislamiento por Empresa.
>
> **Exclusiones expresas:** caja, cuentas bancarias, transacciones financieras, ventas, egresos, inventario, efectos de venta, cierre de turno y relevo. En particular, R1-A no ejecuta ni diseña efectos financieros de cierre o de relevo.
>
> **Precondiciones:** R1 aprobado; B7 operativo ya certificado (incluido su backfill de `estadoOperativo`); ADR-SAAS-009 y ADR-SAAS-010 vigentes; tenancy MT-U3 y configuración B1 vigentes. `MT-U10-B6-B7-cierre-arquitectonico.md` es una referencia conceptual y no concede autoridad runtime.

---

## 1. Propósito, autoridad y límite

R1-A materializa de forma acotada la primera fila del catálogo de R1: la apertura de turno mediante una Callable autenticada y una transacción Admin SDK. El cliente mantiene la intención de abrir y sus lecturas de turnos; deja de crear directamente el turno, el candado activo y los hechos de idempotencia/auditoría asociados.

R1-A implementa R1 sin reinterpretar autoridades existentes:

| Autoridad | Regla que R1-A preserva |
|---|---|
| Tenant | `empresaId` se deriva de la sesión autenticada y se valida contra la membresía; nunca llega en el payload. |
| Actor y rol efectivo | Se derivan de `request.auth` y de la membresía canónica activa. Los claims solo aportan contexto y no sustituyen la comprobación canónica. |
| Lifecycle | `empresas/{empresaId}.estado` se relee y solo `trial` o `activa` permiten apertura. |
| Turno | El servidor crea el único documento `turnos/{turnoId}` abierto del actor y su candado `turnos_activos/{actorUid}`. |
| Configuración B1 | Las políticas de `caja` se consumen como configuración existente. R1-A no las cambia ni les atribuye autoridad financiera. |

La `baseApertura` continúa siendo una declaración operativa que se congela en el turno, como prescribe R1 §6.1 y B1 §4.8. R1-A valida su forma y la persiste como dato del turno, pero no acredita, debita, mueve ni reconcilia dinero. Por ello no incorpora caja al alcance.

### 1.1 Decisiones de alcance

| Decisión | Resultado |
|---|---|
| Nueva autoridad de escritura | Solo `abrirTurnoOperativoV1`. |
| Lecturas | Los listeners y consultas actuales de `turnos` permanecen cliente-side, autorizados por Rules. No se crea una Callable de lectura sin necesidad. |
| Notificaciones push de apertura | Fuera de R1-A. La Callable no usa FCM ni hace efectos externos; `D-NOTIF-02` conserva su ámbito propio. |
| Cierre y relevo | Diferidos; no se publica `cerrarTurnoOperativoV1` ni una variante parcial. |
| Datos históricos | No hay backfill, cambio de IDs ni reescritura de turnos/candados existentes. |
| Reglas finales server-authoritative | Se diseñan como destino obligatorio, pero no se activan hasta migrar también cierre y relevo. |

### 1.2 Motivo de diferir cierre y relevo

R1 §5 exige que el cierre recalcule desde servidor las ventas `COMPLETO` y los egresos, valide fondos y escriba de forma co-atómica turno, candados, cuentas y transacciones financieras. El relevo, además, depende del cierre de origen, del nuevo turno y de ambos candados en la misma operación.

Implementar cualquiera de los dos sin ventas, egresos, caja, cuentas y transacciones financieras fragmentaría una operación que R1 exige atómica. Eso violaría R1-I07, R1-I08, R1 §5–§6.1 y ADR-SAAS-010/OPE-01. Por tanto, ambos son **prerrequisitos diferidos de un corte posterior de `turnos`**, no comportamientos parciales de R1-A.

---

## 2. Cloud Functions y contrato Callable

### 2.1 Nueva Function

| Callable | Tipo | Consumidor primario | Propósito |
|---|---|---|---|
| `abrirTurnoOperativoV1` | HTTPS Callable autenticada, región y opciones consistentes con las Functions tenant existentes | POS web, PWA y renderer de Electron mediante `lib/turnos-service.ts` | Crear un turno abierto propio y su candado de forma atómica, idempotente y auditable. |

No se agrega una Function de consulta: R1 permite lectura autorizada de `turnos` y `turnos_activos`, y los consumidores actuales necesitan actualizaciones en tiempo real. Crear una Callable de lectura no mejora la autoridad de escritura y ampliaría la superficie sin respaldo en R1.

### 2.2 Envelope común

La Callable recibe exactamente el envelope R1 siguiente. Ningún campo adicional es aceptado.

| Campo | Tipo conceptual | Obligatorio | Regla |
|---|---|---:|---|
| `commandId` | UUID/identificador opaco de intención | Sí | Único por Empresa. No puede reutilizarse con otra clave, comando o huella. |
| `idempotencyKey` | UUID/identificador opaco estable | Sí | Se conserva en todos los reintentos de la misma intención. |
| `correlationId` | UUID/identificador opaco | Sí | Conecta logs, recibo y auditoría; no concede autoridad. |
| `causationId` | Identificador opaco | No | Ausente para una apertura de usuario normal; si se admite posteriormente, solo referencia un hecho servidor verificable. |
| `motivo` | Texto normalizado | No | R1 lo reserva para comandos que alteren caja o inventario por ajuste/corrección. En apertura no se interpreta ni altera la decisión; se conserva como `null` en el recibo y auditoría. |
| `payload` | Mapa cerrado | Sí | Contiene exclusivamente la intención de apertura indicada en §2.3. |

El envelope no acepta `empresaId`, `actorUid`, `cajeroId`, `cajeroNombre`, rol, permisos, estado de Empresa, saldo, cuenta, `turnoAnteriorId`, total esperado ni datos de cierre. Su presencia, incluso si coincide con el servidor, produce `PAYLOAD_INVALID`.

### 2.3 Payload de apertura

| Campo | Tipo conceptual | Obligatorio | Validación servidor |
|---|---|---:|---|
| `baseApertura` | Dinero entero no negativo en unidad mínima | Sí | Entero seguro, mayor o igual a cero y compatible con moneda/localización vigente. Se persiste como declaración congelada; no genera movimiento financiero. |
| `notasApertura` | Texto | No | Texto normalizado, longitud máxima definida por el validador compartido; vacío si se omite. Sin HTML ni secretos. |

No se acepta `turnoAnteriorId`: solo tiene semántica de relevo y ese flujo está diferido. El servidor obtiene `cajeroId` desde el actor autenticado y `cajeroNombre` desde su identidad/membresía canónica, nunca desde la interfaz.

### 2.4 Respuesta de éxito

La respuesta se almacena íntegra en el recibo y se devuelve sin variación a cada reintento válido.

| Campo | Tipo | Significado |
|---|---|---|
| `commandId` | string | Identificador de la intención confirmada. |
| `turnoId` | string | ID del turno abierto, creado una vez. |
| `cajeroId` | string | Actor canónico que posee el turno. |
| `estado` | literal `abierto` | Estado del hecho creado. |
| `correlationId` | string | Correlación registrada para soporte. |

No se devuelve una hora calculada por cliente. `fechaApertura` se escribe con timestamp de servidor y se observa por la suscripción de solo lectura. Tampoco se devuelve un booleano variable como `turnoCreado`: cambiaría entre la primera ejecución y un reintento y rompería el resultado estable de R1-I10.

### 2.5 Errores y comportamiento cliente

La Function traduce validaciones de dominio a `HttpsError` con un código transportable y un `details.code` de esta tabla. No incluye snapshots completos, tokens, PIN, saldos ni trazas internas.

| Clase | Código de dominio | Condición | Cliente |
|---|---|---|---|
| Autorización | `AUTH_REQUIRED` | No existe sesión válida. | Solicitar autenticación; no reintentar. |
| Autorización | `TENANT_ACCESS_DENIED` | Claim, membresía o Empresa no forman un contexto válido. | Renovar contexto/contactar administrador; no reintentar igual. |
| Autorización | `ROLE_FORBIDDEN` | El actor no tiene el permiso efectivo vigente para abrir turno. | Mostrar acceso denegado; no reintentar. |
| Lifecycle | `EMPRESA_NO_OPERATIVA` | Estado distinto de `trial`/`activa`. | Mostrar modo no operativo; no reintentar. |
| Validación | `PAYLOAD_INVALID` | Envelope desconocido, ID inválido, base inválida o texto no válido. | Corregir entrada; crear una intención nueva. |
| Precondición | `LOCK_CONFLICT` | Existe un candado activo del actor sin recibo equivalente. | Recargar suscripción de turno; no crear un segundo turno. |
| Concurrencia | `ABORTED` | Se agotaron reintentos internos de la transacción. | Reintentar el mismo envelope con backoff acotado. |
| Idempotencia | `COMMAND_ID_CONFLICT` | `commandId` ya existe con otra clave, comando o huella. | No reintentar; abrir incidencia. |
| Idempotencia | `IDEMPOTENCY_CONFLICT` | La clave apunta a otra intención, empresa o huella. | No reintentar; abrir incidencia. |
| Capacidad | `OPERATION_TOO_LARGE` | El plan excede el máximo aprobado. | No reintentar; es un fallo de implementación. |
| Temporal | `UNAVAILABLE` o timeout | No se conoce el resultado de red. | Reintentar exactamente el mismo envelope. |

Un doble clic o un timeout no se modela como conflicto: el servicio cliente debe reutilizar el mismo envelope y recibe el recibo original. Un intento independiente mientras existe un candado ajeno a ese recibo sí es `LOCK_CONFLICT`.

---

## 3. Transacción Admin SDK, idempotencia y auditoría

### 3.1 Contexto autorizado

La autorización es determinista y se resuelve antes de abrir la transacción y nuevamente dentro de ella:

1. **Actor:** `request.auth.uid`; una llamada sin `request.auth` falla con `AUTH_REQUIRED`.
2. **Tenant:** `empresaId` del contexto de sesión autenticada; nunca se deriva ni se acepta desde el payload.
3. **Rol y permisos efectivos:** el documento de membresía canónica activa del actor en esa Empresa. La membresía debe pertenecer al `empresaId`, tener estado activo y contener el rol y permisos vigentes que autorizan la capacidad `shifts`.
4. **Lifecycle:** `empresas/{empresaId}.estado`; solo `trial` o `activa` permiten apertura conforme ADR-SAAS-009.
5. **Identidad proyectada:** el perfil canónico del mismo `request.auth.uid`, solo para `cajeroNombre`.
6. **Intención:** forma cerrada del envelope y huella semántica, sin campos de autoridad.

Ningún valor de actor, tenant, rol, permiso, membresía, lifecycle o identidad recibido en el payload se usa, incluso si coincide con la fuente canónica. Los claims aportan el contexto autenticado de sesión, pero no sustituyen la lectura de membresía ni de Empresa.

La comprobación dentro de la transacción evita que una suspensión, revocación de membresía o cambio concurrente de permiso se cuele entre la autorización inicial y el commit. La autorización no crea un mapa nuevo de roles: la apertura solo procede si el permiso efectivo canónico ya autoriza `shifts`.

### 3.2 Plan fijo de lecturas y escrituras

El plan máximo aprobado para `abrirTurnoOperativoV1` es de seis lecturas documentales y cinco escrituras. No ejecuta queries de compatibilidad ni adopta turnos legacy: esas decisiones no pueden preceder al candado de una transacción server-authoritative y no forman parte del contrato R1-A.

| Orden | Recurso | Operación | Finalidad |
|---:|---|---|---|
| 1 | `empresas/{empresaId}` | Lectura | Lifecycle canónico. |
| 2 | membresía canónica del actor | Lectura | Rol, permisos y actividad. |
| 3 | identidad/perfil canónico del actor | Lectura | Nombre proyectado del cajero. |
| 4 | `operaciones_comandos/{empresaId}_{commandId}` | Lectura | Recibo canónico e identidad doble. |
| 5 | `operaciones_command_idempotency/{empresaId}_{idempotencyKey}` | Lectura | Índice de reintentos. |
| 6 | `turnos_activos/{actorUid}` | Lectura | Exclusividad de turno activo. |
| 1 | `turnos/{turnoIdNuevo}` | Escritura | Hecho de apertura con estado `abierto`. |
| 2 | `turnos_activos/{actorUid}` | Escritura | Candado que refiere al turno nuevo. |
| 3 | recibo canónico | Escritura | Envelope, huella, actor, resultado y referencias. |
| 4 | índice idempotente | Escritura | Referencia al recibo canónico. |
| 5 | `operaciones_auditoria/{empresaId}_{commandId}` | Escritura | Evento crítico backend-only `TurnoAbierto`. |

Todas las seis lecturas ocurren antes de la primera escritura. El ejecutor falla sin efectos ante cualquier precondición. Los límites se verifican antes del commit; la apertura no se fragmenta.

### 3.3 Secuencia de commit

1. Si recibo e índice resuelven coherentemente la misma dupla `(empresaId, commandId, idempotencyKey, huella)`, devolver el resultado persistido sin escribir de nuevo.
2. Si uno falta, apunta a otro recibo o alguno no coincide, responder el conflicto de identidad correspondiente; nunca reparar la inconsistencia desde el cliente.
3. Validar lifecycle, membresía/permisos y la ausencia de candado activo.
4. Reservar un nuevo ID de turno y crear el documento con los campos operativos actuales de apertura: actor, nombre canónico, timestamps servidor, estado `abierto`, `baseApertura`, notas de apertura y valores iniciales existentes. No se crean campos de cierre ni de relevo.
5. Crear el candado con ID determinista `turnos_activos/{actorUid}`, `empresaId`, `cajeroId`, `turnoId` y timestamp servidor.
6. Crear recibo, índice y auditoría en el mismo commit.

El documento de turno conserva su ID actual y la forma ya consumida por los lectores. R1-A no añade `turnoAnteriorId`, `relevadoA`, campos de cierre ni efectos derivados.

### 3.4 Recibo e índice idempotente

| Recurso backend-only | Campos mínimos |
|---|---|
| `operaciones_comandos/{empresaId}_{commandId}` | `empresaId` inmutable, `commandId`, `idempotencyKey`, tipo `abrirTurnoOperativoV1`, huella semántica, actor, rol efectivo, `correlationId`, resultado estable, referencias afectadas, estado final y timestamp servidor. |
| `operaciones_command_idempotency/{empresaId}_{idempotencyKey}` | `empresaId` inmutable, `idempotencyKey`, `commandId`, huella y referencia al recibo canónico. |

La huella se calcula en servidor a partir de la forma canónica del envelope permitido. La idempotencia no depende de un hash enviado por el cliente. Recibo, índice, turno, candado y auditoría son un único commit; por ello no puede existir un turno confirmado sin su evidencia de comando.

### 3.5 Auditoría

La apertura inicial registra un único evento `TurnoAbierto` en `operaciones_auditoria/{empresaId}_{commandId}` dentro de la transacción. Esta es la única autoridad de auditoría crítica de R1-A; `auditoria_logs` no participa en este flujo. Un reintento idempotente solo devuelve el recibo: no produce un segundo evento.

| Dato auditado | Regla |
|---|---|
| Tenant, actor y rol efectivo | Proceden de fuentes canónicas. |
| Comando e identidad | Tipo de comando, `commandId`, `idempotencyKey`, huella y correlación. |
| Motivo y payload permitido | Solo la base declarada y notas normalizadas cuando proceda; nunca secretos. |
| Referencias | `turnoId`, candado y recibo. |
| Resultado | `CONFIRMADO` con timestamp de servidor. |

No se guardan tokens, PIN, secretos, datos de pago ni stack traces. La auditoría crítica es backend-only conforme R1 §7.

---

## 4. Servicios cliente y componentes React

### 4.1 Servicios que cambian

| Archivo/servicio | Cambio de R1-A | No cambia |
|---|---|---|
| `lib/turnos-service.ts::abrirTurno` | Reemplaza su transacción Client SDK, creación de `turnos` y de `turnos_activos` por invocación tipada de `abrirTurnoOperativoV1`. Construye/reutiliza el envelope y devuelve el `turnoId` de la respuesta estable. | No calcula dinero, no cierra, no releva y no escribe Firestore crítico. |
| `lib/turnos-service.ts::suscribirTurnoActivo`, `verificarTurnoActivo`, `suscribirHistorialTurnos` | Permanecen como consumidores de lectura autorizada tenant-scoped. | No se convierten en Callables. |
| `lib/turnos-service.ts::calcularVentasTurno` | No es parte de R1-A. Conserva su consulta B7 de ventas `COMPLETO` hasta que la fase posterior de cierre sea diseñada. | No se invoca desde la nueva Callable de apertura. |
| `lib/turnos-service.ts::cerrarTurno` y `obtenerCandidatosRelevo` | Sin cambio funcional ni migración en R1-A. Se declaran escritores/flujo pendientes del corte posterior. | No se llaman desde `abrirTurnoOperativoV1`. |

El servicio cliente genera una intención una sola vez por acción explícita de apertura. Conserva el envelope pendiente hasta recibir una respuesta final; ante `UNAVAILABLE`, timeout o `ABORTED` reintenta el mismo envelope con backoff. Solo después de éxito o error no reintentable descarta esa intención. La persistencia concreta del envelope entre recargas debe ser común a navegador, PWA y Electron, sin incluir datos sensibles.

### 4.2 Componentes React afectados

| Componente | Impacto de R1-A |
|---|---|
| `components/pos/turno-gate.tsx` | Mantiene el formulario y el bloqueo del POS; invoca el nuevo `abrirTurno` y traduce los errores de dominio. No envía actor, tenant, rol ni nombre. |
| `components/pos/shifts-module.tsx` | Su acción de apertura usa el nuevo servicio y conserva la actualización mediante listener. Su UI de cierre permanece sin cambios y fuera de la migración. |
| `components/pos/global-close-shift.tsx` | No cambia: solo participa en cierre, que R1-A excluye. |
| Historial administrativo de turnos | No cambia: sigue leyendo documentos de turnos autorizados. |

No se agregan pantallas, permisos, diálogos, flujos de caja ni interfaces de soporte. La UI sigue siendo una ayuda de operación, nunca la barrera de seguridad.

---

## 5. Firestore Rules

### 5.1 Política final aprobada por R1

El destino obligatorio del corte completo de turnos es:

| Colección | Lectura cliente | Create/update/delete cliente |
|---|---|---|
| `turnos` | Permitida solo a tenant, rol y lifecycle autorizados. | Denegados. |
| `turnos_activos` | Permitida solo a tenant, rol y lifecycle autorizados. | Denegados. |
| `operaciones_comandos` | Denegada al cliente. | Denegados. |
| `operaciones_command_idempotency` | Denegada al cliente. | Denegados. |
| `operaciones_auditoria/{empresaId}_{commandId}` | Denegada. | `create`, `update` y `delete`: denegados. |

Las Rules conservan defensa tenant, fallback-deny y lectura canónica de lifecycle de ADR-SAAS-009. No intentan validar unicidad, idempotencia, forma completa de turno ni relaciones financieras: esas invariantes pertenecen a la Callable y su transacción Admin SDK.

### 5.2 Gate de activación

R1-A despliega junto con la Callable las denegaciones backend-only de `operaciones_comandos`, `operaciones_command_idempotency` y `operaciones_auditoria`; son rutas nuevas sin escritor cliente compatible. R1-A **no despliega** la política final sobre `turnos` y `turnos_activos`. El cierre y el relevo actuales todavía escriben esos documentos directamente; negar sus escrituras en este punto rompería un cliente operativo y contradiría R1 §9.

La activación de las Rules finales exige, en una fase posterior y antes del deploy de Rules:

1. Callable server-authoritative de cierre que incluya todos los efectos financieros aprobados.
2. Relevo integrado en esa misma Callable de cierre.
3. Todos los clientes web, PWA y Electron compatibles con ambas Callables y bloqueados por versión mínima si conservan escritor directo.
4. Evidencia de que no queda ruta directa de escritura a `turnos` o `turnos_activos`.
5. Pruebas Rules negativas y regresión integral aprobadas.

No se aplica un endurecimiento parcial que cree dos políticas de autoridad sobre la misma colección. R1 prohíbe dual-write y exige cerrar la ruta legacy antes de negar la escritura directa correspondiente.

---

## 6. Compatibilidad, despliegue y rollback

### 6.1 Compatibilidad

| Área | Garantía de R1-A |
|---|---|
| Datos existentes | No se reescribe ningún turno, candado ni venta; no hay backfill, reparación ni adopción legacy. |
| B7/ADR-SAAS-010 | R1-A no consulta ni modifica ventas; las lecturas de cierre existentes siguen filtrando `estadoOperativo == "COMPLETO"`. |
| B1 | La sugerencia de apertura y políticas de roles mantienen sus fuentes actuales; no se modifica configuración. |
| Tenant/lifecycle | La Callable endurece la escritura con contexto canónico. Las lecturas existentes conservan las Rules vigentes. |
| Clientes | Web, PWA y Electron consumen el mismo servicio cliente. No se altera la forma de los documentos leídos ni la UX de apertura. |
| Notificaciones | No se crea un segundo pipeline ni una emisión dentro de la transacción. Cualquier adaptación de push queda bajo D-NOTIF-02, separada de este corte. |

La coexistencia temporal consiste en que la apertura nueva usa Callable mientras cierre/relevo mantienen su ruta actual. No hay dual-write para apertura: una acción usa únicamente la Callable. Esta coexistencia no es el cutover final de la colección ni autoriza Rules restrictivas.

### 6.2 Estrategia de despliegue

1. Ejecutar un preflight bloqueante: por cada `turnos` con `estado == "abierto"` debe existir exactamente `turnos_activos/{cajeroId}` con el mismo `empresaId`, `cajeroId` y `turnoId`. El resultado permitido es cero turnos abiertos sin candado coincidente y cero candados huérfanos o inconsistentes. Cualquier diferencia bloquea el despliegue; R1-A no repara, adopta ni rellena datos legacy.
2. Verificar las demás precondiciones: B7 certificado, membresías/roles canónicos, Empresa objetivo operativa y pruebas de Functions/Rules en emulador.
3. Desplegar `abrirTurnoOperativoV1` y las Rules backend-only de `operaciones_comandos`, `operaciones_command_idempotency` y `operaciones_auditoria`, sin enrutar todavía clientes; verificar autenticación, logs sanitizados y ausencia de efectos sobre datos existentes.
4. Publicar el cliente compatible en web, PWA y Electron, con el mismo flujo de apertura y reintento de envelope estable.
5. Observar recibos, auditorías, conflictos de idempotencia, errores de lifecycle y ausencia de turnos/candados duplicados por el nuevo camino.
6. Mantener las Rules actuales de `turnos` y `turnos_activos` durante R1-A. No ejecutar backfill ni cambiar documentos históricos.
7. Planificar el corte final de Rules únicamente junto con la futura migración server-authoritative de cierre y relevo.

### 6.3 Estrategia de rollback

Antes de activar las Rules finales —que R1-A no activa— se puede retirar el cliente que invoca la Callable y mantener la evidencia ya confirmada por servidor. No se borran recibos, auditorías, turnos ni candados creados por la Callable; los hechos confirmados permanecen inmutables.

El rollback no reescribe ni elimina datos. Si se detecta un defecto de la Callable, se corrige con una versión compatible que siga devolviendo el recibo original para los comandos ya confirmados. Tras el futuro corte completo de Rules, aplica R1 §9: queda prohibido volver a un escritor Firestore directo; solo se revierte hacia cliente o Callable compatible y una reapertura de Rules exige break-glass aprobado y auditado.

---

## 7. Estrategia de pruebas

### 7.1 Unitarias

| Caso | Evidencia esperada |
|---|---|
| Envelope válido | Acepta únicamente los seis campos R1 permitidos, incluido `motivo` opcional no utilizado en apertura, y el payload cerrado. |
| Payload malicioso | Rechaza `empresaId`, actor, rol, `cajeroId`, nombre, `turnoAnteriorId`, cuentas y campos de cierre. |
| Base de apertura | Acepta entero no negativo; rechaza flotante, negativo, `NaN`, fuera de rango y texto. |
| Contexto canónico | Rechaza sesión, membresía, permiso o lifecycle no válidos. |
| Huella | Misma intención produce misma huella; cualquier diferencia permitida produce conflicto de identidad. |
| Idempotencia | Recibo e índice coincidentes devuelven la misma respuesta sin planificar escrituras. |
| Auditoría | El primer éxito crea solo `operaciones_auditoria/{empresaId}_{commandId}` con referencias correctas y un reintento no genera otro evento. |
| Error mapping | Cada precondición se traduce al código de dominio y comportamiento cliente de §2.5. |

### 7.2 Integración (Functions + Firestore Emulator)

| Caso | Evidencia esperada |
|---|---|
| Apertura normal | Un único `turnos/{id}` abierto, un lock con ese ID, recibo, índice y auditoría en el mismo commit. |
| Doble invocación con mismo envelope | Mismo `turnoId`; conteo de turnos, candados y auditorías permanece en uno. |
| Mismo `commandId`/clave distinta | Sin efectos adicionales; conflicto correcto. |
| Dos aperturas concurrentes del mismo actor | Una confirma; la otra recibe `LOCK_CONFLICT` o el recibo equivalente si era el mismo envelope. |
| Dos actores del mismo tenant | Cada actor puede abrir solo su propio turno y lock; no hay cruce de tenant. |
| Tenant ajeno, membresía revocada o Empresa suspendida | Commit cero. |
| Fallo inyectado previo al commit | No quedan documentos parciales. |
| Lecturas existentes | `suscribirTurnoActivo` e historial ven la forma vigente del turno creado por servidor. |
| Preflight de candados | Cualquier turno abierto sin candado coincidente, o candado huérfano/inconsistente, bloquea el despliegue y no ejecuta reparación automática. |
| Rules R1-A backend-only | El cliente no puede leer ni escribir recibos, índice ni `operaciones_auditoria`; Admin SDK sí crea los tres en el commit. |
| Rules destino | En la futura fase completa, pruebas negativas demuestran que cliente no puede escribir `turnos`, locks, recibos ni auditoría. |

### 7.3 End-to-end

| Escenario | Resultado observable |
|---|---|
| Cajero/supervisor autorizado abre desde TurnoGate | El POS deja de estar bloqueado al recibir el turno por listener. |
| Apertura desde Shifts Module | Se muestra el mismo turno y no aparece una segunda apertura. |
| Doble clic, pérdida de red o retry | El cliente reutiliza la intención; se muestra el turno único confirmado. |
| Dos pestañas/dispositivos del mismo actor | No existen dos turnos abiertos; el segundo flujo recarga el estado ante conflicto. |
| Empresa suspendida o permiso retirado durante la acción | La UI informa rechazo y no se crea turno. |
| Cliente Electron | Llama a la misma Callable y recibe el mismo contrato que web/PWA. |
| Historial de turnos | Muestra el documento nuevo sin cambio de esquema ni filtración cross-tenant. |

Los escenarios E2E de cierre, conteo ciego, depósitos, faltantes, ventas `COMPLETO`, egresos y relevo no pertenecen a R1-A. Se definen y ejecutan con la fase posterior que pueda validar su transacción completa.

---

## 8. Criterios de aceptación de R1-A

R1-A queda listo para implementación solo cuando se demuestre que:

1. Existe una única nueva Callable, `abrirTurnoOperativoV1`, y ningún nuevo escritor directo cliente para apertura.
2. El payload no contiene ni puede imponer tenant, actor, cajero, rol, permisos, nombre canónico, cuentas, ventas, cierre o relevo.
3. Actor (`request.auth.uid`), tenant (sesión autenticada), rol/permisos (membresía canónica activa) y lifecycle (`empresas/{empresaId}` en `trial`/`activa`) se verifican antes y dentro de la transacción; ninguno procede del payload.
4. Cada apertura confirmada crea co-atómicamente turno, lock, recibo, índice y auditoría.
5. Un reintento con el mismo envelope devuelve exactamente el resultado original y no duplica hechos ni auditoría.
6. Un segundo intento independiente del mismo actor no crea un turno paralelo.
7. La forma de `turnos` y `turnos_activos`, sus IDs, sus listeners y sus lectores tenant-scoped siguen siendo compatibles.
8. No se modifican B1, B2, B7, `estadoOperativo`, ventas, inventario, cuentas, transacciones financieras, caja ni notificaciones.
9. Las Rules backend-only de recibos, índice y `operaciones_auditoria` están activas; no se activa la denegación final de `turnos`/`turnos_activos` mientras cierre/relevo dependan de escrituras directas.
10. Las pruebas unitarias, de emulador y E2E de apertura descritas en §7 pasan en web, PWA y Electron; las pruebas negativas de las Rules destino quedan como gate explícito del corte posterior completo de turnos.

### 8.1 Condiciones de rechazo

Debe rechazarse cualquier implementación que:

- acepte `empresaId`, `cajeroId`, `cajeroNombre`, rol, saldo, cuenta o datos derivados como autoridad cliente;
- abra un turno y su candado en commits distintos;
- use una query cliente previa como garantía de unicidad;
- continúe el despliegue si el preflight detecta un turno abierto sin candado coincidente, un candado huérfano o una inconsistencia de tenant/cajero/turno;
- devuelva un resultado distinto en un reintento idempotente;
- cree o modifique ventas, egresos, cuentas, transacciones financieras, caja, inventario, cierre o relevo;
- active Rules finales para `turnos` mientras exista un escritor directo de cierre/relevo;
- borre, reabra o modifique un turno cerrado;
- introduzca dual-write, migración histórica o un segundo pipeline de notificaciones.

---

## 9. Prerrequisitos diferidos para el corte completo de turnos

Los siguientes elementos no son trabajo de R1-A y deberán diseñarse en una fase posterior, con alcance explícito que incluya caja, ventas y egresos:

| Prerrequisito | Razón de diferimiento |
|---|---|
| `cerrarTurnoOperativoV1` | Debe recalcular ventas B7 `COMPLETO` y egresos desde servidor, validar fondos y registrar hechos financieros co-atómicos. |
| Relevo dentro del cierre | Depende del cierre origen, del turno destino y de ambos candados en una misma transacción. |
| Reversión/ajuste posterior | R1 exige correcciones compensatorias auditables, no edición del turno cerrado. |
| Rules finales de turnos | Solo son seguras cuando no quede ningún escritor directo para apertura, cierre o relevo. |
| E2E integral de caja | Requiere ventas, egresos, cuentas, depósitos, faltantes y relevo; todos fuera de R1-A. |

Estos prerrequisitos no autorizan extender R1-A. Su única función en este documento es establecer el gate que impide declarar un cutover de Rules incompleto.

## Referencias

- `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md` §§1–11.
- `ADR-SAAS-009-enforcement-ciclo-vida.md`.
- `ADR-SAAS-010-integracion-fiscal-inventario.md` §§1–3 y §7.
- `MT-U10-B6-B7-cierre-arquitectonico.md` §B7.
- `MT-U3-helper-tenant-diseno.md` §§7–8 y §11.
- `MT-U6-U8-B1-configuracion-empresarial.md` §4.8 y §9.3.
- `ADR-SAAS-005-rol-supervisor.md`.
- `PROJECT_DISCOVERY.md` — contrato operativo vigente de turnos.
- `IMP-4-validacion-fondos-diseno.md` — antecedente aplicable exclusivamente a la fase posterior de cierre.
