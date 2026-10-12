# TDD — Dependencias runtime de Functions para G-SAAS-02

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`, preparación de Gate I.
- **Alcance:** cerrar avisos altos/críticos en cinco codebases Functions de
  producción sin cambiar código de negocio, APIs, datos ni configuración de
  Firebase. Se mantienen los rangos principales y se fijan tres dependencias
  transitivas en versiones corregidas; `functions-commercial` solo necesita
  el override de `@grpc/grpc-js`.

## RED / GREEN

| Etapa | Validación | Resultado |
|---|---|---|
| RED | `npm audit --omit=dev --json` en los cinco lockfiles antes del cambio | `functions-commercial`: 1 high; `functions-dusema-binding`: 2 high y 1 critical; `functions-operator-summary`, `functions-platform-context` y `functions-platform-resources`: cada uno 2 high y 1 critical. |
| GREEN | `npm audit --omit=dev --audit-level=high` después del cambio | Los cinco codebases quedan con 0 high y 0 critical. Persisten solo moderadas: 2 en comercial, 6 en Dusema y 2 en cada codebase de plataforma; no se afirma que el audit completo esté limpio. |

## Validación local

- `npm ci --no-audit --no-fund` — PASS en los cinco codebases.
- `npm ci --no-audit --no-fund` en la raíz y en `functions` — PASS; requisito
  del checkout para compilar los módulos compartidos.
- `npm run build` — PASS en `functions-commercial`, `functions-dusema-binding`,
  `functions-operator-summary`, `functions-platform-context`,
  `functions-platform-resources` y `functions`.
- `npm run test:discovery` — PASS en los cinco codebases, 1/1 en comercial y
  Dusema, 3/3 en cada codebase restante.
- `npm run test:module-load` en `functions-platform-resources` — PASS, 1/1.
- `git diff --check` — PASS.

Las pruebas de descubrimiento de `saas-auth` requieren compilar e instalar las
dependencias compartidas de raíz; el primer intento antes de esa preparación
falló localmente. Tras `npm ci` de raíz y `npm run build --prefix functions`,
las suites completas pasaron.

## Límite de evidencia

Esto es una corrección de dependencias, no un despliegue. No se tocaron Firebase
Rules, IAM, Secrets, datos, tráfico ni proyectos de staging/producción. La
aceptación de CI del PR y cualquier despliegue siguen pendientes. Las
vulnerabilidades moderadas se conservan explícitamente fuera de este cambio;
las versiones vulnerables identificadas de severidad high/critical ya no están
en el grafo runtime de estos cinco codebases.
