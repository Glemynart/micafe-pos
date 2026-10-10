# Gate I — Evidencia del arreglo de copia de credenciales (2026-10-10)

## Alcance

Vinculado a `G-SAAS-02` → `M2` → `E2.2`, onboarding de operadores en Gate I.
Los botones de credenciales afirmaban que copiaron antes de resolver
`navigator.clipboard.writeText`; los rechazos del navegador quedaban ocultos.

## Recorrido y garantías

| # | Garantía | Prueba | Resultado |
|---|---|---|---|
| 1 | Solo se informa éxito cuando el portapapeles acepta el texto exacto. | `credential-copy.test.tsx` — API nativa exitosa | PASS |
| 2 | Si la API nativa rechaza el permiso, se intenta copiar mediante un campo temporal y se elimina al terminar. | `credential-copy.test.tsx` — fallback aprobado | PASS |
| 3 | Si ambos mecanismos fallan, no se afirma éxito y se indica la copia manual. | `credential-copy.test.tsx` — fallback rechazado y feedback | PASS |
| 4 | Un valor vacío nunca se marca como copiado. | `credential-copy.test.tsx` — credencial vacía | PASS |
| 5 | Creación y restablecimiento de credenciales usan la misma lógica en POS tenant y Backoffice. | Typecheck, lint, build y revisión de los cuatro flujos UI | PASS |

## TDD y validaciones

- **RED:** `npm run test:backoffice-ui`; la nueva prueba falló al no existir el
  helper y las 11 pruebas preexistentes pasaron.
- **GREEN:** `npm run test:backoffice-ui`; 17/17 pruebas pasaron.
- **Cobertura focal:** `node --experimental-test-coverage --import tsx --test
  components/backoffice/credential-copy.test.tsx`; 6/6 pasaron, helper con
  94.05 % de líneas, 80 % de ramas y 84.62 % de funciones.
- **Calidad:** `npx tsc --noEmit`, `npm run lint` y `npm run build` pasaron.
- **E2E/manual:** la ruta de copia no fue ejercitada en navegador real; la CI de
  PR sigue siendo obligatoria y cubrirá el resto de la suite integrada.

## Límites y trazabilidad

El arreglo aplica a copiar credenciales visibles por acción explícita del
operador. No envía las credenciales, no las registra y no modifica Auth,
Firestore, Rules, tenants, staging o producción. Si el navegador bloquea ambos
mecanismos, la UI ahora muestra un error honesto y el recurso de copiar
manualmente.

- **PR/merge/CI post-merge:** pendientes al crear esta evidencia.
- **Auditoría:** pendiente sobre el diff final y los checks del PR.
