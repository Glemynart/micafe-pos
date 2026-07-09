# Auditoría Integral del Sistema — POS Café
**Fecha de auditoría:** 2026-06-29  
**Rama auditada:** `audit/sistema-completo`  
**Auditores:** Claude Opus 4.8 (5 agentes especializados)  
**Build verificado:** `tsc --noEmit` ✅ · `next build` ✅ (23 rutas)

---

## Checklist de hallazgos CRIT

| # | Hallazgo | Estado | Rama | Notas |
|---|----------|--------|------|-------|
| C-1 | Reglas Firestore no desplegables: falta `movimientos_inventario`, cajero no puede leer `cuentas_bancarias` | ✅ **Cerrado** | `fix/auditoria-sistema-c1` · PR #37 | Reglas desplegadas a Firebase el 2026-06-30 |
| C-2 | Venta con tarjeta genera asiento sin tesorería | 🚫 **Cerrado (No aplica)** | — | `tarjeta` fuera del alcance del sistema. UI genera solo efectivo/transferencia/cuenta_cobro. No existe camino vivo que produzca venta pagada sin asiento. Verificado en `lib/ventas-service.ts:57,277-287`, `components/pos/sell-module.tsx:701`, `lib/cuentas-cobro-service.ts:120-122` |
| C-3 | `registrarVenta` (mostrador) sin idempotencia → doble venta | ✅ **Cerrado** | `fix/auditoria-sistema-c3` | Mutex síncrono `isProcessingRef` en `handlePaymentComplete`; bloquea doble disparo antes de llegar a `registrarVenta`. |
| C-4 | Traslado entre cuentas en página admin no es atómico → puede perder dinero | ✅ **Cerrado** | — | `trasladarEntreCuentas` usa `runTransaction` con 4 escrituras atómicas. Verificado 2026-07-09. |
| C-5 | La compra nunca actualiza el costo del artículo; sin costeo | ⚠️ **Parcial** | — | `registrarCompra` sí propaga `costo` al artículo (`compras-service.ts:151-158`). Pero `eliminarCompra` no revierte el costo. Verificado 2026-07-09. |
| C-6 | Cualquier operativo puede anular ventas sin auditoría ni control | ✅ **Cerrado** | `fix/auditoria-sistema-c6` | Rules: update ventas congelado para anuladas + transición→anulada solo admin. Código: `anuladaPor`/`anuladaPorNombre`/`anuladaEn` escritos atómicamente en el mismo `runTransaction`. Asiento financiero atribuido al anulador real. Reglas desplegadas 2026-06-30. |

---

## Checklist de hallazgos IMP

| # | Hallazgo | Estado |
|---|----------|--------|
| IMP-1 | Saldo bancario en compras sin validar fondos | ✅ **Corregido** — `compras-service.ts:87-91` valida `saldoDisponible < params.total` dentro de `runTransaction`. |
| IMP-2 | Arqueo de turno confía en el cliente sin recalcular | ✅ **Corregido** — `cerrarTurno` recalcula desde Firestore con `calcularVentasTurno()` + `calcularEgresosTurno()`. |
| IMP-3 | Reconciliación de inventario (I9) inactiva en la app | 🚫 **Cerrado (No aplica)** — UI completa en `utilidades/page.tsx:362-478`, accesible para admin. |
| IMP-4 | `update` de `cuentas_bancarias` abierto a operativos sin validar monto | ✅ **Corregido** (PR #74, #75, #76) |
| IMP-5 | Regla `reservas` update/delete abierta a cualquier autenticado | ✅ **Corregido** — `update` restringido a `esOperativo()`, `delete` bloqueado con `if false`. Commit `e7c0eab`. |
| IMP-6 | IVA hardcodeado al 19% para todo producto | ⚠️ **Parcial** — `impuestos-service.ts` soporta tasas variables. Legacy: `vender.tsx`, `inventario.tsx`, `inventory-module.tsx` aún hardcodean `iva: 19`. |
| IMP-7 | Sin validación servidor de suma `pagoMixtoDetalle` == total | ✅ **Corregido** — `ventas-service.ts:107-126` valida `sumaDetalle !== totales.total` dentro de `runTransaction`. |
| IMP-8 | Stock insuficiente no bloquea la venta; toast "ajustado a 0" es falso | 🚫 **Cerrado (Decisión de negocio)** — El sistema ya advierte sin bloquear. Política: las ventas nunca se bloquean por stock. |
| IMP-9 | Stock solo se descuenta al cobrar, no al enviar a cocina | 🚫 **Cerrado (Decisión de negocio)** — El descuento al cobrar es intencional: solo se consume inventario de lo efectivamente vendido, no de lo enviado a cocina. |
| IMP-10 | Separar cuenta no repunta `comandaIds`/`pedidoId` | ✅ **Corregido** (PR #56) |
| IMP-11 | Unir cuentas concatena ítems sin des-duplicar uids | ✅ **Corregido** (PR #56) |
| IMP-12 | Anular venta no reabre pedido/comandas asociadas | 🚫 **Cerrado (No aplica)** |
| IMP-13 | Queries sin límite sobre historial de ventas y turnos | ⚠️ **Parcial** — Suscripciones y admin pages tienen `limit()`. `generarReporteVentas` y `reconciliarGlobal` siguen sin límite. |
| IMP-14 | Carrera no atómica al marcar fiado como pagado | 🚫 **Cerrado (No aplica)** — Firestore `runTransaction` con control de concurrencia optimista protege la carrera. Verificado 2026-07-09. |
| IMP-15 | Páginas historial compras/mermas no filtran por `espacioId` | ✅ **Corregido** (PR #77) — Admin es vista global por diseño. `generarReporteVentas` ahora aplica `espacioId`. |
| IMP-16 | Duplicación de lógica (agregación, `getCurrentUserInfo`) | ⬜ Pendiente — `formatCurrency` 7×, `editarProducto`/`editarInsumo` gemelos, role checks 13×. |
| IMP-17 | Código muerto commiteado: componentes `-premium` (eran 4, no 5) | ✅ **Cerrado** |

---

## IMP-12 — Investigado y cerrado como No aplica (2026-07-01)

`anularVenta` (`lib/ventas-service.ts:468-661`) revierte venta, inventario y tesorería, pero nunca lee `ventaData.pedidoId` ni toca `pedidos_activos`/`comandas_cocina`. El síntoma es cierto, pero coincide exactamente con el diseño aprobado de FASE-13 (decisión #2: reabrir mesa = nueva cuenta; pedido pagado inmutable; corregir cobro errado = `anularVenta`). No reabrir es el comportamiento correcto y requerido, no un defecto.

Sin corrupción activa: el único residuo es una referencia cruzada obsoleta e inerte (`venta.pedidoId ↔ pedido.ventaId`) que ningún consumidor lee; el arqueo se autoexcluye la venta anulada (filtra `estado==='pagada'`, IMP-2).

Implementar la reapertura introduciría regresiones activas: reabriría el guard de idempotencia de `cobrarPedido` (riesgo de doble cobro sobre el mismo pedido), reinyectaría al KDS comandas ya `entregado` sin estado de reversión definido, y descuadraría el arqueo con una venta `pagada` fantasma. Mismo criterio que C-2/IMP-15: premisa del hallazgo invalidada por decisión de producto definitiva. Sin cambio de código.

---

## Notas de calidad transversal
- `next.config.mjs:10` — `typescript.ignoreBuildErrors: true`; la garantía de tipos depende del `tsc` separado
- 0 pruebas automatizadas en todo el proyecto
- Reglas Firestore compiladas y desplegadas correctamente desde el fix de C-1
