# MT-U10 — U10-B4 y U10-B5: enforcement y evaluación de límites

> **Estado:** especificación arquitectónica para revisión.
> **Alcance:** modelo conceptual de enforcement (U10-B4) y modelo conceptual de evaluación de límites (U10-B5).
> **Precondición:** U10-B0, U10-B1, U10-B2 y U10-B3 aprobados. Este documento los aplica sin redefinir sus conceptos, autoridades ni invariantes.

## Autoridad y propósito

Este documento completa el lenguaje conceptual de MT-U10 para relacionar condiciones contratadas, observaciones de consumo, períodos, evaluación y enforcement. No especifica ningún mecanismo, orden, punto de aplicación, respuesta ni efecto operativo.

La jerarquía aplicable es: ADR SaaS aceptados, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, MT-U3, MT-U9, U10-B0/B1 y U10-B2/B3, y `MASTER-SECURITY-PLAN.md`. Ante conflicto, prevalece esa jerarquía. Empresa conserva la autoridad de lifecycle; Suscripción conserva la relación comercial; y las autoridades de identidad, membresía, fiscalidad, plataforma y tenant no se modifican.

---

# U10-B4 — Modelo conceptual de enforcement

## B4.1 Propósito y definición

U10-B1 define enforcement como la aplicación futura y coherente de una condición de límite en los puntos autorizados de la arquitectura. U10-B4 precisa su papel conceptual: preservar que una condición comercial contratada no pierda significado al relacionarse con el consumo y su contexto temporal.

El enforcement no es un límite, una cuota, una observación, una referencia de consumo, un período, una autoridad ni una decisión de lifecycle. Tampoco es por sí mismo un permiso, bloqueo, respuesta, error, excepción o modo de acceso. B4 no define cómo, dónde, cuándo ni con qué consecuencia se realiza una aplicación futura.

## B4.2 Finalidad

La finalidad conceptual del enforcement es mantener la fidelidad entre:

```text
Referencia contractual
  ↓ declara condiciones para dimensiones
Cuotas y límites
  ↓ se interpretan respecto de
Referencia de consumo y período, cuando corresponda
  ↓ contextualizan
Consumo observado
```

La fidelidad no autoriza reinterpretar el contrato desde la observación ni convertir una condición comercial en una autoridad de acceso. El enforcement futuro deberá conservar las separaciones ya aprobadas; B4 no especifica su proceso ni sus resultados.

## B4.3 Relación con los conceptos previos

| Concepto | Relación con enforcement | El enforcement no puede |
|---|---|---|
| Referencia contractual | Es la fuente de condiciones aplicables para una Empresa. | Usar el Plan vigente para reescribir condiciones contratadas. |
| Dimensión | Aporta la semántica contractual única de la condición. | Inventar dimensiones, usar capacidades técnicas como dimensiones o cambiar su semántica. |
| Cuota | Puede expresar una condición cuantitativa declarada. | Alterar la cuota, su contrato o inferir precio, cobro o saldo en B4. |
| Consumo observado | Aporta utilización contextualizada conceptualmente. | Convertir observación en contrato, facturación, autorización o lifecycle. |
| Referencia de consumo | Aporta el contexto en que una observación adquiere significado. | Confundirla con referencia contractual, período, cuota u observación. |
| Período | Aporta contexto temporal solo cuando la semántica contractual lo declara. | Crear ciclos, fechas, duraciones, calendarios o reinicios técnicos. |

## B4.4 Independencias obligatorias

### Enforcement y lifecycle

El enforcement de límites no es enforcement de lifecycle. `Empresa.estado` continúa siendo la única autoridad de acceso interactivo, escrituras operativas y conservación conforme a ADR-SAAS-009. Una condición de límite, una observación o su contexto temporal no modifica por sí misma el estado de Empresa ni sus transiciones.

### Enforcement y autorización

El enforcement no otorga, revoca ni interpreta identidad, membresía, rol, claim, facultad de plataforma, tenant activo o permiso. Una condición comercial o una futura aplicación de esta no reemplaza las autoridades de autorización ya aprobadas.

