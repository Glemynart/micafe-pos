# G-SAAS-02 — Runbook mínimo de Trial y soporte

Estado: `BORRADOR OPERATIVO` hasta validar el flujo con el tenant de referencia.

## Gate adicional de M2

La certificacion read-only del tenant acepta `Empresa.estado = trial` durante el periodo contractual inicial; no se exige activar la suscripcion anual para certificar el provisioning y el onboarding.

Este runbook acompaña al Goal `G-SAAS-02`. No autoriza escrituras productivas por sí mismo ni sustituye el acceso administrativo aprobado, un backup o el registro de cambios.

La lectura productiva actual del tenant de referencia está registrada en
`docs/goals/evidence/G-SAAS-02-READONLY-PRODUCTION-2026-08-12.md` y la
publicación posterior del catálogo anual está registrada en
`docs/goals/evidence/G-SAAS-02-PLAN-ANNUAL-PUBLICATION-2026-08-12.md`. La
revalidación read-only histórica está registrada en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-13.md` y la
revalidación final contra el release observado está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-14-FINAL.md`; la
revalidación anterior contra el SHA vivo está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-14-8f0fa6f.md` y la
revalidación vigente está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-14-AE7819.md`.
La ejecución vigente observó `origin/main @
ae7819b45acbbb8014398c53b0bd135742d068c3`; los merges documentales
posteriores no modificaron runtime ni producción. Antes de cada operación se
debe volver a observar el SHA vivo de `origin/main`. La
versión anual v2 de `mvp_comercial` ya está publicada con precio de
`1.800.000 COP`, periodicidad `ANUAL` y nueve capacidades. Café Atrato, sin
embargo, conserva su suscripción mensual histórica y su Trial
`2026-08-03`–`2026-09-02`; por tanto, todavía no se considera iniciado el
Trial anual de este Goal.

## 1. Gate de entrada

Antes de crear o modificar un tenant se registra:

- proyecto Firebase y entorno;
- SHA de aplicación y versión de Functions;
- `empresaId` aprobado;
- plan publicado, versión, precio y periodicidad;
- modo `DEMO` o `FISCAL` elegido;
- administrador y membresía aprobados;
- estado del catálogo documentado: maestro aprobado antes de importar, o aplazamiento autorizado con catálogo vacío explícito. El aplazamiento no permite ventas/compras ni readiness de Bodega; los datos de identidad del administrador siguen siendo precondición del Bootstrap;
- ventana operativa y responsable;
- punto de recuperación disponible antes de escribir;
- rollback aplicable.

No se usan NIT, credenciales fiscales, PINs o secretos inventados.

## 2. Provisioning y onboarding

1. Confirmar el plan ANUAL publicado y el plazo aplicable: 30 días por regla
   general; para Distribuidora Las Jiménez, 15 días únicamente si la oferta v2
   satisface ADR-SAAS-087.
2. Ejecutar el comando canónico de bootstrap con envelope e idempotencia.
3. Verificar Empresa, Suscripción, membresía, credencial, claims y Espacio.
4. Confirmar que `configuraciones/{empresaId}.modulos.habilitados` coincide con las capacidades del Plan.
5. Entregar la credencial temporal por canal fuera de Git y registrar únicamente la referencia de evidencia.
6. En modo DEMO, validar entrada al POS. Una venta no fiscal se valida únicamente después de aprobar y cargar el catálogo, y disponer de existencias mediante el flujo canónico aplicable. Si el catálogo sigue aplazado, registrar la prueba de venta como pendiente y no declarar Bodega lista para vender.
7. Configurar productos/presentaciones después de recibir y aprobar el maestro digital; completar clientes, usuarios, permisos y flujo inicial conforme a las necesidades declaradas del cliente.

### 2.1 Gate previo: ensayo Bodega MVP-1 en Firebase App Hosting staging

El entorno de ensayo vigente es Firebase App Hosting, no un Preview de Vercel:

- URL: `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app`.
- Proyecto/backend/región: `micafe-pos-staging` / `micafe-pos` / `us-central1`.
- Relectura read-only `2026-10-23`: rollout `build-2026-10-23-001`, `SUCCEEDED`, 100% del tráfico; su fuente es `main @ 6ea1a8c65d58ed8c64fa09b028ddc74860632e62`. El backend mantiene `rolloutPolicy.disabled=true`, así que no se infiere que los merges posteriores se hayan desplegado.
- `origin/main` vigente en esta revisión: `bf8336211371814db7010beaf107b0e77d551b77`, posterior al código servido. Los merges #639 y #640 no están en staging. La lectura aquí solo revalidó App Hosting; no acredita Functions ni Rules para el SHA vigente.
- Runtime: Node 24. Next.js `16.4.1` sigue en canal Preview de App Hosting. La aceptación limitada del riesgo para producción está registrada en `ADR-SAAS-083`; no equivale a soporte activo. El backend productivo se creó y tuvo un primer rollout manual autorizado el `2026-10-15`; esto no autoriza otro rollout ni cambios posteriores.
- Evidencia de staging: [primer rollout staging](evidence/G-SAAS-02-E2-2-APPHOSTING-FIRST-ROLLOUT-2026-10-15.md). Evidencia productiva y revalidación: [rollout y seguimiento read-only](evidence/G-SAAS-02-E2-2-APPHOSTING-PRODUCTION-ROLLOUT-2026-10-15.md).

La última relectura documentada de staging (`2026-10-15T14:14:55Z`) encontró 58/58 Functions activas en Node.js 22, incluidas `registrarCompraBodegaV1` y `transicionarPausaComprasSaas`, y una diferencia de hash entre Rules desplegadas (`69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`) y el candidato entonces comparado (`b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`). Esa lectura es histórica, no una verificación del estado remoto actual. No acredita compatibilidad de Rules, autorización remota ni aislamiento completo; cualquier decisión de Rules requiere una relectura y comparación semántica vigentes, con sus prerrequisitos independientes.

Antes de provisionar un tenant real, el ensayo debe completar el Bootstrap canónico con `vertical: BODEGA_MVP1` y una identidad de prueba autorizada, confirmar que las Functions y Rules de staging corresponden al SHA probado, verificar los permisos y la configuración de tenant, y comprobar la disponibilidad de secretos operativos requeridos sin exponer valores. El smoke autenticado read-only de staging está registrado en [su evidencia](evidence/G-SAAS-02-E2-2-STAGING-AUTHENTICATED-READONLY-SMOKE-2026-10-15.md): sesión admin persistente y lectura seller pasaron en el alcance observado. El negativo cross-tenant sigue `NOT EXECUTED` y es no bloqueante para iniciar el Trial inicial de Diana por decisión del administrador; no es `PASS` y sigue pendiente para certificar aislamiento multi-tenant. Si una precondición de seguridad aplicable falla, no crear Distribuidora Las Jiménez, usuarios reales ni datos comerciales.

Después de superar los gates de preparación y con autorización operativa
específica para el alta, el primer acceso de Diana debe completar el perfil
comercial aprobado por ADR-SAAS-073 usando los datos reales que ella declare.
El perfil no exige régimen/CIIU, numeración ni facturación electrónica y no
habilita readiness fiscal; los vendedores y sus roles los creará Diana. No se
registran esos datos durante la preparación ni se confunden con datos del
fixture.

### 2.1.1 Preparación específica del Trial de Diana (revisión 2026-10-23)

- El responsable aprobó el `2026-10-23` la excepción de Trial anual de 15 días
  para este caso y confirmó la aceptación expresa de Diana. La oferta es de
  `1.600.000 COP`, con pago manual; la política general sigue en 30 días. El
  identificador opaco de aceptación y el alcance están en
  [ADR-SAAS-087](../../ADR-SAAS-087-excepcion-trial-15-dias-diana.md). La
  oferta todavía no está persistida y el tenant todavía no fue creado.
