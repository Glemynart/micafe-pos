# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción en `main @ a0cef89` (2026-10-14)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado para release productivo, creación del
tenant real, persistencia de oferta/Trial e importación de catálogo. La CI del
SHA observado está verde y las 80 Functions listadas están activas en Node.js
22; sin embargo, producción sirve un deployment Vercel de `main @ 1c2f155`,
Firestore Rules no coincide con el código actual, las nuevas callables Bodega
no están publicadas y la callable legacy de compras sigue activa. Faltan
atestaciones independientes de smoke y recuperación. Este preflight es de
solo lectura: no autoriza deploy ni escrituras productivas.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **SHA objetivo y `origin/main`:**
  `a0cef89994698e664c0cd2ae7b6676739cfda86e`.
- **Proyecto productivo:** `micafe-pos`, siempre pasado como ID literal en
  cada comando Firebase.
- **Hora de la colección:** `2026-10-14T05:35:19.107Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con `--project`,
  `--repo` y `--sha` explícitos; sin `--out`. La lectura Rules usó un token
  efímero de corta duración en memoria, sin imprimirlo ni persistirlo.
- **Resultado del colector:** `INCOMPLETE`; `collectionErrors=[]`,
  `readOnly=true`, `productionWrites=false`.
- **Comprobaciones locales previas:** carpeta dedicada de Gate I, árbol limpio,
  SHA exacto y proyecto productivo confirmado. No se usó la carpeta de staging.
- **Límites:** solo se consultaron GitHub, Vercel y metadatos Firebase de
  Functions, Rules, Storage y recuperación. No se consultaron documentos de
  clientes ni se invocaron callables. No hubo deploy, cambios de Rules/IAM/
  Secrets, tráfico, Auth, tenant ni datos.

## Evidencia observada

| Superficie | Observación al 2026-10-14 | Resultado |
|---|---|---|
| CI | Run `38465098694`, SHA `a0cef89994698e664c0cd2ae7b6676739cfda86e`, `completed/success`. | `PASS` |
| Vercel | El deployment productivo `READY` más reciente es `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, creado `2026-10-06T14:52:13Z`, asociado a `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`. No se observó un estado Vercel exitoso para el SHA objetivo. | `BLOCKED`: no hay evidencia de que producción sirva el candidato actual. |
| Functions | `firebase functions:list --project micafe-pos --json`: 80/80 `ACTIVE`, todas `nodejs22`; el colector registró y reconcilió los hashes por Function. | `PASS` para estado/runtime; no acredita compatibilidad de Bodega. |
| Callables Bodega / compras | Los once IDs nuevos de ADR-SAAS-076 están ausentes; también está ausente `registrarCompraBodegaV1`. `registrarCompraOperativaV1` continúa `ACTIVE` en `us-central1`, Node.js 22, codebase `saas-auth`. | `BLOCKED`: aún no está publicada la ruta Bodega y sigue activa la ruta legacy. |
| Firestore Rules | Ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46Z`. SHA local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; no desplegar el archivo completo sin corte compatible por vertical y rollback probado. |
| Storage Rules | SHA local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS` |
| Smoke independiente | No se proporcionó atestación independiente asociada al candidato productivo. | `MISSING` |
| Recuperación | PITR deshabilitado; 1 backup schedule y 34 backups observables en `southamerica-east1`. No se proporcionó atestación independiente de restore vigente asociada al candidato. | Punto de recuperación observado; restore `MISSING` |

Los once IDs Bodega ausentes, conforme a ADR-SAAS-076, son:
`crearClienteVendedorBodegaV1`, `crearPresentacionComercialBodegaV1`,
`actualizarPresentacionComercialBodegaV1`, `crearArticuloInventarioBodegaV1`,
`confirmarVentaVendedorBodegaV1`,
`consultarCatalogoPresentacionesVendedorBodegaV1`,
`consultarClientesVendedorBodegaV1`, `consultarMisVentasVendedorBodegaV1`,
`actualizarArticuloInventarioBodegaV1`, `abrirTurnoBodegaV1` y
`cerrarTurnoBodegaV1`.

## Consecuencia para Gate I

La observación anterior del 12-oct queda actualizada para el SHA actual, pero
no vuelve seguro un release. En particular, ADR-SAAS-072/075 requieren
compatibilidad del cliente, compra exclusivamente por la ruta Bodega y bloqueo
de la ruta legacy antes del corte de Rules; el inventario actual de producción
no satisface esas condiciones. El hash de Rules también continúa diferente al
candidato, por lo que no es seguro desplegar `firestore.rules` en bloque.

