# Metodología oficial de desarrollo basada en Goal

## 1. Propósito

Esta metodología gobierna cómo se desarrolla Café Atrato hasta su primera versión comercial. No forma parte del producto, no añade funcionalidad y no sustituye decisiones de dominio o arquitectura.

Su diseño busca una sola cosa: entregar el MVP con el menor trabajo que mantenga seguridad, coherencia y capacidad de recuperación.

Codex ejerce responsabilidad técnica como Lead Engineer, no autoridad de producto. Puede recomendar cambios de planificación, arquitectura o prioridad y explicar sus consecuencias, pero el Product Owner conserva la decisión sobre alcance funcional, criterios comerciales y prioridades. Ninguno de esos elementos cambia sin aprobación explícita.

Principio de admisión:

> ¿Este trabajo acerca el proyecto al MVP?

Si la respuesta es no, el trabajo va al backlog. “Sería útil”, “ya que estamos” o “mejora la calidad” no bastan. Debe existir una relación verificable con el resultado del Goal o con un bloqueo real para alcanzarlo.

## 2. Decisiones de diseño

Se adopta `Goal → Milestone → Epic → Pull Request` porque el repositorio ya trabaja mediante programas, unidades, bloques y PR secuenciales. La jerarquía conserva esa fortaleza, pero elimina nombres paralelos como fuente de estado:

- hay un solo objetivo de producto, no un Goal por PR;
- los Milestones expresan resultados comerciales verificables, no fechas arbitrarias;
- los Epics agrupan capacidades dependientes;
- los PR son la unidad mínima de integración y auditoría.

No se añade un nivel “Task”. Las tareas locales viven en el plan del PR y desaparecen al cerrarlo. Tampoco se usan Epics de GitHub como fuente obligatoria: el Goal versionado en el repositorio es la autoridad y los enlaces externos son evidencia.

## 3. Fuentes de verdad

La precedencia para decidir qué hacer es:

1. ADR aceptados y vigentes.
2. Documentos maestros sincronizados con esos ADR.
3. Goal vivo: estado, Milestone y Epic activos.
4. Alcance aprobado del PR activo.
5. Código y pruebas integrados en `main` como evidencia del estado real.
6. Backlog como inventario de candidatos, nunca como autorización automática.

Una contradicción no se resuelve eligiendo silenciosamente la fuente conveniente. Se detiene la parte afectada y se corrige la divergencia o se promueve la decisión arquitectónica correspondiente.

## 4. Estructura documental

```text
AGENTS.md
docs/
  governance/
    METODOLOGIA-GOAL.md
  goals/
    GOAL-MVP-COMERCIAL.md
.github/
  pull_request_template.md
ADR-*.md
BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md
```

- `AGENTS.md` contiene reglas cortas y ejecutables que se cargan en cada sesión.
- `METODOLOGIA-GOAL.md` explica el proceso estable; cambia rara vez.
- `GOAL-MVP-COMERCIAL.md` es el único tablero vivo; solo cambia por merge de un PR, aprobación de un ADR o cambio de planificación aprobado.
- La plantilla de PR transporta trazabilidad y evidencia sin crear un sistema adicional.
- Los ADR y documentos históricos permanecen donde están para no romper referencias durante el MVP. Su reorganización no es trabajo del Goal.
- El backlog conserva trabajo todavía no admitido. Un elemento solo entra al Goal mediante una actualización explícita de alcance.

## 5. Ciclo de trabajo

### 5.1 Intake

Para cualquier solicitud:

1. Formula el resultado verificable.
2. Vincúlalo al Goal, Milestone y Epic activos.
3. Decide si desbloquea el siguiente PR esperado.
4. Si no hay vínculo, propón backlog y detente.
5. Si hay vínculo pero cambia alcance, actualiza el Goal con aprobación antes de implementar.

Los fixes urgentes solo entran si bloquean operación, seguridad, integridad, cumplimiento o el camino crítico del MVP. En ese caso se vinculan al Epic afectado; no crean un Goal nuevo.

### 5.2 Preflight

Antes de tocar código revisa solo lo necesario, pero no menos de:

- Goal, Milestone, Epic y siguiente PR;
- árbol de trabajo y rama;
- alcance y dependencias;
- ADR y arquitectura relacionados;
- implementación y pruebas existentes;
- deuda que pueda invalidar el cambio;
- historial y PR relacionados.

El preflight termina con: alcance incluido, fuera de alcance, criterios de aceptación, validaciones, riesgos y rollback.

### 5.3 Decisión arquitectónica

Se requiere ADR antes de implementar cuando aparece una decisión nueva o incompatible sobre:

- autoridad o frontera entre cliente y servidor;
- entidades, estados o invariantes de dominio;
- persistencia, migraciones o compatibilidad;
- aislamiento tenant, seguridad o identidad;
- integración externa o recuperación;
- sustitución de una decisión aceptada.

El ADR comienza `Propuesto`, presenta contexto, alternativas, decisión recomendada, consecuencias, migración y rollback. La implementación espera aprobación explícita. Al aprobarlo, el ADR pasa a `Aceptado` y los maestros afectados se sincronizan.

### 5.4 Implementación

- Una iniciativa por rama y un objetivo claro por PR.
- Solo el siguiente corte mínimo que puede validarse e integrarse.
- Sin trabajo de otros Epics, limpieza cosmética ni abstracciones anticipadas.
- Commits pequeños con una razón única.
- Migraciones con preflight, evidencia, idempotencia y rollback cuando apliquen.

