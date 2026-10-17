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
