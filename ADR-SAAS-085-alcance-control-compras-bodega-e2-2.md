# ADR-SAAS-085 — Alcance del control de compras Bodega en E2.2

**Estado:** ACEPTADO — 2026-10-18, por decisión explícita del responsable del proyecto.
**Fecha de propuesta:** 2026-10-18.
**Fecha de aceptación:** 2026-10-18.
**Última revisión:** 2026-10-18.
**Goal:** `G-SAAS-02` → `M2` → `E2.2`.
**Decisor:** responsable del proyecto. Aceptación registrada en la conversación de trabajo el 2026-10-18: “Aceptar completa: Opción 2 y secuencia del tenant nuevo”.
**Relacionados:** ADR-SAAS-071, ADR-SAAS-072, ADR-SAAS-075, ADR-SAAS-081 y ADR-SAAS-084.
**Supersede parcialmente:** ADR-SAAS-081 únicamente para (a) limitar la aplicación del control obligatorio al flujo Bodega dentro del corte E2.2, preservando el comportamiento efectivo de los verticales no-Bodega excluidos hasta un corte posterior aprobado; y (b) permitir para el tenant Bodega nuevo y vacío de E2.2 la secuencia Functions compatibles → Rules global compatibles → oferta/Bootstrap → inicialización canónica del control. Las demás invariantes y el flujo normal de cortes de ADR-SAAS-081 permanecen vigentes.
**Límite:** la aceptación habilita la implementación y pruebas locales mediante un PR técnico revisable. No autoriza despliegues, pausas, cambios IAM, datos remotos, oferta, tenant, cuenta ni Trial.

## Contexto

El tenant objetivo de E2.2 es exclusivamente `distribuidora-las-jimenez`,
vertical `BODEGA_MVP1`. `Cafe Atrato` y `Prueba` son entornos de prueba fuera
del corte operativo; no se requiere seleccionarlos ni designarlos y no deben
recibir cambios tenant-scoped de Rules, controles, datos o configuración.

Los ADR aceptados contienen decisiones que requieren una aclaración explícita
antes de cambiar el contrato de ejecución:

- ADR-SAAS-072 acepta bloquear create/delete directos de `/compras` solo para
  Bodega y conservar las reglas de los demás verticales.
- ADR-SAAS-075 acepta que `registrarCompraOperativaV1` rechace Bodega en
  operaciones nuevas y replays, conservando el comportamiento de otros
  verticales.
- ADR-SAAS-081 adopta un control por tenant, fail-closed ante ausencia o forma
  inválida, y prescribe que las callables de compra y Rules consuman el control
  durante los cortes. No declara explícitamente que superseda ADR-SAAS-072/075.
- En `main @ 1918c0916f6497a34c01cbe17fded15992cfac2f`,
  `comprasHabilitadasParaTenant()` exige control para todos los tenants
  no-Bodega y `exigirComprasActivasEnTransaccion()` exige el control desde el
  núcleo compartido usado por la ruta legacy y la Bodega. Por tanto, una
  actualización de ese candidato puede cambiar o bloquear compras no-Bodega
  sin control, aunque esos tenants no estén en el corte de E2.2.
- `firestore-rules/bodega-purchases.test.ts` además codifica el fail-closed
  universal para un tenant sintético `GENERAL` sin control. Preservar no-Bodega
  requiere aceptar formalmente un alcance distinto para E2.2 y reemplazar esa
  expectativa por pruebas de equivalencia deliberadas; no basta con omitir los
  tenants de prueba de la operación remota.
- La Ruleset `cloud.firestore` es compartida por la base `(default)`; Firebase
  no despliega una Ruleset independiente por `empresaId`. Se puede preservar
  el resultado efectivo de tenants excluidos dentro de una Ruleset nueva, pero
  no evitar que cambie el recurso global si se despliegan Rules.

La última lectura documentada de los tenants de prueba y controles fue el
2026-10-18 18:06–18:07Z: no encontró `vertical` en las configuraciones
consultadas y observó cero controles. Es evidencia histórica, no una lectura
actual. El candidato de `main` sigue siendo incompatible con la exigencia de no
afectar su comportamiento de compra mientras falten controles.

## Impulsores de decisión

- Exigir control canónico v1 `ACTIVA` para compras del tenant Bodega objetivo.
- Denegar siempre escrituras cliente directas de compra para Bodega.
- Mantener el rechazo de la callable legacy para Bodega, incluida la ruta de
  replay, según ADR-SAAS-075.
