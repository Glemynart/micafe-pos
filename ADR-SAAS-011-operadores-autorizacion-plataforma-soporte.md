# ADR-SAAS-011 — Operadores SaaS, autorización de plataforma y frontera de soporte

## Estado

**Aceptado.** Complementa MT-U9 y materializa, sin sustituirlas, las
autoridades de plataforma reservadas en el Documento Maestro y especificadas en
U9-B0 a U9-B5.

Este ADR no modifica los ADR-SAAS-001 a ADR-SAAS-010, el lifecycle de Empresa, el
bootstrap empresarial, el tenant activo, Empresa, Suscripción, Membresía ni el
modelo fiscal u operativo. El modelo físico, append-only, índices de auditoría,
retención y no repudio de `saas_auditoria` pertenecen exclusivamente a
ADR-SAAS-012.

## 1. Decisión

Se adopta `saas_operadores/{uid}` como el agregado físico, global y canónico que
decide la pertenencia de un principal al plano de plataforma y las facultades de
plataforma que puede ejercer. La decisión de autorización se toma en backend contra
ese documento canónico en cada operación protegida. Firebase Auth autentica al
principal y los custom claims solo proyectan un contexto de plataforma recuperable;
ni Auth ni claims autorizan por sí solos.

Un operador de plataforma no recibe un tenant activo, una Membresía, un rol tenant,
una identidad sustitutiva ni acceso a datos operativos por existir en
`saas_operadores`. Una Empresa objetivo en un comando de plataforma identifica el
agregado sobre el que se actúa; nunca constituye un `empresaId` de sesión ni autoriza
lectura o escritura tenant.

El soporte no es una facultad permanente del operador. Solo puede existir como la
excepción separada de U9-B4: autorización explícita, una Empresa, alcance mínimo de
diagnóstico de solo lectura, duración acotada, revocación y trazabilidad. Esta ADR no
crea un rol de soporte, una Membresía de soporte, un claim tenant de soporte ni una
capacidad de operación de restaurante.

## 2. Autoridades y no-autoridades

| Concepto | Autoridad canónica | No es autoridad para |
|---|---|---|
| Identidad técnica | Firebase Auth (`uid`) | Facultades de plataforma, rol tenant, Empresa activa o lifecycle. |
| Pertenencia y facultades de plataforma | `saas_operadores/{uid}` | Membresía, permisos tenant, lifecycle, Suscripción, fiscalidad u operación. |
| Perfil global | `usuarios/{uid}` | Autorización tenant o de plataforma. |
| Rol, permisos y estado dentro de una Empresa | `membresias/{empresaId}_{uid}` | Facultades de plataforma o soporte. |
| Tenant activo de una sesión ordinaria | Claims tenant emitidos por backend | Estado canónico de Empresa, Suscripción o facultades de plataforma. |
| Acceso y conservación empresarial | `empresas/{empresaId}.estado` | Cobro, rol, facultades de plataforma o numeración. |
| Oferta y relación comercial | Plan/versiones y `suscripciones/{empresaId}` | Acceso canónico a Empresa o reactivación automática. |
| Evidencia de plataforma | `saas_auditoria/{id}` conforme ADR-SAAS-012 | Permisos, estado actual, soporte o ejecución de un comando. |

`ownerUid`, un email, la presencia de `usuarios/{uid}`, un rol `admin` o
`supervisor`, una Membresía, una Suscripción activa, un Plan, un claim tenant o una
evidencia de auditoría no satisfacen nunca una autorización de plataforma.

La misma persona puede ser operador SaaS y miembro de una o más Empresas, pero ambas
relaciones se evalúan por separado. Una operación tenant exige Membresía y controles
tenant; una operación de plataforma exige este ADR. No existe herencia entre ellas.

## 3. Contrato físico de `saas_operadores`

### 3.1 Colección, identidad, ownership y acceso

- **Ruta:** `saas_operadores/{uid}`.
- **Identificador:** el ID del documento es exactamente el `uid` de Firebase Auth.
  No se permite ID generado, email, username, `empresaId` ni identificador de
  Membresía.
- **Plano:** global de plataforma. El documento no contiene `empresaId` y nunca se
  replica dentro de una Empresa.
- **Ownership:** exclusivamente el backend privilegiado de plataforma. Ningún cliente,
  usuario tenant, Firestore Rule de autoservicio, job no autenticado ni proceso de
  bootstrap empresarial puede crear, modificar o eliminar documentos de esta
  colección.
- **Borrado:** prohibido. La revocación conserva el documento en estado `REVOCADO`.
  Borrar un documento destruiría la decisión canónica y permitiría reutilizar su
  identidad como si nunca hubiera sido operador.
- **Lectura:** el backend puede leer el documento necesario para una decisión de
  autorización. Una interfaz puede recibir una proyección mínima desde backend; una
  lectura directa, si se habilita más adelante, solo puede ser del propio documento y
  no sustituye la validación backend. El listado de operadores es una lectura de
  plataforma y requiere `PLATAFORMA_CONSULTAR` más el alcance de la operación.

### 3.2 Forma exacta del documento

Todo documento debe cumplir exactamente este contrato. Campos no listados se rechazan;
las extensiones futuras requieren una nueva versión de este ADR o un ADR que lo
extienda explícitamente.