- La vigencia de elegibilidad de una oferta no inicia el Trial. Para Diana, el
  plazo de 15 días se deriva exclusivamente de la oferta v2 aprobada y
  validada server-side durante el Bootstrap canónico autorizado por
  `BOOTSTRAP_EMPRESARIAL_SOLICITAR`; la callable pública de autoservicio no
  puede consumir esta excepción. El Bootstrap fija el inicio al confirmar la
  operación, calcula el intervalo UTC semiabierto `[inicio, fin)` y un replay
  idempotente conserva las fechas originales. Las ofertas v1 y los demás
  clientes conservan el Trial anual de 30 días. Esta decisión no autoriza
  registrar la oferta, crear el tenant, ejecutar Bootstrap/Trial ni desplegar.
- Cliente previsto: Distribuidora Las Jiménez, vertical `BODEGA_MVP1`;
  Diana será la administradora inicial y creará los usuarios vendedores y
  asignará sus roles. Los datos comerciales reales se capturan en su primer
  acceso; no se inventan NIT, domicilio, correo, teléfono ni credenciales.
- Después de un Bootstrap autorizado, verificar en modo de solo lectura el
  estado `trial` y los 15 días exactos de Diana, con fechas coincidentes en la
  oferta consumida, `snapshotContrato` v2, suscripción y evento de auditoría;
  verificar también membresía/rol y claims de Diana, credencial temporal,
  configuración de módulos y espacio operativo. Diana
  completa su perfil en el primer acceso y verifica cada vendedor después de
  crearlo. Las credenciales temporales se entregan fuera de banda; el envío
  por WhatsApp no está integrado al sistema y no se guardan claves en la
  evidencia.
- Oferta aprobada internamente: oferta anual específica de `1.600.000 COP`,
  pago manual; para Diana se aplica la excepción de 15 días de ADR-SAAS-087 y
  para toda oferta sin esa excepción rige el estándar de 30 días de
  ADR-SAAS-028. La aprobación no persiste la oferta ni sustituye los gates o
  la autorización operativa del Bootstrap productivo.
- Inicio sin facturación electrónica: el Trial operará en modo no fiscal.
  La emisión DIAN desde la aplicación web no está disponible y no debe
  presentarse como una capacidad activa. La aceptación temporal de operar sin
  emisión no cierra Gate I ni certifica DIAN para otros tenants.
- Catálogo final recibido: el archivo `DISTRIBUIDORA LAS JIMENEZ (1).xlsx` es
  la fuente para preparar la importación; el CSV privado previo queda obsoleto
  y no debe usarse. La lectura conserva separadas las listas de precios a
  tienda y consumidor final. El usuario confirmó que `PRECIO VENTA` de
  “PRECIOS A TIENDA” será la única tarifa operativa del POS para todos los
  compradores, conforme a ADR-SAAS-041 y ADR-SAAS-070; “PRECIOS CONS FINAL” no
  será una segunda tarifa. El preflight actual identifica 107 filas operativas
  de tienda y 55 filas de referencia de consumidor final; 51 de estas últimas
  quedan diferidas hasta que Diana apruebe su presentación y un precio en la
  lista de tienda. Nada se importa todavía: “PRECIOS A TIENDA” no define
  categoría, unidad base, presentación/factor ni SKU. Las filas de consumidor
  son referencia y no necesitan esos campos para la carga operativa actual. Para preparar una
  plantilla privada de revisión por fila, ejecutar localmente:
  `npm run g-saas-02:catalog-preflight -- --file "<ruta.xlsx>" --decisions-output "<carpeta-nueva>"`.
  El directorio nuevo contiene un CSV separado para cada lista y un manifiesto
  con SHA-256 y conteos. Los CSV contienen referencias de hoja/fila, motivos
  detectados y campos que requieren revisión humana; no contienen nombres ni
  precios y no fusionan coincidencias. `selected_price_source` queda en `store`
  para filas de tienda y `reference_only` para consumidor final. Las filas de
  consumidor sin coincidencia de tienda quedan diferidas fuera del catálogo
  operativo hasta que Diana apruebe su presentación y un `PRECIO VENTA` en
  “PRECIOS A TIENDA”; nunca se importan como segunda tarifa.
  Tarifas diferenciadas por comprador requieren un nuevo alcance y ADR. El
  factor de conversión se
  valida como entero positivo. El comando rechaza sobrescribir un directorio
  existente y no crea carga útil de importación. No corrige ni modifica el Excel
  original. El inventario inicial sigue
  pendiente y no se inventan existencias. `AL COSTO` es candidato a alimentar el
  dato de costo del producto, pero su unidad/presentación no está definida y no
  se mapeará hasta que Diana la confirme. El 10 % indicado como valor general no
  se aplicará automáticamente: la vista administrativa de costo y margen usa el
  costo guardado y el precio/factor aprobados. No se escribió en ningún tenant; una
  venta requiere catálogo aprobado y existencias registradas por el flujo
  canónico de compras, una vez que Gate I confirme y certifique el despliegue.
