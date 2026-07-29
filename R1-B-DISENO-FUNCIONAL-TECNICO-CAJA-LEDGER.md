# R1-B — Diseño funcional y técnico: Caja y Ledger financiero

> **Estado:** DISEÑO PROPUESTO. Este documento no implementa código, Rules, migraciones, despliegues ni Pull Requests.
>
> **Alcance:** caja operativa, movimientos de caja, ledger financiero, saldos, turnos, efectos financieros de ventas, anulaciones, devoluciones futuras y cierre. No autoriza R1-C ni funcionalidades posteriores.
>
> **Precondiciones:** R1, R1-A, B1, B2, B7 y los ADR SaaS aplicables permanecen vigentes. Cuando una fuente superior difiera, prevalece la fuente superior.

---

## 1. Objetivo

Definir una frontera server-authoritative para que cada variación de dinero sea un hecho financiero inmutable, tenant-aware, idempotente y co-atómico con el saldo que proyecta. El diseño completa la parte de caja diferida por R1-A sin cambiar el modelo aprobado de Empresa, membresías, fiscalidad, ventas ni configuración empresarial.

La decisión central es deliberadamente conservadora: el **Ledger Financiero** es la colección existente `transacciones_financieras`; no se crea un segundo ledger ni se reemplaza el modelo de cuentas actual. `cuentas_bancarias.saldo` continúa como proyección/cache de lectura y nunca como fuente de verdad independiente.

## 2. Alcance y límites

Incluye:

- apertura y cierre de caja ligados al turno;
- ingresos, egresos, traslados y ajustes compensatorios;
- efectos de tesorería de ventas `COMPLETO`;
- anulaciones pre y post efectos;
- contrato de compatibilidad para devoluciones posteriores;
- saldo, conteo ciego, diferencias, auditoría, idempotencia y concurrencia.

Excluye:

- emisión fiscal, numeración y `snapshotFiscal` (B2);
- inventario, costo, Kardex, compras, producción y traslados de inventario;
- UX nueva, conciliación bancaria, contabilidad de doble partida externa, reportes contables, cierre fiscal, créditos/cartera y pagos de terceros;
- una reapertura de turno cerrado o una corrección que edite hechos históricos.

## 3. Modelo de dominio

| Concepto | Definición y autoridad |
|---|---|
| **Cuenta financiera** | Agregado persistente en `cuentas_bancarias/{cuentaDocumentoId}`. Identifica una cuenta de efectivo o banco, pertenece a una Empresa y expone el cache `saldo`. Sus metadatos son administrativos; el saldo solo cambia junto a movimientos de ledger. |
| **Ledger financiero / Movimiento financiero** | Hecho append-only persistido en `transacciones_financieras/{movimientoId}`. Explica un único crédito o débito de una cuenta. El signo se deriva de `tipo`; `monto` siempre es entero positivo en moneda mínima. |
| **Caja operativa** | Agregado lógico, no una colección ni un saldo paralelo. Es la custodia física de efectivo de un `turnos/{turnoId}` abierto, la cuenta de efectivo asignada y los movimientos que lo referencian. |
| **Balance** | Resultado derivado: `saldo de cuenta = saldo inicial certificado + Σ créditos - Σ débitos`. Durante operación se lee desde `cuentas_bancarias.saldo`; la reconstrucción desde el ledger resuelve discrepancias. |
| **Totales de turno** | Proyección congelada al cerrar: ventas `COMPLETO` por medio, egresos confirmados, efectivo esperado, efectivo contado, diferencia y depósito neto. No son una nueva fuente de saldo. |
| **Turno** | Hecho operativo. `abierto` permite movimientos asociados; `cerrado` es terminal. Su candado representa exclusividad, no dinero. |

### 3.1 Estados

```text
Turno:  abierto -> cerrado (terminal)
Venta:  PENDIENTE_EFECTOS -> COMPLETO -> ANULADA_CON_EFECTOS (terminal)
        PENDIENTE_EFECTOS -> ANULADA_SIN_EFECTOS (terminal)
Comando: recibido/ausente -> CONFIRMADO | RECHAZADO técnico sin efectos
Movimiento: CONFIRMADO (inmutable; no tiene update ni delete)
```