| Campo | Tipo | Requerido | Restricción e invariantes |
|---|---|:---:|---|
| `schemaVersion` | entero | Sí | Valor fijo `1`. |
| `uid` | string | Sí | No vacío; coincide exactamente con el ID del documento y con un principal Auth existente. Inmutable. |
| `estado` | enum | Sí | `ACTIVO`, `SUSPENDIDO` o `REVOCADO`. |
| `facultades` | array de enum | Sí | Conjunto sin duplicados de §3.3. Vacío solo si el estado no es `ACTIVO`. |
| `versionAutorizacion` | entero | Sí | Entero >= 1. Aumenta exactamente en uno en toda creación, cambio de facultades o cambio de estado que afecte la autorización. Nunca disminuye. |
| `creadoEn` | timestamp servidor | Sí | Inmutable; nunca reloj de cliente. |
| `actualizadoEn` | timestamp servidor | Sí | Se actualiza con toda mutación permitida. |
| `creadoPor` | objeto | Sí | `{ tipo: "BOOTSTRAP" | "OPERADOR", uid: string | null }`; `uid` es `null` solo para `BOOTSTRAP`. Inmutable. |
| `ultimoCambioPorUid` | string | Sí | UID del actor de plataforma que ejecutó el último cambio; en bootstrap coincide con el UID configurado como bootstrap. |
| `motivoCambioCodigo` | string | Sí | Código de motivo no vacío, acotado a 128 caracteres; no contiene secretos, credenciales, PIN, tokens ni PII innecesaria. Describe el último cambio de autorización, no reemplaza la auditoría. |

`creadoPor` y `ultimoCambioPorUid` son metadatos del estado autoritativo actual y de
su origen, no una bitácora. La secuencia completa, motivo ampliado, correlación,
resultado y evidencia durable se emiten hacia ADR-SAAS-012; este ADR no define su
almacenamiento ni sus índices.

#### Estados

| Estado | Puede autorizar | Transiciones admisibles |
|---|---|---|
| `ACTIVO` | Sí, solo para las facultades explícitas no vacías. | `SUSPENDIDO`, `REVOCADO`, o cambio de facultades conservando `ACTIVO`. |
| `SUSPENDIDO` | No. Conserva identidad y facultades para una reactivación controlada. | `ACTIVO` o `REVOCADO`. |
| `REVOCADO` | No. Es terminal. | Ninguna. |

Un documento `ACTIVO` con `facultades: []` es inválido. Un documento `SUSPENDIDO` o
`REVOCADO` debe tener `facultades: []`; las facultades previas no permanecen como
permiso latente. Reactivar desde `SUSPENDIDO` requiere que el comando suministre un
conjunto nuevo y explícito de facultades. `REVOCADO` no se reactiva ni se recrea: una
nueva relación de plataforma para ese UID exigiría un ADR posterior y no se infiere de
este contrato.

### 3.3 Facultades permitidas

`facultades` admite exclusivamente estos valores de string:

| Valor | Facultad | Autoriza, siempre por comandos canónicos | Nunca autoriza |
|---|---|---|---|
| `OPERADORES_GOBERNAR` | Gobernanza de operadores | Incorporar, suspender, reactivar, revocar y cambiar facultades de otro operador. | Autoasignación, auto-reactivación, modificación de Membresías o acceso tenant. |
| `COMERCIAL_GOBERNAR` | Gobernanza comercial | Comandos B2 sobre Planes y Suscripciones. | Lifecycle de Empresa, consumo/límites, tenant activo u operación POS. |
| `BOOTSTRAP_EMPRESARIAL_SOLICITAR` | Solicitud de Bootstrap empresarial | Solicitar `SolicitarBootstrapEmpresarial` para un `ownerUid` verificado mediante el servicio canónico de ADR-SAAS-007. | Crear directamente Empresa, registro de provisionamiento, Membresía, claims, Configuración, Espacio, Numeración o Suscripción; alterar el Bootstrap o escribir datos tenant. |
| `LIFECYCLE_GOBERNAR` | Gobernanza de lifecycle | Solicitar transiciones empresariales admisibles al servicio único de lifecycle. | Escribir `Empresa.estado` directamente, reactivar por Suscripción o modificar datos tenant. |
| `CONSERVACION_GOBERNAR` | Conservación de plataforma | Solicitar archivo, restauración, eliminación o exportación cuando lifecycle y retención lo permitan. | Borrar por conveniencia, lectura interactiva general o soporte. |
| `PLATAFORMA_CONSULTAR` | Consulta de plataforma | Leer la proyección mínima de agregados y evidencia necesaria para otra responsabilidad autorizada. | Mutar, exportar indiscriminadamente, operar tenant o soporte. |

No existen valores equivalentes, aliases, perfiles persistidos, `superadmin`,
`soporte`, `impersonador`, `operador_pos`, `tenant_admin`, `consumo`, `limites` ni
`cambiar_tenant`. Los perfiles conceptuales de MT-U9 B1 son solo agrupaciones de
presentación de estas facultades; el conjunto `facultades` es la única representación
persistida y decisoria.

La combinación de facultades es aditiva únicamente respecto de las seis capacidades
enumeradas. Nunca crea una facultad residual, acceso a soporte, un tenant implícito ni
autorización sobre fiscalidad u operación.

### 3.4 Índices requeridos

