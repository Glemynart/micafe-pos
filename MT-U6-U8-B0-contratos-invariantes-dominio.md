# MT-U6→U8 — B0: Contratos e invariantes del dominio

## 1. Estado y alcance

**Estado:** Especificación normativa aprobable para B0.

Este documento define los contratos que gobiernan la implementación del programa MT-U6→U8. Es subordinado a `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` y a los ADR-SAAS-002, 003, 004, 006, 007, 008 y 009. No reemplaza ni reabre sus decisiones.

Las palabras **DEBE**, **NO DEBE**, **PUEDE** y **SOLO** expresan obligatoriedad normativa.

Quedan fuera de B0:

- estructuras físicas definitivas de documentos e índices;
- APIs, Functions, reglas y componentes de UI;
- estrategia ejecutable de migración y backfill;
- proveedor de pagos, precios y medios de cobro;
- duración comercial concreta de trial, gracia o retención;
- diseño visual y persistencia del wizard de onboarding.

Esos aspectos podrán detallarse en B1–B7, pero sin alterar las autoridades, estados, transiciones e invariantes aquí definidos.

Los contratos describen el modelo objetivo después de su cutover. Toda entidad legacy que todavía no los cumpla es una entrada de migración pendiente, no una excepción válida al dominio.

## 2. Jerarquía normativa y mapa de autoridades

Ante una diferencia de interpretación se aplica este orden:

1. ADR aceptado aplicable a la decisión.
2. Documento maestro de arquitectura SaaS multiempresa.
3. Esta especificación B0.
4. Especificaciones de implementación B1–B7.

| Concepto | Fuente única de verdad | No constituye autoridad |
|---|---|---|
| Identidad técnica | Firebase Auth | Perfil, membresía o claims por separado |
| Perfil global | `usuarios/{uid}` | Datos duplicados en una empresa |
| Rol y pertenencia tenant | `membresias/{empresaId}_{uid}` | `ownerUid`, claims o suscripción |
| Tenant activo en sesión | Claims, como proyección temporal | Claims como estado canónico |
| Acceso y conservación empresarial | `Empresa.estado` | Estado de suscripción |
| Configuración editable | Configuración de la empresa | `configuracion/general` o snapshots históricos |
| Resolución y contador fiscal | Numeración | Configuración, asignación o venta |
| Selección fiscal vigente | Asignación de numeración | Preferencias de cliente o última numeración usada |
| Oferta comercial | Plan y su versión publicada | Suscripción individual |
| Relación comercial | Suscripción | Empresa, membresía o claims |
| Progreso de creación | Bootstrap/provisión | Empresa operativa o autorización |
| Evidencia fiscal histórica | Snapshot fiscal de la venta | Configuración o numeración vigente |

## 3. Convenciones transversales

### 3.1. Identificadores

1. Todo identificador de entidad DEBE ser estable, inmutable, opaco y no reutilizable.
2. Un identificador NO DEBE contener NIT, correo, slug, nombre comercial ni otro dato mutable o sensible.
3. Los identificadores que participen en claves compuestas DEBEN usar un alfabeto canónico que reserve el separador físico. La codificación física puede variar por bloque, pero DEBE ser inequívoca, reversible o verificable, y permanecer estable después del cutover.
4. `empresaId` identifica de forma permanente el límite tenant.
5. Configuración y Suscripción usan `empresaId` como clave lógica determinista por su cardinalidad uno a uno.
6. Numeración usa un `numeracionId` opaco dentro de la empresa; su identidad lógica es `(empresaId, numeracionId)`.
7. Asignación usa la clave lógica determinista `(empresaId, scopeCanonico, tipoDocumento)`.
8. Membresía conserva la clave determinista `(empresaId, uid)` definida por ADR-SAAS-002.
9. Una versión de plan se identifica por `(planId, planVersion)`.
10. Una solicitud de bootstrap se identifica por una clave de idempotencia estable del solicitante y un fingerprint canónico de sus entradas.
11. Los IDs de comandos y eventos DEBEN ser globalmente únicos para permitir deduplicación y trazabilidad.

### 3.2. Claves deterministas

Una clave determinista representa unicidad de dominio, no autorización. Su cálculo DEBE:

- normalizar cada componente antes de componerlo;
- distinguir explícitamente el scope empresa del scope espacio;
- impedir colisiones entre componentes;
- rechazar entradas ambiguas en lugar de elegir una interpretación;
- producir el mismo resultado en reintentos equivalentes.

El `scopeCanonico` de numeración solo admite:

- `EMPRESA`, para el fallback empresarial; o
- `ESPACIO:<espacioId>`, para una selección específica.

### 3.3. Versiones y revisiones

| Concepto | Regla |
|---|---|
| `schemaVersion` | Entero positivo que identifica la forma del contrato persistido. Cambia cuando un lector necesita distinguir esquemas. |
| `revision` | Entero positivo, monotónico por agregado mutable. Inicia en 1 y aumenta exactamente una vez por mutación confirmada. |
| `planVersion` | Entero positivo, monotónico por plan. Una versión publicada es inmutable. |
| Revisión referenciada | Un snapshot o relación histórica conserva la revisión o versión exacta que observó; nunca se reinterpreta con el estado actual. |

Un cambio meramente técnico que no altere el agregado NO DEBE incrementar su revisión. Una transición de estado, un cambio de política o una reasignación sí DEBE incrementarla.

### 3.4. Timestamps y fechas efectivas

1. Todo timestamp autoritativo DEBE provenir del servidor y representar un instante UTC.
2. La zona horaria empresarial sirve para reglas de presentación o calendario; NO reemplaza el instante UTC.
3. `creadaEn` es inmutable; `actualizadaEn` acompaña la última revisión confirmada.
4. Cada transición de estado DEBE conservar `ocurridaEn`, origen, actor y motivo cuando aplique.
5. Fechas de negocio —vigencia fiscal, fin de trial, periodo, gracia o cancelación efectiva— DEBEN almacenarse separadas de los timestamps técnicos.
6. Un reloj de cliente NO PUEDE habilitar vigencias, renovar periodos, consumir gracia ni asignar números.

