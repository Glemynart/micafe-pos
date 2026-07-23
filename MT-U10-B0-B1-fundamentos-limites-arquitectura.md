# MT-U10 — U10-B0 y U10-B1: fundamentos y modelo conceptual de límites

> **Estado:** especificación arquitectónica para revisión.
> **Alcance:** fundamentos (U10-B0) y modelo conceptual de límites (U10-B1) de MT-U10.
> **Precondición:** MT-U3 y MT-U9 aprobadas. Este documento no modifica sus decisiones ni define implementación.

## Autoridad y propósito del documento

Este documento desarrolla únicamente los dos primeros bloques de MT-U10, la unidad de métricas de consumo y enforcement de límites definidos por planes. Es una especificación conceptual: fija el vocabulario, las fronteras y los invariantes que los bloques posteriores deberán respetar.

La jerarquía aplicable es: ADR SaaS aceptados, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, MT-U3, MT-U9 y `MASTER-SECURITY-PLAN.md`. Ante conflicto, prevalece esa jerarquía. En particular, ADR-SAAS-003 y ADR-SAAS-009 conservan la separación entre relación comercial y lifecycle; MT-U10 no la altera.

---

# U10-B0 — Fundamentos

## B0.1 Propósito

U10-B0 establece las bases para razonar de forma uniforme sobre límites comerciales definidos por planes, su eventual consumo y su futuro enforcement. Su fin es impedir que una dimensión de límites se convierta indebidamente en una autoridad de tenancy, de lifecycle, de fiscalidad o de autorización.

No decide qué dimensiones se comercializan, cómo se observan, cuánto valen, cuándo vencen ni cuál es la reacción operativa ante un exceso.

## B0.2 Alcance

Este bloque define:

- la relación conceptual entre Empresa, Suscripción, Versión de Plan y conjunto de límites;
- la separación de responsabilidades entre oferta comercial, relación comercial, lifecycle y límites;
- los principios, fronteras, dependencias e invariantes que condicionan los bloques posteriores de MT-U10;
- las exclusiones expresas que evitan anticipar medición o enforcement.

No define agregados, colecciones, rutas, esquemas, APIs, procesos, comandos, reglas, funciones, interfaces ni mecanismos de cálculo.

## B0.3 Objetivos arquitectónicos

1. Preservar la Empresa como unidad de aislamiento y contexto de toda consecuencia de un límite.
2. Preservar el Plan y su Versión como descripción global y versionada de la oferta, sin convertirlos en autorización tenant.
3. Preservar la Suscripción 1:1 con Empresa como relación comercial que determina la referencia contractual aplicable.
4. Hacer posible añadir dimensiones futuras sin reinterpretar retrospectivamente condiciones ya contratadas.
5. Mantener separados el modelo de consumo, el lifecycle empresarial, la fiscalidad, los snapshots históricos y la autorización de usuarios.
6. Permitir que bloques posteriores definan medición y enforcement en profundidad sin que la UI ni una proyección transitoria se conviertan en autoridad canónica.

## B0.4 Relación con las autoridades existentes

Una **referencia contractual** es la abstracción que identifica las condiciones comerciales aplicables a una Suscripción. Conforme al modelo aprobado en MT-U3, puede materializarse mediante una Versión de Plan o mediante un Snapshot contractual. La abstracción no cambia las autoridades existentes ni decide su representación; solo permite razonar de forma uniforme sobre las condiciones contratadas.

| Concepto | Autoridad ya aprobada | Relación de MT-U10 | No es autoridad de MT-U10 |
|---|---|---|---|
| Empresa | Empresa y su estado canónico | Es el sujeto al que puede aplicar un conjunto de límites. | El límite no crea, elimina ni cambia la Empresa. |
| Plan | Oferta comercial global y versionada | Puede declarar el conjunto conceptual de límites y capacidades de su versión. | No concede acceso tenant ni opera datos tenant directamente. |
| Referencia contractual | Versión de Plan o Snapshot contractual, según MT-U3 | Determina las condiciones comerciales aplicables sin cambios silenciosos posteriores. | No mide ni aplica por sí misma el consumo. |
| Suscripción | Relación comercial 1:1 con Empresa | Vincula la Empresa con la referencia contractual contratada. | No reemplaza el lifecycle ni la membresía. |
| Lifecycle | `Empresa.estado` y servicio único de lifecycle | Precede cualquier consecuencia interactiva: acceso y conservación permanecen bajo lifecycle. | No se deduce del uso, saldo o exceso de un límite. |
| Membresía y claims | Identidad, rol y tenant activo | Determinan quién actúa y en qué tenant. | No definen el plan contratado ni convierten al usuario en autoridad comercial. |
| Fiscalidad y snapshots | Autoridades fiscales y evidencia histórica | Permanecen fuera de la semántica mutable de límites. | Un límite no altera numeración, emisión ni evidencia histórica. |

