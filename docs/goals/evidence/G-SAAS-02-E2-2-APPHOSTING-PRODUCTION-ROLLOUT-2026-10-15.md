# G-SAAS-02 / M2 / E2.2 — Primer rollout productivo de App Hosting

Fecha de verificación: 2026-10-15, después de `2026-10-15T17:49:24Z`.
Proyecto: `micafe-pos`; backend `micafe-pos`; región `us-central1`.

## Resultado remoto

- Build `build-2026-10-15-001`: `READY`.
- Rollout `build-2026-10-15-001`: `SUCCEEDED`.
- SHA solicitado, leído en el origen del build y actualmente en `main`:
  `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`.
- Cloud Build `ef97e19f-5347-4dda-a8e1-51d43b055e46`: `SUCCESS`, iniciado
  `2026-10-15T17:45:01Z`, finalizado `2026-10-15T17:48:41Z`.
- Tráfico remoto: 100% al build `build-2026-10-15-001`.
- Backend: `https://micafe-pos--micafe-pos.us-central1.hosted.app`.
- Configuración remota: runtime `nodejs24`, raíz `/`, app Firebase
  `micafe-pos-web`, rollouts automáticos desactivados.

## Identidad y entorno

- Identidad runtime: `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
- Roles: `roles/firebaseapphosting.computeRunner`, rol personalizado de Firestore
  con acceso a `(default)` limitado por condición, y rol personalizado de FCM con
  `cloudmessaging.messages.create`.
- Los roles `roles/firebase.sdkAdminServiceAgent` y
  `roles/developerconnect.readTokenAccessor` ya no están asignados a la identidad
  runtime. El cambio se aplicó con política IAM v3 y ETag vigente; la relectura
  confirmó los tres roles anteriores.
- Están configuradas seis variables públicas del SDK Firebase para el proyecto
  productivo y `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=us-central1`. No se guarda
  ningún valor de variable en esta evidencia. No aparece `KEY_EXAMPLE`.

## Comprobaciones

| Comprobación | Estado | Evidencia |
|---|---|---|
| Build de App Hosting | `PASS` | Build `READY`; Cloud Build `SUCCESS`. |
| SHA construido | `PASS` | `source.codebase.commit` coincide con el SHA autorizado. |
| Rollout y tráfico | `PASS` | Rollout `SUCCEEDED`; tráfico 100% al build autorizado. |
| HTTP `/` | `PASS` | `200`, `text/html`. |
| Backoffice `/backoffice/operadores` | `PASS` limitado | `200`, `text/html`; confirma que la ruta responde, no la sesión ni sus datos. |
| API autenticada sin sesión | `PASS` negativo | `GET /api/usuarios/tenant` devuelve `401`. |
| Lectura pública Firestore | `PASS` limitado | Slug sintético inexistente devuelve `404`, respuesta esperada. |
| Errores críticos recientes de Cloud Run | `PASS` limitado | La consulta de logs con severidad `ERROR` desde el inicio del rollout no devolvió entradas. |
| Callable `cambiarFacultadesOperadorSaas` | `PASS` remoto / autenticada `NOT EXECUTED` | Función `ACTIVE`, Node 22, hash `9a0a088d1ee7c3caf1d5d1d087f97328fb646443`; POST sin token devuelve `401`. No se invocó con sesión autorizada ni se cambiaron facultades. |
| Gobernanza autenticada | `NOT EXECUTED` | No había una sesión de operador en el dominio productivo entre los navegadores accesibles; la sesión visible de Backoffice pertenecía a staging. |

## Límites y siguiente paso

El backend productivo sirve el SHA aprobado. Esto no certifica todavía el uso de
la gobernanza desde una sesión autenticada. La siguiente prueba requiere que un
operador autorizado inicie sesión en el Backoffice productivo. La prueba de
`cambiarFacultadesOperadorSaas` debe ser de lectura/validación y no debe enviar
una asignación que modifique facultades.

No se modificaron operadores o facultades, controles de compras, Firestore Rules,
tenant, membresía, catálogo o Trial de Diana.

### Seguimiento autenticado de gobernanza — 2026-10-15 13:08 America/Bogota

- **Sesión productiva:** `PASS`. La URL visible fue el Backoffice del backend
  productivo `micafe-pos` en `us-central1.hosted.app`; no se reutilizó la sesión
  de staging. El encabezado mostró `Contexto validado` y el UID de sesión
  coincidió con el documento del operador presentado por la consulta canónica.
- **Consulta de operadores:** `PASS` de solo lectura, en
  `/backoffice/operadores`, mediante `listarRecursosPlataformaSaas` para el
  recurso `operadores`. El endpoint exige autenticación y valida
  `PLATAFORMA_CONSULTAR` más `OPERADORES_GOBERNAR`; el contrato proyecta `uid`,
  estado, versión de autorización y facultades desde `saas_operadores`.
- **Operador de la sesión:** activo, autorización v3; su UID termina en `RZ2`.
  El documento canónico muestra `OPERADORES_GOBERNAR` y
  `RELEASE_COMPRAS_GOBERNAR`.
- **Segundo operador listado:** activo, autorización v1; su UID termina en
  `dC3`. Tiene `PLATAFORMA_CONSULTAR` y `OPERADORES_GOBERNAR`, pero no
  `RELEASE_COMPRAS_GOBERNAR`.
- **Límite de identidad:** la proyección no expone correo ni rol de negocio
  `principal/secundario`. Por tanto, la facultad está presente en el operador
  autenticado, pero no se afirma que sea el operador principal esperado ni que
  corresponda a un correo específico. No se cambió ninguna facultad.
- **Alcance de pausa:** `BLOCKED`. ADR-SAAS-081 requiere tenants, responsables y
  ventana designados antes del corte. El código expone la transición por
  `empresaId`, pero no se encontró una consulta canónica de solo lectura para
  `controles_release_compras`; el panel no acredita esos tres datos. Los dos
  tenants que aparecen en el resumen del Dashboard no constituyen autorización
  de alcance. No se inicializó ni pausó ningún control.
- **PR #611:** en la última lectura antes de este seguimiento, el HEAD
  `cd2f2870b00516cd273dcff98c5501e1908d09cc` seguía abierto; `Tipos y pruebas`
  estaba `IN_PROGRESS` y Vercel Preview/Preview Comments estaban `SUCCESS`.
  Esta actualización documental genera un HEAD nuevo y requiere validar sus
  propios checks antes de integrar el registro.

## Revalidación de solo lectura posterior a los merges — 2026-10-16

Esta sección agrega una observación posterior sin alterar la evidencia
histórica del primer rollout. Consultas de App Hosting, Rules, Functions y HTTP
fueron realizadas el 2026-10-16 entre `19:21:32Z` y `19:27:02Z`; el SHA de
`main` y el CI se verificaron después, antes de registrar esta actualización.

### Candidato integrado y hosting observado

- `main`: `51d8ec2e4d1e7713a221f1ccf76e3b0da510c354`.
- CI post-merge: run `38839943997`, `completed/success` para ese SHA.
- PR #610, #612 y #613 están `MERGED`. PR #613 integró la implementación de
  ADR-SAAS-084; esto no demuestra que Functions remotas la ejecuten.
- App Hosting devolvió el backend
  `projects/micafe-pos/locations/us-central1/backends/micafe-pos`, URL
  `https://micafe-pos--micafe-pos.us-central1.hosted.app`, runtime `nodejs24`,
  repositorio `Glemynart/micafe-pos`, rollouts automáticos desactivados y
  runtime service account
  `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
- Build `build-2026-10-15-001`: `READY`; rollout homónimo: `SUCCEEDED`; tráfico
  observado: 100 % a ese build, cuyo SHA es
  `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`. Ese SHA antecede al `main`
  actual. No se inició un nuevo build ni rollout en esta revalidación.
- HTTP, sin autenticación: `/` y `/backoffice/operadores` respondieron `200`;
  `/api/usuarios/tenant` respondió `401`. Esto verifica disponibilidad y
  rechazo anónimo, no una sesión ni una operación autenticada de gobernanza.

### Functions y Firestore Rules observadas

- La lista productiva de `us-central1` contenía 105 Functions; las funciones
  relevantes estaban `ACTIVE` en Node.js 22. `registrarCompraBodegaV1` tenía
  `updateTime=2026-10-14T09:29:23.381Z`,
  `registrarCompraOperativaV1` `2026-10-15T16:50:25.789Z`,
  `transicionarPausaComprasSaas` `2026-10-15T16:50:26.772Z` y
  `cambiarFacultadesOperadorSaas` `2026-10-15T17:12:00.495Z`.
- Esas actualizaciones preceden al merge de PR #613. No se obtuvo en esta
  observación un hash de fuente/artefacto que permita afirmar igualdad o
  divergencia exacta con el código de #613; la reconciliación queda pendiente.
- La release activa de Firestore Rules era
  `projects/micafe-pos/releases/cloud.firestore`, ruleset
  `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado
  `2026-08-15T04:20:46.318849Z`. Hash SHA-256 raw UTF-8 del source remoto:
  `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887`
  (14.846 bytes). El source candidato de `main` tenía hash raw UTF-8
  `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`
  (18.961 bytes). Ese hash candidato se verificó sobre los bytes canónicos del
  Git blob en `main`; el checkout Windows tiene `core.autocrlf=true`, por lo
  que el hash del archivo de trabajo con finales de línea locales no es
  comparable al hash raw del artefacto remoto.
