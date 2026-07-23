# MT-U10 — U10-B2 y U10-B3: consumo y períodos de consumo

> **Estado:** especificación arquitectónica para revisión.
> **Alcance:** modelo conceptual de consumo (U10-B2) y de períodos de consumo (U10-B3).
> **Precondición:** U10-B0 y U10-B1 aprobados. Este documento los aplica sin redefinir sus conceptos, autoridades ni invariantes.

## Autoridad y propósito

Este documento amplía MT-U10 con el modelo conceptual que permite distinguir condiciones comerciales declaradas de observaciones de uso. No decide cómo observar, calcular, conservar, comparar o aplicar esas observaciones. Tampoco introduce una consecuencia operativa para ellas.

La jerarquía aplicable es: ADR SaaS aceptados, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, MT-U3, MT-U9, U10-B0/B1 y `MASTER-SECURITY-PLAN.md`. Ante un conflicto, prevalece esa jerarquía. En especial, Empresa conserva la autoridad de lifecycle; Suscripción conserva la relación comercial; y la referencia contractual continúa siendo la fuente de las condiciones contratadas.

---

# U10-B2 — Modelo conceptual de consumo

## B2.1 Propósito y límites

U10-B2 precisa el concepto de consumo ya establecido en U10-B1: una observación atribuible a una Empresa respecto de una dimensión bajo condiciones aplicables. Su propósito es distinguir esa observación de la oferta comercial, de la existencia de datos o recursos, de la autorización y de cualquier consecuencia futura.

Este bloque no determina eventos, algoritmos, contadores, cálculos, unidades, persistencia, reconciliaciones, actualizaciones, comparaciones ni procesos. La asociación temporal de una observación se reserva por completo a U10-B3; B2 no presupone períodos ni ventanas temporales.

## B2.2 Conceptos normativos

| Concepto | Definición conceptual | No significa |
|---|---|---|
| **Consumo** | La utilización observada y atribuible a una Empresa en relación con una dimensión bajo condiciones aplicables. | Una capacidad contratada, una cuota, un permiso, un estado comercial o un estado de lifecycle. |
| **Referencia de consumo** | Contexto conceptual dentro del cual una observación de consumo adquiere significado para una Empresa y una dimensión determinadas, conforme a la referencia contractual aplicable y, cuando corresponda, al período definido en B3. | La referencia contractual que declara condiciones, el período que aporta contexto temporal, la observación misma o una cuota. |
| **Observación de consumo** | Afirmación conceptual de que existe utilización atribuible a una Empresa y una dimensión, con significado consistente con la semántica contractual de esa dimensión. | Un contador, algoritmo, evento técnico, registro físico o solicitud de cliente. |
| **Consumo observado** | Consumo cuya atribución y significado pueden reconocerse conceptualmente según los principios de este bloque. | Una decisión de exceso, un saldo o un resultado de enforcement. |
| **Utilización** | Empleo efectivo de una capacidad o funcionalidad en el sentido que la semántica contractual de la dimensión establezca. | La mera disponibilidad, existencia de un recurso, permiso de usuario o capacidad técnica de infraestructura. |
| **Existencia** | Presencia de una entidad, dato, relación o recurso en el dominio correspondiente. | Utilización automática ni consumo, salvo que una dimensión contratada establezca expresamente esa semántica. |

## B2.3 Distinciones obligatorias

### Capacidad y consumo

La **capacidad** es una aptitud declarada por la referencia contractual; el **consumo** es una utilización observada respecto de una dimensión. La primera pertenece a la oferta contratada y la segunda a la observación conceptual de uso. Que una capacidad esté disponible no prueba utilización; que exista utilización no modifica por sí misma la capacidad contratada.

### Disponibilidad y utilización

La **disponibilidad** expresa que una funcionalidad o capacidad pertenece a la oferta contratada. La **utilización** expresa que se empleó en el sentido contractual de una dimensión. Una capacidad comercialmente disponible puede no utilizarse. A la inversa, ninguna observación de utilización habilita disponibilidad comercial, membresía, rol, claim, facultad o acceso efectivo.

