# E2.2 — Validación de source maps de servidor

## Alcance

PR aislado de almacenamiento para `G-SAAS-02 → M2 → E2.2`, basado en
`origin/main` `4d63a416d1f024adb7b6760759e8f35771fa645e`.

- Activa únicamente `experimental.serverSourceMaps: false` en Next.js 16.4.0.
- No cambia `productionBrowserSourceMaps`; conserva su valor por defecto (`false`).
- No modifica rutas API, Functions, Firebase, Rules, contratos ni lógica de
  negocio.
- No es una medición de Vercel ni acredita espacio liberado en Deployment
  Storage o Functions Storage.

## Validez de la opción

La definición instalada de `next/dist/server/config-shared.d.ts` declara
`experimental.serverSourceMaps?: boolean` como la opción que habilita los
source maps del bundle de servidor de producción. El build con la opción en
`false` la reporta como experimento efectivo.

## Medición local reproducible

Procedimiento, con `npm ci` en raíz y `functions`, sobre un worktree limpio:

1. Ejecutar `npm run build` sin la opción.
2. Medir archivos bajo `.next`, excluyendo `.next/cache`.
3. Activar `experimental.serverSourceMaps: false`.
4. Repetir `npm run build` y la misma medición.

| Métrica | Referencia | Con cambio | Diferencia |
| --- | ---: | ---: | ---: |
| `.next` sin caché | 51,731,126 B | 18,865,654 B | -32,865,472 B |
| `.next/server` | 45,556,525 B | 13,240,753 B | -32,315,772 B |
| Mapas de servidor | 397 / 32,288,626 B | 0 / 0 B | -397 / -32,288,626 B |
| Output bajo `server/app/api` | 70 / 1,268,422 B | 60 / 1,267,892 B | -10 / -530 B |
| `public` | 10,097,566 B | 10,097,566 B | 0 B |

La diferencia de `.next` no equivale a ahorro facturable de Vercel: la
retención, deduplicación y composición final del deployment se verifican solo
después de un despliegue autorizado mediante Usage oficial.

## Rutas y tracing inspeccionados

Las nueve rutas de mayor traza permanecen en el output tras el cambio:

- `notifications/send`
- `public/eventos`
- `pwa/manifest`
- `reservas/cancelar`
- `reservas/disponibilidad`
- `reservas/hold`
- `reservas/salas`
- `turnos/candidatos-relevo`
- `usuarios/tenant`

Cada una conserva entre 1,166 y 1,167 archivos en su `.nft.json`. La causa
principal común es la ruta hacia Firebase Admin/Firestore: `@google-cloud/firestore`
(190 archivos), `@grpc/grpc-js` (178), `firebase-admin` (100), `google-gax`
(99), `jose` (85) y `@opentelemetry/api` (45). No se excluyó ningún archivo:
la fase posterior debe analizar cada ruta por separado antes de proponer una
exclusión específica y probada.

## Validaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `npx tsx --test next.config.test.ts` | PASS (RED previo: la opción era `undefined`; GREEN: `false`) |
| `npm run build` | PASS, antes y después; las nueve rutas siguen presentes |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run test:eventos-publicos` | PASS (3 pruebas) |
| Pruebas de rutas de reservas y webhook | PASS (17 pruebas) |
| `npm run build:functions` | PASS |
| `npm run test:auth-foundation` | PASS |
| `npm run e2e:purchase-cut` | PASS (2 pruebas en Firestore Emulator) |

La primera ejecución de las validaciones de Functions falló antes de instalar
las dependencias del subproyecto en este worktree; el fallo fue
`firebase-functions` no encontrado. Después de `npm --prefix functions ci
--ignore-scripts`, build y suite pasaron sin cambios de código.

## Riesgo y siguiente paso

Se reduce la capacidad de depurar stack traces de producción con mapas de
servidor. Los mapas de navegador permanecen desactivados como antes. No hay
despliegue ni publicación asociada a este PR. Tras integración y despliegue
expresamente autorizados, se debe comparar la medición oficial de Usage de
Vercel y verificar que producción, el candidato de Diana y sus aliases sigan
correctos.
