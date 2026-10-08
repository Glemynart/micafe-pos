# G-SAAS-02 / M2 / E2.2 — Gate F: evidencia parcial de verificación (2026-10-08)

**Última revisión:** 2026-10-08 14:55 UTC
**Estado:** `EN CURSO` — evidencia parcial; no certifica Gate F.

## Contexto y límites

Gate C, D y E están registrados como `PASS` en el Goal vivo. Gate F requiere una
matriz funcional de staging; las pruebas locales y las lecturas de datos no la
sustituyen. Esta nota conserva verificaciones reproducibles sobre el código de
`main` y una instantánea de solo lectura del fixture sintético existente.

Alcance de la instantánea remota: proyecto `micafe-pos-staging`, tenant
`E2_2-BODEGA-STAGING-FIXTURE`. No se crearon datos, no se aceptó ni canceló una
agenda, no se confirmó una venta y no se cambió configuración, tráfico o
permisos.

## Identidad del código

- SHA del código usado en las pruebas locales: `bf9d456b4c0a65493c6d13982eca6891f3da17a1`.
- `origin/main` vigente al iniciar este checkpoint: `01aa85e5921ab02b9e606b18f032a505889c85de` (merge de PR #487).
- `git diff --name-only bf9d456b4c0a65493c6d13982eca6891f3da17a1..origin/main`
  solo contiene `docs/goals/GOAL-MVP-COMERCIAL.md` y este archivo; no hay
  diferencias de aplicación, Functions, configuración ni reglas. Las
  validaciones de código enumeradas siguen correspondiendo al código vigente,
  pero el commit de evidencia no las vuelve a ejecutar.
- La verificación se ejecutó en un worktree separado del checkout principal.
- Las pruebas E2E locales usaron proyectos Emulator `demo-bodega-agenda` y
  `demo-bodega-u4-u5-ui`; no apuntaron a Firebase staging o producción.

## Validaciones locales

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; compilación Next.js y generación de 49 páginas |
| `npm run build:functions` | PASS |
| `npm --prefix functions-bodega run build` | PASS |
| `npm --prefix functions-operational-auth run build` | PASS |
| `npm --prefix functions-tenant-configuration run build` | PASS |
| `npm run test:bodega-ui` | 12/12 PASS |
| `npm --prefix functions test` | 419 pruebas; 414 PASS, 5 skip, 0 fallos |
| `npm --prefix functions-bodega test` | 9/9 PASS |
| `npm run e2e:bodega-agenda` | 6/6 PASS en Emulator |
| `npm run e2e:bodega-u4-u5` | 9/9 PASS en Emulator |

Los skips de la suite de Functions no se presentan como pruebas aprobadas. Los
tests de Emulator acreditan los casos modelados por esas suites, no el estado
remoto de staging.

### Reconciliación de main — PR #486

PR #486 quedó `MERGED` mediante `24e33591c9dd6dcae858c1d893d354ae54d70d3e`.
Los tres checks previos al merge terminaron `PASS` y la CI post-merge de `main`,
run `37784488864`, terminó `success` a las `2026-10-08T13:47:25Z`. El cambio fue
solo documental; la comparación de archivos confirma que no cambió el código
que fue objeto de las pruebas anteriores.

### Diagnóstico de la sesión Backoffice — inspección de solo lectura, 2026-10-08 14:05 UTC

- En la app abierta en el navegador integrado, bajo el origen
  `https://cafeatrato-7u5o2fovz-glemynarts-projects.vercel.app`, el POS muestra
  una sesión del vendedor sintético `GateF Seller E2_2`; el Backoffice, en el
  mismo origen, muestra
  `Acceso de plataforma no disponible` y que la identidad no posee autorización
  SaaS activa. No se recargó ni se interactuó con ninguna de las dos pestañas.
- `contexts/platform-context.tsx` usa la instancia cliente `auth` y consulta
  `consultarContextoPlataforma`; `functions/src/platform/authorization.ts`
  exige un claim `saas.operador`, documento `saas_operadores/{uid}` activo con
  facultades y versión de autorización coincidente. Un PIN de admin tenant no
  satisface este contrato.
- El POS y Backoffice comparten el mismo origen y la misma instancia cliente de
  Auth. La sesión tenant observada no acredita la sesión global de plataforma;
  validar el Backoffice requiere un perfil de navegador separado con una
  identidad de operador SaaS autorizada.
- PR #482 modifica el `SaaSProvider`/`TenantAccessGuard` para fallos de
  resolución tenant; no modifica `PlatformProvider`/`PlatformGuard` ni esta
  autorización. Se mantiene en Draft y no se considera solución de este caso.
- La observación no probó credenciales de plataforma, no cambió sesiones y no
  aceptó el permiso de notificaciones.

### Seguimiento de sesión Backoffice — inspección de solo lectura, 2026-10-08 14:52 UTC

- El usuario informó que inició sesión en Brave. La pestaña visible de
  `Backoffice SaaS · MiCafe` quedó en
  `/backoffice/empresas/E2_2-BODEGA-STAGING-FIXTURE` del preview
  `cafeatrato-7u5o2fovz-glemynarts-projects.vercel.app`.
- La interfaz muestra `Contexto validado`, el detalle de `Bodega Atrato Demo` y
  el identificador del fixture. La comprobación confirma que la identidad de
  plataforma puede abrir el detalle Backoffice; no se usaron controles de
  edición, lifecycle, credenciales ni otros comandos.
- El mismo detalle informa `No tienes autorización para consultar Dusema`.
  Esto es una denegación visible para ese tenant en esta vista y con esta
  identidad; no sustituye las pruebas de aislamiento multi-tenant de toda la
  matriz.
- La inspección fue de solo lectura. No se ejecutó ninguna mutación de
  Firestore/Auth, no se cambió el fixture ni la reserva, y no se concedió el
  permiso de notificaciones.
- Tras el merge de PR #487, `origin/main` está en
  `01aa85e5921ab02b9e606b18f032a505889c85de`; la CI post-merge
  `37793768997` terminó `success` a las `14:53:40Z`. El PR era documental y no
  alteró el código cubierto por las pruebas.

## Instantánea read-only de staging

Lecturas realizadas el 2026-10-08, aproximadamente a las 12:26 UTC:

- Agenda: 4 documentos; 1 `RESERVADA` y 3 `CANCELADA`.
- Reservas: 4 documentos; 1 `ACTIVA` por 2 unidades base y 3 `LIBERADA`.
- El producto sintético reporta 6 unidades físicas y 2 reservadas: quedan 4
  unidades base disponibles, equivalentes a 2 presentaciones de factor 2. La
  reserva activa se conservó intacta.
- Solicitudes de venta: 4 documentos; 3 `EJECUTADA` y 1 `CANCELADA`; no había
  solicitudes `PENDIENTE_APROBACION` ni `APROBADA` al consultar Firestore.
  La vista actual del POS del vendedor también muestra estados cancelado y
  ejecutado, no una solicitud esperando aprobación. Por lo tanto, la captura
  anterior con estado pendiente no describe el estado actual del documento.
- Membresías activas: 5; tokens FCM activos: 0. No se puede afirmar entrega
  push con este estado.
- Para la agenda activa, dos avisos previos ya constan como
  `SIN_DESTINATARIO`. El aviso del día anterior está `PENDIENTE` para
  `2026-10-08T13:00:00Z`; el aviso de fecha programada, para
  `2026-10-09T13:00:00Z`. La lectura ocurrió antes de que el primer aviso
  estuviera vencido. No se forzó la ejecución del Scheduler.
- Scheduler de ADR-064: job habilitado con frecuencia de cinco minutos UTC. La
  lectura inicial observó una ejecución HTTP `200` a `12:18:06Z`.

Estas lecturas confirman una reserva vigente y el estado persistido observado,
pero no prueban la entrega de recordatorios, conversión de agenda, liberación,
expiración ni consumo en staging.

### Resultado posterior del Scheduler — 2026-10-08 13:03 UTC

Sin invocación manual, el job automático ejecutó después de la hora disponible
el aviso `dia_anterior` de la agenda activa. El log `AttemptFinished` registró
HTTP `200` a `2026-10-08T13:03:09.250Z`. El evento pasó de `PENDIENTE` a
`SIN_DESTINATARIO`, `intentos=1`, sin código de error; había cero tokens FCM
activos. Tres avisos vencidos de agendas ya canceladas quedaron en
`OMITIDO / AGENDA_NO_VIGENTE`. Los otros avisos futuros siguen pendientes.

Una lectura posterior confirmó que no cambió el dominio de inventario:
continúan una agenda `RESERVADA`, tres `CANCELADA`, una reserva activa por 2
unidades base, y el producto conserva 6 unidades físicas / 2 reservadas. Esto
demuestra la rama durable sin destinatario y la omisión de avisos obsoletos; no
demuestra entrega push ni el ciclo completo de agenda.

## Matriz restante de Gate F

| Caso | Estado al cierre de esta evidencia |
| --- | --- |
| Aislamiento de tenant y roles en staging | Pendiente de evidencia completa |
| Revocación/restauración de membresía y replay autenticado | Pendiente en staging; Emulator PASS no la sustituye |
| Retry autenticado tras pérdida de respuesta | Pendiente en staging; Emulator PASS no la sustituye |
| Agenda: creación y aceptación con reserva | Reserva preexistente verificada; ciclo de prueba completo pendiente |
| Agenda: conversión a solicitud y venta idempotente | Pendiente de evidencia completa en staging |
| Agenda: cancelación/liberación y expiración | Tests locales PASS; validación remota pendiente |
| Recordatorio worker y entrega push | Rama sin destinatario: PASS; entrega push: pendiente, 0 tokens FCM activos; no se cambió el permiso del navegador |
| Venta, turnos, inventario, ledger y auditoría | La evidencia histórica no equivale a una revalidación integral de este checkpoint |
| Reportes y PWA | Pendiente de revalidación integral |
| Backoffice | Parcial: sesión de operador SaaS autorizada y detalle del fixture cargado con `Contexto validado`; falta revalidación funcional integral |

No se debe consumir ni cancelar la reserva activa para completar casos que
requieran una nueva autorización de negocio. Tampoco se debe crear otro fixture.
El permiso de notificaciones del navegador requiere la interacción del usuario;
no se aceptó ni se intentó eludir ese permiso.

## Dictamen y siguiente paso

Las verificaciones automatizadas enumeradas pasan y la instantánea no muestra
una solicitud de venta todavía pendiente. Sin embargo, falta evidencia remota de
varios escenarios obligatorios de la matriz. Por ello:

- Gate F: `EN CURSO`, no `PASS`.
- E2.2: `EN EJECUCIÓN`.
- Gate G debe repetirse y Gate H debe emitir una matriz nueva después de F.
- Gates I/J/K/L continúan sujetos a sus propios criterios; esta nota no inicia
  el tenant real, el Trial ni producción.

## Mutation audit

- Archivos de aplicación/Functions modificados: 0.
- Firebase staging: lecturas Firestore y Cloud Logging por Codex; escrituras
  directas de Codex: 0. El Scheduler autorizado actualizó automáticamente
  cuatro eventos existentes de outbox al vencimiento: uno
  `PENDIENTE → SIN_DESTINATARIO` y tres a `OMITIDO / AGENDA_NO_VIGENTE`.
- Cambios de agenda, reservas, stock, membresías o ventas por esta ejecución:
  0; sus valores observados permanecieron iguales.
- Firebase Auth, Rules, IAM, Secrets, tráfico y despliegues: 0 cambios.
- Inspección de pestañas existentes: solo lectura, sin navegación, login,
  refresh, acción de negocio ni permiso de navegador aceptado.
- Verificación del detalle Backoffice en Brave: solo lectura; escrituras de
  negocio y cambios de permisos: 0.
- Agenda/reserva/venta/ledger: 0 mutaciones en este checkpoint.
- Fixture adicional, Bootstrap, Activation, tenant real y producción: 0.

### Seguimiento autorizado — push directo en Preview, 2026-10-08 16:05 UTC

Después de la evidencia anterior, el usuario inició sesión como el vendedor
sintético `GateF Seller E2_2` en el deployment Preview
`https://cafeatrato-2wbemooce-glemynarts-projects.vercel.app` y aceptó el
permiso de notificaciones del navegador. Se generó el par Web Push de
`micafe-pos-staging` en Firebase Console; solo la clave pública VAPID se
configuró en la variable `NEXT_PUBLIC_FIREBASE_VAPID_KEY` del entorno **Preview**
de Vercel. No se incluye la clave en este documento. Se redeplegó el Preview
existente, sin cambiar su commit de aplicación:

- Deployment nuevo: `dpl_GRw1x6JWDwcDoi3eu9tiFU3bgpvR` (`READY`).
- Deployment fuente: `dpl_8HetjaWtqjHwYRKkiTwpiQKoyTw3`.
- Commit fuente: `024118fac32d11a33449fbc19bc8dd1b8036be41`.
- Host probado: `cafeatrato-2wbemooce-glemynarts-projects.vercel.app`.

El flujo cliente registró un token FCM para la membresía activa del vendedor
sintético en `micafe-pos-staging`; una lectura posterior encontró exactamente
un token asociado a ese perfil. Se envió **una** notificación FCM de smoke,
con texto explícitamente sintético, al token de ese vendedor. FCM respondió
`projects/micafe-pos-staging/messages/b1f1a5d7-3f4a-4d5c-be25-caf74b5a04f1`.
Con el POS visible en primer plano, la pestaña autenticada mostró el toast
`Prueba sintética de Gate F` con el mensaje
`Notificación de staging. No corresponde a un pedido real.`. Esto no prueba la
presentación del aviso del sistema con la app en segundo plano, en móvil, ni la
emisión de sonido. No se registran en Git la clave VAPID privada ni el token
del dispositivo.

Esto acredita **solo la recepción directa FCM → handler foreground/toast** en
el navegador autenticado en Preview. No acredita la presentación del aviso en
segundo plano ni el recorrido Scheduler/outbox → FCM: el aviso vencido anterior
ya había terminado como `SIN_DESTINATARIO` antes de registrar el token y no fue
reprocesado; el siguiente aviso programado aún requiere observarse en su
ejecución automática. No se invocó manualmente el Scheduler ni se alteró la
agenda/reserva para adelantar la prueba.

#### Actualización puntual de matriz

| Caso | Estado posterior a este seguimiento |
| --- | --- |
| Recordatorio worker y entrega push | **Push FCM directo con app visible/toast: PASS**. Aviso del sistema en segundo plano/sonido y Scheduler/outbox con entrega automática: pendientes; no se reabrió el evento terminal anterior. |

Los demás subcasos de la matriz conservan sus estados previos. Gate F continúa
`EN CURSO`, no `PASS`.

#### Mutation audit del seguimiento

- Firebase Console: se generó la configuración Web Push de
  `micafe-pos-staging` (sin cambios a Functions, Rules, IAM o Secrets).
- Vercel: una variable pública VAPID agregada al entorno Preview y un redeploy
  Preview del mismo commit; Production no fue modificado ni redeplegado.
- Firestore: una actualización de registro FCM realizada por el cliente al
  conceder el permiso; no hubo escrituras directas de Codex. Se verificó un
  token activo para el vendedor sintético.
- FCM: exactamente un mensaje sintético directo al dispositivo de prueba.
- Agenda, reservas, stock, venta, turnos, ledger, membresías y Auth: sin cambios.
- Tráfico productivo, proyecto de producción, fixture adicional, Bootstrap,
  Activation y cleanup destructivo: 0.

### Seguimiento read-only — aislamiento de rol y solicitudes, 2026-10-08 16:22 UTC

En el Preview `cafeatrato-2wbemooce-glemynarts-projects.vercel.app`, la sesión
autenticada identificó al actor como `GateF Seller E2_2`. La navegación de solo
lectura a la ruta de detalle SaaS del fixture mostró `Acceso de plataforma no
disponible` y `La identidad no posee una autorización SaaS activa`. Al volver a
`/pos`, la sesión del vendedor siguió activa. Esto prueba la denegación de esa
superficie de plataforma para ese actor; no completa la matriz A/B de tenant ni
la autorización de todas las rutas de Backoffice.

La vista `Mis solicitudes` mostró una solicitud `CANCELADA` y una `EJECUTADA`
para el cliente sintético; la ejecutada comunica que venta, inventario y pago
fueron procesados por el servidor. No había una solicitud pendiente en esa
vista. `Mis ventas` mostró cinco entradas del cliente sintético por $5.000 cada
una. La lectura posterior de documentos canónicos concilió esas cinco entradas
con cinco ventas atribuibles al vendedor; la instantánea remota previa
contabilizaba solicitudes, no ventas, por lo que no representa un conteo
contradictorio. No se abrieron controles de venta, pago o inventario.

### Hallazgo técnico pendiente — configuración del service worker FCM

El cliente registra `/firebase-push-sw.js` desde `components/fcm-manager.tsx`
y crea su instancia FCM con `app` en `lib/firebase.ts`, cuya configuración
proviene de `NEXT_PUBLIC_FIREBASE_*`. En el SHA de aplicación desplegado
`024118fac32d11a33449fbc19bc8dd1b8036be41`, el archivo
`public/firebase-push-sw.js` inicializa por separado el worker con
`projectId: "micafe-pos"` y el `messagingSenderId` del proyecto productivo.
El token del vendedor de esta prueba se registró en `micafe-pos-staging`; por
tanto, la configuración del worker no está alineada en el código con la
configuración Firebase por entorno del cliente. La prueba FCM directa solo
acreditó `onMessage` en primer plano y no permite inferir que el worker entregue
un aviso en segundo plano. Esto es un riesgo de configuración que debe
resolverse o descartarse con evidencia antes de afirmar recepción background;
no se concluye que el aviso haya fallado.

La descarga externa del recurso del worker no permitió inspeccionar el artefacto
del Preview porque respondió con la página HTML de protección de Vercel; la
aplicación y el SHA de origen sí permiten identificar el archivo versionado. No
se envió otro push. La recepción en segundo plano queda pendiente.

#### Mutation audit del seguimiento

- Solo lecturas de UI en POS/Backoffice; no se ejecutó una transición de negocio.
- Solicitudes, ventas, agenda/reserva, stock, turnos, ledger, membresías, Auth,
  Firestore, Functions, Rules, IAM, Secrets y tráfico: sin escrituras por este
  seguimiento.
- El permiso de notificaciones y un smoke push sintético corresponden al
  seguimiento anterior; no se repitieron.

### Reconciliación read-only — ventas del fixture y ledger, 2026-10-08 16:35 UTC

Se consultaron en modo de solo lectura Firestore REST, autenticando con la
sesión `gcloud` local y fijando explícitamente `micafe-pos-staging`; la salida
se limitó a agregados, sin mostrar PII ni identificadores de documentos.

- Tenant: 11 ventas `COMPLETO`, total agregado $55.000 COP, 0 `commandId`
  duplicados y 11 movimientos de inventario tipo venta referenciando ventas;
  no se detectó venta sin movimiento de inventario.
- Vendedor sintético F (UID con sufijo `230fe`): 5 ventas `COMPLETO`, total
  $25.000 COP, coincidentes con las cinco filas visibles en `Mis ventas`.
- Solicitudes tenant-wide: 4 (`3 EJECUTADA`, `1 CANCELADA`). Del vendedor F:
  2 (`1 EJECUTADA`, `1 CANCELADA`); la solicitud ejecutada referencia una de
  sus cinco ventas.
- Las otras cuatro ventas del vendedor F no están referenciadas por esas dos
  solicitudes. Son canónicas y tienen movimiento de inventario; la consulta no
  atribuye su origen funcional exacto. Se conservan intactas y no se concluye
  que sean duplicadas.

Esta lectura concilia conteos de ventas y ledger y descarta duplicidad por
`commandId` en la colección consultada; no sustituye la auditoría completa de
efectos financieros, turnos, auditoría ni la matriz de aislamiento.

#### Mutation audit de la reconciliación

- Firestore staging: lecturas autenticadas de agregados únicamente; escrituras
  0. Proyecto de producción, Auth, agenda, reserva, stock, ventas, ledger,
  turnos, Rules, IAM, Secrets, tráfico y despliegues: cambios 0.

### Seguimiento — validación automatizada local, 2026-10-08 16:49 UTC

Se reejecutaron suites desde el worktree de la rama de evidencia, sin usar CI
remota ni conectarse a Firebase staging/producción:

| Comando | Resultado | Cobertura relevante |
| --- | --- | --- |
| `npm run test:bodega-ui` | PASS, 12/12 | Contratos de UI Bodega, solicitud de venta, presentación legible, idempotencia de doble submit y aislamiento entre roles/verticales. |
| `npm --prefix functions-bodega test` | PASS, 9/9 | Scheduler/outbox, destinatarios con membresía activa, ausencia de token, reintento/backoff, tokens inválidos, expiración y liberación idempotente. |
| `npm run e2e:bodega-agenda` | PASS, 6/6 | Reserva concurrente sin sobreasignación, conversión idempotente, tenant/actor ajeno, payload manipulado, inactivos, y paginación. Solo Firestore Emulator con proyecto `demo-bodega-agenda`. |
| `npm run e2e:bodega-u4-u5` | PASS, 9/9 | PWA solicitud/aprobación/venta, retry tras pérdida de respuesta, pago efectivo con turno, aislamiento A/B en UI/callable, catálogo por tenant, venta canónica, incorporación de vendedor y regresión GENERAL. Emuladores Auth/Firestore/Functions con proyecto `demo-bodega-u4-u5-ui`. |

Durante `e2e:bodega-u4-u5`, Functions Emulator intentó resolver
`OPERATIONAL_PIN_PEPPER` en Secret Manager del proyecto demo y recibió `403`;
no obtuvo el secreto. El runner continuó exclusivamente contra emuladores y las
nueve pruebas terminaron PASS. Esto no es evidencia de disponibilidad de Secrets
en staging ni reemplaza el preflight/deploy de Gate C/D.

Estas suites aumentan la evidencia automatizada local de authority, aislamiento,
retry, agenda y efectos de venta; no certifican por sí mismas el comportamiento
remoto del fixture. Gate F continúa `EN CURSO` hasta completar la matriz de
staging. La procedencia de las cuatro ventas históricas sin solicitud queda
reconciliada en el seguimiento read-only siguiente.

#### Mutation audit de la validación automatizada

- Firestore/Auth/Functions Emulator locales: datos de prueba efímeros; no se
  conectó a los proyectos Firebase remotos.
- Firebase staging/producción, Firestore, Auth, Rules, IAM, Secrets, Functions,
  tráfico, ventas, agenda y stock remotos: cambios 0.
- Vercel, deploy, FCM, fixture adicional, Bootstrap, Activation, tenant real y
  cleanup destructivo: cambios 0.
- Los cambios generados por Next dev en `AGENTS.md` y `next-env.d.ts` durante el
  E2E se reconciliaron a su contenido versionado; el worktree quedó limpio.

### Seguimiento — reconciliación temporal de ventas ADR-062, 2026-10-08

Se repitieron consultas Firestore REST con proyección de campos limitada y una
lectura de Cloud Logging, fijando explícitamente `micafe-pos-staging` y el
fixture `E2_2-BODEGA-STAGING-FIXTURE`. Los UID se trataron solo como sufijos
para clasificar actores; no se copiaron identificadores completos ni datos de
clientes a esta evidencia.

- El tenant tiene 11 ventas, 4 solicitudes y 19 movimientos financieros.
  Las 11 ventas corresponden a 11 ingresos de ledger; los 3 documentos de
  solicitud `EJECUTADA` enlazan una venta existente cada uno y la solicitud
  `CANCELADA` no enlaza venta. Las otras 8 ventas no tienen solicitud enlazada;
  su fecha y revisión de servicio se clasifican abajo como historial previo a
  ADR-SAAS-062, no como incumplimiento del flujo vigente.
- El vendedor F (UID terminado en `230fe`) tiene 5 ventas por `25.000 COP`:
  cuatro fechadas el 3 de octubre entre `22:47Z` y `23:07Z`, y una del 8 de
  octubre a `01:01Z`. Las cuatro primeras aparecen en los logs de requests de
  Cloud Run bajo `confirmarventabodegav1-00003-cud`, creado el
  `2026-10-03T09:23:50.880076Z`; no tienen solicitud enlazada. La versión
  `-00005-loz`, que atiende el flujo de aprobación, se creó el
  `2026-10-07T03:08:40.137877Z`. ADR-SAAS-062 se aceptó el 6 de octubre; por
  tanto, las cuatro operaciones del 3 de octubre son historial previo a esa
  regla y no evidencia de una venta sin aprobación bajo ADR-062.
- La venta F del `2026-10-08T01:01Z` fue atendida por `-00005-loz`, enlaza la
  solicitud `EJECUTADA` del mismo vendedor y tiene un ingreso correlacionado de
  `5.000 COP`, rol efectivo `vendedor`, pago por transferencia y sin turno
  asociado. Es consistente con el caso de transferencia ya admitido por el
  flujo; no se observó agenda en esa venta.
- Las otras dos solicitudes ejecutadas corresponden a otro vendedor sintético
  y se enlazan con ventas del 7 de octubre en `-00005-loz`; la solicitud de
  agenda cancelada no creó venta. Se conserva el historial completo, sin
  borrar ni corregir documentos.

La lectura temporal de las ocho ventas sin solicitud encontró tres ventas el
3 de octubre bajo `confirmarventabodegav1-00002-kig` (creada el
`2026-10-03T01:00:30.770015Z`) y cinco bajo
`confirmarventabodegav1-00003-cud` (creada el
`2026-10-03T09:23:50.880076Z`), entre el 3 y el 5 de octubre. ADR-SAAS-062 se
aceptó el 6 de octubre; las cuatro callables de solicitud/aprobación fueron
desplegadas después. Las ocho operaciones preceden a la aceptación de ADR-062
y a ese deploy. En contraste, las tres ventas vinculadas a
solicitudes ejecutadas aparecen en `-00005-loz`, creada el
`2026-10-07T03:08:40.137877Z`, y cada una coincide con su `ejecucion.ventaId`.

La conciliación temporal resuelve el hallazgo de las ventas históricas sin
solicitud: todas preceden a ADR-SAAS-062 y a su despliegue. Esto no cierra
Gate F. Siguen pendientes la matriz integral de aislamiento/roles y la
validación de la agenda y su entrega de recordatorios en el navegador,
incluyendo el comportamiento background; el smoke FCM de primer plano no
demuestra entrega background.

#### Mutation audit de la reconciliación temporal

- Firestore REST y Cloud Logging en `micafe-pos-staging`: lecturas únicamente.
- Firestore/Auth/Functions, agenda, stock, ventas, ledger, turnos, Rules,
  IAM, Secrets, tráfico, deploy y producción: escrituras/cambios `0`.
- Fixture adicional, Bootstrap, Activation, tenant real y cleanup destructivo:
  `0`.
