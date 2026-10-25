# TDD — Preflight dirigido de Functions para Diana

**Goal / Milestone / Epic:** G-SAAS-02 / M2 / E2.2 Configuración inicial

**Alcance:** comparar el inventario de tres Functions relacionadas con oferta y Bootstrap en producción contra sus codebases/exportaciones versionados. Es de solo lectura y no autoriza ni ejecuta despliegues o escrituras.

## Ciclo TDD

| Etapa | Evidencia | Resultado |
|---|---|---|
| RED | Commit `c73497d`; `npx tsx --test scripts/g-saas-02/diana-production-functions-preflight.test.ts` falló porque el módulo aún no existía. | Falla atribuible a la implementación ausente. |
| GREEN | Commit `286d6cd`; misma suite ejecutada con el core y parser de exports: 11/11. | Verifica allowlist, proyecto, codebase, exports exactos, estado, región, Gen2 y funciones duplicadas o inesperadas. |

## Límites comprobados por diseño

- El CLI fija el proyecto `micafe-pos`; nunca toma un proyecto como argumento.
- La lectura remota se limita a `name`, `labels`, `state` y `environment` con `gcloud functions list`.
- El output incluye `readOnly: true`, `deploymentStarted: false` y `releaseAuthorized: false`.
- `INVENTORY_CONSISTENT` significa únicamente que la comparación estructural no encontró bloqueos; no prueba una migración reversible, el release, Rules, App Hosting, identidad ni habilitación de Diana.
- La evidencia operativa del CLI queda separada de los tests unitarios y debe registrar fecha de consulta y SHA local sin incluir secretos.

## Validación

- `npx tsx --test scripts/g-saas-02/diana-production-functions-preflight.test.ts`: 11/11 PASS.
- `npm run g-saas-02:diana-production-functions-preflight`: `INVENTORY_CONSISTENT`, consultado el `2026-10-25T01:03:03Z`; las dos Functions existentes aparecen todavía con etiqueta `saas-auth` y la consulta de oferta está ausente. La lectura no incluyó configuración de runtime ni secretos.
- `npx tsc --noEmit`: PASS.
- La lectura confirma solo el inventario y el mapeo estático del worktree; no demuestra que la migración de codebase sea segura ni reversible.
