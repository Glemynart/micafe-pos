# ADR-SAAS-077 — reglas de lectura de vendedor por vertical

## Alcance y journeys

No se proporcionó un plan separado; los casos se derivan del ADR-SAAS-077
aceptado y del contrato existente de `GENERAL + vendedor -> LEGACY`.

1. Como vendedor `GENERAL`, puedo consultar productos, clientes, ventas e
   historial de turnos de mi tenant para que las pantallas LEGACY sigan
   funcionando.
2. Como vendedor `BODEGA_MVP1`, no puedo saltarme las callables/DTOs leyendo
   directamente productos, clientes o ventas; sigo limitado a mi propio turno.
3. Ningún vendedor gana acceso a documentos de otro tenant.

## Ciclo RED/GREEN

| Etapa | Commit | Validación | Resultado |
|---|---|---|---|
| RED | `13a9f42` | `firebase --project demo-mt-u4-rules emulators:exec --only firestore "node --import tsx --test firestore-rules/role-invariants.test.ts"` | 10/11 pasaron; el caso `GENERAL + vendedor` falló al listar `/productos` (`false for 'list' @ L107`), la incompatibilidad esperada. La suite Rules completa falló 1 de 43 por el mismo caso. |
| GREEN | `6cb6a55` | Mismo comando dirigido | 11/11 pasaron después de condicionar las lecturas al vertical. |
| Refuerzo de consulta Bodega | `e8b1a0c` | Mismo comando dirigido | 11/11 pasaron; además de `get`, los queries de vendedor Bodega a productos, clientes y ventas siguen denegados. |
| Regresión Rules | `e8b1a0c` | `npm run test:rules` | 43/43 pasaron; 0 fallas, cancelaciones o skips. |

## Garantías

| # | Garantía | Prueba | Tipo | Resultado |
|---|---|---|---|---|
| 1 | `GENERAL + vendedor` puede listar, con filtro de tenant, productos, clientes activos, ventas e historial de turnos de otros cajeros. | `firestore-rules/role-invariants.test.ts` — `GENERAL: vendedor conserva las lecturas directas que usa POS LEGACY` | Firestore Rules Emulator | PASS |
| 2 | `BODEGA_MVP1 + vendedor` no puede obtener ni listar productos, clientes o ventas; la lectura de ledger sigue denegada y solo puede obtener su turno. | `firestore-rules/role-invariants.test.ts` — casos `Bodega` y `Bodega U2-A` | Firestore Rules Emulator | PASS |
| 3 | La lectura tenant-aware y permisos administrativos existentes permanecen cubiertos por la suite completa. | `firestore-rules/tenant-core.test.ts`, `firestore-rules/role-invariants.test.ts` | Firestore Rules Emulator | PASS |

## Cobertura y límites

- La suite cubre decisiones `get` y `list/query`; no aplica una métrica de
  cobertura de líneas a Firestore Rules.
- `npm run e2e:bodega-u4-u5` no llegó a iniciar: el worktree aislado no tiene
  `functions/node_modules/typescript/bin/tsc`. El runner requiere además
  dependencias TypeScript locales en los codebases Functions; no se instalaron
  paquetes para evitar convertir esta validación en una operación de setup
  extensa. La CI del PR deberá ejecutar sus categorías configuradas antes del
  merge.
- Esta implementación no resuelve el drift completo de 14 paths ni propone un
  corte productivo. El análisis read-only, la matriz de consumidores y el plan
  reversible siguen siendo precondiciones independientes antes de cualquier
  deploy de Rules.
- No se desplegaron Rules/Functions ni se hicieron escrituras en staging o
  producción.

## Addendum Gate I — 2026-10-14

Se amplió la evidencia de compatibilidad, sin cambiar `firestore.rules`:

| Garantía | Prueba añadida | Resultado |
|---|---|---|
| Admin Bodega/GENERAL puede leer por documento y consulta tenant-scoped presentaciones y ledger; vendedores de ambos verticales no pueden hacerlo. | `Gate I: el ledger y las presentaciones excluyen vendedores en ambos verticales` | Firestore Rules Emulator — PASS |
| Ventas son read-only para todos los roles, incluyendo consultas tenant-scoped; el writer legado de metadatos DIAN no puede persistir mediante `update` o `setDoc` merge. | `Gate I: las ventas son read-only y metadatos DIAN no se escriben desde cliente` | Firestore Rules Emulator — PASS |

`npm run test:rules`: 45/45 pruebas pasaron, 0 fallas, cancelaciones o skips.
El proyecto de Emulator fue `demo-mt-u4-rules`; no se usaron credenciales ni
conexión a Firebase productivo. La denegación de DIAN es intencional en Rules,
pero su impacto en cualquier tenant productivo que use fiscalidad debe
conciliarse antes de un corte global.
