# TDD — Precio de venta y margen en compras Bodega

## Alcance

Goal `G-SAAS-02` → Milestone `M2` → Epic `E2.2`. Al registrar una compra
Bodega, la interfaz permite editar el costo por unidad base y muestra en solo
lectura el precio vigente de cada presentación activa. Para cada presentación
calcula utilidad bruta y margen estimados. La compra no cambia precios ni
presentaciones del catálogo.

El catálogo administrativo también muestra el costo base persistido del
producto y proyecta costo por presentación, utilidad bruta y margen con el
mismo cálculo. Esta vista es solo de lectura: no envía costos al vendedor, no
modifica el precio y no aplica automáticamente un porcentaje de ganancia.

La semántica sigue ADR-SAAS-041 y ADR-SAAS-070: el precio de venta vigente es
`precioCOP` por presentación y su factor es `factorUnidadBase`. Si el costo de
compra por unidad base es `C`, el factor de la presentación es `F` y su precio
vigente es `P`, se calcula:

- Costo estimado de la presentación: `C × F`.
- Utilidad bruta estimada: `P − (C × F)`.
- Margen bruto: `utilidad bruta ÷ P × 100`.

El cálculo solo se muestra cuando costo, factor y precio son enteros seguros
positivos; una utilidad negativa se conserva. Presentaciones inactivas o con
precio/factor inválidos no se presentan como vigentes. El precio y el margen
son una proyección visual; no se envían en el payload de compra ni son
autoridad para ventas.

## Recorrido y evidencia RED/GREEN

| Etapa | Comando | Resultado |
|---|---|---|
| RED | `npm exec -- tsx --test lib/bodega/purchase-margin.test.ts` con el helper vacío de prueba | 4 fallos esperados de 5: faltaba proyectar las presentaciones y sus márgenes; el caso de presentaciones inválidas ya pasaba. |
| GREEN | `npm exec -- tsx --test lib/bodega/purchase-margin.test.ts` | PASS, 5/5. |
| Cobertura focal | `node --experimental-test-coverage --import tsx --test lib/bodega/purchase-margin.test.ts` | PASS; `purchase-margin.ts`: líneas 100 %, ramas 96,15 %, funciones 100 %. |
| Regresión Bodega | `npm run test:bodega-ui` | PASS, 35/35. |
| Reglas Firestore (Emulator local) | `npm run test:rules` | PASS, 46/46; la regla candidata permite leer `presentaciones_producto` al administrador del tenant y deniega lectura al vendedor. No certifica las Rules remotas. |
| Contrato/idempotencia de compra | `npm run test:purchase-command` | PASS, 4/4. |
| Lint focal | `npm exec -- eslint components/pos/purchases-module.tsx lib/bodega/admin-service.ts lib/bodega/purchase-margin.ts lib/bodega/purchase-margin.test.ts` | PASS. |
| Tipos | `npm exec -- tsc --noEmit` | PASS. |
| Build | `npm run build` | PASS con Next.js 16.4.1. |
| Integridad del diff | `git diff --check` | PASS. |

## Implementación revisada

- `lib/bodega/purchase-margin.ts` contiene una proyección pura por presentación.
- `components/pos/purchases-module.tsx` consulta presentaciones al abrir el
  formulario Bodega, marca errores de lectura, y muestra precio, utilidad y
  margen como solo lectura. El encabezado del costo indica que corresponde a
  la unidad base.
- `lib/bodega/admin-service.ts` permite que la suscripción de presentaciones
  reporte errores de lectura sin cambiar las llamadas existentes.
- `lib/bodega/purchase-margin.test.ts` cubre múltiples presentaciones, costo
  ausente, pérdida, datos inactivos/inválidos y desbordamiento.

## Entorno y límites

Las dependencias se instalaron en el worktree aislado con `npm ci
--ignore-scripts`, desde `package-lock.json`; no se modificó el lockfile. npm
reportó 11 advisories durante la instalación (4 moderados y 7 altos); no se
ejecutó `npm audit fix` ni se cambió ninguna dependencia.

No se ejecutaron pruebas visuales de navegador, Emulator de Functions, acceso
a Firestore remoto, compras remotas ni operaciones productivas. El acceso en
producción a `presentaciones_producto` depende de Rules compatibles; este cambio no las
despliega ni certifica su estado remoto. El build confirma compilación, no
autenticación ni autorización remota.

La suite de Rules se ejecutó posteriormente el 2026-10-17 sobre el código del
PR `b8293fda2fda6a6200fca5b933a42822500d0b7e`, con el Firestore Emulator local
del proyecto demo `demo-mt-u4-rules`; terminó con 46 pruebas aprobadas y cero
fallidas. Esta evidencia comprueba el archivo candidato `firestore.rules`, no
el ruleset activo de producción, cuya lectura sigue sin verificarse.