### 3.5. Concurrencia, idempotencia y atomicidad

Todo comando mutante DEBE transportar, de forma conceptual:

- `commandId` y clave de idempotencia;
- actor y origen;
- empresa objetivo cuando aplique;
- `expectedRevision` para cada agregado existente que pretenda modificar;
- identificadores de correlación y causación;
- motivo obligatorio para transiciones sensibles.

Reglas:

1. Repetir un comando con la misma clave y el mismo fingerprint DEBE devolver el mismo resultado observable.
2. Reutilizar la clave con entradas diferentes DEBE rechazarse como conflicto.
3. Una revisión esperada obsoleta DEBE producir conflicto; no se admite last-write-wins en agregados empresariales, fiscales o comerciales.
4. Una mutación multiagregado DEBE confirmar todos sus efectos autoritativos o ninguno, salvo los pasos externos expresamente recuperables del Bootstrap y del lifecycle.
5. La asignación fiscal, incremento del contador, creación de la venta y creación de su snapshot forman una única frontera atómica.
6. Un fallo antes del commit NO consume número fiscal. Un fallo posterior al commit se recupera leyendo el resultado ya confirmado.
7. Los efectos externos se ejecutan después de un estado durable y DEBEN ser reintentables y reconciliables.

## 4. Contratos del dominio

### 4.1. Empresa

**Propósito.** Representar la entidad empresarial tenant y gobernar su acceso, conservación y ciclo de vida.

**Autoridad.** `Empresa.estado` es la única autoridad de lifecycle y acceso empresarial.

**Propietario.** La plataforma conserva el registro; el `ownerUid` es el titular contractual. La administración tenant exige además una membresía ADMIN activa.

**Dependencias.** Identidad global del owner, membresías, Configuración, Suscripción y al menos un espacio inicial para quedar operativa.

**Contenido conceptual mínimo.** Identidad empresarial estable, `ownerUid`, país fiscal, estado, metadatos de transición, revisión, timestamps y marca fundacional cuando corresponda.

**Invariantes.**

- Existe una sola Empresa por `empresaId`.
- `ownerUid` NO concede acceso por sí mismo ni sustituye una membresía.
- En estados interactivos debe existir una membresía activa ADMIN para el owner contractual.
- El país fiscal debe coincidir con la Configuración y con toda Numeración de la empresa.
- Después de la primera emisión fiscal, el país fiscal y la identidad legal emisora NO PUEDEN reinterpretarse retroactivamente. Un cambio que represente otra entidad legal exige una nueva empresa o el procedimiento fiscal que se defina para esa jurisdicción.
- Una transición de lifecycle solo puede realizarse mediante el servicio autoritativo definido por ADR-SAAS-009.
- `eliminada` no significa borrado físico inmediato; queda sujeto a retención, auditoría y obligaciones fiscales.

### 4.2. Configuración empresarial

**Propósito.** Reunir la configuración editable y vigente de una empresa.

**Autoridad.** Una Configuración identificada lógicamente por `empresaId`.

**Propietario.** La empresa; la editan owner/administradores autorizados y procesos de plataforma explícitos.

**Dependencias.** Empresa existente. Algunas secciones pueden referenciar espacios o capacidades del plan, sin trasladarles autoridad.

**Contenido conceptual.** Identidad fiscal y localización, moneda y políticas tributarias, ticket y marca, impresión por defecto, POS y módulos, medios de pago, KDS, caja, política operativa de autorización y preferencias generales.

**Invariantes.**

- Existe exactamente una Configuración por Empresa confirmada.
- Inicia en revisión 1 dentro del núcleo atómico de bootstrap o backfill certificado.
- No contiene resoluciones, prefijos, rangos, consecutivos ni selección de Numeración.
- No contiene estado de suscripción, membresías, roles ni claims.
- Los puertos, dispositivos y preferencias físicas locales NO son configuración empresarial.
- Toda actualización valida el documento completo resultante, aunque el comando modifique una sola sección.
- Los cambios solo afectan operaciones futuras; nunca alteran snapshots fiscales existentes.
- `configuracion/general` deja de ser autoridad al completar el cutover y NO puede recibir dual-write.

### 4.3. Numeración

**Propósito.** Gobernar una resolución o serie fiscal, su vigencia y su contador independiente.

**Autoridad.** La Numeración es autoridad exclusiva del rango, resolución, prefijo, vigencia, scope y último consecutivo asignado.

**Propietario.** La empresa. Solo backend transaccional consume el contador; administradores autorizados gestionan su ciclo de vida.

**Dependencias.** Empresa, país fiscal, tipo documental y scope válido; una Asignación para ser seleccionable.

**Contenido conceptual.** Identidad, empresa, país, tipo documental, scope, datos de resolución, prefijo, rango inicial/final, último asignado, vigencia, estado, revisión y metadatos de auditoría.

**Invariantes.**

- Cada Numeración pertenece a una sola empresa y a un solo scope.
- El rango es cerrado, válido y ordenado: `inicio <= fin`.
- Antes de la primera emisión, el último asignado representa conceptualmente `inicio - 1`.
- El último asignado es monotónico y nunca supera el final.
- Solo `HABILITADA` puede emitir.
- Cada emisión consume exactamente un número y cada número se usa como máximo una vez dentro de la serie.
- Después de la primera emisión son inmutables resolución, prefijo, rango inicial, rango final, tipo documental, país y scope; el contador nunca puede disminuir.
- Alcanzar el final determina `AGOTADA`; superar la vigencia determina `VENCIDA`. Ninguno de esos estados puede rehabilitarse.
- Pausar, revocar, vencer o agotar una Numeración no modifica ventas ya emitidas.
- Habilitar una Numeración NO la selecciona implícitamente.

### 4.4. Asignación de numeración