### Existencia y utilización

La existencia de una entidad, relación, dato o recurso no equivale a su utilización. Tampoco la utilización puede inferirse de la sola existencia. Solo una semántica contractual explícita de la dimensión puede establecer que cierta forma de existencia sea pertinente para el consumo; B2 no declara ninguna.

### Cuota y consumo

La **cuota** es una condición cuantitativa declarada por la referencia contractual. El **consumo** es una observación de utilización. No son intercambiables: una cuota no observa uso y una observación no modifica la cuota. B2 no los compara ni determina saldo, exceso, agotamiento o disponibilidad resultante.

### Consumo observado y estado contractual

El consumo observado no altera por sí mismo la referencia contractual, el Plan, la Suscripción ni sus estados comerciales. De igual modo, un estado contractual no fabrica una observación de consumo. Las fechas y estados de la relación comercial continúan con el significado aprobado en MT-U3; B2 no los interpreta como uso.

## B2.4 Principios de atribución conceptual

### B2-P01 — Atribución empresarial exclusiva

Toda observación de consumo se atribuye conceptualmente a una sola Empresa. No se comparte, agrega ni infiere entre empresas y no se sustituye el sujeto Empresa por un usuario, dispositivo, operador o dato aportado libremente por cliente.

### B2-P02 — Dimensión contractual explícita

Toda observación se interpreta respecto de una dimensión declarada por la referencia contractual aplicable. La ausencia de una dimensión no permite atribuir consumo implícito ni derivar una condición comercial inexistente.

### B2-P03 — Significado estable

La utilización observada mantiene la semántica contractual única de la dimensión. No puede adquirir significado distinto por la interfaz, una elección del cliente, una capacidad de infraestructura o el contexto operativo.

### B2-P04 — Observación no redefine el contrato

Una observación de consumo nunca modifica la semántica contractual de una dimensión. El contrato define el significado de la dimensión y el uso observado solo se interpreta conforme a él; nunca lo redefine.

### B2-P05 — Observación no es autoridad

Una observación no otorga ni revoca identidad, membresía, rol, claim, facultad de plataforma ni contexto de tenant. El actor que eventualmente origine una utilización no reemplaza a la Empresa como sujeto del consumo ni se convierte en autoridad de sus condiciones comerciales.

### B2-P06 — Observación distinta de medición

La observación pertenece al modelo conceptual. La medición es únicamente una posible forma futura de obtener observaciones; el modelo conceptual de observación no presupone ninguna técnica de medición, fuente, instrumento ni mecanismo técnico.

### B2-P07 — Neutralidad frente a la implementación

El modelo de consumo es independiente de cómo pudiera identificarse, materializarse o procesarse una observación. Una señal técnica, dato de infraestructura o artefacto de interfaz no es consumo por sí misma; solo puede ser pertinente si respeta la dimensión y semántica contractual ya declaradas.

### B2-P08 — Independencia de consecuencia

Reconocer consumo no autoriza comparar contra cuotas, bloquear, denegar, advertir, degradar, exceptuar ni habilitar operaciones. El enforcement de límites es una responsabilidad posterior y distinta.

## B2.5 Independencias obligatorias

| Separación | Regla arquitectónica |
|---|---|
| Consumo ↔ enforcement | El consumo describe utilización observada; enforcement aplicará en un bloque posterior condiciones de límite. Ninguno se deduce ni se reemplaza por el otro en B2. |
| Consumo ↔ facturación | Observar uso no adopta cobro por uso, no genera precio, factura, saldo comercial ni cobro. La facturación permanece fuera de MT-U10. |
| Consumo ↔ lifecycle | Un consumo, su ausencia o una condición futura de exceso no es una transición de `Empresa.estado` ni modifica conservación o acceso. El lifecycle conserva su autoridad exclusiva. |
| Consumo ↔ autorización | Consumo no es identidad, rol, membresía, claim, facultad ni permiso. La autorización se resuelve por las autoridades ya aprobadas. |
| Consumo ↔ fiscalidad | La observación no modifica numeración, emisión, snapshots, ledger ni evidencia histórica. |
| Consumo ↔ infraestructura | Capacidad técnica, telemetría o existencia de recursos no definen por sí mismas una dimensión comercial ni una observación de consumo. |

