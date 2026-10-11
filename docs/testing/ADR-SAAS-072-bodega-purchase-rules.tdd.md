# TDD — ADR-SAAS-072: corte de escrituras directas de compras Bodega

- **Goal / Milestone / Epic:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisión:** Opción 2 de ADR-SAAS-072, ya aceptada e integrada en `main`.
- **Alcance:** denegar create/delete desde cliente en `/compras` solo cuando el
  tenant es `BODEGA_MVP1`; conservar lectura y las escrituras legacy de otros
  verticales. No modifica Functions ni despliega Rules.

## RED / GREEN

| Etapa | Commit | Comando | Resultado |
|---|---|---|---|
| RED | `d869df2` | `npm run test:rules` | 41 PASS / 1 FAIL esperado: el admin Bodega aún podía crear una compra directa. El test del vertical `GENERAL` pasó. |
| GREEN | `f8bd187` | `npm run test:rules` | PASS, 42/42; Bodega conserva lectura y pierde create/delete directo; `GENERAL` conserva create/delete. |
| Verificación | rama actual | `npx tsc --noEmit` | PASS, exit code 0. |
| Verificación | rama actual | `npx eslint firestore-rules/bodega-purchases.test.ts firestore-rules/run-tests.ts` | PASS, exit code 0. |

## Garantías probadas

| Garantía | Archivo de prueba | Tipo | Resultado |
|---|---|---|---|
| El admin Bodega lee compras de su tenant, pero no crea ni borra compras directamente. | `firestore-rules/bodega-purchases.test.ts` | Firestore Rules Emulator | PASS |
| Un admin de `GENERAL` conserva create/delete legacy. | `firestore-rules/bodega-purchases.test.ts` | Firestore Rules Emulator | PASS |

## Seguridad y límites

- `registrarCompraBodegaV1` usa la ruta seleccionada por el vertical del tenant;
  el módulo Bodega solo se monta después de cargar la configuración Bodega.
- Rules solo limitan clientes; no bloquean una callable con Admin SDK. El
  inventario staging del 2026-10-11 no mostró la callable legacy
  `registrarCompraOperativaV1`; esta condición es por proyecto y debe repetirse
  antes de cualquier corte en otro proyecto.
- No hay instrumentación de cobertura de líneas para las Rules; la matriz
  explícita anterior es la cobertura relevante del evaluador. La prueba de
  compatibilidad remota tras el deploy y todo despliegue de Rules siguen
  pendientes de sus gates/autorizaciones.
- No se hicieron cambios remotos, deploys, escrituras de datos, cambios de IAM,
  Secrets o Rules en Firebase.
