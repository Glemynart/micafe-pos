# MT-U12 — Convergencia de la sesión SaaS con Electron

> **Estado:** especificación arquitectónica para revisión.
> **Alcance:** convergencia conceptual entre la sesión SaaS aprobada y una sesión de aplicación Electron.
> **Precondición:** MT-U3, MT-U5B, MT-U9, MT-U10 y MT-U11 aprobadas. Este documento no modifica sus autoridades ni define mecanismos técnicos.

## U12.1 Autoridad y propósito

MT-U12 cierra el programa arquitectónico del Documento Maestro al establecer el contrato conceptual mediante el cual una sesión SaaS ya definida puede ser coherente con una sesión de aplicación Electron. Resuelve el riesgo de que el cliente desktop mantenga, reconstruya o interprete un contexto tenant distinto del aprobado para SaaS.

La web continúa siendo una superficie SaaS de primera clase para la operación normal. Electron es un cliente complementario de continuidad ante una indisponibilidad externa de conectividad; no es el único cliente, no reemplaza la web ni se convierte en fuente alternativa de autoridad de sesión. Esta precisión no diseña funcionamiento sin conexión, sincronización, estado local ni mecanismo de contingencia.

MT-U12 incorpora únicamente la responsabilidad conceptual de **convergencia**: determinar cuándo una sesión de aplicación puede representar el mismo contexto activo que la sesión SaaS. No incorpora identidad, autenticación, membresías, claims, lifecycle, autorización tenant, plataforma, consumo, fiscalidad ni implementación; esas responsabilidades permanecen donde ya fueron aprobadas.

| Autoridad previa | Responsabilidad que conserva | MT-U12 no la sustituye mediante |
|---|---|---|
| MT-U3 | Aislamiento tenant en servicios, Plan/Suscripción y lifecycle establecido. | Una sesión desktop o contexto local. |
| MT-U5B | Identidad global, incorporación y membresía como autoridad tenant. | Inicio de aplicación o estado del cliente. |
| MT-U9 | Operadores, auditoría, soporte, impersonación y Panel SaaS separados. | Una sesión Electron o una pertenencia tenant implícita. |
| MT-U10 | Límites, consumo, períodos, evaluación y enforcement por Empresa. | Contexto de aplicación o datos de cliente. |
| MT-U11 | Contexto activo, tenant activo singular y cambio conceptual de tenant. | Una segunda definición de sesión en Electron. |
| ADR y seguridad | Tenancy, identidad, lifecycle, fiscalidad y mínima autoridad. | Un mecanismo técnico del cliente. |

No pertenecen a MT-U12 la autenticación técnica, credenciales, tokens, renovación o revocación de sesión, sincronización, navegación, ventanas, IPC, almacenamiento local, SQLite, caché, APIs, reglas, funciones, middleware, infraestructura, modelos físicos, algoritmos ni implementación. Tampoco pertenece a MT-U12 diseñar una experiencia de usuario o alterar cualquier autoridad existente.

## U12.2 Modelo conceptual

### Sesión SaaS

La **sesión SaaS** es el contexto de sesión ya aprobado por MT-U11 para una identidad SaaS global. Comprende el contexto activo aplicable: identidad global, membresía aplicable, Empresa activa única y la proyección de tenant activo y rol. No es una nueva fuente de identidad, membresía, lifecycle ni autorización.

La sesión SaaS no hace canónico el estado de Empresa. `Empresa.estado` conserva su autoridad sobre acceso y conservación, incluso si una proyección de sesión pudiera permanecer vigente después de una transición, conforme ADR-SAAS-009.

### Contexto activo

El **contexto activo** conserva exactamente el significado aprobado por MT-U11: agrupación conceptual no sustitutiva de identidad global, membresía aplicable, Empresa activa y proyección. Tiene una sola Empresa activa y no agrega permisos, datos o autoridades de otras Empresas.

MT-U12 no crea un contexto activo de Electron. La aplicación Electron solo puede aspirar a representar el contexto activo definido por la sesión SaaS; no puede reconstruirlo desde datos propios ni otorgarle una semántica diferente.

### Sesión de aplicación