## B2.6 Clasificación conceptual del consumo

Las clases siguientes caracterizan la naturaleza conceptual de una observación. Son ortogonales y una misma dimensión puede participar en más de una cuando su semántica contractual única lo permita. Esta clasificación no define mecanismos de cálculo, combinación, prioridad ni actualización.

| Clase | Definición conceptual | No define |
|---|---|---|
| **Acumulativo** | Utilización cuya interpretación contractual considera la contribución de usos dentro de una referencia de consumo; B3 precisa su contexto temporal cuando corresponda. | Cómo se suma, qué la inicia, cómo se corrige o cuándo se reinicia. |
| **Instantáneo** | Utilización cuya interpretación contractual se refiere a una condición de uso o capacidad en un punto conceptual de observación. | Muestreo, frecuencia, valor máximo, medición técnica o reacción. |
| **Derivado** | Utilización cuyo significado contractual depende conceptualmente de una relación definida a partir de otras utilizaciones o hechos de dominio pertinentes. | Fórmula, fuente, cálculo, reconciliación o materialización. |
| **Compuesto** | Utilización cuya semántica contractual considera más de un aspecto de una misma dimensión o de dimensiones relacionadas. | Regla de combinación, ponderación, precedencia o doble cómputo. |
| **Reservado para evolución futura** | Clase cuya semántica de utilización no se define todavía y que no produce interpretación operativa hasta ser especificada y contratada expresamente. | Una autorización para inferir consumo o imponer condiciones implícitas. |

## B2.7 Fronteras del dominio

| Frontera | Debe preservarse | No corresponde a B2 |
|---|---|---|
| Empresa ↔ otras empresas | Cada observación tiene un único sujeto Empresa. | Consolidación cross-tenant o visibilidad de plataforma sobre datos tenant. |
| Referencia contractual ↔ consumo | La primera declara condiciones; el segundo observa utilización. | Modificar contrato a partir de una observación. |
| Referencia de consumo ↔ sus componentes | La referencia de consumo contextualiza el significado de una observación para Empresa y dimensión. | Sustituir la referencia contractual, el período, la observación o la cuota. |
| Dimensión ↔ infraestructura | La dimensión es contractual y conceptual. | Convertir recursos técnicos en dimensiones automáticamente. |
| Observación ↔ cuota | Uso observado y cantidad contratada siguen separados. | Compararlos o decidir consecuencias. |
| Consumo ↔ lifecycle/autorización | Ninguno cambia las autoridades existentes. | Suspender, reactivar, permitir o denegar. |
| Consumo ↔ tiempo | B2 no asigna períodos ni ciclos. | Duraciones, fechas, ventanas o renovación. |

## B2.8 Invariantes arquitectónicas

- **U10-B2-I01 — Sujeto único:** toda observación de consumo pertenece conceptualmente a una sola Empresa.
- **U10-B2-I02 — Procedencia de dimensión:** no existe consumo atribuible sin una dimensión declarada por la referencia contractual aplicable.
- **U10-B2-I03 — Semántica estable:** la observación respeta la única semántica contractual de su dimensión y no cambia según interfaz, implementación o contexto operativo.
- **U10-B2-I04 — Existencia distinta de uso:** la mera existencia no constituye utilización ni consumo salvo semántica contractual explícita, que B2 no declara.
- **U10-B2-I05 — Sin efecto contractual:** consumo observado no modifica Plan, referencia contractual, Suscripción ni su estado comercial.
- **U10-B2-I06 — Sin efecto de lifecycle:** consumo observado no cambia `Empresa.estado`, acceso ni conservación.
- **U10-B2-I07 — Sin efecto de autorización:** consumo observado no concede ni revoca identidad, rol, membresía, claim, facultad o permiso.
- **U10-B2-I08 — Sin decisión de límite:** B2 no compara consumo con cuota ni determina excedente, saldo, bloqueo, denegación, excepción o modo degradado.
- **U10-B2-I09 — Reserva temporal:** B2 no asigna una observación a un período; esa semántica se define exclusivamente en B3.
- **U10-B2-I10 — Evolución explícita:** una clase reservada no produce consumo interpretable hasta una definición futura compatible con B0/B1 y el contrato contratado.
- **U10-B2-I11 — Referencia de consumo separada:** la referencia de consumo contextualiza una observación, pero no se confunde con la referencia contractual, el período, la observación ni la cuota.

