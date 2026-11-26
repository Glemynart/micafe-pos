# Revalidación de rutas legales y piloto de exportación — 2026-11-26

**Hora de observación:** 2026-11-26 05:03 UTC
**Alcance:** estado de App Hosting, respuestas HTTP de cuatro rutas legales,
estado de CI y disponibilidad de una referencia de autorización. No se leyeron
documentos operativos ni objetos de Storage.

## App Hosting y publicación

- `firebase apphosting:backends:list --project micafe-pos-staging` confirmó el
  backend `micafe-pos` en `us-central1`, Node.js 24, URL
  `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app`.
- El mismo comando para `micafe-pos` confirmó el backend de producción en
  `https://micafe-pos--micafe-pos.us-central1.hosted.app`.
- En la URL correcta de staging, `/terminos`, `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento` respondieron HTTP 200.
- En `https://pos.dusema.com`, `/terminos` respondió HTTP 200 con título
  `Términos y Privacidad - Café Atrato`; las otras tres rutas respondieron 404.
  El contenido legal vigente del candidato no está publicado en producción.
- Una comprobación inicial de staging usó por error un host mal formado y dio
  404. Se corrigió la URL usando el backend devuelto por Firebase CLI; esos 404
  iniciales no describen el estado real de staging.

## Vercel

- `vercel ls cafeatrato --scope glemynarts-projects --environment preview
  --limit 100 --json` devolvió cero previews actuales. La URL de preview
  reportada por el comentario automático de #706 responde 404. No había un
  preview activo que limpiar y no se borró ningún deployment.
- La lista ordinaria muestra cuatro deployments históricos marcados
  `Production`. No se modificaron; la aptitud contractual del proyecto/cuenta
  Vercel para el uso comercial sigue sin verificarse en esta observación.

## Autorización para exportación

- El responsable reitera que Diana autoriza un piloto y que no debe necesitarse
  una cuenta o sesión del tenant. La herramienta de producción no requiere esa
  identidad: sí exige un operador SaaS autenticado y activo con
  `CONSERVACION_GOBERNAR`, credenciales Cloud de solo lectura y una referencia
  verificable de la instrucción.
- Al solicitar el folio/ID verificable de la instrucción de Diana, el
  responsable indicó que no lo conoce ni dispone de uno. No se inventó una
  referencia. La herramienta no se ejecutó y no se leyeron datos ni archivos
  reales; `productionExportCertified=false`.
- La ejecución necesita además una sesión del operador SaaS de **producción**.
  La sesión visible en la inspección del navegador corresponde a staging; no se
  usó para acceder a producción ni se extrajo token alguno. No se requiere iniciar
  sesión como Diana o como otro usuario del tenant.
- Siguiente paso para desbloquearlo: conservar una instrucción escrita de Diana
  con un ID/folio recuperable (o registrar la recepción por el canal formal
  aprobado), y operar en una sesión SaaS productiva con la facultad exigida. No
  entregar la clave cifradora ni el paquete por Gmail/GitHub/URL pública.

## CI

- PR #706 continúa `OPEN`/`DRAFT`, HEAD
  `020f4c06a4aaca23452f1e6ef293a8ea418ba0e6`.
- El run `45756930798` de ese HEAD estaba `in_progress` al momento de la
  comprobación, ejecutando `E2E B2 de eventos públicos tenant-aware en Emulator`.
  No se presenta como exitoso.

## Límite

Este registro no certifica el contenido jurídico, una exportación integral,
supresión productiva, entrega a Diana ni publicación de los textos. No se hicieron
escrituras de Firebase, cambios de IAM ni despliegues.

## Revalidación integral de despliegues y flujo sintético — 2026-11-26 08:47 UTC

Esta observación supersede las referencias anteriores a un CI todavía en curso y
revalida las rutas, el candidato, funciones, reglas y despliegues. Todas las
consultas de infraestructura fueron de lectura; no se desplegó ni alteró IAM.

### PR #706 y controles