- Preservar el comportamiento efectivo de los verticales fuera del alcance de
  E2.2, sin crearles controles ni cambiar sus documentos.
- Separar las mutaciones tenant-scoped de los despliegues globales de Rules y
  Functions.
- Conservar el fail-closed y la auditoría del control donde el mecanismo esté
  habilitado; no introducir estados implícitos sin decisión formal.

## Opciones consideradas

### Opción 1 — Aplicar el guard de ADR-SAAS-081 a todas las compras del proyecto

Mantener el candidato actual y crear/validar controles para todos los tenants
cuyas rutas o comportamiento queden bajo el código nuevo.

**Ventaja:** mantiene la lectura más estricta del fail-closed universal de
ADR-SAAS-081.
**Coste:** el candidato cambia el comportamiento de los tenants de prueba y
exigiría modificar controles/configuración de tenants excluidos; no cumple el
alcance autorizado y no es una operación permitida en E2.2.

### Opción 2 — Alcance Bodega para E2.2, preservando las rutas no-Bodega (recomendada)

Aplicar el control obligatorio a `registrarCompraBodegaV1` y al tenant Bodega
incluido en el corte. Mantener el rechazo de Bodega en
`registrarCompraOperativaV1`; para los demás verticales, conservar la ruta
legacy hasta que un corte posterior los inscriba y sus funciones/Rules se
actualicen de manera compatible. Reducir el diff de Rules de E2.2 a los cambios
necesarios para bloquear escrituras directas Bodega y preservar los resultados
efectivos de los demás verticales. Separar de esta release los endurecimientos
globales no necesarios para Bodega.

**Ventaja:** sigue la especificidad de ADR-SAAS-072/075, limita el control
operativo al tenant Bodega autorizado y evita mutaciones de los tenants de
prueba.
**Coste y decisión contractual:** acota la lectura de ADR-SAAS-081 para los
verticales que no están en el corte. Requiere aceptación explícita del
responsable y tests que demuestren equivalencia no-Bodega. No equivale a decir
que un control ausente habilita compras en Bodega: ese vertical permanece
fail-closed.

### Opción 3 — Aislar Bodega en otra base o proyecto

Usar una superficie de reglas/funciones independiente para el tenant Bodega.

**Ventaja:** aislamiento infraestructural.
**Coste:** cambia topología, configuración, identidad y operación; amplía E2.2
y requiere un diseño y autorizaciones nuevos.

### Opción 4 — Mantener el NO-GO

No desplegar el candidato ni aprovisionar a Diana hasta resolver la tensión
entre los ADR y el alcance.

**Ventaja:** no altera ningún contrato ni entorno.
**Coste:** mantiene E2.2 y el Trial bloqueados.

## Decisión adoptada

Se acepta la **Opción 2** para E2.2. Su compatibilidad requiere un PR técnico separado que preserve los
invariantes de ADR-SAAS-081 para Bodega y no cambie el comportamiento efectivo
de los tenants no-Bodega fuera del corte. Una Ruleset desplegada sigue siendo un
cambio global de infraestructura, por lo que necesita autorización de release
independiente aunque el diff semántico sea Bodega-específico.

La aceptación no equivale a autorización operativa: cada despliegue global y
cada escritura tenant-scoped sigue sujeto a su preflight, revisión y
autorización específica. La Opción 1 se descarta porque contradice el alcance
aprobado; la Opción 3 queda fuera de alcance.

## Condiciones de implementación de la decisión aceptada

1. Aplicar la supersesión acotada de ADR-SAAS-081 solo al alcance de E2.2:
   conservar la ruta legacy no-Bodega fuera del corte y exigir en la ruta Bodega
   `schemaVersion: 1`, empresa, estado, revisión, idempotencia, concurrencia y
   auditoría del control.
2. En Bodega, control ausente, inválido o pausado bloquea compras nuevas; el
   control activo v1 coincidente habilita únicamente la callable canónica. Las
   Rules niegan create/delete cliente de `/compras` para Bodega y la callable
   legacy rechaza Bodega también en replay.
3. Preservar para los verticales no-Bodega excluidos el resultado efectivo que
   tenían antes del cambio. No crear controles ni modificar sus documentos,
   datos o configuración.
4. Limitar el Rules diff de E2.2; revisar y separar de forma independiente
   cambios globales no necesarios (por ejemplo, cambios generales de `/ventas`
   o `/usuarios`).