## B2.9 Dependencias y exclusiones

B2 depende de B0/B1 para Empresa como sujeto, dimensión, referencia contractual, cuota, capacidad, disponibilidad y separación de autoridades. Depende de MT-U3 y ADR-SAAS-003/009 para la separación comercial/lifecycle; de MT-U9 para no crear autoridad de operador, panel, comando, soporte o auditoría adicional; y del MASTER-SECURITY-PLAN para aislamiento tenant, mínima autoridad y desconfianza de entradas de cliente.

Quedan fuera de B2 los períodos de consumo, algoritmos, contadores, cálculos, persistencia, agregación, corrección, reconciliación, actualización, comparación contra cuotas, decisiones, enforcement, facturación, precios, cobros, grace periods, cambios de plan, bootstrap, onboarding, Panel SaaS, procesos administrativos, implementación e infraestructura.

## B2.10 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención de B2 |
|---|---|---|
| Confundir capacidad con consumo | Uso inferido sin observación o contrato alterado por actividad. | B2.3 y B2-P02. |
| Confundir existencia con utilización | Consumo falso por mera presencia de datos o recursos. | B2.3 y U10-B2-I04. |
| Atribuir uso entre empresas | Fuga de información o condición cross-tenant. | B2-P01 y U10-B2-I01. |
| Convertir telemetría o interfaz en contrato | La implementación redefine la oferta comercial. | B2-P03 y B2-P07. |
| Interpretar una observación bajo más de una semántica contractual | El mismo uso adquiere significados incompatibles según contexto operativo. | B2-P03, B2-P04 y U10-B2-I03. |
| Usar consumo como autorización o lifecycle | Escalamiento de privilegios o conservación/acceso indebidos. | B2-P05 y B2.5. |
| Confundir observación con facturación | Cobro o precio implícito no aprobado. | B2.5. |
| Adelantar enforcement | Bloqueos o excepciones sin contrato de aplicación aprobado. | B2-P08 y U10-B2-I08. |

## B2.11 Criterios de aceptación

B2 está completo cuando:

- define consumo y observación de consumo sin especificar mecanismos técnicos;
- separa capacidad, disponibilidad, existencia, utilización, cuota, estado contractual y consumo;
- establece atribución exclusiva a Empresa, referencia de consumo separada y semántica contractual estable por dimensión;
- clasifica consumo acumulativo, instantáneo, derivado, compuesto y reservado sin definir cálculos;
- preserva la independencia frente a enforcement, facturación, lifecycle y autorización;
- deja períodos, medición, persistencia, comparación y consecuencias fuera de alcance;
- no introduce infraestructura, almacenamiento, APIs, UI, reglas, funciones, procesos ni nuevas autoridades.

---

# U10-B3 — Modelo conceptual de períodos de consumo

## B3.1 Propósito y precondición

U10-B3 define el período de consumo como marco conceptual temporal para interpretar observaciones de consumo cuando la semántica contractual de una dimensión lo requiera. Se construye exclusivamente sobre B0/B1 y B2: no modifica el significado de consumo, la referencia contractual ni las autoridades existentes.

No define tareas, calendarios concretos, duraciones, ventanas, fechas, activadores ni procesos de transición. Tampoco asigna observaciones reales a períodos ni define cómo se renueva, reinicia o aplica algo operativamente.

## B3.2 Conceptos normativos