El ID de documento cubre la decisión canónica por `uid`; no requiere índice adicional.
Se requieren los siguientes índices compuestos de Firestore para las consultas de
plataforma permitidas, con todos los resultados limitados y paginados:

| Consulta autorizada | Índice compuesto |
|---|---|
| Listar operadores por estado, orden reciente | `estado ASC, actualizadoEn DESC` |
| Listar operadores activos que poseen una facultad concreta, orden reciente | `facultades ARRAY_CONTAINS, estado ASC, actualizadoEn DESC` |

No se autoriza consulta por email, nombre, Empresa, `ownerUid`, Membresía, ni scans sin
límite. Si una proyección futura exige otro patrón de consulta, debe justificar su
minimización y añadir el índice correspondiente antes de exponerlo.

### 3.5 Invariantes físicos

1. Existe a lo sumo un documento por `uid`, y solo si existe su principal Firebase
   Auth; la existencia de Auth no obliga a que exista el documento.
2. La autorización se calcula desde el documento actual, no desde una colección de
   eventos, una proyección de UI, `usuarios`, claims ni memoria de proceso.
3. Ningún documento contiene `empresaId`, rol tenant, permisos tenant, PIN, email,
   contraseña, token, secreto de integración, credencial fiscal ni payload tenant.
4. Toda mutación canónica cambia `versionAutorizacion` y `actualizadoEn` en la misma
   transacción del documento; no hay mutación parcial ni last-write-wins.
5. La modificación concurrente exige `expectedVersionAutorizacion`; una versión
   obsoleta se rechaza y no se reintenta con otra carga automáticamente.
6. El actor nunca puede modificar su propio documento, incluidas suspensión,
   reactivación, revocación o facultades. Esto evita autoescalamiento y
   auto-recuperación.
7. Una operación de gobernanza no modifica Firebase Auth como usuario, `usuarios`,
   `membresias`, `empresas`, `suscripciones`, bootstrap, configuración, numeraciones,
   ventas, ledger ni tesorería. Solo gestiona la pertenencia de plataforma y su
   proyección de claim.

## 4. Claims de plataforma y sesiones

### 4.1 Proyección exacta

El backend privilegiado mantiene, dentro de los custom claims del principal, la
proyección de plataforma siguiente:

```ts
saas: {
  operador: boolean,
  versionAutorizacion: number,
  facultades: string[]
}
```

Para un documento `ACTIVO`, `operador` es `true`, `versionAutorizacion` coincide con
el documento y `facultades` es la copia exacta del conjunto canónico. Para
`SUSPENDIDO` o `REVOCADO`, `operador` es `false`, `facultades` es `[]` y la versión
coincide con el documento. No se proyectan `empresaId`, rol tenant, soporte,
autorización de soporte, Empresa objetivo, duración de sesión ni datos tenant dentro
de `saas`.

El emisor fusiona esta propiedad con los claims tenant existentes que sean propiedad de
sus contratos. Nunca reemplaza, borra ni sintetiza `{ empresaId, rol }` ni otro claim
tenant al crear, cambiar, suspender, reactivar o revocar un operador. La ausencia de
`saas` equivale a contexto de plataforma inexistente y se deniega.

### 4.2 Emisión, sincronización y revocación

Solo el backend privilegiado puede emitir o cambiar claims. El cliente no escribe
claims, `saas_operadores`, sesión de soporte ni un `empresaId` de plataforma.

Para crear, modificar, suspender, reactivar o revocar, el orden obligatorio es:

1. Validar actor, facultad, prohibición de autoacción, clave de idempotencia y
   `expectedVersionAutorizacion`.
2. Confirmar transaccionalmente el documento canónico y aumentar
   `versionAutorizacion`. Este commit es el corte efectivo de autorización.
3. Proyectar el claim `saas` correspondiente.
4. Revocar refresh tokens del UID afectado y solicitar renovación de ID token.
5. Emitir la obligación de evidencia hacia ADR-SAAS-012, posterior al hecho durable.

Firebase Auth no participa en la transacción Firestore. Si fallan los pasos 3 o 4,
el documento canónico no se revierte y un reconciliador backend reintenta la proyección
y la revocación hasta que coincidan. Mientras tanto, toda Function o callable protegida
lee el documento canónico y deniega el uso de claims antiguos; por tanto el fallo de
propagación no mantiene privilegio.

Un backend que detecte que `saas.versionAutorizacion` no coincide con el documento
canónico responde `PLATFORM_CONTEXT_STALE`, no ejecuta el comando y exige renovar el
token. Si el documento no existe, no está `ACTIVO`, carece de la facultad o la
proyección es contradictoria, responde `PLATFORM_ACCESS_DENIED`. El cliente puede
refrescar el token y reintentar solo con la misma clave de idempotencia; nunca altera
la carga para sortear el rechazo.

La revocación de refresh tokens reduce la exposición de sesiones y fuerza la
propagación, pero no es una barrera suficiente ni sustituye la lectura canónica. No se
deshabilita el usuario completo de Firebase Auth por revocar su condición de operador:
podría conservar identidades y Membresías tenant legítimas, que son un dominio distinto.

## 5. Autorización y enforcement

### 5.1 Predicado canónico

Una operación de plataforma se autoriza solo si todas estas condiciones son verdaderas:

```text
Auth válida
AND documento saas_operadores/{uid} existe y estado == ACTIVO
AND facultades contiene la facultad requerida
AND saas.versionAutorizacion coincide con versionAutorizacion canónica
AND el comando pertenece al alcance permitido de la facultad
AND el agregado objetivo admite la operación bajo su propio contrato
AND no se crea contexto tenant ni sesión de soporte implícita
```

Falta, discrepancia o error de lectura en cualquiera de ellas implica denegación por
defecto. El claim se usa como filtro de contexto y detección de desactualización, pero
el documento canónico decide. El agregado objetivo conserva la decisión final sobre
estado, transición, revisión, tiempo, idempotencia, lifecycle, retención y demás
invariantes de su dominio.

### 5.2 Backend, callables y Cloud Functions

- Todo callable, HTTP handler, tarea, worker o Cloud Function que ejecute una
  operación de plataforma valida el predicado de §5.1 antes de leer datos de alcance
  sensible o invocar el agregado.
- El backend deriva el `uid` exclusivamente del token verificado. Nunca acepta
  `actorUid`, facultades, estado, `empresaId` de sesión, rol tenant o permiso del body
  como autoridad.
- El `empresaId` de un comando permitido identifica un agregado objetivo y se valida
  contra ese agregado. No se inserta en claims ni se entrega a helpers tenant como
  contexto ordinario.
- La capa Admin SDK es técnicamente privilegiada, no autorizada automáticamente: el
  bypass de Firestore Rules nunca omite §5.1 ni las validaciones del agregado.
- Ninguna Function de plataforma escribe directamente `Empresa.estado`, Plan,
  Suscripción, configuración, numeración, asignación, venta, snapshot, ledger o
  tesorería. Invoca únicamente el servicio o comando canónico del dominio.

### 5.3 Firestore Rules y frontend

- Las Rules deben ser deny-by-default para escrituras cliente sobre
  `saas_operadores`; `create`, `update` y `delete` desde cliente son siempre `false`.
- Las Rules tenant de ADR-SAAS-001 y ADR-SAAS-009 no se relajan para operadores. Un
  claim `saas` no satisface una regla que exige `empresaId`, rol tenant, Membresía o
  lifecycle compatible.
- Los guards frontend solo ocultan o deshabilitan capacidades según una proyección de
  sesión; no autorizan, no cachean una revocación como válida y no sustituyen la
  revalidación backend.
- La carga inicial y cada retorno a una superficie de plataforma deben solicitar una
  proyección actual de sesión. Ante `PLATFORM_CONTEXT_STALE` o
  `PLATFORM_ACCESS_DENIED`, el frontend elimina su estado de plataforma y redirige a
  una superficie sin privilegios.

## 6. Bootstrap, incorporación y ciclo de vida de operadores

### 6.1 Primer operador

El primer operador no se crea con una Membresía, `ownerUid`, Bootstrap empresarial de
ADR-SAAS-007, callable público ni UI. Se crea mediante una única operación
backend-only de bootstrap de plataforma, controlada por el despliegue y ejecutable
solo mientras no exista ningún documento `saas_operadores`.

Precondiciones obligatorias:

1. El UID objetivo existe ya en Firebase Auth y se verifica contra una identidad SaaS
   global; bootstrap no crea ni modifica credenciales.
2. El backend recibe el UID desde configuración operativa controlada fuera del cliente;
   no desde parámetros públicos, query strings ni Firestore escribible.
3. La consulta canónica confirma que la colección no contiene operadores. Si existe
   cualquiera, el bootstrap se rechaza definitivamente.
4. Se crea el documento `ACTIVO` con las facultades explícitas necesarias para
   establecer la gobernanza inicial, `creadoPor.tipo = "BOOTSTRAP"`, versión `1` y
   motivo `PLATFORM_INITIAL_BOOTSTRAP`.
5. Se proyecta el claim y se revocan tokens conforme a §4.2. Un fallo posterior al
   commit se reconcilia; nunca se borra el documento ni se crea otro primer operador.

El bootstrap empresarial de ADR-SAAS-007 permanece inalterado: crea una Empresa,
Membresía administrativa del owner y claims tenant recuperables; no crea ni concede
operadores SaaS.

### 6.2 Incorporación ordinaria

`OPERADORES_GOBERNAR` permite incorporar otro principal existente de Firebase Auth.
El comando exige UID objetivo, facultades explícitas no vacías, motivo, idempotencia y
la no existencia previa de `saas_operadores/{uid}`. No admite email como selector de
autoridad ni crea una cuenta Auth. Tras el commit se proyecta el claim y se completa
la obligación de auditoría.

El actor incorporador no puede ser el objetivo. Un intento de reusar un UID existente,
incluido `REVOCADO`, se rechaza; no existe sobrescritura ni “reactivación” de una
revocación terminal.

### 6.3 Suspensión, reactivación y revocación

- **Suspender:** un operador con `OPERADORES_GOBERNAR`, distinto del objetivo, pasa un
  documento `ACTIVO` a `SUSPENDIDO`, limpia las facultades, incrementa la versión y
  provoca invalidación de sesión. No toca Auth ni Membresías tenant.
- **Reactivar:** sobre un documento `SUSPENDIDO`, un actor distinto con la misma
  facultad asigna un nuevo conjunto explícito, pasa a `ACTIVO`, incrementa versión y
  reemite contexto. No restaura facultades históricas por inferencia.