**Propósito.** Declarar qué Numeración se selecciona para un tipo documental y scope concretos.

**Autoridad.** La Asignación es la única autoridad de selección vigente.

**Propietario.** La empresa; gestionada por administradores autorizados, consumida por backend.

**Dependencias.** Empresa, scope, tipo documental y Numeración perteneciente a la misma empresa con coincidencia de país, tipo y scope compatible.

**Contenido conceptual.** Clave lógica determinista, referencia de Numeración, estado `VIGENTE` o `RETIRADA`, revisión y auditoría.

**Invariantes.**

- Existe como máximo una Asignación vigente por clave lógica.
- Una Asignación de espacio solo puede referir una Numeración de ese espacio.
- Una Asignación empresarial solo puede referir una Numeración de scope empresa.
- Estar asignada no vuelve válida una Numeración inválida, vencida o no habilitada.
- La selección sigue exactamente este orden: coincidencia espacio/tipo; luego empresa/tipo; si ninguna es válida, rechazo.
- El cliente NO puede enviar una Numeración autoritativa para saltarse la selección.
- Reemplazar o retirar una Asignación incrementa su revisión y conserva trazabilidad; no reescribe ventas históricas.

### 4.5. Plan

**Propósito.** Definir una oferta comercial reutilizable, sus capacidades, límites y políticas temporales.

**Autoridad.** La versión publicada del Plan es la autoridad de la oferta.

**Propietario.** La plataforma SaaS.

**Dependencias.** Catálogo de capacidades soportadas por el producto. No depende de una empresa concreta.

**Contenido conceptual.** `planId`, código estable, versión, estado, capacidades, límites, política de trial, periodicidad, reglas comerciales y timestamps.

**Invariantes.**

- El código lógico de plan es único y no se reutiliza.
- Una versión publicada es inmutable; cualquier cambio crea una versión superior.
- Retirar una versión impide nuevas adhesiones, pero no invalida suscripciones grandfathered.
- Capacidades desconocidas se rechazan; límites deben tener unidad y semántica explícitas.
- Precio y pago pueden permanecer fuera del alcance inicial, pero no alteran la identidad/versionado del Plan.
- Una Suscripción conserva la versión exacta o un snapshot comercial equivalente suficiente para no reinterpretar el pasado.

### 4.6. Suscripción

**Propósito.** Representar la relación comercial vigente entre una Empresa y una versión de Plan.

**Autoridad.** La Suscripción gobierna elegibilidad comercial, periodos, trial, gracia, renovación y cancelación; NO gobierna acceso por sí sola.

**Propietario.** La plataforma SaaS; los procesos administrativos o de sistema ejecutan sus transiciones.

**Dependencias.** Empresa y versión de Plan válida.

**Contenido conceptual.** Empresa, referencia/snapshot de Plan, estado, inicio/fin de trial, periodo vigente, gracia, cancelación programada y efectiva, revisión y auditoría.

**Invariantes.**

- Existe exactamente una Suscripción canónica por Empresa confirmada.
- Una Empresa recibe como máximo un trial inicial salvo una política excepcional de plataforma auditada; una reactivación no crea otro trial.
- Las fechas cumplen: inicio < fin para trial y periodo; la gracia no termina antes del vencimiento que la origina.
- Los periodos confirmados no se solapan.
- `past_due` conserva elegibilidad solo hasta el fin de gracia.
- `suspended` y `canceled` no tienen readiness comercial.
- La Suscripción puede solicitar una transición de Empresa, pero nunca escribir ni sustituir directamente su estado.
- Reactivar una Suscripción NO reactiva automáticamente una Empresa suspendida por seguridad o plataforma.
- La empresa fundacional conserva una Suscripción/Plan explícitos; no se permiten excepciones implícitas.

### 4.7. Bootstrap empresarial

**Propósito.** Crear y dejar recuperable el núcleo coherente de una nueva Empresa.

**Autoridad.** El registro de Bootstrap es autoridad exclusiva del progreso de provisión, no de acceso ni de lifecycle.

**Propietario.** La plataforma/backend. El solicitante es una identidad Auth existente que será owner contractual.

**Dependencias.** Identidad Auth del owner, Plan inicial publicable/aplicable y políticas iniciales de configuración, espacio, numeración y trial.

**Núcleo atómico.** Empresa en `trial`, Configuración revisión 1, espacio inicial activo, Numeración inicial opcional en `BORRADOR`, membresía owner ADMIN activa y Suscripción `trialing`.

**Invariantes.**

- La clave de idempotencia más el fingerprint identifica una sola intención de creación.
- El mismo reintento nunca crea una segunda empresa ni duplica recursos del núcleo.
- `NUEVA` describe el proceso previo, no es un estado de Empresa.
- El núcleo se confirma completo o no se confirma.
- La emisión de claims ocurre después del commit y puede reintentarse.
- Después de `CORE_COMMITTED` no hay rollback destructivo; la recuperación continúa hacia adelante.
- `COMPLETED` significa que el owner puede resolver el tenant y entrar según lifecycle, no que exista readiness fiscal.
- El registro de Bootstrap nunca concede permisos y no sustituye Empresa, Suscripción o Membresía.

### 4.8. Snapshot fiscal

**Propósito.** Conservar la evidencia fiscal inmutable usada para emitir una venta y reproducirla históricamente.

**Autoridad.** El Snapshot fiscal embebido en la venta es la única autoridad histórica de esa emisión.

**Propietario.** La venta emitida; no tiene ciclo de vida independiente.

**Dependencias.** Configuración vigente, Numeración seleccionada, Asignación resuelta, líneas e impuestos de la venta y timestamp servidor de emisión.

**Contenido conceptual mínimo.** Versión de esquema, revisión de Configuración, identidad legal, país y moneda, régimen/etiquetas fiscales, impuestos por línea, identidad/revisión/scope/tipo de Numeración, número final, prefijo, resolución, rango, vigencia y fecha de emisión.

