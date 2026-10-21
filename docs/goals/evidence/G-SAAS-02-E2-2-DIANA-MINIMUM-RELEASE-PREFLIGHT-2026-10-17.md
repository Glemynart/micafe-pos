# Preflight mínimo de release y onboarding de Distribuidora Las Jiménez

**Estado:** PREPARACIÓN LOCAL COMPLETADA — BLOQUEADO PARA OPERACIONES PRODUCTIVAS
**Observación:** 2026-10-17, `America/Bogota`
**Goal:** `G-SAAS-02 / M2 / E2.2`
**Checkout de trabajo:** rama aislada `codex/e2-2-diana-release-prep`
**SHA candidato:** `0ac4e9edf829acdf7213e7a20b722de9a58c2826`

Este registro conserva evidencia limitada para preparar el release y el Trial de
Distribuidora Las Jiménez. No autoriza despliegues, cambios de Rules/IAM,
registro de oferta, Bootstrap, creación de credenciales ni inicio del Trial.

## Estado Git y CI

- PR #620 está fusionado (`bb1748a24a3f5360d448daf8aacf56e343c9c0e1`).
- `main` consultado en GitHub: `0ac4e9edf829acdf7213e7a20b722de9a58c2826`.
- CI `39054744192` terminó `success` para ese SHA exacto.
- El Goal vigente mantiene M2/E2.2 en ejecución y Gate I incompleto. No se
  actualizó el Goal durante este preflight.

## Inventario mínimo de Functions

Proyecto consultado explícitamente: `micafe-pos`, región `us-central1`. La
cuenta de Cloud CLI activa se verificó (identificador omitido en este documento
público); el proyecto por defecto
de gcloud estaba sin configurar. El listado regional produjo 105 Functions.

| Callable | Producción observada | Candidata en `main` | Consecuencia que debe resolver el preflight |
|---|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, codebase `saas-auth`, `nodejs22`, actualizada `2026-08-15T04:27:10Z` | `saas-commercial` | Mismo nombre público en otra codebase: puede colisionar o exigir cambio de ownership; no asumir actualización transparente. |
| `consultarOfertaComercialTenantSaas` | No aparece en el inventario regional | `saas-commercial` | Creación prevista si un inventario inmediatamente anterior confirma que sigue ausente. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, codebase `saas-auth`, `nodejs22`, actualizada `2026-08-15T04:27:36Z` | `saas-bootstrap` | Mismo nombre público en otra codebase: requiere resolver explícitamente colisión/ownership y continuidad. |

Las dos callables observadas en producción usan
`882525811433-compute@developer.gserviceaccount.com` como identidad de runtime.
El manifiesto de Functions no demuestra que sus permisos sean mínimos. No se
modificó IAM. `OPERATIONAL_PIN_PEPPER` existe en producción y tiene una versión
habilitada; solo se consultó metadata, nunca el valor.

El candidato `saas-commercial` declara exactamente `ejecutarComandoComercialSaas`
y `consultarOfertaComercialTenantSaas`. `saas-bootstrap` declara exactamente
`solicitarBootstrapEmpresarialSaas`, en `us-central1`, Node.js 22, autenticación
Firebase obligatoria y facultad canónica `BOOTSTRAP_EMPRESARIAL_SOLICITAR`.
El handler no admite que el payload aporte facultades. Su única dependencia de
Secret es `OPERATIONAL_PIN_PEPPER`.

**Manifiesto condicional; no ejecutar aún:** cualquier deploy futuro debe
dirigirse exclusivamente a `saas-commercial` y `saas-bootstrap`, en operaciones
separadas y tras un plan remoto exacto. Los selectores candidatos son:

```text
firebase deploy --project micafe-pos --only functions:saas-commercial
firebase deploy --project micafe-pos --only functions:saas-bootstrap
```

Los comandos no se ejecutaron. Antes de cada uno, el operador deberá obtener un
plan/inventario vigente que enumere toda creación, actualización o eliminación.
Abortar si el plan elimina o reemplaza una callable existente, muestra otra
Function, secreto, proyecto o región, o no demuestra cómo conservar el nombre
público sin interrupción. No desplegar `saas-auth` completo: el código candidato
ya no exporta allí las dos callables que aún aparecen en producción. La retirada
del ownership anterior no queda autorizada por este manifiesto.

## App Hosting y Firestore Rules

- Backend productivo: `micafe-pos`, `us-central1`, URL
  `https://micafe-pos--micafe-pos.us-central1.hosted.app`, runtime Node.js 24.
- El backend conserva el único rollout observado `build-2026-10-15-001`, estado
  `SUCCEEDED`, build `READY`, fuente exacta
  `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`. No sirve el `main` actual.
- La última evidencia previa confirmó 100 % de tráfico en aquel build; la
  lectura actual confirma el rollout exitoso, pero no devolvió un campo de
  porcentaje de tráfico. No se inició otro rollout. La ruta del Backoffice
  respondió HTTP 200 sin que esto pruebe una sesión autenticada.
- Rules productivas: release `cloud.firestore`, ruleset
  `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, hash SHA-256 raw
  `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`.
- Rules candidatas en el SHA anterior: SHA-256
  `9f524f8333a3bf6b7ac298e2ad34358af69fbb9744d56c78dd8d1e7bf4ba5345`.
  El diff semántico ya verificado identifica diferencias de seguridad: las Rules
  remotas permiten a administradores del tenant crear/eliminar compras sin el
  guard del control; el candidato las restringe y limita otras lecturas Bodega.
  Las Rules remotas además permiten una transición de venta pendiente que el
  candidato deniega. Rules no se desplegaron.

La divergencia de Rules bloquea declarar seguro el release comercial de Bodega.
El rollout de App Hosting, Functions y Rules requiere aprobaciones operativas
separadas y sus propios preflight/rollback; el éxito del CI no las concede.

## Oferta, Bootstrap y estado del tenant

Lecturas Firestore de solo lectura, con rutas exactas del ID aprobado:

- `empresas/distribuidora-las-jimenez`: HTTP 404.
- `ofertas_comerciales_tenant/distribuidora-las-jimenez`: HTTP 404.
- `ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026`: HTTP 404.
- `planes/mvp_comercial/versiones/2`: HTTP 200, estado `PUBLICADA`,
  periodicidad `ANUAL`.

El 404 confirma ausencia de esas rutas exactas en la lectura, no descarta un
tenant duplicado bajo otro ID. Antes de Bootstrap se debe buscar duplicado por
el Backoffice/mecanismo canónico autorizado.

La evidencia administrativa vigente declara oferta anual manual por
`1.600.000 COP`, desde `2026-10-16`, sin vencimiento. No es evidencia firmada o
directa de Diana. El código del candidato fija estos términos en servidor y
exige crear y luego aprobar la oferta mediante `CrearOfertaComercialTenant` y
`AprobarOfertaComercialTenant`; la oferta no activa el Trial. Las callables de
oferta deben estar disponibles y verificadas antes de registrar la oferta.

Bootstrap con `vertical: BODEGA_MVP1` exige `paisFiscal`; el responsable declaró
`CO`. Puede crear el ancla de Auth sin correo usando `nombreAdministrador`,
primero deshabilitada, y la vincula a una membresía admin. El código canónico
genera la credencial temporal en el flujo de Bootstrap, usa el Secret, no
persiste el PIN y permite recuperar/reintentar por empresa; habilita la
identidad al emitir claims. El Trial anual es exactamente 30 días, empieza con
la fecha del Bootstrap exitoso y se crea dentro de esa transacción; no se debe
anticipar, iniciar por calendario ni reiniciar.

La sesión productiva actual no se pudo inspeccionar con la herramienta de UI:
falló la determinación confiable de URL de Edge y se detuvo el uso de Computer
Use. El usuario indicó que tiene sesión iniciada, pero no hay evidencia actual
del UID ni de sus facultades efectivas. Antes de las operaciones, el Backoffice
productivo debe mostrar/consultar de forma read-only el operador activo con
`COMERCIAL_GOBERNAR` y `BOOTSTRAP_EMPRESARIAL_SOLICITAR`. No se debe deducirlas
de `RELEASE_COMPRAS_GOBERNAR`.

## Validación local en el candidato

Instalación reproducible desde lockfiles completada en el worktree. No se
modificaron archivos versionados por las instalaciones.

| Verificación | Resultado |
|---|---|
| `npm --prefix functions-commercial run build` | PASS |
| `npm --prefix functions-commercial run test:discovery` | PASS, 1/1 |
| `npm --prefix functions-bootstrap run build` | PASS |
| `npm --prefix functions-bootstrap run test:discovery` | PASS, 2/2 |
| `npm --prefix functions-bootstrap run test:module-load` | PASS, 1/1; el module-load no ejecuta I/O de Firestore/Auth ni lee Secrets |
| `npm --prefix functions-bootstrap run test:authorization` | PASS, 1/1; rechaza sesión anónima antes de leer Firestore y rechaza operador sin la facultad canónica |
| `npm --prefix functions test` | PASS, 455 pruebas; 448 pass, 0 fail, 7 skip |
| `npm run build:functions` | PASS, después de instalar dependencias raíz desde su lockfile |
| CI remoto | PASS, run `39054744192` en el SHA exacto `0ac4e9…` |

Las pruebas cubren autorización comercial en la frontera de dominio y la
autorización de la callable Bootstrap, términos fijados en servidor,
idempotencia/replay/conflicto, empresa
duplicada, plan publicado, Trial de 30 días, ancla Auth deshabilitada, recuperación
sin duplicar identidades, no persistencia del PIN y emisión de claims. Son
pruebas unitarias locales; no certifican la callable ni los datos remotos.
El build de Next y el E2E no se repitieron: CI actual está verde y el E2E
`e2e:bodega-u4-u5` tiene evidencia histórica 12/12 del 2026-10-14; ninguna de
estas pruebas acredita el SHA servido actual ni las Rules remotas.

No se encontró una corrección de comportamiento necesaria para satisfacer los
contratos aceptados: los adapters y servicios candidatos pasan sus pruebas. Se
añadió una prueba unitaria del boundary Bootstrap para comprobar el rechazo de
auth ausente y la facultad equivocada; no se alteró la lógica de Functions ni
los manifiestos de despliegue.

## Catálogo privado

El borrador privado de 110 filas continúa sin aprobación y no se copió ni se
incluyó en Git. Para pedir revisión sin inferencias, Diana/cliente debe confirmar
la unidad/presentación exacta de las filas **31, 37, 38, 48, 55, 63, 73, 77, 78
y 108**, o proporcionar un archivo digital maestro aprobado. No se dedujeron
costos, proveedores, categorías, códigos de barras ni existencias. La aprobación
del catálogo bloquea la importación y la readiness operativa. El contrato de
Bootstrap puede crear un tenant vacío, pero E2.2 exige preparar la configuración
Bodega antes de crear/configurar el tenant real; por tanto, no se debe usar la
posibilidad técnica del Bootstrap para eludir ese gate. No iniciar una venta sin
productos e inventario cargados por flujo canónico.

## Secuencia y recuperación para revisión

1. **Preflight nuevo, read-only:** verificar SHA de `main`, CI, proyecto/región,
   backend/rollout, Rules activas, inventario de Functions, codebases, secretos
   metadata, plan/oferta/empresa por rutas canónicas y operador autenticado.
2. **Functions comerciales:** comparar el plan exacto con las tres callables
   anteriores. No iniciar si la migración de ownership implica delete/recreate,
   interrupción, cambio de URL o afecta otro recurso. Confirmar versión y hashes
   remotos después de cada paquete.
3. **Rules:** solo con preflight compatible y autorización separada; preservar
   el ruleset `d5e205db…` como referencia de recuperación y validar el ruleset
   resultante mediante pruebas locales y lecturas remotas. No copiar a ciegas.
4. **App Hosting:** rollout manual del SHA de `main` que haya sido expresamente
   autorizado, manteniendo rollout automático desactivado. El SHA anterior
   `5c5c4fdd…` es la referencia observada para posible rollback, no autorización
   para volver a servirlo.
5. **Gobernanza comercial:** con sesión verificada y facultad, registrar y
   aprobar la oferta en Backoffice. Confirmar lectura canónica del estado antes
   de cualquier Bootstrap.
6. **Bootstrap:** con facultad `BOOTSTRAP_EMPRESARIAL_SOLICITAR` y autorización
   operativa específica, crear el tenant solo si sigue ausente, con nombre
   comercial aprobado, nombre de administrador confirmado, `CO`, plan publicado
   v2, `BODEGA_MVP1` y 30 días. Confirmar empresa, oferta consumida, Trial,
   membresía/claims, Auth, credencial, configuración y Espacio sin revelar la
   credencial.
7. **Rollback:** ante incompatibilidad o error, detener nuevos cambios; conservar
   IDs/versions/logs no secretos; restaurar únicamente el build/ruleset/revisión
   previamente conocidos mediante el mecanismo soportado y con autorización
   correspondiente. No retirar Functions antiguas ni borrar recursos como
   rollback automático. En caso de resultado ambiguo de Bootstrap, consultar el
   estado canónico antes de reintentar por la idempotencia de empresa.

El único rollout App Hosting observado para rollback es
`build-2026-10-15-001`/`5c5c4fdd…`; el ruleset anterior es `d5e205db…`. Para
Functions no se obtuvo un artefacto/hash de build reproducible del código de
agosto, así que no hay un rollback de Functions demostrado; primero se requiere
exportar/identificar la revisión servida y una estrategia de continuidad de
ownership antes de cualquier mutación.

## Decisiones y bloqueos antes de entregar el Trial

1. **Autorización separada de despliegue:** manual App Hosting al SHA actual
   aprobado, despliegue dirigido de Functions con plan sin eliminaciones ni
   interrupción, y despliegue de Rules tras satisfacer sus gates. No se concede
   aquí ninguna de las tres.
2. **Autoridad remota:** evidencia actual de sesión productiva y facultades
   `COMERCIAL_GOBERNAR` y `BOOTSTRAP_EMPRESARIAL_SOLICITAR`; no basta la facultad
   de release de compras ni la declaración de sesión abierta.
3. **Datos de alta:** nombre/displayName exacto que Diana aprueba para su cuenta
   inicial y canal seguro fuera de banda para entregar la credencial temporal.
   El correo no es obligatorio para esta ruta y no debe inventarse.
4. **Catálogo:** aprobación del archivo digital o respuestas a las diez filas
   ambiguas antes de importación y readiness operativa; mantener fuera de Git.
5. **Duplicados:** búsqueda canónica por razón social/identificador comercial
   antes de Bootstrap; el 404 del ID acordado no descarta otro ID.
6. **Validación post-release:** smoke autenticado de Backoffice, gobernanza,
   oferta, Bootstrap, acceso admin y operación no fiscal. No crear el tenant ni
   iniciar el Trial antes de esa evidencia y una autorización operativa de alta.

El corte de compras de ADR-SAAS-081 es independiente: no se inicializó ni pausó
ningún control en este trabajo. La decisión sobre tenants y ventana de corte no
debe mezclarse con el onboarding de Diana.

**Resultado:** código y pruebas locales listos; onboarding no entregado y
producción bloqueada por Rules divergentes, Functions con ownership distinto al
candidato, App Hosting sirviendo SHA anterior, autoridad autenticada no
revalidada y decisiones de identidad/catálogo pendientes.

## Addendum — ajuste de prioridad y verificación de sesión (2026-10-17)

Este addendum conserva el informe anterior como fotografía histórica y actualiza
solo dos interpretaciones que cambiaron durante la continuación de E2.2:

1. **Catálogo:** por decisión de negocio del responsable, el catálogo definitivo
   se difiere hasta que Diana entregue su lista. La afirmación anterior de que
   E2.2 exige preparar el catálogo antes de crear/configurar el tenant queda
   supersedida en ese alcance. La aprobación sigue siendo requisito antes de
   importar productos y declarar readiness comercial; no se importará el
   borrador. La inspección local del Bootstrap y las dos pruebas focalizadas
   descritas en el runbook respaldan que el tenant inicial puede tener cero
   productos/presentaciones conservando capacidades no vacías derivadas del
   Plan. Esto no es certificación remota ni habilita una escritura productiva.
2. **Sesión de operador:** se inspeccionó la sesión de Edge en el Backoffice
   productivo y su lista canónica. El UID (omitido en este documento público)
   corresponde a un operador activo, autorización v3, con
   `COMERCIAL_GOBERNAR`, `BOOTSTRAP_EMPRESARIAL_SOLICITAR` y
   `RELEASE_COMPRAS_GOBERNAR`. La lista también muestra un segundo UID (omitido
   en este documento público), activo con `OPERADORES_GOBERNAR`,
   `COMERCIAL_GOBERNAR` y `BOOTSTRAP_EMPRESARIAL_SOLICITAR`, pero sin
   `RELEASE_COMPRAS_GOBERNAR`. Esta comprobación es evidencia de la UI productiva
   autenticada y sus registros canónicos; no se infiere el correo de ninguno ni
   se ejecutó una callable. No se modificaron operadores ni facultades.

El ajuste no cambia los demás gates del informe. En particular, el estado de
App Hosting, Functions y Rules allí registrado es evidencia histórica que debe
revalidarse antes de una operación; no se consultaron ni modificaron recursos
remotos en esta continuación. Siguen pendientes el nombre de administrador
autorizado por Diana, el canal externo seguro de entrega de la credencial,
búsqueda canónica de duplicados, alta/aprobación de la oferta, los gates de
release y la autorización específica para el Bootstrap. No se creó el tenant,
no se registró la oferta y no se inició el Trial.

## Addendum — revalidación parcial de `main` y producción (2026-10-17)

Observación iniciada con herramientas de solo lectura el `2026-10-17T19:34:19Z`
(14:34:19 `America/Bogota`). Se hicieron consultas remotas explícitas de solo
lectura. No se ejecutaron despliegues, invocaciones, `dry-run` ni preflight de
despliegue Firebase CLI, ni escrituras de negocio.

### Candidato y CI

- `git ls-remote origin refs/heads/main` devolvió
  `0ac4e9edf829acdf7213e7a20b722de9a58c2826`. La rama aislada
  `codex/e2-2-diana-release-prep` está en
  `567d3b670a1a811cc7f4de8be2d744ca6c60c259`, cuya base/parent observada es
  ese mismo SHA de `origin/main`.
- `gh run list -R Glemynart/micafe-pos --branch main --limit 5` mostró el run
  `39054744192` en `success` para `0ac4e9…` (actualizado
  `2026-10-17T18:04:51Z`). Esto valida `main` remoto, no el HEAD local ni los
  cambios de trabajo sin commit de esta rama.

### App Hosting productivo

La lectura REST del backend, build, rollout y tráfico confirmó backend
`micafe-pos` en `us-central1`, URL
`https://micafe-pos--micafe-pos.us-central1.hosted.app`, sin reconciliación
activa; build `build-2026-10-15-001` en `READY`, SHA
`5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`; rollout `SUCCEEDED`, tráfico 100 %
a ese build y rollouts automáticos desactivados. Identidad reportada:
`firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
El SHA servido no coincide con `origin/main @ 0ac4e9…`; el CI verde no autoriza
otro rollout ni valida gobernanza autenticada.

### Functions productivas relevantes

Después de confirmar proyecto `micafe-pos`, número `882525811433`, estado
`ACTIVE`, se consultaron nombres concretos con
`gcloud functions describe --gen2 --project=micafe-pos --region=us-central1`.
Las cinco callables estaban `ACTIVE`, runtime `nodejs22`, y usaban como
builder (`buildConfig.serviceAccount`) y runtime
(`serviceConfig.serviceAccountEmail`) la cuenta
`882525811433-compute@developer.gserviceaccount.com`:

| Callable | Codebase/hash de etiqueta remotos | `updateTime` observado |
|---|---|---|
| `ejecutarComandoComercialSaas` | `saas-auth` / `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0` | `2026-08-15T04:27:10.213732081Z` |
| `solicitarBootstrapEmpresarialSaas` | `saas-auth` / `b9a033fcf119a92fa942f158e3b4ac4e609f1983` | `2026-08-15T04:27:36.321446180Z` |
| `transicionarPausaComprasSaas` | `saas-auth` / `9a0a088d1ee7c3caf1d5d1d087f97328fb646443` | `2026-10-15T16:50:26.772565182Z` |
| `registrarCompraOperativaV1` | `saas-auth` / `9a0a088d1ee7c3caf1d5d1d087f97328fb646443` | `2026-10-15T16:50:25.789673942Z` |
| `registrarCompraBodegaV1` | `saas-bodega-operations` / `fa7f47c21b994a5ebccefded6e548e0f6b193c79` | `2026-10-14T09:29:23.381063034Z` |

`firebase-functions-hash` es una etiqueta remota, no una atestación del SHA
del candidato ni del artefacto de build. El candidato exporta las callables
comerciales desde `saas-commercial` y Bootstrap desde `saas-bootstrap`, pero
producción aún las etiqueta como `saas-auth`. No está demostrado que el traslado
de ownership sea continuo o evite borrar/recrear. Antes de mutar debe revisarse
el plan exacto por nombre/codebase y abortar ante cualquier delete, colisión,
reemplazo de servicio o interrupción. No hay rollback de Functions demostrado.

### Firestore Rules, identidad y secretos

- SHA-256 candidata de `firestore.rules`:
  `9f524f8333a3bf6b7ac298e2ad34358af69fbb9744d56c78dd8d1e7bf4ba5345`; el
  archivo coincide con `origin/main` observado.
- La lectura de releases de Firebase Rules devolvió `403 PERMISSION_DENIED`,
  razón `SERVICE_DISABLED` para el proyecto consumidor/cuota `32555940559`.
  No se habilitó API, cambió cuota ni concedieron permisos. Rules activo, hash y
  compatibilidad actuales no están verificados. El ruleset
  `d5e205db-0ab4-4db1-b5ec-1534bee39d35` queda como evidencia histórica, no como
  estado remoto vigente.
- La política directa observada mantiene `roles/editor` en la cuenta Compute
  predeterminada. No se modificó; es un privilegio amplio. La identidad App
  Hosting es distinta. `OPERATIONAL_PIN_PEPPER` tiene versión `1` habilitada;
  no se leyó su valor. La política IAM directa del secreto no mostró un binding
  para la cuenta Compute, lo cual no prueba ausencia de permisos heredados.

### Pruebas locales del árbol de trabajo

- `npm run test:rules`: Firebase Emulator, proyecto demo
  `demo-mt-u4-rules`; 47/47 pruebas pasaron, 0 fallidas, 0 omitidas. Incluye
  control ausente/no activo, tenant del control no coincidente, denegación de
  escritura directa y membresía sin permisos.
- `tsx --test functions/src/finanzas/compras.test.ts
  functions/src/platform/purchase-release-control.test.ts`: 27/27 pasaron,
  0 fallidas, 0 omitidas.
- Prueba focalizada previa de Bootstrap Bodega/DEMO con catálogo vacío: 2/2;
  el código de producción de Bootstrap no cambió. Estas pruebas no certifican
  Rules ni Functions remotas.

### Trial sin catálogo y estado de negocio

`ejecutarBootstrapEmpresarial` no consulta ni escribe
`productos`/`presentaciones_producto`; materializa capacidades del Plan,
Empresa, configuración, espacio, membresía y Trial. Con Plan `ANUAL` exige
Trial de 30 días y lo crea atómicamente al completar Bootstrap, sin una segunda
operación. Esto permite tenant vacío durante Trial, no ventas, compras ni
readiness de Bodega. No se ha creado tenant ni Trial.

La oferta anual de `1.600.000 COP`, pago manual, efectiva `2026-10-16` sin
vencimiento está confirmada como declaración administrativa, pero no está
persistida ni aprobada en producción. El flujo canónico es
`CrearOfertaComercialTenant` y `AprobarOfertaComercialTenant` con
`COMERCIAL_GOBERNAR`; Bootstrap consume la oferta aprobada atómicamente. Esta
confirmación no autoriza ejecutar los comandos.

### Bloqueos y siguiente secuencia

1. Rollout manual de App Hosting al SHA que se autorice, tras verificar el build.
2. Resolver plan/ownership dirigido de Functions comerciales y Bootstrap sin
   migración a ciegas; preservar y verificar hashes, URI y recuperación.
3. Obtener lectura verificable de Rules y cumplir Gate I/ADR-SAAS-081 antes de
   desplegar Rules.
4. Antes de cualquier escritura, comprobar sesión y facultades canónicas,
   ausencia de tenant duplicado, oferta y plan; una captura histórica de Edge
   no confirma sesión actual. No inferir identidad Firebase desde gcloud.
5. Confirmar el nombre de administrador que Diana autoriza y un canal externo
   seguro para la credencial temporal. El correo no es obligatorio para la ruta
   de Bootstrap con `nombreAdministrador`.
6. Registrar/aprobar la oferta y ejecutar Bootstrap de
   `distribuidora-las-jimenez` con `CO`, `BODEGA_MVP1`, plan publicado, 30 días
   y nombre autorizado, tras autorizaciones operativas específicas. Verificar
   Auth, membresía, claims, Trial y acceso.
7. Importar catálogo/inventario después de recibir y aprobar el maestro y antes
   de ventas/readiness.

No se modificó tenant, oferta, Trial, operador, control de compras, Rules,
Function o backend. La divergencia de SHA de App Hosting, ownership de Functions
y Rules no verificadas mantiene bloqueado el inicio seguro del Trial bajo M4.

## Addendum — continuidad de Functions y lectura actual de Rules (2026-10-17)

Investigación focalizada entre `2026-10-17T19:56:46Z` y
`2026-10-17T20:00:49Z` (`America/Bogota`: 14:56–15:00). Se preservó la rama y
su árbol de trabajo; el único archivo modificado por este addendum es este
preflight. Todas las consultas remotas fueron GET/list de alcance explícito a
`micafe-pos`; no se ejecutaron `dry-run`, preflight de despliegue, builds,
invocaciones, escrituras ni cambios IAM/API.

### Estrategia recomendada para la continuidad de Functions

La estrategia recomendada es una **actualización dirigida del mismo recurso
Firebase, una callable a la vez**, no borrar y recrear ni desplegar ambos
codebases juntos. En CLI 15.34.0 la agrupación de endpoints desplegados asigna
primero por nombre canónico
`projects/{project}/locations/{region}/functions/{id}`; después el planner
compara ese mismo ID y, si existe, planifica `update`. Para el cambio observado
de HTTPS desplegado a callable candidata, el planner lo permite como
`upgradingHttpsFunction`; con plataforma Gen2, región y trigger de evento
sin cambios, no marca `deleteAndRecreate`. El fabricator llama a
`updateV2Function` si esa marca es falsa. Esto describe el código de la versión
examinada, **no** es una garantía contractual de Firebase ni garantiza cero
interrupción. La documentación oficial explica codebases aislados y selectores
`--only`, y advierte que retirar un export puede borrar su función; no publica
un procedimiento que garantice transferir ownership entre codebases sin
interrupción ([codebases](https://firebase.google.com/docs/functions/organize-functions?gen=2nd),
[ciclo de vida y borrado](https://firebase.google.com/docs/functions/manage-functions)).

Un ejercicio local de la lógica pura incluida en el paquete instalado
`firebase-tools@15.34.0` usó endpoints sintéticos con los nombres, proyecto,
región, plataforma y tipos de trigger observados. Para ambas callables,
`groupEndpointsByCodebase` colocó el endpoint remoto existente en el bucket del
codebase candidato y `calculateChangesets` produjo exactamente un `update`,
sin `create`, `delete` ni `deleteAndRecreate`. No fue un `dry-run`, no consultó
Google Cloud y no prueba el plan remoto real.

| Opción | Efecto y condición | Riesgo, reversión y evidencia |
|---|---|---|
| Mantenerlas temporalmente en `saas-auth` | Conserva la propiedad/despliegue actuales y difiere el traslado; el candidato tendría que volver a declarar esas callables en su source original. | Menor riesgo inmediato, pero posterga ADR-SAAS-043/044 y exige un cambio de código/PR aprobado. No duplicar el mismo ID en dos codebases. |
| Publicar funcionalidad nueva con nombres nuevos | Deja intactos los dos endpoints y permite añadir otra callable no colisionante; requiere migrar al cliente y no prueba la transferencia del endpoint actual. | Puede crear contratos y llamadas dobles, especialmente para Bootstrap; alternativa solo si se acepta explícitamente el cambio de API. No es equivalente al objetivo del traslado. |
| Actualizar el mismo ID desde el nuevo codebase (**recomendada**) | Ejecutar el despliegue dirigido para un único ID, manteniendo `project`, `region`, Gen2/HTTPS callable y auth de aplicación. | Requiere preflight autorizable y aprobación productiva independiente. Abort ante delete/create, `deleteAndRecreate`, cambio de URI/region/runtime/identidad/invoker/secret, colisión, grants no aprobados o cualquier operación no prevista. Una actualización puede crear revisión Cloud Run y no prueba continuidad sin observación. |
| Borrar y volver a crear durante una ventana | No es necesario según el branch de planner local cuando los invariantes anteriores se conservan. | No recomendado: cambia el endpoint por un intervalo, contradice el plan mínimo y necesita decisión/ventana de mantenimiento explícitas si el planner real exige esa acción. No hacerlo automáticamente. |

Comandos **propuestos para una futura autorización**, no ejecutados:

```text
firebase deploy --project micafe-pos --only functions:saas-commercial:ejecutarComandoComercialSaas
firebase deploy --project micafe-pos --only functions:saas-bootstrap:solicitarBootstrapEmpresarialSaas
```

La selección CLI reduce el alcance por codebase e ID, pero no impide por sí
sola que el flujo intente asegurar APIs o IAM. Cualquier preflight/plan remoto,
incluido `--dry-run`, y cada despliegue requieren aprobación separada que
incluya esos posibles efectos. No ejecutar después un deploy de `saas-auth`
para “limpiar” el export: primero revisar el estado y labels remotos, pues el
update asigna el label al codebase nuevo. El export distinto
`bootstrapEmpresarialCallable` debe conservarse.

### Estado, dependencias y rollback de las dos callables

Las lecturas directas de Functions y políticas IAM observaron a las
`2026-10-17T19:57:12Z`–`19:57:15Z`:

| Callable | Estado/configuración remota actual | Candidata y preservación exigida |
|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, Gen2, `nodejs22`, `us-central1`, 256 MiB, máximo 20 instancias, ingress `ALLOW_ALL`, codebase `saas-auth`; URI existente `https://ejecutarcomandocomercialsaas-w6qbeqsxfa-uc.a.run.app`; update `2026-08-15T04:27:10.213732081Z`. | `saas-commercial` mantiene ese ID/región y control `request.auth` + autorización SaaS. Sin binding de secreto observado. Deben compararse en plan runtime, invoker, trigger, URI, cuenta y env antes/después. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, Gen2, `nodejs22`, `us-central1`, 256 MiB, máximo 20 instancias, ingress `ALLOW_ALL`, codebase `saas-auth`; URI existente `https://solicitarbootstrapempresarialsas-w6qbeqsxfa-uc.a.run.app`; update `2026-08-15T04:27:36.321446180Z`. | `saas-bootstrap` mantiene ese ID/región, `request.auth`, facultad canónica y binding `OPERATIONAL_PIN_PEPPER` versión 1. No quitar ni recrear el secreto durante el move. |