- La diferencia de hashes confirma que los bytes de fuente no coinciden; no
  constituye por sí sola un diff semántico ni vuelve a confirmar una matriz de
  permisos por ruta. No se desplegaron Rules ni Functions durante esta
  revalidación.

### Gobernanza y onboarding

- La última evidencia de sesión autenticada productiva continúa siendo la
  consulta de solo lectura del `2026-10-15 13:08 America/Bogota`: el UID de
  sesión terminado en `RZ2` estaba activo y tenía `OPERADORES_GOBERNAR` y
  `RELEASE_COMPRAS_GOBERNAR`. La proyección no expuso correo ni relación
  principal/secundario. No acredita `BOOTSTRAP_EMPRESARIAL_SOLICITAR` ni fue
  revalidada el 16-oct.
- No se determinó el alcance de pausa de compras: siguen faltando IDs exactos
  de tenants, responsables y ventana. No se inicializó ni pausó ningún control
  productivo.
- La última documentación disponible decía que no se había creado el tenant
  de Distribuidora Las Jiménez ni iniciado su Trial, pero esta revalidación no
  hizo una lectura canónica de duplicados. Antes de Bootstrap se debe consultar
  el estado canónico para evitar un tenant duplicado.
- El smoke cross-tenant permanece `NOT EXECUTED`, no `PASS`. Su postergación no
  bloquea el Trial inicial por la decisión registrada del administrador, pero
  no certifica aislamiento multi-tenant. La fecha objetivo `2026-10-15` ya
  pasó y no hay una nueva fecha confirmada. No existe archivo digital
  aprobado del catálogo; no se importan catálogo ni existencias.

