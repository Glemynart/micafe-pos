# Evidencia TDD — Unidad predeterminada de compras Bodega

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`
**Alcance:** mostrar `unidades` en filas vacías de compras de Bodega; conservar `g` para insumos de cafetería. Sin cambios en la autoridad de compra ni en datos.

## Journey y garantía

- En Bodega, la fila inicial, las nuevas filas y el formulario reiniciado muestran unidades, nunca gramos.
- En una cafetería que compra insumos, el valor predeterminado sigue siendo gramos.
- Si vertical/espacio llegan después del montaje, se actualizan solo las filas aún vacías; líneas ya seleccionadas o editadas se conservan.
- La unidad de los productos seleccionados sigue derivándose del catálogo (`unidades`).

## RED / GREEN

- **RED:** se añadieron primero los casos del helper predeterminado. `npm exec -- tsx --test lib/bodega/compra-routing.test.ts` terminó con 3 pruebas existentes en PASS y 3 nuevas en FAIL: `unidadMedidaCompraPredeterminada is not a function`.
- **RED adicional:** se reprodujo la carga tardía del contexto con 6 casos existentes en PASS y el nuevo caso en FAIL (`sincronizarUnidadPredeterminadaEnItemsVacios is not a function`).
- **GREEN:** después de implementar el helper y sincronizar únicamente filas vacías, `npm exec -- tsx --test lib/bodega/compra-routing.test.ts` pasó 7/7; la suite Bodega pasó 30/30.

## Evidencia ejecutada

| Garantía | Validación | Resultado |
|---|---|---|
| Bodega muestra unidades, cafetería conserva gramos y la carga tardía no pisa una fila editada | `npm exec -- tsx --test lib/bodega/compra-routing.test.ts` | PASS (7/7) |
| Regresión de la superficie Bodega | `npm exec -- tsx --test` sobre los siete `lib/bodega/*.test.ts` | PASS (30/30) |
| Cobertura del helper y la regla de compra | `node --experimental-test-coverage --import tsx --test lib/bodega/compra-routing.test.ts` | PASS (`compra-routing.ts`: 100 % líneas, 96,77 % ramas, 100 % funciones) |
| Tipos de la aplicación | `npm exec -- tsc --noEmit` | PASS |
| Lint de archivos afectados | `npm exec -- eslint components/pos/purchases-module.tsx lib/bodega/compra-routing.ts lib/bodega/compra-routing.test.ts` | PASS |
| Build de Next.js | `npm run build` | PASS (Next.js 16.4.1) |
| Integridad del diff | `git diff --check` | PASS |

Las dependencias se instalaron en la copia temporal con `npm ci --ignore-scripts`, usando `package-lock.json`. El detector `scripts/setup-package-manager.js` no existe; npm se determinó por el lockfile. La instalación informó 11 advisories (4 moderados, 7 altos); no se cambió ni reparó el lockfile.

## Límites

No se ejecutó prueba de navegador ni Emulator; el cambio se limita a una regla pura de presentación y sus usos en el formulario. No se ejecutaron Functions, Rules, Firestore, operaciones comerciales ni pruebas remotas. No se implementó margen de ganancia: ADR-SAAS-041 no incluye costos/márgenes en proyecciones de vendedor y ADR-SAAS-070 establece precio por presentación, pero no define fórmula ni superficie administrativa para ese indicador.
