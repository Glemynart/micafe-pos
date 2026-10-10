# G-SAAS-02 / M2 / E2.2 — Gate F: replay remoto y conciliación de roles

**Resultado:** matriz funcional Gate F `FUNCTIONAL = PASS`; integración del
registro en `main` pendiente de CI y merge del PR documental #524.

> **Temporalidad:** los resultados parciales y estados `EN CURSO` de los
> checkpoints anteriores a “Reconciliación final de la matriz” son históricos
> y válidos para su hora de corte. La reconciliación final los actualiza: los
> escenarios enumerados allí como pendientes quedaron resueltos o delimitados
> por alcance. Para el estado funcional vigente, prevalece esa matriz final;
> su registro oficial en `main` sigue sujeto a CI y merge de #524.

## Alcance y entorno

Validación realizada el 2026-10-09, hora de Bogotá, contra el preview
`cafeatrato-iuqshyssh-glemynarts-projects.vercel.app`, cuyo código de aplicación
corresponde al candidato de PR #519 (`fb22cef`); PR #520 solo reconcilió
documentación. El backend consultado fue `micafe-pos-staging` y el único tenant
de negocio fue `E2_2-BODEGA-STAGING-FIXTURE`. Vendedor y administrador se
validaron en perfiles de navegador separados.

No se usó un cliente, vendedor, inventario ni pago real. No se alteraron
producción, otro tenant, Rules, Functions, IAM, Secrets ni despliegues.

## Resultados observados

| Escenario | Evidencia |
|---|---|
| Replay autenticado después de restaurar la membresía | Se invocó `confirmarVentaBodegaV1` una vez con el mismo comando de la venta sintética existente (prefijo `d60f5034`). La Function respondió HTTP `200` en `2026-10-10T01:32:07Z`. La lectura posterior, a `01:32:50Z`, confirmó solicitud `EJECUTADA`, venta pagada por `$5.000 COP`, recibo `CONFIRMADO`, una venta asociada al comando, respuesta coincidente con la venta persistida, un movimiento financiero y un movimiento de inventario. El stock permaneció en 2 unidades físicas, 2 reservadas y 0 disponibles. No se creó una venta ni un movimiento duplicado. |
| Límite del replay | Esto acredita que un replay autenticado devuelve el resultado persistido sin repetir efectos. No simula una desconexión de red ni demuestra por sí solo una pérdida real de la primera respuesta HTTP. |
| Sesión y rol vendedor | En `/pos`, el vendedor sintético autenticado vio disponibilidad `0` y el envío de una solicitud permaneció deshabilitado. Abrir `/admin/solicitudes` redirigió a `/admin/login?error=not_admin` e indicó que había una sesión de caja activa. No se intentó una operación administrativa desde esa sesión. |
| Rol administrador | En otra sesión de Edge, el administrador tenant autenticado cargó `/admin/solicitudes` y vio la solicitud sintética `YOTK3IL0` todavía `APROBADA`; no la aprobó ni confirmó otra venta. |
| Conciliación de inventario y agenda | `/admin/inventario` mostró 2 unidades físicas, 2 reservadas y 0 disponibles, coincidiendo con el POS del vendedor. `/admin/agenda` mostró una reserva activa de 2 unidades para el 9-oct, franja 14:00–15:00, con vencimiento a medianoche del 10-oct (Bogotá), junto con entradas anteriores `CANCELADA` y una `ATENDIDA`. No se canceló ni liberó la reserva activa. |
| Conciliación de reporte y turnos | `/admin/reportes` mostró para el 9-oct ventas de `$5.000`, costo `$2.000`, ganancia bruta `$3.000` y margen `60 %`, por transferencia. `/admin/turnos` cargó 1 turno abierto y 8 cerrados visibles. Ningún turno fue abierto, cerrado o ajustado. |
| Verificación de acceso al tenant | El indicador `Verificando acceso al tenant…` apareció brevemente durante la navegación; ambas sesiones terminaron cargando sus vistas sin recargar manualmente. El incidente de carga infinita no se reprodujo en esta ejecución. |