La revalidación no realizó mutaciones. Gate I y E2.2 permanecen incompletos;
el rollout exitoso de App Hosting no certifica Rules, Functions, gobernanza,
provisioning, Trial ni acceso real de Diana.

## Revalidación de continuidad del release — 2026-10-16 23:58 America/Bogota

Lecturas realizadas contra el SHA actual de `origin/main` y recursos de
producción. No hubo despliegues, invocaciones ni escrituras comerciales.

- **Git y CI:** `origin/main` es
  `56e805dcd02fdd536fe65a22e56a34c6bf54b4ae`; run `38995735681` terminó
  `completed/success` para el mismo SHA. La ejecución incluye la E2E Bodega y
  las verificaciones de E4.1 en Emulator. Los PR #615, #617 y #618 quedaron
  integrados antes de este SHA. El checkout compartido sigue sucio y atrasado;
  no se modificó.
- **App Hosting:** el backend productivo
  `projects/micafe-pos/locations/us-central1/backends/micafe-pos` conserva URI
  `micafe-pos--micafe-pos.us-central1.hosted.app` e identidad
  `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`. El build
  `build-2026-10-15-001` tiene como commit fuente
  `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`; el rollout permanece
  `SUCCEEDED`. Cloud Run reporta revisión lista
  `micafe-pos-build-2026-10-15-001` con 100 % del tráfico. No se lanzó el SHA
  actual de `main`.