## B0.5 Principios arquitectónicos

### B0-P01 — Empresa como sujeto, no como dimensión global

Toda conclusión conceptual sobre un límite se refiere a una Empresa determinada y nunca habilita inferencia, lectura o efecto entre empresas. La identidad de una Empresa no se deriva de un plan, una métrica, un actor de plataforma ni de datos aportados libremente por cliente.

### B0-P02 — Oferta versionada; condiciones contratadas estables

Un Plan describe una oferta global versionada. Para una Empresa, las condiciones aplicables se resuelven desde la referencia contractual que su Suscripción conserva como contratada. Modificar una oferta posterior no cambia silenciosamente el conjunto de límites aplicable a una Suscripción existente.

### B0-P03 — Límite no equivale a lifecycle

El lifecycle empresarial conserva en exclusiva la decisión sobre acceso y conservación. Una condición comercial, un límite o un eventual exceso pueden ser información o entrada para procesos autorizados posteriores, pero no son una transición de `Empresa.estado` ni una sustitución de su autoridad.

### B0-P04 — Límite no equivale a autorización

Los límites describen condiciones de la oferta aplicable a una Empresa; no conceden identidad, membresía, rol, contexto de tenant, facultad de operador ni permiso para actuar. La autorización se resuelve por las autoridades ya aprobadas antes de que un bloque posterior evalúe una condición de límite.

### B0-P05 — Separación entre definición, observación y consecuencia

La definición comercial de un límite, la observación de consumo y la consecuencia de una condición son responsabilidades conceptualmente distintas. B0 solo fija la primera como parte de la oferta contratada y reserva las otras para bloques posteriores; no permite que una proyección de cualquiera de ellas reemplace a las demás.

### B0-P06 — Sin retroactividad silenciosa

Los límites no pueden reinterpretar hechos fiscales, snapshots, ledger, ventas u otra evidencia histórica. Tampoco se aplican vencimientos o límites retroactivos a la empresa fundacional asociada al plan grandfathered, salvo decisión comercial futura explícita fuera de este bloque.

### B0-P07 — Extensibilidad sin compromiso prematuro

El modelo admite dimensiones abiertas y futuras, pero esta capacidad no declara ninguna dimensión monetizada, umbral, período, precio, métrica o política de cobro concreta.

### B0-P08 — Defensa en profundidad futura, no autoridad de interfaz

El Documento Maestro y ADR-SAAS-003 anticipan que el enforcement de límites, cuando exista, deberá ser coherente en capas. Esta anticipación no convierte UI, cliente, claims ni una vista de plataforma en autoridad de límites; B0 no define aún el proceso ni los puntos de aplicación.

### B0-P09 — Contrato comercial independiente de infraestructura

Los límites describen capacidades comerciales contratadas, no capacidades técnicas de infraestructura. Ninguna capacidad técnica disponible se interpreta automáticamente como una dimensión comercial, una cuota, un límite o una funcionalidad contratada. El contrato y su implementación permanecen arquitectónicamente independientes.

## B0.6 Separación entre modelo comercial y modelo de consumo

El modelo comercial responde qué condiciones fueron contratadas por una Empresa: la Suscripción vincula la Empresa con la referencia contractual aplicable, y esta describe las capacidades y límites de la oferta. Sus estados y fechas continúan siendo los de la relación comercial ya aprobada.

El modelo de consumo responde, en bloques posteriores, cuál es la observación atribuible a una dimensión para esa Empresa bajo condiciones aplicables. No es una fuente de precios, facturación, cambio de plan, estado de Suscripción ni autorización.

Por tanto, ninguno de estos sentidos se infiere del otro:

- tener consumo no adopta cobro por uso;
- una cuota no define precio ni produce una factura;
- una Suscripción activa no anula el lifecycle ni autoriza el exceso de una condición futura;
- una condición de límite no cambia por sí misma el estado comercial;
- un Plan sin límite en una dimensión no tiene enforcement para esa dimensión, conforme ADR-SAAS-003.

## B0.7 Separación entre lifecycle y límites

`Empresa.estado` gobierna acceso y conservación; solo el servicio de lifecycle autorizado puede efectuar sus transiciones. MT-U10 no define un nuevo estado empresarial, una variante de suspensión, una gracia, una retención ni una restauración.

Los límites pueden describir condiciones comerciales aplicables a una Empresa en estados donde el lifecycle permita operación, pero no amplían los estados que permiten escribir ni reducen las garantías de conservación. En especial, un límite no habilita operar una Empresa suspendida, cancelada, archivada o eliminada, ni convierte una Suscripción en autorización canónica.

## B0.8 Fronteras del dominio

| Frontera | Debe preservarse | Queda fuera de B0 |
|---|---|---|
| Plataforma ↔ tenant | La oferta es global; toda aplicación conceptual de condiciones se acota a una Empresa. | Acceso transversal a datos tenant, panel o soporte. |
| Comercial ↔ lifecycle | La Suscripción describe contrato; Empresa gobierna acceso y conservación. | Transiciones, gracia o políticas de suspensión. |
| Límite ↔ autorización | Límite no es rol, claim, membresía ni facultad. | Evaluación de identidad o permisos. |
| Límite ↔ fiscalidad | Las condiciones comerciales no mutan autoridad fiscal ni evidencia histórica. | Numeración, emisión, snapshots o ledger. |
| Definición ↔ medición | Una condición contratada no es una observación de uso. | Contadores, períodos de medición, cálculo o reconciliación. |
| Definición ↔ enforcement | Definir una condición no decide cómo ni cuándo se aplica. | Bloqueos, denegaciones, avisos o excepciones. |

## B0.9 Dependencias certificadas

- Del Documento Maestro: Empresa como aislamiento, Plan global versionado, Suscripción 1:1, plan grandfathered, separación de planos y alcance de MT-U10.
- De MT-U3: las autoridades de Plan, referencia contractual (Versión de Plan o Snapshot contractual), Suscripción y lifecycle ya aprobadas.
- De MT-U9: operadores, comandos y Panel SaaS no adquieren una autoridad comercial o tenant adicional por MT-U10; cualquier actuación futura conserva las facultades y auditoría aprobadas.
- De ADR-SAAS-001, 002, 004 y 006: tenancy, identidad, claims y membresías mantienen sus responsabilidades propias.
- De ADR-SAAS-003 y 009: separación comercial/lifecycle y la reserva de un enforcement de límites propio, distinto del enforcement canónico de lifecycle.
- De ADR-SAAS-008 y 010: integridad de numeración, fiscalidad, snapshots y ledger, que no son modificables por condiciones de límites.
- Del MASTER-SECURITY-PLAN: aislamiento por tenant, mínima autoridad, control de abuso y no confianza en entradas de cliente permanecen obligatorios para cualquier desarrollo posterior.

## B0.10 Exclusiones expresas de MT-U10 B0

Este bloque no define ni autoriza:

- dimensiones concretas, precios, cobro por uso, pasarela, facturación o cambios de plan;
- medición, cálculo, agregación, períodos de consumo, conciliación, proyecciones o almacenamiento de consumo;
- evaluación operativa, enforcement, bloqueo, denegación, modo degradado, aviso, excepción, período de gracia o remediación;
- bootstrap, onboarding, aprovisionamiento, configuración de empresa o migración de la empresa fundacional;
- Panel SaaS, comandos administrativos, soporte, impersonación, UI, API, reglas, funciones o implementación;
- cambios de lifecycle, comercial, membresía, claims, fiscalidad, snapshots, ledger, retención o eliminación;
- alcance de MT-U11 o MT-U12.

## B0.11 Invariantes arquitectónicas de B0