El siguiente trabajo permitido es preparar y validar el plan de release
compatible por vertical, con orden de publicación y rollback verificables, y
obtener atestaciones independientes de smoke y restore. Cualquier deploy
productivo, modificación de Rules, creación del tenant, oferta/Trial, usuarios,
catálogo o stock requiere sus gates y autorización operativa propios. La fecha
prevista del Trial ya pasó; su inicio debe derivarse de la activación canónica,
no retrofecharse.

## Plan de compatibilidad y rollback — preparación, no ejecución

Este plan concreta el siguiente trabajo permitido por Gate I con las fronteras
ya aceptadas en ADR-SAAS-063, ADR-SAAS-072 y ADR-SAAS-074/075/076, además de
R1 §§7 y 9. No cambia esas decisiones ni autoriza un deploy. La evidencia de
staging no se traslada a producción: el Gate C de staging calculó 12 altas
para su propio inventario remoto; producción tiene otro estado remoto y su
delta debe volver a calcularse allí.

### Superficies que el preflight productivo debe resolver

1. **Functions:** la fuente actual separa los handlers Bodega en
   `saas-bodega`, `saas-bodega-operations` y `saas-tenant-profile`. El
   inventario productivo del 14-oct observa ausentes los once IDs nuevos de
   ADR-SAAS-076 y `registrarCompraBodegaV1`, y mantiene activa
   `registrarCompraOperativaV1`. Antes de cualquier publicación hay que
   volver a inventariar cada ID, incluidos los exports de perfil, capturar su
   codebase/región/runtime/hash/revisión, y calcular el delta desde ese
   inventario; no se presupone que el plan de staging produzca el mismo número
   de altas, actualizaciones o retiros. La única actualización de
   `saas-auth` que ADR-SAAS-075 permite preparar es
   `registrarCompraOperativaV1`; cualquier delta adicional detiene el release.
   Los nombres legacy no se retiran como parte de esta secuencia.
2. **Cliente:** mantener la app de producción actual mientras se publican y
   verifican las rutas nuevas. Antes de publicar el cliente Bodega, comprobar
   con el artifact exacto que `BODEGA_MVP1` enruta a los IDs nuevos y que
   `GENERAL` conserva sus IDs legacy. El artifact se construye/promueve
   explícitamente para Production y debe demostrar `micafe-pos`; un Preview
   configurado para staging no es promovible como sustituto. ADR-SAAS-063
   deshabilita el deploy Git automático de `main`, por lo que la publicación
   Vercel es una operación separada y requiere su autorización de release.
3. **Compras legacy y Rules:** la ruta legacy debe rechazar Bodega antes de
   cualquier efecto tanto en operación nueva como en replay; los otros
   verticales deben conservar su flujo. Después, el cliente debe usar
   `registrarCompraBodegaV1` y superar sus pruebas de contrato/lectura. Solo
   entonces se puede plantear el corte de create/delete directo de `/compras`
   para Bodega, según ADR-SAAS-072. La Rules de Firestore se publican como un
   ruleset completo: la discrepancia observada incluye cambios de categorías,
   productos/presentaciones/clientes, ventas, compras, ledger/perfiles y
   señales/bindings. Por ello no se desplegará el archivo actual en bloque por
   el solo hecho de necesitar el cierre Bodega. Primero hay que certificar el
   comportamiento de todo el diff para los verticales/clientes afectados; si
   esa compatibilidad no se puede demostrar, se detiene el corte y se eleva
   una propuesta de arquitectura antes de idear overlays o reglas específicas
   por entorno.
4. **Recuperación y smoke:** revalidar una atestación independiente del
   restore en una base aislada a partir de un backup identificable y medir
   RPO/RTO antes de la primera mutación productiva; la existencia de backups
   no sustituye ese ensayo. Preparar un smoke independiente asociado al
   SHA/artifact final. Las sondas `401` solo acreditan la barrera de
   autenticación, no el flujo de negocio. Si el smoke necesita crear datos o
   tenant en producción, ese paso requiere autorización operativa explícita
   separada y un fixture aislado; no forma parte de este preflight.

### Orden de release propuesto

1. Congelar SHA de `main`, cerrar los gates de staging aplicables a ese SHA
   (incluido el cierre formal de Gate F) y confirmar CI completa. Repetir
   inmediatamente el preflight desde la carpeta productiva dedicada, limpia,
   validando ruta, SHA, `firebase.json` y `--project micafe-pos` literal.