### Revalidación de lectura PWA y frontera de rol — 2026-10-10 03:09 UTC

En el preview de staging
`cafeatrato-git-codex-e2-2-gatef-remo-908032-glemynarts-projects.vercel.app`,
el perfil integrado autenticado como `GateF Seller E2_2 Bodega Atrato` cargó
`/pos`, `Mis ventas` y `Mi agenda`. POS mostró cero disponibles, carrito vacío
y `Sin turno`; `Mis ventas` presentó siete ventas sintéticas previas por
`$5.000 COP`; la agenda mostró una retención activa de 2 unidades base para el
9-oct, franja 14:00–15:00, con vencimiento 10-oct a medianoche de Bogotá, y las
entradas anteriores en estados terminales. No se creó, canceló, convirtió ni
confirmó ninguna operación.

Al navegar desde ese mismo perfil vendedor a `/admin/solicitudes`, la app
redirigió a `/admin/login?error=not_admin`. Esto vuelve a comprobar la barrera
de rol en UI en el preview vigente, pero no prueba autorización backend ni la
matriz de aislamiento tenant/roles A/B. No se obtuvo una sesión admin en esta
revalidación.

#### Auditoría de mutaciones

- Solo navegación y lectura visual del fixture sintético en staging.
- Solicitudes, ventas, ledger, turnos, agenda, reserva, stock, membresías y Auth:
  cambios por Codex `0`.
- Producción, tenant real, Rules, Functions, IAM, Secrets y despliegues:
  cambios por Codex `0`.

## Límites y pendientes

- Sigue pendiente observar la expiración natural del hold y confirmar su
  liberación automática. No se adelantó el reloj ni se ejecutó el Scheduler
  fuera de su cadencia.
- La carrera de dos vendedores está cubierta en Emulator por PR #519; la prueba
  remota de stock insuficiente fue secuencial, no una carrera simultánea.
- El intento de acceso admin desde vendedor valida una frontera de rol en UI,
  no la matriz remota completa de aislamiento A/B. No se creó otro tenant para
  esta comprobación.
- El replay remoto fue idempotente, pero no incluyó una caída de red controlada
  entre el commit y la respuesta. No se afirma ese subcaso como `PASS`.
- La entrega push fue confirmada previamente por el usuario. La actualización
  en tiempo real de la bandeja fue diferida explícitamente; esta verificación no
  certifica sonido ni actualización en tiempo real.

No se declara Gate F cerrado con esta evidencia parcial. No se inicia Gate G/H,
Gate I, el tenant real ni producción.

### Revalidación administrativa read-only — 2026-10-10, ~03:18 UTC

Tras el inicio manual de sesión del usuario, Edge mostró la identidad
`Administrador Bodega Demo` en el preview vigente de Gate F. Se inspeccionaron
las rutas administrativas sin confirmar ni ejecutar operaciones:

| Superficie | Observación |
|---|---|
| `/admin/solicitudes` | La solicitud sintética `YOTK3IL0` está `APROBADA`: 1 presentación (2 unidades base), total `$5.000 COP`; la UI muestra vencimiento el 10-oct-2026 a las 07:20:45. No se confirmó la venta. |
| `/admin/inventario` | Producto sintético: 2 unidades físicas, mínimo 2, 2 reservadas y 0 disponibles. No se ajustó stock. |
| `/admin/reportes` | Para el 9-oct: ventas `$5.000`, costo `$2.000`, ganancia bruta `$3.000`, margen 60%; una venta atribuida al vendedor sintético terminado en `e230fe`, pagada por transferencia (`$5.000`) y efectivo `$0`. El reporte indica que no hay cierre conciliable en el período. |
| `/admin/turnos` | Resumen: 1 turno abierto, 8 cerrados visibles, sin faltantes ni sobrantes reportados. La lista incluye un turno sintético abierto de `E2_2-BODEGA-STAGING-FIXTURE` del 2-oct con base `$10.000`; se dejó intacto. |
| `/admin/agenda` | Sigue activa la reserva de 2 unidades para el 9-oct, 14:00–15:00, con vencimiento a medianoche del 10-oct (Bogotá). Las demás entradas visibles están canceladas o atendidas. No se canceló ni liberó. |
| `/admin/ventas` | La consulta muestra ventas sintéticas pagadas del fixture por `$5.000`; entre ellas aparece el comando `d60f5034` ya reconciliado en la lectura previa. No se anuló ni creó ninguna venta. |
| `/admin/catalogo` | El producto sintético está activo; la presentación de prueba convierte 1 presentación en 2 unidades base y muestra precio `$5.000 COP`. Coincide con la solicitud y la reserva. No se guardaron cambios. |
| `/admin/clientes` | Están presentes el cliente base del fixture y el cliente sintético `...CLIENTE-GATE-F`. No se creó, editó ni desactivó ningún cliente. |

