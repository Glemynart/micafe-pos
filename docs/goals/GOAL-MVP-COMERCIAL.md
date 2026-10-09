# Goal — G-SAAS-02: Primer cliente real operando un Trial de 30 días

> G-SAAS-02 es el Goal activo. G-SAAS-01 permanece documentado debajo como
> baseline histórico completado. Este Goal no se cierra por compilación, CI,
> provisioning o inicio del Trial: exige completar el Trial real y documentar
> su conversión o suspensión contractual.

## Identidad estable

- **Goal:** `G-SAAS-02`
- **Resultado:** un primer cliente real opera MiCafe POS durante un Trial ANUAL server-side de 30 días, con provisioning reproducible, onboarding, operación crítica, soporte, recuperación cuando aplique y cierre contractual evidenciado.
- **Estado:** ACTIVO
- **Inicio formal:** 2026-08-12
- **Rama base:** `main @ d2b8cdeb94c0c1513a85dfeae61765e2c092c437` (SHA vivo al reconciliar PR #354 y la auditoría del 2026-08-23)
- **Fuente de autorización:** `AUTORIZACIÓN DE EJECUCIÓN — G-SAAS-02`
- **Decisiones comerciales preservadas:** `1.800.000 COP`, `ANUAL`, pago manual, Trial de 30 días, todos los módulos disponibles y un Espacio operativo interno.

## Alcance

- Provisionamiento reproducible de un tenant de referencia.
- Onboarding DEMO como ruta inicial recomendada cuando el cliente no requiera fiscalidad real.
- Materialización de capacidades del Plan en la configuración efectiva del tenant.
- Un único Espacio conceptual; Espacio no equivale a Sede técnica.
- Ventas, inventario, compras, clientes, caja, turnos, finanzas, egresos y cuentas de cobro cuando formen parte del flujo del cliente.
- Impresión Web/PWA de 58/80 mm únicamente si el cliente requiere hardware físico.
- Rules, Storage, Functions, aislamiento tenant y auditoría.
- Backoffice, soporte, diagnóstico, rollback, recuperación e incidentes.
- Release identificable, smoke productivo y evidencia del tenant de referencia.
- Trial real completo de 30 días y decisión final de conversión o suspensión según contrato.

## Fuera de alcance

- MT-U10 completo, límites cuantitativos, overages y cobro por uso.
- MT-U11, multiempresa por identidad y selector de múltiples tenants.
- Sede técnica o múltiples sedes.
- Wompi SaaS, reservas públicas, referidos, offline, notificaciones completas y auto-delete.
- Fiscalidad real, salvo que el primer cliente la exija explícitamente y se aísle el alcance necesario.
- Cualquier capacidad no necesaria para el Trial del cliente de referencia.

## Milestones y Epics activos/propuestos

### M1 — Baseline y remediaciones previas — COMPLETADO

| Epic | Resultado | Estado |
|---|---|---|
| E1.1 Onboarding DEMO | Bootstrap materializa los módulos derivados del Plan sin crear una autoridad paralela. | COMPLETADO |
| E1.2 Integridad financiera de egresos | El cliente no puede borrar egresos por una ruta legacy incompatible; las correcciones quedan bajo soporte/backend canónico. | COMPLETADO |
| E1.3 Diagnóstico operativo | Un tenant DEMO operativo no se presenta como onboarding detenido por fiscalidad pendiente. | COMPLETADO |
| E1.4 Documentación de seguridad y operación | La documentación del sistema real y el runbook del Trial están versionados y distinguen evidencia pendiente. | COMPLETADO |

### M2 — Provisioning y onboarding — EN EJECUCIÓN

| Epic | Resultado | Estado |
|---|---|---|
| E2.1 Tenant de referencia | Tenant, contrato, Trial, membresía, administrador, credencial, Espacio y configuración reproducibles. | EN EJECUCIÓN |
| E2.2 Configuración inicial | Bodega MVP-1 es el tenant/cliente de referencia: catálogo, usuarios, permisos, módulos y flujo DEMO se preparan de forma reusable antes de crear o configurar el tenant real. Incluye solicitud de venta del vendedor y aprobación administrativa previa a la venta canónica según ADR-SAAS-062, y la agenda de pedidos/entregas con recordatorios aprobada como requisito previo a la primera entrega comercial, con arquitectura aceptada en ADR-SAAS-064. | EN EJECUCIÓN |

### M3 — Certificación funcional del tenant — PENDIENTE

| Epic | Resultado | Estado |
|---|---|---|
| E3.1 Operación POS | Ventas, inventario, compras, clientes, caja, turnos, finanzas, egresos y cuentas de cobro validados con el tenant. | PENDIENTE |
| E3.2 Seguridad y canal | Aislamiento tenant, Rules, Storage, Functions, auditoría y hardware de impresión cuando aplique. | PENDIENTE |

### M4 — Release y operación productiva — PENDIENTE

| Epic | Resultado | Estado |
|---|---|---|
| E4.1 Release certificado | SHA, CI, despliegues de Vercel/Functions/Rules/Storage y smoke productivo registrados. | PENDIENTE |
| E4.2 Soporte y recuperación | Procedimientos de acceso, lifecycle, diagnóstico, incidentes, rollback y recuperación validados. | PENDIENTE |

### M5 — Trial real de 30 días — PENDIENTE

| Epic | Resultado | Estado |
|---|---|---|
| E5.1 Operación real | El cliente opera durante 30 días sin reinicio artificial del Trial. | PENDIENTE |
| E5.2 Incidentes y estabilidad | Incidentes, correcciones, despliegues y evidencia se registran sin ocultar fallos. | PENDIENTE |

### M6 — Cierre contractual — PENDIENTE

| Epic | Resultado | Estado |
|---|---|---|
| E6.1 Conversión o suspensión | Se aplica el contrato ANUAL y queda registrada la salida correcta. | PENDIENTE |
| E6.2 Evidencia final | Provisioning, onboarding, Trial, operación, soporte, recuperación y cierre quedan auditados. | PENDIENTE |

## Dependencias y gates

- **Entrada:** `main` actualizado, SHA identificado, G-SAAS-01 integrado, PR de remediación M1 fusionado, plan ANUAL publicado y decisión DEMO/FISCAL del cliente.
- **M2:** ningún tenant nuevo se inicia con módulos operativos vacíos; el bootstrap es idempotente y reproducible.
- **M3:** cada operación crítica tiene pruebas automatizadas y, cuando corresponda, validación productiva con el tenant de referencia.
- **M4:** no se inicia el Trial con divergencia entre aplicación, Functions, Rules, Storage o SHA certificado.
- **M5:** el Trial permanece abierto hasta completar 30 días de operación real.
- **M6:** el Goal solo puede cerrarse con evidencia de conversión o suspensión según contrato.

## Definition of Done

- No existen P0 conocidos ni P1 sin resolución o plan aceptado antes de iniciar el Trial.
- El tenant de referencia es reproducible, aislado y operable por su administrador.
- DEMO, o FISCAL si fue requerido, funciona con datos reales aprobados del cliente.
- Las operaciones necesarias del cliente pasan en producción.
- Backoffice, soporte, diagnóstico, incidentes, rollback y recuperación están probados o documentados como no aplicables con evidencia.
- SHA, CI, despliegues y smoke productivo están registrados.
- El cliente completa 30 días reales de Trial.
- Se registran incidentes, correcciones y cambios sin reiniciar artificialmente el Trial.
- Conversión o suspensión queda aplicada y auditada.
- La auditoría final del Goal confirma que toda la evidencia es consistente.

## Riesgos y decisiones pendientes

- Fiscalidad permanece condicionada a la necesidad real del cliente; no se inventan NIT, resolución, prefijos ni credenciales.
- Impresión física depende de modelo, driver y ancho del equipo del cliente; el transporte técnico Web/PWA ya está definido.
- Correcciones financieras posteriores a un egreso requieren una autoridad backend canónica o un procedimiento de soporte; el cliente no borra el ledger.
- La auditoría global de G-SAAS-02 identificó mutaciones cliente históricas de stock y merma. `ADR-SAAS-030` fue aceptado con alcance acotado a inventario/mermas de G-SAAS-02 y quedó integrado en PR #322; la verificación post-merge y despliegue productivo siguen siendo gates del release. No se modifica producción por la aceptación.
- La auditoría posterior identificó mutaciones cliente históricas en reservas internas y agenda. `ADR-SAAS-033` fue aceptado para migrar cancelación y completado a Functions con saga DEMO idempotente; quedó integrado en PR #323 y su CI post-merge terminó en verde contra `origin/main @ 65f9fa0`. No se ejecutaron escrituras productivas.
- Rules y Storage quedaron sincronizadas con `origin/main @ a644d1d` mediante un deploy controlado y verificación read-only posterior. El release productivo completo y la recuperación productiva aún no están certificados.

## Estado vivo

### Decisión aceptada — 2026-10-07 — ADR-SAAS-064

El responsable del proyecto autorizó continuar autónomamente con las decisiones
necesarias para E2.2 y confirmó la agenda con recordatorios como requisito previo
a la primera entrega. ADR-SAAS-064 acepta una reserva lógica aprobada por
administración: reduce disponibilidad sin rebajar stock físico ni generar venta
o ledger hasta la confirmación canónica. La implementación quedó integrada por
PR #477; su aceptación no autoriza por sí sola deploy, tráfico, staging,
fixtures, Bootstrap, Activation, tenant real ni producción. La revalidación
operativa posterior al merge queda registrada abajo.

### Checkpoint vigente — 2026-10-08 (Bogotá) — Gate D / deploy ADR-064

PR #479 quedó `MERGED` en `main` mediante
`1d94944a1cc9d028e1680c66e10b27e0f91cf497` (`2026-10-08T05:15:02Z`). Sus checks
`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments` terminaron `PASS`; la CI
post-merge de `main`, run `37731432362`, concluyó `success` a las
`2026-10-08T05:33:01Z`. El run incluyó E2E de venta Bodega y agenda/reservas en
Emulator; esto no sustituye staging.

PR #480 integró el checkpoint documental de Gate C mediante
`026b130106ec17ac8f7ef50f101039078358f8f7`; sus tres checks y la CI
post-merge de `main`, run `37735749847`, terminaron `PASS` para ese SHA.

Gate C para ADR-SAAS-064 queda `PASS` con evidencia actualizada en
[`G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR064-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR064-2026-10-08.md).
El artefacto exacto identifica `saas-bodega` en `main @ 1d94944a1cc9d028e1680c66e10b27e0f91cf497`, sourceHash
`29c96c95519ab5325748e0db8900209aafdfd7c7`, 15 callables y un scheduler, sin
Secrets. El inventario staging confirma diez endpoints actuales y delta futuro
de diez updates/seis creates, sin deletes ni cambios a otros codebases.

Gate D para ADR-SAAS-064 queda `PASS` con la evidencia reproducible en
[`G-SAAS-02-E2-2-GATE-D-ADR064-STAGING-DEPLOY-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-D-ADR064-STAGING-DEPLOY-2026-10-08.md).
El deploy dirigido actualizó 10 Functions y creó 6 únicamente en
`saas-bodega`; las 16 están `ACTIVE`, Node.js 22, `us-central1`, cero Secrets y
100 % del tráfico en revisiones `Ready`. Cloud Build
`64268683-275a-4f07-91c1-d9fbacea0762` terminó `SUCCESS`; las 15 callables
rechazaron sondas sin autenticación con `401 UNAUTHENTICATED`. Los dos índices
ADR-064 están `READY` y el scheduler ejecutó una invocación automática HTTP
`200`. El audit registra seis políticas IAM de servicio Run dentro de las
superficies nuevas: cinco invokers callable y el worker limitado a su cuenta
OIDC; cero grants IAM de proyecto. La dependencia service-agent de Scheduler
creada durante el preflight previo permanece registrada y no se revirtió.

Reconciliación de Gate C para el cambio compartido de PR #477:
[`G-SAAS-02-E2-2-GATE-C-OPERATIONS-RESERVATION-PREFLIGHT-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-C-OPERATIONS-RESERVATION-PREFLIGHT-2026-10-08.md)
registra `PREFLIGHT = PASS` para actualizar únicamente
`consultarCatalogoPresentacionesVendedorV1` y
`actualizarArticuloInventarioV1` dentro de `saas-bodega-operations`. La revisión
remota anterior del catálogo aún ignoraba `stockReservado`; las pruebas y el
delta exacto de dos actualizaciones quedaron documentados. PR #483 integró el
preflight documental en `main @ a84f343a6cf9a6cf3baf667cedb0d55f8bec1b3e`; sus
checks y la CI post-merge de `main`, run `37766184623`, terminaron `PASS`.

El Gate D suplementario se ejecutó de forma dirigida después del merge. Solo se
actualizaron esas dos Functions; sus revisiones están `Ready`, 100 % del tráfico,
Node.js 22, `us-central1`, sin Secrets/parámetros propios y sin cambios de IAM.
El source remoto es `6ed63ebadff83be08bb45a35ea2fca729b0e3ca3`, con ZIP SHA-256
`96d87d774533ce88e588254b153093fd728e72c209ecbc96d92dbd5a022b3d04`; los 61
archivos del artefacto remoto coinciden byte por byte con el paquete local. La
lectura de auditoría no encontró cambios de IAM persistente, habilitación de
servicios, escrituras de Firestore/Auth ni cambios de Rules. En el POS del
vendedor, tras recargar, se verificaron `2` presentaciones disponibles frente a
6 unidades físicas y 2 reservadas; no se envió solicitud ni se creó venta.
La lectura de `Mi agenda` mostró una reserva activa de 2 unidades base para el
9 de octubre y tres entradas canceladas; el banner aún pide activar
notificaciones, por lo que el envío de recordatorios no se considera probado.
El helper local había calculado un identificador preliminar distinto, que se
reconcilió explícitamente y no se presenta como hash del artefacto desplegado.

Gate E conserva `PASS` y el fixture sintético retenido
`E2_2-BODEGA-STAGING-FIXTURE`; Gate F permanece `EN CURSO`, no `PASS`. Falta la
matriz staging de aislamiento tenant/roles, revocación/restauración con replay,
retry autenticado ante pérdida de respuesta y agenda ADR-064 (crear/aceptar,
liberar/expirar/consumir reservas, recordatorios y conversión idempotente), así
como la verificación funcional integral de venta, turnos, inventario, ledger,
auditoría, reportes, PWA y Backoffice. Gate D suplementario está `PASS` y la
proyección de reservas ya se refleja en POS; continúa la matriz de Gate F. Gate G
debe repetirse y Gate H emitirá una matriz nueva. Gate I y J/K/L permanecen
pendientes; no se ha creado/configurado el tenant real ni se autoriza producción.

### Checkpoint — 2026-10-08 — PR #485 / evidencia parcial Gate F

PR #485 quedó `MERGED` en `main` mediante
`4d9d17fbc40c7ceef4789d83bfe5ad8ff4aba333`. Sus checks previos al merge
(`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`) terminaron `PASS`.
La CI post-merge de `main`, run `37779555191`, terminó `success` a las
`2026-10-08T13:07:33Z`. Pasaron las certificaciones E2E de Bodega para
solicitud/venta y agenda/reservas, además de E4.1 y la auditoría E4.2 en
Emulator. Esta CI no sustituye la matriz funcional de staging de Gate F.

La evidencia parcial vigente está en
[`G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).
En staging, el worker automático procesó un aviso de la agenda sintética activa
como `SIN_DESTINATARIO` (cero tokens FCM activos) y omitió tres avisos de agendas
canceladas; el job devolvió HTTP `200`. La agenda retenida, la reserva de dos
unidades y el stock no cambiaron. Esto prueba únicamente esas ramas del
Scheduler; no acredita entrega push ni cierra el ciclo de agenda. Gate F queda
`EN CURSO`, no `PASS`; no hubo cambios de aplicación, mutaciones manuales de
Firestore, producción ni consumo/liberación de la reserva activa en este
checkpoint.

### Checkpoint — 2026-10-08 — PR #486 / identidad de validación Backoffice

PR #486 quedó `MERGED` en `main` mediante
`24e33591c9dd6dcae858c1d893d354ae54d70d3e`. Sus checks previos al merge
(`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`) terminaron `PASS`; la
CI post-merge de `main`, run `37784488864`, terminó `success` sobre ese SHA a
las `2026-10-08T13:47:25Z`. El cambio fue documental: el código de aplicación
permanece idéntico al SHA `bf9d456b4c0a65493c6d13982eca6891f3da17a1` usado para
las validaciones locales descritas en la evidencia de Gate F.

Una inspección de solo lectura de la app abierta en el navegador integrado,
a las `2026-10-08T14:05Z`, observó el POS autenticado como el vendedor
sintético `GateF Seller E2_2` y el Backoffice en el mismo origen mostrando que
la identidad no tiene autorización SaaS activa. El código confirma que el
Backoffice exige un operador SaaS autorizado (`saas.operador`, registro activo
y versión vigente), distinto del admin/vendedor tenant. Ambas superficies usan
la misma instancia cliente de Firebase Auth; por ello, esta sesión de vendedor
no sirve para certificar el Backoffice. PR #482 solo maneja errores del
contexto tenant y no resuelve esta autorización de plataforma. No se probó con
otra cuenta ni se alteraron sesiones.

Gate F permanece `EN CURSO`: la comprobación del Backoffice sigue pendiente de
una sesión de operador SaaS en un perfil de navegador separado; la entrega push
sigue pendiente de la interacción del usuario con el permiso del navegador.
No se cambia el estado de otros subcasos ni se infiere `PASS` para la matriz.

### Checkpoint — 2026-10-08 — PR #487 / Backoffice autorizado y CI post-merge

PR #487 quedó `MERGED` el `2026-10-08T14:35:47Z` mediante
`01aa85e5921ab02b9e606b18f032a505889c85de`. Sus tres checks previos al merge
terminaron `PASS`; la CI post-merge de `main`, run `37793768997`, terminó
`success` sobre ese SHA a las `2026-10-08T14:53:40Z`.

Una inspección de solo lectura en Brave confirmó una sesión autorizada de
operador de plataforma en el detalle del fixture `E2_2-BODEGA-STAGING-FIXTURE`:
Backoffice mostró `Contexto validado` y el detalle de Bodega Atrato Demo; el
panel informó que el operador no tiene autorización para consultar Dusema. Esto
aporta una comprobación puntual de autorización/denegación, pero no certifica el
aislamiento completo ni la matriz funcional de Backoffice. Gate F sigue `EN
CURSO` y la entrega push permanece pendiente; no se modificó el tenant ni se
concedieron permisos del navegador.

### Checkpoint — 2026-10-08 — PR #488 / push directo de Gate F

PR #488 (`docs(e2.2): record authorized Backoffice verification`) quedó
`MERGED` en `main @ d81e106298eec8388d5a60ebd0c1ca0cd5c00160`. Sus checks de CI,
Vercel y Preview Comments terminaron `PASS`; la CI post-merge de `main`, run
`37800704540`, terminó `success` sobre el merge commit
`d81e106298eec8388d5a60ebd0c1ca0cd5c00160`.

Después del merge, el permiso de notificaciones fue concedido por el usuario en
el Preview nuevo del vendedor sintético. El token FCM quedó registrado para esa
identidad y una notificación sintética directa produjo un toast con el POS
visible en primer plano. Esto cierra únicamente ese smoke foreground; no
demuestra el aviso del sistema en segundo plano/sonido, el recorrido automático
del Scheduler/outbox ni el resto de la matriz. La
configuración VAPID y el redeploy fueron exclusivos de `micafe-pos-staging` y
Vercel Preview; Production no se modificó. Evidencia completa en
[`G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).

Gate F permanece `EN CURSO`, no `PASS`; E2.2 sigue `EN EJECUCIÓN`. Gate G debe
repetirse y Gate H emitir una matriz actualizada después de Gate F; gates I/J/K/L
siguen pendientes. No se inicia aún el tenant real ni el Trial.

### Checkpoint — 2026-10-08 — PR #490 / worker FCM integrado

PR #490 se fusionó mediante merge protegido normal en
`main @ 3cac817d436e3b55cde188e9c96f347f3547e497`; los checks previos al merge
terminaron `PASS`. La CI post-merge de `main`, run `37833645441`, terminó
`success` sobre ese merge SHA a las `2026-10-08T20:01:02Z`.

El cambio integra el worker FCM por entorno y la espera de activación del
Service Worker. Tras expirar la sesión por inactividad, el admin sintético se
autenticó de nuevo en Edge, con la autorización previa del usuario, en el
Preview vigente `cafeatrato-pugkg9gnj-glemynarts-projects.vercel.app`; esta
comprobación demuestra acceso autenticado al POS administrativo. Una lectura
posterior de Edge encontró permiso de notificaciones `granted` y el Service
Worker FCM `firebase-push-sw.js` activo con scope aislado `/firebase-push/` en
ese origen. La consulta Firestore del fixture halló referencias FCM en dos
perfiles activos, pero no hay metadatos para atribuirlas al origen actual; esto
no demuestra entrega al dispositivo ni despacho automático Scheduler/outbox.
La lectura de deployments de Vercel no encontró un deployment de producción
para el merge commit; el deployment de producción más reciente continúa
asociado a un SHA anterior de `main`.

Gate F permanece `EN CURSO`, no `PASS`; E2.2 sigue `EN EJECUCIÓN`. No se
realizaron mutaciones de negocio ni se adelantó ningún gate posterior.

### Checkpoint — 2026-10-08 — PR #491 / recuperación del historial de turnos

PR #491 quedó `MERGED` en `main` mediante
`f72a26418ea6faefb2be59295074917996086803` a las `2026-10-08T22:21:21Z`.
Los checks requeridos (`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`)
terminaron `PASS`; la CI post-merge de `main`, run `37852942461`, seguía
`in_progress` a las `2026-10-08T22:26Z`. El cambio hace recuperables los errores
del historial de turnos en Backoffice/POS y sanitiza el diagnóstico. La causa
remota observada fue el índice compuesto de `turnos` ausente; se creó únicamente
en `micafe-pos-staging`, donde alcanzó `READY`. No cambió reglas, autoridad ni
operaciones canónicas.

La evidencia de Gate F fue actualizada tras una inspección de solo lectura de
las sesiones abiertas. En el Preview de PR #491 el vendedor sintético está
autenticado, pero no tiene turno activo; Edge está en el login de administrador.
Brave conserva una sesión de operador de plataforma en un Preview anterior,
que no equivale al administrador del tenant. No se ejecutó una acción de
negocio. `vercel inspect` confirmó el Preview de PR #491 `READY`; el deployment
de producción más reciente continúa siendo del 6 de octubre y no corresponde
al merge #491.

Gate F permanece `EN CURSO`, no `PASS`: siguen pendientes la matriz integral de
aislamiento/roles, revocación/restauración con replay, retry autenticado tras
pérdida de respuesta, ciclo completo de agenda y recordatorios automáticos, y
la revalidación integral de las superficies operativas. No se reutiliza la
identidad del operador SaaS para acciones de administrador tenant. Gate G debe
repetirse y H emitir la matriz final después de cerrar F; no se inicia todavía
el tenant real ni se modifica producción.

### Checkpoint — 2026-10-08 — PR #493/#494 / índices de reportes

PR #493 quedó integrado mediante `b4ab350dffe3da3c2446bf409dc68c28bc26806d`;
su CI post-merge, run `37858453098`, terminó `success`. PR #494 quedó integrado
mediante `a1274b0fde0ef469af3dce2a93259fa0595800b1` a las
`2026-10-08T23:49:22Z`; los checks previos al merge (CI de tipos/pruebas,
Vercel y Preview Comments) terminaron `PASS`. La CI post-merge `37861536241`
terminó `success` sobre el merge SHA a las `2026-10-09T00:10:02Z`.

El fallo reproducible en el reporte era el índice ascendente ausente de
`turnos(empresaId, fechaApertura)`: Firestore lanzaba `FAILED_PRECONDITION` y
la UI convertía el error en «No hay datos para este periodo». PR #494 añadió
solo esa definición al manifiesto. En `micafe-pos-staging`, el índice exacto
`CICAgJjmiJEK` alcanzó `READY` con `empresaId ASC`, `fechaApertura ASC` y
`__name__ ASC`. No se tocaron documentos ni se desplegaron Functions, Rules o
la aplicación.

La verificación visual se completó en Edge, con el administrador sintético
autenticado por el usuario. En el rango `Semana` (5–11 de octubre), el Preview
cargó ventas por `20.000 COP`, ganancia bruta de `12.000 COP`, margen `60,0 %`,
costo `8.000 COP` y cuatro unidades del producto principal, sin el error de
índice. Queda validado el caso semanal que reproducía el bloqueo; no se infiere
que todos los rangos ni todo el módulo de reportes estén certificados. La
matriz integral de Gate F continúa pendiente; la evidencia parcial se mantiene en
[`G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md`](evidence/G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).

Gate F permanece `EN CURSO`, no `PASS`; E2.2 sigue `EN EJECUCIÓN`. Se mantienen
pendientes aislamiento/roles, replay de membresía, retry tras pérdida de
respuesta, el ciclo completo de agenda/recordatorios y la validación funcional
integral. Gate G debe repetirse; Gate H emitirá una matriz nueva después de F.
No se adelanta el tenant real ni producción.

### Checkpoint — 2026-10-09 — PR #496 / agenda y recordatorio sintéticos

PR #496 quedó `MERGED` en `main @ 8c4c75735fb3cf37e07ae472a33440bcbddd941f`
a las `2026-10-09T02:04:45Z`, con `Tipos y pruebas`, `Vercel` y
`Vercel Preview Comments` en `PASS`. La CI post-merge de `main`, run
`37872843869`, estaba `in_progress` al corte de `02:04:48Z`. El PR fue
documental; no modificó el código de aplicación.

La evidencia de Gate F registra la agenda sintética reprogramada y aprobada
para el 8-oct, 21:00–22:00 Bogotá, y la cancelación/liberación autorizada de la
reserva antigua del 9-oct. La reserva nueva sigue activa por 2 unidades base;
inventario observado: 6 físicas, 2 reservadas, 4 disponibles. El Scheduler
automático despachó el recordatorio `fecha_programada` a las `02:03:07Z` con
HTTP `200`; el outbox quedó `ENVIADO`, intento 1, y el usuario confirmó su
recepción. Esto no prueba sonido ni todos los perfiles/background, expiración,
conversión idempotente ni la matriz completa. Gate F queda `EN CURSO`, no
`PASS`; E2.2 continúa `EN EJECUCIÓN` y no se inicia todavía el tenant real.
Evidencia: [`Gate F parcial`](evidence/G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).

### Seguimiento — 2026-10-09 — PR #497 / conversión de agenda

PR #497 está abierto sobre `main @ 8c4c75735fb3cf37e07ae472a33440bcbddd941f`;
el check `Vercel Preview Comments` pasó y `Tipos y pruebas`/`Vercel` seguían
corriendo al corte de `02:09Z`. El cambio es documental y no altera el artefacto
de aplicación.

Desde el POS staging, la sesión sintética del vendedor convirtió mediante el
control canónico la agenda de hoy a una solicitud de venta. POS mostró
`PENDIENTE APROBACIÓN`, total resuelto en servidor de `5.000 COP` y el mensaje
de que aún no se creó venta ni se descontó inventario. La lectura Firestore de
staging confirmó la agenda `CONVERTIDA_A_SOLICITUD`, la solicitud
`PENDIENTE_APROBACION`, su reserva aún `ACTIVA` por 2 unidades base y stock
físico/reservado `6/2`. La reserva vence a `2026-10-09T05:00:00Z` (medianoche
Bogotá); no se aprobó ni confirmó la venta en este paso.

Gate F permanece `EN CURSO`: la conversión básica quedó observada, pero el
replay/concurrencia, aprobación y venta canónica, consumo/liberación/expiración
de reserva y matriz funcional completa todavía requieren evidencia. El tenant
real no se inicia.

### Checkpoint histórico — 2026-10-07 (Bogotá) — PR #477 / preflight inicial de Gate C (supersedido)

PR #477 quedó `MERGED` en `main` el `2026-10-07 22:23:06` hora de Bogotá
(`2026-10-08T03:23:06Z`), mediante el merge commit
`e27126057fa627c01d8e6a313836f40dbaf32e1e`. Los checks previos al merge
(`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`) terminaron `PASS`; la
CI post-merge de `main`, run `37722462262` sobre el merge SHA, terminó
`completed / success`.

PR #477 implementó ADR-SAAS-064 en `saas-bodega`: cinco callables de agenda
adicionales y el scheduler `reconciliarAgendaPedidosBodegaV1` cada cinco
minutos, además de las reservas lógicas, outbox/recordatorios y sus interfaces.
La evidencia TDD de Emulator y los builds/tests del PR están en
[`ADR-SAAS-064-agenda-emulator.tdd.md`](../testing/ADR-SAAS-064-agenda-emulator.tdd.md);
no demuestran comportamiento en staging. PR #477 no desplegó Functions ni
modificó staging, fixture, tenant, Auth, Firestore remoto, Rules, IAM, Secrets,
tráfico o producción.

La evidencia anterior de Gate C/D cubre el artefacto de diez callables previo a
PR #477, no este boundary actualizado de quince callables y un scheduler.
Por eso, el siguiente paso es revalidar Gate C para el SHA
`e27126057fa627c01d8e6a313836f40dbaf32e1e`: inventario y delta exactos,
procedencia/digest, runtime, región, Secrets/parámetros, tráfico y rollback.
Gate D solo podrá ejecutarse si ese preflight demuestra el alcance exacto y un
rollback staging verificable. No se reutiliza el `PASS` anterior para autorizar
el nuevo artefacto.

Gate E conserva `PASS` y el fixture sintético retenido
`E2_2-BODEGA-STAGING-FIXTURE`; no se crea otro fixture. Gate F continúa
`EN CURSO`, no `PASS`: siguen pendientes aislamiento A/B de superficies
operativas, revocación/restauración de membresía con replay del actor restaurado
y retry autenticado ante pérdida de respuesta en staging. También deberán
validarse en staging los escenarios de agenda afectados por ADR-SAAS-064
(reserva/liberación/consumo de stock, recordatorios y conversión idempotente a
la solicitud aprobada) después del Gate D correspondiente. PR #472 aporta
evidencia Emulator para retry, no la validación staging. Gate G deberá repetirse
y Gate H emitirá una matriz nueva después de cerrar F.

Gate I permanece `PENDING`: no se ha creado ni configurado el tenant real. La
tarifa interna de `1.600.000 COP` no prueba aceptación del cliente; vigencia,
usuarios iniciales y normalización/confirmación del catálogo e inventario
iniciales todavía requieren evidencia del cliente antes de persistirse. Gates
J/K/L y E2.2 continúan pendientes; no hay autorización implícita de producción
ni inicio del Trial real.

### Checkpoint histórico — 2026-10-07 — PR #474 / Gate F en curso (supersedido por #477)

PR #467 quedó integrado en `main` mediante
`abbeac7a09764efd01e83153d1ae05a039a821f0`; la CI post-merge, run
`37563515007`, terminó `success`. La evidencia post-merge de Gate C/D está en
[`G-SAAS-02-E2-2-GATE-D-STAGING-DEPLOY-2026-10-07.md`](evidence/G-SAAS-02-E2-2-GATE-D-STAGING-DEPLOY-2026-10-07.md).

PR #466 fue integrado en `main` mediante
`8694491f61fd12d361d569f4a75218d8415c5f57` el `2026-10-07T01:36:05Z`
(`2026-10-06 20:36:05` en Bogotá). Sus checks `Tipos y pruebas`, `Vercel` y
`Vercel Preview Comments` terminaron `PASS`; la CI post-merge, run
`37557917105`, terminó `success` el `2026-10-07T01:57:04Z`, incluidas las
etapas E2E de Bodega en Emulator. PR #466 acepta `presentacionId` hasta el
límite canónico en solicitudes; no altera el contrato ni la autoridad de
venta.

PR #468 quedó integrado mediante `aebfbef6e0030bf53ed36f4f9744d9b2520e2d47`
(`2026-10-07T03:52:11Z`) y registró la evidencia de Gate D posterior a PR
#466; sus checks requeridos terminaron `PASS`. PR #469 quedó integrado mediante
`991d4ce6d8f4f924e651e7713a11ff6d599c9926` (`2026-10-07T04:57:43Z`); su único
cambio fue corregir el fixture de una prueba de confirmación bajo Emulator. Los
checks requeridos de PR #469 terminaron `PASS`, y la CI post-merge de `main`,
run `37573969262` sobre ese SHA, terminó `success`, incluidas R1-A, P0-01 y la
E2E de solicitud, aprobación y venta canónica de Bodega. PR #469 no cambió
lógica de producto ni staging.

PR #472 quedó integrado en `main` mediante
`fe383994a299baf9c346be15731ede3383b1d83e` el `2026-10-07T15:42:53Z`; su
commit fue `885d5bcf48957913ea8e043bc09ac6ba7bfe1daa`. Los checks previos al
merge (`Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`) terminaron
`PASS`; la CI post-merge, run `37646184683`, terminó `success` sobre el merge
SHA. PR #472 añadió en Emulator el retry tras perder la respuesta de
`confirmarVentaBodegaV1`; no cambia lógica de producto ni demuestra por sí solo
la validación funcional en staging. La evidencia está en
[`G-SAAS-02-E2-2-GATE-F-ADR062-RESPONSE-LOSS-RETRY-2026-10-07.md`](evidence/G-SAAS-02-E2-2-GATE-F-ADR062-RESPONSE-LOSS-RETRY-2026-10-07.md).

PR #474 quedó integrado en `main` mediante merge commit
`a818a28f81c9bad0ad922cd2719a8787aeea1d61` el `2026-10-07T20:42:57Z`.
Actualiza la bandeja de solicitudes del vendedor al entrar, regresar a la
pestaña y periódicamente mientras está visible; además acorta referencias
internas y presenta correctamente la expiración serializada. No cambia las
reglas de solicitud/venta ni produjo mutaciones de staging. Los checks del PR
terminaron `PASS`; la CI post-merge de `main`, run `37684131027`, terminó
`success`, incluida la E2E de Bodega y la certificación integral E4.1. Al
verificarlo, `origin/main` apuntaba al merge commit.

El 2026-10-07 la persona usuaria confirmó como requisito previo a la primera
entrega una agenda de pedidos/entregas con recordatorios y autorizó la
continuación autónoma de E2.2. ADR-SAAS-064 aceptó la reserva lógica: la
administración puede retener stock disponible sin reducir existencia física;
precio, venta y ledger se confirman mediante el flujo canónico. La decisión no
autoriza por sí sola mutaciones de staging, venta, entrega o producción y no
cambia Gate F.

La lectura actual de `firebase functions:list --project micafe-pos-staging
--json` confirmó las diez callables de `saas-bodega` en estado `ACTIVE`,
`us-central1`, `nodejs22`. El 2026-10-07 la persona usuaria completó en staging
una solicitud sintética de `5.000 COP`, su aprobación administrativa, la venta
canónica correlacionada y el cierre definitivo del turno con diferencia `0` y
depósito `5.000 COP`. Firestore y Cloud Run confirmaron cada etapa; el detalle
de IDs, revisiones y tiempos está en
[`G-SAAS-02-E2-2-GATE-F-ADR062-APPROVAL-SALE-CLOSE-2026-10-07.md`](evidence/G-SAAS-02-E2-2-GATE-F-ADR062-APPROVAL-SALE-CLOSE-2026-10-07.md).
El preview observado fue `dpl_8RPtpatX2SgmspCJWb2YcfnBjeNa`, del branch
`codex/e2-2-gate-d-deploy`; la comparación Git no encontró cambios posteriores
de UI frente a `main` en ese corte.

Gate F sigue `EN CURSO`: faltan aislamiento A/B de superficies operativas,
revocación/restauración de membresía con replay del actor restaurado y la
validación en staging del retry autenticado bajo pérdida de respuesta para el
flujo afectado por ADR-SAAS-062. PR #472 cubre ese retry en Emulator, pero no
sustituye la comprobación de staging. No se declara `FUNCTIONAL = PASS`. Gate G
debe repetirse con la aprobación previa y Gate H requiere una matriz nueva
cuando F se cierre.

Gate C se revalidó para la nueva fuente de `saas-bodega`; mantuvo diez
callables, cero Secrets y un delta de `10 update / 0 create / 0 delete`,
exclusivamente en `micafe-pos-staging`. Gate D desplegó esa fuente con salida
`0`: diez Functions `ACTIVE`, `Ready`, Node.js 22 y 100 % de tráfico en sus
revisiones nuevas. El artefacto remoto se verificó archivo por archivo contra
el paquete local, enlazando SHA de `main`, Cloud Build y digests remotos. Las
diez sondas sin autenticación respondieron `401 UNAUTHENTICATED`. No hubo
cambios de Secrets, Rules, IAM policy, Firestore/Auth ni producción.

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` permanece
reutilizable y Gate E conserva `PASS`; no se creó otro fixture. Tras Gate D se
revalidaron parcialmente los escenarios afectados de Gate F; todavía no se
cierra. Luego se debe repetir el rehearsal de Gate G y emitir una nueva matriz
de Gate H, como requiere ADR-SAAS-062. El siguiente gate sigue siendo F. Gate I
sigue `PENDING`: no se creó ni configuró el tenant real ni se persistió la
oferta. La aprobación interna de 1.600.000 COP no demuestra aceptación del
cliente; la vigencia, usuarios iniciales y normalización/confirmación del
catálogo e inventario siguen pendientes. Gates J/K/L, M2/E2.2 y G-SAAS-02
continúan pendientes; este despliegue staging no autoriza producción ni inicia
el Trial real.

Los rótulos A–F de la tabla histórica de ADR-SAAS-048 son gates internos de
esa decisión de superficie/fixture; el estado operativo actual de E2.2 se
registra en la secuencia A–L.

### Checkpoint histórico — 2026-10-06 — PR #464 / Gate D (candidato previo)

PR #464 quedó `MERGED` mediante `62fab28fdabf9941cbb25b437263c52eed59efbd`;
`origin/main` apunta a ese merge commit. La CI post-merge de `main`, run
`37532798668`, terminó `success` el `2026-10-06T21:39:16Z`, incluido `Tipos y
pruebas` y sus etapas E2E R1-A, P0-01 y Bodega —solicitud, aprobación y venta
canónica—. Los checks del PR #464 (`Tipos y pruebas`, Vercel y Vercel Preview
Comments) terminaron `PASS`. PR #463 integró la reconciliación documental de
ADR-SAAS-062/063 mediante `f337758aa675f8aaa5307e64601c0a14af26c800`; PR #464
integró la evidencia de Gate C mediante `62fab28fdabf9941cbb25b437263c52eed59efbd`.

Gate A está cerrado y Gate B permanece `COMPLETED / IMPLEMENTATION
CERTIFIED`; la evidencia de ADR-SAAS-062 está en
[`G-SAAS-02-E2-2-GATE-B-ADR062-POSTMERGE-2026-10-06.md`](evidence/G-SAAS-02-E2-2-GATE-B-ADR062-POSTMERGE-2026-10-06.md).
**Gate C — preflight de staging: `PREFLIGHT = PASS` para el artefacto
identificado en [`G-SAAS-02-E2-2-GATE-C-PREFLIGHT-2026-10-06.md`](evidence/G-SAAS-02-E2-2-GATE-C-PREFLIGHT-2026-10-06.md).**
Gate D — deploy staging: `PASS`, evidencia en
[`G-SAAS-02-E2-2-GATE-D-STAGING-DEPLOY-2026-10-06.md`](evidence/G-SAAS-02-E2-2-GATE-D-STAGING-DEPLOY-2026-10-06.md).
El deploy dirigido actualizó seis callables y creó cuatro, con cero bajas.
Las diez Functions `saas-bodega` están `ACTIVE` en `us-central1`, Node.js 22,
sin Secrets y con 100 % de tráfico en sus revisiones `Ready`. El contenido
desplegado se verificó archivo por archivo contra el paquete local del SHA de
`main`; las diez sondas no autenticadas fueron rechazadas con
`401 UNAUTHENTICATED` y no ejecutaron lógica de negocio. Firebase aplicó el
binding de transporte `roles/run.invoker: allUsers` a los cuatro servicios
nuevos; el guard Auth/tenant permanece en cada handler. No hubo cambios
manuales de IAM ni escrituras Firestore/Auth.

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` ya existe y está
validado como recurso reutilizable; Gate E queda `PASS` sin crear otro fixture
(reutilizado en las evidencias enlazadas de Gate G y Gate H). Después del
deploy staging se deben revalidar el flujo de Gate F, repetir el rehearsal de
Gate G y emitir una nueva matriz de Gate H, tal como requiere ADR-SAAS-062.
El siguiente gate es F; la CI E2E post-merge cubre Emulator y no sustituye la
validación funcional en staging.

Gate I sigue `PENDING`: no se creó ni configuró el tenant real y no se
persistió la oferta. La aprobación interna de 1.600.000 COP permanece
documentada, pero no demuestra aceptación del cliente. La vigencia de oferta,
los usuarios iniciales y la normalización/confirmación final del catálogo e
inventario (incluidas unidades, presentaciones y cantidades iniciales)
requieren confirmación antes de persistirlos. Gate J, K y L también siguen
pendientes; E2.2 y el Goal G-SAAS-02 permanecen `EN EJECUCIÓN`.

ADR-SAAS-063 está implementada en `vercel.json` con
`git.deploymentEnabled.main = false`. La inspección read-only de Vercel mostró
que el deployment Production más reciente observado,
`dpl_4viR3AppP838CJjtUHYeBLo1W19C`, se creó el 2026-10-06 a las 09:52 -05,
antes de los merges de PR #462 (13:20 -05) y PR #461 (14:07 -05). No se observó
un deployment Production posterior a esos merges; no se cambió ningún alias.

Los rótulos A–F de la tabla histórica de ADR-SAAS-048 son gates internos de
esa decisión de superficie/fixture; el estado operativo actual de E2.2 se
registra en esta secuencia A–L.

### Checkpoint histórico — corte previo a PR #461 / #462 (iniciado 2026-10-04)

La reconciliación de Gate A confirma `main @
7f46d9e9a4ef300bb0333ff4e3fbcc201cbd6933`, CI post-merge
`37219515812` `PASS` y documentación alineada con el estado remoto de
`micafe-pos-staging`. La frontera de recuperación de operador de ADR-SAAS-058
está integrada y activa tras PR #433/#434/#435 como
`restablecerCredencialOperativa` (Node.js 22, `us-central1`, hash
`2841aa754aefeffa5ec56a2a07e943c430ea40be`, únicamente
`OPERATIONAL_PIN_PEPPER`).

La frontera de membresía de ADR-SAAS-059 y la auditoría de ADR-SAAS-060 están
integradas por PR #438 como `actualizarMembresiaBodegaV1` (Node.js 22,
`us-central1`, hash `e436c21e90afb71cc88e3b557ec2e82b97b094fe`, cero
Secrets). PR #439 alineó el Backoffice Bodega con la política vertical: los
operadores no reciben navegación genérica de restaurante y el alta inicia como
`vendedor`. Estas integraciones y deploys no sustituyen la evidencia funcional
autenticada ni convierten escenarios no ejecutados en `PASS`.

PR #442 integró el allowlist de previews para la recuperación de credenciales
y su actualización dirigida quedó activa en staging como
`restablecercredencialoperativa-00003-xes` (Node.js 22, `us-central1`,
`OPERATIONAL_PIN_PEPPER` como único Secret). PR #443 integró la corrección de
cierre canónico de turnos con efectivo esperado cero mediante
`e5562bf904fb9e680d069f9cb7c8706ef6658c23`; su CI post-merge
`37259422639` terminó `PASS`. Sobre el fixture existente se verificaron
reemisión, activación y acceso PWA, y se cerró el turno sintético sin inventar
efectivo. Estas evidencias no crean otro fixture ni sustituyen la matriz
completa.

**Gate actual:** `GATE B — IMPLEMENTACIÓN`, `EN EJECUCIÓN — IMPLEMENTAR
ADR-SAAS-062 Y REVALIDAR EL FLUJO DE VENTA ANTES DEL TENANT REAL`.
ADR-SAAS-061 fue implementado e integrado mediante PR #455 (merge
`37c878034cd32f4103aa85e61a901b0f5c342e46`); la frontera fue reconciliada
por PR #458 (merge
`fb9f7d079e1cbdf53050cc85958ee896c8d5c6b9`), cuya CI post-merge terminó
`PASS` en el run `37442386369`. El deploy dirigido de `saas-commercial` a
`micafe-pos-staging` también terminó `PASS`; no creó una oferta ni un tenant.
Gate H quedó `E2.2 CERTIFIED` el 2026-10-05 mediante la matriz
[`G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-05.md).
Gate F quedó `PASS` el 2026-10-05:
aislamiento de configuración A/B, retry autenticado e idempotente, flujos
operativos Bodega, Backoffice vigente y replay canónico de membresía/claims/
auditoría están respaldados por evidencia staging. La reconciliación final del
replay está en
[`G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md).
No se crean tenants ni fixtures adicionales y no se toca producción. Gate G
quedó `PASS` el 2026-10-05 mediante el rehearsal documentado en
[`G-SAAS-02-E2-2-GATE-G-REHEARSAL-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-G-REHEARSAL-2026-10-05.md):
el turno sintético se abrió y cerró con base `0`, una venta de efectivo de
`5.000 COP`, stock posterior `4`, diferencia de caja `0`, depósito neto
`5.000 COP`, recibo/auditoría `CONFIRMADO` y sin lock activo. Gate H
consolidó esos resultados, el estado remoto y los límites pendientes: E2.2
quedó certificado para el flujo anterior de venta directa y habilitó el
preflight de Gate I; esa certificación no cubre la aprobación previa añadida
por ADR-SAAS-062.