**Invariantes.**

- Toda venta fiscal confirmada tiene exactamente un Snapshot fiscal completo.
- Snapshot, número y venta se crean en la misma transacción.
- El Snapshot es inmutable; corrección, anulación o nota genera su propio documento fiscal sin alterar el original.
- Reimpresión, exportación y auditoría leen el Snapshot, no la configuración vigente.
- Sus referencias deben pertenecer a la misma empresa y corresponder a las revisiones observadas en la emisión.
- Un cambio posterior de Configuración, Asignación o Numeración no cambia su interpretación.

## 5. Máquinas de estados

### 5.1. Empresa

Estados válidos: `trial`, `activa`, `suspendida`, `cancelada`, `archivada`, `eliminada`.

| Desde | Hacia permitido | Condición esencial |
|---|---|---|
| creación | `trial` | Solo mediante Bootstrap o backfill certificado. |
| `trial` | `activa` | Elegibilidad comercial y activación explícita. |
| `trial` | `suspendida` | Fin de trial, incumplimiento, seguridad o plataforma. |
| `trial` | `cancelada` | Cancelación explícita. |
| `activa` | `suspendida` | Motivo comercial, seguridad o plataforma. |
| `activa` | `cancelada` | Cancelación explícita o efectiva. |
| `suspendida` | `activa` | Reactivación explícita; causa original resuelta. |
| `suspendida` | `cancelada` | Cancelación explícita o fin de gracia. |
| `cancelada` | `activa` | Reactivación explícita dentro de política de gracia y con readiness comercial restaurada. |
| `cancelada` | `archivada` | Fin de ventana de reactivación y conservación confirmada. |
| `archivada` | `cancelada` | Restauración excepcional de plataforma, auditada, previa a cualquier reactivación. |
| `archivada` | `eliminada` | Retención y obligaciones legales satisfechas. |

Toda transición no listada está prohibida. En particular: `trial→archivada`, `activa→archivada`, cualquier transición desde `eliminada` y la reactivación automática causada solo por cambiar Suscripción.

### 5.2. Numeración

Estados válidos: `BORRADOR`, `HABILITADA`, `PAUSADA`, `AGOTADA`, `VENCIDA`, `REVOCADA`.

| Desde | Hacia permitido |
|---|---|
| creación | `BORRADOR` |
| `BORRADOR` | `HABILITADA`, `REVOCADA` |
| `HABILITADA` | `PAUSADA`, `AGOTADA`, `VENCIDA`, `REVOCADA` |
| `PAUSADA` | `HABILITADA`, `AGOTADA`, `VENCIDA`, `REVOCADA` |

`AGOTADA`, `VENCIDA` y `REVOCADA` son terminales. Está prohibido emitir fuera de `HABILITADA`, volver a `BORRADOR` y rehabilitar un estado terminal.

### 5.3. Asignación de numeración

Estados válidos: `VIGENTE`, `RETIRADA`.

| Desde | Hacia permitido | Semántica |
|---|---|---|
| creación | `VIGENTE` | Establece selección. |
| `VIGENTE` | `VIGENTE` | Reemplaza la Numeración y aumenta revisión. |
| `VIGENTE` | `RETIRADA` | Elimina la selección sin borrar trazabilidad. |
| `RETIRADA` | `VIGENTE` | Establece nuevamente una selección y aumenta revisión. |

Una escritura que no cambie estado ni referencia es idempotente y NO crea una revisión adicional.

### 5.4. Plan/versiones

Estados válidos por versión: `BORRADOR`, `PUBLICADA`, `RETIRADA`.

| Desde | Hacia permitido |
|---|---|
| creación | `BORRADOR` |
| `BORRADOR` | `PUBLICADA` |
| `PUBLICADA` | `RETIRADA` |

Una versión `PUBLICADA` no vuelve a borrador y nunca se edita. Una versión `RETIRADA` no se republica; se crea una versión superior.

### 5.5. Suscripción

Estados válidos: `trialing`, `active`, `past_due`, `suspended`, `canceled`.

| Desde | Hacia permitido | Condición esencial |
|---|---|---|
| creación | `trialing` | Bootstrap inicial con trial. |
| creación | `active` | Alta administrativa sin trial, explícita y auditada. |
| `trialing` | `active` | Activación comercial. |
| `trialing` | `suspended`, `canceled` | Expiración/política o cancelación. |
| `active` | `past_due`, `suspended`, `canceled` | Mora, suspensión o cancelación. |
| `past_due` | `active`, `suspended`, `canceled` | Regularización o fin de gracia. |
| `suspended` | `active`, `canceled` | Rehabilitación comercial o cancelación. |
| `canceled` | `active` | Reactivación explícita dentro de política; nunca crea otro trial. |

Renovar o cambiar plan puede conservar `active` y crear una nueva revisión. Están prohibidos el retorno a `trialing`, periodos solapados y la activación contra una versión de Plan no admisible.

### 5.6. Bootstrap

Estados válidos: `REQUESTED`, `CORE_COMMITTED`, `CLAIMS_ISSUED`, `COMPLETED`, `RETRYABLE_FAILURE`, `REJECTED`.

El registro DEBE conservar `ultimoPasoConfirmado` cuando entra en `RETRYABLE_FAILURE`.

| Desde | Hacia permitido |
|---|---|
| creación | `REQUESTED` |
| `REQUESTED` | `CORE_COMMITTED`, `RETRYABLE_FAILURE`, `REJECTED` |
| `CORE_COMMITTED` | `CLAIMS_ISSUED`, `RETRYABLE_FAILURE` |
| `CLAIMS_ISSUED` | `COMPLETED`, `RETRYABLE_FAILURE` |
| `RETRYABLE_FAILURE` | `REQUESTED`, `CORE_COMMITTED`, `CLAIMS_ISSUED`, `COMPLETED` según `ultimoPasoConfirmado` |