La **sesión de aplicación** es el contexto conceptual bajo el cual un cliente presenta o utiliza la aplicación para una identidad. En la web, la sesión SaaS es la superficie normal; MT-U12 aborda la sesión de aplicación Electron únicamente como cliente complementario de continuidad. No es una identidad, membresía, tenant activo, claim, estado de lifecycle ni autoridad de acceso.

Una sesión de aplicación solo es arquitectónicamente válida para un tenant cuando converge con una sesión SaaS y representa su mismo contexto activo. Su existencia no autoriza operar, consultar ni seleccionar una Empresa por sí sola.

### Convergencia de sesión

La **convergencia de sesión** es la correspondencia conceptual por la cual una sesión de aplicación Electron representa el mismo contexto activo que una sesión SaaS: misma identidad global, misma membresía aplicable, misma Empresa activa única y misma proyección de tenant activo y rol.

Converger no significa autenticar, emitir claims, cambiar tenant, crear una membresía, resolver lifecycle, sincronizar datos, persistir información ni ejecutar controles. Es una condición de coherencia arquitectónica: Electron adopta el contexto SaaS sin sustituir ninguna de sus autoridades.

## U12.3 Relación de autoridades

| Concepto | Autoridad que permanece | Papel de Electron y del cliente |
|---|---|---|
| Identidad global | Identidad SaaS global bajo ADR-SAAS-002 y MT-U5B. | La representa; no crea, duplica ni redefine identidad. |
| Membresía | Membresía de la Empresa, autoridad de rol, permisos y estado tenant. | No la crea, modifica, interpreta como opcional ni reemplaza. |
| Tenant activo | Contexto activo proyectado en claims emitidos por backend. | Lo representa solo mediante convergencia; no lo elige libremente ni conserva uno alterno. |
| Claims | Proyección de tenant activo y rol según Maestro y ADR-SAAS-009. | No los escribe, amplía, usa como catálogo de membresías ni trata como lifecycle. |
| Lifecycle | `Empresa.estado` y servicio canónico. | No lo decide, regulariza, reactiva ni sustituye con estado de aplicación. |
| Backend | Autoridades privilegiadas ya definidas para identidad, membresía, claims y enforcement canónico. | El cliente no lo reemplaza ni obtiene privilegio equivalente. |
| Electron | Cliente de aplicación sin autoridad de dominio o tenant. | Debe mantener neutralidad y converger con el contexto SaaS. |
| Cliente | Superficie no canónica de interacción. | No fija `empresaId`, rol, permisos, lifecycle ni autoridad a partir de estado propio. |

## U12.4 Principios arquitectónicos

### U12-P01 — Convergencia sin sustitución

La convergencia permite que la sesión de aplicación represente una sesión SaaS, pero no sustituye identidad, membresía, contexto activo, claims, lifecycle ni backend. Ninguna autoridad se desplaza al cliente por estar Electron presente.

### U12-P02 — Continuidad exacta de contexto

Una sesión de aplicación convergente conserva el mismo significado de contexto activo que la sesión SaaS: misma identidad, membresía aplicable, Empresa activa única y proyección. No admite reinterpretación, reducción, extensión ni combinación de esos componentes.

### U12-P03 — Unicidad intersesión del tenant activo

La convergencia no permite que SaaS y Electron sostengan tenants activos distintos para la misma sesión conceptual. Pertenecer a varias Empresas sigue significando un único contexto activo a la vez, conforme MT-U11.

### U12-P04 — Neutralidad del cliente Electron

Electron es cliente de aplicación y no una autoridad de tenancy, autenticación, autorización, lifecycle, comercial, fiscalidad, límites o plataforma. Su presencia no habilita una excepción al aislamiento ni una segunda fuente de verdad.

### U12-P05 — Lifecycle no derivable

La convergencia de contexto no afirma que la Empresa esté habilitada para una operación. `Empresa.estado` conserva su autoridad independiente sobre acceso y conservación; una sesión de aplicación no revalida ni sustituye esa decisión.

### U12-P06 — Aislamiento preservado por contexto único

Toda representación de una sesión convergente se acota a la Empresa activa. No hereda ni mezcla datos, roles, permisos, configuración, fiscalidad, snapshots, ledger, consumo, cuotas, evaluación o enforcement de otras Empresas.

### U12-P07 — Independencia del mecanismo

