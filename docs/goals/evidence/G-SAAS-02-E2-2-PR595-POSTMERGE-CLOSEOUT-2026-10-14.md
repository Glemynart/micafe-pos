# G-SAAS-02 / M2 / E2.2 — Cierre post-merge de PR #595

**Fecha de registro:** 2026-10-14
**Goal rector:** `G-SAAS-02`
**Milestone:** `M2 — Provisioning y onboarding`
**Epic:** `E2.2 — Configuración inicial`
**Estado de Gate I:** `INCOMPLETE`; este asiento no certifica el release ni autoriza despliegues.

## Resolución de jerarquía

La documentación normativa viva de `origin/main` identifica `G-SAAS-02` como el único Goal activo, con M2 en ejecución y E2.2 en ejecución. El encabezado y cuerpo de PR #595 declaran esos mismos valores. `G-MVP-01` aparece en la sección histórica de `docs/goals/GOAL-MVP-COMERCIAL.md` como completado en `main @ 65a9fb85d9159eb949ffaf18c5a99ed6377b1554`, con reconciliación documental posterior en PR #241; por tanto, no es el Goal rector de este cambio. La baseline histórica `G-SAAS-01` también está documentada separadamente como completada.

No se reclasifica el PR, no se cambia la jerarquía y no se reescribe su descripción histórica. El checkout compartido atrasado no se usó como autoridad.

## Integración y CI

