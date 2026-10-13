# G-SAAS-02 / M2 / E2.2 — Gate D: namespace Bodega ADR-SAAS-076 en staging

- Fecha de revisión: 2026-10-12 (America/Bogota); despliegue: 2026-10-13 UTC.
- Entorno: únicamente `micafe-pos-staging`.
- Fuente: `main @ 1f44b632cd8af1689d8f14b20e64b059c3908221`.

## Contexto y límites

PR #580 integró la evidencia de Gate C y la autorización operativa para crear
exactamente doce Functions nuevas en staging, condicionada al merge y a CI
post-merge verde. Su merge commit es `1f44b632cd8af1689d8f14b20e64b059c3908221`
(`2026-10-13T03:56:28Z`); el CI post-merge, run
[38344063840](https://github.com/Glemynart/micafe-pos/actions/runs/38344063840),
terminó `success` sobre el mismo SHA a las `2026-10-13T04:17:13Z`.

La ejecución usó el worktree dedicado
`C:\Users\seguc\.codex\worktrees\e2-2-gate-c-staging\PROYECTO CAFE`,
limpio y en el SHA de `main`, Firebase CLI `15.33.0` y el ID literal
`--project micafe-pos-staging`. `.firebaserc` conserva por separado
`staging: micafe-pos-staging` y `production: micafe-pos`. No se usó la carpeta
productiva ni se consultó o modificó producción.

## Dictamen

`GATE D — DEPLOY DE FUNCTIONS = PASS` para el namespace de ADR-SAAS-076. El
deploy dirigido creó 12 Functions Gen2 en `us-central1`; no actualizó ni borró
ninguna Function existente. Las doce quedaron `ACTIVE`, sus servicios Cloud
Run están `Ready` y cada uno enruta 100 % a su revisión nueva. Once IDs legacy
permanecen activos.

Esto certifica el deploy y la barrera de autenticación de los endpoints, no un
recorrido autenticado del Backoffice/POS. Gate D funcional sigue `EN CURSO`
hasta verificar las pantallas/ruta de compras con admin Bodega; Gates F/G/H
deben revalidarse sobre el namespace nuevo. No se registra compra, venta,
agenda, tenant ni movimiento de inventario en este checkpoint.

## Preflight y alcance efectivo

La lectura remota previa al deploy devolvió 44/44 Functions `ACTIVE` en 17
codebases, once IDs legacy activos y cero de los doce destinos nuevos. El
dry-run con los selectores exactos terminó `Dry run complete!` y empaquetó
únicamente `saas-bodega`, `saas-bodega-operations` y `saas-tenant-profile`.
Una segunda lectura inmediata confirmó el mismo inventario y el SHA de `main`.

El despliegue se limitó a los doce selectores explícitos de Function listados
abajo, con `--project micafe-pos-staging` y Firebase CLI `15.33.0`.

Los doce selectores explícitos fueron:

- `saas-bodega`: `crearClienteVendedorBodegaV1`,
  `crearPresentacionComercialBodegaV1`,
  `actualizarPresentacionComercialBodegaV1`,
  `crearArticuloInventarioBodegaV1`, `confirmarVentaVendedorBodegaV1`.
- `saas-bodega-operations`:
  `consultarCatalogoPresentacionesVendedorBodegaV1`,
  `consultarClientesVendedorBodegaV1`, `consultarMisVentasVendedorBodegaV1`,
  `actualizarArticuloInventarioBodegaV1`, `abrirTurnoBodegaV1`,
  `cerrarTurnoBodegaV1`.
- `saas-tenant-profile`: `registrarPerfilComercialBodegaV1`.

El CLI reportó doce `Successful create operation` y `Deploy complete!`, código
de salida `0`. La lectura posterior confirmó 56/56 Functions activas en 18
codebases: los doce destinos nuevos están activos y los once IDs legacy siguen
presentes. No se desplegaron Rules, índices, otros codebases ni secretos.

## Revisión de builds y revisiones

| Codebase | Nuevas Functions | Hash de Functions | Cloud Build |
| --- | ---: | --- | --- |
| `saas-bodega` | 5 | `72d43a3b8430501a1662b444a6bb93a1b881d244` | `d6930108-7a29-4bee-aa83-aefb5f41fe02` |
| `saas-bodega-operations` | 6 | `dfd67e81ebc1e49161bb0180b67b3620f0d34d67` | `8c10ea0e-6064-465c-abbb-c3471803ca6f` |
| `saas-tenant-profile` | 1 | `e1d53aabf92db5719477a508bf7c5f64e2764ee0` | `6ea040ed-bdf7-425c-8648-06ed25bc2661` |

Las doce Functions reportan `GEN_2`, `nodejs22`, `us-central1` y `ACTIVE`.
Cloud Run describió doce servicios `Ready`, doce revisiones nuevas con 100 %
del tráfico y cero referencias a Secret Manager en variables o volúmenes.
Los `roles/run.invoker` a `allUsers` observados en los doce servicios son la
frontera callable de Firebase; no son bindings de IAM a nivel de proyecto y el
handler Firebase sigue exigiendo identidad.

Revisiones nuevas:

| Function | Revisión |
| --- | --- |
| `abrirTurnoBodegaV1` | `abrirturnobodegav1-00001-gih` |
| `actualizarArticuloInventarioBodegaV1` | `actualizararticuloinventariobodegav1-00001-nax` |
| `actualizarPresentacionComercialBodegaV1` | `actualizarpresentacioncomercialbodegav1-00001-fad` |
| `cerrarTurnoBodegaV1` | `cerrarturnobodegav1-00001-kuj` |
| `confirmarVentaVendedorBodegaV1` | `confirmarventavendedorbodegav1-00001-bos` |
| `consultarCatalogoPresentacionesVendedorBodegaV1` | `consultarcatalogopresentacionesvendedorbodegav1-00001-cuw` |
| `consultarClientesVendedorBodegaV1` | `consultarclientesvendedorbodegav1-00001-dij` |
| `consultarMisVentasVendedorBodegaV1` | `consultarmisventasvendedorbodegav1-00001-met` |
| `crearArticuloInventarioBodegaV1` | `creararticuloinventariobodegav1-00001-gab` |
| `crearClienteVendedorBodegaV1` | `crearclientevendedorbodegav1-00001-lej` |
| `crearPresentacionComercialBodegaV1` | `crearpresentacioncomercialbodegav1-00001-xeb` |
| `registrarPerfilComercialBodegaV1` | `registrarperfilcomercialbodegav1-00001-zeg` |

## Sondas y mutaciones observadas

Se enviaron doce solicitudes callable `POST` sin credenciales, una por
endpoint, con cuerpo `{"data":{}}`. Las doce respondieron HTTP `401` y
`UNAUTHENTICATED`; no se ejecutaron operaciones de negocio. La consulta de
Cloud Run desde `2026-10-13T04:12:00Z` encontró cero entradas de severidad
`ERROR` para estos servicios. La lectura de Cloud Audit Logs entre
`04:00Z` y `04:22Z` devolvió cero eventos `SetIamPolicy`, `CreateServiceAccount`
o `EnableService` a nivel de proyecto. No se hizo cambio manual de IAM.

El dry-run imprimió comprobaciones para asegurar APIs y generar identidades de
servicio Pub/Sub/Eventarc; las APIs requeridas ya estaban habilitadas y la
lectura de Cloud Audit Logs no observó eventos de habilitación ni creación de
cuentas en la ventana revisada. No se afirma que el texto del CLI sea por sí
solo prueba de una mutación.

No se ejecutó ningún comando contra producción. El default service account de
staging sigue siendo la cuenta Compute preexistente; sus permisos preexistentes
no se modificaron en este Gate D y deben revalidarse independientemente antes
de Gate I.

## Pendientes y siguiente paso

- Completar el recorrido autenticado de administración de compras Bodega en el
  preview compatible. Las sondas `401` no sustituyen ese recorrido.
- Repetir los escenarios afectados de Gates F, G y H; la evidencia del
  namespace anterior no se reutiliza.
- Mantener Gate I bloqueado hasta disponer de una carpeta productiva separada,
  limpia y en el SHA aprobado, preflight literal `micafe-pos`, Rules con corte
  compatible y rollback, restore/smoke independientes y autorización de alta
  real. No se ha creado el tenant ni iniciado el Trial.

Producción, Rules, índices, Auth y datos de negocio permanecieron fuera del
deploy; no hubo compra autenticada ni cambios de inventario.