- **Efecto de los cambios de oferta:** el diff desde la revalidación de
  `51d8ec2e…` confirma cambios posteriores en `tenant-offers.tsx`, el guard
  comercial y sus pruebas. La app productiva aún sirve el SHA anterior, así
  que no se considera verificada la nueva pantalla ni se envió una operación.
- **Functions productivas (us-central1):**
  `ejecutarComandoComercialSaas` sigue `ACTIVE`, `nodejs22`, codebase
  `saas-auth`, hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, actualizado
  `2026-08-15T04:27:10Z`;
  `solicitarBootstrapEmpresarialSaas` sigue `ACTIVE`, `nodejs22`, codebase
  `saas-auth`, hash `b9a033fcf119a92fa942f158e3b4ac4e609f1983`, actualizado
  `2026-08-15T04:27:36Z`. `consultarOfertaComercialTenantSaas` devuelve `404`.
  El candidato separa los exports en `saas-commercial` y `saas-bootstrap`;
  no se infiere que el despliegue transfiera propiedad sin riesgo ni se hizo
  una migración productiva. La cuenta runtime de Functions mantiene
  `roles/editor` en la política directa del proyecto; no se cambió IAM.
- **Firestore Rules:** la consola productiva sigue marcando como activa la
  revisión fechada `2026-08-14 23:20` hora local. La lectura API de esta
  observación devolvió `403`, por lo que no se obtuvo un nuevo hash. La última
  lectura completa disponible registró ruleset
  `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, hash remoto
  `fca6363aa98360535306bd13d70418888760645cd5c5e54ada5c83ceb2f6a887` y hash
  candidato `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`.
  La diferencia de bytes no certifica por sí sola la compatibilidad semántica;
  no se desplegaron Rules.
- **Gobernanza y tenant:** la lectura canónica de `saas_operadores` confirmó
  estado `ACTIVO`, versión v3 y facultades
  `COMERCIAL_GOBERNAR`, `BOOTSTRAP_EMPRESARIAL_SOLICITAR` y
  `RELEASE_COMPRAS_GOBERNAR` para el operador vinculado a la sesión productiva
  de Edge ya identificada. Las lecturas de los documentos canónicos del ID
  acordado `distribuidora-las-jimenez` (`empresas`, `suscripciones`,
  `configuraciones`, ancla de Bootstrap y oferta
  `oferta-distribuidora-jimenez-2026`) devolvieron `404`. Esto verifica esos
  IDs exactos, no una búsqueda de duplicados por nombre en todas las
  colecciones.
- **Oferta y Trial:** la oferta anual de COP 1.600.000, pago manual, inicio
  `2026-10-16` y sin vencimiento sigue siendo una declaración administrativa
  aceptada por el responsable; la oferta no está persistida y el Trial no
  comienza hasta completarse el Bootstrap canónico. No existe correo de Diana
  confirmado; el flujo admite ancla de administrador sin correo, con entrega
  temporal fuera de banda. No se importó catálogo/stock: el borrador de 110
  filas sigue pendiente de cotejo y aprobación digital específica.
- **Autenticación CLI:** la cuenta activa de `gcloud` fue
  `segucor0526@gmail.com`, pero no hay cuenta autorizada en Firebase CLI. Esto
  impide usar ahora el flujo CLI de Firebase sin una autenticación interactiva
  efectuada por el operador; no se solicitaron ni almacenaron credenciales.

**Resultado:** CI `PASS`; App Hosting anterior al candidato; Functions y Rules
no reconciliadas con `main`; identidad de gobernanza observada con facultades
comerciales/de Bootstrap/release; tenant, oferta y Trial no creados. Gate I y
E2.2 permanecen incompletos. La relectura no ejecutó la operación de compra,
pausas, despliegues, alta comercial ni Bootstrap.