No existe estado `reabierto`. Una rectificación posterior se expresa con un nuevo comando y un movimiento compensatorio enlazado al hecho original.

### 3.2 Semántica de la base de apertura

`turnos.baseApertura` permanece como una declaración de flotante físico congelada en R1-A. No acredita `caja-principal`, no crea un movimiento financiero y no se usa como permiso para sobregirar una cuenta. Esto evita doble contabilización: el ledger registra los ingresos/egresos operativos; el turno usa la base únicamente para calcular el efectivo físico esperado.

## 4. Arquitectura y frontera de autoridad

```text
Cliente POS / Backoffice
  -> solicita comando con envelope R1
  -> Callable autenticada
     -> resuelve Empresa, actor, membresía, permiso y lifecycle
     -> lee turno, venta/egreso/cuenta, recibo e índice idempotente
     -> transacción Admin SDK única
        -> movimiento(s) inmutables + saldo(s) cache
        -> turno/venta cuando corresponda
        -> recibo + índice + auditoría crítica
```

El cliente puede calcular una vista previa, capturar el conteo y presentar errores, pero no decide tenant, actor, permiso, cuenta, venta aplicable, totales fuente, saldo, diferencia, ni el efecto financiero. La Callable relee los documentos decisorios dentro de la transacción.

`empresas/{empresaId}.estado` y la membresía canónica activa son condiciones obligatorias. Solo `trial` y `activa` admiten una operación. El `empresaId` procede de la sesión/contexto autenticado, nunca del payload.

## 5. Modelo de datos Firestore

Se conservan las colecciones planas y el discriminador obligatorio `empresaId` de ADR-SAAS-001.

### 5.1 Cuenta financiera — `cuentas_bancarias/{cuentaDocumentoId}`

Campos compatibles y requeridos para R1-B:

| Campo | Regla |
|---|---|
| `id`, `claveOperativa`, `empresaId`, `nombre`, `tipo: efectivo|banco`, `saldo` | Identidad, tenant y proyección vigente. `id` es el ID físico del documento; `claveOperativa` es la semántica inmutable de una cuenta del sistema, persistida en cuentas nuevas y derivada del ID físico preservado para las cuentas fundacionales legacy. `saldo` es dinero entero; no se escribe sin ledger co-atómico. |
| `estado` / metadatos de presentación | Solo administración autorizada; una cuenta con historial no se elimina ni cambia su identidad financiera. |
| `moneda` (si se materializa) | Debe coincidir con la configuración/localización de la Empresa; R1-B no introduce conversión de moneda. |

La identidad física definitiva no se cambia por R1-B. Toda cuenta ya existente conserva exactamente su `cuentaDocumentoId`; en particular, las cuentas fundacionales existentes `caja-principal` y `caja-fuerte` conservan esos IDs físicos y no se copian, renombran ni reescriben. Para cuentas creadas después del bootstrap SaaS, el ID físico se fija una única vez al crear la cuenta como `identificadorInterno(empresaId, "cuenta:" + claveOperativa)` y permanece inmutable. Esta regla solo aplica a documentos nuevos: no autoriza una migración de cuentas existentes.

El dato canónico que identifica a la Empresa fundacional es únicamente `empresas/{empresaId}.esFundacional === true`, leído por el backend en la misma transacción que resuelve la cuenta. El bootstrap de una Empresa nueva siempre persiste `esFundacional: false`; ningún comando financiero, cliente ni metadato de cuenta puede inferir o alterar esa condición. La unicidad de la Empresa fundacional y la conservación de su documento son precondiciones ya aprobadas del bootstrap SaaS; R1-B solo consume ese dato.