- **Revocar:** sobre `ACTIVO` o `SUSPENDIDO`, un actor distinto con
  `OPERADORES_GOBERNAR` pasa a `REVOCADO`, limpia facultades, incrementa versión y
  revoca tokens. Es terminal, no borrable y no reactivable.

Todos los cambios usan la versión actual y la misma saga de proyección de §4.2. El
estado de Empresa, la Suscripción, las facultades tenant y las sesiones tenant se
mantienen independientes.

## 7. Facultades y frontera estricta

### 7.1 Qué puede hacer un operador

Solo puede ejecutar la facultad explícita que posea, mediante los comandos de §8 y los
servicios canónicos existentes:

- `OPERADORES_GOBERNAR`: administrar la pertenencia y facultades de plataforma de
  otros operadores.
- `COMERCIAL_GOBERNAR`: administrar Planes y Suscripciones conforme a su máquina de
  estados, versionado, periodos, gracia y grandfathering.
- `BOOTSTRAP_EMPRESARIAL_SOLICITAR`: solicitar el Bootstrap empresarial canónico para
  un `ownerUid` verificado; ADR-SAAS-007 conserva en exclusiva la creación del registro
  de provisionamiento, Empresa, núcleo tenant, Membresía inicial y claims recuperables.
- `LIFECYCLE_GOBERNAR`: solicitar transiciones admisibles de Empresa por el servicio
  único de lifecycle, con revisión, motivo e idempotencia.
- `CONSERVACION_GOBERNAR`: solicitar archivo, restauración, eliminación o exportación
  controlada solo cuando lifecycle, retención y proceso canónico lo permitan.
- `PLATAFORMA_CONSULTAR`: consultar la mínima proyección canónica necesaria para una
  responsabilidad de plataforma; no muta por sí sola.

Todo lo que no se enumera arriba queda prohibido. Tener varias facultades no elimina
las precondiciones del agregado ni permite combinar comandos en una escritura
administrativa directa.

### 7.2 Lo que nunca puede hacer por ser operador

Un operador SaaS no puede, por su condición de operador:

- obtener, seleccionar o cambiar un tenant activo; crear una Membresía; actuar como
  owner; modificar `usuarios`; cambiar roles, permisos o estado tenant; emitir claims
  tenant; incorporar empleados ni ejecutar o completar directamente Bootstrap
  empresarial. La facultad `BOOTSTRAP_EMPRESARIAL_SOLICITAR` solo permite solicitarlo
  al servicio canónico de ADR-SAAS-007;
- operar POS, caja, turnos, pedidos, cocina, reservas, clientes, inventario, gastos,
  reportes, tesorería o cualquier recurso operativo de una Empresa;
- crear, editar o eliminar configuración, espacios, numeraciones, asignaciones,
  resoluciones, rangos, prefijos, contadores o credenciales fiscales;
- confirmar, anular, reimprimir o editar ventas; alterar `snapshotFiscal`,
  `estadoOperativo`, movimientos de inventario, ledger, cuentas bancarias o
  transacciones financieras;
- inferir acceso de `ownerUid`, email, `admin`, `supervisor`, Suscripción, Plan,
  evidencia de auditoría, claim tenant, claim `saas` aislado o presencia de un
  documento;
- introducir consumo, límites medidos, precios, pasarela de pago, cambio
  multiempresa de usuario o convergencia Electron; corresponden a MT-U10, MT-U11 y
  MT-U12;
- leer, registrar o exponer contraseñas, PIN, tokens, secretos de integración,
  credenciales fiscales, datos de pago, payloads fiscales completos o PII no
  estrictamente necesaria.

## 8. Contrato de comandos, APIs y callables

Estos son contratos arquitectónicos; no prescriben nombre de endpoint, transporte,
framework, UI, Function concreta ni esquema de auditoría físico.