5. Probar en Emulator el contraste entre Bodega y un tenant sintético legacy:
   escrituras directas, callable canónica, control ausente/activo/pausado,
   schema desconocido, revisión límite, replay, autorización revocada y
   aislamiento. Las pruebas deben confirmar equivalencia de los permisos
   legacy no-Bodega fuera del corte.
6. Revalidar inventario, SHA, planes de Functions/Rules y recuperación antes de
   cada operación remota. Funciones compartidas y Rules del `(default)` requieren
   autorización global separada; no se describen como una escritura exclusiva
   de Diana.
7. Mantener separadas la oferta, Bootstrap/Trial y transición del control para
   `distribuidora-las-jimenez`. No escribir en tenants de prueba.

### Caso particular: Rules antes del alta de un tenant nuevo

El destino de E2.2 aún no está provisionado según la evidencia disponible, que
debe revalidarse antes de ejecutar. La implementación actual de
`transicionarPausaComprasSaas` exige que `empresas/{empresaId}` exista, mientras
que el Bootstrap canónico crea Empresa y, al completarse, inicia el Trial. No
es posible inicializar ni pausar canónicamente un control para el tenant antes
del Bootstrap.

Para el caso estrictamente nuevo y sin compras existentes, se propone esta
secuencia como excepción acotada a la secuencia de corte de ADR-SAAS-081, no
como una interpretación ya aceptada:

1. Revalidar por lectura que el tenant y sus datos operativos no existen, y que
   `Cafe Atrato` y `Prueba` siguen fuera de cualquier mutación tenant-scoped.
2. Desplegar primero Functions compatibles y después la Ruleset global, solo
   cuando se haya probado que el guard/control afecta a Bodega y que los
   resultados efectivos no-Bodega permanecen idénticos. La Rules niega la
   escritura cliente directa de compras Bodega; la callable Bodega falla
   cerrada mientras falte control. Esto permite dejar el entorno protegido
   antes de crear el tenant.
3. Solo después de que los gates de release estén verificados y exista
   autorización independiente, crear/aprobar la oferta y ejecutar el Bootstrap
   canónico. El Bootstrap inicia el Trial; no se entrega el acceso para operar
   hasta completar el paso siguiente.
4. Inicializar, una sola vez y por la callable canónica, el control del tenant
   objetivo desde revisión 0 a `ACTIVA`. Hasta que esta transición y su
   auditoría se verifiquen, las compras siguen denegadas por Functions; no se
   realiza ninguna compra.

La excepción aceptada no permite omitir la pausa/reanudación de ADR-SAAS-081
para tenants existentes alcanzados por un corte. Solo aplica a una alta nueva,
sin documentos ni transacciones preexistentes: no se pausa un control
inexistente y primero se publican los guardas compatibles. Si la lectura previa
encuentra que el tenant ya existe o tiene operaciones, esta excepción no aplica
y el proceso se detiene hasta preparar el corte normal con el alcance aprobado.

## Consecuencias y límites

- Antes de esta aceptación, ADR-SAAS-081 gobernaba sin estas excepciones. Desde
  la aceptación, el alcance queda limitado exactamente a las dos excepciones
  declaradas en “Supersede parcialmente”; sus demás guardas e invariantes no se
  relajan.
- La implementación debe ocurrir en un PR técnico con pruebas, auditoría y CI.
  Esta decisión no autoriza despliegues ni escrituras remotas: Functions, Rules,
  oferta y Bootstrap requieren sus autorizaciones operativas independientes.
- Si no se puede preservar la semántica efectiva de los tenants excluidos en
  Rules y Functions, se mantiene el NO-GO. No se resuelve mediante allowlists
  hardcodeadas por ID ni controles creados para esos tenants.
- No se solicita que `Cafe Atrato` o `Prueba` se designen para el corte; esa
  selección no es un bloqueo de E2.2.

## Referencias

- ADR-SAAS-071: callable Bodega aislada y ruta legacy preservada.
- ADR-SAAS-072: escrituras directas denegadas para Bodega, otros verticales
  preservados.
- ADR-SAAS-075: rechazo Bodega en callable legacy.
- ADR-SAAS-081: control de compras durante cortes.
- ADR-SAAS-084: versionado/semántica de evidencia del control.
- `firestore.rules`, `functions/src/finanzas/compra-core.ts` y
  `functions/src/finanzas/compras.test.ts` en `main @ 1918c091…`.