- **U10-B0-I01 — Aislamiento:** toda condición aplicable se interpreta dentro de una Empresa; nunca agrega autoridad ni visibilidad cross-tenant.
- **U10-B0-I02 — Contrato estable:** la referencia contractual de la Suscripción es la referencia de condiciones aplicables; una edición posterior de oferta no las reescribe silenciosamente.
- **U10-B0-I03 — Suscripción distinta de lifecycle:** ninguna condición de límites cambia por sí sola `Empresa.estado`, y el estado de Suscripción no sustituye el lifecycle.
- **U10-B0-I04 — Sin nueva autoridad:** MT-U10 no crea roles, perfiles, facultades, actores, comandos ni rutas de soporte.
- **U10-B0-I05 — Autorización preservada:** límite, cuota, consumo y capacidad no sustituyen identidad, claims, membresía ni facultades de plataforma.
- **U10-B0-I06 — Integridad histórica:** ningún límite altera evidencia fiscal, snapshots, ledger, numeración ni datos históricos.
- **U10-B0-I07 — Fundacional:** la empresa fundacional conserva el plan grandfathered sin límites ni vencimientos retroactivos.
- **U10-B0-I08 — Sin semántica implícita:** una dimensión no declarada por la oferta contratada no tiene límite ni enforcement para esa dimensión.

## B0.12 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención de B0 |
|---|---|---|
| Tratar uso como estado de lifecycle | Bloqueos o conservación indebidos. | Separación explícita de autoridades. |
| Usar Plan vigente en vez de referencia contractual | Cambio retroactivo de condiciones. | Estabilidad contractual por Suscripción. |
| Convertir límite en permiso | Escalamiento de privilegios o fuga tenant. | Límite no es autorización. |
| Mezclar uso con facturación o precios | Acoplamiento comercial prematuro. | Exclusión de monetización concreta. |
| Aplicar límites a datos fiscales históricos | Pérdida de integridad probatoria. | Inmutabilidad de snapshots y ledger. |
| Exponer una dimensión no delimitada | Lecturas o efectos cross-tenant. | Empresa como sujeto y aislamiento obligatorio. |
| Introducir enforcement en B0 | Reabrir decisiones y ocultar política no aprobada. | Reserva expresa para bloque posterior. |

## B0.13 Criterios de aceptación

B0 está completo cuando:

- distingue con precisión Empresa, Plan, Versión de Plan, Suscripción y lifecycle;
- declara que el modelo comercial y el de consumo son distintos;
- preserva la referencia contractual y el grandfathering fundacional;
- no convierte una condición comercial en autorización o transición de lifecycle;
- deja medición y enforcement fuera de este bloque;
- no introduce almacenamiento, UI, API, reglas, funciones, procesos, comandos ni nuevas autoridades;
- es consistente con MT-U3, MT-U9, ADR-SAAS-001 a ADR-SAAS-010 y el MASTER-SECURITY-PLAN.

---

# U10-B1 — Modelo conceptual de límites

## B1.1 Propósito y precondición

U10-B1 define el lenguaje y las relaciones conceptuales de los límites que una referencia contractual puede declarar. Se construye exclusivamente sobre B0: no añade una autoridad ni define cómo se mide, evalúa o hace cumplir una condición.

## B1.2 Conceptos normativos

| Concepto | Definición conceptual | No significa |
|---|---|---|
| **Dimensión** | Unidad conceptual sobre la cual una referencia contractual puede declarar capacidades, cuotas o límites. | Una implementación, un recurso técnico o una métrica por sí misma. |
| **Límite** | Condición declarada para una dimensión de la oferta contratada que acota, habilita o reserva una capacidad bajo semántica explícita. | Un permiso de usuario, un estado de Empresa, una medición o un bloqueo. |
| **Cuota** | Expresión asignada de una cantidad disponible o admisible dentro de una dimensión cuya semántica cuantitativa y temporal haya sido declarada. | Precio, facturación, período de gracia o consumo observado. |
| **Consumo** | Observación atribuible a una Empresa respecto de una dimensión bajo las condiciones aplicables. | La definición de un límite, una autorización o una decisión de lifecycle. |
| **Capacidad** | Aptitud que la oferta contratada declara disponible para una Empresa; puede estar acotada por un límite o ser no acotada. | Acceso de un usuario, facultad de operador o dato fiscal. |
| **Disponibilidad de funcionalidad** | Condición de oferta que indica si una funcionalidad pertenece o no a la capacidad contratada. | Rol, permiso tenant, implementación de interfaz o garantía de acceso fuera del lifecycle. |
| **Enforcement** | Aplicación futura y coherente de una condición de límite en los puntos autorizados de la arquitectura. | La definición misma del límite, una transición de lifecycle o una decisión de B1. |