`COMPLETED` y `REJECTED` son terminales. `REJECTED` solo es válido antes del commit del núcleo. Después de `CORE_COMMITTED` están prohibidos rechazo, cancelación destructiva y creación de otro núcleo.

### 5.7. Estados heredados que B0 no redefine

- Incorporación conserva `INVITED`, `TEMP_CREDENTIAL`, `ACTIVE`, `CANCELLED`, `EXPIRED` y sus transiciones según ADR-SAAS-006.
- Membresía conserva su estado canónico independiente; `DISABLED` no es un estado de incorporación.
- Identidad y claims conservan los contratos de ADR-SAAS-002 y ADR-SAAS-006.

## 6. Catálogo normativo de comandos

Los nombres expresan intención de dominio, no nombres de endpoints. Cada comando se valida contra autoridad, actor, revisión, idempotencia, lifecycle y gates aplicables.

### 6.1. Empresa y lifecycle

| Comando | Actor conceptual | Resultado permitido |
|---|---|---|
| `ActualizarDatosEmpresa` | Owner/admin autorizado | Cambia datos editables, no autoridad fiscal histórica. |
| `TransferirPropiedadEmpresa` | Owner actual + política de plataforma | Cambia `ownerUid` y garantiza membresía ADMIN activa del nuevo owner. |
| `ActivarEmpresa` | Plataforma/lifecycle | `trial`, `suspendida` o `cancelada` hacia `activa` si se cumplen condiciones. |
| `SuspenderEmpresa` | Plataforma, seguridad o lifecycle comercial | Lleva `trial/activa` a `suspendida` con origen y motivo. |
| `CancelarEmpresa` | Owner autorizado o plataforma | Lleva estado admisible a `cancelada`. |
| `ReactivarEmpresa` | Plataforma/lifecycle | Reactivación explícita, nunca efecto colateral de Suscripción. |
| `ArchivarEmpresa` | Plataforma | Conservación no interactiva después de cancelación. |
| `RestaurarEmpresaArchivada` | Plataforma | Retorna excepcionalmente a `cancelada`. |
| `EliminarEmpresa` | Plataforma | Marca `eliminada` tras cumplir retención y obligaciones. |

### 6.2. Configuración

| Comando | Resultado permitido |
|---|---|
| `InicializarConfiguracionEmpresa` | Crea revisión 1 solo dentro de Bootstrap o backfill. |
| `ActualizarConfiguracionEmpresa` | Actualiza una o más secciones y valida el contrato completo. |
| `ActualizarParametrosFiscales` | Cambia datos fiscales futuros si las restricciones históricas lo permiten. |
| `ActualizarPreferenciasImpresion` | Cambia defaults empresariales, nunca puertos/dispositivos locales. |
| `ActualizarPoliticasOperativas` | Cambia módulos, caja, KDS, medios de pago o autorización dentro del Plan. |

### 6.3. Numeración y emisión

| Comando | Resultado permitido |
|---|---|
| `CrearNumeracion` | Crea una Numeración en `BORRADOR`. |
| `ActualizarNumeracionBorrador` | Modifica datos permitidos antes de emisión. |
| `HabilitarNumeracion` | Valida integridad, vigencia y rango; pasa a `HABILITADA`. |
| `PausarNumeracion` | Detiene emisión sin volver terminal la serie. |
| `ReanudarNumeracion` | Regresa de `PAUSADA` a `HABILITADA` si sigue válida. |
| `RevocarNumeracion` | La vuelve terminal con motivo. |
| `MarcarNumeracionVencida` | Transición temporal autoritativa a `VENCIDA`. |
| `MarcarNumeracionAgotada` | Transición autoritativa al consumir el final. |
| `EstablecerAsignacionNumeracion` | Crea o reactiva la selección determinista. |
| `ReemplazarAsignacionNumeracion` | Cambia la referencia vigente con control de revisión. |
| `RetirarAsignacionNumeracion` | Deja la clave sin selección vigente, sin borrarla. |
| `ConfirmarVentaFiscal` | Resuelve asignación, consume número y crea venta con Snapshot atómicamente. |

No existe un comando independiente para “incrementar consecutivo” ni para “crear snapshot fiscal”. Ambos son efectos inseparables de `ConfirmarVentaFiscal`.

### 6.4. Plan y Suscripción

| Comando | Resultado permitido |
|---|---|
| `CrearPlan` | Crea la primera versión en `BORRADOR`. |
| `CrearVersionPlan` | Crea una versión superior en `BORRADOR`. |
| `ActualizarVersionPlanBorrador` | Modifica solo un borrador. |
| `PublicarVersionPlan` | Inmoviliza la versión y la habilita comercialmente. |
| `RetirarVersionPlan` | Impide nuevas adhesiones, conserva grandfathering. |
| `CrearSuscripcionTrial` | Crea la Suscripción inicial `trialing` dentro de Bootstrap. |
| `CrearSuscripcionActiva` | Alta administrativa explícita sin trial. |
| `ActivarSuscripcion` | Pasa a `active` y fija periodo. |
| `RenovarSuscripcion` | Crea el siguiente periodo no solapado. |
| `CambiarPlanSuscripcion` | Aplica una versión publicada según fecha efectiva. |
| `MarcarSuscripcionEnMora` | Pasa a `past_due` y fija gracia. |
| `SuspenderSuscripcion` | Pasa a `suspended`; puede solicitar suspensión empresarial. |
| `ProgramarCancelacionSuscripcion` | Registra cancelación al final del periodo. |
| `RevocarCancelacionProgramada` | Retira una programación aún no efectiva. |
| `CancelarSuscripcion` | Pasa a `canceled` con fecha efectiva. |
| `ReactivarSuscripcion` | Regresa a `active` bajo política, sin reactivar Empresa automáticamente. |
| `ProcesarVencimientosComerciales` | Evalúa trial, periodo y gracia con reloj servidor e idempotencia. |

### 6.5. Bootstrap