### Enforcement y facturación

El enforcement no determina precio, cobro por uso, factura, pago, saldo comercial, renovación o estado de Suscripción. Observar consumo y preservar condiciones contractuales no adopta facturación por uso ni una pasarela.

### Enforcement y fiscalidad

El enforcement no altera ni reinterpreta numeración, emisión, snapshots fiscales, ledger, ventas, evidencia histórica, retención ni obligaciones fiscales. Las garantías de integridad fiscal se conservan sin excepción.

### Enforcement y Panel SaaS

El Panel SaaS de MT-U9 es una proyección y no una autoridad de dominio, autorización ni tenant. B4 no le asigna ejecución, decisión, interpretación final ni nueva capacidad sobre límites. El Panel no convierte una condición visible en enforcement ni un resultado futuro en permiso.

## B4.5 Principios arquitectónicos

### B4-P01 — Procedencia contractual estable

Toda aplicación conceptual de una condición procede de la referencia contractual aplicable a la Suscripción de la Empresa. Un cambio posterior de oferta global no altera silenciosamente esa procedencia.

### B4-P02 — Semántica única de dimensión

El enforcement conserva la única semántica contractual de cada dimensión. No cambia según implementación, interfaz, actor, infraestructura, contexto operativo ni estado comercial actual.

### B4-P03 — Contexto de consumo separado

El enforcement interpreta condiciones respecto de la referencia de consumo y, cuando corresponda, del período contractual. Ninguno de esos conceptos sustituye la referencia contractual ni convierte una observación en una condición nueva.

### B4-P04 — Sujeto empresarial aislado

Toda aplicación conceptual se acota a una Empresa. No autoriza agregación, control, inferencia, transferencia ni visibilidad cross-tenant.

### B4-P05 — Sin autoridad derivada

El enforcement no deriva autoridad de una condición, observación, cuota, período, referencia contractual ni referencia de consumo. Lifecycle, autorización, fiscalidad y facultades de plataforma conservan sus autoridades canónicas.

### B4-P06 — Independencia de mecanismo y consecuencia

B4 define fidelidad conceptual, no puntos de ejecución, componentes, middleware, reglas, procesos, órdenes de evaluación ni efectos operativos. Ninguna interfaz, respuesta o señal técnica es una barrera o autoridad de enforcement por sí misma.

## B4.6 Fronteras del dominio

| Frontera | Debe preservarse | No corresponde a B4 |
|---|---|---|
| Oferta global ↔ contrato de Empresa | La referencia contractual estabiliza las condiciones aplicables. | Alterar suscripciones existentes desde el Plan vigente. |
| Contrato ↔ consumo | El contrato define semántica; consumo aporta observación. | Redefinir contrato desde uso observado. |
| Cuota ↔ enforcement | La cuota es condición; enforcement preserva su significado conceptual. | Calcular saldo, exceso o resultado operativo. |
| Período ↔ enforcement | El período contextualiza cuando se declare. | Definir fechas, ciclos, ventanas o reinicios técnicos. |
| Límites ↔ lifecycle/autorización | Autoridades separadas y canónicas. | Suspender, reactivar, conceder o revocar acceso. |
| Límites ↔ fiscalidad | Evidencia e integridad fiscal inmutables. | Modificar ventas, snapshots, ledger o numeración. |
| Enforcement ↔ Panel SaaS | El Panel es consumidor/proyección. | Crear una autoridad de panel, plataforma o tenant. |

## B4.7 Invariantes arquitectónicas

