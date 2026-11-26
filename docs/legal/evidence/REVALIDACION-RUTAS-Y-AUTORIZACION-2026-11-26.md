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
descripción del PR no coincide con el HEAD, Rules actuales no se pudieron
verificar (consulta anterior 403), y el proyecto Vercel está en Hobby mientras
mantiene deployments de producción. No se desplegaron cambios, no se actualizaron
Rules ni IAM y no se ejecutaron exportaciones o supresiones reales.