| Comando conceptual | Facultad requerida | Responsabilidad y precondiciones | Invariantes de resultado |
|---|---|---|---|
| `BootstrapOperadorInicial` | Ninguna; backend de despliegue únicamente | §6.1; colección vacía, UID Auth existente y configuración operativa controlada. Nunca callable público. | Un único primer documento activo; no crea tenant, Membresía ni cuenta Auth. |
| `IncorporarOperador` | `OPERADORES_GOBERNAR` | Actor distinto, UID Auth existente sin documento, facultades explícitas, idempotencia y versión de operación. | Crea solo el agregado operador y su proyección de claims. |
| `CambiarFacultadesOperador` | `OPERADORES_GOBERNAR` | Actor distinto, objetivo `ACTIVO`, conjunto válido no vacío, `expectedVersionAutorizacion`. | Cambia solo facultades; incrementa versión; no autoescalamiento. |
| `SuspenderOperador` | `OPERADORES_GOBERNAR` | Actor distinto, objetivo `ACTIVO`, motivo y versión esperada. | Estado suspendido, facultades vacías, sesión invalidada. |
| `ReactivarOperador` | `OPERADORES_GOBERNAR` | Actor distinto, objetivo `SUSPENDIDO`, facultades nuevas explícitas, motivo y versión esperada. | Estado activo; no restaura privilegios implícitos. |
| `RevocarOperador` | `OPERADORES_GOBERNAR` | Actor distinto, objetivo no revocado, motivo y versión esperada. | Estado terminal, facultades vacías, sesión invalidada; sin borrado. |
| `ConsultarContextoPlataforma` | Documento activo propio; no concede facultad adicional | Revalida §5.1 y devuelve solo proyección mínima de facultades actuales. | No cambia autoridad ni crea tenant activo. |
| `SolicitarBootstrapEmpresarial` | `BOOTSTRAP_EMPRESARIAL_SOLICITAR` | Actor autorizado; `ownerUid` SaaS existente y verificado; clave de idempotencia y huella compatibles; motivo y correlación. Invoca exclusivamente el servicio canónico de ADR-SAAS-007. | Devuelve el estado durable del provisionamiento. El operador no crea Empresa, Membresía, claims ni documentos tenant y no modifica el Bootstrap. |
| Comandos comerciales B2 | `COMERCIAL_GOBERNAR` | Conservan agregado Plan/Suscripción, sus estados, revisiones, periodo, idempotencia y reloj servidor. | Suscripción nunca decide acceso ni reactiva Empresa automáticamente. |
| Comandos de lifecycle B2 | `LIFECYCLE_GOBERNAR` | Invocan el servicio único y respetan transición, `expectedRevision`, motivo, retención y estado canónico. | No escriben `Empresa.estado` directamente ni modifican operación tenant. |
| Comandos de conservación B2 | `CONSERVACION_GOBERNAR` | Requieren proceso canónico, lifecycle y base de retención aplicable. | No son soporte ni lectura interactiva general; no alteran hechos históricos. |
| Consultas de plataforma | `PLATAFORMA_CONSULTAR` y, cuando aplique, la facultad propietaria | Datos mínimos, límite, paginación y propósito de plataforma verificable. | La consulta no muta ni autoriza soporte, exportación masiva o tenant. |

Todo comando mutante contiene: identificador de comando, clave de idempotencia y huella
de intención, actor derivado del token, facultad requerida, agregado objetivo,
revisión esperada cuando aplique, motivo codificado, correlación y causación. La misma
clave con la misma huella recupera el resultado durable; con distinta huella se
rechaza. Una revisión obsoleta produce conflicto explícito, nunca last-write-wins.

La aceptación de un comando no autoriza una API de escritura directa. Todos los
callables y APIs están sujetos a §5 y a las validaciones del agregado objetivo.

## 9. Frontera de soporte e impersonación

La frontera de soporte adopta las reglas de MT-U9 B4 y las vuelve obligatorias para
cualquier implementación posterior:

1. `saas_operadores` no contiene una facultad de soporte, una Empresa objetivo, una
   duración ni un permiso reutilizable de impersonación.
2. Ningún callable de operador puede iniciar, renovar, ampliar, delegar o reutilizar
   soporte como efecto de las facultades de §3.3.
3. Una sesión de soporte, si se habilita, requiere una autorización separada y previa
   que identifique: operador, una sola Empresa, necesidad, alcance de datos mínimo,
   inicio, expiración, condición de revocación y base documentada de autorización.
4. La sesión conserva doble atribución: operador de plataforma y Empresa objetivo. No
   simula que el operador sea cajero, admin u otro usuario tenant.
5. El alcance inicial y máximo es diagnóstico de solo lectura. No permite ventas,
   POS, caja, inventario, fiscalidad, configuración, Membresías, credenciales, claims
   tenant, lifecycle, Plan, Suscripción, Bootstrap, numeraciones, snapshots, ledger,
   tesorería ni comandos B2 en nombre del tenant.
6. En `trial` y `activa`, el soporte solo existe bajo los requisitos de esta sección.
   En `suspendida`, el soporte no amplía la lectura administrativa propia de
   owner/admin ni habilita POS; una sesión de soporte sigue requiriendo autorización
   separada y previa conforme a MT-U9 B4. En `cancelada`, no existe acceso interactivo
   de soporte; en `archivada`, se requiere además la excepción de lifecycle; en
   `eliminada`, no existe soporte.
7. Vencimiento, revocación o discrepancia de estado bloquean de inmediato la sesión;
   un token, claim, cookie, evidencia o caché anterior no la mantiene.
8. Las acciones y denegaciones de soporte deben producir la evidencia requerida por
   ADR-SAAS-012. Esa evidencia no es la autorización, no prolonga la sesión y no se
   usa para decidir permisos.

La definición de la autorización y sesión de soporte no modifica Membresías ni claims
tenant ordinarios. Si una intervención necesita mutar u operar una Empresa, el actor
debe poseer la Membresía tenant explícita exigida por los ADR existentes y actuar bajo
los controles tenant ordinarios; soporte no es un atajo.

## 10. Seguridad y auditoría requerida

- **Deny by default:** Auth, documento activo, facultad, versión de contexto, alcance
  de comando y agregado admisible son condiciones acumulativas. Fallo técnico o de
  revalidación implica denegación.
- **Mínimo privilegio:** no hay superadmin, permisos por presencia, herencia desde
  perfiles ni facultades implícitas.
- **Escalamiento:** se prohíben autoasignación, auto-reactivación, restauración
  automática de facultades y uso de una facultad para crear otra. Los cambios exigen
  otro actor y concurrencia controlada.