- **U10-B4-I01 — Referencia contractual canónica:** toda condición aplicable procede de la referencia contractual de la Empresa; el Plan vigente no la sustituye.
- **U10-B4-I02 — Semántica preservada:** enforcement no cambia la semántica contractual de una dimensión ni la hace depender de infraestructura, interfaz o contexto operativo.
- **U10-B4-I03 — Contexto no sustitutivo:** referencia de consumo y período contextualizan observación; no sustituyen contrato, cuota ni autoridad.
- **U10-B4-I04 — Aislamiento:** ninguna condición o aplicación conceptual cruza el límite de Empresa.
- **U10-B4-I05 — Sin efecto de lifecycle:** enforcement de límites no cambia `Empresa.estado`, acceso, conservación ni transiciones.
- **U10-B4-I06 — Sin efecto de autorización:** enforcement de límites no concede ni revoca identidad, membresía, rol, claim, facultad o permiso.
- **U10-B4-I07 — Sin efecto comercial o financiero:** enforcement no cambia Suscripción, precio, cobro, pago, facturación o estado comercial.
- **U10-B4-I08 — Sin efecto fiscal o histórico:** enforcement no modifica fiscalidad, numeración, snapshots, ledger, ventas, retención ni evidencia histórica.
- **U10-B4-I09 — Sin autoridad de Panel:** una proyección o acción de Panel SaaS no es enforcement ni autorización final.
- **U10-B4-I10 — Sin mecanismo implícito:** B4 no define puntos de ejecución, componentes técnicos, middleware, reglas, procesos ni efectos operativos.

## B4.8 Dependencias y exclusiones

B4 depende de B0/B1 para referencia contractual, dimensión, cuota y separación de autoridades; de B2 para consumo observado y referencia de consumo; de B3 para período; de MT-U3 y ADR-SAAS-003/009 para separar comercial y lifecycle; de MT-U9 para preservar la ausencia de autoridad del Panel SaaS; y del MASTER-SECURITY-PLAN para aislamiento tenant, mínima autoridad e integridad.

Quedan fuera de B4 evaluación de límites, algoritmos, comparaciones, órdenes de ejecución, puntos de ejecución, componentes, middleware, reglas, procesos, APIs, UI, almacenamiento, implementación, bloqueos, permisos, errores, excepciones, respuestas, modos degradados, grace periods, cambios de plan, bootstrap, onboarding, procesos administrativos y toda modificación a lifecycle, comercial, fiscalidad o Panel SaaS.

## B4.9 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención de B4 |
|---|---|---|
| Resolver contra Plan vigente | Alteración silenciosa de condiciones contratadas. | B4-P01 y U10-B4-I01. |
| Convertir enforcement en lifecycle | Acceso o conservación alterados por una condición comercial. | B4.4 y U10-B4-I05. |
| Convertir enforcement en autorización | Escalamiento de privilegios o bypass de membresía. | B4.4 y U10-B4-I06. |
| Convertir consumo en facturación | Cobro o precio no aprobado. | B4.4 y U10-B4-I07. |
| Afectar evidencia fiscal o histórica | Ruptura de integridad y retención. | B4.4 y U10-B4-I08. |
| Panel tratado como autoridad | Bypass de dominio o plataforma. | B4.4 y U10-B4-I09. |
| Inferir mecanismo de una definición conceptual | Implementación no auditada o inconsistente. | B4-P06 y U10-B4-I10. |
| Aplicar condiciones entre empresas | Fuga o control cross-tenant. | B4-P04 y U10-B4-I04. |

## B4.10 Criterios de aceptación

B4 está completo cuando:

- define enforcement sin asignarle mecanismos, resultados ni consecuencias operativas;
- relaciona enforcement con referencia contractual, dimensiones, cuotas, consumo, referencia de consumo y períodos;
- preserva independencia respecto de lifecycle, autorización, facturación, fiscalidad y Panel SaaS;
- declara fronteras, invariantes y riesgos de aislamiento, contrato estable y mínima autoridad;
- no define evaluación, comparaciones, bloqueos, permisos, errores, respuestas, reglas, procesos, componentes o implementación.

---

# U10-B5 — Modelo conceptual de evaluación de límites

## B5.1 Propósito y definición

U10-B5 define **evaluar un límite** como determinar conceptualmente el estado semántico de una condición contractual para una Empresa y una dimensión, bajo su contexto de evaluación. Este puede considerar referencia de consumo, cuota, consumo observado y período solo cuando la condición aplicable lo requiera.

