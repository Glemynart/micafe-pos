# G-SAAS-02 / M2 / E2.2 — Gate C preflight ADR-SAAS-068 (2026-10-11)

## Dictamen

`PREFLIGHT = PASS` para el candidato exacto de `saas-bodega` en
`micafe-pos-staging`, limitado al artefacto de `origin/main @
64f6d936f32b79335959d006841359a120fbeb07`. Esto certifica solo la preparación
de Gate D; no ejecuta ni autoriza por sí solo un despliegue. No se desplegaron
Functions, Rules, IAM o Secrets y no hubo escrituras de datos.

## Identidad y alcance

- Goal / Milestone / Epic: `G-SAAS-02` / `M2` / `E2.2`.
- PR de implementación: #554 (`aa9edd011c506402166012145b9e4c14ce159144`),
  ADR-SAAS-068 Opción 2. Su CI post-merge de `main`, run `38172994028`, terminó
  `success` después de reejecutar el job E2E que agotó su primer límite de 60 s.
- El candidato es idéntico en el codebase Functions al de #554; el único
  cambio posterior en `main` hasta el SHA de este informe es documental (#555).
  La CI de `main` disparada por #555, run `38175997112`, seguía en curso al
  registrar esta evidencia y no se declara aquí como aprobada.
- `firebase.json` selecciona `functions-bodega` → `saas-bodega`.
- Proyecto remoto: `micafe-pos-staging`, región `us-central1`.
- Se excluyen `saas-auth`, `saas-bodega-operations`, Rules, Storage, Bootstrap,
  Activation, otros proyectos, el tenant real y producción.

## Artefacto local reproducible

Se ejecutó el build y se empaquetó con `prepareFunctionsUpload` del Firebase
CLI 15.32.1. No se ejecutó `firebase deploy --dry-run`.

| Evidencia | Resultado |
|---|---|
| Build `npm --prefix functions-bodega run build` | PASS |
| Tests `npm --prefix functions-bodega test` | PASS, 14/14; incluye discovery y module-load |
| Firebase `sourceHash` | `b5ec096dd20bdff809f12a1dec3a3c80305c5b36` |
| Paquete ZIP | 151.152 bytes; SHA-256 `ada668d5109ab8cab8cd22a848831b5a6429422edfb3391ea03cee493243007c` |
| Contenido incluido | 70 archivos, 481.243 bytes sin comprimir; manifiesto ruta + SHA-256, ordenado y separado por tabulador: `2cc0ea42557bb1b42a23fbe94d7e812421d95188db5f8a2e4ab1bb3d5f02a01c` |
| `npm --prefix functions-bodega audit --omit=dev --audit-level=high` | Exit 0; 0 high/critical. Reporta 2 moderate transitivas: `uuid` vía `gaxios`. No se modificaron dependencias. |
| Secrets | No hay declaraciones de Secret en la fuente ni variables `secretEnvironmentVariables` en el inventario del codebase. |

La fuente local exporta 17 Functions. Su conjunto de nombres coincide
exactamente con las 17 Functions remotas de `saas-bodega`; no hay creaciones ni
eliminaciones previstas. El hash remoto común observado es
`fb454ff5e6f4138203389e308840feead931f19e`, distinto del candidato. Por tanto,
el delta previsto de Gate D es exactamente **17 actualizaciones, 0 creaciones,
0 eliminaciones**, solo en `saas-bodega`.

## Inventario remoto y rollback

`firebase functions:list` y `gcloud run services list` observaron las 17
Functions existentes en `ACTIVE`, `nodejs22`, `us-central1`; cada Cloud Run
service está `Ready=True` y envía 100 % del tráfico a la revisión lista:

| Servicio | Revisión lista actual |
|---|---|
| `actualizarpresentacioncomercialv1` | `actualizarpresentacioncomercialv1-00005-xiy` |
| `cancelarprogramacionpedidobodegav1` | `cancelarprogramacionpedidobodegav1-00002-gap` |
| `cancelarsolicitudventabodegav1` | `cancelarsolicitudventabodegav1-00004-hak` |
| `confirmarventabodegav1` | `confirmarventabodegav1-00007-veg` |
| `consultaragendapedidosbodegav1` | `consultaragendapedidosbodegav1-00002-vaz` |
| `consultarsolicitudesventabodegav1` | `consultarsolicitudesventabodegav1-00004-jeq` |
| `convertirprogramacionpedidobodegav1` | `convertirprogramacionpedidobodegav1-00002-kej` |
| `creararticuloinventariov1` | `creararticuloinventariov1-00005-kow` |
| `crearcategoriabodegav1` | `crearcategoriabodegav1-00005-dar` |
| `crearclientevendedorv1` | `crearclientevendedorv1-00005-fem` |
| `crearpresentacioncomercialv1` | `crearpresentacioncomercialv1-00005-wol` |
| `crearprogramacionpedidobodegav1` | `crearprogramacionpedidobodegav1-00002-lap` |
| `crearsolicitudventabodegav1` | `crearsolicitudventabodegav1-00004-huq` |
| `notificarsolicitudventabodegapendientev1` | `notificarsolicitudventabodegapendientev1-00001-raf` |
| `reconciliaragendapedidosbodegav1` | `reconciliaragendapedidosbodegav1-00002-fir` |
| `resolverprogramacionpedidobodegav1` | `resolverprogramacionpedidobodegav1-00002-ruw` |
| `resolversolicitudventabodegav1` | `resolversolicitudventabodegav1-00004-zof` |

Si Gate D falla su verificación, el rollback debe restaurar únicamente las 17
Functions a estas revisiones capturadas, después de confirmar de nuevo que
siguen vigentes. No hay recursos nuevos que retirar.

## APIs, IAM y fronteras excluidas

Las nueve APIs requeridas por Functions/Eventarc/Cloud Run/Cloud Build están
habilitadas: Cloud Functions, Cloud Build, Artifact Registry, Firebase
Extensions, Cloud Scheduler, Cloud Run, Eventarc, Pub/Sub y Cloud Storage.
La política de proyecto contiene los cinco pares de rol/principal previamente
aprobados por ADR-SAAS-066/067. Se conserva además el binding preexistente de
`roles/iam.serviceAccountTokenCreator` para `firebase-adminsdk-fbsvc`. No se
requiere ni se propone ningún cambio IAM para este candidato.

Firestore Rules no forman parte del artefacto ni del delta. No se habilitaron
APIs, no se cambiaron Rules, Secrets, Auth, Firestore, tráfico, fixture,
membresías, tenant real o producción. La lectura de remoto fue de solo lectura.

## Secuencia y límites

- Gate C: `PASS` para este candidato y solo para el delta descrito.
- Gate D: `NOT EXECUTED`; requiere un paso separado, dirigido únicamente a
  `functions:saas-bodega`, y comprobar otra vez el delta exacto y las revisiones
  antes de actuar.
- El deploy no sustituye la revalidación funcional posterior. La evidencia de
  Gate G/H de PR #553 fue registrada antes del merge de #554 y cubre una venta
  por transferencia; no certifica efectivo sin turno. Después de Gate D debe
  repetirse Gate G con efectivo sin turno, y actualizar Gate H antes de Gate I.
- Gate I permanece bloqueado para Bootstrap/Activation, datos reales y el
  tenant real hasta completar los gates y precondiciones de operación
  documentados. No se crea tenant real ni se modifica producción.

**Fecha de observación:** 2026-10-11 (Bogotá).
