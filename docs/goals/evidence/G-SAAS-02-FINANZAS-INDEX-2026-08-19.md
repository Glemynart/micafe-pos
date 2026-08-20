# G-SAAS-02 - Indice de Finanzas

Fecha: `2026-08-19`

## Resultado

Se corrigio el error de Firestore que impedia cargar las transacciones
financieras en el PWA administrativo.

## Causa

`lib/finanzas-service.ts` filtra por `empresaId`, limita `fecha` al mes
seleccionado y ordena `fecha` de forma descendente. La definicion versionada
solo tenia la variante ascendente.

## Correccion

PR #349 agrego el indice compuesto de `transacciones_financieras` con:

- `empresaId ASCENDING`
- `fecha DESCENDING`

El despliegue se realizo con `firebase deploy --only firestore:indexes
--project micafe-pos`. Firestore conservo un indice administrado que no estaba
en el archivo y no se forzo ninguna eliminacion.

## Verificacion

- JSON de `firestore.indexes.json`: PASS.
- Prueba unitaria de consulta de indices: PASS (3/3).
- CI del PR #349: PASS.
- Vercel Preview: PASS.
- Indice productivo `CICAgJiHlpgK`: `READY`.
- Consulta read-only equivalente a la del PWA: PASS; sin
  `FAILED_PRECONDITION`.

No se modificaron documentos Firestore, reglas, credenciales, configuracion
del tenant ni fechas del Trial.
