# G-SAAS-02 / M2 / E2.2 — Gate C preflight Rules ADR-SAAS-072 (2026-10-11)

## Dictamen

`PREFLIGHT = PASS` para el candidato exacto de Firestore Rules en
`micafe-pos-staging`, `origin/main @ eb44c0593a22e5fbc9397424ad3d8c014b9523a1`.
No se ejecutó Gate D: el deploy de Rules sigue bloqueado hasta desplegar y
verificar la callable Bodega y confirmar el cliente staging compatible; además,
requiere autorización operativa específica. Este preflight no autoriza deploy,
cambios IAM/Secrets, escritura de datos ni operaciones en producción.

## Alcance e identidad observada

- Proyecto consultado: `micafe-pos-staging`.
- Release activa: `projects/micafe-pos-staging/releases/cloud.firestore`.
- Ruleset activo: `projects/micafe-pos-staging/rulesets/30df41d0-bd59-4c91-80ea-65576afd436b`.
- `updateTime` observado: `2026-10-02T06:06:09.78389Z`.
- El contenido remoto normalizado coincide byte por byte con
  `firestore.rules` de antes de PR #537 / ADR-SAAS-069; SHA-256 UTF-8 con LF:
  `00e8efaf166d41ecccf57979c730b59b2f868725135e9a59abe15a6c9c72723d`.
- El blob candidato de `origin/main:firestore.rules` es
  `61da38eb9870a7c155f14e4adae85f7d0c87cefe`.
- Desde el Ruleset remoto hasta el candidato, el delta revisado en Git son
  únicamente PR #537 (señales de disponibilidad ADR-SAAS-069) y PR #544
  (corte Bodega ADR-SAAS-072): 36 líneas añadidas y 2 retiradas. No hay cambios
  de Rules sin explicar en la historia de `main` desde ese release.

## Compatibilidad del cliente y callables

- `components/pos/purchases-module.tsx` registra las compras llamando a
  `registrarCompra(..., vertical)`; no escribe directamente en Firestore.
- `lib/compras-service.ts` obtiene el nombre mediante
  `resolverCallableCompra`; `lib/bodega/compra-routing.ts` dirige
  `BODEGA_MVP1` a `registrarCompraBodegaV1` y mantiene
  `registrarCompraOperativaV1` para los otros verticales. Las pruebas de
  enrutamiento lo verifican.
- El inventario read-only de Functions observó 43 funciones totales y seis en
  `saas-bodega-operations`. En `micafe-pos-staging` no están desplegadas ni
  `registrarCompraBodegaV1` ni `registrarCompraOperativaV1`.
- Por tanto, la ruta legacy no es invocable en el snapshot consultado y el
  código fuente actual es compatible con el corte. Sin embargo, la nueva
  callable tampoco está desplegada y no se verificó la versión del cliente web
  que está sirviendo staging. Aplicar Rules ahora impediría registrar compras
  Bodega hasta completar y verificar primero esa dependencia.

## Validaciones

- `npm run test:rules`: `PASS`, 42/42.
- `npm run test:bodega-ui -- --test-name-pattern='callable'`: `PASS`, 21/21;
  incluye las pruebas de enrutamiento Bodega/legacy.
- PR #544 integró el corte con suite de Rules 42/42, typecheck y ESLint
  aprobados; su CI post-merge run `38134082693` terminó `success`.
- La lectura remota fue GET únicamente. No se habilitaron APIs ni se cambiaron
  Rules, Functions, IAM, Secrets, Auth, datos, tráfico, fixture o tenant.

## Secuencia y límites

1. Solicitar y cumplir el Gate D autorizado para desplegar únicamente
   `saas-bodega-operations` en staging; comprobar que
   `registrarCompraBodegaV1` está activa y verificar una compra sintética según
   el alcance de pruebas aprobado.
2. Confirmar que el cliente servido en staging contiene el enrutamiento de
   `BODEGA_MVP1` a esa callable y que su flujo no escribe directamente en
   `/compras`.
3. Repetir este preflight read-only por proyecto inmediatamente antes del
   corte de Rules. Detenerse si aparecen la callable legacy, nuevas superficies
   o un cliente incompatible.
4. Obtener autorización operativa específica para desplegar solo
   `firestore:rules`; luego verificar el release y ejecutar smoke tests.

La aceptación de ADR-SAAS-072 y la PR #544 autorizan el diseño y su
implementación en código, no la secuencia de despliegue. No hubo cambios en
producción ni escrituras de datos.