| Comando | Resultado permitido |
|---|---|
| `IniciarBootstrapEmpresarial` | Registra intención y confirma una sola vez el núcleo atómico. |
| `ContinuarBootstrapEmpresarial` | Ejecuta el siguiente paso pendiente sin repetir los confirmados. |
| `ReintentarBootstrapEmpresarial` | Retoma desde `ultimoPasoConfirmado`. |
| `ReconciliarBootstrapEmpresarial` | Verifica núcleo, claims y resultado, y corrige solo efectos faltantes permitidos. |

No existe `CrearEmpresa` como vía paralela: la creación ordinaria ocurre exclusivamente mediante Bootstrap. El backfill es un proceso de migración certificado, no un comando funcional.

### 6.6. Onboarding y wizard

El wizard NO introduce comandos autoritativos nuevos. Orquesta `ActualizarConfiguracionEmpresa`, los comandos de Numeración/Asignación y las demás intenciones ya definidas, y presenta el resultado de los gates. Su progreso de UX PUEDE persistirse como proyección recuperable, pero `CompletarOnboarding` no puede sustituir Bootstrap, cambiar lifecycle ni declarar readiness por sí mismo.

## 7. Eventos de dominio

Un evento expresa un hecho ya confirmado. NO es un comando, no concede permisos y no implica que el sistema use event sourcing. El estado canónico continúa en los agregados definidos.

Todo evento DEBE incluir `eventId`, tipo y versión, agregado e identidad/revisión resultante, empresa cuando aplique, instante servidor, actor/origen, correlación, causación y payload mínimo sin secretos. Debe persistirse atómicamente con el cambio o derivarse inequívocamente de un cambio ya confirmado; nunca se anuncia antes del commit.

### 7.1. Empresa y Bootstrap

| Evento | Significado arquitectónico |
|---|---|
| `BootstrapSolicitado` | Existe una intención idempotente válida. |
| `EmpresaCreada` | El núcleo atómico quedó confirmado; no significa Bootstrap completo. |
| `ClaimsOwnerEmitidos` | La proyección temporal inicial fue emitida después del núcleo. |
| `BootstrapCompletado` | Núcleo y efectos externos requeridos están reconciliados. |
| `BootstrapReintentoRequerido` | Existe un fallo recuperable y un último paso durable. |
| `BootstrapRechazado` | La intención fue rechazada antes de confirmar el núcleo. |
| `DatosEmpresaActualizados` | Una nueva revisión de datos empresariales editables quedó vigente. |
| `PropiedadEmpresaTransferida` | Cambiaron el owner contractual y las garantías asociadas de membresía. |
| `EmpresaActivada` | Empresa pasó a `activa`. |
| `EmpresaSuspendida` | Se bloqueó escritura operativa según ADR-SAAS-009. |
| `EmpresaCancelada` | Cesó acceso interactivo ordinario. |
| `EmpresaReactivada` | Una decisión explícita restauró `activa`. |
| `EmpresaArchivada` | La empresa entró en conservación no interactiva. |
| `EmpresaRestaurada` | Plataforma retornó una archivada a `cancelada`. |
| `EmpresaEliminada` | Se alcanzó el estado final sujeto a la política de eliminación. |

### 7.2. Configuración y fiscalidad

| Evento | Significado arquitectónico |
|---|---|
| `ConfiguracionEmpresaInicializada` | Existe la revisión 1 canónica. |
| `ConfiguracionEmpresaActualizada` | Una nueva revisión editable quedó vigente. |
| `NumeracionCreada` | Existe una nueva serie en borrador. |
| `NumeracionHabilitada` | La serie puede emitir si además es seleccionada. |
| `NumeracionPausada` | La serie dejó temporalmente de emitir. |
| `NumeracionReanudada` | Una serie pausada volvió a habilitarse. |
| `NumeracionAgotada` | Se asignó el último número disponible. |
| `NumeracionVencida` | La vigencia terminó y la serie quedó terminal. |
| `NumeracionRevocada` | Una decisión explícita volvió terminal la serie. |
| `AsignacionNumeracionEstablecida` | Una clave fiscal obtuvo selección vigente. |
| `AsignacionNumeracionReemplazada` | La clave pasó a otra Numeración. |
| `AsignacionNumeracionRetirada` | La clave quedó sin selección vigente. |
| `VentaFiscalConfirmada` | Venta, número y Snapshot quedaron confirmados atómicamente. |

### 7.3. Plan y Suscripción

| Evento | Significado arquitectónico |
|---|---|
| `PlanCreado` | Existe una nueva identidad lógica de Plan con su primer borrador. |
| `VersionPlanCreada` | Existe un nuevo borrador superior todavía no ofertable. |
| `VersionPlanPublicada` | La oferta quedó disponible e inmutable. |
| `VersionPlanRetirada` | No admite nuevas adhesiones; las existentes conservan referencia. |
| `SuscripcionCreada` | Existe la relación comercial única de la Empresa. |
| `TrialIniciado` | Comenzó el único trial inicial con fechas definidas. |
| `SuscripcionActivada` | Existe elegibilidad `active` y periodo vigente. |
| `SuscripcionRenovada` | Se confirmó un nuevo periodo no solapado. |
| `PlanSuscripcionCambiado` | La relación adoptó otra versión desde una fecha efectiva. |
| `SuscripcionEnMora` | Comenzó `past_due` y su gracia. |
| `SuscripcionSuspendida` | Cesó readiness comercial; no implica por sí solo transición empresarial confirmada. |
| `CancelacionSuscripcionProgramada` | Existe una cancelación futura aún revocable. |
| `CancelacionProgramadaRevocada` | Se retiró esa intención futura. |
| `SuscripcionCancelada` | La cancelación se hizo efectiva. |
| `SuscripcionReactivada` | La relación volvió explícitamente a `active`. |

### 7.4. Eventos derivados de readiness