La palabra **disponibilidad** se limita aquí a la oferta contratada. El acceso efectivo de una sesión sigue condicionado por identidad, membresía, autorización y lifecycle; una funcionalidad disponible comercialmente no habilita actuar cuando esas autoridades lo prohíben.

## B1.3 Clasificación conceptual de límites

La clasificación establece formas semánticas, no un catálogo de productos, métricas ni valores. Sus clases son conceptualmente ortogonales: una misma dimensión puede participar conceptualmente en varias clases sin que ello implique ambigüedad. Cada dimensión conserva, no obstante, una única semántica contractual; B1 no define reglas de combinación entre clases.

| Clase | Descripción | Límite de esta definición |
|---|---|---|
| **Cuantitativo** | Declara una cuota expresada como cantidad para una dimensión definida. | No fija cómo se observa, acumula, reinicia ni aplica esa cantidad. |
| **De capacidad** | Declara que una capacidad de la oferta está acotada, sin asumir que toda capacidad se representa como contador. | No crea recursos, espacios, usuarios ni configuraciones. |
| **Temporal** | Declara que la vigencia o disponibilidad de una condición depende de una referencia temporal contractualmente definida. | No fija duración de trial, gracia, renovación, vencimiento ni transiciones. |
| **Por funcionalidad** | Declara que una funcionalidad pertenece o no a la oferta contratada. | No concede rol, permiso ni acceso efectivo a un actor. |
| **Ilimitado** | Declara de forma explícita que una dimensión no tiene tope bajo la oferta contratada. | No implica que la dimensión no tenga controles de seguridad, lifecycle o integridad. |
| **Reservado para evolución futura** | Identifica una clase de condición cuya semántica aún no se declara y que no produce efecto hasta ser definida y contratada expresamente. | Una licencia para interpretar valores o imponer restricciones implícitas. |

Las clases pueden coexistir conceptualmente en un conjunto de límites, pero cada dimensión debe tener una semántica inequívoca. B1 no define dimensiones concretas ni determina cuáles se utilizarán.

## B1.4 Relación conceptual de condiciones aplicables

La relación canónica es:

```text
Empresa
  ↓ relación comercial 1:1
Suscripción
  ↓ referencia contractual estable
Referencia contractual
  ↓ se materializa, según MT-U3, como Versión de Plan o Snapshot contractual
  ↓ declara
Conjunto de límites y capacidades
```

Interpretación:

1. La **Empresa** es el sujeto del contrato y del eventual consumo; no se reemplaza por usuario, dispositivo o actor de plataforma.
2. La **Suscripción** determina cuál es la referencia contratada aplicable para esa Empresa.
3. La **referencia contractual**, materializada conforme a MT-U3, describe el conjunto de límites y capacidades de esa referencia.
4. El **conjunto de límites** se interpreta solo para la Empresa y en el marco de las autoridades preservadas por B0.

El Plan global puede evolucionar y tener nuevas versiones, pero la cadena anterior no se vuelve a resolver contra una oferta actual de manera que altere silenciosamente el contrato existente. El conjunto puede estar vacío; ese caso no autoriza inventar un límite ni enforcement.

## B1.5 Fronteras e invariantes de B1

- **U10-B1-I01 — Procedencia contractual:** todo límite aplicable proviene de la referencia contractual a la que remite la Suscripción de la Empresa.
- **U10-B1-I02 — Semántica explícita:** cada límite declara una sola clase conceptual comprensible; no hay límites implícitos por ausencia, interfaz, cliente o práctica operativa.
- **U10-B1-I03 — Conjunto vacío válido:** la ausencia de una dimensión o un conjunto vacío no es un error ni autoriza un límite por defecto.
- **U10-B1-I04 — Ilimitado explícito:** “ilimitado” es una condición contractual explícita y no elimina controles de seguridad, integridad, conservación o lifecycle.
- **U10-B1-I05 — Funcionalidad no es autorización:** disponibilidad de funcionalidad no sustituye membresía, rol, facultad, claim, estado empresarial ni readiness existente.
- **U10-B1-I06 — Consumo separado:** el consumo es una observación futura; B1 no lo calcula, persiste, agrega ni compara con una cuota.
- **U10-B1-I07 — Enforcement reservado:** B1 usa enforcement solo como concepto; no define puntos de aplicación, denegaciones, excepciones ni bloqueos.
- **U10-B1-I08 — No retroactividad:** los límites no reinterpretan eventos, snapshots, ledger, fiscalidad ni condiciones grandfathered ya preservadas.
- **U10-B1-I09 — Aislamiento:** una condición aplicable a una Empresa no otorga observación, control ni inferencia sobre otra Empresa.
- **U10-B1-I10 — Evolución segura:** una clase reservada no tiene efecto hasta que una etapa posterior defina su semántica sin contradecir B0 ni el contrato contratado.
- **U10-B1-I11 — Semántica contractual única:** cada dimensión posee una única semántica contractual; esta no varía según la implementación, la interfaz ni el contexto operativo.