La evaluación no observa ni produce consumo: interpreta una condición respecto de observaciones ya conceptualmente reconocibles. Tampoco es enforcement: evaluación expresa un estado semántico; enforcement es la aplicación futura y coherente de una condición de límite. Ninguno de los dos se convierte aquí en permiso, bloqueo, respuesta, error, excepción o comportamiento operativo.

Un **contexto de evaluación** es la agrupación exclusivamente conceptual de los elementos necesarios para interpretar una condición contractual cuando su semántica lo requiera. Puede comprender Empresa, dimensión, referencia contractual, referencia de consumo y, según corresponda, período, cuota y consumo observado. No es la referencia contractual, la referencia de consumo, el período, la cuota ni el consumo observado; tampoco representa un modelo físico, objeto de implementación o estructura de datos.

## B5.2 Distinciones obligatorias

| Distinción | Regla arquitectónica |
|---|---|
| Observación ↔ evaluación | Observar reconoce utilización atribuible; evaluar interpreta el estado semántico de una condición contractual respecto de ese contexto. Evaluar no crea, mide, corrige ni modifica observaciones. |
| Evaluación ↔ enforcement | Evaluación expresa un estado conceptual; enforcement preserva la aplicación futura coherente de una condición. Una evaluación no es por sí misma enforcement ni determina efecto operativo. |
| Evaluación ↔ referencia contractual | La referencia contractual determina qué condición y semántica se interpretan. Evaluación no la reemplaza ni la modifica. |
| Evaluación ↔ cuota | La cuota puede ser parte de una condición cuantitativa aplicable. Evaluación no la altera, no calcula saldos ni define comparaciones concretas. |
| Evaluación ↔ consumo | Consumo aporta utilización observada; evaluación no lo mide, agrega, persiste, reconcilia ni reinterpreta fuera de su semántica contractual. |
| Evaluación ↔ período | El período aporta contexto cuando la condición lo requiere. Evaluación no crea períodos, fechas, ciclos, renovaciones ni reinicios. |

## B5.3 Estados conceptuales de evaluación

Los estados son categorías semánticas, no respuestas de sistema ni instrucciones operativas. No fijan algoritmos, operadores, fórmulas, cálculos, prioridades ni orden de ejecución.

| Estado | Significado arquitectónico | No significa |
|---|---|---|
| **Positiva** | La condición contractual aplicable puede interpretarse de forma coherente respecto de la referencia de consumo, cuota, consumo y período que correspondan, sin que B5 determine efecto alguno. | Permitir una operación, habilitar acceso, confirmar una transacción o emitir una respuesta. |
| **Negativa** | La condición contractual aplicable se interpreta conceptualmente como no satisfecha respecto del contexto que corresponda, sin que B5 determine consecuencia alguna. | Bloquear, denegar, suspender, devolver error, aplicar cargo o degradar servicio. |
| **Indeterminada** | La condición no puede adquirir un estado positivo o negativo sin una semántica contractual o contexto conceptual suficiente y coherente. | Una excepción, error técnico, bypass, permiso provisional o comportamiento por defecto. |
| **Reservada para evolución futura** | Estado cuya semántica aún no se declara y que no produce efecto hasta definición futura compatible con la referencia contractual y los invariantes de MT-U10. | Una licencia para inventar resultados o consecuencias implícitas. |

La evaluación positiva y negativa describen únicamente la relación semántica de una condición con su contexto. No prescriben una comparación concreta ni implican que toda dimensión tenga cuota, consumo o período.

## B5.4 Principios arquitectónicos

### B5-P01 — Procedencia contractual y dirección única

La evaluación parte de la referencia contractual aplicable a la Suscripción de la Empresa. El contrato define la semántica de la dimensión; consumo, período, cuota y evaluación no la redefinen.

### B5-P02 — Contexto suficiente y separado

La evaluación utiliza únicamente el contexto de evaluación que la condición declare pertinente: Empresa, dimensión, referencia contractual, referencia de consumo y, cuando corresponda, cuota, consumo observado y período. No confunde esos conceptos ni introduce condiciones implícitas.

### B5-P03 — Resultado no operativo