`ReadinessFiscalAlcanzada`, `ReadinessFiscalPerdida`, `ReadinessOperativaAlcanzada`, `ReadinessOperativaPerdida`, `ReadinessComercialAlcanzada` y `ReadinessComercialPerdida` PUEDEN existir como eventos de proyección. Nunca son autoridad: su significado es que la evaluación derivada cambió con respecto a la evaluación anterior.

## 8. Invariantes globales

Los identificadores siguientes son estables y deben usarse como trazabilidad en B1–B7 y en sus pruebas.

### 8.1. Autoridad e identidad

- **AUTH-01.** Ninguna proyección, caché o claim sustituye una autoridad canónica.
- **AUTH-02.** Una membresía nunca sustituye la identidad técnica ni el perfil global.
- **AUTH-03.** `ownerUid` nunca sustituye una membresía ADMIN activa.
- **AUTH-04.** Una Suscripción nunca autoriza directamente acceso empresarial.
- **AUTH-05.** Todo dato tenant autoritativo lleva y valida `empresaId`; un espacio no reemplaza ese límite.
- **AUTH-06.** Backend y reglas aplican el mismo lifecycle; la seguridad no depende de refrescar claims.

### 8.2. Núcleo empresarial

- **EMP-01.** Una Empresa confirmada nunca existe sin Configuración, Suscripción, espacio inicial y membresía owner ADMIN creados en su núcleo.
- **EMP-02.** Solo `Empresa.estado` gobierna acceso y conservación.
- **EMP-03.** Toda transición empresarial conserva origen, actor, motivo, tiempo y revisión.
- **EMP-04.** `suspendida` permite a owner/admin solo lectura administrativa; prohíbe escrituras operativas.
- **EMP-05.** `cancelada` no permite acceso interactivo ordinario; la exportación se ejecuta por backend autorizado.
- **EMP-06.** `archivada` solo es accesible a plataforma/soporte autorizado.
- **EMP-07.** Ningún estado terminal implica borrado que contradiga retención legal o fiscal.

### 8.3. Configuración

- **CFG-01.** Hay exactamente una Configuración canónica por Empresa.
- **CFG-02.** Configuración no contiene numeración, selección, membresía, claims ni suscripción.
- **CFG-03.** Cada mutación válida aumenta exactamente una revisión.
- **CFG-04.** La configuración local de dispositivo nunca se sincroniza como autoridad empresarial.
- **CFG-05.** Una revisión nueva nunca reescribe evidencia histórica.

### 8.4. Fiscalidad

- **FIS-01.** Cada Numeración tiene contador independiente, monotónico y transaccional.
- **FIS-02.** Solo una Numeración `HABILITADA`, vigente, con rango disponible y Asignación válida puede emitir.
- **FIS-03.** La resolución se selecciona en backend por orden exacto espacio/tipo y empresa/tipo.
- **FIS-04.** Un número fiscal se consume una sola vez y solo junto con una venta confirmada.
- **FIS-05.** Una venta fiscal nunca existe sin Snapshot fiscal completo.
- **FIS-06.** Un Snapshot fiscal nunca se modifica.
- **FIS-07.** Una Numeración agotada, vencida o revocada nunca vuelve a emitir.
- **FIS-08.** Después de la primera emisión no cambian identidad, scope, resolución, prefijo ni rango de la serie.
- **FIS-09.** No existe dual-write entre el contador legado y el nuevo.
- **FIS-10.** Reimpresión y auditoría nunca reconstruyen el pasado desde autoridades vigentes.

### 8.5. Comercial

- **COM-01.** Hay exactamente una Suscripción canónica por Empresa.
- **COM-02.** Toda Suscripción referencia una versión de Plan inmutable o snapshot equivalente.
- **COM-03.** Una Empresa recibe como máximo un trial ordinario.
- **COM-04.** Periodos y trials tienen límites temporales válidos y no se solapan.
- **COM-05.** `past_due` deja de ser comercialmente ready al finalizar la gracia.
- **COM-06.** Reactivar Suscripción nunca reactiva Empresa automáticamente.
- **COM-07.** Retirar un Plan no altera suscripciones grandfathered.

### 8.6. Bootstrap y recuperación

- **BST-01.** Bootstrap es idempotente por intención y rechaza claves reutilizadas con otro fingerprint.
- **BST-02.** El núcleo empresarial se confirma completo o no existe.
- **BST-03.** Ningún reintento duplica Empresa ni recursos uno a uno.
- **BST-04.** Los claims solo se emiten después del núcleo.
- **BST-05.** Después del commit la recuperación avanza; no borra el núcleo como compensación.
- **BST-06.** Bootstrap completo no equivale a readiness fiscal.

### 8.7. Concurrencia, tiempo y trazabilidad

- **CON-01.** Toda mutación crítica es idempotente y verifica revisión esperada.
- **CON-02.** Un conflicto nunca se resuelve silenciosamente con last-write-wins.
- **CON-03.** Solo el reloj servidor decide vigencia y vencimiento.
- **CON-04.** Un evento nunca precede al hecho que representa.
- **CON-05.** IDs, revisiones, correlación y causación permiten reconstruir quién ordenó y qué transición ocurrió.
- **CON-06.** Los efectos externos fallidos son reintentables sin repetir el commit autoritativo.

## 9. Gates de readiness

Los gates son funciones derivadas sobre autoridades vigentes. NO son nuevos estados canónicos. Pueden cachearse como proyección descartable, pero toda operación sensible debe reevaluarlos en backend.

### 9.1. Readiness comercial

Es verdadera cuando:

- existe una Suscripción válida para la Empresa;
- referencia una versión de Plan aplicable;
- está en `trialing` antes de `trialEnd`, `active` dentro de su periodo, o `past_due` antes o en `graceEnd`;
- sus fechas son coherentes y no existe cancelación efectiva.

Es falsa para `suspended`, `canceled`, trial vencido, periodo sin gracia vigente o contrato temporal inconsistente.

### 9.2. Readiness operativa

Es verdadera para escritura operativa cuando:

- Bootstrap está `COMPLETED` o la Empresa proviene de backfill certificado equivalente;
- Empresa está en `trial` o `activa`;
- existe Configuración válida y legible;
- existen espacio activo y membresía activa del actor;
- el actor tiene permisos para la capacidad solicitada;
- el módulo/capacidad está habilitado por Configuración y Plan;
- readiness comercial es verdadera.

La lectura administrativa de una Empresa `suspendida` es una excepción de acceso definida por ADR-SAAS-009; NO significa readiness operativa.

### 9.3. Readiness fiscal

Se evalúa por `(empresaId, espacioId, tipoDocumento)` y es verdadera cuando:

- la identidad y parámetros fiscales obligatorios de Configuración están completos y son coherentes con el país;
- el backend resuelve una Asignación vigente por el orden normativo;
- la Numeración referida pertenece a la Empresa, coincide en país/tipo/scope, está `HABILITADA`, dentro de vigencia y conserva un siguiente número dentro del rango;
- las líneas e impuestos de la operación pueden producir el Snapshot fiscal soportado.

Readiness fiscal no implica permiso de emisión. Para confirmar una venta fiscal deben cumplirse simultáneamente readiness fiscal, operativa y comercial, lifecycle escribible y autorización del actor.

### 9.4. Matriz de capacidades

| Capacidad | Condiciones mínimas |
|---|---|
| Entrar a administración | Empresa accesible por lifecycle + membresía activa + tenant resuelto. |
| Leer administración suspendida | Empresa `suspendida` + owner/admin activo; solo lectura. |
| Ejecutar escritura operativa | Readiness operativa + lifecycle escribible. |
| Emitir venta fiscal | Readiness operativa + comercial + fiscal + permiso específico. |
| Gestionar configuración/numeración | Empresa `trial/activa` + admin autorizado + revisión esperada. |
| Incorporar usuarios | Empresa `trial/activa` + readiness comercial + admin autorizado; ADR-SAAS-006. |
| Exportar empresa cancelada | Flujo backend autorizado; nunca acceso interactivo ordinario. |

## 10. Fronteras de responsabilidad

| Componente | Sí decide | Nunca decide |
|---|---|---|
| Empresa | Lifecycle, acceso y conservación | Precio, rol, número fiscal |
| Configuración | Preferencias y parámetros editables | Consecutivo, resolución, lifecycle |
| Numeración | Serie, vigencia y contador | Qué usuario puede operar, plan |
| Asignación | Selección fiscal actual | Validez intrínseca de la serie |
| Plan | Oferta, capacidades y límites | Acceso de una empresa concreta |
| Suscripción | Elegibilidad y periodos comerciales | Autorización directa |
| Bootstrap | Progreso de creación | Permisos o readiness fiscal |
| Membresía | Rol, permisos y pertenencia tenant | Identidad técnica o lifecycle |
| Usuario | Perfil global | Rol tenant |
| Claims | Contexto temporal de sesión | Estado canónico |
| Snapshot fiscal | Evidencia histórica | Configuración vigente |

## 11. Cobertura de B1–B7

| Bloque | Decisiones cerradas por B0 | Detalle que puede definir sin reabrir arquitectura |
|---|---|---|
| B1 — Configuración | Autoridad, cardinalidad, secciones, revisión, comandos, eventos e invariantes CFG | Esquema físico, validadores, permisos concretos, backfill y UX. |
| B2 — Numeración | Agregados, selección, estados, atomicidad, Snapshot y gates fiscales | Índices, fronteras transaccionales concretas, formato por país y certificación. |
| B3 — Suscripción/lifecycle | Plan versionado, Suscripción única, máquinas y coordinación no autoritativa | Políticas comerciales configurables, tareas temporales y consola administrativa. |
| B4 — Enforcement | Autoridad de Empresa, matriz de acceso, gates derivados y claims temporales | Matriz exhaustiva por recurso, reglas y middleware. |
| B5 — Bootstrap | Núcleo atómico, estados, idempotencia, recuperación y eventos | Orquestación física, almacenamiento de provisión y observabilidad. |
| B6 — Onboarding | Resultado de Bootstrap, capacidades habilitables y fronteras con incorporación | Pasos del wizard, progreso UX y contenido de ayuda. |
| B7 — Cutover/certificación | Invariantes de unicidad, no dual-write, backfill equivalente y trazabilidad | Plan de despliegue, lotes, métricas, rollback compatible y evidencias de certificación. |

Los siguientes son parámetros de producto, no decisiones arquitectónicas pendientes: duración de trial y gracia, catálogo y límites concretos de planes, valores por defecto, formatos visuales, textos del wizard y ventanas operativas de migración. Deben configurarse o especificarse en el bloque correspondiente respetando estos contratos.

## 12. Criterio de cierre de B0

B0 se considera suficiente cuando B1–B7 pueden escoger estructuras físicas, APIs, validadores, reglas, procesos y UI sin decidir nuevamente:

- quién es autoridad de cada dato;
- cuál es la cardinalidad e identidad de cada agregado;
- qué estados y transiciones existen;
- cómo se controlan idempotencia, revisión, tiempo y concurrencia;
- qué comandos pueden cambiar el dominio;
- qué hechos se publican como eventos;
- qué reglas son inviolables;
- qué gates habilitan operación, comercio y emisión fiscal.

Toda necesidad posterior que contradiga una de esas decisiones requiere revisar formalmente la arquitectura o el ADR aplicable; no puede resolverse como detalle local de implementación.

## 13. Referencias normativas

- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
- `ADR-SAAS-002-identidad.md`
- `ADR-SAAS-003-suscripciones-ciclo-vida.md`
- `ADR-SAAS-004-modelo-empresarial.md`
- `ADR-SAAS-006-incorporacion-usuarios.md`
- `ADR-SAAS-007-bootstrap-empresarial.md`
- `ADR-SAAS-008-autoridad-numeracion-fiscal.md`
- `ADR-SAAS-009-enforcement-ciclo-vida.md`