- **Aplazamiento autorizado — 2026-10-17:** el responsable decidió esperar la
  lista definitiva de Diana. Este aplazamiento retira únicamente la carga del
  catálogo como precondición del Bootstrap/Trial inicial; no aprueba el borrador
  ni permite importar productos, existencias o completar una venta. El modelo
  actual admite el tenant vacío: `ejecutarBootstrapEmpresarial` no consulta ni
  escribe `productos` o `presentaciones_producto`; sí exige Plan publicado,
  oferta admisible, identidad del administrador y materializa la configuración
  derivada del Plan, el espacio, membresía, Trial y credencial. La configuración
  Bodega conserva capacidades permitidas no vacías. La pantalla Bodega muestra
  un estado explícito cuando no hay presentaciones activas. Esta evidencia local
  no sustituye el preflight productivo, las facultades del operador ni los gates
  de release. El tenant vacío será solo Trial no fiscal, no listo para vender;
  el catálogo aprobado y la existencia inicial siguen pendientes antes de la
  primera operación comercial.
- Ensayo no productivo: `npm run e2e:bodega-u4-u5` pasó 12/12 pruebas en
  Firebase Emulators el 2026-10-14, incluyendo perfil comercial, aislamiento
  entre tenants, disponibilidad, solicitud/aprobación, venta en efectivo sin
  turno y movimientos de inventario/ledger. Esto valida el flujo de software
  en fixtures; no acredita deploy, tenant, catálogo ni smoke productivo.

El Backoffice comercial materializa el catálogo público exclusivamente mediante `CrearPlan`, `CrearNuevaVersionPlan` y `PublicarPlan`, bajo `COMERCIAL_GOBERNAR`. Una excepción de precio anual para una Empresa se administra como oferta tenant-specific mediante `CrearOfertaComercialTenant` y `AprobarOfertaComercialTenant`, según ADR-SAAS-061; no crea ni modifica una versión pública del Plan y el precio se resuelve en servidor. La oferta anual de `1.600.000 COP` para Distribuidora Las Jiménez conserva pago manual y aplica la excepción de 15 días de ADR-SAAS-087; fuera de ese caso, el estándar de Trial sigue en 30 días. La aprobación no implica registro de la oferta ni autorización de Bootstrap. El Bootstrap resuelve y calcula las fechas del Trial server-side.

### 2.2 Transición del tenant mensual histórico

La transición de Café Atrato conserva el Trial histórico y nunca lo reinicia.
Por defecto se ejecuta después de `2026-09-02`. La decisión explícita del
Product Owner registrada en `ADR-SAAS-032` permite ejecutarla antes de esa
fecha mediante un cierre anticipado controlado:

1. hacer preflight read-only de Empresa, suscripción raíz, relación vigente, plan v2, configuración, operador, Rules y punto de recuperación;
2. para el flujo normal, ejecutar el cierre canónico del Trial mensual (`suspenderTrialVencido`) si no existe pago; para el cierre anticipado, ejecutar `TransicionarSuscripcion` con destino `canceled` mediante `ejecutarComandoComercialSaas`. En ambos casos no se cambian sus fechas, plan, capacidades históricas ni snapshot;
3. ejecutar `CrearRelacionContractualTrial` mediante `ejecutarComandoComercialSaas`, con `planId=mvp_comercial`, `planVersion=2`, la revisión raíz observada y `relacionAnteriorId=legacy_mensual_v1`;
4. verificar que la nueva relación tiene snapshot ANUAL, nueve capacidades y exactamente 30 días, mientras la raíz conserva `planVersion=1`, sus fechas y sus siete capacidades;
5. ejecutar `TransicionarEmpresa` a `activa` mediante el comando de lifecycle, usando la revisión de Empresa observada después de materializar la relación;
6. actualizar `configuraciones/{empresaId}.modulos.habilitados` mediante el comando canónico de configuración, usando la lista derivada del snapshot vigente;
7. registrar IDs de comandos, revisiones, SHA desplegado, smoke test y evidencia sin secretos.

El preflight histórico está disponible como
`npx tsx scripts/g-saas-02/trial-transition-preflight.ts`. Solo acepta lecturas `GET` de Firestore y
exige `FIREBASE_ACCESS_TOKEN` entregado fuera del repositorio, pero su contrato
actual todavía exige metadata de Vercel. Por ADR-SAAS-083 no debe usarse para
certificar este release ni suplirse ese campo con un valor ficticio. Se debe
adaptar en un cambio de tooling para aceptar evidencia verificable de App
Hosting antes de declarar el preflight productivo. Sigue siendo read-only y
no autoriza comandos de transición. Si se quiere declarar el operador listo, también
requiere `FIREBASE_OPERATOR_ID_TOKEN` para comprobar la callable read-only de
plataforma; un registro `saas_operadores` por sí solo no basta. Siempre emite
`productionWrites: false` y
`commandExecutionAllowed: false`. Antes del `2026-09-02` devuelve
`ESPERAR_VENTANA` por defecto. Si se declara
`--early-closure-approved true --decision-ref G-SAAS-02-PO-DECISION-CIERRE-ANTICIPADO-2026-08-14`, puede devolver
`LISTO_PARA_CIERRE_ANTICIPADO`; el preflight sigue siendo read-only y no
invoca comandos de transición.
La evidencia de la ejecución histórica está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-14-FINAL.md` y la
revalidación actual está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-14-8f0fa6f.md`; su
estado registra recovery como gate pendiente, no como hecho supuesto.

La evidencia automática de release se puede recolectar sin escrituras con:
`npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos`.
El colector legado consulta el SHA de `origin/main`, la CI y Vercel mediante `gh api`,
el inventario y el mapa Function → hash mediante `firebase functions:list`, los releases y
rulesets efectivos mediante la API GET de Firebase Rules cuando existe
`FIREBASE_ACCESS_TOKEN`, y el estado read-only de base de datos/backups mediante
Firebase CLI. Nunca imprime credenciales ni ejecuta deploy. Las referencias
`--rules-ref`, `--storage-ref`, `--smoke-ref` y `--recovery-ref` se conservan
como declaradas, pero no se consideran atestaciones independientes por el solo
hecho de existir. Desde la aceptación de ADR-SAAS-083, el resultado Vercel de
ese colector es `NOT APPLICABLE TO CURRENT RELEASE` y no acredita App Hosting.
Para este release registrar directamente el backend, región, build, commit
fuente, rollout, tráfico, URI, nombres de variables, identidad de ejecución y
hashes de configuración de Firebase App Hosting; el backend de staging no
cuenta como producción. El mapa por Function está verificado en
`docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-FUNCTIONS.md`.
La ejecución predeploy está en
`docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-14.md` y la
verificación posterior al deploy está en
`docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-POSTDEPLOY.md`.
La recolección posterior contra el SHA vivo de `origin/main @ 53ed743` está
en
`docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-ORIGIN-MAIN-53ED.md`.

