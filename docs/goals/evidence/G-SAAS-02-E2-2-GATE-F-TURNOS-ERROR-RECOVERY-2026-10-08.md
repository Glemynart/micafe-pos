# G-SAAS-02 / M2 / E2.2 — recuperación de errores del historial de turnos

**Fecha:** 2026-10-08
**Estado:** evidencia local del cambio propuesto; no certifica Gate F ni sustituye la verificación del Preview.

## Hallazgo

La ruta administrativa `/admin/turnos` dejaba un indicador de carga permanente
si la preparación asíncrona de consultas o el listener de Firestore fallaban:
el servicio no propagaba ninguno de esos errores y la página solo terminaba de
cargar al recibir datos. La inspección visual previa de staging/Preview mostró
la ruta sin contenido operativo, pero no capturó el error remoto; por ello no se
afirma que un error específico de Rules, índice o red fuese la causa de aquella
instancia.

## Cambio acotado

- El servicio ahora propaga errores de preparación y del listener, conservando
  la cancelación de listeners y evitando callbacks tardíos al desmontar.
- Backoffice muestra estado de error recuperable y permite reintentar; si ya
  recibió datos, conserva la última lectura y avisa que no pudo actualizar.
- El módulo POS muestra un aviso al fallar la carga del historial.
- No cambia consultas, permisos, reglas, modelo de datos, autoridad de escritura
  ni comandos de negocio.

## Pruebas y validaciones locales

| Validación | Resultado |
| --- | --- |
| Prueba unitaria `lib/__tests__/turnos-history-subscription.test.ts` | 4/4 PASS: datos/cleanup, fallo al preparar, error del listener y cancelación durante preparación |
| `npx tsc --noEmit` | PASS |
| ESLint sobre los cinco archivos del cambio | PASS |
| `npm run build` | PASS; Next compiló y generó las 49 páginas |
| `git diff --check` | PASS |

La prueba inicial se escribió antes de agregar el helper de suscripción y falló
por el módulo aún inexistente. Tras la implementación, los cuatro casos
pasaron. No se ejecutó E2E de negocio porque esta corrección solo añade
propagación de errores y recuperación de lectura; el E2E de turnos remoto
podría realizar mutaciones fuera del alcance del test.

## Límites de esta evidencia

- El cambio todavía no está publicado en un Preview; la verificación visual
  después del despliegue queda pendiente.
- No se confirmó la causa exacta del fallo observado en la ruta activa. El
  cambio vuelve visible el error en vez de ocultarlo; el código/captura del
  error en Preview permitirá decidir si hace falta una corrección adicional.
- Firebase staging y producción: escrituras `0`; Vercel deploys: `0`; ventas,
  inventario, agenda, turnos, memberships y Auth: mutaciones `0`.
- Gate F permanece `EN CURSO`; esta evidencia es parcial y no cierra la matriz.
