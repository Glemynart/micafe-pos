# MT-U11 — Multiempresa por usuario y cambio de tenant activo

> **Estado:** especificación arquitectónica para revisión.
> **Alcance:** pertenencia multiempresa, tenant activo y contexto de sesión conceptual.
> **Precondición:** MT-U3, MT-U5B, MT-U9 y MT-U10 aprobadas. Este documento no modifica sus autoridades ni define implementación.

## Autoridad y propósito

MT-U11 define el modelo conceptual que permite que una identidad SaaS global pertenezca a varias Empresas y opere, en cada momento, bajo el contexto de una sola Empresa activa. Su propósito es conservar el aislamiento fuerte de Empresa mientras se habilita pertenencia multiempresa sin duplicar identidad, membresía, lifecycle ni autorización.

La jerarquía aplicable es: ADR SaaS aceptados, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, MT-U3, MT-U5B, MT-U9, MT-U10 y `MASTER-SECURITY-PLAN.md`. Ante conflicto, prevalece esa jerarquía. MT-U11 es exclusivamente conceptual: no define interfaz, navegación, tokens, renovación de sesión, APIs, persistencia, reglas, middleware, algoritmos, sincronización, Electron ni mecanismos técnicos de cambio de contexto.

## U11.1 Alcance y exclusiones

MT-U11 establece:

- la relación entre una identidad global y sus múltiples membresías tenant;
- el significado de tenant activo y contexto de sesión;
- las condiciones conceptuales para cambiar de tenant activo;
- la proyección de contexto en claims sin convertirla en autoridad de membresía o lifecycle;
- las fronteras, principios, invariantes, riesgos y criterios de aceptación de multiempresa por usuario.

Quedan expresamente fuera:

- selector de Empresa, pantallas, UX, navegación, componentes o React;
- autenticación operativa por código + PIN, incorporación `DIRECTA`/`EMAIL`, credenciales o identidad técnica;
- mecanismos de emisión, renovación, refresco, revocación o contenido técnico de tokens;
- APIs, Cloud Functions, Firestore, reglas, middleware, persistencia, modelos físicos, algoritmos o sincronización;
- Electron y cualquier canal de convergencia de sesión reservado para MT-U12;
- lifecycle, comercial, planes, consumo, cuotas, límites, evaluación, enforcement de MT-U10, fiscalidad, bootstrap, onboarding, soporte, impersonación, Panel SaaS y comandos administrativos.

## U11.2 Modelo conceptual

### Identidad SaaS global

La identidad SaaS es única, global, estable y reutilizable entre Empresas. No contiene rol, permisos, estado tenant ni una Empresa activa persistente. Un usuario global no se replica ni se convierte en una identidad distinta por cada Empresa a la que pertenece.

La autenticación operativa por Empresa, incluido el mecanismo vigente código + PIN, conserva su contrato en MT-U5A/MT-U5B y ADR-SAAS-002/006. MT-U11 no lo reemplaza, extiende ni condiciona.

### Membresía tenant

Una membresía es la relación canónica entre una identidad global y una Empresa. Sigue siendo la única autoridad de rol, permisos efectivos y estado de esa persona dentro de esa Empresa. Una identidad puede tener múltiples membresías, cada una independiente y limitada a su Empresa correspondiente.

La pertenencia a una Empresa no se deduce de `ownerUid`, Suscripción, Plan, operador SaaS, soporte, consumo, UI ni de una identidad global por sí sola. La existencia o activación de una membresía continúa bajo los contratos de MT-U5B, ADR-SAAS-006 y las autoridades tenant aprobadas.

### Tenant activo

El **tenant activo** es la única Empresa cuyo contexto tenant está proyectado para una sesión determinada. Es una selección de contexto, no una identidad, rol global, membresía adicional, estado de lifecycle ni autorización independiente.

En una sesión tenant solo puede existir un tenant activo. Pertenecer a varias Empresas no crea un contexto compuesto ni habilita lectura, escritura, consulta o inferencia simultánea entre ellas.

### Contexto activo

El **contexto activo** es la abstracción arquitectónica superior que representa el contexto operativo completo de una sesión tenant: identidad SaaS global, membresía aplicable, Empresa activa y su proyección de tenant activo y rol. No es una nueva autoridad ni sustituye sus componentes; los agrupa conceptualmente para razonar sobre una operación bajo una sola Empresa.

El contexto activo permanece separado de identidad, membresía, Empresa, lifecycle y claims: la identidad sigue siendo global; la membresía conserva autoridad tenant; la Empresa conserva lifecycle; y los claims continúan como proyección. El contexto de sesión tenant es la manifestación conceptual del contexto activo en una sesión determinada.

### Contexto de sesión tenant

El **contexto de sesión tenant** es la asociación conceptual entre:

```text
Identidad SaaS global
  ↓ membresía válida en una Empresa
Empresa activa única
  ↓ proyección de contexto
Claims de tenant activo y rol proyectado
```

Este contexto no sustituye sus componentes:

- la identidad global sigue siendo identidad, no autorización tenant;
- la membresía conserva rol, permisos efectivos y estado tenant;
- la Empresa y su estado canónico conservan lifecycle, acceso y conservación;
- los claims siguen siendo proyección del tenant activo y del rol proyectado, no fuente de membresía ni lifecycle.

## U11.3 Relación de autoridades

| Concepto | Autoridad canónica | Relación de MT-U11 | No decide |
|---|---|---|---|
| Identidad global | Firebase Auth y perfil global bajo ADR-SAAS-002 | Puede relacionarse con varias membresías. | Rol, permisos, estado o tenant activo persistente. |
| Membresía | Relación usuario–Empresa bajo MT-U5B/ADR-SAAS-006 | Habilita conceptualmente que esa Empresa pueda ser contexto activo para esa identidad. | Lifecycle de Empresa, comercial o pertenencia a otra Empresa. |
| Tenant activo | Claims emitidos por backend, según Maestro y ADR-SAAS-009 | Proyecta una sola Empresa y rol para la sesión. | Membresía canónica, lifecycle, fiscalidad o autorización de plataforma. |
| Empresa y lifecycle | `Empresa.estado` y servicio canónico | Determina compatibilidad de acceso y conservación de la Empresa activa. | Rol, permisos de membresía o selección de otra Empresa. |
| Plataforma SaaS | Operadores, facultades y auditoría de MT-U9 | Permanece separada del contexto tenant. | Membresía de restaurante o tenant activo por rol de plataforma. |
| MT-U10 | Contratos de consumo y límites | Se interpreta dentro de una Empresa activa ya autorizada. | Pertenencia multiempresa, cambio de contexto o autorización. |

## U11.4 Cambio conceptual de tenant activo

El **cambio de tenant activo** es la transición conceptual desde un contexto tenant actual a otro contexto tenant de la misma identidad global. No cambia quién es la persona ni modifica sus membresías, roles, permisos, estados, Empresas, Suscripciones, Planes, lifecycle, datos tenant ni condiciones de MT-U10.

Para que una Empresa pueda ser el nuevo tenant activo, el modelo exige conceptualmente que:

1. la identidad global tenga una membresía válida en esa Empresa;
2. esa membresía sea la autoridad aplicable de rol, permisos y estado tenant;
3. el contexto resultante proyecte solo esa Empresa y el rol correspondiente, sin conservar facultades tenant del contexto anterior; y
4. el contexto resultante no afirme ni sustituya la compatibilidad de lifecycle: `Empresa.estado` la decide de forma independiente para el acceso y conservación que correspondan.

Estas condiciones son contratos de consistencia, no pasos de proceso, API, algoritmo, mecanismo de emisión ni diseño de tokens. La selección de una Empresa por parte de un cliente, interfaz o actor no es suficiente por sí sola para crear autoridad: la membresía y el lifecycle ya aprobados siguen siendo las fuentes canónicas.

## U11.5 Principios arquitectónicos

### U11-P01 — Identidad una, pertenencias múltiples

Una persona conserva una identidad SaaS global y puede tener múltiples membresías, sin duplicar principal, perfil, contraseña, PIN ni autoridad tenant. Cada membresía conserva alcance exclusivo de una Empresa.

### U11-P02 — Empresa activa singular

El contexto tenant de una sesión se asocia a una sola Empresa activa. Multiempresa significa selección de un contexto tenant a la vez, no agregación de tenants, permisos o datos.

### U11-P03 — Membresía como autoridad no sustituible

El tenant activo solo puede proyectar el contexto de una membresía válida. Claims, identidad global, ownerUid, Suscripción, Plan, consumo, operador de plataforma, soporte o interfaz no reemplazan ni fabrican esa autoridad.

### U11-P04 — Claims como proyección limitada

Los claims identifican el tenant activo y el rol proyectado de la sesión, conforme al Maestro y ADR-SAAS-009. No son un catálogo de todas las membresías, no prueban lifecycle, no son una base de privilegios cross-tenant y no sustituyen la membresía canónica.

### U11-P05 — Lifecycle precedente

El estado canónico de la Empresa sigue precediendo el acceso y la conservación. Un cambio de tenant no reactiva, regulariza, suspende, archiva, elimina ni modifica una Empresa; tampoco hace suficiente un claim que permanezca proyectado después de una transición.

### U11-P06 — Aislamiento sin herencia de contexto

Al cambiar el tenant activo no se heredan rol, permisos, datos, espacios, configuración, fiscalidad, numeración, snapshots, ledger, consumo, cuota, evaluación ni enforcement de la Empresa anterior. La Empresa nueva se interpreta exclusivamente bajo su propia membresía, lifecycle y contratos.