- **Sesiones:** el documento canónico corta privilegios antes de actualizar claims;
  claims se sincronizan y refresh tokens se revocan como propagación. Ningún proceso
  protegido confía únicamente en el token.
- **Secretos y minimización:** comandos, respuestas, proyecciones y evidencia nunca
  incluyen secretos, credenciales, PIN, tokens, payloads completos ni PII innecesaria.
- **Auditoría obligatoria:** toda creación, cambio de facultades, suspensión,
  reactivación, revocación, denegación de autorización, conflicto de versión, comando
  sensible de plataforma y hecho de soporte debe generar evidencia posterior al hecho
  durable o a la denegación. Debe mantener actor, facultad cuando aplique, agregado,
  Empresa referenciada si aplica, correlación, causación, tiempo servidor, resultado y
  motivo mínimo. Su contrato físico e inmutabilidad se definen solo en ADR-SAAS-012.

## 11. Compatibilidad y consecuencias

| Autoridad | Compatibilidad garantizada |
|---|---|
| Documento Maestro y ADR-SAAS-001 | Mantiene empresa como frontera, `empresaId` solo en datos tenant, claims tenant sin elección libre y Rules/helper sin excepción por operador. |
| ADR-SAAS-002, 005 y 006 | Auth autentica; `usuarios` es perfil; Membresías son exclusivamente tenant; supervisor no se amplía; incorporación no crea operadores. |
| ADR-SAAS-003, 004, 008, 009 y 010 | Conserva separación comercial/lifecycle, Empresa como autoridad, configuración/numeración/fiscalidad inalteradas y estados operativos/ledger inmutables. |
| ADR-SAAS-007 | El bootstrap de Empresa sigue separado, atómico y recuperable; crear un operador no crea Empresa ni altera bootstrap. |
| MT-U9 B0–B6 | Materializa PLT-B0 y OPR-B1: facultad explícita, sin tenant ni soporte implícitos, comandos sin bypass, evidencia no autorizante y Panel como consumidor. |
| MT-U10, MT-U11 y MT-U12 | No define consumo/límites, cambio de tenant multiempresa ni Electron. |
| MASTER-SECURITY-PLAN | Cumple autoridad servidor, claims server-side, Admin SDK revalidado, deny-by-default, mínimos privilegios, revocación y trazabilidad sin secretos. |

Consecuencias deliberadas:

- Cada operación de plataforma protegida realiza una revalidación canónica; el coste
  adicional es aceptado para cerrar la ventana de claims obsoletos.
- La revocación no borra ni deshabilita el principal Auth, porque identidad global,
  Membresías tenant y condición de operador son autoridades independientes.
- El primer operador requiere un trust anchor operativo de despliegue. No se expone una
  ruta de autoalta ni se reutiliza el bootstrap de Empresa.
- La auditoría sigue siendo una obligación de los comandos, pero el diseño persistente
  de esa evidencia no se duplica aquí y permanece bloqueado por ADR-SAAS-012.

## 12. Invariantes verificables de aceptación

- **OPR-011-01:** Auth sin documento `ACTIVO` nunca autoriza plataforma.
- **OPR-011-02:** claim `saas` sin documento canónico coincidente nunca autoriza
  plataforma.
- **OPR-011-03:** un documento `ACTIVO` sin la facultad requerida nunca autoriza el
  comando correspondiente.
- **OPR-011-04:** suspender o revocar corta autorización backend incluso si el ID token
  anterior conserva facultades.
- **OPR-011-05:** ninguna operación de operador crea o usa un tenant activo,
  Membresía, claim tenant o acceso operativo implícito.
- **OPR-011-06:** ningún actor puede cambiar su propia pertenencia, estado o
  facultades de plataforma.
- **OPR-011-07:** toda mutación de operador es concurrencia controlada, idempotente y
  eleva `versionAutorizacion`.
- **OPR-011-08:** los comandos de plataforma reutilizan agregados y servicios
  canónicos; no existe escritura administrativa ad hoc.
- **OPR-011-09:** soporte no existe por defecto y, si existe, es lectura diagnóstica
  de una sola Empresa, temporal, revocable, atribuible y no operativa.
- **OPR-011-10:** ninguna ruta de este ADR modifica fiscalidad, snapshots, ventas,
  `estadoOperativo`, ledger, tesorería o auditoría histórica.
- **OPR-011-11:** `saas_auditoria` no decide permisos y su modelo físico no se define
  en este ADR.
- **OPR-011-12:** `BOOTSTRAP_EMPRESARIAL_SOLICITAR` autoriza únicamente solicitar el
  servicio canónico de ADR-SAAS-007; no concede autoridad para crear o escribir
  directamente Empresa, provisionamiento, Membresía, claims ni recursos tenant.

## Relación con otros ADR

- ADR-SAAS-001 aporta aislamiento tenant y niega cualquier bypass por condición de
  operador.
- ADR-SAAS-002 aporta Firebase Auth como identidad técnica y emisión privilegiada de
  claims.
- ADR-SAAS-003 y ADR-SAAS-009 conservan la separación y enforcement de Empresa y
  Suscripción.
- ADR-SAAS-004 define los planos de datos; ADR-SAAS-008 y ADR-SAAS-010 excluyen
  fiscalidad y operación de las facultades de plataforma.