La convergencia es un contrato conceptual y no presupone mecanismo de autenticación, token, refresco, IPC, sincronización, navegación, estado local, almacenamiento, API, regla, middleware, proceso ni infraestructura.

### U12-P08 — Autoridad de plataforma separada

Un operador SaaS, Panel SaaS, soporte o impersonación conservan las fronteras de MT-U9. Electron no convierte esas autoridades en membresía tenant, contexto activo o acceso a una Empresa.

## U12.5 Fronteras del dominio

| Frontera | Debe preservarse | Fuera de MT-U12 |
|---|---|---|
| Sesión SaaS ↔ Electron | Electron representa un contexto SaaS convergente; no crea una sesión SaaS independiente. | Mecanismo de traspaso, autenticación o sincronización. |
| Backend ↔ cliente | Backend y autoridades canónicas conservan decisiones privilegiadas. | Privilegios de cliente, protocolos, APIs o middleware. |
| Contexto ↔ implementación | Contexto activo y convergencia son semánticos. | Persistencia, modelo físico, caché, IPC o algoritmo. |
| Tenant ↔ plataforma | Empresa es aislamiento; plataforma no es membresía. | Acceso tenant por rol de plataforma. |
| Identidad ↔ sesión | Identidad es global; sesión contextualiza una Empresa. | Duplicar identidad, credenciales o perfiles por cliente. |
| Sesión ↔ autenticación | Autenticación identifica conforme a su autoridad; convergencia representa contexto. | Diseño técnico de login, tokens, refresh o revocación. |
| Sesión ↔ lifecycle | Contexto no gobierna acceso ni conservación. | Transiciones, matriz de acceso o regularización. |
| Sesión ↔ MT-U10 | Límites son propios de cada Empresa y no determinan contexto. | Uso de consumo/cuotas como autorización o selector tenant. |

## U12.6 Invariantes arquitectónicas

- **U12-I01 — Convergencia no sustitutiva:** una sesión de aplicación convergente no sustituye identidad, membresía, contexto activo, claims, lifecycle ni backend.
- **U12-I02 — Correspondencia de contexto:** convergencia exige misma identidad global, membresía aplicable, Empresa activa única y proyección de tenant/rol que la sesión SaaS correspondiente.
- **U12-I03 — Tenant único:** no existen tenants activos divergentes ni contextos compuestos entre sesión SaaS y sesión de aplicación.
- **U12-I04 — Membresía canónica:** Electron no crea, modifica ni reemplaza la membresía como autoridad de rol, permisos y estado tenant.
- **U12-I05 — Claims no reinterpretados:** el cliente no escribe, amplía ni interpreta claims como membresía, lifecycle, catálogo de Empresas o privilegio cross-tenant.
- **U12-I06 — Lifecycle preservado:** la convergencia no cambia `Empresa.estado`, acceso, conservación ni transiciones; ningún estado de aplicación sustituye lifecycle.
- **U12-I07 — Aislamiento intertenant:** una sesión convergente no hereda, combina, consulta ni infiere datos, permisos o contratos de otra Empresa.
- **U12-I08 — Cliente no autoritativo:** Electron y el cliente no definen Empresa, `empresaId`, rol, permiso, fiscalidad, comercial, límite, consumo, evaluación ni enforcement.
- **U12-I09 — Plataforma separada:** convergencia no convierte operador, Panel, soporte o impersonación en membresía tenant o contexto activo.
- **U12-I10 — Sin mecanismo implícito:** los invariantes no prescriben IPC, ventanas, navegación, tokens, refresh, autenticación técnica, sincronización, almacenamiento, APIs, reglas, funciones, middleware, algoritmos ni infraestructura.

## U12.7 Dependencias certificadas

