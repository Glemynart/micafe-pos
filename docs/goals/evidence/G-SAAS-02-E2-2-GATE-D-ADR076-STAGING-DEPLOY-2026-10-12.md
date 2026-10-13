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

## Smoke autenticado de perfil y compras — 2026-10-13

El administrador de staging abrió `/admin/compras` en el preview compatible.
La ruta mostró el formulario de primer acceso del perfil comercial, esperado
por ADR-SAAS-073, antes de renderizar Compras. Al guardar el formulario, la
callable `registrarPerfilComercialBodegaV1` respondió HTTP `500`. El log de
Cloud Run a `2026-10-13T05:14:06.532Z` identifica el fallo como
`FAILED_PRECONDITION: The query requires an index`; la traza termina en la
lectura de `emisionesRef` dentro de `leerComandoConfiguracionEnTransaccion`
antes de que la transacción llegue a sus escrituras.

El índice requerido ya está declarado en `firestore.indexes.json` para la
colección `ventas`, campos `empresaId ASCENDING`, `dian.emitidoEn ASCENDING` y
`__name__ ASCENDING`, pero la lectura de índices de `micafe-pos-staging` no
encontró esa definición. El fallo se explica por una diferencia entre el
manifiesto y el estado remoto; no por Rules ni por el formulario. Este intento
no guardó el perfil y no creó compra, venta ni movimiento de inventario.

No se creó ni desplegó el índice durante esta verificación. La autorización de
Gate D que produjo el deploy de Functions excluyó índices, y el deploy general
del manifiesto raíz no se considera un delta aislado. Antes de reintentar el
formulario se requiere un preflight complementario que limite la mutación a
este índice único de staging y su autorización correspondiente. Producción,
Rules, Functions y datos de negocio no fueron modificados.

## Preflight y deploy aislado del índice faltante — 2026-10-13

El usuario autorizó agregar a Gate D y desplegar exclusivamente el índice
`ventas(empresaId ASCENDING, dian.emitidoEn ASCENDING, __name__ ASCENDING)` en
`micafe-pos-staging`; la autorización excluye Rules, Functions, datos y
producción. El preflight inmediato volvió a leer `firestore.indexes.json`
(SHA-256 `D697C38F5EAB464E66BE69EF54E54906E6C7653DDA061FEDC61F928424881835`),
confirmó una única definición con esos campos y encontró 11 índices remotos,
cero de ellos en el grupo `ventas`. Por tanto, no se desplegó el manifiesto
raíz ni se alteraron los otros 11 índices.

El primer intento de `gcloud` fue rechazado localmente al analizar los flags y
no creó un recurso. El segundo envío, construido como un único campo JSON y
precedido por otra comprobación de ausencia, fue aceptado por Firestore en la
base `(default)`. El recurso resultante es
`projects/micafe-pos-staging/databases/(default)/collectionGroups/ventas/indexes/CICAgNiav4AK`,
con los tres campos y el orden esperados. La última lectura de estado lo mostró
`READY` a las `2026-10-13T05:29:09Z`. La operación de creación comenzó a las
`2026-10-13T05:24:37Z`; la lista remota ahora contiene 12 índices en total. El
deploy aislado del índice queda verificado, pero el guardado autenticado debe
reintentarse para demostrar la corrección end-to-end.

No se ejecutó ningún comando contra `micafe-pos`. Esta mutación add-only no
creó perfil comercial, compra, venta, movimiento de inventario ni ledger.

## Reintento posterior al índice — 2026-10-13

Después de que el índice alcanzó `READY`, se observó otro `POST` a
`registrarPerfilComercialBodegaV1` desde el preview
`cafeatrato-git-codex-e2-2-gate-d-adr-52e24c-glemynarts-projects.vercel.app`.
La solicitud terminó en HTTP `400` a las `2026-10-13T05:32:51.759646Z`.
Cloud Logging correlaciona la solicitud con la traza
`82f98beb5ddd9539bfdd38665af154c0` y registra `Callable request verification
passed` a las `2026-10-13T05:32:51.818855Z`; no registra el código/mensaje de
dominio ni el cuerpo de respuesta de la callable. Posteriormente, el
responsable compartió solo la respuesta sanitizada de Network:
`error.status=INVALID_ARGUMENT` y
`error.message=PERFIL_COMERCIAL_INVALIDO`, sin payload, headers ni datos
comerciales. Esto confirma un rechazo de validación del perfil y lo distingue
del 500 por índice, pero no identifica cuál campo falló.