2. Capturar como artefactos de evidencia el estado previo de cada Function,
   Ruleset/Rules, Storage, deployment Vercel, APIs/identidades requeridas y
   punto de recovery. Completar aquí la atestación de restore aislado antes
   de la primera mutación productiva. No reutilizar snapshots ni credenciales
   de staging.
3. Calcular y revisar el delta exacto de Functions por ID. La selección debe
   limitarse a las entradas Bodega aprobadas que falten y a la actualización
   puntual de `registrarCompraOperativaV1`; cero retiros. No usar un deploy
   global de codebases. Un `firebase deploy --dry-run` no se presume inocuo:
   la experiencia de Gate C mostró que puede solicitar APIs/identidades de
   servicio; sus posibles efectos deben formar parte del preflight y de la
   autorización.
4. Solo tras autorización operativa específica, desplegar primero las
   callables aditivas y la barrera legacy en un corte compatible. Verificar
   versiones, tráfico/revisiones, ausencia de cambios de IAM/Secrets fuera del
   alcance, errores de runtime y sondas sin autenticación. Conservar las
   Functions legacy y no ejecutar compras durante esta verificación.
5. Publicar después el artifact Vercel compatible con Firebase producción;
   validar login, resolución de vertical y lecturas/superficies permitidas.
   Mantener Rules sin cambios hasta tener evidencia de clientes compatibles y
   de que la ruta legacy rechaza Bodega también durante replay.
6. Ejecutar smoke independiente con el artifact final antes de Rules, cubriendo
   los verticales afectados y el routing Bodega. Las sondas `401` no bastan;
   cualquier operación que escriba necesita fixture aislado y autorización
   separada. Si no se acredita compatibilidad del cliente, no avanzar al corte.
7. Tratar el ruleset como una decisión de corte independiente. Antes de
   cualquier deploy, pasar pruebas Rules para los verticales impactados,
   revisar el diff remoto/local y obtener aprobación operativa específica.
   Si no se acredita compatibilidad para toda la publicación atómica, Gate I
   queda detenido; no se reemplaza el ruleset con una versión parcial no
   versionada.
8. Tras un corte autorizado, repetir el smoke, reconciliar los releases
   realmente observados contra el SHA/artifact y verificar recuperación. Solo
   después reevaluar el alta real, oferta/Trial, usuarios y catálogo mediante
   sus autorizaciones propias.

### Límites de rollback

- **Vercel, antes del corte de Rules:** conservar el deployment y alias
  productivos previos y la versión anterior identificada; un rollback de UI
  solo es seguro mientras el backend/Rules mantienen compatibilidad con ese
  cliente. Después del corte de Rules no se vuelve a un cliente que escriba
  directamente en Firestore.
- **Functions:** los endpoints nuevos son aditivos y no se borran durante un
  rollback de cliente. La reversión automática de la barrera de
  `registrarCompraOperativaV1` no es aceptable una vez que Bodega pueda usar
  producción; después de ese punto se corrige hacia delante o se requiere un
  break-glass explícito y auditado. El release debe conservar la revisión
  previa exacta y probar cómo seleccionarla antes de cualquier deploy.
- **Rules:** antes de publicar debe existir una copia íntegra verificable del
  ruleset actualmente servido. Volver al ruleset previo reabriría para Bodega
  las escrituras directas de `/compras`; por tanto, no es el rollback normal
  después de activar Bodega. Tras un commit de negocio, no se revierte el dato
  con rollback de código: solo se corrige mediante comandos compensatorios
  auditados.
- **Recovery:** cualquier restore se dirige a un destino aislado, nunca a
  `(default)` ni a tráfico productivo. Este documento no solicita ni ejecuta
  restore, despliegue, cambio de IAM/Secrets, Rules, tenant o dato.

**Salida de esta preparación:** el plan de orden y rollback está definido,
pero no es un preflight ejecutable ni una autorización. Gate I continúa
`INCOMPLETE` hasta que el delta productivo sea exacto, el corte de Rules sea
compatible, el smoke/restore estén atestados independientemente y cada
operación tenga sus gates y autorizaciones.

## Mutation audit

- Archivos de aplicación/pruebas y servicios remotos: cambios `0`.
- Functions, Rules, IAM, Secrets, tráfico, Auth, Firestore, Storage, tenant,
  oferta/Trial, catálogo e inventario: escrituras `0`.
- El único artefacto de este cambio es esta nota de evidencia.

## Revisión

- **Fecha de observación:** 2026-10-14.
- **Base:** `origin/main @ a0cef89994698e664c0cd2ae7b6676739cfda86e`.
- **Alcance:** actualizar evidencia read-only de Gate I; no declara Gate I
  completo ni modifica el estado vivo del Goal antes de la integración.