| Concepto | Definición conceptual | No significa |
|---|---|---|
| **Período de consumo** | Marco temporal conceptual dentro de una referencia de consumo que delimita la interpretación de consumo para una dimensión cuando la referencia contractual declara esa necesidad. | Un cron job, tarea programada, intervalo técnico, almacenamiento o mecanismo de reinicio. |
| **Continuidad conceptual** | Propiedad por la cual los períodos aplicables a una misma dimensión y Empresa pueden situarse en una secuencia no ambigua conforme a su referencia contractual. | Un proceso automático, ejecución continua o una ventana temporal concreta. |
| **Renovación conceptual de cuota** | Reafirmación conceptual de una cuota para un nuevo período cuando la referencia contractual lo declara. | Cobro, renovación de Suscripción, cambio de Plan, gracia o acción administrativa. |
| **Reinicio conceptual del consumo** | Separación conceptual de la interpretación de consumo entre períodos distintos cuando la semántica contractual lo declara. | Borrado, corrección, cálculo, proceso técnico o pérdida de evidencia. |

## B3.3 Finalidad del período

Un período existe únicamente para aportar contexto temporal dentro de una referencia de consumo de una dimensión cuya semántica contractual lo requiera. Permite distinguir conceptualmente utilizaciones que pertenecen a períodos diferentes, sin afirmar que toda dimensión sea temporal ni que todo consumo deba renovarse o reiniciarse.

El período no es un nuevo sujeto de negocio, una autoridad de plataforma ni un reemplazo de la Suscripción. Su finalidad no es aplicar un límite, determinar un exceso, modificar una cuota ni producir un efecto sobre el acceso.

## B3.4 Relación con la referencia contractual y el Plan

La referencia contractual determina si una dimensión usa período y la semántica temporal aplicable a la referencia de consumo correspondiente. Esta relación preserva la estabilidad contractual: un Plan global puede evolucionar con nuevas versiones, pero la interpretación de una Empresa se rige por la referencia contractual de su Suscripción y no por una oferta actual que la reescriba silenciosamente.

El período es independiente del Plan considerado como oferta global. Un Plan no crea por sí mismo un período para cada Empresa, no cambia períodos existentes y no sustituye la referencia contractual. B3 tampoco define cómo una modificación comercial, cambio de versión o transición de Suscripción afectaría períodos; esos temas permanecen fuera de alcance.

## B3.5 Independencia entre período y lifecycle

El período no es un estado ni una transición de Empresa. Iniciar, terminar, suceder o interpretar un período no suspende, activa, archiva, elimina, conserva ni restaura una Empresa, y no modifica sus reglas de acceso. `Empresa.estado` y el servicio de lifecycle continúan como única autoridad para esas decisiones.

Una Empresa solo puede tener observaciones o consecuencias operativas cuando las autoridades vigentes lo permitan; esta afirmación no convierte el período en enforcement ni define comportamiento para ningún estado empresarial.

## B3.6 Formas conceptuales de período

| Forma | Definición conceptual | No define |
|---|---|---|
| **Natural** | Categoría exclusivamente conceptual de período cuya referencia de consumo se interpreta frente a una convención temporal externa al vínculo comercial individual, si la referencia contractual así lo declara. | Meses calendario, días, fechas, duración determinada o cualquier convención temporal específica. |
| **Asociado a la Suscripción** | Período cuya referencia de consumo se interpreta en relación con la Suscripción de la Empresa, si la referencia contractual así lo declara. | Fecha de alta, renovación, cambio de plan, cobro, gracia ni transición comercial. |
| **Reservado para futuras extensiones** | Forma cuya relación temporal aún no se define y que no produce semántica aplicable hasta ser especificada y contratada expresamente. | Interpretación predeterminada, ventana técnica o restricción implícita. |

Una dimensión puede no requerir período. Cuando lo requiera, la forma aplicable proviene de su semántica contractual, no de la interfaz, infraestructura, actor, lifecycle o estado comercial actual.

## B3.7 Continuidad, renovación y reinicio conceptuales

