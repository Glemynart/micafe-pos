# TDD — Propuesta offline del catálogo de Diana

**Goal / Milestone / Epic:** G-SAAS-02 / M2 / E2.2 Configuración inicial

**Alcance:** generar un JSON local, trazable y revisable desde el Excel fuente y la plantilla de revisión de Diana. No genera una carga ejecutable ni modifica Firebase.

**Runbook:** [G-SAAS-02 Trial Operations](../goals/G-SAAS-02-TRIAL-OPERATIONS.md)

## Ciclo TDD

| Etapa | Evidencia | Resultado |
|---|---|---|
| RED: propuesta | Commit `673dfd3`; `npm run test:g-saas-02:catalog-review-validation` ejecutó 10 casos: 7 pasaron y los 3 nuevos fallaron porque no existía el generador de plan. | Falla atribuible a la capacidad ausente. |
| GREEN: core | Commit `316b7c4`; misma suite ejecutada tras implementar el constructor: 10/10. | Precio único de tienda, costo exacto, listas separadas y bloqueo si falta mapeo. |
| RED: salida segura | Commit `9f338d3`; suite con la prueba de archivo: 10 pasaron y 1 falló porque aún no existía el escritor exclusivo. | Falla atribuible a la capacidad ausente. |
| GREEN: escritor y CLI | `npm run test:g-saas-02:catalog-review-validation`: 11/11; `npm run test:g-saas-02:catalog-offline-plan`: 2/2. | Archivo JSON exclusivo; flujo CLI válido e incompleto verificados. |

## Garantías verificadas

| # | Garantía | Prueba | Resultado |
|---|---|---|---|
| 1 | Solo se usa `PRECIO VENTA` de `PRECIOS A TIENDA`; el costo de presentación se divide exactamente por el factor entero. | `catalog-review-validation.test.ts` | PASS |
| 2 | No se aplica aumento automático del 10 %, no se infiere agrupación de productos y no se incluyen existencias iniciales. | `catalog-review-validation.test.ts` | PASS |
| 3 | Precios de consumidor no entran en la propuesta; filas exclusivas se difieren y coincidencias no se fusionan. | `catalog-review-validation.test.ts`, `catalog-offline-plan.test.ts` | PASS |
| 4 | El plan incluye SHA-256 del origen y de la revisión; el CLI informa el SHA-256 del JSON. | `catalog-offline-plan.test.ts` | PASS |
| 5 | Archivo de salida nuevo y exclusivo; no sobrescribe los Excel de entrada ni un archivo existente. | `catalog-review-validation.test.ts` | PASS |
| 6 | Una plantilla incompleta no crea archivo y el CLI termina con código 3. | `catalog-offline-plan.test.ts` | PASS |
| 7 | El plan declara `firebaseAccessed=false`, `writesPerformed=false` e `importReady=false`; el resumen CLI también los marca y no expone nombres ni precios. Los datos comerciales solo se serializan en el JSON local. | Ambas suites | PASS |

## Validación ejecutada

- `npm run test:g-saas-02:catalog-review-validation`: 11/11.
- `npm run test:g-saas-02:catalog-offline-plan`: 2/2.
- `npx tsc --noEmit`: PASS.
- ESLint focalizado sobre los cinco archivos de tooling: PASS.
- `git diff --check`: PASS.
- Cobertura Node para la suite de validación: 98.57 % líneas, 75.76 % ramas y 97.50 % funciones en los archivos cargados; la cobertura de ramas incluye helpers previos del validador.
- Cobertura Node para el CLI: 95.32 % líneas, 58.70 % ramas y 95.83 % funciones en los archivos cargados. El CLI alcanza 95.56 % de líneas; los casos no cubiertos son manejo de argumentos/formato inválido.
- Validación local del Excel fuente y de la plantilla del 24-oct-2026: `reviewValid=true`, `sourceMatches=true`, 107/107 filas de tienda coinciden con origen, pero 0 mapeadas y 107 pendientes; 51 filas consumidor diferidas y 4 coincidencias pendientes. El CLI devolvió 3 y no creó el archivo solicitado.

## Límites conocidos

La plantilla privada disponible aún no permite producir el plan real por falta de categoría, unidad base, presentación, factor y base de costo en las 107 filas de tienda. Las cuatro coincidencias del consumidor quedan como referencias pendientes; las 51 filas solo consumidor permanecen diferidas. La generación de un JSON no implica aprobación humana, readiness de importación, inventario disponible, Gate I, despliegue ni autorización de Trial. No se validó ningún comportamiento remoto.