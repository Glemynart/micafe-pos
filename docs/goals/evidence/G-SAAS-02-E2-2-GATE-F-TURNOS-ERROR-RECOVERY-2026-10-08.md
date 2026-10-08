# G-SAAS-02 / M2 / E2.2 — recuperación de errores del historial de turnos

**Fecha:** 2026-10-08
**Estado:** corrección y diagnóstico en PR #491; el fallo observado quedó remediado en staging y el Preview carga el historial. CI del commit actual aún pendiente; no certifica Gate F.

## Hallazgo

La ruta administrativa `/admin/turnos` dejaba un indicador de carga permanente
si la preparación asíncrona de consultas o el listener de Firestore fallaban:
el servicio no propagaba ninguno de esos errores y la página solo terminaba de
cargar al recibir datos. El primer commit de PR #491 hizo visible el error
recuperable. El diagnóstico sanitizado del Preview actual identificó
`listener_turnos · failed-precondition`. La lectura de membresías no fallaba:
el índice compuesto requerido estaba declarado en el repositorio, pero ausente
en Firestore staging.

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

## Diagnóstico y verificación en staging

- Preview autenticado de PR #491: el fallo provenía del listener, no de la
  lectura de membresías ni de un rechazo de permisos.
- Proyecto verificado por Cloud CLI: `micafe-pos-staging`; database
  `(default)`, Firestore Native, región `us-central1`.
- Inventario remoto previo: no existía índice compuesto para `turnos`. El
  contrato ya presente en `firestore.indexes.json` es `empresaId ASC` +
  `fechaApertura DESC`, scope `COLLECTION`.
- Remediación remota exacta: un índice aditivo `turnos`, id `CICAgOi3kJAK`,
  densidad `SPARSE_ALL`; operación
  `S0FKazNpT2dBQ0lDDCoDIGUzNDRhYTVjNTgwMS05Nzg4LWFiZjQtMzM3Yi1iZDYwZjgxMiQac2VuaWxlcGlwCQpBEg`.
  `gcloud firestore indexes composite list` informó `READY`.
- Reintento de solo lectura en el Preview autenticado: el historial cargó sin
  error y mostró 9/9 turnos (1 abierto, 8 cerrados). No se abrió detalle ni se
  ejecutó ningún comando de turno.

## Mutation audit

- Firestore staging: exactamente 1 mutación de infraestructura, creación del
  índice anterior.
- Documentos de turnos, ventas, inventario, agenda, membresías y Auth: 0
  escrituras.
- Producción: 0 mutaciones; Functions, Rules, IAM, Secrets y Hosting: 0 cambios.
- El Preview de Vercel es de revisión; no se promovió a producción.

## Límites de esta evidencia

- CI requerida para el commit actual está pendiente al registrar esta evidencia;
  el estado final queda condicionado al resultado remoto.
- Gate F permanece `EN CURSO`: este subgate de lectura de historial está
  recuperado, pero no reemplaza la matriz funcional, aislamiento y demás
  criterios pendientes.
- Gate F permanece `EN CURSO`; esta evidencia es parcial y no cierra la matriz.
