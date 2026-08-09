# Modelo de CI y release gate

## Propósito

La CI mantiene una barrera contra regresiones sin repetir certificaciones
pesadas en cada cambio. El modelo no modifica el dominio, las Rules, las
autoridades server-side ni ningún entorno productivo.

## Perfil PR/main

`.github/workflows/ci.yml` conserva el check estable `Tipos y pruebas` para
evitar checks pendientes. `scripts/ci/changed-scope.mjs` clasifica el diff con
un fallback seguro: un archivo desconocido se considera cambio de runtime.

Para cambios de código se ejecutan TypeScript, build, Functions, lint, tests
unitarios, Auth/Firestore, Firestore Rules, Storage Rules, preflight y los
contratos tenant-aware. Las certificaciones E2E P0/P1 y B2/B3 solo se ejecutan
cuando la superficie modificada las puede afectar. Un cambio exclusivamente
documental ejecuta el contrato de CI y `git diff --check`, y termina en éxito
explícito sin ejecutar la batería funcional.

Las cinco certificaciones que componen E4.1 no se ejecutan además de forma
individual en este perfil. El smoke P0-01 y los cortes afectados siguen
disponibles en PR/main mediante la clasificación de cambios.

## Release gate

`.github/workflows/release-gate.yml` se ejecuta mediante `workflow_dispatch` o
al crear un tag `v*`. Es el único perfil que declara una release válida y
ejecuta, sin compartir emuladores entre suites:

- E4.1 completo, incluidos P0-01, P0-06, P1-02, P1-04 y P0-10;
- Operator Portal;
- R1-A web, PWA y Electron;
- Rules, Storage, Auth/Firestore, B2 y B3;
- evidencia y auditoría E4.2.

El release gate construye Functions una vez y exporta
`E2E_SKIP_FUNCTIONS_BUILD=1`. Los runners siguen comprobando que
`functions/lib/functions/src/index.js` exista antes de iniciar, pero no vuelven a compilar
el mismo artefacto dentro de cada corte.

Una release no puede declararse válida si E4.1, Operator Portal, R1-A o la
auditoría E4.2 fallan o no se ejecutan. La integridad del contrato se verifica
con `npm run test:e4-02:contract`.

## Fuera de alcance

Este modelo no elimina suites críticas, no comparte fixtures entre emuladores,
no cambia lógica de producto y no certifica hardware, DIAN, Wompi, offline ni
notificaciones, que continúan siendo gates externos o posteriores según el
Goal.