Un estado de evaluación no es autorización ni consecuencia. No permite, bloquea, deniega, advierte, degrada, responde ni modifica datos o estados.

### B5-P04 — Indeterminación explícita

La falta de semántica contractual o de contexto de evaluación coherente no puede transformarse silenciosamente en un resultado positivo o negativo. Se representa como indeterminada sin definir manejo operativo.

### B5-P05 — Aislamiento y estabilidad

La evaluación se acota a una Empresa y una dimensión con semántica contractual única. No agrega, infiere ni transfiere contexto entre empresas, actores, interfaces, implementaciones o situaciones operativas.

### B5-P06 — Independencia de mecanismo

B5 no prescribe algoritmo, comparación, operador, fórmula, cálculo, orden, punto de ejecución, componente, proceso ni implementación. La evaluación es un significado arquitectónico, no un diseño técnico.

### B5-P07 — Consistencia semántica del contexto

Una misma condición contractual, interpretada bajo el mismo contexto de evaluación, conserva un único significado semántico. Esta consistencia no depende de implementación, interfaz, contexto operativo ni del mecanismo técnico que eventualmente realice una evaluación.

### B5-P08 — Independencia del orden temporal

B5 no presupone orden de procesamiento, secuencias de ejecución, evaluación síncrona o asíncrona, ni prioridades entre observaciones. La semántica conceptual permanece independiente de cualquier estrategia futura de implementación.

## B5.5 Fronteras del dominio

| Frontera | Debe preservarse | No corresponde a B5 |
|---|---|---|
| Referencia contractual ↔ evaluación | Contrato determina semántica y condición aplicable. | Cambiar el contrato desde el resultado. |
| Observación ↔ evaluación | Observación aporta uso; evaluación lo interpreta bajo contrato. | Medir, crear, corregir o persistir consumo. |
| Cuota ↔ evaluación | Cuota puede contextualizar una condición cuantitativa. | Definir operaciones, fórmulas, saldos o excedentes. |
| Período ↔ evaluación | Período contextualiza cuando se declare. | Crear ciclos, fechas, renovación o reinicio. |
| Evaluación ↔ enforcement | Estado semántico distinto de la aplicación futura. | Derivar un bloqueo, permiso o respuesta. |
| Evaluación ↔ lifecycle/autorización | Autoridades canónicas separadas. | Suspender, reactivar, otorgar o revocar acceso. |
| Evaluación ↔ fiscalidad/Panel | Fiscalidad y Panel siguen sus contratos propios. | Alterar evidencia fiscal o crear autoridad de interfaz. |

## B5.6 Invariantes arquitectónicas

- **U10-B5-I01 — Condición contractual:** toda evaluación se refiere a una condición de la referencia contractual aplicable a una Empresa.
- **U10-B5-I02 — Semántica única:** una dimensión se interpreta con una única semántica contractual, invariable ante interfaz, implementación o contexto operativo.
- **U10-B5-I03 — Contexto separado:** referencia de consumo, período, cuota y consumo contextualizan cuando corresponda, sin sustituirse entre sí ni con el contrato.
- **U10-B5-I04 — Resultado no operativo:** ningún estado de evaluación permite, bloquea, deniega, responde, degrada, excepciona ni modifica datos o estados.
- **U10-B5-I05 — Indeterminación sin inferencia:** una evaluación indeterminada no se convierte implícitamente en positiva, negativa o reservada.
- **U10-B5-I06 — Sin efecto de lifecycle o autorización:** evaluación no cambia `Empresa.estado`, conservación, identidad, membresía, rol, claim, facultad ni permiso.
- **U10-B5-I07 — Sin efecto comercial, financiero o fiscal:** evaluación no modifica Suscripción, Plan, cuota, precio, facturación, numeración, snapshots, ledger ni evidencia histórica.
- **U10-B5-I08 — Aislamiento:** una evaluación no cruza ni infiere contexto entre Empresas.
- **U10-B5-I09 — Reserva explícita:** un estado reservado carece de efecto hasta definición futura compatible con MT-U10.
- **U10-B5-I10 — Sin mecanismo implícito:** B5 no define algoritmos, comparaciones, operadores, fórmulas, cálculos, orden de ejecución, componentes, procesos ni implementación.
- **U10-B5-I11 — Contexto de evaluación conceptual:** el contexto de evaluación agrupa elementos conceptuales pertinentes sin confundirse con sus componentes ni constituir modelo físico, objeto de implementación o estructura de datos.
- **U10-B5-I12 — Significado único:** una misma condición contractual bajo el mismo contexto de evaluación conserva un único significado semántico, independiente de implementación, interfaz, contexto operativo y mecanismo técnico.