### Continuidad conceptual entre períodos

Para una Empresa y una dimensión que use períodos, sus períodos deben poder ordenarse de manera no ambigua según la referencia contractual aplicable. La continuidad conceptual evita confundir interpretaciones temporales distintas; no obliga a una duración determinada, no crea un proceso de sucesión y no define cómo resolver cambios contractuales.

### Renovación conceptual de cuotas

Una cuota puede renovarse conceptualmente al iniciar una nueva referencia de consumo solo si la semántica contractual de la dimensión lo declara. Esta renovación no equivale a cobrar, renovar la Suscripción, modificar el Plan, aprobar una extensión ni habilitar una operación. B3 no determina qué cuota se renueva ni cuándo.

### Reinicio conceptual del consumo

Una dimensión puede separar conceptualmente su consumo entre períodos solo si su semántica contractual lo declara. El reinicio expresa que la interpretación de consumo de una referencia de consumo no se confunde con otra; no borra, recalcula, corrige ni aplica evidencia. Las observaciones y su integridad siguen sujetas a las autoridades y garantías aplicables.

## B3.8 Principios arquitectónicos

### B3-P01 — Período solo por semántica contractual

No hay período implícito. Una dimensión usa período únicamente cuando su referencia contractual declara esa semántica. La ausencia de período no permite inventar ciclos, renovaciones o reinicios.

### B3-P02 — Secuencia no ambigua

Si una dimensión usa período, la referencia contractual debe permitir una secuencia conceptual sin ambigüedad para la Empresa. B3 no prescribe cómo determinarla.

### B3-P03 — Separación temporal y comercial

El período interpreta consumo; no redefine Plan, referencia contractual ni Suscripción. La renovación conceptual de una cuota no es renovación comercial.

### B3-P04 — Separación temporal y lifecycle

El período no tiene facultad sobre acceso, conservación, suspensión, archivo ni eliminación. Cualquier relación futura entre condiciones comerciales y lifecycle debe seguir las autoridades y procesos ya aprobados, fuera de B3.

### B3-P05 — Sin autoridad técnica ni de interfaz

La semántica temporal procede del contrato. Infraestructura, interfaz, actor, dispositivo, huso técnico o mecanismo de ejecución no redefinen por sí solos un período, su continuidad, renovación o reinicio.

## B3.9 Fronteras e invariantes arquitectónicas

| Frontera | Debe preservarse | No corresponde a B3 |
|---|---|---|
| Período ↔ referencia contractual | La primera interpreta temporalmente una condición de la segunda. | Cambiar unilateralmente el contrato. |
| Período ↔ Plan | El Plan es oferta global; la Empresa se rige por su referencia contractual. | Recalificar períodos de suscripciones existentes por editar la oferta. |
| Período ↔ lifecycle | Interpretación temporal no es estado de Empresa. | Suspender, reactivar, archivar, eliminar o conservar. |
| Período ↔ cuota/consumo | El marco temporal contextualiza cuando se declare; no decide resultado. | Comparar, calcular, bloquear o habilitar. |
| Período ↔ implementación | El modelo no presupone mecanismo temporal. | Tareas, ventanas, relojes, infraestructura o almacenamiento. |

- **U10-B3-I01 — Procedencia contractual:** un período solo es aplicable si la referencia contractual de la Empresa declara esa semántica para la dimensión.
- **U10-B3-I02 — Sujeto y dimensión:** todo período aplicable se interpreta para una única Empresa y una única dimensión, sin inferencia cross-tenant.
- **U10-B3-I03 — No ambigüedad:** los períodos de una dimensión que los requiera pueden ordenarse conceptualmente sin ambigüedad bajo la referencia contractual aplicable.
- **U10-B3-I04 — Sin efecto comercial:** período, renovación conceptual o reinicio conceptual no cambian Plan, referencia contractual, Suscripción, cobro ni estado comercial.
- **U10-B3-I05 — Sin efecto de lifecycle:** período, renovación conceptual o reinicio conceptual no cambian `Empresa.estado`, acceso ni conservación.
- **U10-B3-I06 — Sin enforcement:** período no compara consumo con cuota ni determina excedente, bloqueo, denegación, excepción, modo degradado o habilitación.
- **U10-B3-I07 — Sin efecto destructivo:** reinicio conceptual no implica borrado, pérdida, modificación o reinterpretación de evidencia histórica, fiscal, snapshot o ledger.
- **U10-B3-I08 — Sin implementación implícita:** una forma natural, asociada a Suscripción o reservada no presupone calendario, tarea, ventana, zona horaria, proceso ni infraestructura.
- **U10-B3-I09 — Evolución explícita:** una forma reservada no adquiere semántica ni efecto hasta una definición futura compatible con B0/B1/B2 y la referencia contractual.

