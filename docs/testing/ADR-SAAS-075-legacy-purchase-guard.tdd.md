# Evidencia TDD — ADR-SAAS-075: bloqueo de compra legacy para Bodega

## Alcance aprobado

ADR-SAAS-075, Opción 1: `registrarCompraOperativaV1` rechaza únicamente el
vertical canónico `BODEGA_MVP1`, preserva la ruta actual para otros verticales
y aplica el rechazo también al replay antes de devolver un recibo previo. No
se autorizó deploy, Rules, IAM, Secrets, compras remotas, datos ni tenant real.

## Ciclo RED/GREEN

| Etapa | Commit | Comando | Resultado |
|---|---|---|---|
| RED | `c7153b9` | `tsx --test src/finanzas/compras.test.ts` | 14/16 pasaron; los dos casos nuevos fallaron con `Missing expected rejection`, confirmando que la callable legacy aceptaba tanto la compra Bodega nueva como el replay. |
| GREEN | `fa7d9f0` | `tsx --test src/finanzas/compras.test.ts` | 16/16 pasaron. |

## Garantías verificadas

| Comportamiento | Prueba | Resultado |
|---|---|---|
| Compra nueva Bodega por la callable legacy es rechazada con `BODEGA_USE_CANONICAL`. | `functions/src/finanzas/compras.test.ts` — “la callable legacy rechaza una compra nueva de Bodega sin efectos parciales” | PASS; el mapa Firestore queda idéntico al estado previo. |
| Un replay legacy se vuelve a contrastar con el vertical vigente y no devuelve el recibo a Bodega. | `functions/src/finanzas/compras.test.ts` — “la callable legacy revalida Bodega antes de devolver un replay” | PASS; compra y movimiento previos permanecen intactos y no se agregan efectos. |
| La ruta general sigue funcionando. | `functions/src/finanzas/compras.test.ts` — P0-12 y preparación del replay desde `GENERAL` | PASS. |
| La compra canónica aislada, autoridad e idempotencia mantienen su contrato. | `functions/src/finanzas/compras.test.ts` | PASS. |

La barrera lee `configuraciones/{empresaId}` dentro de la transacción tanto para
el efecto nuevo como para el replay. Solo cuando el campo canónico es exactamente
`BODEGA_MVP1` produce `failed-precondition` y el mensaje indica usar
`registrarCompraBodegaV1`. Para otros valores o configuración ausente no cambia
el comportamiento legacy existente.

## Validaciones ejecutadas

- Pruebas financieras: `tsx --test` sobre `functions/src/finanzas/*.test.ts` —
  61 pruebas; 59 PASS, 2 SKIP, 0 FAIL.
- Suite completa `npm test` en `functions/` — 440 pruebas; 435 PASS, 5 SKIP,
  0 FAIL.
- Build `npm run build` en `functions/` — PASS (`tsc -p tsconfig.json`).
- Cobertura diagnóstica:
  `node --experimental-test-coverage --import tsx --test src/finanzas/compras.test.ts`
  — `compra-core.ts`: 97.67% statements, 73.60% branches y 100% functions.
  Los escenarios nuevos verifican el rechazo Bodega para operación nueva y
  replay, además de la continuidad del flujo GENERAL ya cubierto por la suite.
  Esta es cobertura agregada de `compra-core.ts`; no atribuye el porcentaje de
  ramas restante a una zona concreta. `functions/package.json` no define un
  umbral/script de coverage.

## Límites pendientes

Los resultados anteriores son locales y no certifican despliegue ni conducta
remota. Se requiere Gate C específico para el codebase `saas-auth`, incluyendo
artefacto, closure de dependencias, Secrets, delta, coexistencia y rollback;
Gate D y validaciones posteriores requieren autorización operativa específica.
No se cambiaron servicios remotos ni producción.