- `main` observado: `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. HEAD del PR:
  `674578ab12ff111ee31ed2d8e050532d565157ff`. El PR está `OPEN`, `DRAFT`,
  `CLEAN` contra esa base y no tiene revisiones humanas registradas.
- CI `45759580226` terminó `SUCCESS` el 2026-11-26 a las 08:30:51 UTC. El único
  job (`Tipos y pruebas`) completó 128 pasos, sin fallos. Incluyó E2E de Operator
  Portal, R1-A, P0-01, Bodega, compras, E4.1 y E4.2.
- El intento inicial de este HEAD falló en el login E2E de Bodega; el rerun del
  mismo SHA pasó sin cambio de código. La falla fue intermitente, pero no hay
  evidencia que determine su causa raíz.
- No hay revisiones ni comentarios de código. Hay un comentario automático de
  Vercel del 2026-11-24 que marca listo un preview; su URL hoy responde 404 y la
  lista actual de previews de Vercel devuelve cero. La descripción del PR aún
  contiene estado de CI anterior. El intento de corregirla por GitHub CLI fue
  rechazado por la política de ejecución, así que no se presenta como actualizada.

### App Hosting y rutas públicas

| Entorno | Revisión servida | Procedencia | Estado y tráfico |
|---|---|---|---|
| Producción | `micafe-pos-build-2026-11-24-002` | `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b` (`#704`) | `Ready=True`, 100 % |
| Staging | `micafe-pos-build-2026-11-25-004` | `0248b1fe46b4a4d3ac759f61f0d7b8bb918cf284` | `Ready=True`, 100 % |

El HEAD actual de #706 no es la revisión servida en ninguno de los dos entornos.
Los builds fueron cotejados con App Hosting y el tráfico con Cloud Run. Firebase
CLI documenta `apphosting:backends:list` como consulta de backends; el API de
App Hosting registra la procedencia de cada build.

La lectura HTTP de las rutas obtuvo:

| Ruta | Producción (`pos.dusema.com`) | Staging |
|---|---|---|
| `/terminos` | 200, título “Términos y Privacidad - Café Atrato” | 200, Dusema POS |
| `/privacidad` | 404 | 200, Dusema POS |
| `/aviso-autorizacion` | 404 | 200, Dusema POS |
| `/anexo-tratamiento` | 404 | 200, Dusema POS |

Por tanto, los documentos Dusema no están publicados en producción.

### Funciones y Firebase Rules

- Producción: `aceptarDocumentosLegalesTenant` y `consultarEstadoLegalTenant`
  están `ACTIVE` en `saas-legal`, runtime Node.js 22. Las funciones
  `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas` no aparecen
  en el inventario productivo.
- Staging: las cuatro funciones anteriores están `ACTIVE` en `saas-legal`,
  runtime Node.js 22.
- Las funciones listadas en ambos proyectos usan la cuenta Compute
  predeterminada. No se cambió esta identidad ni sus permisos.
- La lista de releases de Firebase Rules devolvió HTTP 403 tanto para producción
  como para staging. No se puede identificar el ruleset activo con esta identidad;
  403 no prueba que falten reglas.

### Reclamo sintético en staging

Se ejecutó una consulta Firestore limitada al tenant sintético
`E2_2-BODEGA-STAGING-FIXTURE` y al expediente `QA-ADR102-20261124-01`. La
consulta proyectó solo identificadores sintéticos, estado, marcas de verificación
y fechas; no leyó el motivo, el identificador del cliente ni contenido de
adjuntos.

- Existe en `micafe-pos-staging`, `privacidad_reclamos`.
- Estado `RESUELTO`; identidad marcada verificada; recepción, completitud y
  anotación presentes; existe referencia de respuesta y `cerradoEn` es
  `2026-11-24T19:59:09.495Z`.
- Esta evidencia confirma que el recorrido sintético alcanzó el estado cerrado
  en staging. El despliegue que hoy sirve staging es el commit `0248b1fe`, no el
  HEAD `674578a` del PR; tampoco prueba aceptación contractual o funcionamiento
  productivo.