La consola del navegador también mostró `[IdleTimer] Cerrando sesion por
inactividad` entre intentos. Como la verificación de la callable consta como
aprobada, la evidencia disponible no permite atribuir el 400 al cierre de
sesión. En el código desplegado, tanto la validación del payload como la
validación de dominio fallan antes de confirmar las escrituras de la
transacción; este rechazo no guarda el perfil. El contrato valida longitudes y
texto canónico, NIT/DV, correo y teléfono, además de la consistencia entre los
códigos DIVIPOLA de departamento y municipio. El error público es genérico,
por lo que no se puede determinar el campo infractor sin inspeccionar los
valores localmente; no compartir payload, headers, cookies ni datos
comerciales. Gate D funcional permanece `PENDING` hasta que una lectura
autenticada y de solo lectura confirme el perfil persistido y la carga del
listado de Compras.

## Seguimiento de pendientes

- **Perfil en la observación inicial (histórico):** en ese momento todavía
  faltaba corregir el dato que incumplía la validación y completar el smoke
  autenticado del perfil; las sondas `401` no sustituían ese recorrido. La
  observación posterior abajo indica que el responsable reportó haber superado
  el formulario y vio la fila de compra.
- **Gate D vigente:** hacer la lectura autenticada y de solo lectura del perfil,
  compra, inventario y auditoría; no repetir formulario ni compra.
- Repetir los escenarios afectados de Gates F, G y H; la evidencia del
  namespace anterior no se reutiliza.
- Mantener Gate I bloqueado hasta disponer de una carpeta productiva separada,
  limpia y en el SHA aprobado, preflight literal `micafe-pos`, Rules con corte
  compatible y rollback, restore/smoke independientes y autorización de alta
  real. No se ha creado el tenant ni iniciado el Trial.

Producción, Rules, Functions y Auth permanecieron fuera del deploy. En el corte
documentado hasta aquí, el único cambio remoto fue la creación del índice
compuesto en `micafe-pos-staging`; no se observó una compra autenticada en ese
momento.

## Observación posterior aportada por el responsable — 2026-10-13

Después de corregir los códigos DIVIPOLA del formulario, el responsable indicó
que superó la pantalla de primer acceso y compartió una captura del Backoffice
en Compras. En la captura aparecen una fila de `Proveedor sintético Gate F`
con fecha mostrada `11/10/2026`, total `$1.000 COP`, además de `1` compra y
gasto por `$1.000 COP`. Esto es evidencia manual aportada por el responsable;
la captura no contiene URL ni SHA del deployment, por lo que no identifica con
certeza qué preview produjo la pantalla. Tampoco demuestra por sí sola que el
perfil comercial persista en la callable o que compra, saldo físico/reservado,
ledger y auditoría estén conciliados.

La fila es consistente con la compra sintética de una unidad del producto
fixture por `$1.000 COP` autorizada para staging. Debe tratarse como una
mutación persistente ya existente: no repetir la compra ni volver a enviar el
formulario. Antes de declarar `Gate D = PASS`, realizar únicamente la lectura
de solo lectura del perfil, compra, inventario y auditoría desde la superficie
vigente autenticada; si el preview/tenant no puede identificarse, conservar
Gate D como `UI OBSERVADA / RECONCILIACIÓN PENDIENTE`.

El PR #583 quedó integrado en `main @ 4395ca8b3bb451868ae01534f5b2a9af4408dc29`
el `2026-10-13T07:15:00Z`, con CI post-merge `38361476760` en `success`. PR
#584 solo corrige la presentación cliente de detalles allowlisted cuando el
SDK agrega `[400]`; su commit de código `bc6ef56` pasó CI (`38366232632`) y
Vercel. La reconciliación documental forma parte del mismo PR, por lo que debe
verificarse la CI del HEAD final y auditarse el diff completo antes del merge;
el CI verde del commit de código no sustituye esas verificaciones. Ninguno de
esos PR modifica Functions, Rules ni datos remotos.
