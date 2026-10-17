# Evidencia TDD — Navegación de ofertas comerciales en producción

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`  
**Alcance:** hacer descubrible la pantalla de ofertas a operadores con `COMERCIAL_GOBERNAR`; sin escrituras comerciales ni cambios remotos.

## Journey y garantía

- Un operador autorizado para gobernar el área comercial ve “Ofertas comerciales” en la navegación del Backoffice, tanto en producción como en staging.
- Un operador sin `COMERCIAL_GOBERNAR` no ve esa ruta. La callable conserva su autorización canónica; la navegación no concede facultades.

## RED / GREEN

- **RED (compile-time):** se añadió primero el test del contrato de navegación y `npm run test:backoffice-ui` falló al importar `./platform-navigation`, que aún no existía. Los otros 19 tests pasaron. Esta señal confirma que el nuevo contrato aún no estaba implementado; no se presenta como una prueba de navegador del comportamiento anterior.
- **GREEN:** tras extraer la navegación a un selector puro y quitar la condición exclusiva de staging, `npm run test:backoffice-ui` pasó 22/22. La cobertura focalizada pasó con 100 % de líneas, 93,75 % de ramas y 100 % de funciones para `platform-navigation.ts`.

## Evidencia ejecutada

| Garantía | Validación | Resultado |
|---|---|---|
| El enlace comercial se ofrece al operador que tiene la facultad | `npm run test:backoffice-ui` | PASS (22/22) |
| La ruta queda oculta sin `COMERCIAL_GOBERNAR` | `npm run test:backoffice-ui` | PASS |
| El selector ya no depende del proyecto Firebase | `components/backoffice/platform-navigation.test.tsx` | PASS |
| Tipos de la aplicación | `npx tsc --noEmit` | PASS |
| Build de Next.js | `npm run build` | PASS (Next.js 16.4.1) |
| Lint de los archivos afectados | `npx eslint components/backoffice/platform-shell.tsx components/backoffice/platform-navigation.ts components/backoffice/platform-navigation.test.tsx` | PASS |
| Cobertura focalizada | `node --experimental-test-coverage --import tsx --test components/backoffice/platform-navigation.test.tsx` | PASS (100 % líneas, 93,75 % ramas, 100 % funciones del selector) |
| Integridad del diff | `git diff --check` | PASS |

## Límites

No se ejecutó un E2E de navegador ni una sesión productiva autenticada. El cambio solo muestra la entrada conforme a la facultad efectiva del contexto; no prueba ni altera la autorización del endpoint, la persistencia de la oferta o el rollout. No se modificaron dependencias; `npm ci` informó 11 advisories ya contenidos en el lockfile (4 moderados, 7 altos), sin ejecutar `npm audit fix`.