En el mismo commit server-authoritative que hace utilizable una Empresa no fundacional, su bootstrap debe crear exactamente un documento por cada clave reservada `caja-principal` y `caja-fuerte`. Cada documento nace en `cuentas_bancarias/{identificadorInterno(empresaId, "cuenta:" + claveOperativa)}`, con `id` igual al ID físico, `empresaId` de la Empresa creada, `claveOperativa` reservada, `tipo` y metadatos iniciales compatibles, y `saldo: 0`. La creación es idempotente respecto del bootstrap: si el documento ya existe debe coincidir íntegramente con esa identidad; una diferencia bloquea el bootstrap. No se crea movimiento de ledger por esta inicialización y no se escribe ningún documento legacy. La Empresa no se considera operativa si el commit atómico no incluye ambas cuentas.

`caja-principal` y `caja-fuerte` son claves lógicas reservadas, no un supuesto de ID global. El ejecutor recibe o deriva una clave lógica, nunca toma un ID físico del payload como autoridad: primero lee la Empresa del `empresaId` servidor; si `esFundacional === true`, la clave reservada resuelve exclusivamente al ID legacy homónimo. Si `esFundacional === false`, resuelve exclusivamente a `identificadorInterno(empresaId, "cuenta:" + claveOperativa)`. Después lee ese único documento y exige que `id`, `empresaId` y `claveOperativa` coincidan con la resolución; cualquier ID físico recibido que no coincida se ignora o se rechaza como `CUENTA_INVALIDA`.

Las cuentas no reservadas usan una `claveOperativa` opaca e inmutable y su resolvedor exige la misma correspondencia `(empresaId, claveOperativa, cuentaDocumentoId)` registrada al crearse. En todos los casos, el resolvedor parte del `empresaId` servidor y verifica dentro de la transacción que el documento pertenece a esa Empresa; un ID o clave que no resuelva en el tenant se rechaza.

Así se conserva la colección plana y el `empresaId` obligatorio, se preservan los documentos e IDs existentes exigidos por R1 y se evita tanto dual-write como una migración implícita. La coexistencia legacy es solo de resolución de identidad: cada operación lee y escribe un único documento de cuenta y un único ledger; no existe réplica ni sincronización entre IDs.

### 5.2 Movimiento financiero — `transacciones_financieras/{movimientoId}`

| Grupo | Campos mínimos |
|---|---|
| Identidad | `empresaId`, `id`, `claveIdempotencia`, `commandId`, `idempotencyKey`, `correlationId`, `tipo`, `monto`, `moneda`, `fecha` de servidor |
| Cuenta | `cuentaDocumentoId`, `cuentaClaveSnapshot`, `cuentaNombreSnapshot`, `saldoDespues` opcional de diagnóstico; el saldo se calcula dentro de la transacción |
| Clasificación | `categoria`: `ventas`, `ingreso_caja`, `movimiento_manual`, `egreso`, `traslado_entrada`, `traslado_salida`, `cierre_deposito`, `faltante_caja`, `sobrante_caja`, `anulacion_venta`, `devolucion_venta` |
| Trazabilidad | `referenciaColeccion`, `referenciaId`, `turnoId?`, `ventaId?`, `egresoId?`, `movimientoRelacionadoId?`, `motivo?`. En una venta, `turnoId` conserva el turno origen confirmado por B2; es una referencia histórica y puede estar cerrado cuando el reconciliador durable materializa la línea. |
| Actor | `usuarioId`, `usuarioNombreSnapshot`, `rolEfectivoSnapshot` |

`monto` es estrictamente mayor que cero; `tipo` es `ingreso` o `egreso`; el delta es derivado y no se acepta desde el cliente. Cada línea tiene identidad física determinista: `id = identificadorInterno(empresaId, "movfin:" + claveIdempotencia)`. `claveIdempotencia` es única por efecto, se comprueba dentro de la misma transacción y no es sustituida por el recibo del comando.

La composición de `claveIdempotencia` es exhaustiva para R1-B:

- venta: `venta:{ventaId}:pago:{piernaOrdinal}`; la pierna ordinal proviene del snapshot de pago confirmado y la misma clave se reutiliza por el reconciliador;
- ingreso de caja: `ingreso_caja:{commandId}`;
- movimiento manual no asociado a una venta ni a un egreso: `movimiento_manual:{commandId}`;
- egreso: `egreso:{commandId}`; el documento de egreso y su movimiento nacen con ese mismo comando;
- traslado: `traslado:{commandId}:origen` y `traslado:{commandId}:destino`;
- depósito de cierre: `cierre:{turnoId}:{commandId}:deposito:origen` y `cierre:{turnoId}:{commandId}:deposito:destino`;
- faltante de cierre: `cierre:{turnoId}:{commandId}:faltante`;
- sobrante de cierre: `cierre:{turnoId}:{commandId}:sobrante`;
- anulación de venta: `anulacion:{ventaId}:pago:{piernaOrdinal}`;
- devolución de venta futura: `devolucion_venta:{devolucionId}:pago:{piernaOrdinal}`;
- cualquier otra compensación permitida: `compensacion:{movimientoOriginalId}:{tipoCompensacion}`.

No existe una categoría ni una línea financiera R1-B sin una de estas composiciones. Un traslado y un depósito de cierre generan sus dos movimientos deterministas, relacionados entre sí y con el mismo comando. El recibo R1 resuelve el reintento del comando completo; las claves por línea satisfacen OPE-02 y permiten comprobar que ningún ingreso, venta, egreso, traslado, cierre o compensación emitió dos efectos.

### 5.3 Turno, recibos y auditoría

- `turnos/{turnoId}` conserva su forma actual y, al cierre, congela `ventasEfectivo`, `ventasOtrosMetodos`, `totalEgresos`, `totalEsperadoEfectivo`, `totalReportadoEfectivo`, `diferenciaEfectivo`, `conteoDetalle`, `fechaCierre`, estado y referencias del cierre.
- `turnos_activos/{identificadorInterno(empresaId, cajeroId)}` sigue siendo el candado tenant-scoped. R1-B usa el formato R1-A, no el ID legacy sin tenant.
- `operaciones_comandos/{identificadorInterno(empresaId, commandId)}` y `operaciones_command_idempotency/{identificadorInterno(empresaId, idempotencyKey)}` son los recibos backend-only compartidos por R1. Guardan huella semántica, resultado estable y referencias afectadas.
- `operaciones_auditoria/{identificadorInterno(empresaId, commandId)}` contiene un único evento crítico por confirmación. No sustituye `saas_auditoria`, que corresponde al plano de plataforma.

## 6. Flujos operativos

Todo comando usa el envelope R1: `commandId`, `idempotencyKey`, `correlationId`, `causationId?`, `motivo?` y un `payload` cerrado. La huella se calcula en servidor con la forma canónica permitida.

### 6.1 Apertura

La apertura ya definida por R1-A se conserva: valida contexto, crea co-atómicamente turno abierto, candado, recibo, índice y `TurnoAbierto`. `baseApertura` no genera un movimiento. R1-B no reinterpreta ni amplía esa operación.

### 6.2 Ingreso y egreso de caja

- Un ingreso manual requiere categoría autorizada, monto entero positivo, cuenta existente y motivo cuando no procede de una venta. Si acredita `caja-principal`, exige un turno abierto y persiste su `turnoId`; crea un movimiento y actualiza el saldo de esa cuenta en el mismo commit.
- Un egreso requiere turno abierto cuando debita `caja-principal`, permiso efectivo `gastos` o el que la política vigente asigne, referencia de egreso, monto positivo, motivo y fondos suficientes en la cuenta a debitar. Crea `egresos/{id}`, su movimiento `egreso` y el nuevo saldo en un solo commit.
- El movimiento financiero manual administrativo no reemplaza el egreso operativo. Requiere la capacidad financiera vigente y razón explícita. Su corrección es el movimiento opuesto referenciado.

### 6.3 Venta

B2 confirma primero la venta fiscal en `PENDIENTE_EFECTOS`. Solo `aplicarEfectosVentaOperativaV1`, servidor y con la venta como fuente de verdad, puede:

1. exigir el estado previo exacto `PENDIENTE_EFECTOS`;
2. derivar las piernas de pago y cuentas desde la venta confirmada;
3. emitir una línea financiera determinista por cada pierna aplicable y acreditar su cuenta; toda pierna de efectivo toma obligatoriamente `turnoId` de `ventas/{ventaId}.turnoId`, ya confirmado por B2. El ejecutor valida que ese turno pertenece a la misma Empresa, pero no exige que continúe abierto: si ya está cerrado, registra la línea con esa referencia histórica, actualiza únicamente el ledger y el saldo co-atómico de la cuenta y no reabre ni modifica el turno, su candado ni sus totales congelados;
4. aplicar los efectos de inventario que pertenezcan a su propio dominio;
5. cambiar la venta a `COMPLETO` en la misma transacción.

Ventas `PENDIENTE_EFECTOS` o anuladas no entran en balances, cierres ni reportes de caja. Una venta fiscal pendiente se reconcilia desde el mismo ejecutor interno; si su turno origen ya cerró, su efecto se materializa contra el mismo `ventaId`, la misma `turnoId` histórica y la misma clave `venta:{ventaId}:pago:{piernaOrdinal}`, sin alterar el cierre histórico. La transacción lee la venta pendiente y la línea determinista antes de escribir; crea cada línea inexistente y cambia la venta a `COMPLETO` en el mismo commit, o devuelve el resultado ya confirmado. No se autoanula por tiempo ni se duplica por reintento.

### 6.4 Anulación y devolución futura

- **Anulación pre-efectos:** `PENDIENTE_EFECTOS -> ANULADA_SIN_EFECTOS`. No emite movimiento financiero, porque no existe crédito previo.
- **Anulación post-efectos:** `COMPLETO -> ANULADA_CON_EFECTOS`. Emite débitos compensatorios por cada pierna de pago, enlazados a la venta y a los movimientos de venta; nunca edita el movimiento original ni el `snapshotFiscal`.
- **Devolución futura:** queda reservada como un hecho distinto de la anulación. Deberá referenciar venta y líneas origen, impedir devolver más de lo vendido/ya devuelto, definir la cuenta de reembolso autorizada y crear un movimiento `devolucion_venta` compensatorio. No está autorizada su implementación por R1-B y no debe simularse cambiando una venta histórica.

Toda salida de efectivo de anulación/devolución valida fondos dentro de la misma transacción. Si afecta `caja-principal`, debe asociarse al turno abierto que realiza la devolución; la venta origen permanece como referencia, no como turno de custodia. Si no hay fondos, se rechaza sin cambiar la venta ni crear reversos parciales.

### 6.5 Cierre y relevo

`turnoId` es obligatorio en toda línea que cambie la custodia de `caja-principal`: venta en efectivo, ingreso manual de caja, egreso de caja, traslado desde o hacia caja durante la jornada, anulación/devolución en efectivo, depósito de cierre y ajuste de diferencia. Es nulo para movimientos bancarios o de custodia que no pertenecen a una jornada. Para una venta, el servidor lo deriva exclusivamente del turno origen confirmado por B2 y lo conserva como trazabilidad histórica, incluso si la reconciliación ocurre después de su cierre; para las demás operaciones de caja lo deriva del turno abierto validado. Nunca lo acepta como autoridad cliente.

Antes de cerrar, el arqueo toma exclusivamente las líneas confirmadas de `caja-principal` con ese `turnoId`, anteriores al comando de cierre. Participan: créditos `ventas`, `ingreso_caja` y `traslado_entrada`; débitos `egreso`, `anulacion_venta`, `devolucion_venta` y `traslado_salida`. `cierre_deposito`, `faltante_caja` y `sobrante_caja` se excluyen del cálculo previo porque nacen en el propio cierre. Las líneas bancarias, de otro turno o de otra cuenta nunca participan.

`cerrarTurnoOperativoV1` es una sola transacción server-authoritative. Lee turno y candado, esas líneas financieras, ventas del turno con `estadoOperativo == COMPLETO`, egresos confirmados, cuentas afectadas, actor/relevo, recibos e índice. Recalcula, sin confiar en totales cliente. El cierre es una frontera terminal: una línea de venta que el reconciliador materialice después, aunque conserve el `turnoId` histórico, no se incorpora retroactivamente a sus totales ni provoca una reapertura o modificación:

```text
flujoCajaPreCierre = Σ créditos participantes - Σ débitos participantes
efectivoEsperado   = baseApertura + flujoCajaPreCierre
diferencia         = efectivoContado - efectivoEsperado
depositoNeto       = max(0, efectivoContado - baseApertura)
saldoCajaFinal     = saldoCajaInicial - depositoNeto + diferencia
```

La transacción sigue este orden lógico, con todas las lecturas antes de las escrituras:

1. lee y valida todos los hechos y calcula `saldoCajaFinal`;
2. rechaza el cierre si `saldoCajaFinal < 0`; la suficiencia se valida contra el efecto neto inseparable del cierre, no contra un estado intermedio ficticio;
3. registra el traslado `caja-principal -> caja-fuerte` por `depositoNeto`, con dos líneas deterministas de ledger;
4. registra exactamente una línea determinista de `faltante_caja` (débito por `abs(diferencia)`) o `sobrante_caja` (crédito por `diferencia`) cuando la diferencia no es cero;
5. actualiza ambos saldos a sus valores finales calculados, congela los totales y el conteo, cierra el turno y elimina su candado;
6. si hay relevo autorizado, crea el nuevo turno y su candado conforme al contrato R1, sin duplicar movimientos ni trasladar digitalmente la base física;
7. escribe recibo, índice y auditoría `TurnoCerrado` o `TurnoRelevado`.

Un sobrante no se rechaza por intentar debitar primero un saldo que todavía no refleja su crédito: ambas líneas se validan por el saldo final y se confirman juntas. Un faltante sí se rechaza si el saldo final sería negativo. El umbral B1 de faltante solo determina `alertaFaltante`; no corrige la diferencia, no autoriza sobregiro y no oculta el movimiento. Si el plan no cabe en el límite de Firestore, responde `OPERATION_TOO_LARGE` sin efectuar un cierre parcial. La implementación debe fijar y probar el máximo de líneas/ventas/egresos admisible antes de activar la Callable.

### 6.6 Reapertura

No aplica. Un turno cerrado no se modifica ni se reabre. Un error posterior exige un comando de ajuste o reversión compensatoria con referencia al cierre y motivo obligatorio; el diseño del catálogo exacto de ajustes posteriores queda para una fase explícita, no para R1-B.

## 7. Reglas de negocio e integridad

1. Cada documento operativo, cuenta, movimiento, turno, recibo y auditoría crítica contiene el `empresaId` inmutable del contexto servidor.
2. Ningún saldo cambia sin al menos un movimiento financiero co-atómico; ningún movimiento confirmado puede editarse o borrarse.
3. Los montos son enteros seguros, positivos donde correspondan, en moneda mínima y sin floats. La suma de pagos mixtos debe coincidir exactamente con el total de venta.
4. Una cuenta de origen debe tener fondos suficientes para todo débito, incluyendo la suma por cuenta de una anulación mixta. En el cierre, el control se aplica al saldo final de las líneas inseparables de depósito y diferencia. La validación y los efectos ocurren en la misma transacción.
5. Toda corrección, reversión, anulación post-efectos y devolución crea hechos nuevos relacionados; nunca muta un hecho histórico.
6. Solo ventas `COMPLETO` contribuyen al cierre. Una venta pendiente no se incluye ni se cancela de forma automática.
7. Solo existe un turno abierto por `(empresaId, cajeroId)` y su candado debe referenciarlo. El cierre no puede operar un turno ajeno, cerrado o sin candado coherente.
8. El saldo de la cuenta es un cache reconstruible desde el ledger. Una reconciliación detecta y reporta divergencias; no edita silenciosamente historia.
9. La misma dupla tenant-scoped `(commandId, idempotencyKey, huella)` devuelve el resultado inicial. Reutilizar cualquiera con otra huella se rechaza como conflicto, sin nuevo efecto.
10. No hay dual-write cliente/servidor, doble contador ni ruta alternativa de reconciliación.