### Vercel y canales

- La consulta actual de deployments devolvió cero previews y cuatro deployments
  `Production` en estado `READY`. No se borró ninguno. La URL del comentario de
  preview del PR responde 404, aunque el comentario histórico aún dice `Ready`.
- La inspección disponible del proyecto no expone el plan de facturación. La
  aptitud comercial y contractual de Vercel sigue sin verificarse.
- El mandato recibido reporta que el correo de contacto recibió y contestó una
  prueba desde la misma cuenta. No se consultó un buzón ni un registro de correo
  desde las herramientas disponibles en esta revalidación; por ello se registra
  como reporte del responsable, no como evidencia independiente de canal externo.

### Decisión de release actual

**NO APROBADO PARA MERGE.** Tampoco está aprobada la publicación o exigibilidad
legal. El CI está verde, pero producción
no sirve los documentos ni las funciones de trámite; faltan revisar la
descripción desactualizada del PR, Rules verificables, el plan/alcance contractual
de Vercel, evidencia independiente del canal de correo, revisión jurídica final y
el piloto de exportación real protegido por su operador y referencia verificable.
La supresión real sigue sin autorización y no se ejecutó. No se leyeron datos de
clientes o archivos de producción.

### Referencias técnicas

- [Firebase CLI](https://firebase.google.com/docs/cli), consulta de funciones y
  App Hosting.
- [App Hosting: consultar rollouts](https://firebase.google.com/docs/reference/apphosting/rest/v1beta/projects.locations.backends.rollouts/list)
  y [builds](https://firebase.google.com/docs/reference/apphosting/rest/v1beta/projects.locations.backends.builds/get).
- [Firebase Rules: releases](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/list).
- [Vercel CLI: listar deployments](https://vercel.com/docs/cli/list) e
  [inspeccionar uno](https://vercel.com/docs/cli/inspect).

## Revalidación del plan Vercel y CI del HEAD actual — 2026-11-26 09:17 UTC

- Rama del PR #706: `codex/e2-2-legal-acceptance`; HEAD
  `0a237841a40951a21805370c251cca03420fb84c`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`;
  `0` commits detrás. PR `OPEN`, `DRAFT`, sin reviews humanas.
- El run CI `45787122516` de ese HEAD terminó `success` a las 09:17 UTC.
  `Tipos y pruebas` completó 128 pasos, sin fallos ni pasos omitidos.
- La descripción de GitHub sigue mostrando el HEAD anterior `674578a` y el CI
  viejo. No se editó porque la acción `gh pr edit` fue bloqueada por revisión
  automática de ejecución; no se eludió el control.
- `vercel billing overview --scope glemynarts-projects`, ejecutado con Vercel
  CLI `65.17.0`, informó el plan `Hobby`. No se retuvo ni se copió información
  de facturación adicional y no se modificó el plan. La documentación oficial
  limita Hobby a uso personal/no comercial; revisar
  [plan Hobby](https://vercel.com/docs/plans/hobby) y
  [uso comercial](https://vercel.com/docs/limits/fair-use-guidelines).
- Una solicitud HTTP `HEAD` a `https://pos.dusema.com/` respondió `200` en
  `/pos`, con servidor `envoy` y sin encabezado `x-vercel-id`; esta respuesta
  confirma el comportamiento actual del dominio raíz, no el estado de los
  deployments directos de Vercel. La última lista de deployments consultada
  tenía cero previews y cuatro deployments `Production` `READY`; no se borró
  ni modificó ninguno.
- El formulario de reclamo sintético `SMOKE-STAGING-20261125-D3A80E3212D2`
  quedó sin enviar. Computer Use se detuvo al no poder volver a verificar la
  URL actual de Edge. No se creó un nuevo reclamo ni se modificaron datos reales.

### Decisión vigente

**NO APROBADO PARA MERGE.** El check verde no cierra los gates de publicación:
los documentos siguen `BORRADOR`/`PREPARACION`, no hay revisión humana, la
descripción del PR no coincide con el HEAD y el proyecto Vercel está en Hobby
mientras mantiene deployments de producción. Rules aún no estaban verificadas
en esta observación. No se desplegaron cambios, no se actualizaron Rules ni IAM
y no se ejecutaron exportaciones o supresiones reales.

## Verificación de Rules con proyecto de cuota — 2026-11-26 09:22 UTC

La consulta anterior recibió 403 porque las credenciales ADC locales no tenían
proyecto de cuota. Google documenta que una petición REST puede enviar
`x-goog-user-project` sin cambiar la configuración persistente de ADC; el
principal debe contar con `serviceusage.services.use` en el proyecto de cuota.
Se usó esa cabecera solo en solicitudes `GET` a Firebase Rules API. No se cambió
ADC, IAM ni el estado de APIs.

| Proyecto | Release | Actualizado (UTC) | Ruleset | Comparación con el archivo local |
|---|---|---|---|---|
| `micafe-pos` | `projects/micafe-pos/releases/cloud.firestore` | `2026-11-25T23:35:48.074157Z` | `projects/micafe-pos/rulesets/23b49a84-6282-4df1-9c97-60513697c5d7` | `firestore.rules`: contenido exacto tras normalizar BOM y saltos de línea |
| `micafe-pos-staging` | `projects/micafe-pos-staging/releases/cloud.firestore` | `2026-11-25T13:09:42.616507Z` | `projects/micafe-pos-staging/rulesets/766510d4-1cd6-44bb-a693-2e1e7589030f` | `firestore.rules`: contenido exacto tras normalizar BOM y saltos de línea |
| `micafe-pos` | `projects/micafe-pos/releases/firebase.storage/micafe-pos.firebasestorage.app` | `2026-08-14T01:09:03.643850Z` | `projects/micafe-pos/rulesets/1df06087-5bca-4822-ba5a-50ac951c9cf4` | `storage.rules`: contenido exacto tras normalizar BOM y saltos de línea |

Esto verifica qué source está asociado a los releases canónicos y su paridad con
el checkout observado. No reemplaza la revisión semántica de cada regla ni
pruebas de autorización en runtime. La lectura de releases y reglas está
documentada en [Firebase Rules API](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/list), y el uso de la cabecera de cuota en
[Google Cloud REST authentication](https://docs.cloud.google.com/docs/authentication/rest).

### Estado posterior de esta evidencia

La incertidumbre de Rules ya no es un gate abierto. El PR #706 sigue
`OPEN`/`DRAFT`; su HEAD observado es `292dbf5bb7eae2da8fc6d98c4b0f85bab54f61d4`
y el CI `45790845009` todavía estaba `in_progress` a las 09:22 UTC. La
descripción del PR y la ausencia de revisión humana siguen sin resolverse.

## Seguimiento — CI y revisión de exposición pública de eventos — 09:40 UTC

- El run `45790845009` finalizó a las `09:39:51 UTC` con `SUCCESS` para el
  commit `292dbf5bb7eae2da8fc6d98c4b0f85bab54f61d4`. La CI cubre ese commit,
  no los cambios locales 0.5 que aún no se han validado ni publicado.
- La ruta `tenants/{empresaId}/eventos/{eventoId}/{archivo}` permite lectura
  anónima en `storage.rules`; `eliminarEvento` elimina solamente el registro de
  Firestore. El archivo puede seguir accesible por su URL descargable. La
  evidencia es una revisión estática de reglas y código, sin lectura de objetos.
- Se actualizó la pantalla de eventos para explicar la visibilidad pública y que
  la eliminación del evento no borra el archivo. No se cambió Storage Rules ni
  se eliminaron assets. La versión de trabajo de los cuatro documentos pasó a
  `0.5`; `0.4` sigue preservada.
- El flujo de retiro verificable de un archivo público continúa pendiente. No se
  ejecutó una operación contra producción ni staging.

## Pruebas sintéticas de privacidad en Emulator — 2026-11-26

Firebase CLI rechazó primero Java 17; la instalación existente de Temurin 21 se
seleccionó solo para el proceso mediante `PATH` temporal, sin cambiar la
configuración permanente. Con el proyecto demo `demo-legal-acceptance`, se ejecutó
el mismo comando de CI para Firestore Emulator:

`npx firebase --project demo-legal-acceptance emulators:exec --only firestore "npm --prefix functions-legal run test:emulator"`

Resultado: 3/3 pruebas pasaron — recibo contractual atómico/append-only e
idempotente, trámite de reclamos y trámite de consultas, incluyendo autoridad,
aislamiento y concurrencia sintéticos. El emulador se apagó al completar. Esta
ejecución local no certifica el staging ni producción y no utilizó datos reales.

## Revalidación posterior del candidato y publicación — 2026-11-26 17:27 UTC

- `main` continúa en `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; el HEAD revisado
  de PR #706 es `d036207e4b215be2721c8cf884a6c2d199a21135`, sin commits de `main`
  pendientes de incorporar. El PR sigue `OPEN`/`DRAFT`, `CLEAN`, sin revisión
  humana registrada.
- El run `45863707804` para ese HEAD terminó `success`; `Tipos y pruebas`
  completó en 19m 2s, sin pasos fallidos ni pendientes. `gh pr checks 706`
  mostró un check y todos en verde. La evidencia E4.1 es solo de Emulator,
  con `productionWrites=false` y `credentialsRemoved=true`. El reporte E4.2
  corresponde al baseline histórico `G-MVP-01/M4/E4.2`, no certifica este corte
  legal. Registra seguimiento de dependencias (raíz: 4 moderadas; Functions: 1
  baja y 6 moderadas; ninguna alta o crítica), sin hacer fallar ese check.
- Una lectura HTTP pública a `https://pos.dusema.com` obtuvo `/terminos` HTTP
  200 con título antiguo de Café Atrato y `/privacidad`, `/aviso-autorizacion`
  y `/anexo-tratamiento` HTTP 404. No se publicó el paquete v0.6.
- En staging, las cuatro rutas respondieron HTTP 200 con el paquete v0.5 marcado
  como borrador. El candidato v0.6 no está servido. Estas lecturas verifican
  render público, no aceptación ni persistencia.
- En Edge estaba abierta la página `/backoffice/privacidad` de staging. El
  intento de observación encontró un diálogo de Firewall de Windows para
  OpenJDK y se detuvo sin interactuar con el permiso. No se ejecutó un smoke
  positivo nuevo de callable, persistencia y aislamiento.
- Resultado de auditoría para el corte: **NO APROBADO PARA MERGE**. Siguen
  pendientes el smoke autenticado positivo de staging, la revisión jurídica y
  factual humana de los borradores, la evidencia verificable de instrucción
  para un piloto real de exportación, la certificación de supresión y los
  puntos de proveedor/Vercel ya descritos arriba. No se desplegó, no se cambió
  IAM y no se leyeron ni borraron datos reales.

## Revalidación de despliegues y smoke — 2026-11-26 18:21 UTC

- PR #706 sigue `OPEN`/`DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`,
  HEAD `66ebf26d87f1bc6ea7e76ab75450d419dc094479`; no hay commits de `main`
  pendientes de incorporar. El run `45868739735` para este SHA terminó en
  `success`; `Tipos y pruebas` está verde.
- En App Hosting staging, el build `build-2026-11-26-002` (`READY`) recibe el
  100 % del tráfico y tiene rollout `SUCCEEDED`. Su origen es
  `14fed08083e8983d95a7ee5e8c96d7d8e6c1ba3d`. La comparación del código de la
  pantalla de reclamos y de sus handlers con el HEAD actual no mostró diferencias;
  el candidato completo no está publicado porque aún difiere en el bundle legal
  v0.6, que continúa en borrador.
- Rules de staging se consultaron por Firebase Rules API con cabecera de cuota,
  sin cambiar ADC, IAM ni APIs. El release `cloud.firestore` actualizado a las
  `2026-11-26T12:55:33.812853Z` apunta al Ruleset
  `a204c10c-4742-4c63-aa30-8ee390777ec3`. Su `firestore.rules` coincide en
  contenido con el archivo local tras normalizar saltos de línea. Las reglas
  deniegan lectura/escritura directa para `privacidad_reclamos`,
  `privacidad_consultas` y `clientes/{id}/anotaciones_privacidad`; la suite de
  Rules del SHA actual pasó en CI. No se volvió a desplegar Rules.
- Las cuatro Functions de `saas-legal` siguen `ACTIVE`, Node.js 22, y su última
  actualización fue el `2026-11-25T20:26Z`, con hash de codebase
  `cbad43a2af26e692ac86648c1368a0e661cb93e2`. Usan
  `192423427245-compute@developer.gserviceaccount.com`; en staging esa cuenta
  conserva `roles/editor`, `roles/eventarc.eventReceiver` y `roles/run.invoker`.
  El commit actual `704377270eb647cacd54fed067b687c77fcfdcf6` modifica el flujo
  de reclamos después de aquella actualización. No se desplegó la versión nueva.
- ADR-SAAS-105 deja el piloto de `saas-legal` condicionado a un gate operativo
  separado para una identidad runtime dedicada y permisos mínimos. No se creó
  la cuenta, no se modificaron bindings y no se desplegaron Functions. La API de
  Policy Simulator, Cloud Asset Inventory y Compute Engine no figura habilitada
  en staging; no se habilitó ninguna.
- Revalidación HTTP: producción mantiene `/terminos` HTTP 200 con el título
  histórico de Café Atrato y las otras tres rutas legales en HTTP 404. Las cuatro
  rutas de staging responden HTTP 200 con el paquete v0.5 en borrador; v0.6 no
  está publicado.
- En Edge, la ruta exacta `/backoffice/privacidad` de staging muestra una sesión
  de operador autorizado y un formulario con valores sintéticos. No se enviaron
  fechas, no se pulsó «Registrar y anotar en la ficha» y no se creó ni cambió un
  caso. La observación no es smoke positivo de callable, persistencia o
  aislamiento.

**Resultado:** el smoke autenticado de extremo a extremo sigue pendiente hasta
resolver el gate de runtime de staging y desplegar el codebase legal actualizado.
No hubo escrituras de negocio, exportación ni supresión real. La auditoría sigue
**NO APROBADO PARA MERGE**; tampoco se publicó ni activó ningún documento legal.

## Reconciliación de responsable y RNBD — 2026-11-26 18:46 UTC

- El prestador confirmó que él, como administrador de Dusema, atenderá las
  solicitudes dirigidas al servicio. La política y el procedimiento operativo
  identifican a Sebastián Agudelo Muñoz como contacto principal. No se designó
  suplente; se clasifica como riesgo de continuidad, no como requisito legal
  autónomo identificado. Esta designación no acredita que los canales externos,
  el archivo restringido o la recepción operativa hayan sido probados.
- El RUT aportado muestra al prestador como persona natural. Con esa clasificación,
  no se identifica obligación de inscripción del prestador en el RNBD bajo los
  sujetos descritos en la Resolución SIC 56579 de 2025, art. 12, y el criterio
  de la SIC en la Resolución 17116 de 2022; revaluar si cambia el sujeto o el
  régimen. Las demás obligaciones de protección de datos permanecen.
- Fuentes consultadas: [Resolución SIC 56579 de 2025, art. 12 — compilación
  oficial de MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_superindustria_56579_2025.htm)
  y [Resolución SIC 17116 de 2022](https://sedeelectronica.sic.gov.co/sites/default/files/boletin-juridico/boletin/docs/Resolucion%2017116.pdf).
