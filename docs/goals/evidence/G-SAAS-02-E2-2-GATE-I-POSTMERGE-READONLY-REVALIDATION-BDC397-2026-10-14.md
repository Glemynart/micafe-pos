# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only post-merge en `main @ bdc3972` (2026-10-14)

## Dictamen

`INCOMPLETE` — el CI del SHA actual está verde, pero Gate I sigue bloqueado
para release productivo, tenant real, oferta/Trial e importación del catálogo.
No se observó un estado Vercel exitoso para el SHA objetivo; faltan trece
callables Bodega, la callable legacy de compras continúa activa, Firestore
Rules difiere del archivo versionado y faltan atestaciones independientes de
smoke y restore. Esta colección fue read-only; `productionWrites=false`.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **SHA objetivo y `origin/main`:**
  `bdc39726ac0c555c96abdc60cc1021ff2fc6141c`.
- **Proyecto productivo:** `micafe-pos`, indicado literalmente en cada
  comando Firebase.
- **Hora de colección:** `2026-10-14T06:57:24.499Z`.
- **Carpeta:** checkout aislado de Gate I, limpio y en detached HEAD al SHA
  objetivo; no se usó la carpeta de staging.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, ejecutado con
  `--project micafe-pos --repo Glemynart/micafe-pos --sha
  bdc39726ac0c555c96abdc60cc1021ff2fc6141c`, sin `--out`.
- **Autenticación Rules API:** token efímero obtenido en memoria para la
  lectura, no impreso ni persistido.
- **CI:** run `38522735665`, `completed/success`, asociado exactamente al SHA
  objetivo.
- **Resultado del colector:** `INCOMPLETE`, `readOnly=true`,
  `productionWrites=false`, `collectionErrors=[]`.
- **Límites:** consultas GitHub y metadatos Firebase de Functions, Firestore
  Rules, Storage Rules y backups. No se consultaron documentos de clientes ni
  se invocaron callables. No hubo deploy, cambios de Rules/IAM/Secrets/tráfico,
  autenticación, tenant ni datos.

## Evidencia observada

| Superficie | Observación al 2026-10-14 | Resultado |
|---|---|---|
| `origin/main` | Coincide con `bdc39726ac0c555c96abdc60cc1021ff2fc6141c`. | `PASS` |
| CI | Run `38522735665`, `completed/success`, mismo SHA. | `PASS` |
| Vercel | No se encontró un estado Vercel exitoso asociado al SHA objetivo. La observación previa de #589 registró como último deployment productivo `READY` uno de `main @ 1c2f155` del 6-oct; esta colección no volvió a listar deployments. | `FOLLOW_UP`: el SHA objetivo no está acreditado como servido en producción. |
| Functions | 80/80 `ACTIVE`, runtime `nodejs22`; hashes individuales observados. | `PASS` para disponibilidad/runtime, no para la capacidad Bodega. |
| Callables requeridas | Ausentes `crearClienteVendedorBodegaV1`, `crearPresentacionComercialBodegaV1`, `actualizarPresentacionComercialBodegaV1`, `crearArticuloInventarioBodegaV1`, `confirmarVentaVendedorBodegaV1`, `consultarCatalogoPresentacionesVendedorBodegaV1`, `consultarClientesVendedorBodegaV1`, `consultarMisVentasVendedorBodegaV1`, `actualizarArticuloInventarioBodegaV1`, `abrirTurnoBodegaV1`, `cerrarTurnoBodegaV1`, `registrarCompraBodegaV1` y `registrarPerfilComercialBodegaV1`. `registrarCompraOperativaV1` sigue `ACTIVE`, `nodejs22`, `us-central1`. | `BLOCKED`: el corte Bodega no está desplegado y la ruta legacy sigue activa. |
| Firestore Rules | Ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`: no desplegar Rules en bloque. |
| Storage Rules | Ruleset `1df06087-5bca-4822-ba5a-50ac951c9cf4`, actualizado `2026-08-14T01:09:03.643850Z`. SHA local/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS` |
| Smoke independiente | No hay atestación independiente para el SHA/artifact objetivo. | `MISSING` |
| Recuperación | PITR deshabilitado; 1 backup schedule y 34 backups observables en `southamerica-east1`. No hay atestación independiente de restore. | Punto de recuperación observado; restore `MISSING` |

### Comparación read-only del ruleset Firestore activo

A las `2026-10-14T07:04Z` se leyó directamente la release activa
`projects/micafe-pos/releases/cloud.firestore` y el ruleset al que apunta,
usando `x-goog-user-project: micafe-pos`. Sigue siendo
`d5e205db-0ab4-4db1-b5ec-1534bee39d35`; no se creó ni publicó un ruleset.
La comparación normalizada de reglas `match` y declaraciones `allow` de una
sola línea entre el contenido remoto y `firestore.rules` de `main @ bdc3972`
encontró diferencias en 14 paths: 20 declaraciones aparecen solo en `main` y
11 solo en producción. La comparación no cuenta expresiones `allow` multilínea;
los bloques relevantes de Bodega se revisaron además directamente.

Hallazgos relevantes para el corte Bodega:

- En producción, `match /compras/{id}` todavía permite `create` y `delete` a
  cualquier admin autorizado del tenant (`puedeCrearEnTenant() && esAdmin()` /
  `puedeEliminarEnTenant() && esAdmin()`). En `main`, ambas escrituras excluyen
  `esBodegaMvp1()`, conforme al ADR-SAAS-072 y la ruta canónica callable-only.
  Por tanto, el ruleset activo no impone aún ese límite a Bodega.
- En `/categorias/{id}`, producción permite crear/actualizar/eliminar a admins;
  `main` excluye Bodega para que su catálogo se administre por las callables.
- `main` restringe lecturas de vendedores en `/productos`, `/ventas`,
  `/clientes` y `/movimientos_inventario`, limita `/turnos` al turno propio, y
  limita `/usuarios/{uid}` a `get` propio sin `list`. Producción conserva
  lecturas más amplias en esos paths. Como `esVendedor()` es una regla por rol,
  no por vertical, deben identificarse los consumidores directos de cada
  vertical y probarse antes del corte; esta comparación sola no demuestra una
  regresión funcional ni que todas las restricciones sean vertical-neutral.
- El mapeo de superficie conserva `GENERAL + vendedor -> LEGACY`; esa UI
  genérica suscribe directamente `/productos` y `/clientes` desde la venta y
  `/ventas` desde el historial. Las Rules de `main` deniegan esas lecturas al
  rol `vendedor` sin revisar el vertical. Las pruebas actuales de
  `firestore-rules/role-invariants.test.ts` cubren el vendedor Bodega, pero no
  una regresión de `GENERAL + vendedor`: el test llamado Bodega no siembra
  `configuraciones/{empresaId}`, así que no prueba el selector de vertical. La
  regla global niega igual. Esto constituye una incompatibilidad probable del
  próximo Rules cut para tenants `GENERAL` que tengan ese rol; se debe verificar
  con fixtures Emulator diferenciados por vertical antes de cualquier
  despliegue.
- `main` también agrega `/presentaciones_producto/{id}` (lectura no-vendedor,
  sin escrituras) y deniega `/intenciones_pago_reserva/{id}`. El ruleset
  productivo no tiene esos bloques; su catch-all los deniega.
- El ruleset productivo no contiene los helpers `esBodegaMvp1()` ni
  `membresiaBodegaActiva(...)`, ni las reglas de lectura tenant-aware para
  `bodega_senales` y `bodega_senales_vendedor` que sí existen en `main`.
  El catch-all remoto termina en `allow read, write: if false`; esas rutas de
  señales quedan denegadas por el ruleset desplegado.
- La diferencia es más amplia que compras Bodega y no se puede tratar como un
  parche aislado ni como autorización para desplegar todo `firestore.rules`.
  Hace falta clasificar las 14 rutas por vertical/consumidor y probar
  compatibilidad/rollback antes de proponer un corte.

Esta lectura precisa el bloqueo de Rules de Gate I, pero no lo resuelve: no se
alteró el ruleset. Tampoco se invocaron operaciones de compra ni se consultaron
documentos de negocio.

## Consecuencia y límites

El merge documental #589 cambió `main` a un SHA nuevo, pero no desplegó
runtime. La relectura confirma que el CI verde no resuelve el release: producción
no acredita servir el SHA actual, el namespace Bodega falta, la callable legacy
permanece activa y Rules tiene drift. No hay base para un deploy de Functions,
Vercel o Rules. El gate de staging F sigue `PENDING`; no se declara superado ni
se usa esta lectura para omitirlo.

El análisis read-only inicial del ruleset desplegado confirmó que el corte de
compras Bodega aún no rige en producción y que existe una incompatibilidad
probable para `GENERAL + vendedor` en el Rules source de `main`. El siguiente
paso es decidir y documentar el alcance vertical de las lecturas protegidas,
con ADR propuesto si corresponde, y construir una matriz de compatibilidad con
pruebas Emulator y una propuesta reversible; en paralelo solo se pueden
preparar atestaciones de smoke/recovery que no alteren destinos.
Cualquier deploy, restore que modifique un destino, alta de tenant,
materialización de oferta/Trial o escritura de datos requiere sus precondiciones
y autorización operativa específicas. Cualquier restore debe usar un destino
aislado; backups existentes no equivalen a un ensayo de restore.

## Mutation audit

- Cambios de aplicación, pruebas y servicios remotos: `0`.
- Functions, Rules, IAM, Secrets, tráfico, Auth, Firestore, Storage, tenant,
  oferta/Trial, catálogo e inventario: escrituras `0`.
- Rules API: lecturas de la release activa y su ruleset; no se creó ni desplegó
  ningún ruleset.
- Artefacto: esta evidencia read-only; la sincronización del Goal está en el
  cambio documental de este PR.

## Revisión

- **Fecha:** 2026-10-14.
- **Base:** `main @ bdc39726ac0c555c96abdc60cc1021ff2fc6141c`.
- **Alcance:** relectura read-only posterior al merge #589; no declara Gate I
  completo ni autoriza mutaciones.