### U11-P07 — Plataforma separada del tenant

La autoridad de operador SaaS, Panel SaaS, auditoría, soporte e impersonación de MT-U9 no se convierte en membresía ni tenant activo. Un operador solo opera una Empresa con membresía explícita o la excepción de soporte ya autorizada y auditada; MT-U11 no crea otra excepción.

### U11-P08 — Neutralidad de mecanismo

El cambio de contexto es un contrato conceptual. No presupone interfaz, navegación, token, refresco de sesión, API, middleware, regla, persistencia, algoritmo, sincronización ni Electron.

### U11-P09 — Determinismo del contexto activo

Para una misma identidad global, la misma membresía seleccionada y el mismo estado canónico de la Empresa, el contexto activo representa siempre el mismo significado arquitectónico. Este determinismo no depende de interfaz, implementación, contexto operativo ni mecanismo técnico futuro.

## U11.6 Fronteras del dominio

| Frontera | Debe preservarse | No corresponde a MT-U11 |
|---|---|---|
| Identidad global ↔ membresía | Identidad puede pertenecer a varias Empresas; cada membresía es autoridad local a una Empresa. | Duplicar identidades o convertir perfil global en permisos. |
| Membresía ↔ tenant activo | Membresía habilita contexto; tenant activo es su proyección única de sesión. | Reemplazar estado o permisos de membresía con claims. |
| Tenant activo ↔ lifecycle | Claims sitúan contexto; Empresa.estado gobierna acceso y conservación. | Reactivar o regularizar Empresa desde cambio de contexto. |
| Tenant anterior ↔ tenant nuevo | No se conserva autoridad, dato ni permiso tenant entre contextos. | Contexto compuesto, herencia o consultas cruzadas. |
| Tenant ↔ plataforma | Operador SaaS y Panel no son membresía tenant. | Acceso restaurante por rol de plataforma. |
| Tenant ↔ soporte | Soporte/impersonación conservan excepción B4 de MT-U9. | Tratar cambio de tenant como soporte o bypass. |
| Tenant ↔ MT-U10 | Límites y consumo continúan propios de cada Empresa. | Usar consumo/límite para seleccionar tenant o conceder acceso. |
| Tenant ↔ Electron | Electron permanece fuera hasta MT-U12. | Diseñar sincronización o sesión desktop multiempresa. |

## U11.7 Invariantes arquitectónicas

- **U11-I01 — Identidad global única:** una identidad SaaS puede tener múltiples membresías sin duplicarse por Empresa.
- **U11-I02 — Membresía canónica:** rol, permisos efectivos y estado tenant provienen exclusivamente de la membresía de la Empresa activa.
- **U11-I03 — Tenant activo singular:** una sesión tenant proyecta exactamente una Empresa activa y un rol correspondiente; no existe contexto tenant compuesto.
- **U11-I04 — Proyección no sustitutiva:** los claims proyectan tenant activo y rol, pero no sustituyen membresía ni `Empresa.estado`.
- **U11-I05 — Contexto por membresía y lifecycle independiente:** una Empresa solo puede ser tenant activo mediante membresía válida; el lifecycle canónico decide independientemente la compatibilidad de acceso y conservación. Ni la identidad global ni la selección de cliente bastan por sí solas.
- **U11-I06 — Sin herencia intertenant:** el cambio de contexto no transfiere rol, permisos, datos, configuración, fiscalidad, snapshots, ledger, consumo, cuota, evaluación, enforcement ni facultades entre Empresas.
- **U11-I07 — Lifecycle preservado:** cambiar tenant activo no modifica `Empresa.estado`, Suscripción, conservación ni transiciones empresariales.
- **U11-I08 — Autorización preservada:** cambiar tenant activo no crea membresías, permisos, claims de plataforma, facultades SaaS, soporte ni impersonación.
- **U11-I09 — Aislamiento de Empresa:** toda operación posterior al contexto activo sigue acotada a su Empresa y no infiere información de las demás membresías de la identidad.
- **U11-I10 — MT-U10 intacta:** cambio de tenant no altera dimensiones, referencia contractual, consumo, referencia de consumo, períodos, evaluación ni enforcement; cada Empresa conserva sus propios contratos de MT-U10.
- **U11-I11 — Sin mecanismo implícito:** estos invariantes no prescriben UI, token, refresco, API, almacenamiento, regla, middleware, algoritmo, sincronización ni Electron.
- **U11-I12 — Contexto activo no sustitutivo y determinista:** el contexto activo agrupa identidad, membresía, Empresa activa y proyección sin sustituir sus autoridades; bajo los mismos componentes canónicos conserva un único significado arquitectónico.