ADR-SAAS-062 fue aceptado el 2026-10-06 para que cada vendedor presente una
solicitud server-authoritative y la administración la apruebe antes de la venta
canónica. La autorización vence en 24 horas y no reserva inventario; un cambio
de precio invalida la revisión y exige una nueva solicitud. Diana, como
administradora que también venderá, conserva venta directa por el comando
canónico con permiso explícito `sell`; no crea ni aprueba sus propias
solicitudes. Esta ampliación reabre Gate B. Tras su implementación e integración
se deben repetir las pruebas afectadas de Gate F, el rehearsal de Gate G y la
matriz de Gate H antes de continuar con la creación/configuración del tenant
real en Gate I. La oferta de 1.600.000 COP aún no está persistida y el tenant
real no existe.

El responsable del proyecto aprobó ADR-SAAS-063 el 2026-10-06: el proyecto
Vercel `cafeatrato` conservará los Preview de PR y deshabilitará los
deployments Git automáticos de `main`; cualquier release de producción requiere
un gate posterior independiente. PR #462 implementa esta barrera y debe
integrarse antes de reanudar la auditoría/merge de PR #461. Esta decisión no
autoriza release, promoción de alias, tráfico productivo ni modifica Firebase;
E2.2 continúa `EN EJECUCIÓN`.