## B1.6 Dependencias y exclusiones

B1 depende de las autoridades y principios certificados en B0 y, a través de este, de MT-U3, MT-U9, ADR-SAAS-001 a ADR-SAAS-010 y el MASTER-SECURITY-PLAN. No depende de una métrica, proceso de medición, mecanismo de enforcement o interfaz.

Quedan fuera de B1:

- definir dimensiones de consumo, unidades, umbrales, valores, períodos o reglas de reinicio;
- determinar qué eventos constituyen consumo, cómo se atribuyen o cómo se corrigen;
- comparar consumo contra cuota, calcular saldo o emitir decisiones;
- bloquear, degradar, denegar, advertir, excepcionar o habilitar operaciones;
- cambiar Plan, Versión, Suscripción, lifecycle, facturación, bootstrap, onboarding, Panel SaaS, soporte o impersonación;
- diseñar almacenamiento, modelos físicos, API, UI, React, Firestore, Cloud Functions, reglas, pruebas o implementación;
- anticipar MT-U11 o MT-U12.

## B1.7 Riesgos arquitectónicos

| Riesgo | Consecuencia | Invariante que lo contiene |
|---|---|---|
| Confundir cuota con consumo | Decisiones basadas en contrato o uso incompleto. | U10-B1-I06. |
| Confundir funcionalidad contratada con permiso | Escalamiento de privilegios. | U10-B1-I05. |
| Resolver contra un plan actual no contratado | Alteración silenciosa de condiciones. | U10-B1-I01 y B0-I02. |
| Asumir que ilimitado elimina controles | Violación de lifecycle, seguridad o integridad. | U10-B1-I04. |
| Dar efecto a una clase reservada | Restricción sin contrato ni semántica aprobada. | U10-B1-I10. |
| Confundir capacidad técnica con capacidad comercial | La infraestructura redefine implícitamente la oferta o crea una dimensión contractual inexistente. | B0-P09 y U10-B1-I11. |
| Tratar el exceso como lifecycle | Mezcla de cobro, acceso y conservación. | B0-P03 y B0-I03. |
| Definir enforcement en B1 | Anticipación del bloque posterior e implementación encubierta. | U10-B1-I07. |
| Atribuir condiciones entre empresas | Fuga o control cross-tenant. | U10-B1-I09. |

## B1.8 Criterios de aceptación

B1 está completo cuando:

- define límite, cuota, consumo, capacidad, disponibilidad de funcionalidad y enforcement únicamente como conceptos;
- clasifica límites cuantitativos, de capacidad, temporales, por funcionalidad, ilimitados y reservados para evolución futura;
- expresa la cadena Empresa → Suscripción → referencia contractual → conjunto de límites;
- preserva la estabilidad contractual, la separación commercial/lifecycle y el aislamiento tenant;
- declara que disponibilidad no equivale a autorización ni acceso efectivo;
- no mide, calcula, compara, bloquea, modifica lifecycle ni diseña una implementación;
- mantiene fiscalidad, snapshots, ledger, bootstrap, onboarding, Panel SaaS, MT-U11 y MT-U12 fuera de alcance.

---

## Cierre de U10-B0 y U10-B1

U10-B0 y U10-B1 quedan listos para revisión arquitectónica. Su aprobación habilita únicamente el siguiente bloque conceptual de MT-U10 para definir, bajo estos contratos, la medición de consumo y el enforcement de límites. No habilita implementación ni altera las autoridades aprobadas.