## B3.10 Dependencias y exclusiones

B3 depende de B0/B1 para referencia contractual, dimensión, cuota y separación de autoridades; de B2 para consumo y observación; de MT-U3 y ADR-SAAS-003/009 para preservar Suscripción y lifecycle como autoridades separadas; de MT-U9 para no crear procesos, operadores o facultades adicionales; y del MASTER-SECURITY-PLAN para aislamiento tenant, mínima autoridad e integridad de datos sensibles.

Quedan fuera de B3 cron jobs, tareas programadas, ventanas o duraciones concretas, calendarios, zonas horarias, fechas de corte, algoritmos, persistencia, cálculo, observación, reconciliación, actualización, comparación de cuotas, enforcement, bloqueos, denegaciones, excepciones, modos degradados, grace periods, cambios de plan, bootstrap, onboarding, Panel SaaS, procesos administrativos, UI, API, reglas, funciones, almacenamiento e implementación.

## B3.11 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención de B3 |
|---|---|---|
| Convertir período en lifecycle | Acceso o conservación alterados por una referencia de consumo. | B3.5 y U10-B3-I05. |
| Usar Plan vigente en vez de referencia contractual | Periodización retroactiva o contrato alterado silenciosamente. | B3.4 y U10-B3-I01. |
| Confundir renovación de cuota con renovación comercial | Cobro o estado de Suscripción implícito. | B3.7 y U10-B3-I04. |
| Interpretar reinicio como borrado | Pérdida de evidencia o violación fiscal/ledger. | U10-B3-I07. |
| Dejar períodos ambiguos | Consumo atribuido a referencias de consumo incompatibles. | B3-P02 y U10-B3-I03. |
| Derivar período de infraestructura o interfaz | La implementación redefine el contrato. | B3-P05 y U10-B3-I08. |
| Aplicar períodos sin dimensión contractual | Límite o cuota implícitos. | B3-P01 y U10-B3-I01. |
| Adelantar enforcement | Decisiones operativas sin bloque de aplicación aprobado. | U10-B3-I06. |

## B3.12 Criterios de aceptación

B3 está completo cuando:

- define período, referencia de consumo, continuidad, renovación conceptual y reinicio conceptual sin procesos técnicos;
- vincula los períodos a la referencia contractual y no al Plan vigente ni al lifecycle;
- distingue períodos naturales, asociados a la Suscripción y reservados para evolución futura sin fijar ventanas o duraciones;
- preserva la separación entre período, lifecycle, estado comercial, cuota, consumo y enforcement;
- establece continuidad conceptual no ambigua y ausencia de efecto destructivo;
- no introduce cron jobs, tareas, calendarios, cálculos, comparaciones, bloqueos, cambios comerciales, procesos administrativos ni implementación;
- conserva fiscalidad, snapshots, ledger, bootstrap, onboarding, Panel SaaS, MT-U11 y MT-U12 fuera de alcance.

---

## Cierre de U10-B2 y U10-B3

U10-B2 y U10-B3 quedan listos para revisión arquitectónica. Su aprobación habilita únicamente el bloque posterior que, bajo estos contratos, podrá definir la aplicación de límites. No habilita implementación, no altera decisiones de MT-U3 o MT-U9 y no modifica las autoridades existentes.