Las vistas mostraron el aviso `Activa las notificaciones para recibir avisos
operativos de tu empresa`; por ello no se considera probada la suscripción push
de este origen de preview, aunque la entrega se confirmó previamente en otro
preview. No se pulsó `Activar`.

#### Auditoría de mutaciones

- Acciones realizadas: navegación y lectura visual en el preview autenticado.
- Solicitudes, ventas, ledger, turnos, agenda, reservas, stock, membresías y
  Auth: cambios por Codex `0`.
- Notificaciones, Rules, Functions, IAM, Secrets, despliegues, tenant real y
  producción: cambios por Codex `0`.

Esta revalidación amplía la evidencia de las superficies Backoffice, pero no
cierra la matriz de Gate F. Siguen pendientes el aislamiento remoto A/B y
autorización backend, carrera remota de stock, expiración natural de la reserva,
retry tras pérdida real de respuesta y la revalidación integral de PWA y
Backoffice. Gate F permanece `EN CURSO`.

### Reconciliación de expiración natural — 2026-10-10 00:00–00:05 Bogotá

La reserva activa del fixture `E2_2-BODEGA-STAGING-FIXTURE` tenía vencimiento
`2026-10-10T05:00:00Z` (00:00 Bogotá). El Scheduler
`firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` permaneció
`ENABLED`, con frecuencia de cinco minutos y zona `UTC`. Una lectura posterior
a las 00:00, pero anterior al siguiente ciclo, todavía mostraba reserva
`ACTIVA`, agenda `RESERVADA`, stock físico `2` y stock reservado `2`; no se
forzó el proceso.

Cloud Logging registró HTTP `200` para la ejecución del Scheduler iniciada a
`2026-10-10T05:03:01.757901Z`. La lectura Firestore REST del mismo tenant a
`2026-10-10T05:04:51.816Z` confirmó reserva `VENCIDA`, agenda `VENCIDA`, stock
físico `2` y stock reservado `0`. No se creó una venta ni movimientos de
inventario/finanzas; tampoco se alteraron manualmente la reserva, el reloj o el
Scheduler. Esto cierra el subescenario de expiración y liberación automática,
con la latencia esperada del barrido de cinco minutos.

En una revalidación con el backoffice de Edge en segundo plano, el usuario
confirmó que la prueba push data-only solo apareció en Edge; no apareció como
aviso nativo de Windows. No se reenviaron mensajes. ADR-SAAS-065 mantiene FCM
como best-effort y no garantiza recepción, persistencia visual ni sonido del
navegador/sistema operativo; este resultado se conserva como comportamiento
observado, no como una garantía aprobada incumplida ni un bloqueo de Gate F.