- ADR-SAAS-005 y ADR-SAAS-006 preservan roles e incorporación exclusivamente tenant.
- ADR-SAAS-007 mantiene separado el bootstrap empresarial.
- ADR-SAAS-012 deberá definir la persistencia, append-only, integridad, retención,
  índices y no repudio de la evidencia que este ADR exige, sin convertirla en fuente
  de autorización.

## Anexo A — Autoridad física de soporte

Este anexo completa exclusivamente la excepción B4. No añade una facultad permanente,
rol tenant, claim tenant ni acceso operativo.

### A.1 Agregado, ownership y documento

La única autoridad temporal de soporte es
`saas_soporte_autorizaciones/{autorizacionId}`. Su ID es UUID opaco generado por
backend. El documento reúne solicitud, autorización y sesión porque son fases de una
misma concesión no reutilizable; `sesionId`, cuando existe, también es UUID backend.
No existe colección alternativa ni la autorización se deduce de `saas_operadores`,
Membresía, auditoría, UI o claim.

El backend de soporte es el único escritor. Clientes no crean, actualizan ni eliminan
el documento; las Rules son deny-by-default. Campos obligatorios:

| Campo | Tipo y restricción |
|---|---|
| `schemaVersion`, `autorizacionId` | Entero fijo `1` y UUID igual al ID, inmutables. |
| `estado` | `SOLICITADA`, `AUTORIZADA`, `EN_SESION`, `FINALIZADA`, `RECHAZADA`, `REVOCADA` o `EXPIRADA`. |
| `empresaObjetivoId` | ID de una única Empresa; inmutable y nunca tenant activo. |
| `operadorUid` | UID Auth con `saas_operadores/{uid}` activo al autorizar/iniciar; inmutable. |
| `solicitante` | `{ tipo: "OPERADOR" | "TENANT_ADMIN", uid: string }`; solo identifica solicitud, no concede acceso. |
| `baseAutorizacion` | `CONSENTIMIENTO_TENANT`; única base admitida en esta entrega. |
| `consentimientoPorUid` | UID de una Membresía `admin` activa de la Empresa; obligatorio desde `AUTORIZADA`, inmutable. |
| `alcanceCodigo` | Valor fijo `DIAGNOSTICO_SOLO_LECTURA`; no se permiten scopes ampliables. |
| `inicioPermitidoEn`, `expiraEn` | Timestamps servidor; `expiraEn` es estrictamente posterior y no se modifica. |
| `sesionId`, `iniciadaEn`, `finalizadaEn` | UUID/timestamps o `null`; se materializan solo en los estados correspondientes. |
| `motivoCodigo`, `correlacionId` | Strings opacos 1–128, sin secretos ni PII innecesaria; inmutables. |
| `creadaEn`, `actualizadaEn`, `version` | Timestamps servidor y entero >= 1; `version` aumenta en cada transición. |

### A.2 Estados, transiciones e invalidación

```text
SOLICITADA -> AUTORIZADA -> EN_SESION -> FINALIZADA
     |             |             |
     v             v             v
 RECHAZADA     REVOCADA       REVOCADA
                   \             /
                    -> EXPIRADA <-
```

- Un operador activo puede crear `SOLICITADA`; no obtiene acceso por ello.
- Solo una Membresía `admin` activa de `empresaObjetivoId`, validada canónicamente por
  backend, puede aceptar la solicitud y producir `AUTORIZADA`. `ownerUid`, email o
  claim aislado no sustituyen esa Membresía.
- El operador objetivo inicia una única sesión desde `AUTORIZADA` si sigue activo, el
  consentimiento sigue vigente, el tiempo está dentro de rango y el lifecycle admite
  soporte. Esto crea `sesionId` y `EN_SESION`.
- El mismo admin puede rechazar `SOLICITADA` o revocar `AUTORIZADA`/`EN_SESION`; el
  operador solo puede finalizar `EN_SESION`. El reloj servidor transiciona a
  `EXPIRADA` al vencer. `RECHAZADA`, `REVOCADA`, `EXPIRADA` y `FINALIZADA` son
  terminales.
- Toda transición exige `expectedVersion`; conflictos se rechazan. Revocación,
  expiración, pérdida de la Membresía consentidora, suspensión/revocación del operador,
  Empresa `cancelada`/`eliminada`, o discrepancia de alcance invalidan inmediatamente
  una sesión. `archivada` solo conserva una autorización ya vigente y nunca habilita
  operación tenant; no se crea soporte nuevo sin consentimiento activo.

Cada lectura diagnóstica revalida documento, estado `EN_SESION`, operador, Empresa,
tiempo y alcance. La sesión no emite ni modifica claims tenant, no usa `empresaId`
como contexto ordinario y permite únicamente el diagnóstico de solo lectura de B4.

### A.3 Invariantes y auditoría

Una autorización contiene una sola Empresa, un operador, un alcance y una sesión como
máximo. No se delega, reutiliza, renueva ni cambia de Empresa. Ninguna transición
modifica Membresías, Auth, claims, lifecycle, comercial, fiscalidad, configuración,
ventas, ledger o tesorería.

La creación, rechazo, autorización, inicio, finalización, revocación, expiración y
denegación fuera de alcance generan obligatoriamente los tipos B4 de evidencia de
ADR-SAAS-012. La auditoría referencia esta autoridad, pero no la sustituye ni mantiene
una sesión revocada.