Ambas declaran en remoto como identidad de build y runtime
`882525811433-compute@developer.gserviceaccount.com`; la política de proyecto
observada incluye `roles/editor` y la política del secreto otorga
`roles/secretmanager.secretAccessor` a esa cuenta. Son roles de principal,
pero build y runtime son funciones de uso diferentes aunque hoy coincidan en
correo; el privilegio Editor no se considera seguro por tratarse de producción.
No modificar esos grants en este paquete. La callable comercial ejecuta
Firestore/autoridad SaaS con esa identidad; Bootstrap requiere Firestore/Auth y
la lectura del secreto mencionado. No se leyeron valores secretos. El label
remoto `firebase-functions-hash` es metadato de CLI y no acredita SHA de source
ni imagen.

**Pre/post verificación futura:** antes de cada una, inventariar el recurso
exacto (ID, URI, region, GEN_2, runtime, ingress/invoker, service account,
memoria/instancias, trigger, labels, secret bindings), confirmar una sola
declaración en `firebase.json` y revisar el delta de APIs/IAM. Después, releer
el mismo recurso y Cloud Run service/revision/traffic; comprobar URI e invoker,
secreto Bootstrap, salud/errores y logs del periodo acotado. Probar rechazo
`unauthenticated` sin identidad válida y autorización negativa con un usuario
QA autorizado, sin ejecutar comandos comerciales ni Bootstrap que escriban.
Luego verificar la sesión autenticada autorizada sobre el endpoint sin
operación mutante. El test remoto requiere cuenta Firebase Auth QA autorizada.
Abortar ante cualquier cambio de endpoint, región, runtime, identidad,
invoker, secreto, trigger, código inesperado o comportamiento/errores.

No hay ahora un rollback exacto acreditado: los labels no prueban qué revisión
de source produce el servicio actual y no se verificó un artefacto inmutable de
agosto. Antes de autorizar publicación, identificar y conservar una revisión de
código/artefacto de recuperación y comprobarla en staging. Si el update falla,
parar, preservar logs/estado y restaurar solo desde esa fuente comprobada con
una autorización de recuperación; nunca borrar el endpoint para recuperar.

### Resultado actual de Firestore Rules y cuota

El endpoint `firebaserules.googleapis.com` se consultó directamente para el
proyecto objetivo con GET y `x-goog-user-project: micafe-pos`, sin cambiar ADC,
IAM ni APIs. La primera solicitud sin cuota explícita falló `403` con
`reason=SERVICE_DISABLED`, `service=firebaserules.googleapis.com`,
`consumer=projects/32555940559`; su mensaje dice que la ADC local no tiene
quota project. **Eso no demuestra que Rules API esté deshabilitada en el
proyecto consumidor como recurso objetivo**, ni que `32555940559` sea el ID de
`micafe-pos`; la metadata de ese consumidor no se ha verificado. La API de
Rules consultada en `micafe-pos` sí informó `ENABLED`. La solicitud explícita
con cuota de `micafe-pos` devolvió `400 INVALID_ARGUMENT` por la sintaxis del
filtro; al repetir la lectura GET acotada al proyecto sin filtro (y extraer
solo los recursos Rules relevantes), API respondió `200`. No se requirió ni
se concedió permiso nuevo. El método usa el patrón `x-goog-user-project` ya
documentado en el colector local; lectura no mutante.

La fuente remota y los hashes se volvieron a calcular a
`2026-10-17T19:59:27Z`–`20:00:49Z`:

| Ámbito | Evidencia actual | Estado |
|---|---|---|
| Base de datos `(default)` | release `projects/micafe-pos/releases/cloud.firestore`, apunta a ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, `updateTime=2026-08-15T04:20:46.318849Z`; `firestore.rules` remoto: 14.846 bytes, SHA-256 raw UTF-8 `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`; SHA-256 después de normalizar CRLF/CR a LF: 14.487 bytes, `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | **Lectura actual confirmada**; aún no compatible con candidato. |
| Candidato `origin/main` | SHA exacto actual `0ac4e9edf829acdf7213e7a20b722de9a58c2826`; blob Git de `firestore.rules`: 18.961 bytes, SHA-256 `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. La copia Windows tiene CRLF: 19.403 bytes, raw SHA `9f524f8333a3bf6b7ac298e2ad34358af69fbb9744d56c78dd8d1e7bf4ba5345`; normalizada a LF queda 18.961 bytes y coincide con el blob Git `b8fb…`. | Comparación de fuente válida con normalización común: `c3d98…` vs `b8fb…`, `MISMATCH`. Gate I continúa abierto; la diferencia no sustituye matriz semántica ni autorización. |
| Base de datos `gsaas02-recovery-20260814` | Base existente, región `southamerica-east1`; release separado `cloud.firestore/gsaas02-recovery-20260814` apunta a ruleset `6952a5d2-1d45-48d0-9209-e59bcd5f85cd`, creado `2026-10-17T04:56:00.083933Z`; fuente 163 bytes, raw SHA-256 `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb`. | Release distinto del default; no incluir este DB en un despliegue de Rules dirigido al `(default)`. Propósito/actor del release no se atribuyeron. No tocar. |
| Base de datos `gsaas02-recovery-20261014` | Base existente, `southamerica-east1`; no apareció un release dedicado para ella en la lista de Rules consultada (página completa de 3 releases). | Estado efectivo de Rules de esta base no certificado; fuera del target de `firebase.json` actual, que declara `firestore.rules` sin `databaseId`. |