La atribución de CI de la primera versión de esta evidencia era incorrecta:
`38021649607` corresponde al merge anterior (PR #522, SHA
`6f16546bca87d99d93de654aa441cf1fb3005041`), no valida PR #523. Los checks
previos al merge de PR #523 sí terminaron `SUCCESS`. Su CI post-merge de `main`,
run [`38029092704`](https://github.com/Glemynart/micafe-pos/actions/runs/38029092704)
para SHA `d1dd726f02d48cca6b1269e5c4a30ba61045b4e6`, terminó `success` a las
`2026-10-10T06:09:58Z`. Ninguna de estas CI sustituye la matriz autenticada
remota.

Gate F sigue `EN CURSO`: permanecen pendientes el aislamiento remoto tenant/rol
A/B con autorización backend, la carrera remota de stock, la simulación remota
de pérdida de respuesta HTTP y la revalidación funcional integral de PWA y
Backoffice. No se inició Gate G/H, Gate I, tenant real ni producción.

### Revalidación de sesiones y superficies operativas — 2026-10-10 00:22 Bogotá

El usuario inició sesión manualmente en ambas superficies del mismo preview
staging de Gate F: administrador en Edge y vendedor en el navegador integrado.
Edge mostró `Administrador Bodega Demo`; el integrado, el vendedor sintético
Gate F. Se usó únicamente el fixture retenido
`E2_2-BODEGA-STAGING-FIXTURE`.

Las lecturas de solo lectura dieron estos resultados:

- `/admin/solicitudes`: la solicitud sintética terminada en `YOTK3IL0` sigue
  `APROBADA`, 1 presentación (2 unidades base), `$5.000 COP`, con vencimiento
  el 10-oct a las 07:20 Bogotá. No se confirmó una venta.
- `/admin/inventario`: stock físico `2`, reservado `0`, disponible `2`.
- `/admin/agenda` y la agenda del vendedor: ambas reflejan la programación del
  9-oct, 14:00–15:00, como `VENCIDA`/`Reserva vencida`; las demás entradas
  visibles son canceladas o atendidas. La retención liberada concuerda con el
  stock disponible.
- `/admin/turnos`: 1 turno abierto y 8 cerrados visibles; no se abrió ni cerró
  ningún turno. `/admin/reportes` carga para el 10-oct y presenta `$0` para el
  día actual.
- `/admin/ventas`: se observan 13 registros sintéticos pagados; no se creó
  ninguno. `Mis ventas` del vendedor muestra su historial y sus solicitudes
  muestran la misma solicitud aprobada.

En la navegación del backoffice apareció primero el estado de carga de tenant /
configuración; se resolvió sin recargar y las rutas anteriores llegaron a su
contenido. Esta visita no reproduce un bloqueo persistente ni acredita un
tiempo real contractual.

Como control de rol de interfaz, una pestaña temporal del mismo origen intentó
abrir `/admin/solicitudes` usando la sesión de vendedor y fue redirigida a
`/admin/login?error=not_admin`; la pantalla indicó que la sesión de caja seguía
activa. Se cerró la pestaña temporal y la sesión POS original permaneció activa.
Esto no sustituye una invocación remota negativa que pruebe autorización
backend.

No se ejecutaron comandos de negocio ni mutaciones: solicitudes, ventas,
ledger, turnos, agenda, reservas, stock, membresías y Auth permanecieron sin
cambios por Codex. Rules, Functions, IAM, Secrets, despliegues, otros tenants y
producción tampoco se modificaron.

Esta observación aporta `PASS` únicamente para la lectura autenticada de estas
vistas y la concordancia visible de la expiración ya reconciliada. No cierra la
matriz Gate F: siguen pendientes el aislamiento remoto tenant/rol con
autorización backend, la carrera remota de stock, el retry autenticado tras
pérdida de respuesta y el resto de la revalidación funcional. Gate F permanece
`EN CURSO`.

### Pérdida de respuesta, recuperación y conciliación — 2026-10-10 ~01:32 Bogotá

Con el vendedor y el administrador autenticados en el mismo preview de staging,
se probó una única vez la solicitud sintética `YOTK3IL0` por `$5.000 COP`, una
presentación (2 unidades base) y pago por transferencia. La respuesta HTTP
exitosa se interrumpió después del commit del servidor. El vendedor usó
`Recuperar confirmación`; la PWA informó `EJECUTADA` y que venta, inventario y
pago ya estaban procesados.

La relectura posterior concilió la misma operación en ambos roles: el vendedor
ve `YOTK3IL0` una sola vez como `EJECUTADA` y una única venta asociada en `Mis
ventas`; Backoffice no muestra solicitudes pendientes y `/admin/ventas` muestra
una única venta por `$5.000 COP` para el comando de esa solicitud. `/admin/reportes`
presenta una venta del vendedor sintético por `$5.000`, costo `$2.000`, ganancia
bruta `$3.000` y margen `60 %`. No apareció una venta duplicada en estas
lecturas.

Tras refrescar la vista de catálogo del vendedor, la presentación reportó
`Disponibles: 0`, coincidente con `/admin/inventario` (`reservado 0`,
`disponible 0`). Antes de ese refresco, la vista abierta conservaba el valor
anterior `Disponibles: 1`; la actualización automática/inmediata del stock al
confirmar desde otra sesión queda anotada como mejora posterior a Gate F,
conforme a la priorización acordada. La recarga no creó solicitudes ni ventas.
La agenda cargó con sus entradas sintéticas y el historial de turnos mostró 1
abierto y 8 cerrados visibles, sin faltantes ni sobrantes. No se modificó
ningún turno ni reserva durante esta verificación.

Esto acredita el retry remoto tras pérdida de la respuesta y recuperación del
resultado comprometido sin duplicar la venta observada. No acredita una carrera
remota simultánea ni la matriz backend de aislamiento tenant/rol A/B. La
recarga del catálogo y la espera breve de la agenda tampoco certifican una
actualización en tiempo real ni un SLA de carga. Gate F permanece `EN CURSO`;
no se inicia Gate G/H/I ni se toca el tenant real o producción.

### Carrera remota de stock entre dos vendedores — 2026-10-10 ~02:03 Bogotá

Se usaron dos perfiles separados en el mismo preview de staging
`cafeatrato-git-codex-e2-2-gatef-natu-3ac7cd-glemynarts-projects.vercel.app`:
el vendedor sintético existente `GateF Seller` en Brave y el segundo operador
sintético `GateF2-1010 Concurrencia` en el navegador integrado. El administrador
continuó en Edge. Todas las sesiones correspondieron a
`E2_2-BODEGA-STAGING-FIXTURE` en `micafe-pos-staging`.

Como la existencia disponible era cero, se cargaron 2 unidades base al producto
sintético desde `/admin/inventario`, mediante el flujo normal de Backoffice.
Ambos vendedores actualizaron su vista y observaron 1 presentación disponible
(2 unidades base). Cada uno creó una solicitud por 1 presentación (`$5.000 COP`,
transferencia); administración aprobó ambas. Conforme a ADR-SAAS-062, la
aprobación no retiene inventario. Se pulsó `Confirmar venta` desde ambas sesiones
en paralelo.

El servidor confirmó una sola venta: la solicitud del segundo vendedor quedó
`EJECUTADA` y el Backoffice mostró exactamente una venta atribuida a ese nuevo
operador. La solicitud competidora del vendedor original devolvió
`No hay existencias suficientes para completar la venta`; no produjo venta y
se canceló después para impedir un reintento accidental. `/admin/inventario`
mostró existencia física `0`, reservado `0` y disponible `0`. No se abrió ni
cerró turno. No se inspeccionó el ledger para esta carrera, por lo que esta
evidencia no afirma una conciliación financiera adicional.

Esto acredita `PASS` para la carrera remota de confirmación de stock: no hubo
sobreventa ni doble registro visible. No prueba la matriz negativa backend de
aislamiento entre tenants o roles; Gate F continúa `EN CURSO`, sin iniciar
Gate G/H/I y sin tocar tenant real o producción.

### Reconciliación final de la matriz — 2026-10-10

Se consolidó la evidencia remota anterior con las suites automatizadas del
código de aplicación integrado en `main @ d1dd726f02d48cca6b1269e5c4a30ba61045b4e6`.
El PR #524 cambia solo documentación; no modifica el código ejecutado por estas
pruebas.

| Área | Resultado y evidencia |
|---|---|
| Tenant y rol | `e2e:bodega-u4-u5` cubre dos tenants y actores independientes: cada vendedor/admin ve su propio catálogo y operaciones, el tenant B no recibe productos/clientes del A, la UI no ofrece recursos ajenos y los intentos autenticados con cliente/producto del tenant B desde el actor A no escriben venta, inventario ni finanzas. La sesión vendedor→ruta admin también fue rechazada en el preview. `PASS` combinado; la negativa de payload cruzado se verifica en Emulator, no se presenta como llamada remota. |
| Venta, autoridad y conciliación | El recorrido staging de solicitud→aprobación→venta y la recuperación autenticada después de perder la respuesta concluyeron con una venta por `$5.000 COP`, sin duplicado; inventario, movimientos y reporte se conciliaron. Una repetición del comando persistido devolvió el resultado canónico sin duplicar movimientos de inventario o financieros. `PASS`. |
| Stock concurrente | Dos vendedores confirmaron en paralelo dos solicitudes por la última presentación disponible; el backend aceptó una, rechazó la otra por stock insuficiente y el saldo final quedó en cero. `PASS` remoto. |
| Membresía y permisos | El replay de activación/restauración del vendedor sintético recuperó sus claims y permitió consultar el catálogo; la obligación y el hecho de auditoría quedaron únicos. Los tests de agenda cubren además revocación/replay, actor sin permiso de `sell` y autoridad tenant derivada del actor. `PASS`. |
| Agenda y reserva | En staging se comprobó creación/conversión, retención y consumo canónico en los recorridos previos, y el Scheduler venció naturalmente la reserva a medianoche de Bogotá y liberó las 2 unidades en su barrido de cinco minutos, sin venta ni ledger. `PASS`; no se adelantó el reloj. |
| PWA y Backoffice | En previews autenticados se cargaron solicitudes, POS, catálogo, clientes, inventario, agenda, ventas, turnos e informes; la lectura de rol admin desde vendedor se denegó. La confirmación se concilió en ambas sesiones. `PASS` para los flujos cubiertos; no implica SLA de tiempo real. |
| Push | La recepción de las pruebas sintéticas fue confirmada por el usuario. El aviso nativo de Windows y el sonido no se observaron; ADR-SAAS-065 define FCM como best-effort, por lo que no son garantías bloqueantes. La actualización en tiempo real de bandejas/stock y la venta en efectivo sin turno se difirieron explícitamente para después de Gate F. |

Validaciones reproducidas en Emulator sobre el mismo código de aplicación:

- `npm run test:bodega-ui`: `12/12 PASS`.
- `npm run e2e:bodega-u4-u5`: `9/9 PASS`.
- `npm run e2e:bodega-agenda`: `8/8 PASS`.
- `npm --prefix functions test`: `417 PASS`, `5 SKIP` esperados, `0 FAIL`.
- `git diff --check`: `PASS`.

La cobertura combina las pruebas negativas multi-tenant deterministas del
Emulator con las transacciones y lecturas autenticadas del único fixture
retenido en staging; no se crea un segundo tenant de staging ni se altera otro
tenant para fabricar el caso A/B. No quedan escenarios funcionales de Gate F
pendientes dentro del alcance aprobado. El resultado de la matriz es
`FUNCTIONAL = PASS`. El registro de este resultado en el Goal queda sujeto a
que PR #524 cumpla auditoría y CI y se integre en `main`. Por autorización
explícita del responsable el 2026-10-10, Gate G puede ejecutarse en paralelo
sobre el código ya integrado en `main @ d1dd726`; esto no declara Gate F
oficialmente cerrado ni habilita H/I antes de integrar #524 y aprobar G. No se
toca el tenant real ni producción.