| Dato | Resultado verificado |
|---|---|
| PR | [#595 — fix(gate-i): accept ADR-079 and pause DIAN by tenant](https://github.com/Glemynart/micafe-pos/pull/595) |
| Estado | `MERGED`, 2026-10-14T18:29:06Z |
| SHA de head del PR | `1b57a3bdc89f9edb52f32c755db69cbd9fd4dfc7` |
| Merge SHA completo / `origin/main` | `f08fa1ca6466bfc84c39d771f34e494aaf9b2386` |
| Base del PR | `f604a0af1669cc0903859c7271b1da1e3f29cea9` |
| Checks previos al merge | `Tipos y pruebas` (run `38610876988`), `Vercel` y `Vercel Preview Comments`: `success`; Vercel acredita Preview, no producción. |
| CI post-merge | Run `38615549091`, SHA `f08fa1ca6466bfc84c39d771f34e494aaf9b2386`; concluyó `success` el 2026-10-14T18:49:57Z. El job `Tipos y pruebas` terminó `success`, sin pasos fallidos. [Ejecución](https://github.com/Glemynart/micafe-pos/actions/runs/38615549091). |

## Auditoría integrada

El merge contiene nueve archivos: ADR-SAAS-079, una actualización arquitectónica, guard de interfaz y sus pruebas, matriz Rules y evidencia/estado de Goal. `git diff --check` pasó. El alcance coincide con la decisión aprobada: impedir temporalmente la invocación de Factus desde las cuatro acciones de Historial, solo para `Cafe Atrato` (`1ae0rD9H8t3ZFSBKrrHR`) y `Prueba` (`Prueba`); conservar la implementación Factus; fallar cerrado si no se resuelve el tenant; y dejar explícito que no es autoridad fiscal server-side. No hay cambios en Firestore Rules, Functions, Vercel, datos de producción, IAM ni Secrets.

La auditoría del diff y el mutation audit previos al merge constan como `APROBADO PARA MERGE`. Los mutantes de retirar `Prueba` de la lista y bloquear accidentalmente todos los tenants fueron detectados por sus pruebas. La matriz del guard fue 10/10; las suites adicionales y sus omisiones están detalladas en la descripción de PR #595. No se atribuyen a esta revisión como ejecuciones nuevas.

## Revalidación de Gate I posterior al merge

El collector `scripts/g-saas-02/release-evidence.ts` se ejecutó a las
`2026-10-14T18:36:00.371Z` explícitamente contra el SHA completo integrado.
Resultado: `INCOMPLETE`, `readOnly=true`, `productionWrites=false`,
`collectionErrors=[]`; `ORIGIN_MAIN_MATCH=PASS`, Functions `104/104 ACTIVE`
en Node.js 22 y la CI post-merge seguía `in_progress`. No había estado Vercel
exitoso para el SHA. En esa ejecución el collector no obtuvo el ruleset porque
no tenía un `FIREBASE_ACCESS_TOKEN` en el proceso y por contrato no aceptó una
atestación externa de Rules/Storage/Smoke/Recovery; por eso sus cuatro campos
externos figuran `MISSING`. No se interpreta el `MISSING` del collector como
prueba de que el restore aislado no ocurrió. Las observaciones directas de
Rules y recovery se registran separadamente a continuación.

Lecturas de solo consulta realizadas el 2026-10-14, sin modificar producción:

| Superficie | Observación | Consecuencia |
|---|---|---|
| Empresas en estado `activa`/`trial` | Únicamente `Cafe Atrato` (`1ae0rD9H8t3ZFSBKrrHR`, `activa`) y `Prueba` (`trial`). | Coincide con el allowlist aceptado; es una fotografía y debe repetirse antes del corte de Rules. |
| Firestore Rules | `MISMATCH`, 14 paths; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; fuente de `main` `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`. | No desplegar. El ruleset es global; la matriz identifica dependencias de `/compras` y `/ventas`. El escritor cliente de metadata DIAN y la emisión por Factus necesitan corte seguro antes de cambiar Rules. |
| Compra legacy | `registrarCompraOperativaV1` permanece `ACTIVE`, Gen2/Node 22/us-central1, endpoint `https://us-central1-micafe-pos.cloudfunctions.net/registrarCompraOperativaV1`, hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`. La fuente integrada ya rechaza Bodega en operación nueva y replay. | Preparar solo despliegue dirigido con revisión/rollback capturados. No está autorizado desplegar a producción. |
| Vercel | Deployment `READY` más reciente: `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, alias `cafeatrato-git-main-glemynarts-projects.vercel.app`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, 2026-10-06. Los deploys automáticos desde `main` están deshabilitados. | El SHA integrado no está publicado; no se hizo publicación manual. Falta autorización específica, fijar SHA y documentar rollback. |
| Smoke productivo | Sin atestación autenticada para el release objetivo. | Requiere identidad y alcance productivos autorizados; Preview/staging no lo sustituyen. |
| Restore y PITR | Restore aislado `gsaas02-recovery-20261014` en `southamerica-east1`: `VERIFIED`, `RPO=8.307 h`, `RTO=0.220 h`, `sourceUntouched=true`, `applicationCutover=false`. La evidencia indica artefacto JSON local. PITR está deshabilitado según ADR-SAAS-031; hay schedule diario/35 backups. | Restore independiente verificado; el artefacto JSON no está en este worktree. PITR deshabilitado es política aprobada, no bloqueo. No se restauró `(default)` ni se activó PITR. |
| Trial de Diana | El administrador del proyecto confirma el `2026-10-14` que Diana le comunicó directamente la fecha objetivo `2026-10-15`. | Fecha confirmada según atestación directa del administrador; no se almacena la comunicación original. El Trial y el tenant siguen `NOT EXECUTED` hasta satisfacer las verificaciones, gates y autorizaciones aplicables. |

### Estado operativo de los controles

`PASS` requiere evidencia observada; `FAIL` indica que un criterio del release
no coincide; `BLOCKED` indica que no se puede avanzar con seguridad por una
dependencia o autorización pendiente; `NOT EXECUTED` significa que la acción
se omitió deliberadamente y no se presume aprobada.

| Control | Estado | Evidencia o condición |
|---|---|---|
| PR #595 y CI post-merge | `PASS` | Merge SHA `f08fa1ca6466bfc84c39d771f34e494aaf9b2386`; run `38615549091` completado correctamente. |
| Reglas Storage | `PASS` | Hash de la fuente coincide con el release remoto observado. |
| Restore aislado | `PASS` | `VERIFIED`; `sourceUntouched=true`, `applicationCutover=false`. No es un restore sobre producción. |
| Reglas Firestore | `FAIL` | Hash remoto distinto al de `main`; la matriz contiene 14 divergencias de permisos efectivos. |
| Hash de `registrarCompraOperativaV1` | `FAIL` | El runtime productivo mantiene un hash anterior al código de `main`. |
| SHA de Vercel producción | `FAIL` | El deployment `READY` observado es de `2026-10-06` en `1c2f155653536b1fd8e1925db931e2354fa41f7d`, no el SHA objetivo integrado. |
| Cambios productivos de Rules/Functions/Vercel | `BLOCKED` | No hay autorización productiva específica para esas mutaciones; Rules además requiere resolver compatibilidad. |
| Smoke autenticado de producción | `NOT EXECUTED` | Falta identidad y alcance productivos autorizados. Preview y staging no sustituyen esa atestación. |
| Emisión DIAN web | `BLOCKED` | No existe una ruta web Factus server-side en este repositorio; requiere ADR/arquitectura y trabajo separado. La pausa aceptada no se amplía. |
| PITR | `PASS` | Deshabilitado según ADR-SAAS-031; no se activó ni se ejecutó restauración productiva. |
| Tenant, Trial y carga de catálogo de Diana | `NOT EXECUTED` | El administrador confirma que Diana le comunicó directamente `2026-10-15`. Tenant y transcripción digital siguen sin autorización para crear/importar; no iniciar hasta satisfacer gates y verificaciones aplicables. |

Gate I continúa `BLOCKED`/`INCOMPLETE`; no se registra un `FAIL` de pruebas
locales ni se presenta como ejecutado ningún smoke, deploy o escritura productiva.

### Preflight dirigido de `registrarCompraOperativaV1`

La fuente de `main` exporta la callable desde el codebase `saas-auth`, en
`us-central1`; el CLI Firebase local es `15.32.1`. Se comprobó que los archivos
de fuente y `firebase.json` coinciden con `origin/main @
f08fa1ca6466bfc84c39d771f34e494aaf9b2386`. El target candidato, sin ejecutarlo
como despliegue, es `functions:saas-auth:registrarCompraOperativaV1`; no debe
sustituirse por el script que despliega todo `saas-auth`.

Se inició este comando de validación:

```sh
firebase deploy --project micafe-pos \
  --only functions:saas-auth:registrarCompraOperativaV1 \
  --dry-run --non-interactive
```

El CLI comenzó a comprobar APIs y analizar el codebase; se interrumpió antes de producir una lista final de cambios, porque anunció
verificaciones de APIs contra producción y el preflight debe permanecer sin
efectos. Una consulta de Cloud Audit Logs desde `2026-10-14T18:40:00Z` no
devolvió operaciones de habilitación de Service Usage ni cambios de Cloud
Functions. Resultado: preflight remoto `INCOMPLETE`, cero despliegues
confirmados; esto no equivale a un dry-run satisfactorio ni otorga permiso de
despliegue. Cualquier reintento remoto requiere método de preflight no mutante
confirmado y autorización productiva específica.

El propietario confirmó que para este caso (Gate I / Diana) el destino es web, no Electron. La auditoría encontró cuatro llamadas `window.api.factus` en `components/pos/historial.tsx`, pero no una ruta Factus en `app/api` ni una callable en Functions que emita documentos. Por ello no hay un proveedor web en este repo; en una web pura no debe asumirse que existe el objeto `window.api`. El guard de PR #595 bloquea a los dos tenants aceptados en UI, pero no acredita que otros tenants puedan emitir Factus desde web ni es una barrera server-side. Esta brecha web preexistente requiere una decisión arquitectónica y un cambio separado antes de afirmar la compatibilidad DIAN web; no se implementó ni se amplió el alcance de indisponibilidad.

### Validación local adicional (2026-10-14)

- `npm run test:rules`: PASS en Firestore Emulator (`demo-mt-u4-rules`), 45/45 pruebas, 0 fallos. Esto valida `firestore.rules` de la rama contra su suite local; no acredita compatibilidad de los 14 paths divergentes con todos los clientes ni sustituye un deploy/preflight remoto.
- `npm run test:tenant`: 8 PASS, 1 SKIP, 0 fallos. El caso omitido declara que requiere sesión real de Firebase Auth o mock del SDK, no presente en esta suite.
- `npm run build:functions`: PASS (`tsc -p tsconfig.json`). `npm run test:auth-foundation`: 436 PASS, 5 SKIP, 0 fallos (441 pruebas). Las omisiones constan en la suite; estos resultados locales no equivalen a CI verde del PR.
- `npm run build:vercel`: PASS con variables temporales del proceso `POS_DEPLOY_ENV=production` y `NEXT_PUBLIC_FIREBASE_PROJECT_ID=micafe-pos`; compiló Next.js 16.4 y generó 49 páginas estáticas. El primer intento sin `POS_DEPLOY_ENV` terminó correctamente en el validador, antes de compilar; no se modificaron archivos de entorno ni se desplegó.
- `git diff --check`: PASS para los cambios documentales locales. Estos resultados no se atribuyen a los checks todavía pendientes de PR #596.

### Revalidación read-only de producción (2026-10-14T19:03:51Z)

`npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos --sha f08fa1ca6466bfc84c39d771f34e494aaf9b2386` terminó con `INCOMPLETE`, `readOnly=true`, `productionWrites=false` y `collectionErrors=[]`.

| Comprobación | Resultado observado | Implicación |
|---|---|---|
| `origin/main` y CI | `origin/main = f08fa1ca6466bfc84c39d771f34e494aaf9b2386`; CI `38615549091` para ese SHA `completed/success`. | Integración y CI post-merge confirmadas. |
| Firestore Rules | Remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; 14 paths previamente clasificados en la matriz. | `MISMATCH`; no desplegar sin resolver compatibilidad y autorización específica. |
| Storage Rules | Hash remoto y fuente iguales: `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | Coincidente en la lectura. |
| Functions | `104/104 ACTIVE`, runtime `nodejs22`; hash por función reconciliado. `registrarCompraOperativaV1` está `ACTIVE`, Gen2/Node 22/us-central1, entry point idéntico y hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`; `gcloud functions describe` reportó `updateTime=2026-08-15T04:26:48.679818552Z`. | El hash sigue siendo anterior al guard esperado. `npm run build:functions` y `npm run test:auth-foundation` pasan localmente; no se desplegó. El dry-run dirigido Firebase previo sigue `INCOMPLETE` porque se interrumpió antes del delta y no debe citarse como aprobado. |
| Vercel | No hay status exitoso para el SHA objetivo. `vercel list` observó como deployment `READY` más reciente de producción `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, target `production`. `vercel project inspect` confirmó el proyecto Next.js; `vercel.json` deshabilita deployment Git automático de `main`. | `npm run build:vercel` pasa localmente, pero no publica. La lectura de settings no expone una política que permita confirmar el permiso de deployment manual; no se intentó `vercel deploy --prod` y falta autorización productiva. |
| Smoke y recovery | Smoke independiente `MISSING`. El collector no recibió referencia de atestación del restore, por eso recovery independiente también `MISSING`; por separado, el restore aislado está `VERIFIED`. | Falta smoke productivo autenticado con identidad autorizada. El `MISSING` del collector no invalida el restore aislado documentado. |
| PITR y backups | PITR `false`, 1 backup schedule y 35 backups en `southamerica-east1`. | Alineado con ADR-SAAS-031; no se activó ni restauró producción. |

No hubo habilitación de APIs, deploy, escritura, cambio IAM/Secrets ni smoke productivo durante esta revalidación.

## Límites y siguientes bloqueos

- Sin despliegues ni escrituras de producción, cambios IAM/Secrets, Trial o smoke autenticado.
- Bloqueo de Rules: incompatibilidad de 14 paths y necesidad de compatibilidad/server-authority DIAN; requiere preflight fresco, rollback forward-fix y autorización productiva independiente.
- Bloqueo de Functions: hash remoto antiguo de `registrarCompraOperativaV1`; requiere preflight dirigido y autorización productiva independiente.
- Bloqueo de Vercel: producción sigue en un SHA del 6-oct; publicación manual y smoke requieren autorización/identidad independiente.
- Falta definir mediante ADR la autoridad web server-side para emisión DIAN; las cuatro llamadas `window.api.factus` no tienen implementación web en `app/api`/Functions. La indisponibilidad aprobada sigue limitada a los dos IDs; no se ha ampliado la política a otros tenants.
- No se declara Gate I `PASS`.

## Preparación del Trial de Diana — actualización 2026-10-14

La tabla de la revalidación de las 19:03:51Z conserva el estado observado en
ese instante. En la actualización inicial del runbook, el objetivo del Trial
para `2026-10-15` todavía estaba pendiente de confirmación; véase la
confirmación posterior del administrador del proyecto registrada abajo.
No se creó ni activó el tenant real, no se inició el Trial, no se importó el
catálogo y no hubo escrituras productivas.

El ensayo local `npm run e2e:bodega-u4-u5` terminó con `12 passed` en 2.6
minutos usando Firebase Emulators, proyecto demo y fixtures aislados. Incluyó
onboarding del perfil comercial, aislamiento multi-tenant, disponibilidad,
aprobación y confirmación de ventas, efectivo sin turno con recibido/cambio,
consumo de inventario y registro financiero. Firebase Functions Emulator
mostró una advertencia de permiso denegado al consultar Secret Manager del
proyecto demo; no impidió las pruebas y no se accedió ni cambió ningún secreto.
Este resultado no sustituye el deploy ni el smoke autenticado productivo.

Para la preparación de Diana se conserva el alcance aprobado: Distribuidora
Las Jiménez, vertical `BODEGA_MVP1`, Diana como administradora inicial y
creación posterior de vendedores/roles por ella; oferta anual tenant-specific
de `1.600.000 COP`, pago manual y Trial de 30 días. La aprobación de contenido
del catálogo (110 productos, empaques y precios de venta, inventario inicial
en cero) está reportada en la reconciliación previa, pero el CSV local concreto
no tiene aprobación verificable ni cotejo fila por fila con la fuente visual.
No se halló un archivo maestro digital editable aprobado para importar. No se
registran datos comerciales reales ni se inventan credenciales
durante la preparación. Una vez autorizado el bootstrap, verificar de forma
read-only estado y periodo del Trial, membresía/rol/claims de Diana, credencial
temporal, módulos y espacio; Diana completará el perfil al primer acceso y
creará/asignará roles a sus vendedores. La entrega de credenciales será fuera
de banda (WhatsApp si Diana lo elige); el sistema no integra ese envío ni se
registrarán claves en evidencia. Con stock inicial cero, una venta real espera
el ingreso de inventario por el flujo canónico de compras, una vez que Gate I
certifique su despliegue productivo.

El Trial podrá comenzar en modo no fiscal conforme a la aceptación operativa,
pero la emisión DIAN web no está disponible: no existe actualmente una ruta
web server-side de Factus. Esta limitación no se presenta como emisión fiscal
funcional ni como cierre de Gate I. El guard UI de ADR-SAAS-079 sigue limitado
a `Cafe Atrato` y `Prueba`; no se amplió el allowlist al tenant todavía
inexistente de Diana.

La fecha acordada más reciente para iniciar el Trial es `2026-10-15`. El
administrador del proyecto confirmó el `2026-10-14` que Diana se la comunicó
directamente. Esta evidencia conserva la atestación del administrador, sin
almacenar la comunicación original; no representa inicio del Trial ni
autorización para crear el tenant. Las verificaciones y autorizaciones
aplicables siguen siendo condición previa.

No se creó ni activó el tenant real, no se inició el Trial, no se importó el
catálogo y no hubo escrituras productivas.

## Snapshot previo de PR #596 y fuente visual del catálogo — 2026-10-14

Este bloque conserva un snapshot preliminar: el head `c5670893098e90a40ce8e72ddcc1ee6c107df0a9` tenía los checks `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments` en `PASS`, con CI `38627843729` completada `success` a las `20:12:55Z`. Después se añadieron los commits `dc59ba6` y `0a64720`, por lo que ese resultado no es el de la revisión final. PR #596 terminó integrado como `fbd45436f62eb06950bf9a671e204d9b00679f3d`; sus checks finales y CI post-merge están en la sección de cierre más abajo.

El responsable proporcionó cuatro fotografías de las hojas impresas, que sí
constituyen la fuente visual del catálogo y cubren las filas 1–110. En las
ubicaciones consultadas del proyecto y recursos disponibles no se encontró el
archivo maestro digital editable aprobado (CSV o XLSX). La transcripción
privada local pasó únicamente controles estructurales: 110 filas con numeración
consecutiva 1–110, cuatro campos esperados sin vacíos, 110 precios numéricos,
stock cero en las 110 filas y ningún nombre de producto duplicado tras
normalización. No se realizó cotejo semántico fila por fila contra las fotos y
la aprobación previa del contenido no acredita la aprobación del CSV concreto.
El archivo permanece como borrador y no se importó. Diana o la persona
responsable del catálogo debe aprobar esta transcripción exacta después del
cotejo y resolver descripciones con empaque/unidad ambiguos, o proporcionar el
archivo maestro aprobado. La regla documentada `x N unidades` expresa un
empaque de N y las bebidas fuertes sin múltiplo expreso se venden por unidad;
no se infieren otros factores. No se versionaron las imágenes ni la
transcripción, porque el repositorio remoto es público.

La lectura read-only de producción de `2026-10-14T20:51:56Z` mantiene Gate I
`INCOMPLETE`: 104/104 Functions activas en Node.js 22; el hash remoto de
`registrarCompraOperativaV1` sigue siendo anterior al guard fuente; Firestore
Rules conserva el `MISMATCH` descrito en la matriz y Storage coincide. El
deployment Vercel `READY` más reciente continúa en SHA
`1c2f155653536b1fd8e1925db931e2354fa41f7d`, no el SHA integrado; no se ejecutó
smoke autenticado por falta de identidad y alcance productivos autorizados. El
collector observó PITR deshabilitado, un schedule y 35 backups. El restore
aislado del 14-oct permanece documentado como `VERIFIED`, aunque su atestación
externa no fue importada por el collector. No se desplegó ni escribió en
producción.

## Cierre post-merge de PR #596 y estado vigente de Gate I

### PR #596

| Control | Resultado |
|---|---|
| Estado y jerarquía | `MERGED` en `2026-10-14T21:31:25Z`; Goal `G-SAAS-02`, M2, E2.2. |
| Head integrado | `0a64720f6e71f1079d41e11d123af5c6016ab460`. |
| Merge SHA y `origin/main` | `fbd45436f62eb06950bf9a671e204d9b00679f3d`; verificado después del merge. |
| Checks pre-merge | `Tipos y pruebas` run `38637365549`, `Vercel Preview` y `Vercel Preview Comments`: `PASS` para head `0a64720`. La vista Vercel es Preview, no producción. |
| CI post-merge | Run `38640922904`, SHA `fbd45436f62eb06950bf9a671e204d9b00679f3d`, `completed/success` a las `2026-10-14T21:55:47Z`; job `Tipos y pruebas` completó 109 pasos sin fallos. |
| Auditoría y mutation audit | `APROBADO PARA MERGE`; cuatro archivos Markdown únicamente. Diff desde `f08fa1ca`: runbook, Goal y dos evidencias; sin runtime, Rules, Functions, catálogo/fotos, datos de cliente, IAM, Secrets ni despliegue. `git diff --check` pasó. |

### Lectura post-merge, solo lectura

El collector `scripts/g-saas-02/release-evidence.ts` se ejecutó de nuevo a las
`2026-10-14T21:56:43Z` contra `main @
fbd45436f62eb06950bf9a671e204d9b00679f3d`. Reportó `INCOMPLETE`,
`readOnly=true`, `productionWrites=false`, `collectionErrors=[]`.

| Área | Estado | Evidencia / siguiente acción |
|---|---|---|
| `origin/main` y CI | `PASS` | `origin/main` coincide con `fbd45436`; run `38640922904` del mismo SHA `completed/success`. |
| Functions | `PASS` disponibilidad / `FAIL` versión requerida | 104/104 activas, Node.js 22 y hashes reconciliados. `registrarCompraOperativaV1` conserva hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard fuente; deploy dirigido `NOT EXECUTED`, requiere preflight y autorización específica. |
| Firestore Rules | `FAIL` | SHA fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; 14 divergencias efectivas. No desplegar hasta cerrar compatibilidad y autorización. |
| Storage Rules | `PASS` | Hash fuente/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` coincide. |
| Vercel producción | `FAIL` publicación del SHA objetivo | El collector no observó deployment/status para `fbd45436`. La consulta directa anterior observó `READY` en SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d` del 6-oct. Publicación manual `NOT EXECUTED`; falta autorización específica y rollback fijado. |
| Smoke productivo | `NOT EXECUTED` | Sin atestación; falta identidad y alcance de producción autorizados expresamente. No improvisar credenciales ni sustituirlo por Preview/Emulator. |
| Recovery y PITR | Restore aislado `PASS` previo; collector recovery `MISSING`; PITR `PASS` según decisión | Restore independiente previamente verificado (`RPO=8.307 h`, `RTO=0.220 h`, fuente intacta, sin cutover). Este collector no recibió la atestación. PITR deshabilitado, 1 schedule/35 backups en `southamerica-east1`; no activar PITR ni restaurar `(default)`. |
| Catálogo y onboarding | Recepción `PASS`; importación `BLOCKED`/`NOT EXECUTED` | Las cuatro fotos son la fuente visual de 110 filas. No existe maestro editable aprobado en ubicaciones consultadas; el CSV privado es borrador estructural, sin cotejo semántico ni aprobación exacta. Diana o responsable debe cotejar y aprobarlo o proporcionar CSV/XLSX aprobado. El runbook deja a Diana como admin inicial, crea vendedores/roles y entrega credencial temporal fuera de banda; bootstrap real `NOT EXECUTED`. |
| Trial de Diana | `BLOCKED`/`NOT EXECUTED` | El administrador confirma que Diana le comunicó directamente la fecha objetivo `2026-10-15`. No se creó tenant ni se inició el Trial; faltan verificaciones, gates y autorizaciones aplicables. |
| Operación no fiscal | `PASS` en pruebas locales/Emulator; producción `NOT EXECUTED` | E2E Bodega `12/12` local y suites E2E CI verdes. La emisión DIAN web no está disponible; la excepción aprobada aplica solo a `Cafe Atrato` y `Prueba` y no certifica otros tenants. |
| Cambios productivos | `NOT EXECUTED` | No hubo Rules/Functions/Vercel deploy, smoke autenticado, tenant, importación, escrituras de inventario/finanzas, cambios IAM/Secrets ni PITR. |

Gate I permanece `BLOCKED`/`INCOMPLETE`; no se registra un `FAIL` de CI ni
se interpreta la disponibilidad de Functions como coincidencia de versión.
Los bloqueos reales son Rules incompatibles, hash de compra antiguo,
publicación Vercel no acreditada, falta de smoke autenticado y la brecha de
autoridad web server-side DIAN. El inicio del Trial no depende de cerrar la
emisión DIAN web, porque operará únicamente en el modo no fiscal aceptado. La
fecha está confirmada según atestación del administrador; el inicio sigue
sujeto a gates, verificaciones de seguridad y autorizaciones del Trial.

### Relectura GET-only de Gate I — 2026-10-14T22:26:37.849Z

El collector se ejecutó contra `micafe-pos`, objetivo `main @
fbd45436f62eb06950bf9a671e204d9b00679f3d`. Resultado `INCOMPLETE`,
`readOnly=true`, `productionWrites=false`, `collectionErrors=[]`.

| Superficie | Evidencia fresca | Estado / siguiente paso |
|---|---|---|
| CI y SHA objetivo | `origin/main` coincide con `fbd45436`; CI `38640922904` para el mismo SHA terminó `success`. | `PASS`. |
| Firestore Rules | Fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. La matriz clasifica 14 divergencias efectivas en paths y consumidores. | `FAIL` de reconciliación; mantener sin deploy. Matriz/tests Emulator pasan; antes del corte revalidar tenants activos/trial, dependencias y rollback. Deploy requiere autorización específica. |
| `registrarCompraOperativaV1` | `ACTIVE`, Gen2, Node.js 22, `us-central1`; hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`. El código de `main` contiene el guard de ADR-SAAS-075 en operación nueva y replay; cambio integrado por PR #576, merge `05d6f1c08f866aaf7223ba73782f8e15fe10cb43`. `functions/src/finanzas/compras.test.ts`: 16/16; build de Functions: PASS. | Hash productivo anterior: deploy dirigido `NOT EXECUTED`. Preflight de artefacto/delta exacto y autorización independiente siguen pendientes. Rollback según ADR-SAAS-075: antes del tenant real revertir código y mantener Rules cerradas; después del alta no reabrir la callable, preferir forward-fix. |
| Vercel | `vercel inspect` del alias productivo resolvió deployment `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, `READY`, creado `2026-10-06T14:52:13.319Z`. La inspección actual no expuso SHA; la lectura directa anterior asoció ese deployment con `1c2f155653536b1fd8e1925db931e2354fa41f7d`. La lista reciente mostró Preview `READY` de PR #598, SHA `94d4be3`, no producción. | `FAIL` de acreditación del SHA actual. Candidato a publicar: `fbd45436f62eb06950bf9a671e204d9b00679f3d`, SHA actual de `main` al momento de la lectura; publicación manual `NOT EXECUTED`, requiere autorización y rollback identificados. |
| Smoke autenticado | No se encontró atestación ni identidad/tenant productivos aprobados para la prueba. | `NOT EXECUTED`. Preparación mínima: el responsable debe designar un usuario existente, tenant y rol; fijar de antemano si se autoriza solo lectura o una transacción sintética y su alcance. No crear tenant ni movimientos ni usar identidades supuestas. |
| Storage y recovery | Storage fuente/remoto coincide en `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. Collector: PITR `false`, un schedule, 35 backups en `southamerica-east1`; su atestación de recovery externa figura `MISSING`. El restore aislado del 14-oct tiene evidencia separada `VERIFIED`, `RPO=8.307 h`, `RTO=0.220 h`, fuente intacta y sin cutover. | Storage `PASS`; restore `PASS` por evidencia directa; el `MISSING` de ingestión no invalida el restore. PITR deshabilitado por ADR-SAAS-031 no es bloqueo. |
| Autoridad DIAN web | Se mantienen cuatro llamadas UI a `window.api.factus` y `guardarMetadatosDian()` cliente; no existe ruta Factus en `app/api` ni callable Functions web. ADR-SAAS-079 limita la pausa UI a `Cafe Atrato` y `Prueba`, sin eliminar Factus. | `BLOCKED` para certificar emisión DIAN web; no inventar endpoint ni reactivar. Requiere arquitectura/ADR aprobada y migración server-side separada. La indisponibilidad DIAN aceptada no impide por sí sola el Trial no fiscal de Diana. |

No se ejecutó deploy, smoke, escritura productiva, creación de tenant,
activación de usuario, emisión DIAN, cambio IAM/Secrets ni operación PITR.

### Relectura GET-only de Gate I — 2026-10-14T22:37:02.623Z

El collector `scripts/g-saas-02/release-evidence.ts` consultó el proyecto
`micafe-pos` para `main @ fbd45436f62eb06950bf9a671e204d9b00679f3d`. Resultado
`INCOMPLETE`, `readOnly=true`, `productionWrites=false` y
`collectionErrors=[]`.

| Superficie | Evidencia | Estado / siguiente paso |
|---|---|---|
| `origin/main` y CI | SHA objetivo coincide con `origin/main`; run `38640922904` del mismo SHA está `completed/success`. | `PASS`. |
| Functions | 104/104 activas en Node.js 22; `registrarCompraOperativaV1` sigue activa con hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard de ADR-SAAS-075 ya presente en `main`. | Disponibilidad `PASS`; versión requerida `FAIL`; deploy dirigido `NOT EXECUTED`, requiere preflight de artefacto y autorización específica. |
| Firestore Rules | El collector no devolvió observación (`rules=null`) ni error de colección; atestación independiente `MISSING`. La última lectura directa disponible sigue siendo la de 22:26:37.849Z, con SHA fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`, SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3` y 14 divergencias efectivas clasificadas en la matriz. | No afirmar que Rules fueron revalidadas a las 22:37. Repetir lectura read-only y verificar tenants activos/trial antes del corte; sin deploy. |
| Storage Rules | La lectura previa de 22:26 observó igualdad de hashes fuente/remoto; el collector de 22:37 no recibió atestación independiente. | Último resultado directo `PASS`, no actualizado en esta lectura. |
| Vercel producción | `vercel inspect` del alias productivo sigue resolviendo `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, `READY`, target `production`, creado el 6-oct-2026; la respuesta no expuso SHA de commit. El collector no vio estado Vercel exitoso para `fbd45436`. | SHA objetivo no acreditado (`FAIL`); publicación `NOT EXECUTED`, requiere autorización y rollback específico. |
| Smoke autenticado | No se encontró atestación; siguen sin designarse identidad, tenant y alcance exactos autorizados. | `NOT EXECUTED`; no improvisar credenciales ni producir escrituras. |
| Recovery y PITR | Collector observó PITR `false`, un backup schedule y 34 backups en `southamerica-east1`. El restore aislado conserva evidencia separada `VERIFIED`, `RPO=8.307 h`, `RTO=0.220 h`, fuente intacta y sin cutover. | Punto de recuperación observado `PASS`; restore independiente `PASS`; atestación de ingestión `MISSING`. PITR deshabilitado sigue siendo decisión aprobada, no bloqueo. |
| Fecha de Diana | El administrador del proyecto confirma que Diana le comunicó directamente `2026-10-15`; la fuente es esa atestación, no un mensaje original almacenado. | Fecha `CONFIRMADA`; Trial y tenant `NOT EXECUTED`, sujetos a gates, seguridad y autorizaciones. |

No se realizó deploy, smoke, escritura productiva, creación de tenant, cambio
IAM/Secrets ni operación PITR durante esta relectura.

### Relectura GET-only de Gate I — 2026-10-14T23:09:09.523Z

El collector `scripts/g-saas-02/release-evidence.ts` consultó `micafe-pos`
contra `origin/main @ f25ef9b9743511bd5bdedeb24df90269213c99fb`. Resultado
`INCOMPLETE`, `readOnly=true`, `productionWrites=false` y
`collectionErrors=[]`.

| Superficie | Evidencia fresca | Estado / siguiente paso |
|---|---|---|
| `origin/main` y CI | El SHA objetivo coincide con `origin/main`. Run `38650796029` para el mismo SHA sigue `in_progress`; el job `Tipos y pruebas` ya completó sus pasos iniciales, pero está ejecutando `E2E R1-A Web/PWA`. | SHA `PASS`; CI `FOLLOW_UP`, no declarar `PASS` ni esperar para continuar preparativos independientes. |
| Firestore Rules | SHA fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; release actualizado `2026-08-15T04:20:46.318849Z`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`. La matriz vigente clasifica 14 diferencias efectivas de permiso. | `MISMATCH`; conservar sin deploy. La reconciliación local/Emulator no reemplaza revisión final de consumidores, preflight y autorización productiva. |
| Storage Rules | Hash fuente/remoto coincide: `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS`; sin cambio requerido. |
| Functions | 104/104 activas, `nodejs22`; la distribución de hashes por función fue reconciliada. `registrarCompraOperativaV1` sigue con hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard ADR-SAAS-075 de `main`. | Disponibilidad y observación de hashes `PASS`; versión requerida `FAIL`; deploy dirigido `NOT EXECUTED`, pendiente preflight exacto y autorización independiente. |
| Vercel producción | No se observó un estado Vercel exitoso para el SHA objetivo `f25ef9b`. | Acreditación del SHA `FOLLOW_UP`; publicación `NOT EXECUTED`, requiere autorización específica y rollback fijado. Preview no equivale a producción. |
| Smoke autenticado | El collector sigue sin atestación independiente. No se han designado identidad existente, tenant, rol y alcance exacto. | `NOT EXECUTED`; no usar identidades supuestas ni efectuar escrituras para completar el gate. |
| Recovery y PITR | El collector no recibió atestación independiente de restore (`MISSING`); observó PITR `false`, 1 backup schedule y 34 backups en `southamerica-east1`. La evidencia externa separada del restore del 14-oct continúa `VERIFIED`, `RPO=8.307 h`, `RTO=0.220 h`, fuente intacta y sin cutover. | Restore independiente `PASS` por evidencia directa; ausencia de ingestión del collector no lo invalida. PITR deshabilitado permanece aprobado por ADR-SAAS-031 y no es bloqueo. |
| DIAN web y Trial | La autoridad web server-side de emisión sigue sin estar disponible; ADR-SAAS-079 solo pausa la UI de los dos tenants autorizados y preserva Factus. La fecha `2026-10-15` está confirmada por atestación directa del administrador. | Certificación DIAN web `BLOCKED`; Trial y tenant real `NOT EXECUTED`, sujetos a gates, seguridad y autorizaciones. El modo no fiscal aceptado no certifica Gate I. |

No hubo despliegues, smoke, escrituras productivas, creación de tenant,
activación de usuarios, cambios IAM/Secrets ni operaciones PITR. Gate I sigue
`INCOMPLETE`; esta lectura fresca no elimina los bloqueos productivos.

### Verificación adicional de preflight — 2026-10-14T23:24Z

Esta actualización complementa la lectura de `23:09Z` sin reemplazar sus
hashes ni convertir una preparación en autorización:

| Frente | Verificación | Resultado y límite |
|---|---|---|
| CI post-merge de `main` | Run `38650796029`, SHA `f25ef9b9743511bd5bdedeb24df90269213c99fb`, actualizado `2026-10-14T23:18:46Z`. | `PASS` (`completed/success`). No equivale a CI de producción publicada ni a cierre de Gate I. |
| Conjunto `activa`/`trial` | GET completo de `projects/micafe-pos/databases/(default)/documents/empresas`, observado `2026-10-14T23:23:11.482Z`: 2 documentos `activa`/`trial` (1 `activa`, 1 `trial`), ambos IDs del alcance ADR-SAAS-079; 0 adicionales. No se imprimieron nombres ni datos comerciales. | `PASS` para la fotografía observada. Repetir inmediatamente antes de cualquier corte de Rules y detenerse si cambia. No es permiso de despliegue. |
| Rules en `main` | Comparación de cada fila de la matriz con `firestore.rules` en el SHA fuente de la lectura anterior. `npm run test:rules`: 45/45, 0 fallos. | Compatibilidad local `PASS`; producción `MISMATCH`. La matriz incluye los 14 paths efectivos, sus consumidores y pruebas. Tres cambios textuales son denegaciones explícitas equivalentes al catch-all; otros cambios verticalizan Bodega/preservan GENERAL o endurecen perfiles/ventas. El impacto de `/compras` y el writer DIAN exige orden de corte; el hash remoto no cambió en esta evidencia. |
| Compra legacy | `npm run build:functions`: `PASS`; `npm run test:auth-foundation`: 441 casos, 436 `PASS`, 5 `SKIP`, 0 fallos. El JavaScript compilado contiene el guard `BODEGA_USE_CANONICAL` tanto para operación nueva como para replay. Callable activa: Gen2, Node.js 22, `us-central1`, `saas-auth`; endpoint `https://us-central1-micafe-pos.cloudfunctions.net/registrarCompraOperativaV1`; hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`. | Código/artefacto local verificados; producción aún ejecuta la versión antigua (`FAIL` de versión requerida). Comando dirigido preparado, `NOT EXECUTED`: `firebase deploy --project micafe-pos --only functions:saas-auth:registrarCompraOperativaV1`. No se ejecutó `--dry-run`: la ayuda de Firebase advierte que puede habilitar APIs del proyecto. Rollback ADR-SAAS-075: antes del tenant Bodega real, revertir el código y mantener bloqueados corte de Rules y alta; después, no reabrir la callable ni Rules antiguas, preferir forward-fix/plan aprobado. |
| Vercel | GET de `vercel inspect` al alias productivo, `2026-10-14T23:24:32.444Z`: deployment `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, `READY`, target `production`, creado `2026-10-06T14:52:13Z`, alias `cafeatrato-git-main-glemynarts-projects.vercel.app`, Node `22.x`. La respuesta no expone SHA; la evidencia directa previa asocia este deployment con `1c2f155653536b1fd8e1925db931e2354fa41f7d`. | Candidato exacto a publicar: `main @ f25ef9b9743511bd5bdedeb24df90269213c99fb`, con CI post-merge `PASS`; el SHA no figura como publicado. Publicación `NOT EXECUTED`. Rollback CLI preparado al deployment conocido `vercel rollback dpl_4viR3AppP838CJjtUHYeBLo1W19C`; verificar el resultado y alias, no ejecutarlo sin autorización. |
| Smoke autenticado | No se indicó identidad productiva, tenant, rol ni operaciones autorizadas. No se consultaron credenciales. | `NOT EXECUTED`. Requisito mínimo por acordar: cuenta existente y autorizada, tenant de prueba confirmado como tal, rol/claim esperado, una lectura canaria permitida y una lectura cruzada denegada, sin ventas/compras/cambios ni llamadas fiscales. El nombre `Prueba` por sí solo no acredita que el tenant o una cuenta sean seguros para usar. |

La relectura confirma que la fecha `2026-10-15` está asentada en el runbook
como atestación directa del administrador. No se ha creado/activado tenant,
usuarios o credenciales; Trial `NOT EXECUTED`. La brecha DIAN web persiste:
cuatro llamadas UI heredadas a `window.api.factus`, sin proveedor web en
`app/api` ni Functions; `guardarMetadatosDian()` persiste desde cliente. No se
inventó una autoridad ni se modificó Factus. La pausa aceptada cubre únicamente
los dos IDs observados y no convierte la aplicación web en emisor fiscal.

No se ejecutaron cambios productivos. El orden propuesto, sujeto a preflight y
autorizaciones separadas, es: callable dirigida con verificación del hash y
guard; publicación manual del SHA `f25ef9b`; finalmente Rules globales tras
reconfirmar tenants y cerrar el rollback/operador de contingencia. No restaurar
automáticamente el ruleset anterior: reabriría escrituras de compra. Sigue
pendiente acordar quién congela esas operaciones y cuál es la vía forward-fix
si el corte falla.
