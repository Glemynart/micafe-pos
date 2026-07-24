# MT-U10 — U10-B6 y U10-B7: evolución y cierre arquitectónico

> **Estado:** especificación arquitectónica de cierre para revisión.
> **Alcance:** casos especiales y evolución conceptual (U10-B6), y cierre, consistencia y aceptación global (U10-B7).
> **Precondición:** U10-B0 a U10-B5 aprobados. Este documento solo consolida y verifica sus contratos; no redefine sus conceptos ni autoridades.

## Autoridad y propósito

Este documento cierra formalmente la arquitectura conceptual de MT-U10. Su función es comprobar que los casos límite y la evolución futura se puedan interpretar sin romper los contratos aprobados, y consolidar los criterios de conformidad de toda la unidad.

La jerarquía aplicable es: ADR SaaS aceptados, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, MT-U3, MT-U9, U10-B0/B1, U10-B2/B3, U10-B4/B5 y `MASTER-SECURITY-PLAN.md`. Ante conflicto, prevalece esa jerarquía. B6/B7 no crean conceptos fundamentales, autoridades, mecanismos ni efectos operativos.

---

# U10-B6 — Casos especiales y evolución arquitectónica

## B6.1 Propósito y límite

U10-B6 identifica situaciones que deben poder interpretarse con las definiciones ya aprobadas sin inventar semántica, ampliar autoridades ni adelantar diseño técnico. No establece procedimientos, decisiones comerciales, procesos administrativos, migraciones, cambios de plan, períodos de gracia, bootstrap, onboarding ni implementación.

El tratamiento de cada caso se limita a indicar el contrato que debe preservarse. La unidad no define cómo producir, procesar, resolver ni registrar ningún caso.

## B6.2 Casos especiales previstos

| Caso conceptual | Interpretación obligatoria | Contratos que deben preservarse |
|---|---|---|
| Conjunto de límites vacío | No existe límite ni enforcement para una dimensión no declarada. La ausencia es válida y no autoriza inferir una condición por defecto. | U10-B0-I08, U10-B1-I03. |
| Dimensión ilimitada | La condición contractual declara ausencia de tope; esto no elimina lifecycle, autorización, seguridad, integridad ni conservación. | U10-B1-I04, U10-B4-I05/I06. |
| Dimensión sin período | La dimensión no requiere período salvo que su referencia contractual lo declare. No se inventa ciclo, renovación ni reinicio. | U10-B3-P01, U10-B3-I01. |
| Forma temporal reservada | Carece de semántica y efecto hasta una definición futura compatible y contratada expresamente. | U10-B3-I09, U10-B5-I09. |
| Clase de consumo reservada | No produce consumo interpretable ni condición implícita antes de su definición compatible. | U10-B2-I10. |
| Estado de evaluación indeterminado | No se transforma tácitamente en positivo o negativo y no se convierte en una consecuencia operativa. | U10-B5-I05, U10-B5-I04. |
| Estado de evaluación reservado | No adquiere significado ni efecto antes de definición futura compatible con MT-U10. | U10-B5-I09. |
| Referencia contractual existente frente a oferta global evolucionada | La Empresa sigue regida por su referencia contractual; la oferta global posterior no reescribe silenciosamente condiciones ya contratadas. | U10-B0-I02, U10-B4-I01, U10-B5-I01. |
| Empresa fundacional | Conserva el plan grandfathered sin límites ni vencimientos retroactivos. | U10-B0-I07. |
| Observación sin dimensión contractual aplicable | No se interpreta como consumo atribuible de la oferta; no se crea condición por inferencia. | U10-B2-I02, U10-B2-I03. |
| Contexto de evaluación insuficiente o incoherente | La evaluación permanece indeterminada; no se inventa contrato, cuota, período, consumo ni resultado. | U10-B5-I03/I05. |
| Misma condición bajo mismo contexto de evaluación | Conserva un único significado semántico, independiente de interfaz, implementación, contexto operativo o mecanismo técnico. | U10-B5-I12. |
| Empresa fuera del lifecycle que permita operación | Los límites no sustituyen lifecycle ni habilitan acceso, conservación o escritura. | U10-B0-I03, U10-B4-I05. |
| Datos fiscales, snapshots o ledger históricos | Límites, consumo, evaluación y enforcement no los alteran ni reinterpretan. | U10-B0-I06, U10-B4-I08, U10-B5-I07. |
| Contexto entre empresas | No se agrega, transfiere, infiere ni evalúa información de una Empresa desde otra. | U10-B2-I01, U10-B4-I04, U10-B5-I08. |

