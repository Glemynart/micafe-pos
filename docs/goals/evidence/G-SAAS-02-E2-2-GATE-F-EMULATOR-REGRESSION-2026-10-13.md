# G-SAAS-02 / M2 / E2.2 — Regresión local Bodega en Emulator — 2026-10-13

- Fecha de ejecución y revisión: 2026-10-13 (America/Bogota).

## Contexto y límites

Esta evidencia conserva dos ejecuciones locales de regresión sobre el código de
Bodega contenido en el HEAD del PR #581 (`7d0b2c43e50e8c2b584f48f68083c9be3810a180`,
basado en `main @ 1f44b632`). PR #581 fue documental; el código probado es el
mismo que integra `main @ 5877c478` tras su merge.

Los runners seleccionan explícitamente proyectos `demo-*` y levantan Firebase
Emulator local. No son pruebas del proyecto `micafe-pos-staging`, del preview de
Vercel ni de producción. No se registraron compras, ventas o inventario remoto.
Por tanto, estos resultados complementan la regresión, pero no cierran Gates D,
F, G o H ni sustituyen la validación funcional del namespace ADR-SAAS-076 en
staging.

## Ejecuciones y resultados

| Comando | Entorno | Resultado |
| --- | --- | --- |
| `npm run e2e:bodega-agenda` | Firestore Emulator, `demo-bodega-agenda` | `PASS`: 8/8 tests; concurrencia de reservas y ventas, hold/replay, aislamiento de tenant/actor, estados inactivos y paginación. |
| `npm run e2e:bodega-u4-u5` | Auth, Firestore y Functions Emulator; Playwright local, `demo-bodega-u4-u5-ui` | `PASS`: 12/12 tests; solicitud/aprobación/cobro, retry, efectivo sin turno, aislamiento A/B, perfil inicial, turnos, sincronización viva y operaciones UI de Bodega. Duración reportada: 3,7 min. |
| `npm test --prefix functions-tenant-profile` | Tests locales del codebase `saas-tenant-profile`; sin Emulator activo | `PASS`: 12 pasaron, 1 test de Firestore Emulator omitido por no estar configurado, 0 fallidos. Incluye gate admin/perfil, validación de payload, autoridad tenant, revisión/idempotencia y discovery de una callable sin Secrets. |

Las ejecuciones se realizaron desde el worktree de staging con Node.js 22.23.2.
Para el segundo runner se instalaron las dependencias faltantes exclusivamente
desde los `package-lock.json` existentes de `functions-operational-auth` y
`functions-tenant-configuration`; no se modificaron manifiestos ni lockfiles.

## Advertencias observadas

Durante las suites, los emuladores registraron `MetadataLookupWarning` y un
intento fallido de obtener `OPERATIONAL_PIN_PEPPER` en Secret Manager para el
proyecto demo (`403`). Ningún valor de Secret se obtuvo; los tests continuaron
con las variables locales y finalizaron con código de salida `0`. Esta
advertencia no se interpreta como prueba de acceso ni despliegue remoto; conviene
mantenerla visible si se usa la salida completa del Emulator como evidencia.

## Resultado para los gates

- Regresión local de agenda/reservas: `PASS` (8/8).
- Regresión local POS/Backoffice Bodega: `PASS` (12/12).
- Gate D funcional en el preview compatible: `PENDING`; el smoke actual no ha
  superado el formulario de perfil comercial inicial, cuyo último guardado
  devolvió HTTP `400` después de que el índice requerido quedó `READY`. La
  causa sigue sin determinarse y el listado autenticado de Compras tampoco se
  ha verificado. Véase la [evidencia de deploy y smoke Gate D](G-SAAS-02-E2-2-GATE-D-ADR076-STAGING-DEPLOY-2026-10-12.md).
- Gates F/G/H en `micafe-pos-staging` y namespace ADR-SAAS-076: `NOT EXECUTED`
  por esta evidencia y continúan pendientes de revalidación remota.
- Gate I, tenant real, Trial y catálogo real: no cambiaron.
