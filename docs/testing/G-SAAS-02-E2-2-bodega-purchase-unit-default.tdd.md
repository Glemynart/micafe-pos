# Evidencia TDD — Unidad predeterminada de compras Bodega

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`  
**Alcance:** mostrar `unidades` en filas vacías de compras de Bodega; conservar `g` para insumos de cafetería. Sin cambios en la autoridad de compra ni en datos.

## Journey y garantía

- En Bodega, la fila inicial, las nuevas filas y el formulario reiniciado muestran unidades, nunca gramos.
- En una cafetería que compra insumos, el valor predeterminado sigue siendo gramos.
- La unidad de los productos seleccionados sigue derivándose del catálogo (`unidades`).

## RED / GREEN

- **RED:** se añadieron primero los casos del helper predeterminado. `npm exec -- tsx --test lib/bodega/compra-routing.test.ts` terminó con 3 pruebas existentes en PASS y 3 nuevas en FAIL: `unidadMedidaCompraPredeterminada is not a function`.
- **GREEN:** después de implementar el helper y usarlo en la inicialización, las filas nuevas y el reinicio, el mismo comando pasó 6/6.

## Evidencia ejecutada

| Garantía | Validación | Resultado |
|---|---|---|
| Bodega muestra unidades y cafetería conserva gramos | `npm exec -- tsx --test lib/bodega/compra-routing.test.ts` | PASS (6/6) |
| Regresión de la superficie Bodega | PowerShell: `$files = rg --files lib/bodega | Where-Object { $_ -like '*.test.ts' }; npm exec -- tsx --test $files` | PASS (29/29) |
| Cobertura del helper y la regla de compra | `node --experimental-test-coverage --import tsx --test lib/bodega/compra-routing.test.ts` | PASS (`compra-routing.ts`: 100 % líneas, 95,83 % ramas, 100 % funciones) |
| Tipos de la aplicación | `npm exec -- tsc --noEmit` | PASS |
| Lint de archivos afectados | `npm exec -- eslint components/pos/purchases-module.tsx lib/bodega/compra-routing.ts lib/bodega/compra-routing.test.ts` | PASS |
| Build de Next.js | `npm run build` | PASS (Next.js 16.4.1) |
| Integridad del diff | `git diff --check` | PASS |

Las dependencias se instalaron en la copia temporal con `npm ci --ignore-scripts`, usando `package-lock.json`. El detector `scripts/setup-package-manager.js` no existe; npm se determinó por el lockfile. La instalación informó 11 advisories (4 moderados, 7 altos); no se cambió ni reparó el lockfile.

## Límites

No se ejecutó prueba de navegador ni Emulator; el cambio se limita a una regla pura de presentación y sus usos en el formulario. No se ejecutaron Functions, Rules, Firestore, operaciones comerciales ni pruebas remotas. No se implementó margen de ganancia: ADR-SAAS-041 no incluye costos/márgenes en proyecciones de vendedor y ADR-SAAS-070 establece precio por presentación, pero no define fórmula ni superficie administrativa para ese indicador.