## 8. Concurrencia, fallos y errores

Las Callables usan transacciones Admin SDK con lecturas antes de escrituras. Las cuentas de alto tráfico, el turno y los recibos participan en la misma transacción; Firestore reintenta contención interna y el servidor la limita. Agotado el límite se devuelve `ABORTED`/`REVISION_CONFLICT` sin commit.

| Categoría | Códigos orientativos | Acción cliente |
|---|---|---|
| Autorización/lifecycle | `AUTH_REQUIRED`, `TENANT_ACCESS_DENIED`, `ROLE_FORBIDDEN`, `EMPRESA_NO_OPERATIVA` | No reintentar igual. |
| Validación | `MONTO_INVALIDO`, `CUENTA_INVALIDA`, `MOTIVO_REQUERIDO`, `PAGO_INVALIDO` | Corregir y crear nueva intención. |
| Precondición | `TURNO_CERRADO`, `LOCK_CONFLICT`, `VENTA_NO_PENDIENTE`, `FONDOS_INSUFICIENTES`, `DEVOLUCION_EXCEDE_ORIGEN` | Recargar estado; no asumir éxito. |
| Idempotencia | `COMMAND_ID_CONFLICT`, `IDEMPOTENCY_CONFLICT` | No reintentar con otra carga; abrir incidencia. |
| Temporal/concurrencia | `UNAVAILABLE`, timeout, `ABORTED` | Reintentar exactamente el mismo envelope con backoff. |
| Capacidad | `OPERATION_TOO_LARGE` | Sin reintento; corregir el diseño/límite de la operación. |

Un fallo antes del commit no deja efectos. Tras un commit conocido o incierto, el recibo durable es la única evidencia que determina el resultado; nunca se emite una segunda operación “por si acaso”. La recuperación de ventas pendientes invoca el mismo ejecutor interno con su clave determinista.

## 9. Seguridad y responsabilidades

| Capa | Responsabilidad |
|---|---|
| Cliente | Capturar intención y conteo, conservar el envelope en reintentos, mostrar estado y errores. No calcula ni escribe efectos críticos; no persiste secretos, saldos autoritativos ni permisos. |
| Cloud Functions | Resolver tenant/actor/membresía/lifecycle, validar dominio, derivar fuentes de verdad, ejecutar transacción, idempotencia, auditoría, sanitización de logs y respuestas estables. |
| Firestore Rules | Defensa de tenant, lifecycle y lectura autorizada. Tras el corte completo, deniegan `create/update/delete` cliente para `turnos`, `turnos_activos`, `cuentas_bancarias`, `transacciones_financieras`, `egresos`, ventas y auditoría/recibos críticos según la matriz R1. No intentan implementar contabilidad ni atomicidad. |

El corte de Rules se hace solo cuando todos los escritores de una colección estén migrados a Callables y los clientes web, PWA y Electron sean compatibles. No se permite endurecimiento parcial que deje un escritor operativo directo roto, ni rollback hacia escritura directa después del corte sin break-glass aprobado y auditado.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble cobro, doble cierre o doble egreso por timeout/doble clic | Recibo e índice idempotente tenant-scoped, huella semántica y resultado estable. |
| Saldo negativo o carrera entre cajas | Validar fondos y actualizar saldo dentro de la misma transacción Admin SDK; reintento acotado ante contención. |
| Cierre inconsistente por cifras manipuladas | Recalcular ventas `COMPLETO` y egresos desde documentos canónicos; el cliente aporta solo el conteo físico. |
| Confundir base física con dinero contabilizado | Mantener la base como declaración del turno, sin crédito de ledger; contabilizar únicamente los flujos operativos y ajustes explícitos. |
| Anulación o devolución que destruya evidencia | Estados terminales, movimientos compensatorios y snapshot fiscal inmutable. |
| Fuga cross-tenant o sesión obsoleta | Tenant desde contexto autenticado, membresía y `Empresa.estado` canónicos releídos en servidor; Rules como defensa adicional. |
| Límite de 500/operaciones o documentos calientes | Plan de lecturas/escrituras por comando, máximo probado, `OPERATION_TOO_LARGE` sin fragmentar un hecho atómico. |
| Datos legacy/candados incoherentes | Preflight bloqueante antes del corte: cada turno abierto debe tener candado tenant/cajero/turno coincidente; no se adoptan ni reparan automáticamente. |
| Auditoría con secretos o PII innecesaria | Auditoría minimizada: IDs, huella, referencias, actor, resultado y motivo; excluir PIN, tokens, medios de pago sensibles y trazas. |