Si aparece una dependencia no planificada durante la implementación, se detiene el alcance afectado. La dependencia, su impacto y las alternativas se documentan en el PR; cualquier cambio del Goal o de la planificación se propone y espera aprobación antes de continuar. La dependencia no se incorpora silenciosamente al alcance.

Una entrega de documentación o certificación puede ser un PR válido si cierra un criterio del MVP; no se fuerza código donde no hace falta.

### 5.5 Validación

La matriz se decide por superficie:

| Superficie | Evidencia mínima |
|---|---|
| Documentación/metodología | enlaces, consistencia, `git diff --check` |
| Aplicación TypeScript/React | typecheck, pruebas específicas, build |
| Cloud Functions | build y suite de Functions afectada |
| Firestore Rules | pruebas de Rules con emulador |
| Configuración/migración | pruebas, dry-run/preflight, evidencia y rollback |
| Flujo crítico de usuario | E2E del flujo y canales afectados |
| Distribución Electron | build/artefacto y prueba en el canal real |

El CI es necesario, pero no reemplaza validaciones manuales o de hardware que formen parte del criterio de aceptación.

### 5.6 Auditoría de PR

La auditoría ocurre sobre el diff final y solo evalúa:

- alineación con Goal, Milestone y Epic;
- ADR, arquitectura y dominio;
- seguridad y aislamiento;
- persistencia y migraciones;
- compatibilidad y rollback;
- cobertura y evidencia de pruebas;
- respeto estricto del alcance.

No solicita refactors cosméticos, optimizaciones hipotéticas o mejoras fuera de alcance. El resultado binario es `APROBADO PARA MERGE` o `NO APROBADO PARA MERGE`; cualquier rechazo identifica el bloqueo verificable.

### 5.7 Merge y cierre

Antes del merge:

1. auditoría aprobada;
2. validaciones requeridas aprobadas;
3. documentación alineada;
4. `gh pr checks <PR>` completamente verde y sin pendientes;
5. PR integrable con `main` y sin fallos conocidos.

El Goal solo se actualiza ante uno de tres eventos oficiales: merge de un PR, aprobación de un ADR o cambio de planificación aprobado. Durante la implementación, la evidencia y los cambios provisionales permanecen en el PR; no se modifica continuamente el Goal.

Ante un evento oficial se actualizan solo los campos vivos afectados: progreso, estado, PR completados, siguiente PR, Milestone activo y Epic activo. Después de un merge también se elimina la rama cuando corresponda.

## 6. Gestión del Goal

Solo existe un Goal activo. Su alcance cambia únicamente con aprobación explícita. Un elemento del backlog no adquiere prioridad por antigüedad, facilidad o porque una dependencia automática abrió un PR.

Estados permitidos:

- `ACTIVO`: existe un siguiente resultado ejecutable.
- `BLOQUEADO`: una dependencia externa o decisión aprobatoria impide continuar; se registra la condición concreta.
- `COMPLETADO`: se cumple toda la Definition of Done y el resultado está en `main`.

Un Milestone se cierra por resultado, no por porcentaje. Un Epic se cierra cuando todos sus criterios están integrados y demostrados. Un PR cerrado sin merge no cuenta como progreso del Goal.

## 7. Definition of Done de un Pull Request

Un PR está `DONE` únicamente cuando:

- su alcance aprobado está completamente implementado;
- todas las pruebas relevantes pasaron;
- la documentación está alineada con el resultado;
- la auditoría concluyó `APROBADO PARA MERGE`;
- toda la CI está en verde y no quedan checks pendientes;
- el PR fue integrado en `main`.

La aprobación o el verde de CI no bastan por separado. Hasta que ocurre el merge, el PR sigue abierto o listo para merge, no `DONE`.

## 8. Definition of Done del Goal

El Goal solo puede cerrarse si:

- el alcance funcional completo del MVP está implementado o certificado;
- la arquitectura aprobada y los ADR se mantienen vigentes y sincronizados;
- la documentación describe el sistema real;
- todas las pruebas relevantes pasan;
- cada PR integrado tuvo auditoría aprobada;
- la CI de la integración final está completamente verde;
- todo el alcance está integrado en `main`;
- el producto puede operar como primera versión comercial, incluida recuperación y canal de caja acordado.

Compilar no es Done. Terminar un PR tampoco es terminar el Goal.

## 9. Hallazgos de adopción

La adopción parte de una base avanzada, pero documentalmente divergente:

- `main` está en `f66016e` al iniciar la metodología.
- Los PR #135–#146 consolidaron configuración tenant, R1-A/R1-B y el portal de operador.
- El backlog vigente ubica el portal SaaS fuera del MVP, aunque #141–#146 ya lo integraron. Se trata como baseline existente, no como precedente para ampliar el Goal.
- R1 aún tiene trabajo crítico pendiente para completar la autoridad de servidor de ventas y el corte final de Rules.
- CI cubre typecheck, builds y varias suites, pero todavía no ejecuta Rules ni toda la certificación operativa indicada por el backlog.
- Hay estados documentales por reconciliar. Esa reconciliación debe hacerse dentro del PR funcional que dependa de cada documento, antes de su merge; no se abre una limpieza masiva ajena al camino crítico.
