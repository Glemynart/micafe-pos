# G-SAAS-02 / M2 / E2.2 — recuperación de errores del historial de turnos

**Fecha:** 2026-10-08
**Estado:** corrección y diagnóstico en revisión mediante PR #491; no certifica Gate F.

## Hallazgo

La ruta administrativa `/admin/turnos` dejaba un indicador de carga permanente
si la preparación asíncrona de consultas o el listener de Firestore fallaban:
el servicio no propagaba ninguno de esos errores y la página solo terminaba de
cargar al recibir datos. La inspección visual previa de staging/Preview mostró
la ruta sin contenido operativo. Tras publicarse el primer cambio de PR #491,
el administrador autenticado en su Preview vio el estado recuperable con el
mensaje genérico de error. Esto confirma que la interfaz ya no queda cargando,
pero todavía no identifica ni corrige la causa remota.

## Cambio acotado

- El servicio ahora propaga errores de preparación y del listener, conservando
  la cancelación de listeners y evitando callbacks tardíos al desmontar.
- Backoffice muestra estado de error recuperable y permite reintentar; si ya
  recibió datos, conserva la última lectura y avisa que no pudo actualizar.
- El módulo POS muestra un aviso al fallar la carga del historial.
- El ajuste diagnóstico de este mismo PR distingue consulta de turnos, lectura
  de membresías y listener; expone únicamente la etapa y un código Firebase
  validado, nunca el mensaje crudo ni datos del error.
- No cambia consultas, permisos, reglas, modelo de datos, autoridad de escritura
  ni comandos de negocio.

## Pruebas y validaciones locales

| Validación | Resultado |
| --- | --- |
| Prueba unitaria `lib/__tests__/turnos-history-subscription.test.ts` | 6/6 PASS: suscripción, limpieza, propagación de fallos y diagnóstico sanitizado |
| `npx tsc --noEmit` | PASS |
| ESLint sobre los archivos del cambio | PASS |
| `npm run build` | PASS; Next compiló y generó las 49 páginas |
| `git diff --check` | PASS |

No se ejecutó E2E de negocio porque esta corrección solo añade propagación y
clasificación segura de errores de lectura; el E2E remoto de turnos podría
realizar mutaciones fuera del alcance autorizado.

## Límites de esta evidencia

- El primer commit del PR sí está publicado en Preview y muestra el error
  recuperable; la actualización diagnóstica de este checkpoint aún espera CI y
  su nuevo Preview.
- No se confirmó la causa exacta del fallo. La inspección de Rules e índices en
  el repositorio no basta para inferir el estado desplegado ni el permiso del
  token activo. El diagnóstico del siguiente Preview determinará el paso
  correctivo mínimo; no se modifican Rules o índices por conjetura.
- Firebase staging y producción: escrituras `0`; Vercel deploys: `0`; ventas,
  inventario, agenda, turnos, memberships y Auth: mutaciones `0`.
- Gate F permanece `EN CURSO`; esta evidencia es parcial y no cierra la matriz.