## B6.3 Principios de evolución

### B6-P01 — Evolución por semántica explícita

Toda extensión futura debe declarar semántica contractual explícita antes de adquirir significado. Una clase, forma o estado reservado no puede convertirse en comportamiento implícito por implementación, interfaz, infraestructura o práctica operativa.

### B6-P02 — Compatibilidad conceptual del contrato

La evolución de la oferta global no puede reinterpretar silenciosamente una referencia contractual existente. Las condiciones contratadas conservan su significado para la Empresa mientras esa referencia sea aplicable.

### B6-P03 — Extensión sin nueva autoridad

La evolución de dimensiones, períodos, consumo, evaluación o enforcement no crea roles, facultades, membresías, claims, operadores, comandos, soporte, Panel SaaS ni acceso tenant. Las autoridades de MT-U3 y MT-U9 permanecen exclusivas.

### B6-P04 — Separación persistente de modelos

Una extensión conserva la dirección conceptual: la referencia contractual define condiciones; la referencia de consumo y el período contextualizan observaciones; evaluación expresa estado semántico; enforcement preserva aplicación futura coherente. Ningún sentido invierte esa dirección ni sustituye otro modelo.

### B6-P05 — Integridad y aislamiento no negociables

Toda extensión sigue acotada a una Empresa y no puede debilitar lifecycle, autorización, fiscalidad, snapshots, ledger, conservación, seguridad ni la frontera plataforma–tenant.

### B6-P06 — Neutralidad de implementación

La compatibilidad conceptual se determina por los contratos de MT-U10, no por modelos físicos, técnicas de medición, mecanismos de ejecución, interfaz ni infraestructura. B6 no autoriza ninguno de ellos.

## B6.4 Preservación de fronteras

| Frontera | Preservación requerida durante evolución |
|---|---|
| Referencia contractual ↔ oferta global | Las condiciones ya contratadas mantienen procedencia y significado estables. |
| Contrato ↔ consumo | La observación no redefine dimensión, cuota, límite ni capacidad. |
| Referencia de consumo/período ↔ contrato | Contextualizan observación; no sustituyen condiciones comerciales. |
| Evaluación ↔ enforcement | Estado semántico y aplicación futura siguen siendo conceptos distintos. |
| Límites ↔ lifecycle | Los límites no crean estados empresariales ni modifican acceso o conservación. |
| Límites ↔ autorización | Ninguna condición comercial concede o revoca identidad, membresía, rol, claim, facultad o permiso. |
| Límites ↔ fiscalidad | No se altera numeración, emisión, snapshots, ledger, ventas ni evidencia histórica. |
| Plataforma ↔ tenant | Empresa mantiene el aislamiento; Panel, operador, soporte y plataforma no adquieren acceso o autoridad tenant por MT-U10. |

## B6.5 Invariantes de evolución

- **U10-B6-I01 — Sin semántica implícita:** una extensión reservada no tiene significado ni efecto hasta definición contractual explícita y compatible.
- **U10-B6-I02 — Contrato no retroactivo:** la evolución de oferta no reescribe silenciosamente la referencia contractual de una Empresa.
- **U10-B6-I03 — Autoridades preservadas:** una extensión no modifica lifecycle, autorización, fiscalidad, comercial, plataforma ni tenant.
- **U10-B6-I04 — Dirección preservada:** contrato, consumo, evaluación y enforcement conservan sus responsabilidades no sustitutivas.
- **U10-B6-I05 — Semántica única:** una condición y un contexto de evaluación idénticos mantienen un único significado independiente de implementación.
- **U10-B6-I06 — Aislamiento e integridad:** ninguna extensión cruza Empresas ni modifica evidencia histórica, fiscal, snapshot o ledger.
- **U10-B6-I07 — Sin mecanismo derivado:** los casos especiales y la evolución no implican procedimiento, algoritmo, proceso, migración, interfaz, almacenamiento ni implementación.

## B6.6 Riesgos arquitectónicos

