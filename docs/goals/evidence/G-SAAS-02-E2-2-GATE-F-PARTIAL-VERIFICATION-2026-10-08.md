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