Si cualquier precondición falla, se conserva el estado actual y se registra el rechazo; no se escribe directamente Firestore ni se crea otro tenant.

## 3. Operación y soporte

El operador consulta primero las proyecciones canónicas del Backoffice:

- Empresa y lifecycle;
- Suscripción, Trial y contrato snapshot;
- Plan y capacidades;
- configuración y readiness;
- provisioning;
- administrador, membresía y credencial;
- auditoría y soporte consentido.

Acciones permitidas por procedimiento:

- reemitir o desbloquear credencial;
- reemitir una recuperación de administrador pendiente cuando se perdió su PIN temporal, usando la acción específica del Backoffice y nueva evidencia fuera de banda; la operación cancela la entrega anterior y muestra el nuevo PIN una sola vez;
- activar, suspender o reactivar según comandos de lifecycle;
- autorizar soporte temporal y solo lectura;
- corregir configuración mediante comandos canónicos;
- registrar incidente y su severidad.

El panel y el soporte consultan la relación contractual vigente y su snapshot inmutable. El scheduler canónico suspende la relación al vencer el Trial o el periodo pagado. El pago manual usa `ConfirmarPagoAnualRelacionContractual`, calcula el periodo server-side, crea un recibo ligado a `relacionId` y conserva intacta la suscripción raíz histórica.

El operador no edita directamente `empresas`, `suscripciones`, `membresias`, `configuraciones`, cuentas financieras, ledger o auditoría.

## 4. Clasificación de incidentes

- `P0`: pérdida de aislamiento, corrupción financiera, indisponibilidad total o exposición de secretos. Contener inmediatamente y detener la operación afectada.
- `P1`: operación crítica bloqueada o comportamiento financiero incorrecto sin alternativa segura. Contener, reproducir, corregir por PR, desplegar y verificar.
- `P2`: degradación con workaround documentado.
- `P3`: defecto no bloqueante o mejora fuera del Trial.

Para P0/P1 se conserva la secuencia: detectar → contener → reproducir → corregir → probar → PR → CI → merge → desplegar → verificar → registrar → continuar.

No se reinicia artificialmente el Trial para ocultar un incidente.

## 5. Egresos

Los egresos son append-only para el cliente. No existe eliminación client-side.

Si un egreso debe corregirse:

1. conservar el documento y el movimiento original;
2. registrar el incidente y la justificación;
3. determinar si existe un comando backend canónico aplicable;
4. si no existe, mantener el dato y escalar como dependencia de implementación;
5. nunca modificar directamente la cuenta financiera o el ledger.

## 5.1 Inventario, ajustes y mermas

`ADR-SAAS-030` fue aceptado para cerrar la mutación histórica desde cliente.
El POS usa `crearArticuloInventarioV1`, `actualizarArticuloInventarioV1` y
`registrarMermaOperativaV1`; el servidor deriva actor, tenant, lifecycle,
artículo, costo, saldo y secuencia, y conserva la idempotencia y auditoría.
Las Rules de productos, insumos, mermas y movimientos de inventario son
read-only para el cliente en el release observado de `origin/main` y fueron
reconciliadas después del deploy. Los documentos históricos no se reescriben; una
corrección posterior se realiza por un nuevo comando compensatorio.

## 5.2 Reservas internas del POS