| Riesgo | Consecuencia | Contención conceptual |
|---|---|---|
| Convertir una reserva en comportamiento implícito | Restricción o significado no contratado. | B6-P01 y U10-B6-I01. |
| Cambiar condiciones por evolución de la oferta | Retroactividad silenciosa. | B6-P02 y U10-B6-I02. |
| Usar un caso especial para abrir autoridad | Escalamiento de privilegios o bypass tenant. | B6-P03 y U10-B6-I03. |
| Invertir contrato, consumo, evaluación o enforcement | Decisiones contradictorias o contrato alterado por uso. | B6-P04 y U10-B6-I04. |
| Interpretar límites como lifecycle o fiscalidad | Acceso, conservación o evidencia histórica indebidamente afectados. | B6-P05 y U10-B6-I06. |
| Resolver con la implementación una ambigüedad conceptual | Divergencia entre implementaciones y pérdida de compatibilidad. | B6-P06 y U10-B6-I05/I07. |

## B6.7 Criterios de aceptación

B6 está completo cuando:

- cubre casos especiales exclusivamente mediante contratos existentes;
- conserva como válidos conjunto vacío, ilimitado, reserva e indeterminación sin inferir efectos;
- preserva estabilidad contractual y grandfathering fundacional;
- preserva separación entre contrato, consumo, evaluación y enforcement;
- preserva lifecycle, autorización, fiscalidad, aislamiento y autoridades de MT-U3/MT-U9;
- establece evolución explícita y compatible sin procedimientos, migraciones, cambios de plan ni implementación.

---

# U10-B7 — Cierre, consistencia y aceptación global

## B7.1 Objetivo de cierre

U10-B7 certifica que MT-U10 dispone de un modelo conceptual completo y coherente para límites definidos por planes: desde la condición contratada hasta consumo, períodos, evaluación, enforcement y evolución. Esta certificación no aprueba ni diseña implementación, rendimiento, pruebas funcionales, UI, API, almacenamiento, reglas, funciones ni procesos operativos.

## B7.2 Matriz de dependencias B0–B7

| Bloque | Aporta | Depende de | No autoriza |
|---|---|---|---|
| **B0 — Fundamentos** | Fronteras, separación comercial/consumo/lifecycle y principios base. | MT-U3, MT-U9, ADR y seguridad aprobados. | Medición, límites aplicados o implementación. |
| **B1 — Límites** | Dimensión, referencia contractual, cuota, capacidad, disponibilidad y clases de límite. | B0. | Consumo, períodos, evaluación o enforcement operativo. |
| **B2 — Consumo** | Observación, utilización, atribución y clases de consumo. | B0–B1. | Medición, cálculo, persistencia o consecuencias. |
| **B3 — Períodos** | Contexto temporal contractual y continuidad conceptual. | B0–B2. | Calendarios, tareas, ciclos técnicos o efectos comerciales. |
| **B4 — Enforcement** | Fidelidad conceptual de condiciones contratadas frente a su contexto. | B0–B3. | Evaluación, puntos de aplicación o efectos operativos. |
| **B5 — Evaluación** | Estados semánticos y contexto de evaluación. | B0–B4. | Algoritmos, orden, permisos, bloqueos o respuestas. |
| **B6 — Casos especiales y evolución** | Compatibilidad conceptual y preservación de invariantes. | B0–B5. | Procedimientos, migraciones o nuevas autoridades. |
| **B7 — Cierre** | Consolidación y criterios globales de aceptación. | B0–B6. | Implementación o decisiones posteriores. |

La dependencia es secuencial y no circular: cada bloque utiliza únicamente contratos establecidos por los anteriores. B4 no depende de B5 para definirse; B5 usa B4 solo para mantener la distinción entre evaluación y enforcement. B6/B7 consolidan sin redefinir.

## B7.3 Consolidación de principios arquitectónicos

