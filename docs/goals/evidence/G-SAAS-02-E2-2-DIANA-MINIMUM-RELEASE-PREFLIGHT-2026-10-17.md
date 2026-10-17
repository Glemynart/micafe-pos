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
cuenta de Cloud CLI activa fue `segucor0526@gmail.com`; el proyecto por defecto
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
