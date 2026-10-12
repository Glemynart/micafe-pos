# G-SAAS-02 / M2 / E2.2 — Gate D deploy ADR-SAAS-068 (2026-10-11)

## Dictamen

`STAGING_DEPLOY = PASS` para las Functions `saas-bodega` del proyecto
`micafe-pos-staging`, región `us-central1`. Se actualizaron exactamente las 17
Functions del preflight; no hubo creaciones ni eliminaciones. Las 17 quedaron
activas, listas y con 100 % del tráfico en su revisión nueva. Esto certifica el
despliegue, no sustituye la repetición funcional de Gate G ni la certificación
Gate H.

## Identidad y comando

- Goal / Milestone / Epic: `G-SAAS-02` / `M2` / `E2.2`.
- Implementación: PR #554, ADR-SAAS-068 Opción 2, integrada en `main`.
- Candidato exacto: `main @ 6abf832a03947b6f32d046f0d4adbc43b51e8fd6`.
- PR #556 agregó el preflight documental y quedó integrado en ese SHA; su CI
  post-merge `38178181727` terminó `success`.
- `firebase.json`: `functions-bodega` → codebase `saas-bodega`.
- El candidato conserva el artefacto del preflight Gate C:
  Firebase `sourceHash` `b5ec096dd20bdff809f12a1dec3a3c80305c5b36`, ZIP SHA-256
  `ada668d5109ab8cab8cd22a848831b5a6429422edfb3391ea03cee493243007c`.
  El diff entre el SHA del preflight `64f6d936` y `6abf832` no encontró cambios
  en `functions-bodega` ni `firebase.json`.
- Comando ejecutado:

```text
firebase deploy --only functions:saas-bodega --project micafe-pos-staging --non-interactive
```

- Resultado del CLI: `Deploy complete!`, exit code `0`; 17 líneas de operación
  `Successful update operation`, cero creates y cero deletes.
- Ventana de actualización observada: `2026-10-11T22:25:46Z`–
  `2026-10-11T22:25:55Z`.

## Verificación post-deploy

El inventario de `functions-bodega/src/index.ts` contiene 17 exportaciones y
coincide exactamente con las 17 Functions objetivo. El proyecto tiene 44
Functions en total; las demás pertenecen a codebases fuera de este deploy.

| Function | Revisión Cloud Run | Estado / tráfico |
|---|---|---|
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00006-bek` | Ready / 100 % |
| `cancelarProgramacionPedidoBodegaV1` | `cancelarprogramacionpedidobodegav1-00003-gap` | Ready / 100 % |
| `cancelarSolicitudVentaBodegaV1` | `cancelarsolicitudventabodegav1-00005-juq` | Ready / 100 % |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00008-los` | Ready / 100 % |
| `consultarAgendaPedidosBodegaV1` | `consultaragendapedidosbodegav1-00003-pul` | Ready / 100 % |
| `consultarSolicitudesVentaBodegaV1` | `consultarsolicitudesventabodegav1-00005-bej` | Ready / 100 % |
| `convertirProgramacionPedidoBodegaV1` | `convertirprogramacionpedidobodegav1-00003-xez` | Ready / 100 % |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00006-boz` | Ready / 100 % |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00006-zip` | Ready / 100 % |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00006-gom` | Ready / 100 % |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00006-vem` | Ready / 100 % |
| `crearProgramacionPedidoBodegaV1` | `crearprogramacionpedidobodegav1-00003-zuk` | Ready / 100 % |
| `crearSolicitudVentaBodegaV1` | `crearsolicitudventabodegav1-00005-yel` | Ready / 100 % |
| `notificarSolicitudVentaBodegaPendienteV1` | `notificarsolicitudventabodegapendientev1-00002-kab` | Ready / 100 % |
| `reconciliarAgendaPedidosBodegaV1` | `reconciliaragendapedidosbodegav1-00003-xur` | Ready / 100 % |
| `resolverProgramacionPedidoBodegaV1` | `resolverprogramacionpedidobodegav1-00003-zix` | Ready / 100 % |
| `resolverSolicitudVentaBodegaV1` | `resolversolicitudventabodegav1-00005-dub` | Ready / 100 % |

Las 17 Functions reportan `ACTIVE`, `nodejs22`, `us-central1`, cero
`secretEnvironmentVariables` y cero `secretVolumes`. Las 15 callables recibieron
una sonda `POST {"data":{}}` sin credenciales y devolvieron HTTP `401`
`UNAUTHENTICATED`, antes de ejecutar una operación de negocio. El trigger de
Firestore y el scheduler no recibieron invocaciones manuales.

La consulta de Cloud Logging para los 17 servicios desde
`2026-10-11T22:25:00Z` no encontró entradas `ERROR`. El scheduler existente
`firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` sigue habilitado
cada cinco minutos y registró una ejecución automática en
`2026-10-11T22:30:01Z`. No se invocó manualmente; no se leyó el resultado de esa
reconciliación en Firestore.

## Auditoría de límites

- Firebase CLI desplegó únicamente `functions:saas-bodega` en
  `micafe-pos-staging`; no incluyó `saas-bodega-operations` ni otros codebases.
- La política IAM de proyecto leída después coincide con Gate C: cinco pares
  aprobados por ADR-SAAS-066/067, conservando el binding preexistente
  `roles/iam.serviceAccountTokenCreator` →
  `firebase-adminsdk-fbsvc@micafe-pos-staging.iam.gserviceaccount.com`. No se
  cambió IAM.
- No se desplegaron Rules, Storage, APIs, Secrets o índices. Durante la ventana
  del deploy no se hicieron escrituras de negocio autenticadas ni se alteraron
  Auth, fixture, tenant real o producción.
- El deploy y su verificación no ejecutaron compras, ventas ni ajustes manuales
  de inventario. La compra sintética anterior del fixture está conciliada en
  [la evidencia de compra Gate F](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md);
  no fue creada ni modificada por este deploy. La invocación automática del
  scheduler descrita arriba es independiente y su resultado no se afirma.
- Las revisiones de rollback siguen disponibles; si una verificación posterior
  detecta regresión, restaurar únicamente las 17 revisiones capturadas en el
  preflight tras confirmar que siguen vigentes.

## Resultado y siguiente paso

Gate C: `PREFLIGHT = PASS` para `main @ 6abf832`.
Gate D Functions ADR-SAAS-068: `PASS`.
Siguiente: repetir Gate G en staging para efectivo sin turno, verificar venta,
recibido/cambio, saldo/ledger, stock, replay e historial; luego actualizar Gate
H. No crear tenant real ni tocar producción.
