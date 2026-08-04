# Backlog ejecutable — MVP SaaS multi-tenant

## Alcance y regla de uso

Este backlog deriva de la planificación aprobada del MVP SaaS multi-tenant. Café
Atrato es el primer tenant de referencia, pero las capacidades P0 deben ser
reutilizables para cualquier tenant.

- **P0:** obligatorio antes del primer día de operación.
- **P1:** importante; puede ejecutarse durante las primeras semanas.
- **P2:** mejora posterior.
- **P3:** fuera del MVP.
- **Esfuerzo:** S (pequeño), M (mediano), L (grande).

Cada PR recomendado es independiente en lo posible y no debe mezclar tareas de distinta prioridad.

## P0 — Antes de operar

| ID | Tarea verificable | Dependencias | Criterio de aceptación | Esfuerzo | PR recomendado |
|---|---|---|---|---|---|
| P0-01 | Certificar el tenant real de Café Atrato: empresa activa, administrador, membresía, claims, configuración B1, módulos y espacios. | Acceso a Firebase de producción y datos corporativos aprobados. | El administrador inicia sesión; el tenant activo es Café Atrato; `configuraciones/{empresaId}` es válida; los módulos y espacios esperados son visibles sin errores de Rules ni 404. | M | `certificacion/cafe-atrato-datos-iniciales` |
| P0-02 | Completar la readiness fiscal real: identidad fiscal, impuestos, numeración y asignación vigente. | P0-01; datos fiscales y resolución/numeración aprobados. | El onboarding finaliza y una venta obtiene snapshot fiscal y consecutivo válidos; no aparecen errores de configuración o numeración. | M | `certificacion/cafe-atrato-fiscal` |
| P0-03 | Cerrar la autoridad de servidor de la segunda fase de venta: estado final, inventario y tesorería. | P0-01, P0-02; contrato R1 existente. | Una venta no depende de una transacción Firestore ejecutada por el cliente para aplicar sus efectos; venta, stock y ledger quedan consistentes y auditables ante reintento. | L | `fix/r1-venta-server-authoritative` |
| P0-04 | Certificar cobro de mostrador y anulación. | P0-02, P0-03; catálogo y cuentas de Café Atrato. | Casos de efectivo, transferencia, pago mixto, crédito y anulación dejan el importe, inventario, venta y tesorería correctos, sin duplicados. | M | `test/certificacion-cobro-mostador` |
| P0-05 | Validar compatibilidad de cuentas financieras de Café Atrato con las rutas usadas por venta, traslado y turnos. | P0-01; datos de cuentas existentes. | Ningún flujo operativo depende de IDs históricos incompatibles (`caja-principal`, `bancolombia`); venta, traslado y cierre usan las cuentas del tenant sin error. | M | `fix/cuentas-financieras-tenant-compatibilidad` |
| P0-06 | Certificar apertura, relevo y cierre de turno con arqueo real. | P0-03, P0-05; operadores y cuentas certificadas. | Se abre turno, se registran ventas/egresos, se realiza relevo y cierre ciego; el arqueo y las transacciones coinciden con los movimientos registrados. | M | `test/certificacion-turnos-caja` |
| P0-07 | Resolver y validar impresión física por el canal de caja elegido. | P0-04; impresora térmica real y configuración 58/80 mm. | Después de una venta y una reimpresión se obtiene un ticket físico correcto desde el canal definido; no depende de una API inexistente en el navegador. | L | `fix/impresion-pos-produccion` |
| P0-08 | Empaquetar y certificar Electron si será el canal de caja. | P0-07; definición de distribución objetivo. | Existe instalador/artefacto arrancable que abre el POS PWA actual, permite login y realiza una impresión física; no intenta cargar una exportación inexistente ni la interfaz SQLite legacy. | L | `fix/electron-pos-distribucion` |
| P0-09 | Confirmar el requisito de factura electrónica y validarlo si aplica. | P0-02; decisión fiscal de Café Atrato. | Si Café Atrato requiere DIAN desde el PWA, una venta real completa la emisión y conserva evidencia; si no la requiere, queda constancia operativa de que usa la evidencia fiscal interna. | L condicional | `feat/facturacion-electronica-operativa` |
| P0-10 | Ejecutar una restauración comprobable de Firestore y documentar el resultado operativo. | Acceso controlado al entorno y conjunto de datos de prueba. | Se restaura un conjunto de datos de prueba sin pérdida no explicada; se verifica login, configuración, inventario, ventas y reportes posteriores. | M | `ops/certificacion-recuperacion-firestore` |
| P0-11 | Implementar recuperación segura de credenciales de administrador y operadores. | ADR-SAAS-017; Firebase Auth y entorno Emulator para validación. | Un administrador recupera un operador no administrador y un operador SaaS autorizado recupera el administrador con evidencia fuera de banda; la activación es de un solo uso, revoca la credencial anterior, no persiste secretos y queda auditada e idempotente. | L | `feat/recuperacion-credenciales-segura` |
| P0-12 | Migrar compras con efecto de inventario y financiero a `registrarCompraOperativaV1`. | ADR-SAAS-021; autoridad tenant-aware de ADR-SAAS-019; Emulator. | Una compra con y sin cuenta confirma snapshots comerciales, inventario, costo y efecto financiero en una única transacción server-side; el replay no duplica efectos y el cliente no escribe las colecciones financieras críticas. | L | `feat/compras-server-authoritative` |

## P1 — Primeras semanas de operación

