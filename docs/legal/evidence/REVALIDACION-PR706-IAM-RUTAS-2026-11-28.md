# Revalidación de PR #706, rutas e IAM — 2026-11-28

**Hora del corte:** 2026-11-28T01:16Z. La consulta de metadatos de retención se ejecutó a las 01:05Z.
**Goal:** G-SAAS-02 → M2 → E2.2.
**Método:** consultas read-only a GitHub, HTTP público y metadatos gcloud; pruebas sintéticas solo en staging.

## PR #706 y CI

- PR `feat(legal): aceptación versionada de términos por tenant`, abierto y en draft.
- Base: `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- HEAD consultado: `5b544e71585dc310a95c10bc5189ebcf2ad66c12`.
- `mergeState=CLEAN`, sin revisión ni aprobación humana registrada.
- `Tipos y pruebas`: `SUCCESS` para el SHA exacto en [CI run 46086703865](https://github.com/Glemynart/micafe-pos/actions/runs/46086703865). No había checks pendientes.
- El run verde precede a los cambios locales de esta revalidación; no se presenta como CI del SHA posterior.

## Rutas y App Hosting

GET anónimo, sin formularios ni escrituras:

| Ruta | `https://pos.dusema.com` | `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app` |
| --- | --- | --- |
| `/terminos` | 200; contiene marca Dusema y referencia histórica Café Atrato | 200; Dusema, `BORRADOR`, sin Café Atrato |
| `/privacidad` | 404 | 200; Dusema, `BORRADOR`, sin Café Atrato |
| `/aviso-autorizacion` | 404 | 200; Dusema, `BORRADOR`, sin Café Atrato |
| `/anexo-tratamiento` | 404 | 200; Dusema, `BORRADOR`, sin Café Atrato |

`gcloud run services describe micafe-pos` en staging devolvió revisión Ready
`micafe-pos-build-2026-11-27-003`, imagen
`us-central1-docker.pkg.dev/micafe-pos-staging/firebaseapphosting-images/micafe-pos:build-2026-11-27-003`, tráfico al 100 %. La revisión no incorpora el cambio local nuevo de los términos. No se desplegó producción.

## Smoke visual autenticado de Backoffice

`npm run e2e:privacy:staging` concluyó **2/2 PASS en 34.6 s**. El runner exige explícitamente proyecto y Functions de staging. Usó tenants, operador, cliente y reclamación sintéticos; comprobó login, formulario, rechazo de asociación cruzada A/B, alta de caso, detalle, constancia, cierre, denegación al operador sin `PRIVACIDAD_RECLAMOS_TRAMITAR` y limpieza con relectura. No usó la cuenta de Diana, no envió comunicación externa y no tocó producción.

La suite observó el build de staging existente; no prueba la aceptación contractual real ni que los textos hayan sido aprobados.

## Inventario read-only de identidades

Comandos consultados con `gcloud` y proyecto explícito; no se alteró IAM:

- `micafe-pos`: 117 Functions v2 en `us-central1`; las 117 `ACTIVE` y con runtime `882525811433-compute@developer.gserviceaccount.com`.
- Solo dos Functions del dominio legal aparecieron activas en producción: `consultarEstadoLegalTenant` y `aceptarDocumentosLegalesTenant`, ambas con la cuenta Compute predeterminada. Las callables de consultas/reclamos que sí están en staging no aparecen en ese inventario productivo.
- La política IAM de proyecto contiene binding directo `roles/editor` para la cuenta Compute predeterminada, `882525811433@cloudservices.gserviceaccount.com` y `micafe-pos@appspot.gserviceaccount.com`. Seis Cloud Scheduler jobs reportan OIDC con la cuenta Compute predeterminada.
- `micafe-pos-staging`: 68 Functions v2; las cuatro legales (`consultarEstadoLegalTenant`, `aceptarDocumentosLegalesTenant`, `tramitarConsultaPrivacidadSaas`, `tramitarReclamoPrivacidadSaas`) están `ACTIVE` con `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- Esta lectura no descubre por sí sola permisos heredados de carpeta/organización, políticas de recursos individuales, uso efectivo de las cuentas Cloud Services y App Engine, todas las llamadas Admin SDK, dependencias externas ni permisos realmente requeridos por cada codebase. Los seis jobs requieren mapeo antes de migrar la identidad común.
- No se ejecutó Policy Simulator; no se cambió cuenta, binding, Function, Scheduler ni producción.

## Retención técnica observada — Firestore, Storage y Logging

- Firestore `(default)` productivo está en `southamerica-east1`, PITR desactivado. Su schedule diario declara 35 días (`3024000s`); se observaron 35/35 backups `READY` de esa base, con expiraciones declaradas entre `2026-11-28T09:42:31Z` y `2027-01-01T14:08:10Z`. No se restauró ningún backup. Una expiración programada no acredita borrado físico.
- Staging: la base `(default)` está en `us-central1`, PITR desactivado y no tiene schedule de backup observado. Hay cuatro buckets de infraestructura, no el bucket Firebase predeterminado `micafe-pos-staging.firebasestorage.app`.
- Producción: tres buckets de Storage en `US-CENTRAL1`; cada uno reporta soft delete de siete días y no muestra `retentionPolicy` bucket-level. No se listaron objetos. El bucket Firebase reporta acceso público prevenido por política heredada y Uniform bucket-level access desactivado; esto no sustituye revisar ACLs, Firebase Rules ni objetos borrados.
- Staging: los cuatro buckets observados reportan soft delete de siete días; el bucket `e2-2-prov` declara retención bucket-level de 30 días, `e2-2-src` no declara esa retención. Los otros dos son buckets auxiliares de Functions.
- Logging productivo: dos sinks globales: `_Default` retiene 30 días y `_Required` 400 días y está bloqueado. No se leyeron logs ni se inspeccionaron destinos externos fuera de esos dos sinks.
- Todo lo anterior es metadato de configuración. No demuestra purga al vencimiento, eliminación integral, política legal aprobada, restauración real ni ubicación de datos en servicios no observados.

## Gate documental

La corrección incluida en los términos v0.7 advierte que el producto no comprueba edad ni bloquea ventas de alcohol. Se apoya en [Ley 124 de 1994, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=291), [Decreto 120 de 2010](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=38680) y [Ley 1801 de 2016, art. 38](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80538). No constituye revisión jurídica profesional.

Los cuatro documentos v0.7 del bundle permanecen `BORRADOR`; el bundle es `PREPARACION`. Los assets v0.6 previamente desplegados en staging se preservaron sin modificar. No se desplegó esta revisión ni se activó una aceptación. La versión no se presenta como válida, exigible o jurídicamente aprobada.

## Versionado v0.7 y validación local

Para preservar los assets v0.6 previamente servidos en staging, el borrador
corregido se registró como bundle `dusema-pos-2026-11-v0.7`:

| Documento | SHA-256 UTF-8/LF |
| --- | --- |
| Términos | `efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b` |
| Política | `64207fef36b1fab0ae468c26852863a82b7ac4d3d7e86c975dde9d1eb7a6392a` |
| Aviso | `5ab4a8e97dde0ee5d2b147d319c1a6d4de33a011615f8104f930d39d0144f47c` |
| Anexo | `7b5b7107e7d1a0e0e77b8da5057eaf56bce0c0b0e02ffba2425be0f12396138b` |

En local, `npm run test:legal-bundle` pasó **2/2**: fuente/asset/hash v0.7
coinciden y los cuatro hashes históricos v0.6 permanecen intactos.
`npx tsc --noEmit` y `npm run build` terminaron correctamente. Un servidor local
`next start` devolvió HTTP 200 para las cuatro páginas públicas y los ocho assets
v0.6/v0.7; las páginas mostraron Dusema, `BORRADOR` y el marcador 0.7, sin Café
Atrato. Esta comprobación no desplegó nada ni altera el resultado del smoke
autenticado de staging indicado arriba.

## Reconciliación del CI del PR #706 — 2026-11-28T02:00Z

- El HEAD `7455ff75595edd6c88502626ec9b5477434f23d8` coincide con el run
  [46093033978](https://github.com/Glemynart/micafe-pos/actions/runs/46093033978),
  conclusión `success`, 129/129 pasos exitosos, cero fallidos, pendientes u
  omitidos. La rama está actualizada con `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- El run previo 46092476478 detectó una expectativa de versión obsoleta (`0.6`
  frente al bundle vigente `0.7`). La prueba se corrigió en `7455ff7`; en el run
  exitoso también pasaron el E2E Bodega U4-U5 y la publicación de su evidencia.