`ADR-SAAS-033` fue aceptado para cerrar la mutación histórica desde el
navegador. La creación pública, disponibilidad, hold y webhook permanecen en
backend; el POS usa `cancelarReservaOperativaV1` y
`completarReservaOperativaV1`. El servidor deriva reserva, tenant, actor,
importe, agenda y bloques. Una reserva pendiente se cobra como venta DEMO
determinista durante el Trial y puede reintentarse si la saga se interrumpe.

Las Rules de `reservas`, `agendas` y `reservas_operaciones` niegan escrituras
del cliente y fueron verificadas postdeploy. No se reescriben reservas históricas
ni se habilita fiscalidad real o Wompi SaaS por este alcance.

## 6. Release, rollback y recuperación

Antes del Trial se registra:

- SHA de `main`;
- resultado de CI;
- backend, URI, build, rollout y SHA servido de Firebase App Hosting;
- versión desplegada de Functions;
- Rules y Storage aplicados;
- smoke test productivo;
- punto de recuperación;
- responsable de rollback.

El deployment productivo, capacidad y SHA de Vercel son
`NOT APPLICABLE TO CURRENT RELEASE` por ADR-SAAS-083. Las referencias Vercel en
snapshots anteriores son históricas, no bloquean el release. El backend
productivo `micafe-pos` en `us-central1` fue creado y recibió un rollout manual
autorizado: `build-2026-10-15-001` quedó `READY`, su rollout `SUCCEEDED` y se
observó 100 % del tráfico hacia el SHA `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`.
La relectura del `2026-10-16T19:24:46Z` confirmó esa configuración y que los
rollouts automáticos siguen desactivados. `main` avanzó después a
`51d8ec2e4d1e7713a221f1ccf76e3b0da510c354`; por tanto, el rollout exitoso no
prueba que producción sirva el `main` actual. No se ha autorizado otro rollout.

La respuesta HTTP `200` de `/` y `/backoffice/operadores` confirma únicamente
que esas rutas responden. La API probada sin sesión devolvió `401`; no es una
prueba de gobernanza autenticada. La revisión read-only de Rules reportó un
hash raw remoto diferente del código candidato; aún hace falta reconciliación
semántica vigente. Las Functions relevantes aparecen activas, pero sus
actualizaciones observadas preceden al merge de PR #613; no se reconcilió el
artefacto remoto con el código actual. Estos resultados no cierran Gate I.

El preflight de creación conserva valor histórico; el estado posterior del
backend, el rollout y sus límites están en
[la evidencia productiva de App Hosting](evidence/G-SAAS-02-E2-2-APPHOSTING-PRODUCTION-ROLLOUT-2026-10-15.md).

En la observación del `2026-08-15T04:29:09Z`, las 79 Functions activas de
`origin/main @ 7d9078f` y las Rules/Storage desplegadas quedaron reconciliadas
con el release. PR #326 dejó la evidencia documental de recovery integrada en
`origin/main @ c2ff8855d2564972886d0f4f9bb296f5f3035d0e`; el runtime no cambió.
Smoke productivo permanece como gate pendiente; la atestación independiente
de recovery se completó posteriormente en una base aislada, sin modificar el
tenant.

Un rollback de código no revierte automáticamente datos financieros. Los datos se corrigen únicamente mediante comandos idempotentes y auditados.

La recuperación productiva se considera pendiente hasta realizar un ensayo aprobado o documentar formalmente que no aplica al incidente concreto. `ADR-SAAS-031` fue aceptado para ejecución controlada: quedó configurado un schedule diario de 35 días sobre `(default)`, con evidencia en `docs/goals/evidence/G-SAAS-02-RECOVERY-CONFIGURATION-2026-08-14-fa16b7c4.md`. La observación read-only posterior confirmó el schedule único, la retención y cero backups observables dentro de la ventana inicial; la documentación del proveedor no permite fijar la hora exacta de ejecución. Esa fue la observación inicial; el primer backup, el restore aislado y la medición de RPO/RTO se completaron posteriormente sin activar PITR ni escribir el tenant.