## U11.8 Dependencias certificadas

- **Documento Maestro:** Empresa como frontera de aislamiento; claims como tenant activo; identidad de dos capas; multiempresa por usuario como alcance de MT-U11; prohibición de Electron multiempresa antes de MT-U12.
- **MT-U3:** Plan, Suscripción, lifecycle y helper tenant continúan sin modificación; Suscripción no es autorización.
- **MT-U5B y ADR-SAAS-006:** membresía es autoridad runtime de rol, permisos y estado; una identidad puede tener membresías en varias Empresas; incorporación no activa no da contexto tenant.
- **ADR-SAAS-001 y 002:** aislamiento por empresa y claims; identidad global separada de pertenencia tenant; principal global reutilizable.
- **ADR-SAAS-003, 004 y 009:** Empresa/lifecycle, comercial, planos y enforcement canónico conservan responsabilidades distintas; claims no sustituyen lifecycle.
- **MT-U9:** plataforma, Panel, soporte e impersonación no adquieren autoridad tenant por MT-U11.
- **MT-U10:** límites, consumo, períodos, evaluación y enforcement permanecen internos a cada Empresa y no cambian el contexto tenant.
- **MASTER-SECURITY-PLAN:** tenant y rol no provienen de un campo escribible por cliente; aislamiento, mínima autoridad y denegación por defecto se preservan conceptualmente.

## U11.9 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención arquitectónica |
|---|---|---|
| Identidad global tratada como autoridad tenant | Acceso a Empresas sin membresía. | U11-P03, U11-I02/I05. |
| Claims tratados como membresía o lifecycle | Privilegios obsoletos o acceso tras cambio de estado. | U11-P04/P05, U11-I04/I07. |
| Contexto compuesto o herencia entre tenants | Fuga cross-tenant y permisos acumulados. | U11-P02/P06, U11-I03/I06/I09. |
| Pertenencia multiempresa interpretada como operación simultánea | Operación, lectura o autoridad acumulada sobre varias Empresas a la vez. | U11-P02/P06, U11-I03/I06/I09. |
| Selección de cliente tratada como autorización | Escalamiento de privilegios mediante `empresaId` elegido. | U11-I05 y dependencias de ADR-SAAS-001/SEC-017. |
| Operador SaaS tratado como miembro tenant | Bypass de plataforma ↔ tenant. | U11-P07, U11-I08. |
| Cambio de tenant usado para reactivar Empresa | Violación de lifecycle, conservación o seguridad. | U11-P05, U11-I07. |
| Mezclar MT-U10 con contexto de sesión | Límites o consumo usados como permisos o selector de Empresa. | U11-I10. |
| Introducir Electron o sincronización prematuramente | Ruptura de alcance y sesión multiempresa fuera de MT-U12. | U11-P08/U11-I11. |
| Divulgar pertenencias de una identidad sin necesidad | Exposición de relaciones tenant y superficie de enumeración. | U11-P02/P06, U11-I09 y mínima autoridad. |

## U11.10 Criterios de aceptación

MT-U11 está completo para revisión cuando:

1. distingue identidad SaaS global, membresía tenant, tenant activo, claims y lifecycle sin duplicar autoridad;
2. reconoce que una identidad puede pertenecer a múltiples Empresas mediante membresías independientes;
3. define tenant activo como contexto singular proyectado, no como identidad, rol global, estado, permiso ni dato persistente de usuario;
4. exige conceptualmente membresía válida para el contexto activo y preserva lifecycle como autoridad independiente de acceso y conservación;
5. preserva claims como proyección y membresía como autoridad de rol, permisos y estado tenant;
6. prohíbe herencia, composición o inferencia cross-tenant durante un cambio de contexto;
7. conserva separación entre tenant, plataforma, soporte, Panel SaaS, lifecycle, comercial, fiscalidad y MT-U10;
8. no diseña selector, UX, navegación, tokens, refresco, API, Cloud Functions, Firestore, reglas, middleware, persistencia, algoritmo, sincronización ni Electron;
9. define contexto activo como agrupación no sustitutiva y determinista de las autoridades existentes;
10. mantiene coherencia con Documento Maestro, MT-U3, MT-U5B, MT-U9, MT-U10, ADR-SAAS-001 a ADR-SAAS-010 y MASTER-SECURITY-PLAN.

## U11.11 Cierre conceptual

MT-U11 deja definido el contrato arquitectónico para pertenencia multiempresa y cambio de tenant activo: una identidad global puede tener varias membresías, pero cada sesión tenant opera bajo una sola Empresa proyectada y validada por las autoridades existentes. Las fases posteriores deberán construir sus mecanismos respetando este contrato arquitectónico y no podrán reinterpretar las autoridades establecidas por MT-U11. Este documento no habilita implementación ni altera ninguna decisión aprobada.
