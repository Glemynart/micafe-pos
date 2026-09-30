# G-SAAS-02 / M2 / E2.2 — atestación local de `saas-bodega`

Fecha: 2026-09-30
Alcance: implementación local únicamente; no es evidencia de deploy, tráfico,
fixture, Bootstrap, Activation ni producción.

## Identidad reproducible

- Base: `e63365fc456264cd01690da195d4e0e229e54ae9`.
- Commit de implementación: `c74f51a0373d9194bfea7550ae2ab399c045b8c0`.
- Codebase: `saas-bodega` → `functions-bodega`.
- Runtime declarado: Node.js 22.
- Modelo: Cloud Functions Gen2 callable, `us-central1`.
- Lockfile SHA-256:
  `66D1619F1C5F2E4108C75234B755686D7D461716D57AE1C6D67C76494035F0F5`.
- Entry point compilado SHA-256:
  `1DB42999EB248C4D98FED19BAF39A7AEA106AF1CBB20FE3E1F52734F5560970D`.

El segundo hash corresponde al resultado local de `npm run build` desde
`functions-bodega`; no es un digest de imagen ni una atestación remota.

## Superficie descubierta

La discovery local declaró exactamente cinco callables y ningún scheduler ni
endpoint adicional:

1. `crearClienteVendedorV1`
2. `crearPresentacionComercialV1`
3. `actualizarPresentacionComercialV1`
4. `crearArticuloInventarioV1`
5. `confirmarVentaBodegaV1`

Las cinco son Gen2 callables con región `us-central1`. El manifiesto declara
`params: []`: `saas-bodega` tiene cero Secrets.

## Closure y preservación

La frontera compone únicamente autoridad tenant neutral, reader de
configuración, núcleo operacional neutral de idempotencia/auditoría, ledger de
inventario, identificadores de turno y los ejecutores Bodega ya certificados.

El audit de imports de la closure no encontró importaciones de
`functions/src/index.ts`, `operational-auth`, `configuracion/service`,
`finanzas/callables`, `defineSecret`, Wompi, Dusema, Bootstrap, commercial ni
email. Las cinco exportaciones legacy permanecen en `saas-auth`; no hay
cutover en esta evidencia.

## Validaciones reproducidas

Ejecutadas desde el commit de implementación:

- `npm ci --ignore-scripts` y `npm ci --dry-run --ignore-scripts` en
  `functions-bodega`: PASS.
- `npm run build` en `functions-bodega`: PASS.
- `npm test`, `npm run test:discovery` y `npm run test:module-load` en
  `functions-bodega`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- `npm run build:functions`: PASS.
- `npm run test:auth-foundation`: 368 PASS, 5 skips esperados, 0 FAIL.
- `git diff --check`: PASS antes de versionar la implementación.

No se ejecutó dry-run contra Firebase ni operación remota, conforme al alcance
de implementación local. La atestación de Git → build → artefacto remoto →
revisión queda explícitamente pendiente de un gate de preflight/deploy
autorizado posterior.

## Mutation audit

- Deploy, tráfico, Firebase remoto, Firestore/Auth/Rules/IAM/Secrets: 0.
- Fixture, Bootstrap, Activation, producción: 0.
- La única mutación externa a archivos locales fue la creación de la rama y el
  commit de implementación identificado arriba.