La cuenta de servicio local probada no tiene `datastore.backups.list`,
`datastore.backups.get` ni `datastore.backups.restoreDatabase`; el ensayo debe
usar un operador o principal autorizado con permisos de recovery. No se
amplió IAM automáticamente. La evidencia completa está en
`docs/goals/evidence/G-SAAS-02-RECOVERY-OBSERVATION-2026-08-15.md`.

La atestación vigente en ese registro es `RECOVERY_INDEPENDENT_ATTESTATION =
PASS`: el destino aislado terminó en `SUCCESSFUL`, la muestra mínima coincidió,
el RPO fue `0.220 h` y el RTO `0.232 h`. No se hizo cutover ni se modificó Café
Atrato.

Cuando exista un backup observable, el guard reproducible valida proyecto,
ubicación y destino antes de invocar el restore:

```powershell
npx tsx scripts/g-saas-02/recovery-restore.ts `
  --project micafe-pos `
  --source-backup projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID `
  --destination-database gsaas02-recovery-20260814 `
  --confirm-destination gsaas02-recovery-20260814 `
  --out artifacts/g-saas-02/recovery-restore.json
```

El guard rechaza `(default)`, otros proyectos/ubicaciones y destinos fuera del
prefijo aislado. Si `FIREBASE_ACCESS_TOKEN` está presente en el entorno
entregado fuera de Git, usa Firestore Admin REST; si no, usa `gcloud`. Si el
backup no es observable, no invoca restore. Su salida `RESTORE_REQUESTED` no
equivale a atestación: la base destino, integridad, aislamiento, RPO/RTO y
rollback se verifican después. El token nunca se imprime ni se guarda en la
evidencia.

Cuando la solicitud de restore termine, la verificación read-only reproducible
se ejecuta con los timestamps reales de la solicitud y de disponibilidad de la
base destino:

```powershell
npx tsx scripts/g-saas-02/recovery-verify.ts `
  --project micafe-pos `
  --source-backup projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID `
  --destination-database gsaas02-recovery-20260814 `
  --tenant 1ae0rD9H8t3ZFSBKrrHR `
  --restore-requested-at 2026-08-14T00:00:00.000Z `
  --restore-ready-at 2026-08-14T00:30:00.000Z `
  --out artifacts/g-saas-02/recovery-verification.json
```

El verificador solo lee el backup, la base destino y una muestra mínima de
Empresa, Suscripción, configuración y Plan desde `(default)` y el destino.
Compara sus huellas, exige destino aislado en `southamerica-east1`, backup en
estado `READY`, restore completado (`sourceInfo.progress=COMPLETED` cuando la
API no expone `state`), RPO `≤24 h` y RTO `≤4 h`. Su salida `VERIFIED` es la
atestación independiente de recovery; nunca cambia el tráfico ni escribe el
tenant.

## 7. Evidencia del Trial

La evidencia no debe contener secretos, PINs, tokens, service accounts ni documentos completos innecesarios. Debe conservar:

- tenant y SHA;
- fechas de inicio y fin;
- capacidad usada;
- incidentes y severidad;
- correcciones y PRs;
- verificaciones de aislamiento;
- soporte y recuperación cuando aplique;
- decisión final de conversión o suspensión.

## 8. Cierre

La salida contractual se ejecuta sobre la relación vigente: conversión mediante `ConfirmarPagoAnualRelacionContractual` o suspensión automática mediante el scheduler canónico. Los comandos de la suscripción raíz mensual no se reutilizan para operar el contrato anual.

El Trial no se cierra por una pantalla de éxito ni por CI verde. Al día 30 se verifica:

1. periodo contractual;
2. operación real y estabilidad;
3. incidentes abiertos;
4. soporte y recuperación;
5. pago o condición de salida;
6. conversión o suspensión mediante comando canónico;
7. evidencia final y auditoría.

Solo entonces M6 y G-SAAS-02 pueden marcarse como completados.
