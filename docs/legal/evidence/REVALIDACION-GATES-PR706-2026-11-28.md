# Revalidación de gates del PR #706 — 2026-11-28

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`
**Alcance:** revalidación read-only de producción, despliegue controlado a staging,
smoke sintético autenticado y estado del PR. No es dictamen jurídico ni
autorización de release productivo.

## PR y CI

- PR #706: `OPEN/DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`,
  HEAD `f5f4a6411056f237bcf5284815052ce3a45af94b`; `mergeState=CLEAN`, sin
  revisión humana.
- CI [run 46096038797](https://github.com/Glemynart/micafe-pos/actions/runs/46096038797)
  terminó `success` para el HEAD exacto: 129/129 pasos exitosos, cero fallidos,
  pendientes u omitidos. Los E2E de Bodega U4-U5, agenda/reservas/aislamiento,
  Operator Portal y E4.1 terminaron correctamente.
- El mismo CI pasó exportación sintética de Firestore Emulator (2/2) y
  supresión/conservación sintética (2/2). No ejecutó exportación, borrado o
  restauración con datos reales.
- Pruebas focalizadas locales: `npm run test:legal-bundle` 2/2 y
  `npm run test:g-saas-02:recovery` 14/14.

## Staging

- Se creó manualmente solo el rollout de App Hosting del commit exacto
  `f5f4a6411056f237bcf5284815052ce3a45af94b` en el backend
  `micafe-pos-staging/us-central1/micafe-pos`. Rollout
  `build-2026-11-28-001`: `SUCCEEDED`; Build: `READY`; Cloud Run enruta 100 % del
  tráfico de staging a esa revisión.
- GET de las cuatro páginas `/terminos`, `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento`: HTTP 200, marca Dusema POS y `BORRADOR`, sin contenido
  Café Atrato.
- GET de los cuatro assets `/legal/v0.7/*.md`: HTTP 200, marcados como
  `BORRADOR/PREPARACION`.
- Después del rollout, `npm run e2e:privacy:staging` pasó 2/2 en 26.9 s. Usó
  operadores, tenants, clientes y un reclamo sintéticos; verificó login,
  registro/consulta/respuesta/cierre, aislamiento A/B, rechazo 403 sin facultad
  y limpieza de todos los fixtures Auth/Firestore.
- No se usó la cuenta de Diana ni se contactó a personas. No se desplegaron
  Functions o Rules y no se cambió IAM.

## Producción e IAM

- App Hosting `micafe-pos` conserva `micafe-pos-build-2026-11-24-002`, `READY`,
  con 100 % del tráfico; no se inició rollout productivo.
- GET read-only productivo: `/terminos` HTTP 200 con título/contenido heredado
  Café Atrato; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` HTTP
  404.
- Lectura actual de `gcloud functions list --v2`: 117/117 Functions productivas
  activas en `us-central1` usan `882525811433-compute@developer.gserviceaccount.com`.
  La política del proyecto mantiene `roles/editor` para esa identidad, para
  `882525811433@cloudservices.gserviceaccount.com` y para
  `micafe-pos@appspot.gserviceaccount.com`. No se modificó IAM.
- Las cuatro Functions legales observadas en staging están `ACTIVE` con
  `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`, vinculada al
  rol personalizado del piloto. Esto no certifica mínimo privilegio productivo.
- Backups, Storage y Logging: la última lectura de metadatos disponible es del
  2026-11-27. No se comprobó purga por vencimiento ni se restauró una copia.

## Dictámenes

### A. Revisión técnica del PR

**NO APROBADO PARA MERGE.** La CI y los E2E están verdes; sin embargo, el PR
abarca 160 archivos, continúa en draft y no tiene revisión humana. La revisión
integral del diff no está cerrada. ADR-SAAS-109 permanece `Propuesto`; no se
implementa la nueva facultad de plataforma antes de su aprobación explícita
según `AGENTS.md`.

### B. Release legal a producción

**NO LISTO / NO AUTORIZADO.** Los cuatro documentos v0.7 siguen
`BORRADOR/PREPARACION`, sin aprobación factual/jurídica. Las rutas productivas
continúan incorrectas. No están verificados el contacto representante, el
canal ni la instrucción para exportar; no hay certificación de exportación
integral entregada/recibida, supresión/conservación en Auth/Storage/backups ni
restauración real. El IAM productivo conserva el riesgo de identidad compartida
con `roles/editor`, y Vercel mantiene los pendientes contractuales/de
retención documentados.

No se leyeron expedientes u objetos de clientes. Los únicos cambios remotos de
este checkpoint fueron el rollout manual de App Hosting en staging y los
fixtures sintéticos del smoke, cuya limpieza se verificó. Producción permaneció
sin cambios.

## Revalidación autónoma del HEAD actual — 2026-11-28T04:52Z

- El HEAD vigente de PR #706 es `259f48357f4618debd7f95b5284756cea95282e6`,
  sobre `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. El run
  [46106030474](https://github.com/Glemynart/micafe-pos/actions/runs/46106030474)
  terminó `SUCCESS` para ese SHA: 129/129 pasos exitosos. Incluyó E2E Bodega
  U4-U5, agenda/reservas/aislamiento, Operator Portal, Web/PWA, P0-01, E4.1 y
  E4.2. No hay fallo ni job pendiente en ese run.
- Repeticiones focalizadas: `npm run e2e:privacy:staging` **2/2** en Chromium
  (38.5 s); `npm run test:legal-bundle` **2/2**; suites de aprobación,
  autorización y CLI de exportación **16/16**. Todo usó staging/Emulator y
  fixtures sintéticos; no se leyó un expediente real.
- Smoke HTTP actual: las cuatro rutas de staging responden 200, muestran
  Dusema POS y `BORRADOR`, sin contenido de Café Atrato. Los cuatro assets v0.7
  responden 200 y su SHA-256 remoto coincide byte a byte con el local tras
  normalizar CRLF a LF.
- GET productivo actual: `/terminos` responde 200 con el título/contenido
  heredado de Café Atrato; `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento` responden 404. No se hizo rollout ni escritura en
  producción.
- Reconsulta IAM read-only: 117/117 Functions v2 productivas activas usan
  `882525811433-compute@developer.gserviceaccount.com`; el binding `roles/editor`
  permanece. La política también da `roles/editor` a la cuenta Cloud Services y
  a `micafe-pos@appspot.gserviceaccount.com`. Seis Cloud Scheduler jobs usan la
  cuenta Compute. Las cuatro Functions legales de staging siguen activas con
  `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- Contacto representante, canal de entrega e instrucción individual de Diana
  siguen sin evidencia verificable. No se emitió enlace, no se generó/entregó
  exportación real y no se borraron datos. La retención de backups/logs conserva
  la última lectura de metadatos del 2026-11-27; no hay comprobación física de
  expiración, purga o restauración.
- El PR sigue `OPEN/DRAFT`, sin reviews. El éxito de CI y el smoke técnico no
  cambian el estado `BORRADOR/PREPARACION` de los documentos ni autorizan su
  publicación productiva. El rollout automático de `main` hace que integrar el
  PR desplegaría ese borrador.

## Remediación de dependencias y validación local — 2026-11-28T05:17Z

- El audit previo al cambio detectó 4 vulnerabilidades moderadas en las
  dependencias de runtime del lockfile raíz y 7 hallazgos en `functions`.
  Actualizar Firestore dentro del rango ya declarado por `firebase-admin`
  resolvió la cadena vulnerable de `google-gax`/`rimraf`/`glob`; no se usaron
  overrides ni cambios de versión mayor en `package.json`.
- Resoluciones de ambos lockfiles de runtime: `@google-cloud/firestore`
  `9.3.1 → 9.4.1`, `@google-cloud/firestore-api` `0.2.0 → 0.7.1` y
  `google-gax` actualizado a la rama `6.x`. En `functions`, también se actualizó
  el `fast-xml-parser` vulnerable `5.11.2 → 5.12.1` dentro del rango resuelto.
- `npm ci`, `npm run build`, `npx tsc --noEmit` y `npm run build:functions`
  terminaron correctamente con Node.js 22. `npm --prefix functions ci`,
  `npm --prefix functions run build` y `npm --prefix functions test` también
  pasaron: 569 pruebas aprobadas, 27 marcadas como omitidas por sus requisitos
  de Emulator. Las suites de bundle legal aprobaron 2/2; las suites de
  herramientas/autorización/CLI de exportación aprobaron 51/51.
- `npm audit --omit=dev` encontró cero vulnerabilidades en los lockfiles raíz,
  `functions` y `functions-legal`. La auditoría completa del lockfile raíz aún
  registra 23 moderadas en dependencias de desarrollo; el fix agregado de la
  cadena Firebase CLI propone degradar `firebase-tools` desde 15.34.2 a
  13.11.2, un cambio mayor que no se aplicó. Esto requiere triage separado y no
  forma parte de los paquetes enviados al runtime.
- La actualización es solo de lockfiles y no cambia código, infraestructura,
  Rules, IAM ni datos. El CI de GitHub para el nuevo HEAD aún debe ejecutarse;
  el job del commit anterior sigue pendiente y no valida estos lockfiles.

## ADR-SAAS-110 y plazo de respuesta — implementación local, 2026-11-28

- El responsable aprobó la alternativa A. El ADR se aceptó para implementación
  sintética/staging, sin autorización de publicación, casos reales ni producción.
- En `functions/src/legal/privacy-claims.ts`, los expedientes nuevos llevan
  `plazoRespuestaVersion=RECIBO_COMPLETO_V1`; el vencimiento de quince días se
  calcula desde la recepción verificable del reclamo completo. Los expedientes
  sin versión explícita conservan el cálculo histórico desde la recepción
  inicial; una versión desconocida falla cerrada. No se migran ni reescriben
  registros existentes.
- Se añadió un caso sintético que completa el reclamo treinta días después de
  la recepción inicial, verifica que el plazo nuevo siga vigente, rechaza una
  fecha de completitud distinta a la recepción documentada de la subsanación y
  conserva la compatibilidad legacy. Los v0.7 previamente servidos permanecen
  intactos; el bundle fuente y sus cuatro archivos públicos pasan a v0.8, todavía en
  `PREPARACION/BORRADOR` y sin despliegue.
- Validación local de la rama: `npm --prefix functions-legal run build` PASS;
  `npm --prefix functions-legal test` 35 PASS, 5 omitidas por Emulator, 0
  fallidas; `npm --prefix functions-legal run test:emulator` 6/6 PASS con JDK
  21; `npm run test:legal-bundle` 2/2 PASS; `npm run build:functions`,
  `npx tsc --noEmit`, `npm run build`, ESLint focalizado y `git diff --check`
  PASS. Los hashes v0.8 coinciden con `lib/legal/legal-bundle.ts`.
- La CI verde visible antes de subir esta implementación corresponde al HEAD
  remoto `487a779` (run `46111554435`), no valida estos cambios locales. La rama
  parte de `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; CI del nuevo HEAD
  queda pendiente de push.
- Al registrar esta sección de implementación local, v0.8 aún no se había
  desplegado. El rollout posterior, limitado a staging, está registrado en la
  sección siguiente. Los hallazgos productivos, exportación/supresión reales,
  aprobación jurídica/factual e IAM descritos arriba continúan abiertos.

## Validación controlada en staging del commit 485970a — 2026-11-28

- CI [run 46114883920](https://github.com/Glemynart/micafe-pos/actions/runs/46114883920)
  terminó `SUCCESS` para `485970af098ea15ad8532161b543043d85bd7b2d`: 129/129
  pasos exitosos y cero fallidos. Incluyó E2E Bodega solicitud/aprobación/venta,
  Operator Portal, Web/PWA, Smoke P0-01, Rules, E4.1 y auditoría E4.2.
- En `micafe-pos-staging` se actualizaron Firestore Rules y las cuatro Functions
  `saas-legal`. El CLI compiló las Rules y reportó que ya estaban actualizadas;
  las cuatro Functions terminaron con actualización exitosa y están `ACTIVE`
  usando `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- Rollout manual de App Hosting `build-2026-11-28-002`: `SUCCEEDED`; Build:
  `READY`; su fuente es el commit exacto `485970a`. El backend staging enruta
  100 % del tráfico a ese build.
- Tras el rollout, `/terminos`, `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento` respondieron HTTP 200 con Dusema POS y estado borrador,
  sin texto heredado de Café Atrato. Los cuatro assets públicos v0.8 dieron
  HTTP 200 y SHA-256 idéntico a las huellas del bundle.
- `npm run e2e:privacy:staging`: 2/2 PASS en Chromium (40.8 s). Verificó el
  trámite visual autenticado de un reclamo sintético, respuesta/cierre,
  aislamiento entre tenants y rechazo a operador sin facultad. El test elimina
  sus fixtures Auth/Firestore y comprueba su ausencia al terminar; no usó la
  cuenta de Diana ni datos de titulares reales.
- El rollout fue solo a `micafe-pos-staging`. v0.8 sigue `BORRADOR/PREPARACION`;
  no se desplegó en producción, no se activó aceptación y no se generó una
  exportación ni supresión real. IAM de producción no cambió. Las rutas de
  producción mantienen el estado read-only ya registrado en la sección
  correspondiente.

## Revalidación de estado público y PR — 2026-11-28 17:46 UTC

- PR #706 continúa `OPEN/DRAFT`, `mergeState=CLEAN`, sin decisión de revisión;
  base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b` y HEAD
  `c8c7ff211d826d63d07848c7e763f0ab4a76e549`. El CI del HEAD exacto terminó
  `SUCCESS` (run
  [46169530568](https://github.com/Glemynart/micafe-pos/actions/runs/46169530568)),
  129/129 pasos exitosos.
- En producción, los GET sin autenticación a `/terminos` dieron HTTP 200 y el
  HTML contiene el texto heredado “Café Atrato”; `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento` dieron HTTP 404. No se efectuó
  ningún despliegue ni escritura productiva.
- En staging, las cuatro páginas legales dieron HTTP 200 con estado `BORRADOR`.
  Los cuatro assets `/legal/v0.9/{terminos-servicio,politica-tratamiento,
  aviso-autorizacion,anexo-tratamiento}.md` dieron HTTP 200 y sus hashes
  SHA-256 UTF-8 coincidieron con el bundle fuente v0.9:
  `7af90c5f…25a2b7a`, `440fdaa0…ae8e554`, `eb3fa4a8…fe32a3` y
  `aaeff070…b76bcbc`, respectivamente. Cloud Run confirma el build
  `micafe-pos-build-2026-11-28-005` con 100 % del tráfico de staging.
- El inventario read-only de Cloud Functions de staging encontró cuatro
  Functions en el codebase `saas-legal`, todas `ACTIVE` y usando
  `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`. La nueva
  callable `administrarContactoExportacionSaas` del HEAD c8c7ff2 todavía no
  está desplegada. No se desplegó Functions, App Hosting, Rules ni IAM durante
  esta revalidación.
- ADR-SAAS-109/112 limitan el flujo nuevo a pruebas sintéticas/Emulator y
  condicionan cualquier despliegue de staging a un preflight y autorización
  operativa específica; la callable desplegada también mantiene las escrituras
  cerradas fuera del Emulator `demo-*`. Por tanto, esta revalidación no intentó
  crear ni verificar un contacto de staging.
- Evidencia obtenida con GET HTTP y consultas de metadata; no se leyó contenido
  de tenants ni se crearon, modificaron o eliminaron datos.

## Validación posterior del HEAD `3fedf75` — 2026-11-28 18:41 UTC

- PR #706 continúa `OPEN/DRAFT`, base y `main` en
  `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD
  `3fedf75f0114930b43bc616900549ce529a548b6`, `mergeState=CLEAN` y sin decisión
  de revisión. Los checks del HEAD exacto están verdes: CI run `46173369229`
  (129/129) y `App Hosting - Rollout`.
- La API de App Hosting confirma build `build-2026-11-28-006` `READY`, rollout
  `SUCCEEDED`, SHA fuente exacto `3fedf75f0114930b43bc616900549ce529a548b6`,
  backend/tráfico reconciliados y 100 % de staging dirigido a ese build. Cloud
  Run informa la misma revisión como `latestReadyRevisionName`.
- Tras publicar las Firestore Rules del HEAD a `micafe-pos-staging` —compilación
  exitosa; el CLI mostró solo el aviso no bloqueante `Unused function:
  esMarketing`— `npm run e2e:privacy:staging` terminó 2/2 PASS en 21.4 s. El
  recorrido autenticado sintético verificó registro, respuesta/cierre,
  aislamiento A/B, rechazo 403 sin facultad y limpieza confirmada de documentos,
  usuarios y fixtures. No usó cuentas ni datos de titulares reales.
- Las cinco Functions del codebase `saas-legal` están `ACTIVE` con
  `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`. La binding
  actual del rol personalizado `saasLegalRuntime` tiene como único miembro esa
  identidad; sus permisos son Firestore get/create/delete/list/update y lectura
  de usuarios Firebase Auth. La callable nueva `administrarContactoExportacionSaas`
  está desplegada, pero la operación externa/datos reales sigue cerrada.
- Las cuatro páginas legales de staging responden HTTP 200, declaran
  `BORRADOR` y no contienen “Café Atrato”. Los cuatro assets v0.9 responden 200;
  sus SHA-256 coinciden con los archivos fuente después de normalizar CRLF a LF:
  `7af90c5f…25a2b7a`, `440fdaa0…ae8e554`, `eb3fa4a8…fe32a3` y
  `aaeff070…b76bcbc`.
- Producción permanece sin cambios. `/terminos` sigue respondiendo 200 con el
  título heredado “Términos y Privacidad - Café Atrato”; `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento` dan 404.
- El despliegue de Functions mediante Firebase CLI habilitó APIs requeridas y
  creó identidades administradas por Google. La consulta posterior confirma que
  el rol runtime personalizado permanece ligado solo a la cuenta dedicada; no
  se cambió IAM productivo.
- Este checkpoint solo certifica el flujo sintético de staging y el rollout
  técnico exacto. No aprueba jurídicamente los documentos, no habilita aceptación
  real y no certifica exportación, supresión, retención o restauración con datos
  reales.