- **Documento Maestro:** MT-U12 es la convergencia Electron con sesión SaaS; Empresa continúa como frontera de aislamiento, el cliente no elige libremente `empresaId` y Electron no es canal multiempresa antes de esta unidad.
- **MT-U3:** aislamiento tenant, helper, planes, Suscripción y lifecycle mantienen sus responsabilidades; la sesión de aplicación no es una excepción a ellas.
- **MT-U5B y ADR-SAAS-002/006:** identidad global y membresía canónica permanecen separadas; la incorporación no es responsabilidad de Electron ni de convergencia.
- **MT-U9:** operadores, Panel, auditoría, soporte e impersonación siguen en plano plataforma y no se convierten en contexto tenant.
- **MT-U10:** contrato, consumo, períodos, evaluación y enforcement se preservan por Empresa; no migran al cliente ni deciden sesión.
- **MT-U11:** contexto activo, tenant activo singular, membresía y cambio conceptual de tenant son la fuente directa de este contrato; MT-U12 solo exige su representación coherente.
- **ADR-SAAS-001, 003, 004, 007, 008, 009 y 010:** tenancy, lifecycle, Empresa, bootstrap, fiscalidad, snapshots y ledger no se modifican.
- **MASTER-SECURITY-PLAN:** autoridad server-side, mínima autoridad, `tenantId`/rol no controlables por cliente, deny-by-default y protección de secretos/datos conservan su carácter obligatorio.

## U12.8 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contrato que lo contiene |
|---|---|---|
| Duplicidad de contexto | Electron y SaaS representan contextos activos incompatibles. | U12-P02/P03, U12-I02/I03. |
| Divergencia de tenant activo | Operación o consulta bajo una Empresa distinta de la sesión SaaS. | U12-P03, U12-I03/I07. |
| Claims reinterpretados por cliente | Privilegios cross-tenant, lifecycle obsoleto o catálogo de membresías implícito. | U12-I05 y U12-P05. |
| Estado local tratado como autoridad | El cliente define tenant, rol, permiso o lifecycle. | U12-P04/P07, U12-I08/I10. |
| Pertenencia multiempresa tratada como operación simultánea | Contexto compuesto, datos mezclados o permisos acumulados. | U12-P03/P06, U12-I03/I07. |
| Electron tratado como backend | Bypass de membresía, lifecycle o controles canónicos. | U12-P01/P04, U12-I01/I04/I06/I08. |
| Plataforma convertida en tenant por convergencia | Operador o Panel obtiene acceso a Empresa sin membresía o excepción autorizada. | U12-P08, U12-I09. |
| MT-U10 usado como contexto de sesión | Límites o consumo conceden acceso o seleccionan Empresa. | U12.5 y U12-I08. |
| Mecanismo técnico sustituye contrato | Una implementación reinterpreta autoridades o aislamiento. | U12-P07, U12-I10. |

## U12.9 Criterios de aceptación

MT-U12 está arquitectónicamente completo cuando:

1. define sesión SaaS, contexto activo, sesión de aplicación y convergencia sin crear nuevas autoridades;
2. establece que una sesión Electron válida solo representa el mismo contexto activo ya definido por SaaS;
3. preserva identidad global, membresía canónica, tenant activo singular, claims proyectados y lifecycle canónico;
4. impide contextos duplicados, divergentes, compuestos o con herencia intertenant;
5. mantiene Electron y el cliente como superficies no autoritativas, sin privilegios de backend o plataforma;
6. conserva separación entre tenant, plataforma, soporte, Panel SaaS, fiscalidad, MT-U10 y lifecycle;
7. no diseña React, Next.js, IPC, ventanas, navegación, almacenamiento local, SQLite, IndexedDB, caché, Firestore, Cloud Functions, APIs, middleware, sincronización, tokens, autenticación técnica, persistencia, modelos físicos, algoritmos ni implementación;
8. demuestra coherencia con Documento Maestro, MT-U3, MT-U5B, MT-U9, MT-U10, MT-U11, ADR-SAAS-001 a ADR-SAAS-010 y MASTER-SECURITY-PLAN.

## U12.10 Cierre conceptual

MT-U12 concluye la arquitectura conceptual de la sesión SaaS y su convergencia con Electron. Preserva todas las autoridades previamente aprobadas y no habilita implementación. Cualquier diseño futuro deberá construir sus mecanismos respetando este contrato arquitectónico, sin reinterpretar ni sustituir las autoridades de identidad, membresía, contexto activo, claims, lifecycle, plataforma, fiscalidad, límites o aislamiento tenant establecidas por el programa.
> **Estado histórico:** este documento queda supersedido por la decisión Web/PWA-only de retiro de Electron. Se conserva como registro arquitectónico; no autoriza ni mantiene una distribución Electron.