## 11. Criterios de aceptación del diseño

- [ ] Conserva `transacciones_financieras` como ledger financiero canónico y `cuentas_bancarias.saldo` como proyección, sin ledger paralelo.
- [ ] Cada variación de saldo tiene movimiento(s) con clave determinista por línea, recibo idempotente y auditoría en el mismo commit.
- [ ] Apertura sigue sin movimiento financiero para `baseApertura`; cierre la usa solo en el arqueo físico.
- [ ] Venta Fase 2 acredita tesorería y pasa a `COMPLETO` co-atómicamente; una venta pendiente o anulada no entra al cierre.
- [ ] Anulación post-efectos y devoluciones futuras son compensatorias, referenciadas e inmutables; la anulación pre-efectos no mueve dinero.
- [ ] El cierre reconstruye todos los flujos de `caja-principal` asociados al turno, valida el saldo final de depósito y diferencia, cierra el turno y gestiona relevo en una única transacción.
- [ ] Todos los documentos y consultas son tenant-aware por `empresaId`; no se toma del payload.
- [ ] No existe reapertura ni edición/borrado de movimientos, ventas fiscales, turnos cerrados o auditoría crítica.
- [ ] Rules finales son deny-by-default para escrituras cliente críticas y se activan únicamente tras el corte completo compatible.
- [ ] Los errores, límites y reintentos preservan exactamente una ejecución por intención.

## 12. Consideraciones para la implementación posterior

1. Implementar por comandos independientes y reversibles: primero el escritor server-authoritative de movimientos/egresos, después efectos de venta/anulación, y por último cierre con relevo y el corte de Rules. No activar Rules finales entre esos pasos.
2. Reutilizar el envelope, recibos, índice, identificador interno tenant-scoped, huella y auditoría ya materializados en R1-A; no crear un mecanismo paralelo.
3. Definir antes de cada Callable el máximo de documentos leídos/escritos y las consultas/indexes necesarios para ventas `COMPLETO`, egresos por turno y referencias de ledger.
4. Probar en Emulator: idempotencia, doble llamada concurrente, fondos insuficientes, pago mixto, anulación pre/post, cierre con sobrante/faltante, relevo, tenant ajeno, membresía revocada, Empresa suspendida y fallo inyectado antes del commit.
5. Realizar preflight de turnos/candados y de cuentas tenant-scoped antes de despliegue; cualquier inconsistencia bloquea el corte y requiere una iniciativa de remediación separada.
6. Mantener las devoluciones, conciliación bancaria, reportes contables y ajustes posteriores como fases con diseño propio. R1-B solo deja su contrato de compatibilidad; no los incorpora implícitamente.

## Referencias de autoridad

- `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`.
- `R1-A-DISENO-IMPLEMENTACION-TURNOS-SERVER-AUTHORITATIVE.md`.
- `ADR-SAAS-001-tenancy.md`, `ADR-SAAS-004-modelo-empresarial.md`, `ADR-SAAS-008-autoridad-numeracion-fiscal.md`, `ADR-SAAS-009-enforcement-ciclo-vida.md` y `ADR-SAAS-010-integracion-fiscal-inventario.md`.
- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, `MT-U3-helper-tenant-diseno.md`, `MT-U6-U8-B0-contratos-invariantes-dominio.md` y `MT-U6-U8-B1-configuracion-empresarial.md`.
- `FASE-15-PR1-inventario-ledger-diseno.md` e `IMP-4-validacion-fondos-diseno.md` como precedentes de inmutabilidad, compensación y validación atómica de saldos.