### Checkpoint histórico — 2026-10-05 (supersedido por PR #461)

En staging pasaron los subescenarios de aislamiento de lectura de configuración
tenant A/B con dos contextos Auth independientes y retry autenticado/idempotente
de apertura seguido del cierre canónico del turno sintético. La evidencia y su
mutation audit están en
[`G-SAAS-02-E2-2-GATE-F-ISOLATION-RETRY-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-F-ISOLATION-RETRY-2026-10-05.md).

La comprobación autenticada del Backoffice Bodega en el preview vigente pasó
para acceso, contexto del fixture, navegación y política de operadores. La
evidencia está en
[`G-SAAS-02-E2-2-GATE-F-BACKOFFICE-UI-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-F-BACKOFFICE-UI-2026-10-05.md).
Esto corrige el checkpoint anterior que indicaba que solo se había alcanzado
el login del operador de plataforma.

La comprobación staging exigida por ADR-SAAS-059/060 también quedó en `PASS`:
una única invocación autenticada del comando canónico devolvió HTTP 200, el
vendedor volvió a iniciar sesión con claims del fixture y consultó el catálogo,
y el replay conservó una sola obligación y un solo hecho append-only. Gate G
quedó posteriormente cerrado mediante el rehearsal enlazado arriba. Gate H
quedó certificado mediante la matriz vigente. Tenant real, aceptación
operativa y producción siguen pendientes; E2.2 continúa `EN EJECUCIÓN`.

