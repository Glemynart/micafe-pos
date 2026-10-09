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
últimos seis caracteres del UID. Los nombres históricos PascalCase se conservan
aunque sean largos; UIDs cortos que no se pueden abreviar sin mostrarlos completos
se sustituyen por «Vendedor sin identificar».

Los perfiles se obtienen mediante `suscribirUsuarios` y `/api/usuarios/tenant`,
que valida identidad, rol y membresía administrativa activa y proyecta los
perfiles de membresías del tenant. No se añade lectura cliente de perfiles
globales ni se modifica autoridad, persistencia o datos de ventas (ADR-SAAS-037).

## TDD y validaciones locales

- RED: `npx tsx --test lib/__tests__/reportes-vendedores.test.ts` reprodujo que
  un nombre PascalCase largo se ocultaba y un UID de cinco caracteres se mostraba
  completo como sufijo.
- GREEN: `npm run test:reportes` — `10/10 PASS`.
- ESLint dirigido a la página, helper y prueba — `PASS`.
- `npx tsc --noEmit` — `PASS`.
- `npm run build` — `PASS` (49 páginas generadas).
- `git diff --check` — `PASS`.

El checkpoint RED está en el historial de la rama; la corrección GREEN contiene
el ajuste de clasificación de snapshots y el límite seguro de abreviación.

## Límite de esta evidencia

Esta evidencia corresponde a la rama y sus validaciones locales. La CI requerida,
el merge y la comprobación visual autenticada del Preview siguen siendo condiciones
de cierre del PR. No constituye `PASS` de Gate F ni reemplaza la matriz funcional
integral.

## Auditoría de mutaciones

- Código y documentación locales en rama dedicada: cambios limitados a la vista
  de reportes, helper, pruebas, script de prueba y este registro.
- Staging/Firebase, Firestore, Auth, Rules, Functions, Scheduler, IAM, Secrets,
  fixture, tenant real y producción: sin cambios.
