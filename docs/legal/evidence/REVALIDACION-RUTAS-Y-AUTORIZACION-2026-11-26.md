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
