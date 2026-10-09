# G-SAAS-02 / M2 / E2.2 — Gate F: nombres de vendedores en reportes

## Hallazgo

En la revisión autenticada del reporte semanal de Backoffice, las filas «Por
Vendedor» mostraron UIDs completos en lugar de nombres. La causa quedó
demostrada en el flujo: `generarReporteVentas` toma `cajeroNombre` del snapshot
y usa `cajeroId` cuando ese snapshot falta; la página renderizaba ese resultado
directamente.

## Corrección candidata

La página resuelve el actor con la precedencia existente: snapshot histórico,
perfil actual del tenant y, si no hay nombre, una referencia abreviada con los
últimos seis caracteres del UID. Un identificador ausente se muestra como
«Vendedor sin identificar».

Los perfiles se obtienen mediante `suscribirUsuarios` y `/api/usuarios/tenant`,
que valida identidad, rol y membresía administrativa activa y proyecta los
perfiles de membresías del tenant. No se añade lectura cliente de perfiles
globales ni se modifica autoridad, persistencia o datos de ventas (ADR-SAAS-037).

## TDD y validaciones locales

- RED: `npx tsx --test lib/__tests__/reportes-vendedores.test.ts` falló porque
  faltaba el módulo de resolución.
- GREEN: `npm run test:reportes` — `9/9 PASS`.
- ESLint dirigido a la página, helper y prueba — `PASS`.
- `npx tsc --noEmit` — `PASS`.
- `npm run build` — `PASS` (49 páginas generadas).
- Cobertura dirigida del helper: 97,01 % líneas, 94,12 % ramas y
  96,43 % funciones; `lib/reportes-vendedores.ts`: 100 % en las tres métricas.
- `git diff --check` — `PASS`.

Checkpoints TDD en la rama `codex/e2-2-gatef-report-vendor-names`:
`b103af4` (RED) y `d2ded2c` (GREEN).

## Límite de esta evidencia

Esta evidencia corresponde a la rama y sus validaciones locales. Aún falta
CI, merge y comprobación visual autenticada del Preview de esta corrección.
No constituye `PASS` de Gate F ni reemplaza la matriz funcional integral.

## Auditoría de mutaciones

- Código y documentación locales en rama dedicada: cambios limitados a la vista
  de reportes, helper, pruebas, script de prueba y este registro.
- Staging/Firebase, Firestore, Auth, Rules, Functions, Scheduler, IAM, Secrets,
  fixture, tenant real y producción: sin cambios.