| Principio consolidado | Expresión en MT-U10 |
|---|---|
| Empresa como sujeto aislado | Toda condición, observación, contexto, evaluación o aplicación conceptual se acota a una Empresa. |
| Contrato estable y dirección única | La referencia contractual define condiciones; uso observado no redefine el contrato. |
| Semántica única y explícita | Cada dimensión y condición conserva significado contractual único; las reservas no producen semántica implícita. |
| Separación de modelos | Capacidad, disponibilidad, existencia, utilización, consumo, período, evaluación y enforcement no se sustituyen entre sí. |
| Contexto no sustitutivo | Referencia de consumo, período y contexto de evaluación aportan contexto sin reemplazar contrato, cuota u observación. |
| Resultado no operativo | Evaluación y enforcement conceptuales no son permisos, bloqueos, respuestas ni efectos por sí mismos. |
| Lifecycle y autorización canónicos | Límites no modifican `Empresa.estado`, conservación, membresía, roles, claims, facultades ni permisos. |
| Integridad histórica y fiscal | MT-U10 no altera fiscalidad, snapshots, ledger, numeración, ventas ni evidencia histórica. |
| Neutralidad de implementación | La semántica no depende de interfaz, infraestructura, técnica de medición, orden ni mecanismo técnico. |
| Evolución compatible | La oferta global no reescribe contratos existentes y toda extensión requiere semántica explícita. |

## B7.4 Consolidación de invariantes obligatorios

La implementación futura deberá preservar como mínimo los siguientes grupos de invariantes ya aprobados:

| Grupo | Invariantes consolidados |
|---|---|
| Contrato y límites | U10-B0-I02/I08; U10-B1-I01–I05/I08/I11. |
| Consumo y contexto | U10-B2-I01–I11; U10-B3-I01–I09. |
| Enforcement y evaluación | U10-B4-I01–I10; U10-B5-I01–I12. |
| Evolución | U10-B6-I01–I07. |
| Autoridades externas preservadas | Empresa/lifecycle de MT-U3 y ADR-SAAS-009; identidad, tenancy, fiscalidad, plataforma y auditoría según ADR-SAAS-001 a ADR-SAAS-010 y MT-U9. |

La consolidación es referencial: no sustituye, relaja ni modifica los invariantes de sus bloques de origen.

## B7.5 Consolidación de riesgos

| Riesgo transversal | Consecuencia a evitar | Contratos de contención |
|---|---|---|
| Retroactividad contractual | Condiciones existentes reescritas por oferta actual o evolución. | B0-I02, B4-I01, B5-I01, B6-I02. |
| Semántica múltiple o implícita | Interpretaciones divergentes entre contextos o implementaciones. | B1-I11, B2-I03, B5-I12, B6-I01/I05. |
| Confusión entre conceptos | Cuota, consumo, período, evaluación o enforcement usados como sustitutos. | B1–B5 y sus fronteras respectivas. |
| Escalamiento de privilegios | Límite, resultado, panel o consumo tratado como autorización. | B0-I05, B2-I07, B4-I06/I09, B5-I04/I06. |
| Violación de lifecycle | Condición comercial altera acceso o conservación. | B0-I03, B4-I05, B5-I06, B6-I03. |
| Fuga cross-tenant | Contexto, observación o evaluación cruza Empresas. | B0-I01, B2-I01, B4-I04, B5-I08, B6-I06. |
| Daño fiscal o histórico | Límites modifican evidencia, snapshots, ledger o numeración. | B0-I06, B4-I08, B5-I07, B6-I06. |
| Implementación convertida en autoridad | Infraestructura, interfaz u orden redefinen contrato. | B0-P09, B2-P05/P06, B3-P05, B4-P06, B5-P06/P08, B6-P06. |

## B7.6 Checklist de coherencia externa

| Autoridad | Verificación de coherencia |
|---|---|
| `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` | Respeta Empresa como aislamiento, Plan global versionado, Suscripción 1:1, plan grandfathered y MT-U10 como métricas de consumo/enforcement de límites sin alterar lifecycle. |
| MT-U3 | Conserva Plan, referencia contractual, Suscripción y lifecycle como autoridades separadas; no rediseña comercial, trial, gracia, bootstrap ni onboarding. |
| MT-U9 | No crea operador, facultad, comando, auditoría, soporte, impersonación ni autoridad de Panel SaaS; el Panel sigue siendo proyección. |
| ADR-SAAS-001 | No debilita aislamiento tenant ni convierte datos de límite en autorización cross-tenant. |
| ADR-SAAS-002 y ADR-SAAS-006 | No modifica identidad global, claims, membresías, rol ni tenant activo. |
| ADR-SAAS-003 y ADR-SAAS-009 | Mantiene la separación comercial/lifecycle y reconoce que límites comerciales requieren dominio propio, sin usar Suscripción como autorización. |
| ADR-SAAS-004, 007 y 008 | No altera Empresa, bootstrap, configuración, numeración o autoridad fiscal. |
| ADR-SAAS-005 | No modifica ni amplía el rol supervisor tenant. |
| ADR-SAAS-010 | No altera venta, inventario, fiscalidad, snapshots, ledger ni invariantes históricos. |
| `MASTER-SECURITY-PLAN.md` | Conserva aislamiento por Empresa, mínima autoridad, desconfianza de entradas de cliente, protección de datos y prevención de abuso sin diseñar controles técnicos. |

