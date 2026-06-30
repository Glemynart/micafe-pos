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
| C-4 | Traslado entre cuentas en página admin no es atómico → puede perder dinero | ⬜ Pendiente | — | |
| C-5 | La compra nunca actualiza el costo del artículo; sin costeo | ⬜ Pendiente | — | |
| C-6 | Cualquier operativo puede anular ventas sin auditoría ni control | ✅ **Cerrado** | `fix/auditoria-sistema-c6` | Rules: update ventas congelado para anuladas + transición→anulada solo admin. Código: `anuladaPor`/`anuladaPorNombre`/`anuladaEn` escritos atómicamente en el mismo `runTransaction`. Asiento financiero atribuido al anulador real. Reglas desplegadas 2026-06-30. |

---

## Checklist de hallazgos IMP

| # | Hallazgo | Estado |
|---|----------|--------|
| IMP-1 | Saldo bancario en compras sin validar fondos | ⬜ Pendiente |
| IMP-2 | Arqueo de turno confía en el cliente sin recalcular | ⬜ Pendiente |
| IMP-3 | Reconciliación de inventario (I9) inactiva en la app | ⬜ Pendiente |
| IMP-4 | `update` de `cuentas_bancarias` abierto a operativos sin validar monto | ⬜ Pendiente |
| IMP-5 | Regla `reservas` update/delete abierta a cualquier autenticado | ⬜ Pendiente |
| IMP-6 | IVA hardcodeado al 19% para todo producto | ⬜ Pendiente |
| IMP-7 | Sin validación servidor de suma `pagoMixtoDetalle` == total | ⬜ Pendiente |
| IMP-8 | Stock insuficiente no bloquea la venta; toast "ajustado a 0" es falso | ⬜ Pendiente |
| IMP-9 | Stock solo se descuenta al cobrar, no al enviar a cocina | ⬜ Pendiente |
| IMP-10 | Separar cuenta no repunta `comandaIds`/`pedidoId` | ⬜ Pendiente |
| IMP-11 | Unir cuentas concatena ítems sin des-duplicar uids | ⬜ Pendiente |
| IMP-12 | Anular venta no reabre pedido/comandas asociadas | ⬜ Pendiente |
| IMP-13 | Queries sin límite sobre historial de ventas y turnos | ⬜ Pendiente |
| IMP-14 | Carrera no atómica al marcar fiado como pagado | ⬜ Pendiente |
| IMP-15 | Páginas historial compras/mermas no filtran por `espacioId` | ⬜ Pendiente |
| IMP-16 | Duplicación de lógica (agregación, `getCurrentUserInfo`) | ⬜ Pendiente |
| IMP-17 | Código muerto commiteado: componentes `-premium` (eran 4, no 5) | ✅ **Cerrado** |

---

## Notas de calidad transversal
- `next.config.mjs:10` — `typescript.ignoreBuildErrors: true`; la garantía de tipos depende del `tsc` separado
- 0 pruebas automatizadas en todo el proyecto
- Reglas Firestore compiladas y desplegadas correctamente desde el fix de C-1