- La conclusión es estrictamente técnica. El PR permanece draft y sin revisión
  humana; el bundle sigue `PREPARACION`, los documentos siguen `BORRADOR` y no
  se desplegó v0.7 ni se habilitó aceptación legal en producción.

## Gates que siguen abiertos

1. Revisión/aprobación humana del PR; revisar el diff completo de sus 160 archivos antes de quitar draft o integrar.
2. Aprobación legal y factual de los cuatro documentos; confirmar datos del prestador, canales realmente monitorizados, proveedores, lugares/retenciones e instrumento contractual.
3. ADR-SAAS-109 sigue `Propuesto`; por la regla de arquitectura del repositorio, no implementar la nueva facultad `EXPORTACION_CONTACTO_GOBERNAR` hasta aprobación explícita.
4. No se verificó por fuente autorizada el contacto representante de Diana, el control del canal o proveedor de entrega; no hay instrucción de exportación verificable ni exportación integral real (Firestore y archivos) generada, entregada y recibida.
5. Supresión solo sintética/Emulator. No se verificaron lotes de datos reales, todos los sistemas de identidad/archivos/logs, retenciones legales ni el vencimiento real de copias.
6. IAM productivo continúa con identidad runtime compartida y `roles/editor`. Falta inventario, simulación, permisos por codebase, dependencias de Scheduler y autorización para cualquier cambio productivo.
7. La discrepancia productiva de rutas requiere un futuro release aprobado; no hacer despliegue del borrador actual.

## Revalidación de staging y archivos — 2026-11-28

- El SHA de la rama es `f853104faee0fc4541c300890c2d9d918da58f5e`; la base
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b` no cambió. CI run
  [46105507227](https://github.com/Glemynart/micafe-pos/actions/runs/46105507227)
  está `in_progress` para ese SHA; no hay fallo confirmado. El run
  `46103932241` corresponde al SHA anterior.
- `npm run e2e:privacy:staging` terminó 2/2 PASS con datos sintéticos: login,
  formulario, aislamiento A/B, registro, respuesta y cierre, denegación al
  operador sin facultad y limpieza verificada.
- App Hosting staging sirve `micafe-pos-build-2026-11-28-001` al 100 %. Las
  rutas `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`
  devuelven 200, muestran Dusema POS y `BORRADOR`, sin Café Atrato.
- Los cuatro assets `public/legal/v0.7/*.md` responden 200 en staging. Cada
  contenido remoto coincide con el archivo local al normalizar los finales de
  línea UTF-8/LF; los hashes canónicos corresponden al bundle `v0.7` de esta
  rama. Se preservaron assets históricos v0.6.
- El E2E de exportación ahora usa el Storage Emulator real junto con Firestore
  Emulator: sube/lista/descarga por generación exacta un asset sintético,
  verifica bytes y referencia, excluye el token y elimina el fixture. Las
  pruebas locales relacionadas pasaron: 51/51 unitarias y 2/2 Emulator. CI
  incorpora `--only firestore,storage`.
- Producción continúa sin cambios: `/terminos` incluye contenido heredado de
  Café Atrato y las otras tres rutas devuelven 404. No se hizo rollout legal.
- PR #706 continúa abierto y en draft, sin reviews; el CI del SHA actual sigue
  en curso. El smoke sintético pasó, pero los documentos siguen en borrador,
  así que no se habilita aceptación ni release legal productivo.