## B7.7 Criterios finales de aceptación de MT-U10

MT-U10 está arquitectónicamente completo cuando se verifica que:

1. B0–B7 forman una secuencia sin dependencias circulares y cada bloque preserva los contratos de los anteriores.
2. La cadena conceptual se mantiene sin sustituciones: Empresa → Suscripción → referencia contractual → dimensión/condición → referencia de consumo y período cuando corresponda → consumo observado → evaluación → enforcement conceptual.
3. Ningún elemento de MT-U10 es tratado como identidad, membresía, rol, claim, facultad, permiso, estado de lifecycle, precio, cobro, factura, dato fiscal o autoridad de Panel SaaS.
4. La referencia contractual contratada es estable; no existen retroactividad silenciosa ni límites implícitos, y la empresa fundacional conserva grandfathering.
5. Las dimensiones conservan semántica única; el contexto de evaluación y sus resultados no dependen de implementación, interfaz, infraestructura, orden o contexto operativo.
6. Las observaciones, períodos, evaluación y enforcement se mantienen separados de sus mecanismos futuros, sin modelos físicos, algoritmos, puntos de aplicación, procesos, respuestas ni efectos operativos.
7. Lifecycle, autorización, fiscalidad, snapshots, ledger, conservación, plataforma–tenant y datos históricos mantienen sus autoridades e invariantes canónicos.
8. Casos vacío, ilimitado, reservado e indeterminado conservan significado explícito y no generan por inferencia límites, permisos, bloqueos o comportamiento implícito.
9. Las extensiones futuras solo pueden evolucionar de forma compatible, explícita y aislada por Empresa.
10. El diseño permanece dentro del alcance de MT-U10 y no anticipa MT-U11, MT-U12 ni una fase de implementación.

## B7.8 Condiciones de rechazo

Una propuesta que pretenda apoyarse en MT-U10 debe rechazarse arquitectónicamente si:

- altera, sustituye o infiere la referencia contractual desde una oferta vigente, consumo, interfaz o infraestructura;
- asigna más de una semántica a una dimensión o condición bajo el mismo contexto de evaluación;
- usa evaluación o enforcement como permiso, bloqueo, respuesta, transición de lifecycle o decisión fiscal;
- cruza Empresas, convierte plataforma/Panel en autoridad tenant o debilita membresía/claims;
- modifica o reinterpreta snapshots, ledger, ventas, numeración, evidencia fiscal o datos históricos;
- introduce modelos físicos, almacenamiento, APIs, reglas, componentes, procesos, algoritmos, cálculos, orden de ejecución o implementación como si fueran contratos de MT-U10;
- amplía el alcance hacia comercial, cambios de plan, grace periods, bootstrap, onboarding, MT-U11 o MT-U12.

## B7.9 Cierre formal

Con B6 y B7, MT-U10 queda cerrado como arquitectura conceptual de consumo, cuotas, límites, períodos, evaluación y enforcement. Este cierre no congela la evolución futura de la arquitectura: establece el contrato arquitectónico sobre el cual deberán apoyarse las futuras unidades e implementaciones. Toda evolución futura deberá ser compatible con los principios, invariantes y autoridades definidos en MT-U10; no puede reinterpretar ni sustituir las autoridades ya establecidas en MT-U3, MT-U9, los ADR SaaS ni el `MASTER-SECURITY-PLAN.md`. La unidad queda preparada para que fases futuras diseñen e implementen sobre estos contratos, previa revisión de conformidad con esta línea base. Este documento no habilita por sí mismo ninguna implementación ni modifica decisiones previamente aprobadas.
