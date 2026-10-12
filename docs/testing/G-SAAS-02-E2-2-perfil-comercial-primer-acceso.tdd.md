# Evidencia TDD — Perfil comercial Bodega de primer acceso

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`
**ADR:** `ADR-SAAS-073` (ACEPTADO)
**Alcance:** PR de implementación; sin deploy, cambios de Rules/IAM/Secrets, tenant real ni escrituras remotas.

## Journeys

- Un administrador activo de Bodega completa los datos comerciales y continúa en DEMO, sin habilitar readiness fiscal.
- Repetir el mismo comando no duplica revisiones, auditoría ni eventos.
- Vendedores, otros verticales y administradores con perfil ya completo no quedan interceptados.
- El servidor usa el tenant autenticado, rechaza roles/estados/entradas inválidas y no filtra PII en auditoría.

## RED / GREEN

- **RED:** el esqueleto inicial falló porque el handler todavía no existía; eso fue solo un fallo de scaffolding y no se cuenta como evidencia TDD. Después se agregó una aserción de comportamiento para rechazar dirección demasiado larga y etiquetas territoriales vacías. Antes de la corrección de validación, el test falló con `Missing expected rejection`, confirmando que el servidor aceptaba esos datos.
- **RED (build web):** el primer Preview de Vercel (`dpl_2pAD9MY9igBZbjQNmKZCZTVmVrLJ`, commit `bf3e092`) compiló Next y falló en su typecheck al incluir `functions-tenant-profile/src` y sus imports compartidos, que dependen del `firebase-functions` instalado por el lockfile aislado, no por `npm ci` raíz. La nueva prueba de discovery falló primero porque el `tsconfig.json` raíz no excluía ese codebase.
- **GREEN:** el servidor ahora valida texto canónico, requerido y acotado antes de crear operaciones; se agregó el caso de teléfono inválido y límites del perfil al formulario. El primer ensayo del Emulator también encontró una aserción demasiado amplia: el DV de un carácter coincidía incidentalmente con otros números de auditoría. Se afinó para comprobar NIT, email, dirección y NIT-DV completos; luego pasó. El `tsconfig.json` raíz ahora excluye el paquete aislado y su test verifica que conserva su typecheck independiente. El typecheck y build local de la app, además del build y tests del paquete, pasan; el nuevo Preview de Vercel debe confirmar la corrección antes del merge.
- **E2E:** el primer recorrido encontró que el fixture no incluía `empresas.revision`, que el Bootstrap sí inicializa en `1`; se corrigió el fixture para representar la forma real del documento. También se retiró una aserción de admin GENERAL que excedía este ADR y no correspondía a la ruta observada. El segundo recorrido completó los 12 escenarios.

## Evidencia ejecutada

| Garantía | Validación ejecutada | Resultado |
|---|---|---|
| Discovery declara exactamente una callable Gen2, sin Secrets | `npm test` en `functions-tenant-profile` | PASS |
| Typecheck web no absorbe el codebase Functions aislado, cuyo paquete mantiene compilación propia | `npm run test:discovery --prefix functions-tenant-profile`; `npx tsc --noEmit`; `npm run build` | PASS local; Preview corregido pendiente |
| Núcleo transaccional: tenant autenticado, admin Bodega, NIT-DV, validaciones, revisionado, replay y gate de rol/vertical | `npm test` en `functions-tenant-profile` | PASS |
| Carga de módulo sin consultas Firestore/Auth ni secretos | `npm test` en `functions-tenant-profile` | PASS |
| Escritura atómica en configuración/Empresa, DEMO intacto, readiness fiscal pendiente, replay sin duplicación y auditoría sin PII | `npx firebase --project demo-tenant-profile emulators:exec --only firestore "npm --prefix functions-tenant-profile run test:emulator"` | PASS (1 prueba) |
| Regresiones de configuración | `npm run test:configuracion` | PASS (52 pruebas) |
| Fundación de Functions y servicios compartidos | `npm run test:auth-foundation` | PASS (435 pasaron, 5 omitidas por condiciones de suite; 0 fallidas) |
| Tipos de la aplicación | `npx tsc --noEmit` | PASS |
| Build de la app | `npm run build` | PASS |
| Build de Functions existente | `npm run build:functions` | PASS |
| Lint del cambio | `npx eslint 'components/tenant-profile/commercial-profile-gate.tsx' 'lib/configuracion/perfil-comercial.ts' 'functions/src/tenant-profile/handler.ts' 'functions-tenant-profile/src/*.ts' 'app/(tenant)/admin/(authenticated)/layout.tsx'` | PASS |
| E2E local: primer acceso, reingreso DEMO, perfil previo Bodega, ventas e invariantes generales existentes | `npm run e2e:bodega-u4-u5` (emuladores Auth/Firestore/Functions + navegador) | PASS (12/12; 2.3 min) |
| Cobertura del handler y el predicado de completitud comercial | `node --experimental-test-coverage --import tsx --test src/*.test.ts` en `functions-tenant-profile` | PASS: handler 98,59 % líneas / 91,53 % ramas / 100 % funciones; `perfil-comercial.ts` 100 % líneas / 95,45 % ramas / 100 % funciones |

## Cobertura y límites

La cobertura directa del handler y del predicado supera el 80 % por métrica relevante; la cobertura global del proceso incluye servicios compartidos que se validan por sus suites propias y no se atribuye al perfil comercial. El build TypeScript del nuevo codebase pasó y la prueba Firestore Emulator pasó (1/1).

El E2E requerido por ADR-SAAS-073 se ejecuta localmente con los emuladores en CI y no necesita un deploy remoto. La certificación funcional del namespace servido en staging queda para Gate C/D posterior; no se considera certificado el Gate F/H ni se afirma comportamiento remoto. Gate C debe cerrar primero el artefacto, dependencias, Secrets, delta/coexistencia y rollback; el deploy necesita autorización operativa independiente.