Así se concilian los hashes históricos `c3d98…` (normalizado a LF en el
colector) y `fca636…` (raw UTF-8 de la respuesta API): corresponden a los
mismos bytes de Rules con 359 pares CRLF. No son SHA contradictorios. El hash
crudo de la copia Windows `9f524…` tampoco debe compararse directamente con el
blob Git LF `b8fb…`. Firebase documenta que cada base Firestore tiene su
release/reglas por separado y que la ruta `cloud.firestore/{databaseId}` es
para base nombrada; conservar ese aislamiento ([gestión de Rules](https://firebase.google.com/docs/rules/manage-deploy)).

Permisos de solo lectura documentados para cerrar esta lectura: en el proyecto
objetivo, `firebaserules.releases.list`, `firebaserules.releases.get` y
`firebaserules.rulesets.get`. Al fijar otro proyecto de cuota, la identidad
también debe poder usarlo (`serviceusage.services.use`); no se propuso ni
concedió dicho permiso. La nueva evidencia ya fue obtenida sin esa ampliación.
El release default y el hash actual quedan acreditados; **Gate I sigue
bloqueado** por mismatch, recalcular/verificar el diff de rutas y compatibilidad
contra este source, su suite registrada y las condiciones independientes de
ADR-SAAS-081. Las 47 pruebas Rules Emulator y las 27 focalizadas previas no se
repitieron: ningún código de Rules/Functions cambió.

### App Hosting, autorizaciones y onboarding

A las `2026-10-17T19:56:46Z`–`19:57:01Z`, backend productivo `micafe-pos` en
`us-central1` se observó `reconciling=false`, runtime `nodejs24`; el build
`build-2026-10-15-001` usa SHA `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`,
rollout `SUCCEEDED` y Cloud Run traffic 100 % a
`micafe-pos-build-2026-10-15-001`. El candidato exacto actual que se propone
promover es `origin/main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`;
CI run `39054744192` para ese mismo SHA está `completed/success`. No se inició
build ni rollout para él. Una publicación manual de App Hosting necesita su
propia autorización.

No se creó ni aprobó oferta, empresa, administrador, membresía o Trial.
Siguen pendientes: nombre que Diana autoriza para su administrador, canal
externo seguro para entregar código/PIN temporal, verificación en la sesión
productiva de la identidad y facultades canónicas del operador, búsqueda de
duplicado y autorización específica por cada operación de producción. El correo
no se inventa; el catálogo puede importarse después de aprobar su maestro, pero
tenant vacío no está listo para vender/comprar ni para declarar Bodega lista.
La oferta anual declarada de COP 1.600.000, pago manual, efectiva desde
2026-10-16 y sin vencimiento sigue separada del Trial de 30 días y no se
persistió.

**Próximo paso:** aprobar/ejecutar una sesión de preflight independiente para
las dos funciones en staging y producir fuente/artefacto de rollback; después
revisar el delta productivo dirigido por callable. Functions, App Hosting y
Firestore Rules conservan autorizaciones separadas. No desplegar Rules mientras
Gate I y ADR-SAAS-081 no estén aprobados, no pausar compras en este paquete, y
no crear el tenant ni iniciar el Trial.

## Addendum — revalidación de migración en staging (2026-10-17)

Lectura acotada entre `2026-10-17T15:11:25-05:00` y `15:12` (`gcloud` con una
cuenta autorizada; identificador omitido en este documento público; proyecto
fijado explícitamente en cada consulta):

- Proyecto: `micafe-pos-staging`, número `192423427245`, estado `ACTIVE`; no es
  el proyecto productivo `micafe-pos`.
- Firebase CLI local: `15.34.0`, pero `firebase login:list` devolvió
  `No authorized accounts`. `gcloud` sí tenía una cuenta activa. No se
  infiere que la sesión de `gcloud` autentique Firebase CLI ni se ejecutó un
  planner remoto.
- `ejecutarComandoComercialSaas`: `ACTIVE`, Gen2/Node 22/us-central1; label de
  codebase `saas-commercial`, `firebase-functions-hash=c9a4f86d04ac3754bfb76879f1639f6820485e9e`,
  URI `https://ejecutarcomandocomercialsaas-qn7mt3dyyq-uc.a.run.app`, build
  `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`, runtime y build SA
  `192423427245-compute@developer.gserviceaccount.com`. Cloud Run dirige 100 %
  a `ejecutarcomandocomercialsaas-00004-luv`. La revisión antigua
  `...00003-lib` sigue `Ready=True`, pero está retirada y no recibe tráfico; su
  imagen identificada es `...ejecutar_comando_comercial_saas@sha256:b334366a…`.
- `solicitarBootstrapEmpresarialSaas`: `ACTIVE`, Gen2/Node 22/us-central1; label
  de codebase `saas-bootstrap`, hash-label
  `f046722de240e5466783f8c9cbf063fc7837baf1`, URI
  `https://solicitarbootstrapempresarialsas-qn7mt3dyyq-uc.a.run.app`, build
  `75506163-1c64-42d8-8c98-785659ea8598`, misma identidad de build/runtime y
  referencia a `OPERATIONAL_PIN_PEPPER` versión 1. Cloud Run dirige 100 % a
  `solicitarbootstrapempresarialsaas-00002-fig`; la revisión `...00001-siv`
  está `Ready=True` pero retirada, con imagen
  `...solicitar_bootstrap_empresarial_saas@sha256:3b6ae35f…`.
- Las etiquetas de codebase actuales ya son las de destino (`saas-commercial`,
  `saas-bootstrap`), no `saas-auth`. La transición de ownership a esos codebases
  ya aparece en el estado remoto; no se debe repetir ni describir como pendiente
  sin una hipótesis adicional concreta. Los labels de hash no prueban la fuente
  compilada ni el comportamiento autenticado.
- **Anomalía que bloquea certificación:** la revisión activa del servicio
  `ejecutarcomandocomercialsaas-00004-luv` usa una imagen cuyo nombre/ruta de
  Artifact Registry es
  `...__consultar_oferta_comercial_tenant_saas@sha256:92aec39c…`, mientras que
  la Function apunta al nombre, source ZIP y build de
  `ejecutarComandoComercialSaas`. Esto no demuestra por sí solo una ejecución
  incorrecta, pero el mapeo servicio→revisión→imagen→build debe reconciliarse
  antes de afirmar qué código está sirviendo o que la revisión antigua restaura
  el comportamiento. No se ejecutó invocación para comprobarlo.

No se ejecutó `firebase deploy`, `--dry-run`, preflight Firebase, build,
invocación, rollback ni operación de estado. La CLI v15.34.0 realiza pasos de
aseguramiento de APIs durante su preparación antes de ramificar por `dryRun`, y
puede comprobar roles de service agents; por eso no se usó `--dry-run` como si
fuera una lectura pura. El código de esa versión, además, detecta endpoints por
ID público y puede planificar una actualización de un recurso existente; eso no
garantiza continuidad. Referencias oficiales de código exacto:
[prepare.ts v15.34.0](https://github.com/firebase/firebase-tools/blob/v15.34.0/src/deploy/functions/prepare.ts),
[functionsDeployHelper.ts](https://github.com/firebase/firebase-tools/blob/v15.34.0/src/deploy/functions/functionsDeployHelper.ts),
[planner.ts](https://github.com/firebase/firebase-tools/blob/v15.34.0/src/deploy/functions/release/planner.ts)
y [fabricator.ts](https://github.com/firebase/firebase-tools/blob/v15.34.0/src/deploy/functions/release/fabricator.ts).

**Decisión:** `NO-GO` para desplegar o declarar continuidad/recuperación. La
pregunta de transferencia de codebase ya no corresponde al estado observado;
la recuperación de las revisiones retiradas no fue probada. Para una prueba
posterior hace falta (1) reconciliar la anomalía de imagen/build por lectura
administrativa, (2) reautenticar Firebase CLI y generar un plan actual acotado,
si aún existe una actualización justificada, (3) autorizar explícitamente esa
mutación y su método de recuperación, y (4) contar con una identidad Firebase
Auth QA y pruebas no mutantes. No continuar a Bootstrap hasta cerrar esos
requisitos y obtener evidencia de recuperación realmente probada.

### Reconciliación semántica vigente de Rules `(default)`

La lectura remota actual de `micafe-pos` (15:09:52 `America/Bogota`) sigue
apuntando al ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`; SHA-256 raw de la
fuente remota `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`
y normalizado a LF `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.
El candidato actual es `origin/main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`,
Rules normalizadas SHA-256 `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`.
La matriz del 14-oct estaba anclada a `34fc2da`; comparación local confirmó que
desde ese candidato las Rules actuales añadieron 17 líneas y eliminaron 2,
exclusivamente para el guard de controles en compras y la ruta del control. Por
ello se conserva la matriz de rutas anterior como base, pero se actualiza aquí
la semántica de compras; Gate I no se cierra por esta reconciliación.

| Ruta | Rules activas de producción | Candidato vigente | Consecuencia / verificación pendiente |
|---|---|---|---|
| `/compras/{id}` | Lectura tenant autenticada; admin puede crear y borrar directamente sin consultar control de release; update denegado. | Lectura tenant autenticada; Bodega no puede escribir directamente; para otros verticales create/delete requieren control existente del tenant, `empresaId` coincidente, `estado == ACTIVA` y `revision` entera `>= 1`; update denegado. | El delta es de seguridad para todos los escritores directos no-Bodega, no solo Bodega. Validar control activo/ausente, tenant cruzado, revisión inválida, roles/verticales y que las callables canónicas sigan siendo el único escritor Bodega. |
| `/controles_release_compras/{id}` | Denegada por catch-all. | Denegación explícita de read/write. | Permiso efectivo sigue denegado; la lectura del control para evaluación de Rules es interna y no expone el documento al cliente. |
| `/productos`, `/ventas`, `/clientes`, `/turnos` | Lecturas autenticadas de tenant más amplias; ventas permiten la actualización fiscal limitada descrita en la matriz del 14-oct. | Se mantienen las restricciones por vertical Bodega: vendedor Bodega no lee estas rutas; ventas es read-only para clientes. `/productos` ya es read-only directo. | Las diferencias por rol/vertical de la matriz previa siguen aplicando porque el diff de Rules posterior se limita al guard de compras; mantener sus Emulator checks y dependencias registradas. |
| Señales Bodega (`/empresas/{empresaId}/bodega_senales/**`) | Denegadas por catch-all. | Lecturas `get` acotadas para membresía activa/UID propio según canal; sin enumeración ni escritura. | Cambio de exposición acotada; conservar pruebas de tenant cruzado, membresía revocada y no-list/no-write. |

Las diferencias de hash y comportamiento bloquean el despliegue de Rules. No se
ejecutaron pruebas nuevas en esta revisión; los resultados históricos de
Emulator son evidencia de esas ejecuciones, no certificación remota. Los
releases de `gsaas02-recovery-20260814` y la base
`gsaas02-recovery-20261014` permanecen separados; ninguna forma parte del
release `cloud.firestore` del `(default)` ni debe incluirse en un corte dirigido
al default.

## Addendum — revisión dirigida de Functions en staging

Lecturas remotas acotadas realizadas entre `2026-10-17T21:39:07Z` y
`21:48:43Z` (`16:39–16:48 America/Bogota`). Antes de consultar recursos se
confirmó el proyecto `micafe-pos-staging`, número `192423427245`, estado
`ACTIVE`, y una cuenta activa autorizada (identificador omitido en este documento
público). Todas las consultas de
Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Storage y políticas
fijaron explícitamente ese proyecto y `us-central1`; no se consultó producción.

La worktree permanece en `codex/e2-2-diana-release-prep`, HEAD
`567d3b670a1a811cc7f4de8be2d744ca6c60c259`, con los seis cambios locales
pendientes preservados. `main` remoto fue leído como
`0ac4e9edf829acdf7213e7a20b722de9a58c2826`; la diferencia de los codebases entre
ese commit y HEAD solo incluye una prueba de autorización Bootstrap y su script,
no cambios del handler. CI `39054744192` para `0ac4e9…` aparece PASS en la
evidencia del preflight. Firebase CLI local es `15.34.0`, pero
`firebase login:list` informó “No authorized accounts”. `gcloud` sí tenía la
cuenta indicada y permitió las lecturas abajo. El `.firebaserc` de la worktree
tiene alias `production=micafe-pos`, `staging=micafe-pos-staging` y no tiene
proyecto por defecto. No se usó Firebase CLI para llamadas remotas, ni se
ejecutaron planner, `dry-run`, build, deploy, invocaciones o cambios de estado.

### `ejecutarComandoComercialSaas`: procedencia y destino de la revisión

- Cloud Functions API: `ACTIVE`, `GEN_2`, `nodejs22`, `us-central1`, codebase
  `saas-commercial`, `updateTime=2026-10-06T09:46:39.969571356Z`, build
  `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`, source object propio
  `ejecutarComandoComercialSaas/function-source.zip` generación
  `1791279989908651`, label de hash `c9a4f86d…` y URI callable existente.
- Cloud Run dirige 100 % a `ejecutarcomandocomercialsaas-00004-luv`, con
  `Ready=True`. El servicio declara `FUNCTION_TARGET=ejecutarComandoComercialSaas`,
  runtime account `192423427245-compute@developer.gserviceaccount.com`, 256 MiB,
  timeout 60 s, máximo 20 instancias e ingress `ALLOW_ALL`. Su política IAM
  concede `roles/run.invoker` a `allUsers`; el handler debe hacer la validación
  Firebase Auth. No se hizo invocación para probarla.
- La revisión ejecuta la imagen
  `...__consultar_oferta_comercial_tenant_saas@sha256:92aec39ce684ae00329058cc449f90a3853824e3075bb6739d7ba37bb7258deb`.
  Sus anotaciones de revisión y el build apuntan a worker
  `consultarOfertaComercialTenantSaas`. El build `21c2f86c…` terminó `SUCCESS`
  (`09:45:38Z–09:46:21Z`), con target/source zip de esa callable.
- `consultarOfertaComercialTenantSaas` está igualmente `ACTIVE` en
  `saas-commercial`, con revisión propia `consultarofertacomercialtenantsaas-00001-gug`
  y tráfico 100 %. Reporta el mismo build y digest, pero su
  `FUNCTION_TARGET` sí corresponde a su propio ID. Los source zips versionados
  de ambas funciones tienen el mismo tamaño (135.340 bytes), MD5
  `jzR22rFx8v8y6lBb3xtcEg==` y CRC32C `0E3nZg==`, con URI y generación distintos.

**Conclusión:** hay una discrepancia real de procedencia build/revisión, no solo
el nombre textual del tag. Sin embargo, las dos funciones del codebase comparten
build, digest y metadatos de contenido de source zip, mientras que el servicio
comercial tiene el `FUNCTION_TARGET` correcto. El patrón es compatible con un
paquete de codebase compartido y una etiqueta nombrada por el target que disparó
el build; no demuestra que el handler servido sea incorrecto. Tampoco demuestra
que la ruta autenticada responda con el contrato esperado. Estado:
`PROCEDENCIA CRUZADA CONFIRMADA; ASOCIACIÓN FUNCIONAL INCORRECTA NO DEMOSTRADA`.

### Puntos de recuperación que sí existen en staging

| Callable | Revisión anterior sin tráfico | Build, fuente e imagen observados | Estado |
|---|---|---|---|
| `ejecutarComandoComercialSaas` | `...00003-lib`, creada `2026-10-06T06:29:28Z`, `Ready=True`, `Active=False`/retirada; digest `b334366ab4e4a42cd6d0ccbd6ce9c64578ac37443df07094671d11c0bb032a21`. | Build `93253a47-a139-413c-87bb-627f884cbcfa` `SUCCESS`, target correcto. Source zip versionado `.../ejecutarComandoComercialSaas/function-source.zip#1791268130758478` todavía se puede leer (130.012 bytes); Artifact Registry resuelve el digest anterior. | Material exacto identificado; recuperación funcional no ejecutada ni demostrada. |
| `solicitarBootstrapEmpresarialSaas` | `...00001-siv`, `Ready=True`, `Active=False`/retirada; digest `3b6ae35f26a6043ec42d9b64c1d0700b8787d8da40926fb097e760c338082406`. | Build anterior `26cc1a54-7d00-4429-9eac-bd80e1cdb9e5` `SUCCESS`, target correcto, source zip generación `1790015592894814`; Artifact Registry aún resuelve el digest anterior. | Material exacto identificado; recuperación funcional no ejecutada ni demostrada. |

Bootstrap está `ACTIVE`, codebase `saas-bootstrap`, Node.js 22 y `us-central1`; su
servicio dirige 100 % a `solicitarbootstrapempresarialsaas-00002-fig`, digest
`1a700d2eb9de1e55645ad517396fa000d2d6ac1857c4fd5f3f99fa963242d8ee`, con
`FUNCTION_TARGET=solicitarBootstrapEmpresarialSaas`. Su build vigente
`75506163-1c64-42d8-8c98-785659ea8598` terminó `SUCCESS` y apunta al target
correcto. Conserva el binding `OPERATIONAL_PIN_PEPPER:v1`; no se leyó el valor
ni se invocó Bootstrap.

En staging, la cuenta Compute predeterminada que actúa como identidad de build y
runtime tiene `roles/editor`, `roles/eventarc.eventReceiver` y
`roles/run.invoker` a nivel de proyecto. La política del secreto concede a esa
misma cuenta `roles/secretmanager.secretAccessor`. Los dos servicios muestran
`roles/run.invoker` para `allUsers`. No se cambió IAM ni se trató el handler
local como prueba de la implementación actualmente servida. La build compartida
y el permiso `Editor` mantienen riesgos de atribución y privilegio que requieren
aceptación o resolución separada antes de cualquier nueva mutación.

No se repitieron suites locales porque los handlers no cambiaron. El preflight
ya registra `functions-commercial` build/discovery PASS;
`functions-bootstrap` build/discovery/module-load/autorización PASS;
`npm --prefix functions test`: 455 pruebas (448 pass, 7 skip), y build global de
Functions PASS. Son pruebas locales, no autenticación real ni comportamiento
remoto. Tampoco se ejecutó una prueba de recuperación.

### Gates y siguiente acción

- **Functions/staging:** ambas callables ya están activas en los codebases de
  destino; no repetir el traslado ni volver a desplegar para corregir solo el
  nombre de imagen. `COMANDOS_COMERCIALES` contiene solo comandos que crean o
  transicionan planes, ofertas, suscripciones o empresas; no hay un comando de
  solo lectura para una prueba autenticada positiva del executor. No ejecutar
  uno para smoke. Con autorización separada y sesión QA, un payload con tipo
  inválido es rechazado después de `request.auth` y antes de leer Firestore; esa
  prueba solo validaría enrutamiento y el límite de autenticación, no el flujo de
  negocio. `consultarOfertaComercialTenantSaas` sí es un endpoint read-only, pero
  no demuestra el comportamiento del executor. Para Bootstrap limitarse a
  negativos no mutantes; una llamada exitosa puede crear empresa y credencial.
  Toda invocación remota, restauración o cambio de tráfico requiere autorización
  independiente.
- **Inspección:** las lecturas de Cloud no requieren intervención adicional con
  la identidad actual. Si una futura operación requiere Firebase CLI, el
  operador debe autenticarse localmente por el flujo interactivo autorizado; no
  pegar tokens en el chat. No ejecutar planner hasta revisar sus posibles
  efectos sobre APIs/IAM y tener autorización específica.
- **Rules:** la última lectura de hoy registrada en el preflight apunta al
  ruleset `d5e205db…`; las Rules remotas y candidatas (`b8fb…`) difieren y Gate I
  sigue abierto. No se releyeron ni desplegaron Rules en este addendum.
- **App Hosting:** el preflight registra el rollout productivo
  `build-2026-10-15-001` con SHA `5c5c4fdd…` y `main @ 0ac4e9…`, CI
  `39054744192` PASS. No se consultó de nuevo el backend productivo aquí; por
  tanto, no se declara vigente hoy el SHA servido. No se inició rollout.

**Decisión:** `NO-GO` para certificar la migración funcional, desplegar en
producción o iniciar el Trial. La evidencia identifica puntos de recuperación
reales en staging, pero no prueba que restauren el comportamiento ni resuelve la
procedencia cruzada con una prueba autenticada. Rules conserva un mismatch y
App Hosting no fue reobservado en esta inspección. No hubo cambios productivos,
despliegues, invocaciones, cambios IAM, Rules, oferta, tenant ni Trial.

## Addendum — selección del handler comercial y puntos de recuperación (2026-10-17)

Revisión acotada de solo lectura en `micafe-pos-staging`, completada alrededor
de las `17:26 America/Bogota` (`22:26Z`), más pruebas locales. Se confirmó antes
de consultar: proyecto `micafe-pos-staging`, número `192423427245`, `ACTIVE`,
cuenta operadora activa (identificador omitido en este documento público); el proyecto global de `gcloud` estaba unset y
cada consulta fijó proyecto/región explícitos. No hubo llamadas a endpoints,
despliegues, builds remotos, `dry-run`, cambios de tráfico ni escrituras.

### Despacho de `ejecutarComandoComercialSaas`

- El paquete `functions-commercial` declara como `main`
  `lib/functions-commercial/src/index.js`, Node.js 22 y codebase `saas-commercial`.
  Su entrypoint fuente reexporta, bajo nombres distintos, tanto
  `ejecutarComandoComercialSaas` como `consultarOfertaComercialTenantSaas` desde
  `functions/src/platform/commercial-callable.ts`. El código de cada callable
  crea su propio wrapper `onCall`; ambos llaman `exigirAuth(request)` antes del
  trabajo específico. El executor valida el tipo de comando antes de obtener
  Firestore; la consulta de oferta valida después de autorizar
  `COMERCIAL_GOBERNAR`.
- Los source ZIP actuales remotos son objetos/versiones distintos —executor
  generación `1791279989908651`, lectura `consultarOferta` generación
  `1791279938087216`, ambos de 135.340 bytes— pero se descargaron por sus URI
  exactos y su SHA-256 calculado localmente es idéntico:
  `500c551cd4d61c671d5d3b47da73ead43e8c5d78343b952a8f439f8c832c722c`.
  El ZIP contiene el `package.json` con el `main` anterior y el JS compilado del
  entrypoint con ambos exports. La prueba local del ZIP extraído cargó ambos
  exports, comprobó que son funciones `onCall` distintas y no invocó ninguna.
  `src/index.ts` dentro del ZIP es byte idéntico a la copia local
  (`SHA-256 384bc115103dcfba3af05bca14846c020cff8bd8a2c53200518de9b752f5eca7`).
- La revisión Cloud Run activa de `ejecutarComandoComercialSaas` es
  `ejecutarcomandocomercialsaas-00004-luv`, con 100 % del tráfico. Su variable
  `FUNCTION_TARGET` es `ejecutarComandoComercialSaas`; la revisión activa de
  `consultarOfertaComercialTenantSaas` es `consultarofertacomercialtenantsaas-00001-gug`,
  también con 100 %, y su `FUNCTION_TARGET` es
  `consultarOfertaComercialTenantSaas`. El mismo digest de imagen
  `92aec39ce684ae00329058cc449f90a3853824e3075bb6739d7ba37bb7258deb` sirve
  ambos servicios. El build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab` registra como
  target `consultarOfertaComercialTenantSaas` y fuente el ZIP de consulta; el
  ZIP de executor tiene bytes idénticos, aunque distinta ruta/generación.
- La documentación oficial del Functions Framework establece que
  `FUNCTION_TARGET` nombra el export invocado. Combinando esa regla, los exports
  reales del ZIP y los targets de cada servicio, la configuración desplegada
  **selecciona el handler correcto en cada servicio**; la etiqueta del build
  `consultarOferta...` no significa que el servicio executor despache esa
  callable. Esto resuelve la discrepancia de selección estática, no acredita una
  respuesta de ejecución autenticada.
- El ZIP remoto no es byte idéntico al candidato local completo: compilación
  comparativa encontró diferencias en `approved-tenant-offers.js`,
  `commercial-callable.js`, `audit.js` y `contracts.js`. Entre ellas, el artefacto
  conserva el guard de runtime solo-staging, mientras el código local permite
  staging y producción; además, el código desplegado no contiene el escritor de
  auditoría v2/correctiva de ADR-SAAS-084 que sí aparece en el compilado local.
  El `main` compilado sí es idéntico. Por eso el vínculo build→imagen→source ZIP
  está verificado, pero no debe presentarse el artefacto como la versión actual
  completa del candidato.

### Pruebas locales y límite de ejecución

- Se añadieron al test de discovery comprobaciones de identidad entre los
  reexports del paquete y los handlers canónicos, de `entryPoint` por callable,
  de targets observados para staging y del rechazo de un `FUNCTION_TARGET`
  cruzado. `npm run test:discovery` pasó `3/3`; el único servidor usado escucha
  en loopback y el test consulta solamente `__/functions.yaml` local.
- `npm run build` en `functions-commercial` pasó con TypeScript. No se ejecutó
  ningún handler. Estas comprobaciones prueban el contrato local/paquete y la
  asociación de nombres; no sustituyen una invocación autenticada del servicio
  remoto ni demuestran su respuesta.
- Para una futura prueba aislada —solo con autorización de invocación y una
  cuenta Firebase Auth de QA autorizada— puede enviarse al endpoint executor un
  payload callable con `tipo: "__FUNCTION_TARGET_PROBE__"` y `entrada: {}`.
  El código autentica primero y `obtenerComandoComercial` rechaza el tipo antes
  de obtener Firestore con `invalid-argument / COMANDO_PLATAFORMA_INVALIDO`.
  Esto verifica routing y el límite de autenticación sin ejecutar un comando
  comercial; aun así la invocación remota está fuera del alcance actual y no se
  hizo.

### Recovery: artefactos y compatibilidad

| Callable / revisión | Build, source ZIP e imagen | Compatibilidad observada y límite |
|---|---|---|
| Executor `...00003-lib` (anterior inmediato) | `Ready=True`, sin tráfico. Build `93253a47-a139-413c-87bb-627f884cbcfa` `SUCCESS`; source generation `1791268130758478`, 130.012 bytes, SHA-256 local `082f20c9b89bfdf5c33e97ba2f1957f486e7798112880811d6511ee8a73ce0a1`; imagen disponible `b334366a…`. Su `package.json` apunta al entrypoint compilado de `saas-commercial` y exporta el executor. | Target, proyecto y runtime service account Compute coinciden; sin secret bindings; maxScale 20. La revisión previa no declara `FUNCTION_SIGNATURE_TYPE`, cuyo default oficial del framework es HTTP, mientras la actual lo fija en `http`. Restauración funcional no probada. |
| Executor `...00002-kih` y `...00001-qob` | Builds `9a523e91-b3f8-4811-8eaa-9a388090252e` y `d133c56a-227e-4426-969c-04d026af36df` `SUCCESS`; imágenes `39c0a6e0…` y `875e9ba8…` disponibles; revisiones `Ready=True`, retiradas. | El objeto source ZIP de ambas generaciones devolvió 404 en lectura exacta. No son puntos preferidos: no se puede reconstruir aquí la correspondencia fuente-código completa. |
| Consulta `consultarOfertaComercialTenantSaas` | Solo existe la revisión `...00001-gug` (actual), build `21c2f86c…`, source ZIP generación `1791279938087216` e imagen `92aec39c…`. | No existe una revisión anterior a la observada; por ahora no hay rollback histórico previo. En una futura actualización, esta revisión solo puede ser el baseline si se conserva. |
| Bootstrap (dependencia de onboarding, fuera de la pareja comercial) | Revisión previa `solicitarbootstrapempresarialsaas-00001-siv`, build `26cc1a54-7d00-4429-9eac-bd80e1cdb9e5`, source generation `1790015592894814`, SHA local `8e1c1d46f5924ea5c04019b256e3783cdb2a1caf55a782674a0a200bcbb70cc0`, imagen `3b6ae35f…`; todo identificable y disponible. | Runtime service account y referencia `OPERATIONAL_PIN_PEPPER:v1` coinciden con la actual; la versión 1 figura `ENABLED`. La revisión previa no declara maxScale y la actual sí fija 20. No se leyó el secreto ni se probó recuperación. |

Procedimiento propuesto, todavía no ejecutado: antes de desplegar, guardar el
inventario actual de servicio, tráfico, target, URI, runtime, env/secret
referencias (nunca sus valores), identidad, límites, revisión, build, source ZIP
y digest; confirmar que el artefacto anterior sigue disponible y que no hay
cambios de datos incompatibles. Ante fallo, detener nuevos cambios y, bajo
autorización separada, dirigir 100 % del tráfico a la revisión anterior exacta
del mismo servicio; verificar `Ready`, revisión/porcentaje, URI, target,
identidad/configuración y el smoke autenticado no mutante. Luego restaurar el
tráfico aprobado y comprobar que no quedó una división persistente. Cloud Run
documenta el cambio de tráfico a una revisión anterior, pero ese control no
prueba por sí solo la recuperación funcional de estas callables. Para `consultarOferta...`
no hay revisión previa hoy. Ninguna recuperación se considera demostrada.

### Gate I y onboarding sin escrituras

- Se reutiliza la lectura Rules de producción registrada antes en este
  preflight: ruleset `(default)` `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, SHA
  remoto normalizado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`
  frente al candidato `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`.
  Es lectura previa del mismo día, no reobservada en este addendum. En particular,
  producción todavía permite a administradores crear/borrar compras directas,
  mientras el candidato exige control válido para verticales no-Bodega y
  bloquea escritura directa Bodega; la ruta de control es denegada al cliente en
  ambos. Las señales Bodega y otras rutas también difieren. Gate I sigue abierto:
  falta preflight/diff semántico de la lectura vigente, compatibilidad de
  Functions legacy y cumplir independientemente ADR-SAAS-081 antes de cualquier
  despliegue de Rules. Los resultados previos de Rules Emulator `47/47` y de
  compras/control `27/27` se reutilizan; no se repitieron porque el código de
  Rules/compra no cambió en esta tarea.
- La secuencia comercial sigue sin escrituras: (1) comprobar duplicados y Plan
  `mvp_comercial` publicado; (2) crear y aprobar oferta anual COP 1.600.000,
  pago manual, efectiva `2026-10-16`, sin vencimiento; (3) Bootstrap canónico de
  `distribuidora-las-jimenez`, `BODEGA_MVP1`, país `CO` y nombre autorizado; el
  Bootstrap inicia el Trial de 30 días; (4) verificar empresa, administrador,
  membresía, claims y acceso real. Oferta y Trial son distintos. No se creó la
  oferta, tenant ni Trial. El catálogo sigue aplazado: tenant vacío puede iniciar
  el Trial no fiscal según decisión E2.2, pero no está listo para ventas/compras.
- Intervención humana pendiente: confirmar el nombre exacto que Diana autoriza
  para su usuario inicial y acordar un canal externo seguro para su código/PIN
  temporal. No hace falta inventar ni exigir un correo si el contrato no lo
  requiere. Antes de escribir, revalidar en sesión productiva identidad y
  facultades canónicas `COMERCIAL_GOBERNAR` y
  `BOOTSTRAP_EMPRESARIAL_SOLICITAR`; confirmar cada autorización operativa por
  separado. Cualquier pausa/corte conserva sus propios responsables, tenants y
  ventana autorizada.

**Resultado:** la selección de handler queda demostrada por el artefacto,
exports y configuración estática; no se probó ejecución autenticada ni
recuperación. Gate I y Trial continúan `NO-GO`. No se invocaron callables ni se
desplegaron Functions/Rules/App Hosting; no se alteraron IAM, secretos, oferta,
tenant, Trial, inventario ni compra.

## Addendum — origen de módulos comerciales y bloqueo de lectura de Rules

### Reconciliación del ZIP desplegado

Se reutilizó el source ZIP exacto de staging ya descargado desde el objeto
versionado del build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab` (build `SUCCESS`),
generación `1791279989908651` para el executor. Los ZIP de executor y consulta
son objetos separados de 135.340 bytes, pero sus bytes coinciden: SHA-256
`500c551cd4d61c671d5d3b47da73ead43e8c5d78343b952a8f439f8c832c722c`. El
artefacto no contiene metadatos Git. El label `firebase-functions-hash`
`c9a4f86d04ac3754bfb76879f1639f6820485e9e` no resuelve como commit en el grafo
Git local y es una etiqueta de despliegue, no una atestación de commit. Por
tanto, se puede atribuir el ZIP al objeto, generación y build indicados, pero
**no a un commit fuente exacto**.

Hashes SHA-256 de los cuatro módulos compilados, ZIP remoto frente a la
compilación local presente al hacer la comparación:

| Módulo | ZIP remoto | Compilación local | Origen y efecto observado |
|---|---|---|---|
| `approved-tenant-offers.js` | `c947425e33e6d63ee2a0c8b613e32a82e5e21d803a170e39d03c0d76cae12e34` | `829734968a07644407cb10e65d7722f5c51ce66d6b1c24fb1a3a474ae0d3c0ef` | El ZIP usa `exigirRuntimeOfertaTenantStaging`, que solo admite staging; el código local usa `exigirRuntimeOfertaTenantPermitido`, que admite staging y producción. Introducido por `851c50bc5c46048bbbc9cd68e6d707564d51be25` (`fix: allow approved tenant offer in production`, 2026-10-16). En staging no cambia el resultado con `projectId` correcto; en producción el guard viejo bloquearía estas operaciones. |
| `commercial-callable.js` | `3ed6f332deadd5c719796d001f9fd49e03e95e816ac1aeb244f2d6b029e3f476` | `b1f1a5e8d5a2cfe24fa6e7dcd677ae893f9db9437a5efaf0b95814692c4f5c40` | La divergencia invoca el helper anterior o el nuevo en las rutas de crear/aprobar/revocar oferta y consultar oferta, por el mismo commit `851c50bc…`. La autenticación `request.auth`, validación del comando, selección del handler, autorización `COMERCIAL_GOBERNAR`/`LIFECYCLE_GOBERNAR`, acceso a Firestore y contrato de entrada/salida comparados no difieren en ese cambio. |
| `audit.js` | `6afe1fc94020181b3d07d61ea9953f752d14341be818f8f0cf9f31947f198211` | `5da44ed7bef85293ac5094f5b6d539d2527225b44c994e34e5dfa95292b22723` | El ZIP conserva el escritor/validación previo; no incorpora evidencia v2 ni `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA`. Las adiciones locales provienen de `526196bf4eb787f8e7bba6c33aea654cd41064c0` (ADR-SAAS-084), `e3217921eea38a92fc2c0c80bea66acced3438c9`, `3ddb5fe2798d56ebeb7dbc3b1fe833bb6d3bd2de` y `9598bebe7bb6aa41157a0eec3733f2409e46f7d8`. Los flujos comerciales observados aún emiten tipos v1 preexistentes, por lo que esta diferencia no cambia esos comandos comerciales; sí deja el artefacto incapaz de emitir el nuevo contrato de control/auditoría. |
| `contracts.js` | `636f6b0974021d529f4d359d493e7e3466839e4f0d524028c919ddf91e50ab8a` | `45473f182d22fa9119656332fa3703f1165a210ac91434d820373dd3975a62c4` | El ZIP no incluye `RELEASE_COMPRAS_GOBERNAR` ni los tipos añadidos para auditoría del control. El cambio se origina en `f083e075e67f1617d22ea76442de4f522dbe2a17` (ADR-SAAS-081) y `526196bf4eb787f8e7bba6c33aea654cd41064c0` (ADR-SAAS-084). No altera los permisos ni el contrato de estas dos callables comerciales, que siguen usando facultades comerciales/lifecycle; sí es una brecha para los consumidores y escritores de control de compras. |

El punto de entrada compilado (`functions-commercial/src/index.js`) del ZIP
exporta ambas callables. En cada servicio, `FUNCTION_TARGET` selecciona el ID
correspondiente; no se encontró despacho cruzado. Esto es evidencia estática del
artefacto/configuración, no prueba de respuesta autenticada. La diferencia de
los módulos no demuestra que el ZIP sea exactamente un commit anterior concreto:
no se halló un identificador de commit dentro de sus bytes ni una atestación
build→commit. No se reconstruyó ni reemplazó el artefacto.

### Rules: última lectura exitosa y nuevo intento bloqueado

El intento posterior de lectura de solo lectura contra
`GET /v1/projects/micafe-pos/releases/cloud.firestore` respondió HTTP 403,
`PERMISSION_DENIED`, razón `SERVICE_DISABLED`, con consumidor/proyecto de cuota
`32555940559` y mensaje de Application Default Credentials sin quota project.
No se habilitó API ni se modificaron credenciales/IAM. Ese error identifica la
API `firebaserules.googleapis.com` en el proyecto consumidor/cuota; **no prueba**
que la API esté deshabilitada en `micafe-pos`, no identifica un permiso IAM
faltante y no aporta el release activo. El instante exacto de esa petición no
quedó registrado en el wrapper de consulta; por ello no se inventa una hora.

La última lectura exitosa que queda en este preflight sigue siendo la del
17-oct: `(default)` → ruleset
`d5e205db-0ab4-4db1-b5ec-1534bee39d35`, SHA remoto normalizado
`c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`, frente a
`origin/main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`, candidato normalizado
`b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. Es
evidencia histórica de la última observación exitosa, no una lectura renovada
por el intento 403. Gate I permanece abierto.

Las divergencias semánticas relevantes registradas en la matriz de Gate I
siguen siendo: `/compras/{id}` permite en producción create/delete directo de
administrador sin control; el candidato bloquea escrituras directas Bodega y
exige control `ACTIVA`, tenant coincidente y revisión válida para los otros
verticales. `/controles_release_compras/{id}` permanece inaccesible directamente
al cliente. El candidato restringe además lecturas Bodega de `/productos`,
`/clientes`, `/ventas` y `/turnos`; limita la lectura Bodega de turnos al cajero
propio; hace `/ventas` read-only para clientes y restringe `/usuarios` a lectura
propia; cambia el acceso a `/movimientos_inventario` y añade lecturas `get`
acotadas de señales Bodega que hoy caen en deny-by-default. `/presentaciones_producto`
también gana una lectura autenticada no vendedor. Las rutas legacy que el
candidato niega explícitamente ya caen en denegación por catch-all en Rules
activas, por lo que esa explicitación no amplía acceso. Se conservan como
pruebas requeridas: membresía revocada/inactiva, tenant cruzado, roles y
verticales, no-list/no-write de señales, y control ausente/inactivo/tenant
incorrecto/revisión inválida. La matriz del 14-oct y el addendum de hash son la
fuente de detalle; no se repitieron Emulator suites porque no cambió el código
cubierto.

Antes de cualquier Rules release, Gate I exige confirmar en Functions
productivas que `registrarCompraOperativaV1` y `registrarCompraBodegaV1` aplican
el control para compra nueva y replay, y que `transicionarPausaComprasSaas`
implementa el contrato de ADR-SAAS-081; labels/versiones por sí solos no son
prueba de contenido. También debe satisfacerse ADR-SAAS-084 antes de emitir v2
o cambiar sus consumidores. ADR-SAAS-081 requiere declarar los IDs exactos de
tenants alcanzados, responsables y ventana; inicializar controles canónicos,
pausar y verificar antes de Rules, y conservar una recuperación compatible que
no restaure Rules que permitan escrituras directas. Esos alcance/responsables/
ventana no quedan confirmados aquí. No se desplegó Rules ni se ejecutó corte.

### Recuperación y onboarding

La recuperación documentada del executor apunta a la revisión anterior exacta
`...00003-lib`, build `93253a47-a139-413c-87bb-627f884cbcfa`, source ZIP
generación `1791268130758478` (SHA-256 local
`082f20c9b89bfdf5c33e97ba2f1957f486e7798112880811d6511ee8a73ce0a1`) e imagen
`b334366a…`. Es un artefacto identificable, pero restauración y comportamiento
no se probaron. Para `consultarOfertaComercialTenantSaas` no se observó revisión
previa; la revisión/build/ZIP/imagen actuales solo sirven como baseline futura
si se preservan antes de mutar. Ninguno está clasificado como recuperación
ejecutada y verificada.

El onboarding permanece sin escrituras y en la secuencia ya aprobada: buscar
duplicados y confirmar Plan; crear y aprobar por separado la oferta anual COP
1.600.000, pago manual, desde `2026-10-16` y sin vencimiento; luego Bootstrap
canónico de `distribuidora-las-jimenez`, `BODEGA_MVP1`, país `CO`, nombre
autorizado; verificar Trial de 30 días, membresía, claims y acceso real. El
catálogo sigue aplazado y el tenant vacío no queda habilitado para vender o
comprar. Solo faltan de Diana el nombre exacto de cuenta que autoriza y el canal
externo seguro para la credencial temporal. La identidad/facultades del operador
y la autorización de cada escritura productiva deben revalidarse en sus gates
propios.

**Resultado actualizado:** diferencias de módulos y procedencia del ZIP
acotadas; commit fuente exacto no identificable; recuperación únicamente
documentada/artefactos disponibles; Rules no revalidadas por el 403 de cuota.
Gate I y Trial continúan `NO-GO`. No se invocaron callables ni se desplegaron
Functions, App Hosting o Rules; no hubo escrituras comerciales ni cambios IAM.

### Validación local de las pruebas añadidas

En esta continuación se ejecutaron las pruebas focalizadas que cambiaron en la
worktree, sin servicios remotos:

| Comando | Resultado | Alcance |
|---|---|---|
| `npm run test:rules` | PASS, 47 pruebas, 0 fallos, 0 omitidas | Firestore Emulator con proyecto demo `demo-mt-u4-rules`; incluye los casos añadidos de control ausente/pausado/revisión cero, tenant cruzado, escritura directa Bodega y denegación de ventas. No certifica Rules remotas. |
| `npm --prefix functions-commercial run test:discovery` | PASS, 3 pruebas, 0 fallos | Descubrimiento local y correspondencia de `FUNCTION_TARGET`/export; no invoca callables ni contacta servicios remotos. |

No se repitieron builds ni suites de Functions completas: no cambió código
runtime. `git diff --check` pasó; Git informó únicamente la conversión de
line endings LF/CRLF del preflight en Windows.

### Addendum — relectura acotada y preparación de onboarding (2026-10-17)

#### Rules productivas: relectura actual fallida

Lectura GET de `cloud.firestore` en `micafe-pos`, iniciada
`2026-10-17T23:18:09.4419511Z`. Antes de consultar se verificó mediante
`gcloud projects describe micafe-pos` que el destino es el proyecto esperado
`micafe-pos`, número `882525811433`, estado `ACTIVE`. La cuenta activa de gcloud
era la cuenta operadora ya autenticada; se omite su dirección por privacidad.
La petición exacta
`GET https://firebaserules.googleapis.com/v1/projects/micafe-pos/releases/cloud.firestore`
devolvió HTTP `403 PERMISSION_DENIED`, `reason=SERVICE_DISABLED`,
`consumer=projects/32555940559`; el mensaje indica que ADC requiere un quota
project que no está configurado. No se intentó fijar otro proyecto de cuota ni
se cambiaron APIs, credenciales o IAM.

Esta respuesta no confirma que Rules API esté deshabilitada en `micafe-pos`, no
identifica un permiso IAM ausente y no contiene un release/ruleset. Por tanto,
el estado actual del `(default)` sigue `NO VERIFICADO`. La última lectura exitosa
continúa siendo histórica: ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, hash
normalizado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`
frente al candidato registrado `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`.
No se puede declarar que ese par de hashes represente el estado vigente. Gate I
permanece abierto.

La documentación IAM vigente identifica `roles/firebaserules.viewer` como rol
de solo lectura que incluye `firebaserules.releases.get` y
`firebaserules.rulesets.get` (además de sus permisos de listado). Para esta
consulta con credenciales de usuario también se requiere un quota project en el
que `firebaserules.googleapis.com` esté habilitada y el permiso
`serviceusage.services.use`. La evidencia actual no confirma que la cuenta
operadora tenga esos permisos ni que el consumidor `32555940559` sea el
proyecto de cuota autorizado. No se solicitó ni aplicó ningún binding o
habilitación. Referencias: [rol Firebase Rules Viewer](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)
y [requisitos de ADC/quota project](https://docs.cloud.google.com/docs/authentication/troubleshoot-adc).

#### Lecturas productivas del Backoffice

En el Backoffice productivo, con sesión autenticada y contexto mostrado como
`Autorización v3` / `Contexto validado`, se consultó la proyección de Empresas y
se filtró por el ID `distribuidora-las-jimenez`, el nombre exacto
`Distribuidora Las Jiménez` y las variantes `Jiménez` y `Jimenez`. El listado
mostró dos registros y `No hay empresas` para esos filtros; no mostró control
`Cargar más`. La implementación usa `listarRecursos("empresas", { limite: 50 })`
y ofrece paginación solo cuando hay cursor (`components/backoffice/use-platform-list.ts`
y `components/backoffice/companies.tsx`). Por tanto, la lectura visible no
indicó otra página. La consulta de listado la realiza el Backoffice mediante la
callable de solo lectura `listarRecursosPlataformaSaas`; no se invocaron el
executor comercial, la consulta de oferta ni el Bootstrap. Esto es una lectura
de la proyección canónica del Backoffice y no prueba que el ID/nombre siga libre
al momento de una futura escritura; debe repetirse antes de Bootstrap. No se
usó búsqueda directa fuera del Backoffice.

En `/backoffice/planes` se observó `mvp_comercial`, versión `2`, estado
`PUBLICADA`, revisión `2`. La navegación no creó ni retiró planes. Oferta,
tenant, administrador, membresía y Trial permanecen sin crear; no se invocaron
operaciones de negocio de oferta, executor comercial ni Bootstrap.

#### App Hosting: SHA candidato y diferencia con el build observado

La consulta de solo lectura `git ls-remote origin refs/heads/main` devolvió
`0ac4e9edf829acdf7213e7a20b722de9a58c2826`, igual al `origin/main` local. El
último rollout productivo verificable en esta evidencia continúa siendo el
build `build-2026-10-15-001`, SHA `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`,
100 % de tráfico al build según la lectura histórica; no se reconsultó App
Hosting en este addendum, por lo que su tráfico actual no se declara renovado.

La comparación local de Git entre ese SHA y `origin/main` abarca 39 archivos
(1.873 inserciones y 206 eliminaciones), incluyendo código Functions y
documentación que no equivalen por sí solos a contenido servido por App
Hosting. El delta visible de la aplicación incluye navegación de ofertas en
producción, la vista/etiquetas de evidencia de auditoría v2, y la captura de
costo y presentación de margen/utilidad de compra Bodega; el candidato también
incluye la unidad predeterminada `unidades` para las filas de compra Bodega. No
se generó build ni se inició rollout. El SHA `0ac4e9…` es candidato, no una
autorización operativa ni una afirmación de compatibilidad certificada.

#### Efecto en Gates y siguiente secuencia

Estas lecturas reducen incertidumbre de duplicado y Plan, pero no resuelven la
brecha de Rules ni la discrepancia de artefacto/build de Functions ya registrada.
El executor comercial anterior tiene un artefacto identificable, pero su
recuperación no se probó; para `consultarOfertaComercialTenantSaas` no hay
revisión anterior observada, y la imagen activa reportada para el executor no
coincide nominalmente con su source/build. Ninguna restauración está ejecutada
ni verificada. App Hosting continúa pendiente de revalidación para el SHA
candidato vigente. No se repitieron suites: el código local cubierto no cambió.

Secuencia comercial pendiente y sin autorización de escritura en esta revisión:
(1) revalidar duplicados y Plan al momento de operar; (2) crear y aprobar
canónicamente la oferta tenant-specific anual de COP `1.600.000`, pago manual,
efectiva desde `2026-10-16` y sin vencimiento; (3) solo después de cerrar los
gates y con autorización productiva específica, hacer Bootstrap de
`distribuidora-las-jimenez`, `BODEGA_MVP1`, país `CO`, con identidad y nombre
administrador autorizados. El Bootstrap inicia el Trial de exactamente 30 días
al completarse correctamente; la oferta no lo inicia. El catálogo diferido
permite únicamente un Trial inicial vacío/no fiscal, no ventas, compras ni
readiness de Bodega. La información aún requerida de Diana es únicamente el
nombre exacto que autoriza para su cuenta administradora y el canal externo
seguro para entregar el código/PIN temporal; no se requiere pedirle un correo
ni credenciales por este chat.

**Estado:** producción permanece `NO-GO`; Gate I sigue abierto por Rules no
revalidadas, compatibilidad/recuperación de Functions no demostrada y falta de
release verificable del SHA candidato. No se desplegaron Functions, App Hosting
ni Rules; no se modificó IAM, Secrets, oferta, tenant, membresía o Trial.

### Addendum — alternativa de lectura en Firebase Console

Durante esta revisión se abrió en Edge la ruta de solo lectura
`https://console.firebase.google.com/u/0/project/micafe-pos/firestore/rules`.
La consola mostró «Este proyecto no existe o no tienes permiso para
visualizarlo». La sesión de Google estaba autenticada, pero la página no mostró
Rules, release ni ruleset. El mensaje es ambiguo y no demuestra que el proyecto
no exista, que la API esté deshabilitada o cuál permiso falte. No se intentó
cambiar de cuenta, fijar un proyecto de cuota, solicitar elevación ni navegar a
otra superficie administrativa.

La vía alternativa de consola tampoco produjo evidencia remota actualizada:
el `(default)` permanece `NO VERIFICADO` para esta revisión y Gate I sigue
abierto. El siguiente paso mínimo es que una identidad administradora ya
autorizada obtenga, sin cambios de configuración, la versión activa del release
`cloud.firestore`, su ruleset/source y fecha, o habilite al operador una vía de
lectura autorizada conforme al procedimiento del proyecto. No se solicita ni
se aplica aquí ningún cambio IAM/API. Registro local de esta observación:
`2026-10-17` (la interfaz no expuso una marca de tiempo de consulta con mayor
precisión).

### Addendum — revalidación read-only del operador productivo

En Edge se abrió `/backoffice/operadores` en el Backoffice productivo. La página
mostró `Autorización v3` y `Contexto validado`. El identificador de la sesión
coincidió con el de una fila activa del registro canónico de operadores
presentado por el Backoffice; se omiten ambos UID y no se observó correo. Esa
fila activa muestra `OPERADORES_GOBERNAR`, `COMERCIAL_GOBERNAR`,
`BOOTSTRAP_EMPRESARIAL_SOLICITAR`, `RELEASE_COMPRAS_GOBERNAR` y las facultades
`LIFECYCLE_GOBERNAR`, `CONSERVACION_GOBERNAR`, `PLATAFORMA_CONSULTAR`,
`ACCESO_RESTABLECER` y `DUSEMA_TENANT_CONSULTAR`.

La otra fila visible también está `ACTIVO` y muestra
`OPERADORES_GOBERNAR`, `COMERCIAL_GOBERNAR` y
`BOOTSTRAP_EMPRESARIAL_SOLICITAR`, pero no `RELEASE_COMPRAS_GOBERNAR`. No se
asigna a ninguna fila una etiqueta de principal/secundario ni una dirección de
correo: esa relación no quedó demostrada por esta vista. La pantalla es una
lectura autenticada del Backoffice; no se invocó ninguna callable de negocio ni
se cambiaron operadores. Esto acredita el contexto/facultades mostrados en la
consulta, no sustituye la revalidación server-side de `saas_operadores/{uid}`
que cada operación mutante hace al ejecutarse. Registro de la observación:
`2026-10-17T23:31Z` (la pantalla no proporciona timestamp propio).

### Addendum — relectura de App Hosting productivo

Revalidación de solo lectura el `2026-10-17T23:34Z`. `gcloud projects
describe micafe-pos` confirmó el proyecto esperado `micafe-pos`, número
`882525811433`, estado `ACTIVE`; había una sola identidad `gcloud` activa (se
omite su dirección). Firebase CLI local es `15.34.0` y no tenía login propio,
por lo que no se usó para la lectura. Con el token ya activo de `gcloud` se
consultó el API oficial App Hosting mediante `GET` sobre el backend exacto
`projects/micafe-pos/locations/us-central1/backends/micafe-pos`, su recurso
`rollouts`, el build identificado y `traffic`; todas las respuestas fueron
exitosas y ninguna solicitud modificó estado.

El backend responde a la URI productiva `micafe-pos--micafe-pos.us-central1.hosted.app`,
está en `us-central1`, enlaza `Glemynart/micafe-pos` con raíz `/`, y su cuenta
runtime es `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
La política de tráfico confirma branch `main` con rollouts automáticos
deshabilitados. El único rollout listado,
`build-2026-10-15-001`, está `SUCCEEDED`; el build está `READY`, su `source.commit`
es exactamente `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`, y el recurso de
tráfico asigna 100 % a ese build. Un `HEAD /` a la URI productiva devolvió HTTP
200. La API mostró variables del SDK y variables del sistema; no se copia ni
registra aquí ningún valor de configuración.

En contraste, `git ls-remote origin refs/heads/main` devolvió
`0ac4e9edf829acdf7213e7a20b722de9a58c2826`. El build servido continúa en el SHA
de producción autorizado previamente, pero no es el `main` actual. Esto
confirma el estado del backend y el SHA activo, no la compatibilidad integral
del nuevo candidato ni autoriza un rollout. No se inició build/rollout ni se
cambió tráfico, configuración, IAM o Functions.

### Addendum — estado remoto de Functions y ausencia de cambios de Rules

Consultas read-only del `2026-10-17T23:34Z` al proyecto exacto
`micafe-pos`, región `us-central1`, mediante `gcloud functions describe`:

| Callable consultada | Resultado remoto | Configuración relevante |
|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, actualizada `2026-08-15T04:27:10Z` | Codebase `saas-auth`; entry point exacto; Node.js 22; cuenta de servicio Compute predeterminada; `ALLOW_ALL`; 256 MiB; timeout 60 s; max 20 instancias. Label fuente `firebase-functions-hash` es una etiqueta, no commit atestado. |
| `consultarOfertaComercialTenantSaas` | `NOT FOUND` al consultar `--gen2 --region=us-central1` | La región coincide con el contrato local; no se afirma ausencia fuera de este recurso/consulta. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, actualizada `2026-08-15T04:27:36Z` | Codebase `saas-auth`; entry point exacto; Node.js 22; misma cuenta de servicio; `ALLOW_ALL`; 256 MiB; timeout 60 s; max 20. Referencia de secret declarada `OPERATIONAL_PIN_PEPPER@1`; no se leyó su valor ni se comprobó aquí el permiso runtime `secretAccessor`. |

Esto confirma que producción conserva las dos callables existentes bajo
`saas-auth`, y que la consulta de oferta no está desplegada en la región
esperada. La fuente candidata actual las ubica en codebases separados, y
`functions/src/index.ts` ya no exporta esos nombres; un deploy integral de
`saas-auth` desde el candidato requeriría revisar su plan de eliminaciones.
No se ejecutó `deploy`/`dry-run` ni se invocó callable alguna. Las etiquetas de
Functions no demuestran procedencia exacta del código ni rollback comprobado.

Para aprovechar una vía independiente de solo lectura, se consultó
`gcloud logging read` en el proyecto `micafe-pos` con filtro limitado a
`protoPayload.serviceName="firebaserules.googleapis.com"` y métodos
`CreateRelease`, `UpdateRelease` o `DeleteRelease`, desde
`2026-10-17T20:09:52Z` (la hora de la última lectura exitosa del release) hasta
`2026-10-17T23:34:45Z`. Resultado: exit code `0`, cero entradas coincidentes.
Firebase documenta esos métodos como Admin Activity auditados. Esto aporta
evidencia de que no aparece un cambio de puntero de release en ese intervalo
consultado; no recupera la fuente del ruleset ni equivale a una nueva lectura
del release/Rules. En ausencia de una consulta API autorizada actual, el hash
activo exacto sigue marcado `NO VERIFICADO` y Gate I permanece abierto.

### Addendum — lectura acotada de Functions y Rules (2026-10-17 18:37 COT)

Se verificó la cuenta `gcloud` activa sin registrar su dirección; el proyecto
configurado localmente estaba vacío. Todas las consultas indicaron de forma
explícita `--project=micafe-pos`. `gcloud projects describe micafe-pos`
confirmó `projectId=micafe-pos`, número `882525811433`, estado `ACTIVE`.

`gcloud functions describe --gen2 --region=us-central1` devolvió:

| Callable | Evidencia actual de solo lectura |
|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`; `updateTime=2026-08-15T04:27:10.213732081Z`; runtime `nodejs22`; entry point coincidente; codebase etiquetado `saas-auth`; cuenta runtime `882525811433-compute@developer.gserviceaccount.com`; URI `https://ejecutarcomandocomercialsaas-w6qbeqsxfa-uc.a.run.app`; 256 MiB, 60 s, máximo 20 instancias, ingress `ALLOW_ALL`. El label `firebase-functions-hash=9282ced0a7b282ea8573e5ba930efb2e4aee6aa0` no es una atestación de commit. |
| `consultarOfertaComercialTenantSaas` | La consulta del recurso exacto en `us-central1` devolvió `404 NOT FOUND`. No prueba ausencia en otra región o en otro tipo de recurso. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`; `updateTime=2026-08-15T04:27:36.321446180Z`; runtime `nodejs22`; entry point coincidente; codebase etiquetado `saas-auth`; cuenta runtime Compute predeterminada; URI `https://solicitarbootstrapempresarialsas-w6qbeqsxfa-uc.a.run.app`; 256 MiB, 60 s, máximo 20 instancias, ingress `ALLOW_ALL`. La evidencia anterior registra referencia a `OPERATIONAL_PIN_PEPPER@1`; no se leyó su valor ni se verificó `secretAccessor` en esta consulta. Ningún endpoint fue invocado. |

Se intentó una lectura directa `GET /v1/projects/micafe-pos/releases/cloud.firestore`
a las `2026-10-17T23:37:35Z`.
Respondió `403 PERMISSION_DENIED`, razón `SERVICE_DISABLED`, consumidor
`projects/32555940559`, con mensaje de que ADC no tiene quota project. No se
cambió el proyecto de cuota, IAM ni estado de APIs. La respuesta no permite
identificar el release ni afirmar que la API esté deshabilitada en
`micafe-pos`; el ruleset/hash activo sigue `NO VERIFICADO`.

Como comprobación indirecta se consultaron Admin Activity logs, solo en
`micafe-pos`, para `firebaserules.googleapis.com` y métodos
`CreateRelease`, `UpdateRelease` y `DeleteRelease`, desde
`2026-10-17T23:34:45Z` hasta `2026-10-17T23:37:35Z`. La consulta terminó con
código 0 y devolvió cero entradas. Esto solo indica ausencia de coincidencias
en ese filtro e intervalo; no reemplaza la lectura del release ni acredita el
hash actual. La consulta no devolvió coincidencias de cambios de Rules en esa
ventana; la cobertura/retención restante no se infiere de ese resultado.

**Efecto en gates:** las dos callables existentes siguen ubicadas en el
codebase productivo `saas-auth`, mientras el candidato las separa; el recurso
de consulta de oferta no se encontró en la región contractual. No se ejecutó
planner/`dry-run`, despliegue, invocación, escritura, ni cambio de configuración.
Gate I permanece abierto por incompatibilidad Rules/Functions, Rules remotas
no revalidadas y requisitos de ADR-SAAS-081 pendientes. El estado productivo
continúa `NO-GO`.

### Addendum — revisiones de recuperación en producción (2026-10-17; consulta posterior a 23:37Z, hora exacta no capturada)

Lectura acotada de los dos servicios existentes en `micafe-pos`,
`us-central1`; no se modificó tráfico. Se confirmó que cada servicio mantiene
100 % en su revisión actual y que existe una revisión anterior `Ready=True`
sin tráfico. Esto **mejora la evidencia de disponibilidad de un artefacto de
runtime**, pero no demuestra una restauración funcional ni el mapeo a un commit.

| Callable | Revisión y artefacto anterior exacto observado | Configuración recuperable y límite |
|---|---|---|
| `ejecutarComandoComercialSaas` | Actual: `ejecutarcomandocomercialsaas-00016-pid`, 100 %; build `fe8efec1-32df-4b46-80cd-03fc0ff16b64`, source object `gcf-v2-sources-882525811433-us-central1/ejecutarComandoComercialSaas/function-source.zip`, generation `1786768013527885`. Anterior: revisión `ejecutarcomandocomercialsaas-00015-bas`, creada `2026-08-13T03:58:46.397878Z`, `Ready=True`, imagen `us-central1-docker.pkg.dev/micafe-pos/gcf-artifacts/micafe--pos__us--central1__autenticar_operativo@sha256:bc66a362d44ee9989a2049c93a41cd9ec86e5fc3573057bf30d6982085089f53`. | La revisión anterior conserva `FUNCTION_TARGET=ejecutarComandoComercialSaas`, `FUNCTION_SIGNATURE_TYPE=http`, la misma runtime service account Compute predeterminada, 1 CPU, 256 MiB, timeout 60 s y maxScale 20; no declara binding de secreto. Build/source ZIP de esa revisión anterior no se correlacionó con un commit. |
| `solicitarBootstrapEmpresarialSaas` | Actual: `solicitarbootstrapempresarialsaas-00016-hez`, 100 %; comparte build `fe8efec1-32df-4b46-80cd-03fc0ff16b64`; source object `gcf-v2-sources-882525811433-us-central1/solicitarBootstrapEmpresarialSaas/function-source.zip`, generation `1786768013449627`. Anterior: revisión `solicitarbootstrapempresarialsaas-00015-dex`, creada `2026-08-13T03:58:03.530095Z`, `Ready=True`, la misma imagen digest `bc66a362d44ee9989a2049c93a41cd9ec86e5fc3573057bf30d6982085089f53`. | La revisión anterior conserva `FUNCTION_TARGET=solicitarBootstrapEmpresarialSaas`, `FUNCTION_SIGNATURE_TYPE=http`, la misma runtime service account, 1 CPU, 256 MiB, timeout 60 s, maxScale 20 y referencia a `OPERATIONAL_PIN_PEPPER`, versión 1. El valor nunca se leyó. La relación de la imagen previa con source ZIP/build/commit no quedó establecida. |
| `consultarOfertaComercialTenantSaas` | Sigue `404 NOT FOUND` al consultar el recurso exacto de Functions Gen2 en `us-central1`; no se observó revisión productiva actual ni previa. | No hay artefacto anterior productivo que restaurar. Si una futura creación se debiera revertir, el baseline sería la ausencia verificada y cualquier retiro del recurso nuevo exigiría autorización separada; un ZIP/revisión de staging no es recuperación de producción. |

La revisión anterior es un candidato exacto de **runtime** conservado por Cloud
Run, no una recuperación probada. Para una operación futura, el preflight deberá
volver a comprobar que la revisión y digest siguen disponibles y que el
mecanismo soportado de Functions/Cloud Run puede dirigir 100 % del servicio a
esa revisión sin cambiar URI, target o invoker. Si el mecanismo no puede
confirmarse, detener la publicación y definir otra recuperación antes de
mutar. Tras una recuperación autorizada, el criterio de éxito será: revisión
anterior `Ready`, 100 % del tráfico hacia ella, URI/target/región/identidad y
configuración esperadas, referencia de secreto Bootstrap aún en versión 1, y
prueba autenticada no mutante con cuenta QA autorizada; logs sin errores
críticos nuevos. No se ha ejecutado ni verificado esa secuencia. Las revisiones
de staging enumeradas en secciones anteriores son exclusivamente de staging y
no sustituyen estos artefactos productivos.

**Clasificación:** recuperación documentada: `SÍ`; artefacto exacto de runtime
anterior disponible para executor y Bootstrap: `SÍ`, sujeto a revalidación
inmediatamente antes de uso; fuente/build/commit anterior correlacionado:
`NO`; recuperación ejecutada y verificada: `NO`. Para la callable de consulta,
artefacto anterior: `NO`.

### Addendum — Rules `(default)` revalidadas por REST (2026-10-17 18:46 COT)

La lectura de solo lectura se completó a `2026-10-17T23:46:02.730Z` en el
proyecto objetivo `micafe-pos` (número `882525811433`, `ACTIVE`). Antes del GET
se comprobó que `firebaserules.googleapis.com` figura habilitada en ese
proyecto y que la identidad activa posee `serviceusage.services.use` mediante
`testIamPermissions`. Se especificó `x-goog-user-project: micafe-pos` solo en
las peticiones REST; no se cambió la cuota ADC persistente, la política IAM ni
el estado de APIs. Google documenta esta forma por petición y su requisito de
permiso ([ADC y cuota](https://docs.cloud.google.com/docs/authentication/troubleshoot-adc),
[cuota por proyecto](https://docs.cloud.google.com/docs/quotas/set-quota-project)).

`GET /v1/projects/micafe-pos/releases/cloud.firestore` devolvió el release
`projects/micafe-pos/releases/cloud.firestore`, `updateTime` del release
`2026-08-15T04:20:46.318849Z`, que apunta a
`projects/micafe-pos/rulesets/d5e205db-0ab4-4db1-b5ec-1534bee39d35`.
`GET` del ruleset devolvió `firestore.rules`, creado
`2026-08-15T04:20:45.884943Z`, 14.846 bytes, SHA-256 UTF-8 raw
`fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`; tras
normalizar CRLF/CR a LF: 14.487 bytes, SHA-256
`c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.

En la misma comprobación, `git ls-remote origin refs/heads/main` confirmó
`main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`. El blob candidato
`firestore.rules` tiene 18.961 bytes y SHA-256
`b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf` (raw y
normalizado). El hash activo coincide con la última lectura exitosa y el SHA
de `main` coincide con el comparado en la matriz semántica previa; por tanto,
esa matriz vuelve a estar respaldada por la fuente remota actual observada.
El contenido remoto continúa distinto del candidato. Se mantienen las brechas
ya enumeradas en la sección “Reconciliación semántica vigente de Rules
`(default)`”; Gate I no se cierra por haber recuperado el acceso de lectura.

No se desplegaron Rules ni Functions, no se pausaron compras, no se modificaron
controles/operadores/datos y no se hicieron escrituras productivas.

### Addendum — inspección de artefactos fuente de Functions de compras (2026-10-17)

Inspección de solo lectura entre `2026-10-17T23:49:09Z` y
`2026-10-17T23:51:36Z`. La cuenta activa de gcloud era la operadora ya
autenticada; el proyecto por defecto de gcloud estaba sin configurar, así que
cada consulta de recursos usó `--project=micafe-pos`. Una lectura previa de
`gcloud projects describe` confirmó `micafe-pos`, número `882525811433`, estado
`ACTIVE`. No se invocó ningún endpoint ni se inició build.

Se consultó `gcloud functions describe` de forma individual para
`registrarCompraOperativaV1`, `registrarCompraBodegaV1` y
`transicionarPausaComprasSaas`, todas Gen2 en `us-central1`, `ACTIVE`, con
`allTrafficOnLatestRevision=true`, runtime `nodejs22`, 1 CPU, 256 MiB, timeout
60 s e ingress `ALLOW_ALL`. Sus source objects y generaciones reportados por
Functions fueron respectivamente:

| Callable | `updateTime` | Source object / generation | ZIP descargado por generación exacta; SHA-256 local |
|---|---|---|---|
| `registrarCompraOperativaV1` | `2026-10-15T16:50:25.789673942Z` | `gcf-v2-sources-882525811433-us-central1/registrarCompraOperativaV1/function-source.zip`, `1792083010702967` | 979.638 bytes; `0ae1b15ccb54a4f78c6f1178b8947ab60784556f42b70a5a9741bbc0b801cc57` |
| `registrarCompraBodegaV1` | `2026-10-14T09:29:23.381063034Z` | `gcf-v2-sources-882525811433-us-central1/registrarCompraBodegaV1/function-source.zip`, `1791970149694527` | 135.473 bytes; `68a24ade9b6e86cb60b4df8c2b6cec9b5db808ede5fa4825e2fcb9f12e238140` |
| `transicionarPausaComprasSaas` | `2026-10-15T16:50:26.772565182Z` | `gcf-v2-sources-882525811433-us-central1/transicionarPausaComprasSaas/function-source.zip`, `1792082970343879` | 979.638 bytes; `0ae1b15ccb54a4f78c6f1178b8947ab60784556f42b70a5a9741bbc0b801cc57` |

Los ZIP de las dos funciones del codebase general son bytes idénticos pese a
tener objetos/generaciones separados. El de Bodega pertenece a un paquete
separado. Se descargaron objetos con la generación fijada (`#generation`) a
una carpeta temporal para leer el contenido; no se modificó ningún objeto
Cloud Storage. Los siguientes SHA-256 son de bytes extraídos de esos ZIP, no
hashes de una imagen ni de un commit.

| Contenido desplegado | SHA-256 extraído | Comparación con `origin/main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826` y efecto |
|---|---|---|
| Executor: `lib/functions/src/finanzas/compra-core.js` | `8c4f0756ee328085c58c56c94e1c97c861e3db3f3ea703c5726e5ff99b342b54` | El artefacto ejecuta `exigirComprasActivasEnTransaccion` en compra nueva; rechaza control ausente/inválido y compra nueva con estado `PAUSADA`. En replay validado permite devolver el recibo confirmado durante la pausa. El `src/finanzas/compra-core.ts` incluido en el mismo ZIP tiene SHA-256 `6edcfb2b983ca1bb184d16395e52ba518006250f7eabdaa0620dc05783f92c46`, idéntico al archivo candidato local; `git diff --quiet origin/main -- functions/src/finanzas/compra-core.ts` confirmó que el archivo coincide con `origin/main` (blob Git SHA-1 `1971e57ddce3e633378a0602c3f6368f62664f35`; no es el SHA-256 del contenido). Esto acredita ese módulo fuente, no todo el ZIP como un commit.
| Bodega: `lib/functions/src/finanzas/compra-core.js` | `fdc5e205172eddf2eb03f585fdecdcf3550c270ad727c30c7c54f4fb1cbe701c` | El handler `registrarCompraBodegaV1` valida política de Bodega y llama el core común, pero este core no contiene ni invoca el guard de control. La búsqueda de nombres de colección/códigos de error del control en los 71 archivos JS del ZIP no encontró coincidencias. El `src/finanzas/compra-core.ts` candidato no está en ese ZIP. El `src/purchase-policy.ts` de Bodega sí coincide byte por byte con el candidato (`a1cf2b266973233acc9d8a468f476eaef5078dda23d1672bded7655afe55071f`), pero esa política no sustituye el guard. **La callable productiva de Bodega no está acreditada como compatible con ADR-SAAS-081.** |
| Transición: `lib/functions/src/platform/purchase-release-control.js` | `18519facdd8d753fad98e01933b16872514bbe10d301a1d5d783f0c8d309a169` | El artefacto sí contiene autorización `RELEASE_COMPRAS_GOBERNAR`, transacción, revisión e idempotencia; sin embargo, escribe `schemaVersion: 1` y clasifica solo por destino (`PAUSADA` → `COMPRAS_PAUSADAS`; cualquier otro destino → `COMPRAS_REANUDADAS`). Por tanto, una inicialización `expectedRevision: 0` hacia `ACTIVA` se registra como reanudación. Es incompatible con ADR-SAAS-084 aceptado. |

Como corroboración de la versión desplegada, `audit.js` del ZIP general tiene
SHA-256 `6afe1fc94020181b3d07d61ea9953f752d14341be818f8f0cf9f31947f198211`
y emite evidencia v1; `contracts.js` tiene SHA-256
`63102009e3e591fdae7fb31f4d5d2e3518a0ac41d7d60545ca64000012226a2b` y
contiene `RELEASE_COMPRAS_GOBERNAR`. Los fuentes `purchase-release-control.ts`,
`audit.ts` y `contracts.ts` dentro del ZIP no coinciden byte por byte con
`origin/main`; no se encontró metadata Git en el paquete. No se atribuye el ZIP
completo a un commit exacto. Para el ZIP Bodega, su `index.js` exporta el target
canónico `registrarCompraBodegaV1`; el artefacto no aporta guard de release.

#### Efecto actualizado sobre Gate I y recuperación

La incompatibilidad productiva queda confirmada por el contenido del source
object, además de la diferencia Rules activa/candidata:

1. `registrarCompraOperativaV1` sí contiene el guard en su source package
   actual, sujeto a las verificaciones de comportamiento ya descritas; no se
   invocó.
2. `registrarCompraBodegaV1` carece del guard en su paquete actual. Antes de
   cualquier Rules release debe desplegarse y verificarse una versión
   compatible por un paquete y autorización de Functions independientes.
3. `transicionarPausaComprasSaas` no satisface la semántica/versionado aceptados
   de ADR-SAAS-084. Su actualización y verificación también requieren un
   paquete/autorización independiente; no se inicializó ni modificó control.
4. Siguen pendientes IDs exactos de tenants del corte, responsables, ventana,
   controles canónicos y pausa verificada que ADR-SAAS-081 exige antes de Rules.

La consulta del ZIP establece el input fuente señalado por la metadata de
Functions y permite inspección estática, pero no prueba respuestas autenticadas
ni comportamiento de runtime. La copia local de producción se mantuvo en
carpeta temporal; los hashes anteriores son evidencia reproducible. No se
comprobó restauración: los ZIP revisados son las versiones actuales, no un
rollback; las revisiones anteriores y sus límites siguen según la matriz de
recuperación previa. Gate I y Trial permanecen `NO-GO`.

No se desplegó, reconstruyó ni invocó ninguna Function; no se alteraron Rules,
IAM, APIs, secretos, controles, datos, oferta, tenant, membresía, Trial,
inventario ni compras. No se ejecutaron suites de runtime porque no hubo cambio
de código; la lectura de artefactos fue estática y de solo lectura.

### Addendum — datos de entrega administrativa de Diana

En respuesta del responsable durante esta continuación se confirmó fuera de
banda el nombre autorizado para el perfil administrador; el valor se omite de
esta evidencia pública. El responsable le entregará el código/PIN temporal
por WhatsApp. Se registra como
declaración del responsable sobre lo acordado con Diana; no se generó ni envió
credencial y no se solicitó correo, contraseña, token o código por este medio.

El responsable indicó que un administrador con permisos existentes puede
aportar la lectura de Rules si hace falta. No fue necesario: la lectura vigente
del release y ruleset de producción quedó completada en el addendum anterior
con la identidad ya autenticada y el proyecto de cuota por petición. No se
solicitó ni aplicó elevación de permisos.

Esta información resuelve únicamente los datos humanos de entrega. No autoriza
ni ejecuta oferta, Bootstrap, creación de tenant, Trial, activación de acceso,
release de Functions/Rules/App Hosting, corte de compras ni otras escrituras.
Siguen siendo obligatorios los gates técnicos y las autorizaciones específicas
de cada operación productiva.

### Addendum — revalidación puntual de release y PR #628 (2026-10-17 23:57 UTC)

Se revalidó solo la superficie necesaria para decidir el siguiente paso de
E2.2. La identidad activa de `gcloud` fue verificada; el correo de la cuenta se
omite en esta evidencia pública. El proyecto
explícito `micafe-pos` se confirmó `ACTIVE`, número `882525811433`. El proyecto
por defecto de gcloud no se usó para seleccionar recursos.

App Hosting se consultó por GET en el backend exacto
`projects/micafe-pos/locations/us-central1/backends/micafe-pos`, su recurso de
tráfico, build, rollout y servicio Cloud Run administrado. Backend y servicio
no están reconciliando; URL `https://micafe-pos--micafe-pos.us-central1.hosted.app`,
aplicación Firebase `1:882525811433:web:27a44f97b72df9ec4bb678`, raíz `/`, rama
`main`, rollouts automáticos desactivados, identidad
`firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`. El build
`build-2026-10-15-001` continúa identificado en tráfico al 100 % y su metadata
de fuente apunta exactamente a
`5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`; rollout con el mismo ID está
`SUCCEEDED`. Cloud Run confirma revisión Ready
`micafe-pos-build-2026-10-15-001`, 100 % de tráfico y base Node.js 24. La rama
`main` observada durante esta revalidación sigue en
`0ac4e9edf829acdf7213e7a20b722de9a58c2826`; por tanto, el Backoffice sirve un
SHA anterior al candidato actual. El endpoint Firebase CLI local no estaba
autenticado; la lectura se completó mediante GET de la API oficial con la
cuenta gcloud ya autenticada. No se ejecutó CLI de despliegue ni build.

Se repitieron GET de las tres descripciones Gen2 en `us-central1` con proyecto
explícito. Siguen `ACTIVE`, Node.js 22, 1 CPU, 256 MiB, timeout 60 s,
ingress `ALLOW_ALL`, identidad Compute predeterminada, y source generation,
URI y `updateTime` sin variación frente al addendum de inspección de artefactos.
Esto mantiene vigentes los hashes inspeccionados para esas generaciones. El
diagnóstico funcional no cambia: el paquete actual de Bodega carece del guard
de corte; el executor sí lo contiene; la callable de transición aún clasifica
la inicialización como reanudación y emite v1, contra ADR-SAAS-084.

El release `cloud.firestore` volvió a apuntar al ruleset
`d5e205db-0ab4-4db1-b5ec-1534bee39d35` (`updateTime` del release
`2026-08-15T04:20:46.318849Z`). SHA-256 remoto raw
`fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`,
normalizado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`;
el candidato de `main` sigue `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`.
Rules continúan divergentes y Gate I abierto.

`gh pr view 628` confirmó PR abierto a `main`, HEAD
`fc5a9633b29150072fdd9339e60caf237b9e2c15`, dos commits sobre el `main`
observado. Para ese mismo HEAD, `Tipos y pruebas`, Vercel y Vercel Preview
Comments terminaron `SUCCESS`. No hay review humana ni decisión de aprobación;
no se pidió review, no se publicó comentario y no se fusionó. La revisión local
puntual del diff no encontró un defecto funcional de alta confianza en los
tests añadidos; no sustituye la aprobación humana requerida. La modificación
local de este preflight permanece fuera del HEAD remoto del PR porque no se
hizo push.

**Consecuencia:** se confirma que el NO-GO no se debe a un backend inexistente
ni a un build activo: App Hosting sigue sirviendo íntegramente el SHA autorizado
antiguo. El bloqueo para comenzar el Trial es la divergencia de release:
Functions Bodega/control y Rules productivas no corresponden a los contratos y
Rules del candidato; además, el PR de pruebas/documentación sigue sin review
humana. No se realizó mutación productiva: solo lecturas GET/describe; no hubo
deploy, invocación, build, cambio IAM/API, compra, pausa, oferta, Bootstrap,
tenant ni Trial.

### Addendum — capacidad comercial y Bootstrap realmente desplegados (2026-10-18 00:02 UTC)

Se revisaron las callables comerciales/Bootstrap con metadatos actuales y se
descargaron, solo para inspección local, los dos source objects exactos por sus
generaciones reportadas por Cloud Functions. A las `2026-10-17T23:59:31Z`, con
proyecto `micafe-pos` confirmado `ACTIVE` (`882525811433`) y la cuenta gcloud
ya autenticada, `ejecutarComandoComercialSaas` seguía `ACTIVE`, actualizada
`2026-08-15T04:27:10.213732081Z`, source generation
`1786768013527885`. `solicitarBootstrapEmpresarialSaas` seguía `ACTIVE`,
actualizada `2026-08-15T04:27:36.321446180Z`, source generation
`1786768013449627`, con referencia declarada a
`OPERATIONAL_PIN_PEPPER@1`; no se leyó ni expuso el valor del Secret. La
consulta exacta de `consultarOfertaComercialTenantSaas` en
`us-central1` devolvió `404 NOT FOUND`.

Se copiaron los objetos con generación fijada, sin alterar Cloud Storage:
ambos ZIP miden 651.415 bytes y su SHA-256 es
`c82bc1d52017e475b82faae4bff41a415533d1de01eb7b768eca0b3066e6602b`.
Los paquetes no contienen metadata Git que permita atribuir todo el ZIP a un
commit. Inspección estática de los módulos del paquete:

| Módulo/contrato | SHA-256 desplegado | SHA-256 candidato | Hallazgo verificable |
|---|---|---|---|
| `src/platform/command-catalog.ts` | `03225c243eb4c19bd8f399bd3bed42403c116493ba21bb7f7b46f9020fb091b1` | `bee003da9bc7e36e00d1f0a58597905b3359b5dda7151f1914e89cd340849aab` | El catálogo desplegado contempla suscripciones/planes, pero no `CrearOfertaComercialTenant`, `AprobarOfertaComercialTenant` ni `RevocarOfertaComercialTenant`. El candidato sí los declara bajo `COMERCIAL_GOBERNAR`. La callable activa no puede crear/aprobar la oferta anual requerida por el Goal. |
| `src/bootstrap/service.ts` | `1501de19e5b66338f3fe7161ebc1facfca9d576ce890f3c46db7540b37a1bb16` | `31f041b7a7db05c63ded09769fd193fc1d297f170007ea9f58228a7afba666bb` | El servicio desplegado no resuelve una oferta comercial aprobada ni contiene el campo `vertical` en la validación/fingerprint/configuración de Bootstrap. El candidato añade `resolverOfertaComercialBootstrapEnTransaccion`, guarda el `ofertaComercialId` y materializa el vertical. No se puede afirmar que el Bootstrap productivo actual cree un tenant Bodega asociado al acuerdo comercial aprobado. |

El handler desplegado sí exige sesión Firebase y la facultad
`BOOTSTRAP_EMPRESARIAL_SOLICITAR`, y declara el Secret de PIN. Esto es evidencia
estática del source object, no una prueba autenticada del runtime ni de que la
identidad tenga acceso efectivo al Secret. El Trial automático de 30 días que
aparece en el módulo antiguo tampoco basta: el contrato comercial vigente exige
la oferta aprobada y el tenant Bodega/configuración correctos. **No invocar el
Bootstrap actualmente desplegado para Diana.**

La rama `main` conserva las versiones candidatas inspeccionadas; la worktree no
modificó código. Resolver esta brecha requiere liberar la callable comercial
con sus comandos/query y el Bootstrap compatible. Como el mismo nombre público
está hoy bajo `saas-auth` y el candidato lo mueve a `saas-commercial` /
`saas-bootstrap`, la continuidad/ownership sigue necesitando el procedimiento
de migración ya identificado, con aprobación de ejecución específica. La
revisión del laboratorio puede ser un prerrequisito técnico de esa publicación;
no se ejecutó aquí. No se hizo build, invocación, deploy, ni escritura.

Esta evidencia vuelve concreto el NO-GO: no solo falta promover el SHA de
App Hosting y alinear Rules/Functions de compras; las operaciones canónicas de
oferta y Bootstrap disponibles en producción todavía no implementan el
contrato comercial aprobado para Diana. Se conservan como decisiones
independientes: review humana de PR #628, autorización/validación del release de
Functions y App Hosting, y autorización separada de Rules/corte. No se creó ni
aprobó oferta, empresa, administrador, membresía o Trial.

### Addendum — comprobación puntual de Plan y rutas canónicas (2026-10-18 00:05 UTC)

Con la cuenta gcloud activa verificada (correo omitido en esta evidencia), se volvió a confirmar antes
de las lecturas el proyecto exacto `micafe-pos`, número `882525811433`, estado
`ACTIVE`. Se hicieron únicamente solicitudes HTTP `GET` a documentos exactos
de Firestore `(default)` mediante la API REST; el token OAuth se mantuvo en
memoria y no se imprimió.

| Ruta exacta consultada | Resultado | Datos mínimos observados |
|---|---:|---|
| `empresas/distribuidora-las-jimenez` | 404 | Sin documento en esa ruta canónica exacta. |
| `ofertas_comerciales_tenant/distribuidora-las-jimenez` | 404 | Sin documento de control en esa ruta exacta. |
| `ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026` | 404 | Sin borrador/oferta con ese ID exacto. |
| `planes/mvp_comercial/versiones/2` | 200 | `PUBLICADA`, `ANUAL`, revisión `2`, precio público `1.800.000 COP`. |

Hora de inicio de la tanda: `2026-10-18T00:05:15Z`; respuesta de Plan: HTTP
200 a las `2026-10-18T00:05:22Z`. No se hizo una consulta de colección ni una
búsqueda por nombre, por lo que estos 404 no prueban ausencia de documentos
con otros IDs o alias comerciales; el preflight canónico del Bootstrap debe
volver a verificar duplicados inmediatamente antes de cualquier alta. La
lectura confirma que la versión pública requerida del Plan sigue publicada,
pero no cambia la brecha de que el source object productivo de la callable
comercial carece de los comandos de oferta y la callable de Bootstrap carece
del vínculo de oferta y vertical de Bodega.

No hubo invocaciones, builds, escrituras, despliegues, cambios IAM/APIs ni
lecturas fuera de esas cuatro rutas en esta comprobación.

### Addendum — precondición de secreto y runtime del Bootstrap (2026-10-18 00:06 UTC)

Con la misma cuenta ya autenticada y tras volver a fijar el proyecto explícito
`micafe-pos` (`882525811433`, `ACTIVE`), se inspeccionaron solo la metadata de
`solicitarBootstrapEmpresarialSaas`, la política IAM del secreto exacto, la
política directa del proyecto y la metadata de la identidad runtime observada.
No se leyó ninguna versión/valor del secreto.

- `gcloud functions describe solicitarBootstrapEmpresarialSaas --gen2
  --project=micafe-pos --region=us-central1`: `ACTIVE`, Node.js 22, actualizado
  `2026-08-15T04:27:36.321446180Z`; runtime
  `882525811433-compute@developer.gserviceaccount.com`; referencia declarada
  `OPERATIONAL_PIN_PEPPER@1`.
- `gcloud secrets get-iam-policy OPERATIONAL_PIN_PEPPER --project=micafe-pos`:
  ETag `BwZXaKyQhzY=`; política directa del secreto contiene
  `roles/secretmanager.secretAccessor` para esa identidad, sin condición.
- `gcloud projects get-iam-policy micafe-pos`: ETag `BwZd5Jnfn5U=`; política
  directa del proyecto también contiene `roles/editor` para la misma identidad.
- `gcloud iam service-accounts describe
  882525811433-compute@developer.gserviceaccount.com --project=micafe-pos`:
  la cuenta existe en el proyecto, unique ID `108951670150123124953`; la
  respuesta no informó `disabled: true`.

Esto confirma el grant directo requerido para acceder al secreto y la
configuración que referencia la versión 1, pero no ejecuta la callable ni
demuestra una lectura real en runtime; tampoco consulta políticas de deny o
ancestros. **Riesgo de mínimo privilegio:** el runtime usa la cuenta Compute
predeterminada y tiene `roles/editor` directamente en producción. No se cambió
ni se intentó reducir ese binding. Antes de una escritura de Bootstrap, el
responsable debe decidir si acepta explícitamente ese riesgo para el flujo y
ventana concretos o autoriza un paquete separado de remediación IAM; no se debe
seguir si se exige una identidad/permisos distintos sin completar esa decisión.

Las lecturas fueron consultas `describe`/`get-iam-policy` limitadas a la
callable, el secreto y la identidad exactos. No se invocó la callable, no se
leyó el PIN pepper, no se alteró IAM/Secret Manager y no se tocó staging.

La revalidación visible del operador autenticado en la sesión actual de Edge
no pudo completarse: la herramienta de inspección no pudo determinar con
suficiente confianza la URL de la ventana y detuvo Computer Use antes de
mostrar contenido de la página. No se interactuó con controles. Por tanto, la
identidad/facultades del operador conservan únicamente la evidencia histórica
ya registrada y deben releerse canónicamente justo antes de cualquier
operación comercial o Bootstrap; no se infiere que la sesión actual sea la
misma ni que sus facultades sigan vigentes.

### Addendum — capacidades del Plan publicado (2026-10-18 00:08 UTC)

Se releyó el documento exacto `planes/mvp_comercial/versiones/2` en el proyecto
`micafe-pos` (`882525811433`) para comprobar el requisito de M2 de capacidades
no vacías. Respondió HTTP 200; estado `PUBLICADA`, periodicidad `ANUAL`, versión
2, revisión 2, precio público `1.800.000 COP` y nueve capacidades:
`sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`,
`shifts`, `cuentas_cobro`. La lectura confirma esa precondición del Plan; no
aprueba ni persiste la oferta tenant-specific de COP 1.600.000 y no autoriza
Bootstrap ni Trial. Solicitud `GET` únicamente; sin escritura ni invocación.

### Addendum — auditoría puntual de CI en PR #628 (2026-10-18 00:10 UTC)

La inspección del workflow en el HEAD remoto `fc5a9633b29150072fdd9339e60caf237b9e2c15`
encontró que el job de Bootstrap construía y ejecutaba `test:discovery` y
`test:module-load`, pero no el nuevo `test:authorization`. Por tanto, los checks
verdes de ese HEAD no cubren esa prueba. En el worktree local se añadió una
línea al paso de CI para ejecutarla después del build, discovery y module-load.

Con dependencias ya presentes, `npm run build` y `npm run test:authorization`
en `functions-bootstrap` terminaron con código 0; TAP reportó 1 prueba, 1
aprobada, 0 fallidas. La prueba levanta solo un proceso Node local con módulos
mockeados; no accede a Firebase ni a endpoints remotos. El ajuste del workflow
es local, no comprometido ni publicado; no se alteraron lockfiles. El CI verde
remoto de #628 sigue perteneciendo al HEAD anterior y no valida esta corrección.
Se requiere actualizar el PR por el flujo autorizado y esperar nuevos checks
antes de considerar satisfecha la validación de CI; no se hizo push ni comentario.

### Addendum — actualización del estado local y confirmación humana (2026-10-18 00:13 UTC)

La corrección de workflow descrita arriba ya no está solo en el working tree:
se comprometió localmente como `b5bb78d35ecc6c224426b10c3358b38ec31ea24f`
(`test(e2.2): run bootstrap authorization test in CI`). El commit cambia
únicamente `.github/workflows/ci.yml` y la rama local está un commit por delante
de `origin/codex/e2-2-diana-release-prep`. No se publicó; por tanto, los checks
verdes de PR #628 todavía corresponden exclusivamente al HEAD remoto
`fc5a9633b29150072fdd9339e60caf237b9e2c15` y no validan el commit nuevo. La
evidencia de preflight continúa modificada localmente y sin publicar.

El responsable confirmó fuera de banda el nombre autorizado para la cuenta
administradora y que entregará el código/PIN temporal por WhatsApp. También
confirmó que un administrador puede aportar una lectura de Rules solo si ya dispone de los
permisos necesarios. La lectura productiva del ruleset ya está registrada en
el addendum del 17 de octubre; esta confirmación no concede ni solicita permisos.
No se generó ni compartió una credencial.

No se repitieron build ni prueba unitaria: la corrección local de CI solo añade
la ejecución de `test:authorization`, cuyo build y prueba focalizada ya habían
terminado correctamente antes del commit. No se hizo push, operación remota,
invocación, despliegue ni escritura productiva.

### Addendum — validación final local del PR #628 (2026-10-18 01:19 UTC)

Consulta de solo lectura a GitHub: el PR #628 sigue `OPEN`, base `main` en
`0ac4e9edf829acdf7213e7a20b722de9a58c2826`, HEAD
`f8aa7dd894cb8624757edfcc3a471909b41e9706`, merge state `CLEAN`. Para ese HEAD,
`Tipos y pruebas` (run `39082123892`, job `117541054402`), Vercel y Vercel
Preview Comments están `SUCCESS`; el run terminó a las `2026-10-18T00:32:09Z`.
La consulta no encontró reviews ni solicitudes de review. No se fusionó el PR.
Se actualizó únicamente su descripción para reflejar los checks ya verdes y la
review humana aún pendiente; no se añadió comentario ni se alteró el HEAD.

La declaración anterior de que faltaban nombre y canal queda superada por la
confirmación del responsable, fuera de banda, del nombre autorizado para la
cuenta administradora; su valor se omite en evidencia pública. Él entregará personalmente por WhatsApp el código/PIN temporal cuando el flujo
canónico lo genere. Es evidencia declarativa, no verificación directa con
Diana; no se generó ni envió credencial. Permanecen por verificar en el momento
de operación la identidad/facultades efectivas del operador y las
autorizaciones productivas independientes.

La revisión estática final del diff frente a `main` confirmó que el cambio de
runtime está limitado a ejecutar `functions-bootstrap` `test:authorization`
en CI; la prueba compila el entrypoint y verifica localmente rechazo anónimo y
falta de la facultad canónica, con Firestore mockeado. Los demás cambios de
código son pruebas: despacho por `FUNCTION_TARGET` en `saas-commercial` y
denegaciones de Rules Emulator para compras/ventas y membresía inactiva. No se
encontró un defecto de alta confianza en ese alcance; `git diff --check`
terminó sin errores. La revisión local no sustituye una review independiente
si la gobernanza del PR la exige. Este addendum es solo local: no hubo commit,
push, comentario, despliegue ni mutación remota.

### Addendum — disponibilidad observable de Edge (2026-10-18 01:22 UTC)

La inspección local de ventanas de Windows, siguiendo el procedimiento de
Computer Use, devolvió solo ChatGPT y Discord; Microsoft Edge no apareció en
el inventario de aplicaciones ni ventanas accesibles. No se abrió otra
ventana, no se navegó ni se interactuó con autenticación. Esto no demuestra
que no exista una sesión de Edge fuera del inventario accesible, pero deja sin
verificar la identidad SaaS y las facultades efectivas del operador en
producción. La cuenta gcloud y la declaración previa de una sesión iniciada no
sustituyen esa lectura canónica.

### Addendum — revalidación read-only de Functions en staging (2026-10-18 01:22–01:24 UTC)

Antes de consultar se verificó la cuenta gcloud activa (correo omitido en esta
evidencia) y el proyecto explícito `micafe-pos-staging`, número `192423427245`, estado
`ACTIVE`. Las lecturas exactas de Functions Gen2 y servicios/revisiones Cloud
Run no invocaron endpoints ni ejecutaron despliegues.

| Callable | Estado y codebase observados | Build/revisión y tráfico | Configuración observada |
|---|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, `saas-commercial`, Node.js 22; `updateTime=2026-10-06T09:46:39.969571356Z`; hash-label `c9a4f86d…` | Build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`; revisión `...00004-luv`, `READY`, 100 % | `us-central1`, 256 MiB, máximo 20 instancias, identidad Compute predeterminada de staging; URI `https://ejecutarcomandocomercialsaas-qn7mt3dyyq-uc.a.run.app` |
| `consultarOfertaComercialTenantSaas` | `ACTIVE`, `saas-commercial`, Node.js 22; `updateTime=2026-10-06T09:46:32.926002553Z`; hash-label `c9a4f86d…` | Build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`; revisión `...00001-gug`, 100 % | `us-central1`, 256 MiB, identidad Compute predeterminada de staging; URI `https://consultarofertacomercialtenantsaas-qn7mt3dyyq-uc.a.run.app` |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, `saas-bootstrap`, Node.js 22; `updateTime=2026-09-21T19:31:04.300277935Z`; hash-label `f046722d…` | Build `75506163-1c64-42d8-8c98-785659ea8598`; revisión `...00002-fig`, `READY`, 100 % | `us-central1`, 256 MiB, máximo 20 instancias, identidad Compute predeterminada de staging; URI `https://solicitarbootstrapempresarialsaas-qn7mt3dyyq-uc.a.run.app` |

Cloud Run confirma 100 % de tráfico a las revisiones activas observadas. Para
`ejecutarComandoComercialSaas`, la imagen usa el nombre de repositorio de la
callable de consulta, pero el digest es el mismo digest compartido ya registrado
para ambos paquetes comerciales. La evidencia del build y de los ZIP idénticos
explica esa procedencia compartida; el nombre de la imagen por sí solo no
demuestra despacho incorrecto. La lectura actual de revisión confirma imagen,
estado Ready y cuenta de servicio; `FUNCTION_TARGET` se conserva de la lectura
estática previa de las revisiones y no se volvió a consultar en esta tanda.

El registro de despliegue del 6-oct dice que `saas-commercial` **actualizó**
`ejecutarComandoComercialSaas`; la revisión anterior `...00003-lib` sigue
`Ready` pero retirada, sin tráfico. ADR-SAAS-044 y la lectura actual confirman
que Bootstrap ya se sirve bajo `saas-bootstrap`; su artefacto reconstruido es
anterior y no atribuible a un commit. Por tanto, el cambio de codebase para
estas rutas ya está materializado en staging y no debe repetirse únicamente
para probar ownership. Esto no demuestra continuidad de invocaciones durante
el despliegue, respuesta autenticada ni rollback ejecutado; tampoco prueba que
los artefactos de staging sean iguales al candidato productivo vigente. El
paquete comercial staging aún precede a la corrección de guard productivo de
ofertas (`851c50bc…`) y a la evidencia v2 de auditoría; Bootstrap staging no
certifica el contrato comercial candidato.

**Conclusión para el plan:** retiro el “nuevo ensayo de transferencia de
ownership en staging” como siguiente requisito. El desbloqueo técnico ahora es
comparar/publicar, cuando exista autorización, el código candidato compatible
en producción y completar sus verificaciones; las autorizaciones de Functions,
App Hosting, Rules/corte y escrituras comerciales siguen separadas. No hubo
invocaciones, despliegues, cambios de configuración ni escrituras.

### Addendum — CI del `main` candidato y verificación del preflight local (2026-10-18 01:24 UTC)

GitHub confirma `main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`, CI push
run `39054744192` `success` para ese mismo SHA. PR #628 sigue abierto con base
en ese `main`, HEAD `f8aa7dd894cb8624757edfcc3a471909b41e9706` y sus tres checks
(CI, Vercel, Preview Comments) en `PASS`; no hay review registrada. El PR no
incluye el addendum local posterior de este archivo. `git diff --check` sobre
el worktree actual terminó sin errores; Git solo avisó de la conversión
habitual LF/CRLF en Windows. No se repitieron suites porque desde el HEAD
validado por CI solo se añadieron observaciones documentales locales.

### Addendum — revalidación read-only de Functions staging y producción (2026-10-18 01:22–01:24 UTC)

Antes de consultar se verificó la cuenta gcloud activa (correo omitido en esta
evidencia). Los proyectos se fijaron explícitamente y respondieron `ACTIVE`: staging
`micafe-pos-staging` / `192423427245`; producción `micafe-pos` /
`882525811433`. Se consultó metadata de Functions Gen2 y revisiones Cloud Run
para los IDs exactos indicados; no se inspeccionaron env vars, secretos, código
ni documentos de tenants, y no hubo invocaciones ni mutaciones.

| Entorno / callable | Estado, codebase y actualización | Build / revisión / tráfico | Configuración observada |
|---|---|---|---|
| Staging `ejecutarComandoComercialSaas` | `ACTIVE`, `saas-commercial`, Node.js 22; `2026-10-06T09:46:39.969571356Z` | Build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`; revisión `...00004-luv`, `READY`, 100 % | `us-central1`, 256 MiB, máximo 20, Compute predeterminada de staging; URI `https://ejecutarcomandocomercialsaas-qn7mt3dyyq-uc.a.run.app` |
| Staging `consultarOfertaComercialTenantSaas` | `ACTIVE`, `saas-commercial`, Node.js 22; `2026-10-06T09:46:32.926002553Z` | Mismo build; revisión `...00001-gug`, 100 % | `us-central1`, 256 MiB, Compute predeterminada de staging; URI `https://consultarofertacomercialtenantsaas-qn7mt3dyyq-uc.a.run.app` |
| Staging `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, `saas-bootstrap`, Node.js 22; `2026-09-21T19:31:04.300277935Z` | Build `75506163-1c64-42d8-8c98-785659ea8598`; revisión `...00002-fig`, `READY`, 100 % | `us-central1`, 256 MiB, máximo 20, Compute predeterminada de staging; URI `https://solicitarbootstrapempresarialsaas-qn7mt3dyyq-uc.a.run.app` |
| Producción `ejecutarComandoComercialSaas` | `ACTIVE`, `saas-auth`, Node.js 22; `2026-08-15T04:27:10.213732081Z` | Build `fe8efec1-32df-4b46-80cd-03fc0ff16b64`; entry point canónico | `us-central1`, 256 MiB, máximo 20, Compute predeterminada de producción; URI `https://ejecutarcomandocomercialsaas-w6qbeqsxfa-uc.a.run.app` |
| Producción `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, `saas-auth`, Node.js 22; `2026-08-15T04:27:36.321446180Z` | Mismo build; entry point canónico | `us-central1`, 256 MiB, máximo 20, Compute predeterminada de producción; URI `https://solicitarbootstrapempresarialsas-w6qbeqsxfa-uc.a.run.app` |
| Producción `registrarCompraBodegaV1` | `ACTIVE`, `saas-bodega-operations`, Node.js 22; `2026-10-14T09:29:23.381063034Z` | Build `604494cb-10f3-46db-a692-5c4d2009eee2` | `us-central1`, 256 MiB, Compute predeterminada de producción; URI `https://registrarcomprabodegav1-w6qbeqsxfa-uc.a.run.app` |
| Producción `transicionarPausaComprasSaas` | `ACTIVE`, `saas-auth`, Node.js 22; `2026-10-15T16:50:26.772565182Z` | Build `32fe5fec-a4c5-4c9b-9315-a68b5c2d75a7` | `us-central1`, 256 MiB, Compute predeterminada de producción; URI `https://transicionarpausacomprassaas-w6qbeqsxfa-uc.a.run.app` |

La relectura confirma que el cambio de ownership de las callables comerciales
y Bootstrap ya está materializado en staging; el deploy de `saas-commercial`
del 6-oct registró una actualización del executor y conservó su revisión previa
como `Ready` sin tráfico, y Bootstrap se sirve bajo `saas-bootstrap` desde el
21-sep. Por ello no hace falta repetir una migración de codebase en staging
solo para probar la capacidad de actualización por ID. Esto no prueba
continuidad temporal, respuestas autenticadas ni recuperación funcional. Los
artefactos de staging son versiones fechadas de septiembre/octubre y no
certifican la candidata productiva actual; el ZIP comercial inspeccionado
carece de la corrección productiva posterior y de la evidencia v2. La
procedencia exacta del artefacto de Bootstrap está recuperada por ADR-SAAS-044,
pero su commit histórico es `NOT RECOVERABLE`.

En producción no cambió la metadata de las dos callables comerciales desde la
observación previa: ambas siguen en `saas-auth`. `registrarCompraBodegaV1`
continúa con el build del 14-oct y `transicionarPausaComprasSaas` con el del
15-oct. Sus etiquetas/build IDs no prueban por sí solos el contenido: se
conserva la inspección estática exacta del source ZIP ya registrada, que
encontró el guard ausente en la Function Bodega y la clasificación v1
incompatible con ADR-SAAS-084 en la callable de transición. Ninguna fue
invocada en esta relectura.

**Decisión de secuencia:** la migración mecánica de nombres/codebases ya no es
el bloqueo que justifica otra prueba de staging. Para producción permanece
necesario autorizar por separado la actualización de Functions candidatas,
App Hosting y Rules/corte. Antes de esas mutaciones se requiere un plan actual
que cubra el ownership, la configuración y recuperación; no se infiere que la
prueba histórica de staging autorice producción. El paquete de oferta/Bootstrap
sigue sin autorización de escritura y no se ejecutó.

### Addendum — revalidación final de Gate I, release y onboarding (2026-10-17 23:53–23:56 COT / 2026-10-18 04:53–04:56Z)

Lectura acotada para actualizar evidencia, sin repetir suites ni auditoría general. Las consultas remotas se limitaron a `micafe-pos` y `us-central1`, fueron de lectura y no invocaron endpoints.

#### PR #628, estado Git y alcance local

- `gcloud` activo: identidad verificada (correo omitido en esta evidencia); proyecto explícito `micafe-pos`, número `882525811433`, `ACTIVE`. APIs consultables habilitadas: `cloudfunctions.googleapis.com`, `firebaseapphosting.googleapis.com`, `firebaserules.googleapis.com` y `run.googleapis.com`; no se cambió ninguna.
- `origin/main` y base PR #628: `0ac4e9edf829acdf7213e7a20b722de9a58c2826`. PR #628 sigue `OPEN`, HEAD `f8aa7dd894cb8624757edfcc3a471909b41e9706`, `CLEAN`; `Tipos y pruebas` (run `39082123892`, job `117541054402`), Vercel y Vercel Preview Comments están `PASS`. No hay review ni decisión de aprobación.
- El diff del PR contiene CI, documentos y pruebas, no código runtime de Functions ni `firestore.rules`. Este preflight ya está incluido en el PR; el addendum local pertenece al mismo alcance y no requiere otro PR. Continúa sin publicar. El único archivo local cambiado sigue siendo este preflight; `git diff --check` pasó. No se repitieron pruebas porque el cambio es documental; CI verde no cubre el texto local.
- El Goal maestro sigue G-SAAS-02/M2/E2.2 en ejecución, pero su campo “siguiente PR esperado” aún cita `main @ 126affa04417639e9ec566b025d937739262d465`, frente al `main @ 0ac4e9…` observado ahora. No edité el Goal: no hubo evento formal de planificación. El estado del release/Gate I es `NO-GO/BLOCKED`; no equivale a cambiar el estado maestro del Goal, que permanece `ACTIVO`.

#### Rules activas y candidatas

El `GET` de Rules se completó el `2026-10-18T04:54:24Z` (cuota fijada por petición a `micafe-pos`). Release `projects/micafe-pos/releases/cloud.firestore`, `updateTime=2026-08-15T04:20:46.318849Z`, apunta al ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, creado `2026-08-15T04:20:45.884943Z`. Fuente `firestore.rules`, 14.846 bytes: SHA-256 UTF-8 raw `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`; LF-normalizado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.

El blob Git candidato de `origin/main @ 0ac4e9…`, y el mismo archivo en el HEAD de PR #628, es 18.961 bytes y SHA-256 `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. La copia Windows CRLF da 19.403 bytes y raw SHA-256 `9f524f8333a3bf6b7ac298e2ad34358af69fbb9744d56c78dd8d1e7bf4ba5345`; normalizada a LF coincide con el blob Git. Es una diferencia de representación de líneas, no una variación del candidato. La fuente remota y la candidata siguen distintas.

La matriz semántica ya registrada sigue respaldada por hashes actuales:

| Superficie | Diferencia efectiva y dependencia |
|---|---|
| `/compras/{id}` | Producción permite a admin crear/borrar directamente sin control. Candidato bloquea escrituras Bodega y exige para otros verticales control existente, empresa coincidente, `ACTIVA` y revisión entera `>=1`. Afecta también escritores directos de otros verticales: falta inventario de tenants/controles alcanzados. |
| `/controles_release_compras/{id}` | Denegado directamente al cliente en Rules activas y candidatas; las Rules evalúan el control internamente. |
| `/productos`, `/ventas`, `/clientes`, `/turnos`, `/usuarios`, `/movimientos_inventario`, `/presentaciones_producto` | Candidato aplica restricciones de Bodega/rol más estrictas o cambios puntuales frente al acceso activo/catch-all; conservar pruebas por rol, vertical y tenant. |
| Señales Bodega y rutas legacy | Candidato permite solo `get` acotado de señales para membresía/UID propio, nunca `list`/escritura; legacy explícitamente denegado no amplía el catch-all actual. |

Gate I necesita pruebas de escritura directa por rol/vertical, control ausente/activo/pausado/cruzado/revisión inválida, membresía revocada, aislamiento tenant, señales no-list/no-write, rutas legacy e integración por callables. El `test:rules` registrado dio 47/47 en Emulator y no se repitió sin cambio de código; no certifica remoto.

ADR-SAAS-081 exige antes de Rules: Functions compatibles (compra operativa, compra Bodega y control), controles inicializados, pausa canónica por tenant y revisión de estado/revisión, deploy de Rules y verificación, luego reanudación con atestación. Si falla la verificación, dejar PAUSADA y forward-fix; no recuperar Rules permisivas. IDs exactos de tenants, responsables y ventana siguen sin definirse; no se autorizó ni realizó corte. Gate I permanece `BLOCKED`.

#### Functions productivas — metadata y incompatibilidades

Se repitieron `gcloud functions describe` de IDs exactos en `micafe-pos/us-central1`; `ACTIVE` es metadata, no prueba de comportamiento autenticado. Las generaciones de ZIP de compras no cambiaron respecto a los paquetes inspeccionados previamente.

| Callable | Estado remoto actual | Diferencia relevante y plan de release |
|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, Node.js 22, `2026-08-15T04:27:10.213732081Z`, source generation `1786768013527885`; Compute predeterminada; URI `https://ejecutarcomandocomercialsaas-w6qbeqsxfa-uc.a.run.app`. | ZIP actual no incluye comandos de crear/aprobar/revocar oferta. `saas-commercial` actualiza este ID y crea `consultarOfertaComercialTenantSaas`; exigir plan actual que descarte colisión/eliminación/recreación. |
| `consultarOfertaComercialTenantSaas` | GET exacto en `us-central1`: `404 NOT FOUND`. | Crear solo si el inventario inmediato mantiene la ausencia en la región y el plan enumera ese único alta adicional. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, Node.js 22, `2026-08-15T04:27:36.321446180Z`, source generation `1786768013449627`; Compute predeterminada; URI `https://solicitarbootstrapempresarialsas-w6qbeqsxfa-uc.a.run.app`; referencia a `OPERATIONAL_PIN_PEPPER@1`. | ZIP productivo no vincula oferta aprobada ni materializa vertical Bodega. `saas-bootstrap` actualiza el mismo ID; conservar identidad/configuración/secret y no usar la versión actual para Diana. |
| `registrarCompraOperativaV1` | `ACTIVE`, Node.js 22, `2026-10-15T16:50:25.789673942Z`, generation `1792083010702967`; Compute predeterminada. | El ZIP ya inspeccionado contiene guard para compra nueva y replay. No redeploy si la revalidación del artefacto confirma que sigue idéntico. |
| `registrarCompraBodegaV1` | `ACTIVE`, Node.js 22, `2026-10-14T09:29:23.381063034Z`, generation `1791970149694527`; Compute predeterminada; URI `https://registrarcomprabodegav1-w6qbeqsxfa-uc.a.run.app`. | El ZIP no contiene guard de ADR-SAAS-081. Requiere actualización dirigida y pruebas nueva/replay/fail-closed antes de Rules. |
| `transicionarPausaComprasSaas` | `ACTIVE`, Node.js 22, `2026-10-15T16:50:26.772565182Z`, generation `1792082970343879`; Compute predeterminada; URI `https://transicionarpausacomprassaas-w6qbeqsxfa-uc.a.run.app`. | ZIP emite v1 y puede registrar inicialización `0→1 ACTIVA` como reanudación. Actualizar a ADR-SAAS-084 solo tras lectores compatibles; no emitir v2 antes de desplegarlos. |

Staging tiene ya ownership `saas-commercial`/`saas-bootstrap` y tráfico Ready, por lo que no se repite ese ensayo. No acredita continuidad durante la migración, pruebas autenticadas, rollback ejecutado ni equivalencia con el candidato productivo. Cada deploy productivo requiere inventario/plan previo de altas, actualizaciones, bajas y config; abortar ante eliminación/recreación o cambio no previsto de nombre, URI, región, trigger, ingress, runtime o identidad. Los artefactos/revisiones anteriores disponibles son puntos de recuperación, no un rollback probado.

#### App Hosting y IAM de runtime

GET actual confirmó el backend `micafe-pos/us-central1`, URI `micafe-pos--micafe-pos.us-central1.hosted.app`, raíz `/`, repo `Glemynart/micafe-pos`, Cloud Run service `micafe-pos`, Node.js 24, runtime SA `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com` y `reconciling=false`. Las siete variables públicas Firebase observadas apuntan a `micafe-pos`, incluida Functions `us-central1`; valores no repetidos aquí. Cloud Run está Ready y con 100 % de tráfico a `micafe-pos-build-2026-10-15-001`. App Hosting informa build `READY`, rollout `SUCCEEDED`, ambos `build-2026-10-15-001`, fuente exacta `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`. `main` actual es `0ac4e9…`; el PR #628 HEAD no modifica runtime. No se inició rollout. El GET actual no expuso `rolloutPolicy`; la evidencia previa de automáticos desactivados debe revalidarse justo antes de una publicación. La aceptación de Node 24/Next Preview de ADR-SAAS-083 no autoriza otro rollout.

La runtime SA de Functions no es la de App Hosting. Se verificó que `882525811433-compute@developer.gserviceaccount.com` conserva `roles/editor` directo en el proyecto y `roles/secretmanager.secretAccessor` sobre el Secret exacto `OPERATIONAL_PIN_PEPPER`, sin condición (ETag de política del secreto `BwZXaKyQhzE=`). No se leyó el valor. Antes de Bootstrap, decisión explícita: aceptar temporalmente el privilegio amplio para ese paquete o autorizar remediación IAM independiente. Alternativa a preparar: runtime SA dedicada; Firestore limitado a `(default)` por condición validada/rol custom (sin aislamiento por tenant, y Admin SDK no aplica Firestore Rules); Firebase Auth limitada a `get/create/update` necesarios para usuario/claims; accessor solo en el Secret exacto. No se cambió IAM. Referencias oficiales: [roles Firestore](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore), [atributos de condición Firestore](https://docs.cloud.google.com/iam/docs/conditions-resource-attributes), [roles Firebase Auth](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth) y [Secret Manager](https://docs.cloud.google.com/secret-manager/docs/access-control).

#### Orden de release y decisiones separadas

Secuencia técnica: review/merge gobernado del PR #628; fijar SHA de `main` posterior al merge; planes por paquete de Functions; desplegar y verificar ofertas/Bootstrap y lectores/escritor v2; desplegar y comprobar el guard Bodega y confirmar el bloqueo de la callable legacy; rollout manual del Backoffice al SHA exacto autorizado; luego pruebas posteriores autenticadas no mutantes. Solo después de Gate I y autorización se registra/aprueba oferta; Bootstrap canónico crea tenant/identidad/membresía y comienza una sola vez los 30 días. El corte Rules sigue el orden independiente de ADR-SAAS-081.

| Decisión pendiente | Riesgo y alcance que la autorización debe cubrir | Si no se aprueba |
|---|---|---|
| Functions `saas-commercial` | Actualizar executor existente y crear callable de consulta; aceptar explícitamente riesgo de ownership/continuidad, exactos IDs/SHA/config y recuperación. | No hay comandos productivos para crear/aprobar oferta. |
| Functions `saas-bootstrap` | Actualizar ID existente, preservar URI/Node22/Secret/runtime, decidir riesgo actual `roles/editor` o autorizar cambio IAM separado. | Bootstrap candidato no disponible; no hay tenant/Trial. |
| Functions compra/control | Actualización dirigida de Bodega guard y transición compatible v2; incluir los checks exactos y evidencia de compatibilidad de lectores. | Gate I y corte bloqueados. No autoriza por sí sola Rules ni pausas. |
| App Hosting | Rollout manual a SHA exacto de `main` revalidado tras merge; mantener automáticos desactivados y especificar rollback. | Backoffice sigue en `5c5c4fdd…`; no se publica la UI candidata. |
| Rules/corte | `(default)`, ruleset/hash, lista exacta de tenants, responsable por tenant, ventana, controles/revisiones, pausas por callable, verificación, atestación de reanudación y recuperación forward-fix. Reconocer efecto sobre compras directas de verticales no-Bodega. | Gate I sigue abierto. |
| IAM Bootstrap | Aceptar riesgo `roles/editor` acotado o aprobar en paquete separado SA dedicada y permisos mínimos probados; no confundirla con App Hosting. | No usar el runtime privilegiado. |
| Oferta | Autorizar `CrearOfertaComercialTenant` y `AprobarOfertaComercialTenant` para tenant objetivo, Plan anual v2 publicado, COP 1.600.000, pago manual, efectiva `2026-10-16`, sin vencimiento; revalidar duplicados/Plan/operador antes de escribir. | No existe oferta aprobada en producción. |
| Bootstrap/Trial | Una solicitud canónica para `distribuidora-las-jimenez`, `BODEGA_MVP1`, `CO`, nombre administrador confirmado fuera de banda (valor omitido en evidencia pública); operador con facultad efectiva `BOOTSTRAP_EMPRESARIAL_SOLICITAR`; confirmar inicio inmediato de los 30 días y creación de cuenta/membresía. PIN temporal se entrega fuera de banda por el responsable en WhatsApp. | No se crea tenant, usuario ni Trial. |

Antes de toda escritura comercial, releer UID y `saas_operadores/{uid}` desde la sesión productiva, estado activo y facultad canónica adecuada (`COMERCIAL_GOBERNAR`, `BOOTSTRAP_EMPRESARIAL_SOLICITAR` o `RELEASE_COMPRAS_GOBERNAR`); la identidad `gcloud` no prueba identidad SaaS. Buscar duplicados inmediatamente antes de escribir en rutas canónicas de empresa, suscripción, provisioning/configuración y oferta. Los 404 históricos eran rutas exactas, no una búsqueda de alias, y deben renovarse. No cambiar facultades.

El responsable confirmó fuera de banda el nombre autorizado de la administradora y que entregará personalmente el PIN por WhatsApp; el valor del nombre se omite en esta evidencia pública. El correo no es obligatorio para este contrato de Bootstrap y no se inventa. La oferta/precio/fecha son declaraciones del responsable, no una escritura aprobada en producción. Catálogo vacío puede diferirse para iniciar el Trial, pero no permite vender/comprar ni declarar Bodega lista.

**Estado:** las lecturas actuales confirman que la divergencia remota sigue vigente; no resolvieron las brechas técnicas. Bloqueos técnicos: Rules activas incompatibles, guard ausente en Function Bodega, callable de control productiva v1, callables comerciales/Bootstrap antiguas y App Hosting en SHA anterior. Bloqueos de autorización/gobernanza: review humana del PR #628; aprobaciones independientes por Functions, App Hosting, Rules/corte, IAM, oferta y Bootstrap/Trial; faltan tenants/responsables/ventana del corte. No se desplegó, invocó ni escribió nada; no hubo pausa, cambio IAM/API/Secret, oferta, tenant, cuenta ni Trial. Identidad/facultades actuales del operador en sesión productiva siguen por verificar justo antes de operar.

### Addendum — dictamen técnico independiente PR #628 (2026-10-18 00:55 COT)

**Dictamen:** `REJECT` para el HEAD remoto auditado; en términos de la auditoría
del repositorio, `NO APROBADO PARA MERGE`.

#### Estado remoto verificado

- PR #628 sigue `OPEN`, no draft, base `main @
  0ac4e9edf829acdf7213e7a20b722de9a58c2826`, HEAD
  `f8aa7dd894cb8624757edfcc3a471909b41e9706`, merge state `CLEAN`.
- Los checks de ese HEAD terminaron correctamente: `Tipos y pruebas` (run
  `39082123892`, job `117541054402`), Vercel y Vercel Preview Comments.
- La revisión API de GitHub devolvió cero reviews y cero comentarios inline; el
  único comentario de issue es el bot de Vercel. Los cuatro commits del PR
  terminan en el HEAD auditado. No se registró una review formal en GitHub.

#### Alcance y evaluación técnica

El diff contiene diez archivos: CI, Goal/runbook/preflight y pruebas de Rules,
descubrimiento comercial y autorización Bootstrap. No cambia código runtime de
Functions, `firestore.rules`, IAM ni recursos remotos. El Goal mantiene M2/E2.2
en ejecución y registra el aplazamiento del catálogo sin declarar Bodega lista
ni cerrar Gate I. Esto es coherente con el objetivo de preparar y endurecer la
evidencia local; los gates productivos permanecen expresamente abiertos.

Las pruebas añadidas ejercitan en Emulator el control ausente, pausado, revisión
cero y tenant incorrecto, la denegación de compras Bodega directas, ventas
client-side y lectura de señal por membresía sin permiso/inactiva. La prueba
Bootstrap verifica rechazo anónimo antes de Firestore y rechazo de facultad
incorrecta con Firestore mockeado. La prueba comercial verifica exports y
`entryPoint` del manifiesto y un caso de target cruzado. Son comprobaciones
locales; no demuestran por sí solas continuidad de Functions, gobernanza
autenticada, Rules remotas ni comportamiento productivo. El CI verde observado
corresponde al HEAD exacto y ejecutó las suites pertinentes. No se repitieron
suites completas porque el árbol runtime no cambió.

#### Hallazgo importante — privacidad de la evidencia pública

La descripción del PR afirma que la evidencia pública omite correos y UIDs de
operadores. Sin embargo, el archivo de preflight incluido en el HEAD publica en
dos lugares la dirección de una cuenta humana de Google Cloud usada para
consultas. La visibilidad de `Glemynart/micafe-pos` fue verificada como
`PUBLIC`; el correo no es necesario para preservar la evidencia del proyecto,
cuenta activa y resultados, y contradice la minimización prometida. No es una
clave ni un token, pero sí un dato personal innecesario en un artefacto público.

Corrección mínima preparada solo en este worktree: se sustituyeron localmente
las cinco apariciones encontradas —dos del contenido que está en el PR y tres
del addendum local— por la indicación de identidad verificada con correo
omitido. No se alteraron hechos técnicos, nombres de service accounts ni
credenciales. El HEAD remoto todavía conserva las dos apariciones: la
corrección no se publicó y por eso no la considero resuelta en el PR.

#### Addendum local y diferencia respecto al PR

El addendum local de revalidación del 18-oct pertenece al mismo artefacto y
alcance de preflight que el PR; no crea una fase ni requiere abrir otro PR. Es
una actualización cronológica útil para evitar que el release se lea como una
auditoría integral o como si el Trial estuviera habilitado. La porción sobre
HEAD, checks, estado abierto y ausencia de reviews coincide con la lectura
actual de GitHub. Las otras observaciones remotas conservan sus timestamps y
se consideran evidencia histórica registrada, no una nueva consulta ejecutada
durante este dictamen. El addendum no está en el HEAD remoto y no se afirma que
GitHub lo haya recibido.

#### Criterios y acciones

- **Cumplidos:** trazabilidad con G-SAAS-02/M2/E2.2; límites de no despliegue;
  tests acotados y alineados con ADR-SAAS-072/081; evidencia que no declara
  Gate I, release ni Trial completados; CI verde en el HEAD auditado.
- **No cumplido:** la afirmación de minimización de datos no concuerda con el
  contenido público del preflight. El PR se rechaza por esta contradicción
  concreta, no por la falta de una review humana ni por las brechas de release
  que el PR declara fuera de alcance.
- **Pendiente:** publicar la redacción local corregida mediante el flujo
  autorizado, actualizar el HEAD del PR y esperar checks del nuevo HEAD. La
  corrección local y este dictamen no son una aprobación formal de GitHub.
- Después de la redacción local, `git diff --check` pasó. No se repitieron
  suites: el cambio de este dictamen es documental y no altera código ni
  pruebas. Los checks remotos verdes pertenecen al HEAD anterior; cualquier
  publicación requerirá validar el nuevo HEAD.

No se publicó ni modificó el PR, no se fusionó y no se ejecutaron operaciones
remotas de Firebase/GCP. Gate I, release productivo y Trial de Diana siguen
fuera de este dictamen y en su estado previamente documentado.

### Addendum — revalidación acotada de E2.2 (2026-10-18 01:00–01:04 COT / 06:00–06:04Z)

Lecturas limitadas a `micafe-pos`, `us-central1`, las rutas canónicas exactas
del tenant/oferta y PR #628. Se usaron `gcloud auth list`, `gcloud projects
describe`, `gcloud services list --enabled`, `gcloud functions describe`,
`gcloud builds describe`, `gcloud run services describe/list`, las lecturas
REST `GET` de Firebase Rules/App Hosting/Firestore y `gh pr view`, `gh pr diff`
y GitHub API de reviews/comentarios. No se ejecutó `deploy`, `dry-run`,
invocación, escritura, habilitación de API, cambio IAM, oferta, Bootstrap ni
operación de compra. La identidad gcloud fue verificada y se omite su correo.

#### GitHub, alcance local y decisión sobre el preflight

- `micafe-pos` se confirmó `ACTIVE`, número `882525811433`; las siete APIs
  consultadas (`cloudfunctions`, `firebaseapphosting`, `firebaserules`, `run`,
  `cloudbuild`, `artifactregistry` y `secretmanager`) aparecen habilitadas. No
  se cambió su estado.
- La rama sigue `codex/e2-2-diana-release-prep`, HEAD local/remoto de rama
  `f8aa7dd894cb8624757edfcc3a471909b41e9706`; `origin/main` y base actual de
  PR #628 son `0ac4e9edf829acdf7213e7a20b722de9a58c2826`. El checkout aislado
  conserva únicamente este preflight como archivo modificado; no se hizo
  commit, push, reset ni rebase.
- PR #628 continúa `OPEN`, base `main`, HEAD
  `f8aa7dd894cb8624757edfcc3a471909b41e9706`, `mergeState=CLEAN`. `Tipos y
  pruebas` (run `39082123892`, job `117541054402`), Vercel y Vercel Preview
  Comments están `SUCCESS` para ese HEAD. La API devuelve cero reviews; el único
  comentario de issue es de Vercel. Los checks verdes no hacen merge ni
  resuelven el dictamen anterior.
- El diff remoto mantiene diez archivos, sin código runtime de Functions ni
  `firestore.rules`. El valor de correo de la cuenta humana de gcloud todavía
  aparece dos veces en el diff público; no se reproduce aquí. La copia local
  de este preflight ya lo omite. La corrección de privacidad y esta actualización
  afectan el mismo archivo que ya forma parte del PR, por lo que pertenecen al
  alcance documental del mismo PR, no a un PR funcional separado. No se
  publicaron porque esta misión no autoriza push; PR #628 permanece `REJECT /
  NO APROBADO PARA MERGE` hasta actualizar su HEAD, pasar checks y completar el
  flujo de review.
- El Goal sigue `G-SAAS-02 / M2 / E2.2` activo. No se actualizó: su referencia
  de siguiente PR aún muestra una base anterior a `0ac4e9…` y no ocurrió un
  evento formal de planificación que autorice editarla.

#### Firestore Rules y Gate I

La lectura actual del release `projects/micafe-pos/releases/cloud.firestore`
apunta al ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, creado y publicado el
`2026-08-15T04:20:45Z` y actualizado a las `2026-08-15T04:20:46.318849Z`.
El hash SHA-256 remoto se mantiene: raw
`fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`, LF
normalizado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.

La fuente exacta de `origin/main @ 0ac4e9edf829acdf7213e7a20b722de9a58c2826`
es blob Git `c74ae890b23146a11e01f36e39f0581447833a58`, 18.961 bytes, SHA-256
`b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. El
contenido remoto no coincide con el candidato. Como ambos hashes de fuente
coinciden con la lectura del 17–18 de octubre, sigue aplicando la matriz
semántica documentada en este preflight y en
[`G-SAAS-02-E2-2-GATE-I-RULES-COMPATIBILITY-MATRIX-2026-10-14.md`](G-SAAS-02-E2-2-GATE-I-RULES-COMPATIBILITY-MATRIX-2026-10-14.md): producción permite escritura directa de compra por administrador sin
consultar el control; el candidato bloquea compra Bodega directa y condiciona
otros verticales a control coincidente, `ACTIVA` y revisión válida. Esto amplía
el impacto más allá del tenant Diana. Hay además diferencias de permisos por
rol/vertical en superficies Bodega ya enumeradas en la matriz; no se infiere
que el hash igual cierre su compatibilidad.

**Gate I: `BLOCKED`.** El candidato de Rules todavía no está alineado con las
Functions productivas. Falta desplegar y verificar los guards compatibles de
compra legacy/Bodega y la implementación ADR-SAAS-084 de control/auditoría v2;
validar control ausente/activo/pausado/revisión/tenant cruzado, escrituras
directas, roles/verticales, membresía revocada y aislamiento; e identificar
para el corte cada tenant afectado, responsable, ventana, estado/revisión del
control, orden de pausa/reanudación y recuperación forward-fix. ADR-SAAS-081
prohíbe tratar el ruleset histórico más permisivo como rollback automático. No
se inicializó ni pausó ningún control y no se desplegaron Rules.

#### Functions productivas observadas

Las seis consultas dirigidas fueron de metadata; no se descargó ni ejecutó
ningún código remoto. El label `firebase-functions-hash` identifica la metadata
de despliegue, no una atestación independiente del contenido fuente.

| Callable | Estado, codebase y versión remotos a 2026-10-18 | Delta/precondición |
|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`; `saas-auth`; Node.js 22; actualizado `2026-08-15T04:27:10.213732081Z`; build `fe8efec1-32df-4b46-80cd-03fc0ff16b64`; source generation `1786768013527885`; label hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`; runtime SA Compute predeterminada. | Candidato `saas-commercial` conserva el nombre y añade el export `consultarOfertaComercialTenantSaas`; el ZIP productivo inspeccionado antes no contiene el flujo de ofertas. El cambio de codebase/ownership y continuidad no están demostrados por staging ni por un planner local. |
| `consultarOfertaComercialTenantSaas` | `NOT_FOUND` en el endpoint de Functions `us-central1`. | El alta solo puede formar parte de un plan de despliegue aprobado si la ausencia se confirma de nuevo y el plan no afecta otros recursos. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`; `saas-auth`; Node.js 22; actualizado `2026-08-15T04:27:36.321446180Z`; build `fe8efec1-32df-4b46-80cd-03fc0ff16b64`; source generation `1786768013449627`; label hash `b9a033fcf119a92fa942f158e3b4ac4e609f1983`; runtime SA Compute predeterminada. | La versión productiva inspeccionada no implementa el contrato actual de oferta/Bootstrap Bodega. El candidato `saas-bootstrap` exige Auth y facultad `BOOTSTRAP_EMPRESARIAL_SOLICITAR`, y refiere `OPERATIONAL_PIN_PEPPER`; sigue sin probarse continuidad al cambiar ownership. |
| `registrarCompraOperativaV1` | `ACTIVE`; `saas-auth`; Node.js 22; actualizado `2026-10-15T16:50:25.789673942Z`; build `32fe5fec-a4c5-4c9b-9315-a68b5c2d75a7`; source generation `1792083010702967`; label hash `9a0a088d1ee7c3caf1d5d1d087f97328fb646443`. | La evidencia previa inspeccionó el artefacto con guard para compra nueva/replay. No se redeploya ni se atribuye prueba de Rules por metadata. |
| `registrarCompraBodegaV1` | `ACTIVE`; `saas-bodega-operations`; Node.js 22; actualizado `2026-10-14T09:29:23.381063034Z`; build `604494cb-10f3-46db-a692-5c4d2009eee2`; source generation `1791970149694527`; label hash `fa7f47c21b994a5ebccefded6e548e0f6b193c79`. | La inspección previa del artefacto encontró ausente el guard ADR-SAAS-081. Metadata y generación no cambiaron; se requiere paquete dirigido y verificación del artefacto compatible antes de Rules. |
| `transicionarPausaComprasSaas` | `ACTIVE`; `saas-auth`; Node.js 22; actualizado `2026-10-15T16:50:26.772565182Z`; build `32fe5fec-a4c5-4c9b-9315-a68b5c2d75a7`; source generation `1792082970343879`; label hash `9a0a088d1ee7c3caf1d5d1d087f97328fb646443`. | El artefacto productivo previamente inspeccionado emite v1 y puede etiquetar `0→1 ACTIVA` como reanudación. El código candidato en `main` sí contiene `schemaVersion: 2` y clasifica inicialización; no está servido. ADR-SAAS-084 exige lectores compatibles antes de emitir v2. |

Los builds observados para esos paquetes (`fe8efec1…`, `32fe5fec…` y
`604494cb…`) terminaron `SUCCESS` y registran como `serviceAccount` de build
`882525811433-compute@developer.gserviceaccount.com`. La cuenta es también la
runtime SA de las cinco Functions consultadas; esta coincidencia no convierte
los permisos de build y ejecución en el mismo rol lógico. La política directa
del proyecto, ETag `BwZd5Jnfn5U=`, confirma `roles/editor` para esa identidad;
la política del Secret `OPERATIONAL_PIN_PEPPER`, ETag `BwZXaKyQhzY=`, confirma
`roles/secretmanager.secretAccessor` para esa misma cuenta. Existe la versión
habilitada `1`; no se leyó el valor. La SA de App Hosting es distinta.

Esto conserva un riesgo P1 de mínimo privilegio. Antes de usar el runtime de
Bootstrap, el responsable debe decidir expresamente entre aceptar
temporalmente `roles/editor` para el alcance/ventana concretos o autorizar una
remediación IAM separada con SA dedicada y permisos mínimos probados. No se
concedieron ni retiraron roles. Recuperación: builds/servicios previos existen,
pero no se demostró restauración funcional de Functions con fuente/config
correspondiente; no se marca rollback como probado. Staging demuestra estado
Ready y pruebas limitadas del flujo, no continuidad durante cambio de
codebase, identidad/auth productivas, rollback productivo ni equivalencia de
artefactos.

#### App Hosting productivo

La lectura actual confirma el backend `micafe-pos` en `us-central1`, URL
`https://micafe-pos--micafe-pos.us-central1.hosted.app`, repositorio
`Glemynart/micafe-pos`, raíz `/`, y runtime service account
`firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`. El build
`build-2026-10-15-001` permanece `READY`, el rollout asociado `SUCCEEDED`, y la
fuente efectiva es exactamente `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`.
Cloud Run reporta `micafe-pos-build-2026-10-15-001` Ready con 100 % del tráfico;
la imagen usa el runtime base Node.js 24. No se inició otro build/rollout.

La fuente candidata actual de `main` es `0ac4e9…`, posterior al build servido;
el HEAD abierto `f8aa7dd…` añade evidencia/pruebas/documentación, no código de
aplicación, pero no está integrado. Los cambios web posteriores al rollout
incluyen navegación comercial y ajustes de compra Bodega registrados en los
checkpoints de #621, #623 y #626. No hay autorización de promoción. La lectura
actual del recurso backend no devolvió el campo `rolloutPolicy`, así que el
estado de rollouts automáticos no quedó revalidado en esta consulta; debe
comprobarse de nuevo antes de publicar. La revisión existente/imagen previa es
un punto de recuperación, no un rollback de tráfico ensayado en este paquete.

#### Oferta, tenant, identidad y Trial

Lectura Firestore de rutas exactas en `(default)`:

| Ruta | Resultado |
|---|---|
| `planes/mvp_comercial/versiones/2` | `FOUND`, `estado=PUBLICADA`, `periodicidad=ANUAL`, `revision=2`. |
| `empresas/distribuidora-las-jimenez` | `404`. |
| `ofertas_comerciales_tenant/distribuidora-las-jimenez` | `404`. |
| `ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026` | `404`. |

Los `404` cubren esas rutas exactas, no descartan un duplicado con otro ID;
antes de escribir se requiere la búsqueda canónica/idempotente desde el
Backoffice/flujo autorizado, no una escritura directa. La oferta anual de COP
`1.600.000`, pago manual, efectiva desde `2026-10-16` y sin vencimiento sigue
siendo una declaración de aceptación del responsable; no existe documento de
oferta aprobada en producción. Deben autorizarse por separado `CrearOfertaComercialTenant`
y `AprobarOfertaComercialTenant`, con `COMERCIAL_GOBERNAR` efectivo y Plan
publicado revalidado justo antes de ejecutar.

Se conservan las confirmaciones humanas ya recibidas: país `CO` y confirmación
fuera de banda del nombre autorizado (valor omitido en evidencia pública). El
responsable le entregará el PIN/código temporal por WhatsApp fuera del sistema.
El Bootstrap canónico no exige un
correo para este contrato; no se solicita ni inventa uno. El Goal del
`2026-10-17` permite iniciar el Trial inicial no fiscal de 30 días con catálogo
vacío una vez superados los demás gates; el catálogo aprobado sigue siendo
obligatorio antes de vender/comprar o declarar Bodega operativa. El Trial no
existe hoy y solo empezaría con Bootstrap canónico exitoso.

El inventario CUA actual mostró Brave sin tab productiva y el IAB en staging;
no mostró una sesión de Edge/Backoffice de producción. La afirmación anterior
de que hay una sesión activa no acredita hoy el UID. No se pudo confirmar la
identidad efectiva ni leer `saas_operadores/{uid}` en el contexto productivo;
antes de cualquier escritura un operador debe abrir la consola productiva y se
deberán verificar UID, estado activo y la facultad concreta (`COMERCIAL_GOBERNAR`
para la oferta o `BOOTSTRAP_EMPRESARIAL_SOLICITAR` para Bootstrap). No se
deduce de `RELEASE_COMPRAS_GOBERNAR`.

#### Estado consolidado de gates y autorizaciones separadas

| Gate/operación | Estado actual | Qué lo cierra / qué habilitaría |
|---|---|---|
| PR #628 / código y evidencia | `BLOCKED`; checks verdes pero PR abierto y rechazado por dos apariciones de correo humano en evidencia pública. La redacción local está corregida; no está en GitHub. | Autorizar publicar únicamente el preflight corregido; verificar el nuevo HEAD/checks y completar review/merge según gobernanza. |
| Functions `saas-commercial` | `BLOCKED`; producción antigua, nuevo `consultarOferta…` ausente y cambio de ownership sin continuidad demostrada. | Autorización propia para el SHA/codebase/targets exactos, plan que enumere altas/actualizaciones/bajas, evidencia de configuración y recuperación; abortar si hay delete/recreate, ID, URI, región, trigger o ingress inesperado. |
| Functions `saas-bootstrap` | `BLOCKED`; producción antigua y riesgo `roles/editor` del runtime. | Autorización distinta para `solicitarBootstrapEmpresarialSaas`, preservando región/URI/identidad/Secret; además decisión IAM explícita de aceptación temporal o remediación separada. |
| Functions de compras/control | `BLOCKED`; Bodega carece del guard en el artefacto observado y control prod no cumple v2. | Autorizaciones dirigidas independientes para los targets exactos, con lectores v1/v2 validados, pruebas requeridas y artefactos/hash posterior. No habilitan Rules ni pausas. |
| App Hosting | `BLOCKED`; producción sirve `5c5c4fdd…`, no el `main` actual; política automática no expuesta por lectura actual. | Autorización de rollout manual para un SHA exacto posterior a merge, más prueba de automáticos desactivados, plan, verificación de build/tráfico y recuperación. |
| Rules / corte de compras | `BLOCKED`; ruleset `d5e205db…` difiere de candidato `b8fb7ddd…`, Functions aún incompatibles y alcance/tenants/ventana no definidos. | Autorización separada para el release `(default)`, con lista exacta de tenants y responsables, ventana, controles/revisiones, pausa/reanudación por callable, criteria de aborto y forward-fix. |
| IAM Bootstrap | `BLOCKED`; `roles/editor` efectivo en la runtime SA. | Decisión explícita de riesgo o autorización de paquete IAM separado; sin cambios por conveniencia. |
| Oferta anual | `BLOCKED`; Plan está publicado pero no existe oferta persistida; operador no verificado. | Autorización específica para crear y, separadamente, aprobar COP 1.600.000/manual/desde `2026-10-16`/sin vencimiento; revalidar duplicados, Plan y facultad. |
| Bootstrap/Trial | `BLOCKED`; no hay tenant/oferta, función candidata no desplegada y operador no verificado. | Autorización específica para crear `distribuidora-las-jimenez` con `BODEGA_MVP1`, `CO`, el nombre administrador confirmado fuera de banda (valor omitido en evidencia pública) y Trial 30 días; confirmar ausencia canónica, oferta/Plan, facultad efectiva, configuración no vacía y manejo del PIN fuera de banda. |
| Catálogo/readiness | `DEFERIDO PARA TRIAL VACÍO`; borrador no aprobado. | No bloquea el Trial inicial por decisión E2.2; sí bloquea importación, venta, compra y declaración de readiness hasta que el cliente apruebe el maestro. |

**Resultado a 2026-10-18:** E2.2 sigue en ejecución y el release/Trial permanece
`NO-GO`. Lo nuevo confirmado es que PR, Rules, Functions, App Hosting, Plan y
rutas exactas del tenant/oferta no cambiaron respecto de la evidencia previa;
se actualizaron hashes/metadata y se registraron las confirmaciones humanas de
nombre y canal PIN. No se resolvió ningún gate técnico ni se hizo escritura
productiva. Ninguna autorización individual de esta tabla está concedida por
este addendum. `git diff --check` se ejecutará tras cerrar la edición local;
no se repitieron suites runtime porque el código no cambió y los checks vigentes
de PR #628 corresponden al HEAD remoto auditado, no a este addendum local.

### Addendum — auditoría independiente del PR #628 (2026-10-18 01:15 COT / 06:15Z)

Lectura actual de GitHub: PR #628 permanece abierto, no draft, base `main @
0ac4e9edf829acdf7213e7a20b722de9a58c2826`, HEAD
`82558b5f5a41b927a7dca06001c1599e371e8d3a`. El diff contiene diez archivos:
pruebas de Rules Emulator, pruebas de discovery/autorización, un paso de CI y
Goal/runbook/evidencia; no cambia Functions runtime, `firestore.rules`, IAM ni
recursos remotos. El archivo de preflight y sus addenda están ya en el diff
remoto; en este worktree no había un addendum sin publicar al iniciar la
revisión. Las secciones anteriores son snapshots fechados, no lecturas actuales.

La API de repositorio confirma `visibility=public`. En el HEAD remoto, el
preflight incluía el nombre personal completo aprobado para la cuenta
administradora. La autorización recibida cubre ese nombre como dato de cuenta,
pero no acredita consentimiento para publicarlo en un repositorio público; no
es necesario para probar la semántica de Rules, Functions o Bootstrap. Se
preparó esta redacción local para omitir el valor y conservar solo que fue
confirmado fuera de banda. Esta corrección no está publicada y no se afirma que
el HEAD remoto esté anonimizado.

Revisión técnica independiente: no se encontraron defectos de runtime porque
no hay cambios runtime. Los tests nuevos son locales/Emulator y no certifican
Rules remotas, continuidad de Functions ni el release productivo. El test de
discovery comprueba exports y `entryPoint` del manifiesto local más un mapeo
declarado de `FUNCTION_TARGET`; no equivale a una invocación ni a una verificación
del artefacto remoto, límite que la evidencia documenta. El test de autorización
Bootstrap prueba rechazo anónimo antes de Firestore y operador sin la facultad
requerida; la implementación sigue haciendo la autorización canónica. Las
pruebas de Rules añadidas cubren los estados descritos, sin cerrar Gate I.

Los checks de PR #628 para el HEAD remoto `82558b5f5a41b927a7dca06001c1599e371e8d3a`
terminaron en PASS: `Tipos y pruebas` (run `39103121760`, job
`117603291445`, duración 26m15s), Vercel y Vercel Preview Comments. Consulta
verificada el `2026-10-18T06:37:21Z`. La API de reviews devolvió cero reviews;
el único comentario es automatizado por Vercel. No se trata la falta de review
humana como defecto de la propuesta. Estos checks no cubren el nuevo commit
local `7a89294` con la redacción anonimizada.

**Dictamen del HEAD remoto:** `REJECT`. El contenido técnico de tests y
documentación es coherente con E2.2 y mantiene abiertos los gates productivos,
pero el cambio publica un dato personal que no es necesario para la evidencia
técnica y no cuenta con autorización explícita para su divulgación pública. La
corrección mínima es anonimizar ese valor en el preflight y publicar la
redacción revisada; después deben terminar los checks del nuevo HEAD. No es un
rechazo por falta de review humana ni por los bloqueos productivos que el PR
correctamente mantiene fuera de alcance.

Esta redacción y dictamen son locales. No se editó el PR remoto, no se fusionó y
no se ejecutaron despliegues, invocaciones ni escrituras de negocio.

La redacción local no elimina la exposición de commits públicos ya existentes.
La revisión o retirada de esa copia histórica requeriría el procedimiento del
administrador del repositorio para datos personales y autorización separada;
no se reescribió historia ni se solicitó una purga.

### Addendum — revalidación productiva de solo lectura (2026-10-18 01:45 COT / 06:45Z)

Se verificó `gcloud auth list`: una identidad CLI activa coincide con la cuenta
operadora indicada previamente. Esto no acredita la sesión SaaS ni sus facultades.
`gcloud projects describe micafe-pos` devolvió proyecto `micafe-pos`, número
`882525811433`, estado `ACTIVE`.

`gcloud functions list --project=micafe-pos --regions=us-central1 --format=json`
devolvió los siguientes recursos relevantes (solo lectura):

| Callable | Estado / actualización | Codebase y hash observado | Runtime / actor efectivo |
|---|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, `2026-08-15T04:27:10Z` | `saas-auth`, `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0` | Gen2, Node 22, `FUNCTION_TARGET` coincide; runtime SA Compute predeterminada del proyecto. |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, `2026-08-15T04:27:36Z` | `saas-auth`, `b9a033fcf119a92fa942f158e3b4ac4e609f1983` | Gen2, Node 22, `FUNCTION_TARGET` coincide; runtime SA Compute predeterminada del proyecto. |
| `registrarCompraBodegaV1` | `ACTIVE`, `2026-10-14T09:29:23Z` | `saas-bodega-operations`, `fa7f47c21b994a5ebccefded6e548e0f6b193c79` | Gen2, Node 22, `FUNCTION_TARGET` coincide; runtime SA Compute predeterminada del proyecto. |
| `transicionarPausaComprasSaas` | `ACTIVE`, `2026-10-15T16:50:26Z` | `saas-auth`, `9a0a088d1ee7c3caf1d5d1d087f97328fb646443` | Gen2, Node 22, `FUNCTION_TARGET` coincide; runtime SA Compute predeterminada del proyecto. |

`consultarOfertaComercialTenantSaas` no apareció en el inventario completo de
`us-central1`; la conclusión se limita a esa región. La Function de Bootstrap
y la comercial siguen en `saas-auth`, por lo que permanece el riesgo de
continuidad/ownership descrito en el preflight. No se invocó ninguna callable.

Para App Hosting, la API oficial permitió lecturas GET acotadas a
`micafe-pos/us-central1`: existe el backend `micafe-pos`, actualizado el
`2026-10-15T17:49:24Z`, con la aplicación web asociada ya documentada. El único
build listado es `build-2026-10-15-001`, estado `READY`, fuente exacta
`5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`; su rollout homónimo está
`SUCCEEDED` y el recurso Traffic asigna 100 % a ese build. La identidad de
backend observada es `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
Estas lecturas no prueban runtime/arranque autenticado ni autorizan otro rollout.

La API `firebaserules.googleapis.com` aparece habilitada en el proyecto objetivo,
pero la lectura GET de `projects/micafe-pos/releases` falló con
`403 PERMISSION_DENIED`, razón `SERVICE_DISABLED`, consumidor/proyecto de cuota
`32555940559`. No se habilitó API ni se cambió el proyecto de cuota; Rules activas
y Gate I siguen sin revalidación remota vigente.

La inspección de ventanas del escritorio no encontró Microsoft Edge abierto; la
única ventana de navegador visible era Brave con WhatsApp y no se inspeccionó.
Por tanto, la identidad autenticada en Backoffice productivo y sus facultades
canónicas siguen `NOT VERIFIED`. No hubo invocaciones, escrituras, cambios de
IAM/API, despliegues ni operaciones comerciales. El rollout App Hosting está
confirmado, pero el release/Trial sigue `NO-GO` por las divergencias de Functions,
la lectura bloqueada de Rules y la falta de verificación autenticada del operador.

### Addendum — alcance corregido del corte E2.2 y compatibilidad con tenants de prueba (2026-10-18 13:59 COT / 18:59Z)

La aclaración del responsable fija el alcance operativo de E2.2 sin ambigüedad:
el único tenant objetivo es `distribuidora-las-jimenez`, vertical
`BODEGA_MVP1`. `Cafe Atrato` y `Prueba` son entornos de prueba y quedan fuera
del corte. No se solicita designarlos, inicializar controles para ellos ni
modificar sus Rules efectivas, datos o configuración tenant-scoped. Esta
decisión resuelve la selección de tenants; no es un bloqueo pendiente.
El ID indicado es el alcance canónico autorizado, no una afirmación de que el
documento del tenant exista ya; su existencia deberá revalidarse por lectura
canónica antes de operaciones futuras. Este addendum sustituye cualquier
formulación anterior que dejara pendiente elegir entre tenants de prueba; no
resuelve quién ejecutará el corte ni su ventana operativa.

#### Hallazgo sobre el candidato de `main`

Revisión estática de `main @ 1918c0916f6497a34c01cbe17fded15992cfac2f`:

- `firestore.rules:83-97`, `comprasHabilitadasParaTenant()`, exige documento de
  control v1 coincidente, `ACTIVA` y revisión válida.
- `firestore.rules:224-230`, `/compras`, niega siempre create/delete directo
  para Bodega, pero también condiciona create/delete de todos los demás
  verticales a `comprasHabilitadasParaTenant()`.
- `functions/src/finanzas/compra-core.ts:208-250` aplica el control fail-closed
  en el núcleo compartido de compras. La ruta legacy además rechaza Bodega,
  conforme a ADR-SAAS-075; el cambio de guard en ese núcleo puede también
  alterar compras no-Bodega que usen el mismo camino.

Por ello, el candidato actual **no demuestra** que incorporar el tenant Bodega
pueda hacerse sin cambiar el comportamiento efectivo de `Cafe Atrato` y
`Prueba`. La evidencia de lectura previa del 2026-10-18 encontró cero controles
para esos tenants; es histórica, no una lectura actual, y no se modifica ni se
repite aquí. Si siguen sin control, el candidato actual puede denegar compras
que antes eran permitidas. No se crean controles para compensar ese efecto.

Las Rules de Firestore se publican como una Ruleset global para la base
`(default)`: no existe una Ruleset por `empresaId`. Un despliegue futuro
necesariamente actualiza ese recurso global; el requisito de no afectar a los
tenants de prueba se satisface únicamente si se demuestra que sus permisos y
resultados efectivos permanecen equivalentes. No significa que el recurso
global pueda dejarse intacto mientras se despliega Rules para Diana.

#### Plan de release delimitado

El plan separa la infraestructura global de las acciones del tenant objetivo:

| Superficie | Alcance técnico | Acción tenant-scoped | Gate antes de ejecutar |
|---|---|---|---|
| Código de compra / Functions | Paquetes y callables concretos, con impacto de código compartido evaluado por vertical. | Ninguna acción sobre `Cafe Atrato` o `Prueba`; el guard de Bodega solo puede bloquear el tenant Bodega. | Aceptación del ADR-SAAS-085 propuesto; PR técnico, pruebas Bodega y no regresión no-Bodega, inventario/plan remoto, artefacto y recuperación verificables y autorización de Functions separada. |
| Firestore Rules | Una Ruleset global de `(default)`; el diff debe limitarse a la frontera Bodega y preservar semántica no-Bodega. | Solo `distribuidora-las-jimenez` participa en la pausa/control del corte. | Lectura vigente del release/ruleset activo, hash/fuente, compatibilidad de Functions, pruebas por vertical/rol/control/revocación/aislamiento, responsable y ventana confirmados, autorización de Rules independiente y procedimiento forward-fix. |
| Control de compras | Documento canónico por tenant, manipulado solo por `transicionarPausaComprasSaas`. | Solo `distribuidora-las-jimenez` puede tener control o participar en un corte; nunca los tenants de prueba. Si el tenant es nuevo, primero debe existir la Empresa para que la callable permita inicializarlo. | Revalidar ausencia/presencia canónica; identidad/facultad efectiva, revisión/estado y callable compatibles; autorización de cada transición. Si ya existe, usar el corte completo de ADR-SAAS-081. |
| Oferta, Bootstrap y Trial | Callables comerciales/Bootstrap y runtime/Secret compartidos, con su propio riesgo de release. | Oferta y alta únicamente para `distribuidora-las-jimenez`, `BODEGA_MVP1`, `CO`; no ejecutadas en esta tarea. | Contratos productivos compatibles, ausencia de duplicados, Plan publicado, operador autenticado con facultades, aceptación del riesgo IAM o remediación separada, aprobaciones individuales y autorización de escritura. |

Secuencia futura propuesta, todavía `NO-GO` y no autorizada:

1. Obtener decisión formal sobre ADR-SAAS-085: control obligatorio Bodega y
   preservación de la semántica de otros verticales, además del tratamiento de
   un tenant nuevo no existente al aplicar Rules. Si no se acepta, no cambiar
   código ni iniciar el Trial por inferencia.
2. Implementar en PR técnico solo la opción aceptada. Probar Bodega con control
   ausente/inválido/pausado/activo, escritura directa denegada, callable legacy
   rechazando Bodega también en replay, y equivalencia de Rules/Functions para
   verticales no-Bodega sin crear controles ni tocar sus datos.
3. Antes de cualquier operación remota, revalidar en solo lectura que el
   tenant objetivo no exista y que no haya compras/operaciones que requieran
   recuperación; inventariar Ruleset global, Functions, SHA/configuración,
   artefactos, operador y facultades; preparar planes y recovery. Confirmar
   responsables/ventana y obtener autorizaciones independientes para Functions
   y Rules.
4. Solo si el destino sigue siendo un tenant realmente nuevo, aplicar la
   excepción propuesta por ADR-SAAS-085: actualizar/verificar primero Functions
   compatibles y luego la Ruleset global, cuyo diff deberá preservar el
   comportamiento efectivo no-Bodega. La callable Bodega falla cerrada sin
   control y Rules ya niega sus escrituras directas, así que no hay ventana de
   compras habilitadas para el tenant aún inexistente. Verificar todas las
   invariantes antes de cualquier oferta/Bootstrap. Si el tenant ya existe,
   esta excepción no aplica: seguir el corte completo de ADR-SAAS-081, solo
   para `distribuidora-las-jimenez`, con control, pausa, verificación,
   reanudación atestada y recuperación forward-fix.
5. Después de certificar el release y con aprobaciones de negocio/escritura
   separadas, buscar duplicados, crear/aprobar la oferta y ejecutar el
   Bootstrap canónico. El Bootstrap inicia los 30 días; no se inicia antes de
   completar los gates de release.
6. Al existir Empresa, inicializar por la callable canónica el control del
   único tenant objetivo `expectedRevision: 0 → ACTIVA`; verificar actor,
   revisión y auditoría antes de habilitar compras o entregar acceso operativo.
   Si falla, mantener compras bloqueadas y no intentar una escritura directa,
   reintento ciego o cambio en un tenant de prueba.

El paso 4 para tenant nuevo es una propuesta y **no es todavía una excepción
aceptada** a la secuencia de ADR-SAAS-081. Se requiere la decisión formal del
responsable documentada en ADR-SAAS-085 antes de implementar o ejecutar esa
ruta. No desplegar Rules permisivas como rollback ordinario.

La secuencia no habilita ventas ni compras en un tenant vacío. La decisión
E2.2 existente permite diferir el catálogo definitivo durante el Trial inicial
no fiscal, pero el catálogo aprobado sigue siendo requisito para vender,
comprar o declarar Bodega operativa. La oferta, el Bootstrap, el control de
compras, Rules y Functions siguen siendo operaciones distintas con
autorizaciones independientes.

#### Decisión arquitectónica pendiente y estado

El candidato actual aplica el control a todos los verticales y el ADR-SAAS-081
adoptado lo describe como fail-closed cuando el control falta. Las ADR-SAAS-072
y 075, en cambio, preservan el comportamiento de otros verticales fuera de
Bodega. La aclaración de alcance no modifica silenciosamente ninguna ADR. Se
preparó [ADR-SAAS-085 — Alcance del control de compras Bodega en E2.2](../../../ADR-SAAS-085-alcance-control-compras-bodega-e2-2.md)
como `PROPUESTO`; recomienda limitar el guard obligatorio al corte Bodega de
E2.2, pero requiere aceptación explícita antes de tocar código o Rules. Hasta
entonces prevalece el contrato aceptado actual y no se modifica el candidato.

No se ejecutaron suites ni consultas remotas en esta actualización documental.
Las referencias de Rules, Functions, App Hosting, tenants y controles citadas
arriba son evidencia histórica fechada en las secciones anteriores, no
revalidación del estado remoto actual. La compatibilidad con los tenants de
prueba queda **no demostrada para el candidato actual**; la selección del
alcance, en cambio, queda resuelta. Gate I, release productivo y Trial siguen
`NO-GO`.

### Addendum — revalidación de alcance y superficies remotas (2026-10-18 14:07–14:11 COT / 19:07–19:11Z)

Esta lectura continúa la instrucción de alcance del responsable: la única alta
y cualquier control tenant-scoped de E2.2 corresponden a
`distribuidora-las-jimenez`, vertical `BODEGA_MVP1`. `Cafe Atrato` y `Prueba`
no integran el corte operativo; no se solicita designarlos ni se autoriza
cambiar sus controles, documentos, datos o configuración. Esta decisión elimina
la antigua incertidumbre de selección. No elimina la obligación de demostrar
que los cambios globales de Functions/Rules preservan su comportamiento
efectivo.

#### Estado integrado

- `git ls-remote origin refs/heads/main`: `1918c0916f6497a34c01cbe17fded15992cfac2f`.
- PR #628 quedó fusionado en `512b19703a9b6936edd484bf71b7b8f7e3fa7875`;
  sus checks de CI, Vercel y Preview Comments terminaron `SUCCESS`; CI
  post-merge `39111383872` terminó `success` para el SHA del merge.
- PR #629 quedó fusionado en `1918c0916f6497a34c01cbe17fded15992cfac2f`;
  sus checks de CI, Vercel y Preview Comments terminaron `SUCCESS`; CI
  post-merge `39149845722` terminó `success` para el SHA de `main`.
- El checkout aislado de preparación estaba en el mismo SHA que `origin/main`.
  No se publicaron los cambios locales de este expediente ni se modificó el
  checkout compartido.

PR #629 integra la validación estricta de `schemaVersion: 1`, forma del control,
revisión segura, concurrencia y semántica v2 de ADR-SAAS-084 en el código
candidato. Sus checks prueban el candidato integrado, pero no acreditan que
Functions o Rules productivas ya lo ejecuten.

#### Rules productivas y candidata exacta

Consulta read-only del release `projects/micafe-pos/releases/cloud.firestore`
el `2026-10-18T19:07:01.2943941Z`:

- Release activo: `cloud.firestore`; ruleset referenciado:
  `projects/micafe-pos/rulesets/d5e205db-0ab4-4db1-b5ec-1534bee39d35`.
- `updateTime` del release: `2026-08-15T04:20:46Z`; creación del ruleset:
  `2026-08-15T04:20:45Z`.
- Fuente recuperada: `firestore.rules`, 14.846 bytes UTF-8. SHA-256 de la
  fuente recibida: `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`;
  SHA-256 con saltos normalizados a LF: `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.
- Candidata `firestore.rules` en `main @ 1918c091…`: SHA-256 de bytes del
  archivo: `a90863d94405e9bd6e39a8fb96a6df370a9974c7363eca42959a856b476a469e`;
  SHA-256 normalizado a LF: `5f62c36b429507046063ede684dff64c6e667cf2afce51b0f8b73cef8fd51e06`.

En `/compras`, la fuente activa no consulta el control de release para
autorizar `create`/`delete` del administrador del tenant. La candidata niega
esas escrituras directas para Bodega, pero además exige control v1 coincidente,
`ACTIVA` y revisión segura a todos los verticales no-Bodega. Por tanto, como
cambio global, la candidata **no preserva** hoy la semántica de compras
no-Bodega: para un tenant sin control, el permiso antes disponible puede
quedar denegado. La condición exacta de control para cada vertical sí puede
simularse localmente, pero no se debe compensar creando controles para los
tenants excluidos.

La suite existente también codifica esa semántica universal: en
`firestore-rules/bodega-purchases.test.ts`, el caso
`ADR-081: compras legacy fallan cerrado sin control activo y Bodega sigue callable-only`
espera que un tenant sintético `GENERAL` sin control no pueda escribir compras
directas y que solo pueda hacerlo con un control v1 `ACTIVA` válido. Los casos
de esquema ausente/desconocido y revisión límite también lo hacen fail-closed.
Es una fixture de Emulator, no una lectura de `Cafe Atrato` o `Prueba`. La suite
verde de #629 demuestra el contrato candidato actual, no el requisito de
preservar el comportamiento anterior de no-Bodega. Resolverlo requiere decisión
formal y cambios de regresión explícitos; no se puede presentar como simple
ajuste de fixture.

El deploy de Rules reemplazaría el release de la base `(default)` completa; no
existe Ruleset separada por tenant. La inclusión segura de Diana exige que una
candidata revisada mantenga equivalencia efectiva no-Bodega y aplique el
fail-closed Bodega. Esta lectura confirma una divergencia de `/compras`; no es
una nueva certificación de todos los paths de Gate I. La última matriz de
divergencias no cubierta por esta lectura sigue pendiente de revalidación antes
de cualquier deploy.

#### Functions productivas observadas

Consultas `gcloud functions describe --v2`, proyecto `micafe-pos` / región
`us-central1`, realizadas durante el mismo intervalo. La cuenta CLI activa fue
`segucor0526@gmail.com`; el proyecto devolvió ID `micafe-pos`, número
`882525811433`, estado `ACTIVE`.

| Function | Estado / `updateTime` | Codebase / etiqueta hash | Runtime / identidad de build y runtime |
|---|---|---|---|
| `ejecutarComandoComercialSaas` | `ACTIVE`, `2026-08-15T04:27:10.213732081Z` | `saas-auth` / `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0` | Node.js 22; Compute default |
| `solicitarBootstrapEmpresarialSaas` | `ACTIVE`, `2026-08-15T04:27:36.321446180Z` | `saas-auth` / `b9a033fcf119a92fa942f158e3b4ac4e609f1983` | Node.js 22; Compute default |
| `registrarCompraBodegaV1` | `ACTIVE`, `2026-10-14T09:29:23.381063034Z` | `saas-bodega-operations` / `fa7f47c21b994a5ebccefded6e548e0f6b193c79` | Node.js 22; Compute default |
| `registrarCompraOperativaV1` | `ACTIVE`, `2026-10-15T16:50:25.789673942Z` | `saas-auth` / `9a0a088d1ee7c3caf1d5d1d087f97328fb646443` | Node.js 22; Compute default |
| `transicionarPausaComprasSaas` | `ACTIVE`, `2026-10-15T16:50:26.772565182Z` | `saas-auth` / `9a0a088d1ee7c3caf1d5d1d087f97328fb646443` | Node.js 22; Compute default |
| `consultarOfertaComercialTenantSaas` | `NOT FOUND` (`404`) | No aplica | No aplica |

La identidad de build y runtime reportada para las Functions anteriores es
`882525811433-compute@developer.gserviceaccount.com`; la etiqueta remota es
metadata y no una atestación de artefacto fuente. No se descargaron imágenes ni
se ejecutó código. Las fechas/hash muestran que las Functions de compras y
control observadas no están revalidadas contra el `main` posterior a PR #629;
las callables comerciales y Bootstrap siguen etiquetadas bajo `saas-auth`, no
los codebases candidatos. El control solo puede inicializarse cuando
`empresas/{empresaId}` existe, según la callable del código candidato en
`main`; por eso no puede preinicializarse canónicamente para un tenant todavía
no creado.

#### App Hosting y rollout

Las lecturas REST acotadas a `micafe-pos/us-central1` observaron backend
`micafe-pos`, URI `micafe-pos--micafe-pos.us-central1.hosted.app`, runtime
Node.js 24 y reconciliación inactiva. Su único build listado es
`build-2026-10-15-001`, `READY`, fuente
`5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`; el rollout homónimo está
`SUCCEEDED`. La lectura de Cloud Run confirmó 100 % de tráfico a la revisión
`micafe-pos-build-2026-10-15-001`. El SHA servido no es el `main @ 1918c091…`.
La API App Hosting consultada no expuso el campo de política de rollout en esta
respuesta; la lectura de Cloud Run sí acredita el tráfico actual observado.

#### Compatibilidad, alcance y plan actualizado

El resultado es **NO-GO técnico**, no por falta de selección de tenants:

1. El único objetivo tenant-scoped es `distribuidora-las-jimenez` (`BODEGA_MVP1`).
   `Cafe Atrato` y `Prueba` quedan fuera del corte: no se les designará, pausará,
   inicializará control ni cambiarán sus datos o configuración. La Ruleset
   `cloud.firestore` del `(default)` es global, no separable por `empresaId`;
   desplegar una versión nueva reemplaza el artefacto compartido aunque la
   operación no sea tenant-scoped. Para respetar este alcance, esa versión debe
   conservar las decisiones efectivas de acceso de ambos entornos de prueba.
   Si “no cambiar sus Rules” prohíbe incluso reemplazar la Ruleset global, no se
   puede desplegar Rules bajo esa interpretación; no se resolverá alterando los
   tenants de prueba.
2. No desplegar la Rules candidata ni el `compra-core` de `main` como están:
   ambos exigen control fuera del vertical Bodega. La corrección debe conservar
   el fail-closed del flujo Bodega y la ruta legacy rechazada para Bodega,
   mientras mantiene los resultados no-Bodega previos sin crear controles
   para otros tenants.
3. ADR-SAAS-081 está aceptado y es más amplio en su texto que ADR-SAAS-072/075;
   ADR-SAAS-085 local en estado `PROPUESTO` documenta la tensión y recomienda
   una delimitación Bodega para este corte. No se modifica contrato/runtime
   hasta aceptación formal de esa decisión.

La secuencia debe distinguir la infraestructura compartida de las escrituras
del tenant objetivo:

| Superficie | Alcance real | Condición previa y verificación |
|---|---|---|
| Functions de compra/control | Código compartido del proyecto; no es una actualización por tenant y puede cambiar el comportamiento de cualquier tenant que invoque esas callables. | ADR-SAAS-085 aceptado; PR técnico con guard fail-closed para Bodega y regresión de equivalencia no-Bodega; plan dirigido y autorización de Functions independiente. Verificar IDs, región, configuración, artefacto y respuesta antes/después. |
| Rules `cloud.firestore` (`(default)`) | Ruleset global: no existe despliegue por `empresaId`. No se operan los tenants de prueba, pero el artefacto activo compartido sí se reemplaza. | Diff limitado a Bodega y resultados efectivos equivalentes para los tenants excluidos; Emulator y preflight remoto vigente; autorización de Rules independiente. Abortar ante cualquier diferencia no aprobada. |
| Oferta, Bootstrap y Trial | Escrituras tenant-scoped exclusivamente para `distribuidora-las-jimenez`. El Bootstrap canónico inicia el Trial. | Duplicados, Plan publicado, sesión/facultades y autorización operativa validados; cada operación comercial requiere su autorización correspondiente. |
| Control de compras | Solo el documento canónico de `distribuidora-las-jimenez`; no inicializar controles ni ejecutar pausas para `Cafe Atrato` o `Prueba`. | Después de existir la Empresa, transición canónica `expectedRevision: 0` a `ACTIVA`, con auditoría persistida. La secuencia de tenant nuevo es una excepción de ADR-SAAS-081 aún pendiente de aceptación en ADR-SAAS-085. |

La infraestructura compartida no se describe como cambio “solo para Diana”:
si la restricción significa que ni siquiera puede reemplazarse la Ruleset
global, se debe mantener el NO-GO para Rules. La condición verificable de esta
propuesta es no alterar permisos efectivos ni datos tenant-scoped de los dos
entornos de prueba.

4. Si la relectura canónica confirma que el tenant aún no existe, la callable
   actual de transición no puede inicializar su control antes de Bootstrap.
   El plan de ordenar Functions compatibles → Rules global compatible →
   oferta/Bootstrap del único tenant → transición `expectedRevision: 0` a
   `ACTIVA` es una excepción de secuencia a ADR-SAAS-081; requiere aceptación
   explícita en ADR-SAAS-085, pruebas de no-regresión y autorizaciones
   independientes. Si el tenant ya existe, la excepción de tenant nuevo no
   aplica y se prepara el corte normal exclusivamente para su ID, manteniendo
   equivalentes las rutas de los tenants excluidos.
5. La transición posterior al Bootstrap inicia el control únicamente luego de
   existir la Empresa. Mientras el control no esté confirmado, las compras
   Bodega permanecen bloqueadas; no se entrega acceso de operación de compras.
   Como el Bootstrap inicia el Trial, la ejecución debe ser una secuencia
   controlada inmediata y el riesgo de consumir tiempo del Trial si falla la
   transición se mantiene visible; no se afirma que el Trial esté iniciado.
6. Antes de cada mutación futura se requieren inventario/plan actuales,
   artefacto y recuperación verificables, compatibilidad local/emulador,
   operador productivo y facultades canónicas revalidados y autorización
   específica para Functions, Rules, oferta y Bootstrap. No se ejecutó ninguna.

**Estado:** selección del tenant objetivo resuelta; entornos de prueba fuera del
corte; Rules/Functions incompatibles para el alcance exigido; ADR-SAAS-085
pendiente de aceptación; Gate I, release y Trial siguen `NO-GO`. Solo pasaron
checks de CI de #628/#629 y lecturas remotas de metadatos/contenido; no se
ejecutaron pruebas locales en esta actualización porque no cambió código.

### Addendum — aceptación de ADR-SAAS-085 (2026-10-18 14:38 America/Bogota)

El responsable aceptó explícitamente la ADR completa: Opción 2 y secuencia para
un tenant Bodega nuevo. Este evento supersede las menciones anteriores de esta
evidencia que describían ADR-SAAS-085 como propuesta pendiente; esas menciones
se conservan como snapshots históricos.

Decisión vigente: en E2.2 el control obligatorio se aplica a la ruta Bodega y
se preserva el comportamiento efectivo no-Bodega hasta un corte posterior
aprobado. `Cafe Atrato` y `Prueba` siguen totalmente fuera de las acciones
tenant-scoped; no se crean controles ni se cambian sus datos o configuración.
La Ruleset `(default)` continúa siendo infraestructura global y cualquier
reemplazo requiere demostrar equivalencia efectiva para esos tenants, además
de autorización de Rules independiente.

Para un destino Bodega realmente nuevo, sin empresa, compras ni otros
documentos operativos preexistentes —condición que debe revalidarse por lectura
inmediatamente antes de la secuencia—, el orden aceptado es: Functions
compatibles → Rules global compatibles → oferta y Bootstrap del tenant objetivo
(`distribuidora-las-jimenez`, `BODEGA_MVP1`, país `CO`, nombre autorizado) →
transición canónica única del control desde `expectedRevision: 0` a `ACTIVA`.
El Bootstrap inicia el Trial de 30 días; por ello no se inicia antes de superar
los gates globales y de contar con autorización de las operaciones comerciales.
Hasta verificar control y auditoría, las compras Bodega permanecen bloqueadas y
no se entrega acceso de operación comercial. Si el tenant ya existe o hay
operaciones, esta excepción no aplica y debe prepararse el corte normal de
ADR-SAAS-081 para ese tenant.

La aceptación habilita preparar implementación y pruebas locales en PR técnico;
no autoriza deploy de Functions, Rules o App Hosting, cambios IAM, oferta,
Bootstrap, control ni Trial. Esas operaciones mantienen aprobaciones
independientes. El estado observado de producción, Rules y Functions continúa
siendo histórico de la lectura previa; esta decisión no lo revalida. Gate I,
release y Trial permanecen `NO-GO`. El preflight previo y la evidencia histórica
siguen disponibles en las secciones anteriores; no se repitieron consultas
remotas ni pruebas en este addendum.
