# G-SAAS-02 / M2 / E2.2 — Gate F: conciliación operativa de solo lectura (2026-10-09)

**Estado:** evidencia puntual `PASS`; Gate F permanece `EN CURSO`.

## Alcance y entorno

Revisión autenticada en el Preview de Gate F del tenant sintético
`E2_2-BODEGA-STAGING-FIXTURE`, el 2026-10-09 entre 22:24 y 22:25 UTC
(17:24–17:25, Bogotá). Se consultaron solicitudes, ventas, inventario y reportes.
No se aprobaron, rechazaron, confirmaron ni cancelaron operaciones.

## Resultados observados

| Superficie | Resultado |
|---|---|
| Solicitudes vendedor/admin | La PWA del vendedor y la bandeja admin muestran las mismas dos solicitudes del cliente sintético como `APROBADA`, cada una por `$5.000 COP` y una presentación (2 unidades base). Ambas esperan confirmación de venta; ninguna se cuenta como venta ni reserva stock. La coincidencia es una lectura de ambas vistas, no una prueba de actualización en tiempo real. |
| Inventario | 4 unidades físicas; mínimo 2; 2 reservadas por la agenda; 2 disponibles. La proyección coincide con la retención activa del fixture. |
| Ventas | La consulta administrativa lista 12 ventas sintéticas pagadas de `$5.000 COP`; total `$60.000 COP`, consistente con Reportes mensual. |
| Reporte semanal (5–11 oct) | Ventas `$25.000 COP`, 5 unidades; los vendedores listados suman `$15.000 + $10.000`. |
| Reporte mensual (octubre) | Ventas `$60.000 COP`, costo `$24.000`, ganancia bruta `$36.000`, margen `60%`, 12 unidades. Los totales por vendedor (`$30.000 + $25.000 + $5.000`) suman `$60.000`. |
| Cuadre de efectivo | Los tres vendedores aparecen `Cuadrado`; efectivo contado coincide con efectivo esperado, que incluye las bases de apertura. Transferencias se muestran separadas del efectivo. |
| Usuarios/permisos | `/admin/usuarios` lista 4 operadores `Vendedor` y 1 `Administrador`. `/admin/permisos` explica que el vendedor solo vende y gestiona su turno; no recibe módulos de restaurante, reservas, consignaciones ni permisos administrativos. Es evidencia de UI en este tenant, no una matriz backend A/B. |
| Control de rol | La sesión vendedora fue redirigida desde `/admin/solicitudes` con `error=not_admin` y mensaje de sesión de caja activa. Volver a `/pos` restauró la sesión vendedora. Esto acredita el guard visible de navegación, no una matriz de autorización backend/tenant A/B. |

Las dos solicitudes aprobadas requieren 2 unidades base cada una, pero hay solo
2 unidades disponibles. No se confirmó ninguna venta: la resolución de la
carrera entre ambas queda como escenario remoto pendiente. La suite Emulator
ya valida que el backend no excede el stock bajo consumo concurrente.

## Límite y mutaciones

Esta pasada verifica conciliación visual entre solicitud aprobada, venta
canónica, inventario reservado y reportes; no acredita replay/concurrencia
autenticados remotos, aislamiento A/B completo, revocación/restauración con
replay, entrega visible de push en este origen ni expiración automática de la
reserva. La última requiere observar el Scheduler normal después del vencimiento
configurado; no se adelantó el reloj.

Solicitudes, ventas, pagos, ledger, existencias, agendas, turnos, membresías,
Auth, Rules, Functions, Scheduler, IAM, Secrets, despliegue y producción:
mutaciones de Codex `0`. Se usaron únicamente pantallas autenticadas de lectura;
no se permitió el aviso de notificaciones en este nuevo origen.

Gate F continúa `EN CURSO`; este checkpoint no modifica el Goal ni certifica el
cierre de E2.2.

### Seguimiento operativo read-only — 2026-10-09, aproximadamente 22:33–22:45 UTC

En el mismo Preview de `micafe-pos-staging`, con las sesiones sintéticas de
vendedor y admin abiertas en navegadores separados, se amplió la conciliación
sin operar la agenda:

| Superficie | Resultado observado |
|---|---|
| Solicitudes | Ambos roles muestran las mismas dos solicitudes `APROBADA` de `$5.000 COP` cada una. Ninguna se confirmó ni canceló. |
| Stock visible | Admin informa 4 unidades físicas, 2 reservadas y 2 disponibles; el POS del vendedor informa 1 presentación disponible (factor 2), equivalente a las mismas 2 unidades base. |
| Ventas | Admin lista 12 ventas pagadas de `$5.000` (`$60.000` total). El historial del vendedor sintético muestra 6 ventas (`$30.000`), coincidentes con su subtotal en el reporte. Efectivo y transferencia están representados. |
| Rentabilidad | Reporte de octubre: ventas `$60.000`, costo `$24.000`, ganancia bruta `$36.000`, margen `60%`, 12 unidades; subtotales de vendedores suman `$60.000`. |
| Turnos | 9 visibles: 8 cerrados y 1 abierto antiguo. Los cierres visibles tienen diferencia acumulada `$0`; el abierto conserva base `$10.000`. No se cerró ni alteró porque cambiaría caja. |
| Guard de rol | Desde la sesión del vendedor, abrir `/admin/solicitudes` redirigió a `error=not_admin` y exigió cerrar la sesión de caja antes de intentar acceso admin. Volver a `/pos` restauró la sesión del vendedor. Acredita el guard UI, no autorización backend A/B completa. |
| Resolución tenant | Al navegar a Reportes y Turnos apareció brevemente `Verificando acceso al tenant…`; la siguiente lectura resolvió sin recargar. No reproduce una carga infinita. |

La corrida adicional `npm run e2e:bodega-u4-u5` terminó `9 passed` en Emulator.
Incluye recorridos de solicitud/aprobación/venta, retry tras pérdida de
respuesta y aislamiento A/B. Esta evidencia automatizada no sustituye las
pruebas autenticadas remotas de replay, retry y carrera de stock.

Mutation audit de este seguimiento: no se aprobaron, rechazaron, confirmaron ni
cancelaron solicitudes; no se alteraron caja, turnos, stock, ventas, agenda,
membresías, Auth, Rules, Functions, Scheduler, IAM, Secrets, despliegue o
producción. La sesión del vendedor se restauró en `/pos` después de comprobar
el guard. Gate F permanece `EN CURSO`.