El preflight documental inicial de Gate I confirmó el 2026-10-05 que aún no
había datos comerciales y operativos autorizados de Distribuidora Las Jiménez;
por ello no se creó ni configuró un tenant real. Esa evidencia conserva el
estado de su ejecución. Posteriormente se autorizó una tarifa anual específica
por tenant, por lo que ADR-SAAS-061 fue aceptada el 2026-10-05. La frontera fue
implementada, auditada e integrada mediante PR #455 (merge
`37c878034cd32f4103aa85e61a901b0f5c342e46`). Al corte de este preflight
(2026-10-05), Gate I seguía pendiente de CI post-merge, preflight reproducible
y deploy controlado de `saas-commercial`; ese estado fue supersedido el
2026-10-06 por la reconciliación documentada abajo. No se creó ni configuró un
tenant real. El detalle del
preflight inicial y su mutation audit están en
[`G-SAAS-02-E2-2-GATE-I-PREFLIGHT-BLOCKED-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-I-PREFLIGHT-BLOCKED-2026-10-05.md).

### Reconciliación post-merge y deploy staging — PR #458 (2026-10-06)

PR #458 integró la resolución server-side de los términos de oferta. Su merge
`fb9f7d079e1cbdf53050cc85958ee896c8d5c6b9` está en `origin/main`; la CI
post-merge terminó `PASS` en el run `37442386369`. La frontera comercial se
desplegó de forma dirigida únicamente a `micafe-pos-staging` mediante
`firebase deploy --only functions:saas-commercial --project micafe-pos-staging`.
`saas-commercial` registra `consultarOfertaComercialTenantSaas` y
`ejecutarComandoComercialSaas`, ambas Node.js 22, `us-central1`, cero Secrets;
las dos revisiones quedaron `READY` con 100 % del tráfico en su revisión
vigente. La evidencia de build, artefacto, digest, configuración, smoke de
autenticación, rollback y mutation audit está en
[`G-SAAS-02-E2-2-GATE-I-COMMERCIAL-DEPLOY-2026-10-06.md`](evidence/G-SAAS-02-E2-2-GATE-I-COMMERCIAL-DEPLOY-2026-10-06.md).

Este deploy cierra únicamente el subgate técnico de publicación staging. No
se creó ni persistió la oferta, no se ejecutó Bootstrap o Activation y no se
creó ni configuró el tenant real. Gate I continúa `EN EJECUCIÓN`; la vigencia
explícita de la oferta y las precondiciones documentadas para registrar la
oferta y efectuar el alta real siguen pendientes. E2.2 permanece `EN
EJECUCIÓN`; no se declara producción lista ni se autoriza su acceso.

La reconciliación de ADR-SAAS-062 y la aceptación de su cambio de alcance se
registran en
[`G-SAAS-02-E2-2-ADR-SAAS-062-ACCEPTANCE-2026-10-06.md`](evidence/G-SAAS-02-E2-2-ADR-SAAS-062-ACCEPTANCE-2026-10-06.md).

### Reconciliación post-merge — PR #447 (2026-10-05; checkpoint inicial supersedido)

La prueba canónica de Gate F detectó que la activación y el replay exacto de
una membresía Bodega no restauraban los claims del vendedor después de la
desactivación. La corrección mínima quedó integrada mediante PR #447 en
`main @ 59365d1b916d740f6f0d96c4edb570c2df9c86f8` (HEAD del PR
`38af2d0da5d0ec0620046418fb8952f19b3d8a59`); la CI post-merge
`37329105800` terminó `success`. La implementación añade cobertura de replay
elegible y evita sobrescribir claims que pertenecen a otro tenant.

En el checkpoint inicial posterior al merge de PR #447, el update controlado
seguía pendiente por la solicitud del CLI de generar identidades administradas
de Pub/Sub y Eventarc; esa incertidumbre sobre su generación/reutilización
efectiva sigue registrada como `UNKNOWN` y no se reporta cambio manual de
política IAM.

La reconciliación posterior confirma que staging ya ejecuta la revisión
`actualizarmembresiabodegav1-00002-zog` de
`actualizarMembresiaBodegaV1` (Node.js 22, `us-central1`, cero Secrets), con
100 % del tráfico y hash `795e32a293708f60528c80d1463e2dd8fcc055e0`. El Cloud
Build `3b319894-1013-4f9f-a458-36ea80753122` terminó `SUCCESS`; aunque su
`sourceProvenance` está vacío, los 39 archivos del source ZIP coinciden byte
por byte con el paquete en `main @ 6896886e91812eb73f345b08739d71ac6f3e2d01`.
La revisión previa `00001-cuj` sigue retenida sin tráfico, ahora marcada
`Retired` por Cloud Run.

En ese checkpoint inicial, la sonda sin Auth respondió `401 UNAUTHENTICATED` y
la lectura posterior confirmó que no cambió la membresía, la obligación
emitida ni los claims. En ese momento el replay canónico autenticado seguía
pendiente y Gate F estaba `BLOCKED / PENDING AUTHENTICATED CANONICAL REPLAY`.
Ese estado fue supersedido por la validación posterior documentada en el
checkpoint vigente de arriba y en la evidencia enlazada; Gate F está ahora en
`PASS`. El detalle y la auditoría de mutaciones están en
[`G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md`](evidence/G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md).

### Checkpoint histórico — 2026-10-03

La evidencia consolidada de Gate F está integrada en `main` mediante PR #430,
merge commit `1e822c7dbe456eff5868db7fc2626157ed39a0fd`. En el fixture
retenido `E2_2-BODEGA-STAGING-FIXTURE` se verificaron autenticación PWA de un
vendedor sintético, ventas por transferencia y efectivo, turno, inventario,
stock insuficiente, autoridad server-side, credencial anterior/nueva,
payload manipulado y replay/idempotencia secuencial y concurrente. El PIN no
se registra. Gate F permanece `BLOCKED / PENDING FUNCTIONAL MATRIX` porque no
existe un segundo contexto vendedor canónico utilizable para A/B ni una ruta
staging desplegada para revocar/restaurar credenciales de un vendedor; el
retry de red dedicado tampoco se ha ejecutado en staging. No se crea otro
tenant ni se modifica producción para cerrar artificialmente esos casos.

ADR-SAAS-058 queda aceptado como decisión mínima para aislar
`restablecerCredencialOperativa` en `saas-tenant-credential-recovery`, con la
autoridad de administrador tenant y el único Secret existente
`OPERATIONAL_PIN_PEPPER`. Su implementación, preflight, deploy y validación
permanecen pendientes; esta aceptación no transforma ningún escenario de Gate
F en `PASS`.

ADR-SAAS-059 queda aceptado como decisión mínima para impedir que el Backoffice
de Bodega administre roles o módulos ajenos al vertical. La futura frontera
`saas-bodega-membership` gestionará exclusivamente el estado de vendedores
Bodega, sin Secrets, mientras `crearIncorporacionDirecta` conservará el alta
canónica con validación vertical. Implementación, preflight, deploy y
validación permanecen pendientes; no se crearon usuarios ni fixtures ni se
modificó producción.

ADR-SAAS-060 queda aceptado como decisión mínima para completar la auditoría
canónica e idempotente de `actualizarMembresiaBodegaV1`. Extiende únicamente
los tipos append-only de auditoría para el cambio de estado de un vendedor
Bodega y preserva la ruta legacy para verticales no Bodega. Implementación,
preflight, deploy y validación permanecen pendientes; E2.2 continúa `EN
EJECUCIÓN`.
El CI post-merge del commit anterior terminó `PASS`; E2.2 permanece `EN
EJECUCIÓN`.

### Checkpoint histórico — 2026-09-11

La auditoría operativa y de seguridad vigente está registrada en
[`docs/security/G-SAAS-02-AUDITORIA-2026-08-23.md`](../security/G-SAAS-02-AUDITORIA-2026-08-23.md)
y prevalece sobre los párrafos históricos de esta sección. El Goal permanece
`ACTIVO`, con M2/E2.1 en ejecución y E2.2 habilitado en paralelo para el corte
técnico reusable de Bodega MVP-1, porque todavía falta la evidencia de que el
primer cliente pueda operar el Trial completo. E2.2 no crea ni configura el
tenant real hasta superar sus gates. El checkpoint confirma que las
operaciones críticas tienen cobertura reusable local, pero separa esa evidencia
de la certificación del tenant real, del release productivo y del Trial.

- **PR #375:** fusionado en `origin/main @ 6f61437b4932bc5e650f1690f82d1981c1e35593`; `ADR-SAAS-037` queda aceptado e implementado. La CI del PR y la CI post-merge (`34637120894`) terminaron completamente en verde.
- **P1-09:** integrado en PR #351, pero `DISABLED / FAIL CLOSED` hasta completar los gates externos.
- **Security re-scan:** la lectura/listado global de `usuarios` quedó aislada por Rules y servicio backend tenant-aware; el escaneo de configuración no reportó hallazgos. `npm audit --omit=dev` conserva vulnerabilidades de dependencias preexistentes, fuera del alcance de ADR-SAAS-037.
- **Restricciones preservadas:** `empresaId` es la frontera de seguridad; `espacioId` no se convierte en Sede; no se implementa multi-sede.
- **Bodega MVP-1 / E2.2:** ADR-SAAS-041 y ADR-SAAS-042 quedan aceptados. PR #382 integró la fundación reusable, PR #383 clientes empresariales, PR #384 presentaciones/precios, PR #385 contrato/autoridad U3-A, PR #386 resolución/stock U3-B y PR #387 confirmación atómica U3-C en `origin/main @ 93f8819`; PR #388 integró U4→U5 (PWA vendedor y backoffice administrativo) y PR #389 la certificación integrada. Bodega MVP-1 está `CERTIFIED / MERGED / PASS` en `origin/main @ 5e0d0274b474f3aa5d871788fc0c9aefa36caf74`. El siguiente gate es el ensayo de onboarding/staging: siguen prohibidos tenant real, datos o secretos reales, despliegue, operación fiscal, Wompi y operaciones productivas hasta completar los gates de provisioning.
- **ADR-SAAS-048 / E2.2:** aceptado el 2026-09-29 para gobernar temporalmente la superficie Bodega en `saas-auth` y el concepto `E2.2-BODEGA-STAGING-FIXTURE` con retención auditada. Gate A — aprobación documental quedó `COMPLETED / ACCEPTED`; Gate B — preflight técnico de `saas-auth` quedó `BLOCKED / SUPERADO MEDIANTE DECISIÓN ARQUITECTÓNICA` por ADR-SAAS-049. La aceptación no autoriza deploy, fixture, Bootstrap, Activation ni producción; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-049 / E2.2:** aceptado el 2026-09-29 como Gate arquitectónico `COMPLETED / ACCEPTED` para el boundary dedicado `saas-bodega`, inicialmente con cinco callables Bodega, `us-central1`, Node.js 22 y cero Secrets. PR #400 integró `functions-bodega`, el manifest `saas-bodega` y su closure mínima en `main` mediante `a89b5f17567abd45e1b177b76c9822c4add985ee`; la CI post-merge `36740060340` terminó `PASS`. El preflight y deploy staging dirigidos de las cinco callables quedaron verificados el 2026-09-30; sus revisiones están `ACTIVE`, con cero Secrets y 100 % de tráfico más reciente. ADR-SAAS-052 complementa explícitamente esa frontera con una sexta callable, sin reabrir ni reinterpretar el corte original. Fixture, validación funcional, rehearsal, certificación, cutover y producción permanecen pendientes; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-052 / E2.2:** aceptado el 2026-10-01 para completar la creación de categorías Bodega mediante `crearCategoriaBodegaV1` en `saas-bodega`, `us-central1`, Node.js 22 y cero Secrets. PR #409 integró la callable, su adaptador administrativo mínimo y el enforcement Rules de categorías Bodega en `main` mediante `9f307fe75d1069dc08279c87aaac0156a56503be`; la CI post-merge `36968156967` terminó `PASS`. El preflight y deploy staging quedaron verificados con revisión `crearcategoriabodegav1-00001-zin`, hash `41b7db7415558b023086b660d8a07f2681b8d94e` y Cloud Build `d3e01185-c265-47a1-b70e-00033762ae57`. La validación contra el fixture Bodega retenido y la reanudación de Gate E permanecen pendientes; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-047 / E2.2:** aceptado el 2026-09-28 para aislar la lectura tenant-aware de `obtenerConfiguracionEmpresa` en `saas-tenant-configuration`, con cero Secrets. La implementación local `3bc59c2c579ffa7500ea7d041ddd75b6cf436aab` fue desplegada y certificada en staging como `obtenerconfiguracionempresa-00002-pib` (Node.js 22, `us-central1`, 100 % tráfico, cero Secrets). El baseline histórico `obtenerconfiguracionempresa-00001-zif` se conserva sin tráfico y sin procedencia Git reproducible. El PR #395 fue fusionado en `main` mediante `27d83d0d7fa8a736a3fca34e4a27d9bc6709c3c2` el 2026-09-29 01:12:11 UTC; su HEAD `cf2e4c87a28592127e05746c58bd830ba38b0d0a` está integrado, los checks previos al merge terminaron `PASS` y la integración Git fue verificada. Cualquier validación posterior vinculada a esa integración y producción permanecen pendientes; E2.2 continúa `EN EJECUCIÓN` y esta evidencia no modifica otros boundaries ni autoriza producción.
- **ADR-SAAS-050 / E2.2:** aceptado el 2026-09-30 para aislar las dos superficies de acceso de plataforma al tenant en `saas-platform-tenant-access`: `obtenerDetalleEmpresaPlataformaSaas` y `reemitirCredencialInicialTemporalSaas`. El detalle conserva cero Secrets; la reemisión enlaza exclusivamente el Secret existente `OPERATIONAL_PIN_PEPPER`. La frontera quedó integrada en `main` mediante PR #407 (`f0baeeea455b9380da8126a7e7061cfb87d121d0`); su deploy y la reemisión controlada del fixture fueron gates posteriores separados. El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` está `ACTIVE`; no autoriza fixtures adicionales ni producción. E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-051 / E2.2:** aceptado el 2026-09-30 y ejecutado mediante PR #405, integrado en `main @ c3f7727268109f8f3128f00e930f45e9cbe926eb`. Extrae el núcleo neutral y único de emisión/reemisión de credenciales e incorporación que permite a `saas-platform-tenant-access` reutilizar el emisor canónico sin importar `saas-auth`; conserva hash, transacción, idempotencia y auditoría, sin endpoints ni Secrets propios. Deploy, tráfico, reemisión, Bootstrap, Activation, fixture adicional y producción continúan pendientes bajo sus gates separados. E2.2 permanece `EN EJECUCIÓN`.
- **ADR-SAAS-053 / E2.2:** aceptado el 2026-10-02 para aislar la recuperación de un administrador tenant activo en `saas-platform-credential-recovery`: `restablecerCredencialAdministradorTenantSaas`, `reemitirRestablecimientoCredencialAdministradorTenantSaas` y `activarRestablecimientoCredencial`. La decisión conserva los contratos, la autoridad y la auditoría de ADR-SAAS-017, enlaza exclusivamente `OPERATIONAL_PIN_PEPPER` y no autoriza desplegar `saas-auth`, reemitir el fixture, Bootstrap, Activation, fixtures adicionales ni producción. La implementación, el preflight y el deploy staging permanecen como gates posteriores separados; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-053 / E2.2 — reconciliación posterior:** la implementación de `saas-platform-credential-recovery` quedó integrada en `main` mediante `163afec5058f86ef7ddb97f0b34976b0fadee408` / `223ccce695a15fa44a220bcfe020f5f415778366`. El preflight y el deploy dirigido en `micafe-pos-staging` quedaron verificados con tres Functions `ACTIVE` en `us-central1`, Node.js 22, hash `32b5099d812dbbe1df67437a840000a082a7ec58` y únicamente el Secret existente `OPERATIONAL_PIN_PEPPER`. La reemisión y activación del administrador sintético, la validación funcional, el rehearsal y la certificación siguen pendientes; E2.2 permanece `EN EJECUCIÓN`.
- **ADR-SAAS-054 / E2.2:** aceptado el 2026-10-02 para habilitar la implementación controlada de `saas-operational-onboarding` (`crearIncorporacionDirecta`) y `saas-bodega-operations` (las seis superficies operativas definidas). El PR #414 documenta la decisión y el PR técnico #415 quedó integrado en `main @ 8710b04400ed58973ccbc33b268f20dc0eeede3f`; la CI post-merge `37066206636` terminó `PASS`. El deploy staging dirigido creó las siete Functions autorizadas: `crearIncorporacionDirecta` con el único Secret `OPERATIONAL_PIN_PEPPER` y las seis operaciones Bodega con cero Secrets, todas `ACTIVE` en `us-central1`, Node.js 22 y 100 % de tráfico más reciente. PR #416 corrigió el bloqueo de readiness fiscal del vendedor Bodega y quedó integrado en `main @ e3b414dc61f111dbc585c8fa7e73f8fd303a165f`, con CI post-merge `37072427708` `PASS`. Gate F permanece pendiente de ejecutar contra `E2_2-BODEGA-STAGING-FIXTURE`; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-055 / E2.2:** aceptado el 2026-10-03 para habilitar la frontera controlada `saas-platform-financial-account-provisioning`, con la callable `provisionarCuentaOperativaTenantSaas`, `us-central1`, Node.js 22 y cero Secrets. PR #421 integró su implementación en `main` mediante `d3ae278990dda42d157257eb8619d549cb9d6ab2` (commit técnico `276590739ff7e80bb825c75a33a1764844183c69`); los checks previos al merge terminaron `PASS`. El preflight y deploy staging quedan reconciliados con hash `4e82efe79e1b272828b1dd6d1a25f6d3172a26b1`, generación `1791001875431513` y Cloud Build `451f5474-e7fb-48b8-b181-e723746fe4e3`; la invocación canónica del fixture respondió `200` y creó la cuenta `bancolombia`. No se amplió `saas-auth`, no se modificó Bootstrap ni se escribió directamente el fixture. Gate F continúa `BLOCKED` hasta completar la matriz funcional; E2.2 continúa `EN EJECUCIÓN`.
- **ADR-SAAS-056 / E2.2:** aceptado el 2026-10-03 para materializar la lectura backend-only `consultarAuditoriaPlataformaSaas` en el boundary read-only existente `saas-platform-resources`, con `us-central1`, Node.js 22 y cero Secrets. La decisión conserva ADR-SAAS-012: facultad server-side `PLATAFORMA_CONSULTAR`, filtros selectivos, paginación y proyección sanitizada; no autoriza lectura directa de Firestore ni el deploy de `saas-auth`. La implementación, CI, preflight, deploy staging y validación del panel Historial del Backoffice quedaron verificados; la callable está `ACTIVE` y el panel respondió `200` para el fixture retenido. El subgate de auditoría de Gate F queda `PASS`; la matriz funcional completa, aislamiento y negativos siguen pendientes; E2.2 permanece `EN EJECUCIÓN`.
- **ADR-SAAS-057 / E2.2:** aceptado el 2026-10-03 tras el deploy controlado de ADR-SAAS-056: el panel Historial alcanzó la callable, pero Firestore requirió el índice compuesto `saas_auditoria(agregado.id ASC, agregado.tipo ASC, registradoEn DESC)`. El índice `CICAgJiUpoMK` fue creado exclusivamente en `micafe-pos-staging` y alcanzó `READY`; el panel se reintentó y mostró cuatro eventos `CONFIRMADO`, con respuesta HTTP `200`. No se modificaron Functions, Rules, Auth, IAM, Secrets, fixture ni producción; el subgate de auditoría de Gate F queda `PASS` y la matriz funcional completa permanece pendiente; E2.2 permanece `EN EJECUCIÓN`.
- La formulación inicial del registro de ADR-SAAS-053 conserva el estado al
  momento de aceptación; la reconciliación posterior anterior es la fuente de
  verdad vigente para implementación y deploy.
- **Bloqueadores externos:** autorización de despliegue, secretos Wompi, evidencia WAF, autorización del tenant y ventana productiva; Recovery independiente ya está en `PASS`.
- **Excepción paralela — P2-05:** F1–F4 de la integración administrativa POS → Dusema quedaron recuperadas e integradas en `main @ 91bb6ae` bajo ADR-SAAS-038, sin modificar el resultado comercial, Milestone, Epic ni criterios de aceptación de G-SAAS-02. ADR-SAAS-039 queda `Propuesto` para el staging controlado: la Etapa B no está ejecutada y no autoriza provisioning, configuración externa, secretos, bindings reales, despliegue ni pruebas E2E hasta su aprobación explícita y la aprobación documentada de la región Firestore.

- **Revision de ADR-SAAS-031:** PR #289 registró la revisión inicial y PR #301 aceptó la alternativa B para ejecución controlada: backup diario, retención de 35 días, RPO ≤24 h, RTO ≤4 h, restore a una base nueva aislada en `micafe-pos/southamerica-east1`, responsable cloud autorizado, rollback sin tocar `(default)` y costo variable bajo billing habilitado. El ADR no autoriza escrituras del tenant, inicio del Trial anual ni restore sobre la base de origen.
- **Revisión de ADR-SAAS-030:** la decisión de continuidad de G-SAAS-02 del 2026-08-14 aceptó la alternativa B para el cutover server-authoritative de productos, insumos, ajustes y mermas. El alcance exige Functions idempotentes, resolución server-side de actor/tenant/lifecycle/artículo/stock/secuencia, Rules read-only para esas colecciones, pruebas de Functions/Rules/Emulator y rollback sin editar históricos. La aceptación no autoriza escrituras productivas.
- **Revisión de ADR-SAAS-033:** la auditoría de reservas internas aceptó Functions server-authoritative para cancelar y completar, con agenda atómica, lock tenant-aware, cobro DEMO determinista e idempotencia. La reserva pública y Wompi permanecen fuera de este alcance. La aceptación no autoriza escrituras productivas.

- **Evidencia de release vigente:** PR #296 publico la recoleccion read-only contra `origin/main @ 3d5ef26`; CI, Vercel, Functions, Rules y Storage quedaron PASS. Smoke productivo y recovery permanecen MISSING. Esta evidencia no autoriza escrituras ni inicia el Trial anual.

- **Reconciliacion posterior:** PR #292 registro esta evidencia en el Goal y mantuvo el estado `ACTIVO`, sin cambios de runtime ni de produccion.
- **Reconciliacion posterior:** PR #294 integró una prueba end-to-end de la secuencia post-vencimiento del Trial histórico: suspensión canónica, relación anual append-only, readiness para reactivar Empresa, nueve capacidades y preservación contractual de la raíz. No cambió producción ni acepta `ADR-SAAS-031`.
- **Reconciliacion posterior:** PR #296 publicó evidencia read-only vigente contra `origin/main @ 3d5ef26`; CI, Vercel, Functions, Rules y Storage quedaron reconciliados. Recovery y smoke productivo continúan pendientes, sin cambios de runtime ni de producción.
- **Reconciliacion posterior:** PR #298 publicó el preflight read-only actual contra `origin/main @ 8f0fa6f7bfe3dbd20aa15598bbdb281448f079b6`; el tenant conserva el Trial histórico, no existe relación anual y recovery continúa como `BLOCKER`. No hubo escrituras productivas.
- **Reconciliación posterior:** PR #299 reconcilió el Goal después del preflight; PR #300 incorporó la verificación read-only de billing habilitado, PITR deshabilitado, cero schedules y cero backups al ADR-031. PR #301 aceptó ADR-SAAS-031 y su CI post-merge quedó en verde (`origin/main @ ac21c10330e9e22f99f93929a7b96a1982fc2de1`). No hubo escrituras productivas.
- **Reconciliación posterior:** PR #303 registró la ejecución de ADR-SAAS-031: el schedule diario de 35 días quedó observable con ID `fa16b7c4-ecb8-418f-bf3a-815da592fabc` en `origin/main @ 6cb69968ffea33df8e34d92926005a4e77ec8f3c`. La configuración de recovery está en PASS; el primer backup, restore aislado, RPO/RTO y atestación independiente siguen pendientes. No se modificó el tenant ni se inició el Trial anual.
- **Reconciliación posterior:** PR #305 publicó el preflight read-only vigente contra `origin/main @ 552628e5c7682abe82845712daf5eb178cea648a`: tenant, raíz histórica, plan anual, configuración histórica, operador y ausencia de relación anual permanecen confirmados; el único WAITING es el Trial histórico abierto hasta `2026-09-02`. No hubo escrituras productivas.
- **Reconciliación posterior:** PR #307 integró el guard de restore de recovery contra `origin/main @ 5a8f045eec62c230afffde9d7bed67f2fd90ccf5`, con validación estricta de proyecto, ubicación, backup y destino aislado, sin restaurar sobre `(default)` y sin ejecutar si el backup no es observable. La CI post-merge quedó verde (`31819426634`); el primer backup, restore productivo aislado, RPO/RTO y atestación independiente siguen pendientes.
- **Reconciliación posterior:** PR #309 integró el transporte REST autenticado para observar el backup y solicitar el restore cuando `FIREBASE_ACCESS_TOKEN` se entrega fuera de Git, manteniendo `gcloud` como fallback y sin cambiar el tenant ni el schedule. Quedó integrado en `origin/main @ 6745e4c679f6d8be9caf71ce6e3d906f501161ce`; la CI post-merge (`31825032595`) está verde. El primer backup, restore productivo aislado, RPO/RTO y atestación independiente siguen pendientes.
- **Reconciliación posterior:** PR #311 integró evidencia read-only del transporte REST de recovery contra `origin/main @ d02d6bbf0dea10ec958356df892bc4a9c511b0f5`; la CI post-merge (`31829960025`) terminó en verde. El endpoint de backups respondió HTTP 200 pero aún no expone un backup observable; el guard rechazó un identificador inexistente y no invocó restore. El primer backup, restore productivo aislado, RPO/RTO y atestación independiente siguen pendientes. No hubo escrituras productivas ni inicio del Trial anual.
- **Reconciliación posterior:** PR #313 publicó la evidencia read-only vigente contra `origin/main @ 47c16ecf45265a49add6448b281e9a504272d302`; la CI post-merge (`31834771417`) terminó en verde. CI, Vercel y las 74 Functions activas en Node.js 22 quedaron reconciliados. El release global continúa `INCOMPLETE`: smoke productivo, Rules/Storage independientes, primer backup observable, restore aislado, RPO/RTO y atestación de recovery siguen pendientes. No hubo escrituras productivas ni inicio del Trial anual.
- **Reconciliación posterior:** PR #315 integró la reconciliación independiente de Rules y Storage contra `origin/main @ 430950d62b11570389fc167fae42dccac1d535f9`; la CI post-merge (`31839380376`) terminó en verde. Los hashes actuales de `firestore.rules` y `storage.rules` coinciden con los hashes desplegados observados por la API GET postdeploy, sin cambios entre ambos SHAs. Rules y Storage quedan PASS; smoke productivo, primer backup observable, restore aislado, RPO/RTO y atestación de recovery siguen pendientes. No hubo escrituras productivas ni inicio del Trial anual.
- **Decisión posterior:** `ADR-SAAS-032` fue aceptado por instrucción explícita del Product Owner para cerrar anticipadamente el Trial mensual de Café Atrato sin alterar sus fechas, plan, capacidades ni snapshot histórico. Se integró un modo de preflight anticipado que exige referencia de decisión y atestación independiente de recovery; la observación del 2026-08-14 mantiene la ejecución bloqueada porque todavía no existe backup observable ni token Firebase de operador para la callable. No hubo escrituras productivas.
- **Reconciliación posterior:** PR #317 integró ADR-SAAS-032, el preflight de cierre anticipado y el gate de autenticación read-only del operador. Quedó fusionado en `origin/main @ 05f70a84c98a0f30bda3b1151552e541b1e46135`; su CI post-merge (`31844323881`) terminó en verde. No hubo escrituras productivas.
- **Reconciliación posterior:** PR #318 quedó fusionado en `origin/main @ e136ea899a4e9269e14ad51bb4fc8e1f6092fc97`; su CI post-merge (`31846393519`) terminó en verde. El preflight read-only vigente confirmó la identidad Firebase del operador contra `consultarContextoPlataforma` y dejó `RECOVERY_EVIDENCE_MISSING` como único bloqueo para cualquier escritura del tenant. No hubo escrituras productivas.
- **Reconciliación posterior:** contra `origin/main @ 83aa5c2a08fcbcf3bef85dd3d1d11ad66a7525a6`, el preflight read-only volvió a confirmar la identidad Firebase del operador y mantuvo `RECOVERY_EVIDENCE_MISSING` como único bloqueo de escritura. No hubo escrituras productivas.
- **Reconciliación posterior:** PR #323 integró `ADR-SAAS-033`, las Functions server-authoritative para cancelación/completado interno, el cliente por comandos, Rules de solo lectura y pruebas de replay. La CI del PR y la CI post-merge terminaron en verde; `origin/main` quedó en `65f9fa00a1cfaa4eddd5395e7bceeaa9d952218d`. No hubo escrituras productivas.
- **Reconciliación posterior:** el release de `origin/main @ 7d9078f` desplegó y verificó las Rules y las 79 Functions activas, incluyendo las cinco callables de inventario/merma/reservas de PR #322/#323. La evidencia read-only `G-SAAS-02-POS-REMEDIATIONS-RELEASE-2026-08-15.md` confirma CI/Vercel/Rules/Storage PASS; smoke productivo y recovery permanecen pendientes. No se escribieron documentos del tenant.
- **Reconciliación posterior:** PR #326 integró la observación read-only del schedule de recovery y de la ventana inicial del primer backup en `origin/main @ c2ff8855d2564972886d0f4f9bb296f5f3035d0e`; su CI post-merge `31869772371` terminó en verde. El schedule diario de 35 días permanece único y sin cambios; aún no existe backup observable, restore aislado ni atestación independiente. La cuenta de servicio local no tiene permisos de backups/restore, por lo que el ensayo requerirá un operador con permisos de recovery. No hubo escrituras productivas.

- **Progreso:** PR #246 integró M1; PR #247 sincronizó el estado del Goal; PR #248 integró el gate read-only de certificación para tenants en Trial; PR #249 reconcilió el estado vivo; PR #250 registró la evidencia read-only de producción; PR #251 reconcilió la evidencia y la documentación posterior al merge; PR #252 y #253 sincronizaron el estado vivo; PR #256 publicó la evidencia del catálogo anual y alineó el runbook; PR #257 aceptó ADR-SAAS-029; PR #258 materializó la relación contractual append-only y actualizó los consumidores; PR #260 integró el lifecycle anual server-side: confirmación manual de pago ligada a la relación, recibo con snapshot, vencimiento, scheduler, idempotencia y runbook operativo. PR #264 integró la evidencia contractual anual, PR #265 reconcilió el estado del Goal, PR #266 integró la auditoría global del POS y PR #267 reconcilió nuevamente el Goal con el merge de #266. PR #269 integró el preflight read-only de transición y su evidencia. PR #270 reconcilió el Goal después de ese merge. PR #271 reconcilió la evidencia posterior al merge sin cambiar runtime. PR #272 reconcilió el estado del Goal después del merge de #271. PR #273 integró el recolector read-only de evidencia de release y su runbook. PR #274 reconcilió el estado posterior al merge de #273. PR #275 alineó la evidencia final con `main`. PR #276 reconcilió la evidencia final post-merge sin cambiar runtime. PR #278 integró la observación read-only de Rules, Storage y recovery; su CI completa, E2E, Vercel y CI post-merge quedaron en verde. PR #279 registró la verificación postdeploy de Rules y Storage. El deploy controlado posterior sincronizó Rules y Storage con `main @ a644d1d`, como registra la evidencia postdeploy. PR #280 integró el mapa Function → hash y cerró la reconciliación por Function con 74 Functions activas en Node.js 22. PR #281 registró la evidencia de reconciliación de Functions posterior al merge. PR #282 incorporó `ADR-SAAS-031` en estado Propuesto para resolver la política de recovery productivo. PR #284 publicó la evidencia final read-only y el preflight contra el release observado. PR #285 reconcilió la trazabilidad del Goal después del merge de #284, sin cambios de runtime. PR #286 estabilizó las referencias de evidencia posteriores al merge, sin cambios de runtime ni de producción. PR #287 reconcilió la trazabilidad del Goal después del merge de #286, sin cambios de runtime ni de producción. PR #294 integró la prueba end-to-end de la secuencia post-vencimiento del Trial histórico, sin cambios de runtime ni de producción. Los gates pendientes siguen siendo smoke productivo y recovery verificable. Café Atrato conserva el Trial mensual histórico y todavía no existe relación anual materializada en producción.
  PR #333 integró la corrección del verificador de restore, la evidencia del ensayo aislado y la reconciliación de ADR-SAAS-031; quedó fusionado en `origin/main @ 6b6a54df3216abd5c42c2bd3f5d2c5ad70d4ef4f` con CI post-merge `31879879743` en verde. Recovery independiente queda PASS; smoke productivo, autenticación real del operador, transición contractual y Trial anual siguen pendientes. No hubo escrituras del tenant.
- PR #334 reconcilió el estado del Goal después del merge de #333 y quedó fusionado en `origin/main @ 6b00fd9f180754a381367529d82a9e12509aeb0e`, sin cambios de runtime ni escrituras productivas. La evidencia read-only del SHA vivo confirma CI, Vercel, 79 Functions Node.js 22, Rules, Storage y punto de recovery en PASS; el smoke autenticado continúa MISSING.
- PR #335 alineó la trazabilidad del Goal con el SHA vivo y quedó fusionado en `origin/main @ c25960e64cf1841abd19fc3f2fa609f450444ee6`; su CI post-merge `31882714342` terminó en verde. No cambió runtime ni produjo escrituras productivas.
- PR #336 dejó la referencia del siguiente paso basada en el SHA vivo resuelto al ejecutar el preflight y quedó fusionado en `origin/main @ 7d39e73277e8a9a8a7017a192b7e5a30a66273d9`; su CI post-merge `31883902120` terminó en verde. No cambió runtime ni produjo escrituras productivas.
- PR #342 corrigió la selección del operador del preflight para exigir coincidencia con el UID Firebase autenticado. Quedó fusionado en `origin/main @ cbb6004ebb8b17d182c10e5d528e6918a3af4bd1`; la CI post-merge `31933806981` terminó en verde. La evidencia read-only vigente confirma `OPERATOR_AUTHENTICATION_CONFIRMED`; no hubo escrituras productivas.
- Auditoría funcional read-only contra `origin/main @ cbb6004`: ventas, inventario de productos/insumos y Kardex, recetas y consumo de insumos, cocina/KDS, salón, compras, turnos y arqueo, mermas, finanzas, gastos, cuentas de cobro, clientes, reportes, permisos y configuración tienen consumidores tenant-aware y servicios reales. Las certificaciones de emulador `P0-06` (turnos/arqueo), `P1-02` (recetas/modificadores) y `P1-04` (salón/cocina) pasaron, al igual que typecheck, build de aplicación, build de Functions y lint. Esto certifica el código y el aislamiento; no sustituye el smoke autenticado de Café Atrato.
- Divergencia funcional/comercial detectada: el catálogo contractual anual vigente materializa nueve capacidades (`sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`, `shifts`, `cuentas_cobro`). `recipes`, `kitchen`, `salon`, `reports`, `gastos`, `permissions`, `settings` e `historial` existen en el producto, pero no forman parte de esas nueve capacidades y por ello no se habilitan automáticamente en el tenant. Ampliar la oferta requiere una decisión de Product Owner y su ADR/actualización contractual; no se cambia silenciosamente durante el Trial histórico.
- **Estado:** ACTIVO.
- PR #349 corrigio el indice compuesto faltante para Finanzas (`transacciones_financieras`: `empresaId ASCENDING`, `fecha DESCENDING`). Quedo fusionado en `origin/main @ 2cc04ca8fef83e4545e7a7dc5fa5702336fd6018` con CI y Vercel en verde. El indice se desplego en `micafe-pos`, alcanzo estado `READY` y la consulta equivalente del PWA respondio sin `FAILED_PRECONDITION`; no se modificaron documentos ni el Trial.
- PR #353 quedó fusionado en `origin/main @ 1448e03fa5210ad857881b1af94997aff62f1636`. El corte cerró la autoridad server-side de precio, nombre, código, costo, categoría, modificadores, impuestos, pago y estado en la confirmación fiscal; rechazó snapshots cliente obsoletos o manipulados, preservó la rama interna de Wompi bajo sus precondiciones y añadió pruebas adversariales. La CI del PR terminó en verde y no hubo escrituras productivas. Este merge cubre el subcorte fiscal de P0-03; la certificación integral de venta, inventario y tesorería continúa pendiente.
- **Post-merge:** PR #322 quedó fusionado en `origin/main @ 70d2035` tras CI y Vercel verdes; el cutover server-authoritative de inventario, ajustes y mermas quedó integrado sin escrituras productivas. PR #323 quedó fusionado en `origin/main @ 65f9fa0`; reservas internas y agenda quedaron bajo Functions server-authoritative, Rules de solo lectura y saga DEMO idempotente, con CI post-merge verde.
  PR #333 quedó fusionado con recovery verificado; la siguiente unidad técnica es obtener una cuenta/ventana segura para el smoke productivo autenticado y repetir el preflight contra el SHA vivo. No se adelantan nuevas capacidades fuera de G-SAAS-02.
- PR #334 quedó fusionado como reconciliación documental del Goal; `origin/main` actual es `6b00fd9f180754a381367529d82a9e12509aeb0e` y no alteró el runtime observado.
- PR #335 quedó fusionado como reconciliación documental del Goal; `origin/main` actual es `c25960e64cf1841abd19fc3f2fa609f450444ee6` y su CI post-merge quedó en verde.
- PR #375 cerró ADR-SAAS-037: lectura global de perfiles aislada por tenant, Rules sin listados de `usuarios`, endpoint backend mínimo para administradores y pruebas de aislamiento. Quedó fusionado en `origin/main @ 6f61437b4932bc5e650f1690f82d1981c1e35593`; CI post-merge `34637120894` terminó en verde. Security re-scan y Recovery emulator (`14/14` pruebas unitarias y `e2e:p0-10`) pasaron; no se realizaron escrituras productivas.
- PR #336 quedó fusionado como reconciliación documental del Goal; su CI post-merge quedó en verde y no alteró el runtime observado.
- **Siguiente trabajo autónomo:** continuar con el siguiente blocker P0/P1 independiente —primero aislamiento tenant de identidad/usuarios y después certificaciones operativas— sin esperar la activación de Wompi. El smoke productivo y la transición contractual de Café Atrato permanecen separados y bloqueados hasta disponer de ventana, autorización y evidencia externa; no abrir trabajo de MT-U10, MT-U11, Sede, referidos u offline.
- **PR completados:** #246, #247, #248, #249, #250, #251, #252, #253, #256, #257, #258, #260, #262, #263, #264, #265, #266, #267, #269, #270, #271, #272, #273, #274, #275, #276, #278, #279, #280, #281, #282, #284, #285, #286, #287, #289, #290, #291, #292, #294, #296, #298, #299, #300, #301, #303, #305, #307, #309, #311, #313, #315, #317, #318, #322, #323, #326, #334, #335, #336, #342, #353.
- PR #349 queda añadido a los PR completados: indice descendente de Finanzas desplegado y verificado en estado `READY`, sin escrituras de documentos ni cambios del Trial.
-  PR #333 queda añadido a los PR completados: recovery aislado ejecutado y verificado con destino separado, integridad mínima, RPO/RTO medidos y documentación de ADR-SAAS-031; la raíz de Café Atrato permanece intacta.
- **Siguiente PR esperado para el track externo:** conseguir una cuenta/ventana segura para el smoke productivo autenticado y repetir el preflight read-only contra el SHA vivo de `origin/main`, resuelto nuevamente al ejecutar el preflight. Después, y solo con ventana histórica resuelta, recovery PASS y todos los gates restantes en PASS, ejecutar el cierre canónico aprobado, materializar la relación ANUAL de 30 días de Café Atrato, activar sus nueve capacidades y publicar la evidencia. No se autoriza ninguna escritura de tenant mientras el smoke autenticado siga pendiente.
- **Milestone activo:** `M2 — Provisioning y onboarding`.
- **Epic activo:** `E2.1 — Tenant de referencia`; `E2.2 — Configuración inicial` queda autorizado en paralelo únicamente para el corte técnico reusable de Bodega MVP-1, sin crear ni configurar el tenant real.


## Identidad estable

- **Goal:** `G-SAAS-01`
- **Resultado:** operar comercialmente el SaaS multi-tenant con un contrato anual manual, Trial controlado, lifecycle server-side, evidencia contractual inmutable y el plano de operadores autorizado, sin ampliar el alcance aprobado.
- **Estado:** COMPLETADO
- **Inicio formal:** 2026-08-12
- **Rama base al adoptar:** `main @ 6ded075`
- **Fuente de alcance:** `G-SAAS-01-PRODUCT-DECISION-RESOLUTION.md`, aprobada por el Product Owner y conservada en este repositorio.

## Alcance aprobado

MT-U9 queda limitado a la operación comercial inicial del plan inclusivo:

- cobro anual manual confirmado únicamente por un operador SaaS autorizado;
- nueva versión `ANUAL` de `mvp_comercial`, preservando intacta la versión mensual histórica;
- snapshot contractual inmutable de cada nueva Suscripción, con identidad y versión del Plan, código, periodicidad, precio, moneda, capacidades, límites, una Sede conceptual, fiscalidad opcional y fechas contractuales;
- Trial de 30 días, sin cambio de Plan durante Trial y suspensión inmediata al finalizar sin pago confirmado;
- reactivación mediante confirmación manual y periodo anual calculado server-side;
- cancelación programada al final del periodo pagado, sin pérdida anticipada de acceso;
- sin archivado ni eliminación automática de tenants o datos;
- catálogo canónico de capacidades: `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`, `shifts`, `cuentas_cobro`.

Fuera de alcance: billing automático, Wompi como billing SaaS, Sede técnica,
múltiples Sedes, MT-U10, MT-U11, límites cuantitativos, overages, paquetes de
facturación electrónica, referidos, offline, notificaciones y eliminación
automática de datos.

## Milestone y Epics

### MT-U9 — Contrato y operación comercial inicial — COMPLETADO

| Epic | Resultado | Estado |
|---|---|---|
| E9.1 Contrato comercial y snapshot | Product Decision preservada, ADR-SAAS-028 aceptado y contrato de Suscripción versionado sin mutación retroactiva. | COMPLETADO |
| E9.2 Plan anual y Trial | `mvp_comercial` conserva su versión mensual y obtiene versión `ANUAL`; Trial de 30 días sin cambio de Plan ni gracia. | COMPLETADO |
| E9.3 Cobro y lifecycle manual | Confirmación anual manual, reactivación server-side, suspensión por vencimiento y cancelación al final del periodo. | COMPLETADO |
| E9.4 Operación y certificación | Panel de operadores, auditoría, Rules, pruebas y evidencia de la operación comercial inicial. | COMPLETADO |

## Definition of Done de G-SAAS-01

El Goal solo termina cuando E9.1–E9.4 están implementados o certificados,
documentación y ADR están alineados, las pruebas y auditorías pasan, la CI de
`main` está verde y el contrato anual puede operarse sin billing automático,
sin mutar snapshots históricos y sin ampliar MT-U9.

## Estado vivo

- **Progreso:** PR #243 aceptó e integró el contrato y ADR-SAAS-028; PR #244 implementó E9.1–E9.4 y quedó integrado en `main @ ca2c20c`. La CI post-merge quedó verde con tipos, builds, Rules, Functions, Emulator y E2E. La oferta anual queda fijada en `1.800.000 COP` y la versión mensual histórica permanece intacta.
- **Estado:** COMPLETADO.
- **PR completados:** #243, #244.
- **Siguiente PR esperado:** ninguno para MT-U9; la activación de la oferta en un entorno concreto es una operación manual mediante los comandos canónicos y no una migración automática.
- **Milestone activo:** ninguno; `MT-U9 — Contrato y operación comercial inicial` está COMPLETADO.
- **Epic activo:** ninguno; `E9.1`–`E9.4` están COMPLETADOS.

## Baseline histórica

El contenido que sigue conserva la evidencia histórica de `G-MVP-01`. Sus
Milestones, Epics, PR y estados no son trabajo pendiente ni autorización para
ampliar el nuevo Goal.

## Identidad estable

- **Goal:** `G-MVP-01`
- **Resultado:** Cualquier tenant puede operar la primera versión comercial del SaaS de forma segura, íntegra, recuperable y reusable; Café Atrato permanece como primer tenant de referencia.
- **Estado:** COMPLETADO
- **Inicio formal:** 2026-08-01
- **Rama base histórica al adoptar:** `main @ 0958181`
- **Fuente de alcance inicial:** `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`, prioridad P0.

## Estado actual post-MVP (2026-08-11)

- **ACTUAL:** `G-MVP-01` está COMPLETADO en la línea base funcional de cierre del MVP (`main @ 65a9fb85d9159eb949ffaf18c5a99ed6377b1554`). La reconciliación documental posterior quedó integrada por PR #241.
- **ACTUAL:** M1, M2, M3 y M4/E4.2 están COMPLETADOS; la CI post-merge de `main` está verde.
- **ACTUAL:** B3-026/B3-027 están COMPLETADOS. El cierre productivo autorizado eliminó únicamente los cuatro objetivos allowlisted y no requiere nuevas ejecuciones.
- **ACTUAL:** Web/PWA es la única superficie soportada. Electron/P0-08 está RETIRADO; sus referencias se conservan solo como historial.
- **ACTUAL:** no existe Milestone, Epic ni PR funcional activo del Goal. ADR-SAAS-036 autoriza únicamente un corte independiente de remediación de seguridad P1-09 bajo `M3 / E3.2`; no activa Wompi, no reabre el alcance funcional y no cambia el siguiente PR operativo. Fiscalidad/DIAN y la validación física de hardware siguen condicionadas; notificaciones y offline siguen en backlog.
- **Reconciliación P1-09:** PR #351 quedó fusionado en `origin/main @ 96a1a3c32ab5d547a00a93e9df686c7e73e02258`; la CI post-merge `32592546684` y Vercel terminaron en verde. El scan Codex Security post-merge no encontró regresiones del corte y separó un MEDIUM preexistente en `usuarios`. La capacidad continúa deshabilitada y bloqueada para activación por falta de Function desplegada, secretos/bindings, WAF, readiness fiscal/tesorería y smoke productivo. No hubo pagos ni escrituras productivas.

La cronología y los estados intermedios que aparecen más abajo son **HISTÓRICOS** y se conservan como evidencia de decisiones, implementaciones y cierres. No deben interpretarse como trabajo pendiente ni como autorización para abrir una nueva fase.

## Alcance del Goal

Incluye los resultados necesarios para que el SaaS pueda venderse a múltiples
tenants y para certificar, cuando corresponda, el canal de cada tenant:

- tenant, Trial, acceso y configuración operativa certificados;
- ventas DEMO durante Trial y readiness fiscal condicional para operación FISCAL;
- venta, inventario, compras y tesorería bajo autoridad de servidor consistente;
- cobros, anulaciones, cuentas financieras, cuentas por cobrar y turnos certificados;
- impresión y canal de caja productivo cuando el tenant lo requiera;
- recuperación de Firestore comprobada;
- prueba integral y preparación de la primera versión comercial.

P1, P2 y P3 permanecen en backlog salvo aprobación explícita de cambio de
alcance. El portal SaaS ya integrado se considera parte de la baseline técnica;
su existencia no autoriza nuevas ampliaciones fuera del MVP. Café Atrato se
utiliza como tenant de referencia, pero no define la arquitectura ni la oferta.

Los Milestones M1–M4 reorganizan la prioridad del MVP reusable. P0-02 conserva
la capacidad fiscal condicional para operación FISCAL/productiva, mientras
ADR-SAAS-020 habilita la operación DEMO no fiscal sin datos del cliente ni
escrituras productivas.
ADR-SAAS-021 admite P0-12 como trabajo del núcleo transaccional y mantiene la
autoridad única server-side para compras.
ADR-SAAS-022 acepta un catálogo mínimo tenant-aware de proveedores para P1-03,
sin crédito, cuentas por pagar, fiscalidad, migraciones ni dependencia de Café
Atrato.

ADR-SAAS-023 acepta la frontera server-authoritative para operaciones de salón
y cocina, con idempotencia, concurrencia segura y máquina de estados válida;
su implementación P1-04 quedó integrada en `main` mediante el PR #192.

La decisión de producto vigente clasifica P0-07/E3.1 como capacidad técnica
COMPLETADA para Web/PWA: el navegador usa el diálogo estándar y el PC aporta el
driver de la impresora. La prueba con un equipo térmico concreto es una validación
operativa posterior y NO BLOQUEANTE. P1-02 ya quedó integrado como certificación
reusable con Emulator, CI y fixtures multi-tenant.

## Milestones y Epics

### M1 — Fundación SaaS y Trial listos para operar — COMPLETADO

Resultado: cualquier tenant puede provisionarse, acceder al Trial y resolver su
configuración operativa sin depender de datos fiscales reales.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E1.1 Tenant operativo | Empresa, administrador, membresía, claims, configuración, módulos y espacios certificados. | P0-01 | COMPLETADO |
| E1.2 Readiness fiscal | Capacidad opcional de identidad, impuestos, numeración y asignación cuando un tenant decide operar FISCAL/DIAN. | P0-02, P0-09 | CONDICIONAL / NO BLOQUEANTE |

### M2 — Núcleo transaccional íntegro — COMPLETADO

Resultado: venta, stock, tesorería, cuentas y turnos mantienen sus invariantes ante operación y reintento.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.1 Venta server-authoritative | La segunda fase de venta no depende de transacciones críticas del cliente. | P0-03 | COMPLETADO |
| E2.2 Compatibilidad financiera | Todas las rutas usan cuentas válidas del tenant sin IDs históricos funcionales. | P0-05 | COMPLETADO |
| E2.3 Cobro y anulación | Efectivo, transferencia, mixto, crédito y anulación certificados sin duplicados. | P0-04 | COMPLETADO |
| E2.4 Turnos y arqueo | Apertura, relevo, cierre ciego y movimientos coinciden. | P0-06 | COMPLETADO |
| E2.5 Compras e inventario operativos | Compra, ledger de inventario, costo y efecto financiero se confirman bajo autoridad única server-side. | P0-12, P1-01, P1-03 | COMPLETADO |

### M3 — Canal productivo y recuperación — COMPLETADO

Resultado: el canal de caja acordado imprime, se distribuye cuando aplique y puede recuperarse de una pérdida controlada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E3.1 Impresión física | Venta y reimpresión generan tickets Web/PWA compatibles con 58/80 mm; la validación con hardware concreto es operativa y no bloqueante. | P0-07 | COMPLETADO |
| E3.2 Distribución de caja | Web/PWA es la única superficie soportada; Electron queda retirado. | P0-08 | COMPLETADO |
| E3.3 Recuperación | Restauración Firestore comprobada y documentada. | P0-10 | COMPLETADO |
| E3.4 Recuperación de acceso | Administrador y operadores recuperan credenciales mediante autoridad server-side, activación segura, auditoría e idempotencia. | P0-11 | COMPLETADO |

### Línea paralela aprobada — núcleo POS reusable — COMPLETADO

Resultado: las variantes de producto que consumen insumos mantienen sus
snapshots comerciales, inventario e idempotencia bajo la autoridad server-side,
sin depender de hardware, fiscalidad ni producción.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.6 Recetas y modificadores | La venta DEMO con receta y modificadores conserva el snapshot comercial y descuenta los insumos correctos de forma tenant-aware. | P1-02 | COMPLETADO |

### Línea paralela — operaciones de salón — COMPLETADA

Resultado propuesto: salón, cuentas múltiples, comandas y cocina operan de forma
concurrente, tenant-aware e idempotente, reutilizando la autoridad server-side
existente y sin depender de hardware ni de datos fiscales reales.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.7 Salón y cocina | Certificación reusable de cuentas, mesas, comandas y transiciones de cocina. | P1-04 | COMPLETADO |

### M4 — Certificación comercial — COMPLETADO

Resultado: la cadena venta → inventario → caja → turno → ticket → recuperación pasa en un entorno representativo, la documentación está alineada y la integración final en `main` está verde.

| Epic | Resultado | Estado |
|---|---|---|
| E4.1 Certificación integral | Evidencia completa del recorrido operativo y decisiones condicionales. | COMPLETADO |
| E4.2 Release readiness | Auditoría final, CI verde y decisión de comercialización Web/PWA con capacidades tenant-specific explícitas. | COMPLETADO |

## Definition of Done del Goal

Este Goal se marca `COMPLETADO` solo cuando:

- todos los Milestones anteriores están cerrados;
- los criterios P0 aplicables están demostrados;
- el canal Web/PWA y la compatibilidad de impresión 58/80 mm están demostrados;
  la validación de hardware concreto queda como actividad operativa no bloqueante;
- la fiscalidad/DIAN está documentada como capacidad tenant-specific condicional,
  sin ser requisito para operar el POS DEMO/operativo;
- arquitectura, ADR, código y documentación coinciden;
- todas las pruebas requeridas y la certificación integral pasan;
- todos los PR tienen auditoría `APROBADO PARA MERGE`;
- la CI de `main` está completamente verde;
- todo el alcance está integrado en `main`;
- el SaaS está listo para una primera operación comercial multi-tenant y Café
  Atrato puede utilizarse como tenant de referencia.

## Estado histórico — G-MVP-01 (no es fuente activa)

> Esta sección solo se actualiza ante un evento oficial: merge de un PR, aprobación de un ADR o cambio de planificación aprobado. Mantén los seis campos; no agregues diarios, narrativas ni listas paralelas durante la implementación.

- **Progreso:** ADR-SAAS-013, ADR-SAAS-014, ADR-SAAS-015, ADR-SAAS-016, ADR-SAAS-017, ADR-SAAS-018, ADR-SAAS-019, ADR-SAAS-020 y ADR-SAAS-021 aceptados; PR #157 integrado en `main @ 6df0c75` con `CrearSuscripcionTrial`, verificador read-only y smoke E2E reutilizable; PR #159 integrado en `main @ 2a0d508` con el plan SaaS genérico `mvp_comercial` y su validación local reusable; PR #161 integrado en `main @ 43d1faf` con la resolución canónica de capacidades del Plan para la configuración B1; PR #163 integrado en `main @ dbe7c41` con el smoke E2E de P0-01 alineado al Plan, validación de PWA/POS y exclusión de `shifts`; PR #165 integrado en `main @ 32c7aa1` con la Fase 2 de ventas server-authoritative, idempotencia, auditoría, transacción Admin SDK y prueba E2E local; PR #167 integrado en `main @ 0ac5b23` con la eliminación de la escritura financiera legacy desde cliente, inicialización financiera solo lectura y smoke E2E de Finanzas en PWA y Backoffice; PR #168 integrado en `main @ 4297457` con la certificación manual de P0-01, evidencia productiva read-only y cierre de E1.1; PR #170 integrado en `main @ 341b4fe` con ventas DEMO no fiscales durante Trial, elegibilidad reusable, autoridad server-side, idempotencia, auditoría, Fase 2 operativa y separación de evidencia fiscal; PR #172 integrado en `main @ 0df10d3` con `shifts` incorporado al plan SaaS genérico `mvp_comercial`; PR #174 integrado en `main @ f7ccf60` con ADR-SAAS-017 aceptado y P0-11/E3.4 incorporado a la planificación; PR #175 formaliza ADR-SAAS-018, cuya implementación de notificaciones queda para un PR posterior separado; PR #176 integrado en `main @ b9e969d` con recuperación segura de credenciales de administrador y operadores, activación temporal one-shot, revocación de sesiones, evidencia fuera de banda, auditoría e idempotencia; PR #178 integrado en `main @ 714aebd` con ADR-SAAS-019 aceptado y sus invariantes canónicas de cuentas; PR #179 integrado en `main @ ac0e0cd` con resolución financiera tenant-aware por `empresaId + claveOperativa`, rechazo de IDs físicos, aislamiento, idempotencia, auditoría y pruebas reutilizables; PR #181 integrado en `main @ d2571a1` con certificación reusable en Emulator del ciclo multi-tenant de turnos, venta DEMO, egreso, faltante, sobrante, relevo, cierre, replay y evidencia en CI; PR #182 integrado en `main @ c15adeb` con exportación/importación separadas de Firestore y Auth Emulator, fixtures de dos tenants, login restaurado, huella íntegra, aislamiento multi-tenant y evidencia de restauración en CI; PR #183 integrado en `main @ 55bc16e` con liquidación server-authoritative de cuentas por cobrar, idempotencia, auditoría, separación DEMO/FISCAL y reversión auditable; en producción, el plan, el Trial de 30 días y los ocho módulos aprobados están materializados; P0-01 está certificado, la ruta DEMO está validada localmente y su verificador automatizado, smoke local y evidencia manual están en PASS. P0-02 sigue condicionado a datos fiscales reales; P0-04/E2.3 está integrado y no requiere datos fiscales reales ni escrituras productivas para su alcance DEMO; P0-06/E2.4 y P0-10/E3.3 están completados. P0-07/E3.1 tiene el transporte técnico integrado y requiere hardware real y P0-08/E3.2 depende de la decisión de canal y P0-07, mientras P0-09 depende de P0-02 y la decisión fiscal. PR #184 integrado en `main @ 7ceffda` con transporte reutilizable de impresión para venta y reimpresión, fallback PWA, formatos 58/80 mm, reimpresión DEMO segura y escape HTML. El transporte técnico queda integrado; la certificación física de P0-07/E3.1 sigue requiriendo hardware real. PR #185 integrado en `main @ 360d9b4` con la sincronización del estado `BLOQUEADO` de E3.1 y su condición externa.
  PR #211 integrado en `main @ 3c27a13` tras auditoria `APROBADO PARA MERGE`, CI completamente verde y Vercel verde; E4.2-CI-001 convierte Operator Portal y R1-A Web/PWA en gates obligatorios, genera evidencia reusable y mantiene reservas/Wompi y los gates externos fuera de alcance.
  PR #212 integrado en `main @ 86221c6` tras auditoria `APROBADO PARA MERGE`, CI completamente verde y Vercel verde; B3-A amplía el inventario dry-run read-only de Eventos legacy con referencias y objetos Storage, evidencia determinista con hashes y sin tokens crudos, detección de assets compartidos y huérfanos, y verificación Emulator sin escrituras.
- **Estado:** COMPLETADO.
> **Reconciliación histórica (2026-08-12):** la mención anterior de P0-08/E3.2 como dependiente de canal o hardware queda supersedida por la decisión Web/PWA-only y PR #224; P0-08 no es trabajo ejecutable. B3-027 está cerrado y sus evidencias fueron reconciliadas por PR #238/#239.
> La fuente de verdad posterior a la decisión de producto es la clasificación vigente documentada al final de esta sección: la capacidad técnica del MVP Web/PWA está completa; la validación física de impresión es operativa y no bloqueante; fiscalidad/DIAN es tenant-specific y condicional; reservas/Wompi queda en backlog futuro.
  PR #209 integrado en `main @ 6f51ce5` tras auditoria `APROBADO PARA MERGE` y CI completamente verde; alinea el contrato y la evidencia de E4.2, cierra los seguimientos ya resueltos de Storage y del plan maestro, y mantiene como pendientes reales las superficies no cubiertas y los gates externos.
  PR #211 integrado en `main @ 3c27a13` con E4.2-CI-001; Operator Portal y R1-A Web/PWA quedan cubiertos por CI como release gates obligatorios, con evidencia reusable y sin escrituras productivas.
  E4.2 registra como completada la ejecución productiva controlada de B3-027: el preflight final confirmó `safeToExecute=true`, el recovery fue verificado antes de borrar y el journal registra exactamente cuatro targets `ELIMINADO`. La evidencia externa conserva plan, recovery, journal y hashes; el asset excluido permanece intacto.
  El release gate de E4.2 está cerrado para el MVP Web/PWA; Storage, el plan maestro y las suites de aislamiento siguen siendo barreras contra regresiones.
  PR #205 quedo integrado en `main @ 87bd651` tras auditoria `APROBADO PARA MERGE` y CI completamente verde. E4.2-SEC-002A actualiza `next` a 16.3.0 y deja las vulnerabilidades productivas criticas y altas en cero; permanecen siete moderadas de cadenas legacy de uuid/tooling, documentadas fuera de alcance por requerir cambios mayores incompatibles.
  PR #203 quedo integrado en `main @ e881d2b` tras auditoria `APROBADO PARA MERGE` y CI completamente verde. PR #205 completo la actualizacion de Next a 16.3.0. E4.2-SEC-002 queda mitigado mediante actualizaciones compatibles reproducibles en `package-lock.json`; permanecen documentados los riesgos residuales de cadenas legacy de tooling.
  PR #197 quedó integrado en `main @ b3098ce` con B2 de Eventos tenant-aware: resolución pública server-side `slug → empresaId`, lectura únicamente de eventos activos del tenant resuelto, exclusión de legacy sin `empresaId`, aislamiento multi-tenant, integración en landing, casos negativos y certificación Emulator/CI.
  PR #187 quedó integrado en `main @ fae007a` tras auditoría `APROBADO PARA MERGE` y CI completamente verde.
  PR #186 quedó integrado en `main @ 50c3866` con compras server-authoritative, snapshots comerciales, ledger, costo, inventario, efecto financiero, idempotencia, auditoría y CI completamente verde.
  PR #188 quedó integrado en `main @ 6298e81` con ADR-SAAS-022 aceptado para el catálogo tenant-aware de proveedores y sus invariantes de snapshots, estado enum y desactivación segura.
  PR #189 quedó integrado en `main @ 119e898` con el catálogo tenant-aware reusable de proveedores, estado enum, aislamiento Rules, resolución por `empresaId + proveedorId`, snapshots históricos, idempotencia de compras y desactivación segura sin mutación de históricos.
  PR #190 quedó integrado en `main @ 9e58ef4` con la certificación reusable de P1-02/E2.6: snapshot de receta y modificadores, consumo transaccional de insumos, ledger, auditoría, idempotencia y aislamiento multi-tenant en Emulator/CI; la corrección de orden transaccional no cambió la autoridad server-side ni las Rules.
  PR #191 quedó integrado en `main @ 09688c1` con P1-07: CI como release gate, lint ejecutable, preflight seguro de Auth/Firestore/Functions Emulator, suites operativas integradas y smoke E2E P0-01 con evidencia; ADR-SAAS-023 quedó aceptado.
  PR #192 quedó integrado en `main @ 86d97d1` con P1-04/E2.7: operaciones de salón y cocina server-authoritative, tenant-aware, idempotentes, transaccionales, auditadas y con máquina de estados sin regresiones; las escrituras directas del cliente permanecen denegadas por Rules.
  PR #193 quedó integrado en `main @ 67c873d` con E4.1: certificación integral reusable del núcleo SaaS/POS en Emulator/CI, evidencia JSON automática, aislamiento multi-plataforma de emuladores y registro explícito de gates externos pendientes.
  PR #194 quedó integrado en `main @ 91d9e5b` con E4.2: auditoría de release readiness, contrato y runner de evidencia solo lectura, CI conectado, decisión de release CONDICIONAL y registro de cinco seguimientos técnicos y seis gates externos pendientes. ADR-SAAS-024 fue aceptado con el modelo de Storage completamente tenant-aware; su ejecución queda separada en PR A / P2-03 (Storage) y PR B posterior (Eventos tenant-aware), sin mezclar fronteras ni modificar Firestore en PR A.
   PR #195 quedó integrado en `main @ f5200ab` con PR A / P2-03: contrato tenant-aware de Firebase Storage, `storage.rules` deny-by-default, aislamiento por `empresaId`, rutas nuevas para productos y assets públicos, Storage Emulator/CI, evidencia automática y cierre del seguimiento de Storage de E4.2. ADR-SAAS-025 fue aceptado y PR #196 quedó integrado en `main @ 6428f93` con B1: contrato Firestore tenant-aware de Eventos, aislamiento administrativo por tenant, consultas filtradas, servicio, UI administrativa, índice y pruebas multi-tenant. PR #197 quedó integrado en `main @ b3098ce` con B2: lectura pública contextualizada por slug, resolución server-side, aislamiento multi-tenant, exclusión de legacy, integración de landing y certificación Emulator/CI. PR #199 quedó integrado en `main @ 7af0c2b` con B3-A: inventario legacy read-only, manifiesto de mapeos explícitos, clasificación determinista, evidencia con hash y certificación Emulator/CI sin escrituras. PR #201 quedó integrado en `main @ 5ac0ec7` con B3-B: backfill idempotente y transaccional solo en Emulator, preservación de snapshots, replay no-op, aislamiento de conflictos y evidencia automática sin escrituras productivas. PR #207 quedó integrado en `main @ 4e3151a` con soporte de Application Default Credentials para ejecutar B3-A read-only contra un proyecto configurado, además de estabilización del smoke P0-01/E4.1; no se realizaron escrituras productivas. El cierre productivo de B3-027 se completó posteriormente mediante el operador autorizado y quedó documentado por PR #235; la preparación read-only de PR #207 se conserva como antecedente histórico.
 - **PR completados:** PR #147, PR #149, PR #151, PR #153, PR #155, PR #157, PR #159, PR #161, PR #163, PR #165, PR #167, PR #168, PR #170, PR #172, PR #174, PR #175, PR #176, PR #178, PR #179, PR #181, PR #182 y PR #183, PR #184, PR #193, PR #194, PR #195, PR #196, PR #197, PR #199, PR #201, PR #203, PR #204, PR #205 y PR #207, PR #224, PR #226, PR #229, PR #230, PR #231, PR #232, PR #233, PR #235 y PR #236 — incluye B3-B de Eventos tenant-aware con backfill Emulator-only, idempotencia, preservación de snapshots y evidencia sin escrituras productivas, además del cierre productivo B3-027 exacto y documentado. El cierre productivo de B3 queda cerrado; los gates externos restantes continúan explícitos.
  PR #186 actualizó el contrato de compras y quedó integrado en `main @ 50c3866`; PR #187 quedó integrado en `main @ fae007a` con la primitiva canónica reusable del ledger para venta, compra, ajustes y mermas, apertura lazy, secuencia, saldo, replay, aislamiento tenant-safe y certificación de Rules. PR #189 quedó integrado en `main @ 119e898` con el catálogo tenant-aware reusable de proveedores y la integración segura con compras.
  PR #188 quedó integrado en `main @ 6298e81` con ADR-SAAS-022 aceptado; el catálogo tenant-aware de proveedores y la integración de compras forman el alcance de P1-03.
  PR #189 quedó integrado en `main @ 119e898`; P1-03 y E2.5 quedan completados.
  PR #211 queda añadido a los PR completados: E4.2-CI-001 integra Operator Portal y R1-A Web/PWA como gates obligatorios, con evidencia automatica, aislamiento de emuladores y sin escrituras productivas.
  PR #212 queda añadido a los PR completados: B3-A integra el inventario read-only de assets Storage de Eventos, sin inferencia de tenant, sin migración y sin escrituras productivas; CI y Vercel quedaron completamente en verde.
  PR #224 queda añadido a los PR completados como unidad canónica de migración: integra los 14 golden tickets sintéticos de #216 y el retiro definitivo de Electron de #222; CI, E4.1, E4.2, Vercel y el gate post-merge de `main` quedaron en verde.
  PR #226 quedó añadido a los PR completados: ADR-SAAS-026 fue aceptado y el mecanismo de cierre controlado y recuperable de Eventos legacy quedó integrado y certificado en Emulator/CI, con allowlist estricta, journal, recovery, idempotencia y `productionWrites: false`. PR #229 quedó integrado con ADR-SAAS-027 aceptado y el operador productivo independiente B3-027, protegido por proyecto/bucket fijos, manifiesto externo exacto, recovery, journal, precondiciones por objetivo y confirmación interactiva fuera de CI. La ejecución autorizada del 2026-08-11 eliminó exactamente el Evento legacy y los tres assets del allowlist; la evidencia permanece fuera de Git. PR #235 quedó integrado en `main @ 73cacf4` con la corrección de validación JSON del recovery y el cierre técnico/documental de B3-027; PR #236 reconcilió este estado en la documentación y quedó integrado en `main @ 9c725b0`; ambas CI post-merge terminaron en verde. PR #230 quedó integrado como sincronización documental posterior; PR #231 reconcilió el estado de release del dry-run B3-026, PR #232 alineó el SHA vivo del Goal con `main` y PR #233 registró el estado posterior.
  - **Siguiente unidad recomendada:** no existe otra unidad funcional del Goal. Las validaciones físicas, la activación fiscal por tenant y reservas/Wompi son decisiones o actividades posteriores no bloqueantes; notificaciones y offline permanecen en backlog.
  - **Milestone activo:** ninguno; `M1`, `M2`, `M3` y `M4` están COMPLETADOS para el alcance del MVP Web/PWA.
    - **Epic activo:** ninguno. `E4.2 — Release readiness` está COMPLETADO: CI de `main`, Operator Portal, R1-A Web/PWA, E4.1 y el cierre B3-027 están verdes y documentados. `E3.1` está COMPLETADO técnicamente para impresión Web/PWA 58/80 mm; la prueba con hardware físico queda como validación operativa NO BLOQUEANTE. `E1.2/P0-02` y `P0-09` son capacidades fiscales CONDICIONADAS por tenant, y `P1-09` queda en BACKLOG.

 P0-07/E3.1 ya dispone del transporte Web/PWA y de layouts 58/80 mm. El navegador
 usa el diálogo estándar y el PC aporta el driver de la impresora; probar un equipo
 térmico concreto es una validación operativa posterior y NO bloquea el MVP.
P0-12 puede ejecutarse íntegramente con Emulator y conserva separadas las
certificaciones físicas y fiscales.

La provisión productiva aprobada, la verificación automatizada y la evidencia manual de login, resolución del tenant y visibilidad de UI/Rules completan P0-01/E1.1. La ruta DEMO permite evaluar el POS durante el Trial sin datos fiscales ficticios. P0-04/E2.3 quedó integrado sobre la autoridad server-side aprobada por ADR-SAAS-020, sin cambios en Rules, Bootstrap, migraciones ni producción. ADR-SAAS-021, P0-12/E2.5, P1-01 y P1-03 quedaron integrados; compras, proveedores, costos, snapshots e idempotencia están certificados de forma reusable. P0-07/E3.1 está completado técnicamente para Web/PWA 58/80 mm; la validación física de un equipo concreto es operativa y no bloqueante. P0-02/E1.2 y P0-09 quedan condicionados a que cada tenant decida activar fiscalidad.

La línea paralela E2.6/P1-02 quedó integrada sin modificar la autoridad de
ventas ni las Rules: certifica el contrato existente mediante una venta DEMO,
snapshot de receta y modificadores, consumo transaccional de insumos, ledger,
aislamiento tenant e idempotencia. P1-04/E2.7 quedó integrado sobre ADR-SAAS-023
con operaciones de salón/cocina server-authoritative, idempotencia, auditoría,
transacciones y máquina de estados sin regresiones. E4.2 quedó integrado sobre
su runner de readiness, con capacidades condicionales documentadas y sin bloqueos
para el MVP Web/PWA. PR A
/ P2-03 quedó integrado con el contrato seguro de Firebase Storage y su
certificación tenant-aware. B1, B2, B3-A y B3-B de Eventos tenant-aware quedaron integrados bajo ADR-SAAS-025; ADR-SAAS-026 y PR #226 integraron el mecanismo de cierre controlado y recuperable. B3-027 ejecutó después el cierre productivo autorizado de los cuatro targets exactos; el journal, recovery y evidencia externa quedaron verificados, y el asset excluido permanece intacto. PR #235 integró el cierre técnico/documental y la corrección del round-trip JSON del recovery en `main @ 73cacf4`, con CI post-merge verde.
> **Decisión vigente (2026-08-11, tras merge del PR #224):** el producto se distribuye únicamente como Web/PWA. Electron, su empaquetado y P0-08 quedan retirados; las referencias históricas se conservan como trazabilidad y no representan una superficie soportada.