## B5.7 Dependencias y exclusiones

B5 depende de B0/B1 para dimensión, cuota y referencia contractual; de B2 para consumo y referencia de consumo; de B3 para período; y de B4 para conservar que evaluación y enforcement son distintos. También depende de MT-U3, MT-U9, ADR-SAAS-001 a ADR-SAAS-010 y el MASTER-SECURITY-PLAN para conservar aislamiento, autoridades canónicas, integridad y mínima autoridad.

Quedan fuera de B5 algoritmos, comparaciones concretas, operadores, fórmulas, cálculos, orden de ejecución, puntos de aplicación, componentes, middleware, reglas, procesos, APIs, UI, almacenamiento, implementación, permisos, bloqueos, denegaciones, errores, códigos, respuestas, excepciones, modos degradados, grace periods, cambios de plan, bootstrap, onboarding, Panel SaaS, procesos administrativos y toda modificación a lifecycle, comercial, fiscalidad o datos tenant.

## B5.8 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención de B5 |
|---|---|---|
| Evaluar contra Plan vigente | Condición contratada alterada silenciosamente. | B5-P01 y U10-B5-I01. |
| Confundir evaluación con observación | Consumo inventado o contrato alterado por uso. | B5.2 y B5-P02. |
| Confundir evaluación con enforcement | Resultado conceptual convertido en acción no aprobada. | B5.2 y B5-P03. |
| Tratar positiva como permiso o negativa como bloqueo | Bypass de autorización o enforcement implícito. | B5-P03 y U10-B5-I04. |
| Ocultar indeterminación | Resultado arbitrario sin contexto contractual suficiente. | B5-P04 y U10-B5-I05. |
| Interpretar dimensión con semánticas múltiples | Evaluaciones contradictorias por contexto operativo. | B5-P05 y U10-B5-I02. |
| Interpretaciones divergentes del mismo contexto de evaluación | Implementaciones distintas atribuyen significados incompatibles a una misma condición. | B5-P07, U10-B5-I11 y U10-B5-I12. |
| Cruzar contexto entre Empresas | Fuga de información o control cross-tenant. | B5-P05 y U10-B5-I08. |
| Afectar lifecycle, fiscalidad o Panel | Bypass de autoridades ya aprobadas. | B5.5 y U10-B5-I06/I07. |

## B5.9 Criterios de aceptación

B5 está completo cuando:

- define evaluación como estado semántico distinto de observación y enforcement;
- define contexto de evaluación como agrupación conceptual distinta de referencia contractual, referencia de consumo, período, cuota y consumo observado;
- relaciona evaluación con referencia contractual, dimensión, cuota, consumo, referencia de consumo y período sin confundirlos;
- define estados positiva, negativa, indeterminada y reservada sin asociar efectos operativos;
- preserva contrato estable, semántica única, aislamiento y separación de lifecycle, autorización, comercial, fiscalidad y Panel SaaS;
- no define algoritmos, comparaciones, operadores, fórmulas, cálculos, orden, puntos de aplicación, procesos, respuestas, bloqueos, permisos ni implementación.

---

## Cierre de U10-B4 y U10-B5

U10-B4 y U10-B5 quedan listos para revisión arquitectónica. Su aprobación completa el modelo conceptual de relaciones entre contrato, consumo, período, evaluación y enforcement, sin habilitar mecanismos técnicos ni efectos operativos. No modifica decisiones de MT-U3, MT-U9 o U10-B0/B3.