| ID | Tarea verificable | Dependencias | Criterio de aceptación | Esfuerzo | PR recomendado |
|---|---|---|---|---|---|
| P1-01 | Certificar inventario inicial, ajustes, movimientos, kardex y mermas con casos reales. | P0-01, P0-03; inventario inicial aprobado. | Cada entrada, ajuste, venta y merma deja stock y kardex coherentes; no hay denegaciones de Rules ni movimientos sin trazabilidad. | L | `test/certificacion-inventario-kardex` |
| P1-02 | Validar recetas, modificadores y descuento de insumos en una venta real. | P1-01; recetas y modificadores configurados. | La venta con receta/modificadores mantiene el snapshot comercial y descuenta los insumos correctos. | M | `test/recetas-modificadores-e2e` |
| P1-03 | Implementar y certificar compras, catálogo tenant-aware de proveedores y costos después de P0-12. | P0-12, P1-01, ADR-SAAS-022; datos de compra para certificación. | El catálogo permite crear, editar y desactivar proveedores sin cruzar tenants; una compra resuelve `empresaId + proveedorId`, congela snapshots y conserva idempotencia; las compras históricas no bloquean ni se modifican y las operaciones abiertas impiden la desactivación. | M | `feat/proveedores-tenant-aware` |
| P1-04 | Certificar salón, cuentas múltiples, comandas y cocina bajo operación concurrente. | P0-04; mesas, usuarios y permisos configurados. | Abrir, separar, unir y trasladar cuentas; enviar comandas; y transicionar estados de cocina funciona sin pérdida ni confusión de cuentas. | L | `test/salon-cocina-concurrencia` |
| P1-05 | Certificar clientes, crédito, cobranza, historial y reportes con datos reales. | P0-04; clientes y casos de crédito. | Un crédito, su cobranza y los reportes/historial asociados muestran importes y tenant correcto; las consultas soportan el volumen inicial sin fallos. | M | `test/clientes-reportes-certificacion` |
| P1-06 | Resolver la compatibilidad definitiva entre IDs financieros históricos y tenant-aware. | P0-05. | Los servicios operativos no contienen dependencias funcionales de IDs históricos; un tenant moderno y Café Atrato usan el mismo contrato. | M | `refactor/cuentas-financieras-tenant` |
| P1-07 | Incorporar Rules, configuración B1 y casos E2E relevantes al CI. | Suites existentes y resultados de P0. | Cada ejecución de CI corre Rules, pruebas B1 y los casos críticos automatizables de operación; un fallo bloquea la integración. | M | `test/ci-cobertura-operativa` |
| P1-08 | Certificar el comportamiento de caché persistente y recuperación de conectividad. | P0-04; dispositivos de prueba. | La pérdida y recuperación de conectividad no duplica ventas ni deja al operador sin un estado comprensible; se registra el resultado de la prueba. | M | `test/sincronizacion-contingencia` |
| P1-09 | Validar reservas y Wompi si Café Atrato mantiene ese flujo. | Decisión comercial; Landing y configuración de Wompi existentes. | El flujo público y el cobro de reservas finalizan sin exponer datos de otro tenant. | L condicional | `test/reservas-wompi-operacion` |

## P2 — Posterior al MVP

| ID | Tarea verificable | Dependencias | Criterio de aceptación | Esfuerzo | PR recomendado |
|---|---|---|---|---|---|
| P2-01 | Certificar notificaciones push y deep-links. | VAPID, permisos de navegador y dispositivos de prueba. | Una notificación autorizada llega al dispositivo esperado y abre el destino correcto. | M | `feat/notificaciones-certificacion` |
| P2-02 | Completar paginación y límites de consultas históricas. | P1-05; perfil de volumen real. | Reportes e historial no ejecutan consultas no acotadas para las rutas cubiertas y mantienen los resultados esperados. | M | `perf/reportes-paginacion` |
| P2-03 | Definir y desplegar el contrato seguro de Firebase Storage. | Inventario de usos de Storage. | Storage tiene Rules y configuración de despliegue; las rutas necesarias quedan aisladas por tenant. | M | `security/storage-rules-tenant` |
| P2-04 | Formalizar la contingencia offline y reconciliación de UX. | P1-08; resultados de operación real. | Existe un flujo probado para informar el estado offline, recuperar conectividad y reconciliar operaciones sin ambigüedad. | L | `feat/offline-reconciliacion-ux` |

## P3 — Fuera del MVP de Café Atrato

| ID | Trabajo excluido | Razón de exclusión | PR recomendado |
|---|---|---|---|
| P3-01 | Landing multi-tenant, eventos multi-tenant, branding tenant-aware y dominios personalizados. | No son necesarios para vender, controlar inventario, cerrar caja ni recuperar la operación inicial de Café Atrato. | `feature/landing-events-multitenant` |
| P3-02 | Portal de operador SaaS. | No forma parte del MVP operativo definido en el informe. | `feature/operator-portal` |

## Secuencia de ejecución

1. Completar **P0-01** y habilitar la ruta DEMO; **P0-02** solo es requisito para operación FISCAL.
2. Completar **P0-03**, **P0-05** y **P0-12** antes de certificar el núcleo transaccional completo.
3. Ejecutar **P0-04** y **P0-06** en Emulator y después en un entorno representativo.
4. Certificar **P0-07** cuando exista hardware y canal de caja; **P0-08** solo si se elige Electron.
5. Si habrá factura electrónica desde PWA, completar **P0-09** después de P0-02.
6. Cerrar P0 solamente después de **P0-10** y de una prueba integral: venta → inventario → caja → turno → ticket → recuperación.
7. Ejecutar P1 según los flujos que cada tenant utilice durante sus primeras semanas.
