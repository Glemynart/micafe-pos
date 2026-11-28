# Revalidación operativa y de seguridad — 2026-11-28 07:32 UTC

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`  
**Rama:** `codex/e2-2-legal-acceptance`  
**Alcance:** lectura de PR, infraestructura y rutas públicas; E2E sintético en staging. Sin acceso a expedientes u objetos de clientes, sin escritura en producción y sin cambios IAM.

## PR #706 y CI

- PR #706 está `OPEN/DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `7f74053e92de6b38e4dd3b08a6f316c1d2907555`; no registra reviews. El ruleset activo de `main` exige cero aprobaciones y sí exige el check `Tipos y pruebas`; por tanto, la ausencia de review no es un bloqueo formal de protección de rama.
- `Tipos y pruebas` terminó `SUCCESS` para ese SHA en [run 46118768177](https://github.com/Glemynart/micafe-pos/actions/runs/46118768177). La descripción del PR registra 129/129 pasos, cero fallos. No hay checks pendientes en la lectura actual.
- `npm run test:legal-bundle`: 2/2 PASS.
- `npm run e2e:privacy:staging`: 2/2 PASS en Chromium, 32.6 s. Usó identidades, tenants, clientes y casos sintéticos; validó registro, respuesta, cierre, aislamiento A/B y rechazo 403 sin facultad. El test borró los fixtures y verificó la ausencia de documentos y usuario Auth. No usó sesión de Diana ni datos reales.

## Staging

- App Hosting `micafe-pos-staging/us-central1/micafe-pos`: rollout `build-2026-11-28-002` `SUCCEEDED`, creado `2026-11-28T06:29:08Z`; su Build está `READY` y tiene fuente exacta `485970af098ea15ad8532161b543043d85bd7b2d`. Cloud Run dirige 100 % a la revisión `micafe-pos-build-2026-11-28-002`.
- Las cuatro Functions legales están `ACTIVE`, actualizadas entre `06:28:43Z` y `06:28:44Z`, con `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`: `aceptarDocumentosLegalesTenant`, `consultarEstadoLegalTenant`, `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas`.
- Firestore Rules staging: release `cloud.firestore` actualizado a `2026-11-28T06:28:06Z`.
- GET anónimo a `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`: HTTP 200; títulos Dusema POS, marcador `BORRADOR`, sin referencia a Café Atrato.
- Los cuatro assets `/legal/v0.8/*.md` coinciden con los SHA-256 del catálogo tras normalizar finales de línea a UTF-8/LF. El checkout Windows usa CRLF: el hash raw local difiere, mientras el hash canónico coincide con el contenido servido y con el commit fuente `485970a`. No se modificaron los assets.

## Producción

- App Hosting `micafe-pos/us-central1/micafe-pos` conserva rollout `rollout-2026-11-24-002` (`SUCCEEDED`, `2026-11-24T05:20:34Z`) y build `build-2026-11-24-002`; la revisión lista para servicio es `micafe-pos-build-2026-11-24-002`, con 100 % del tráfico. No se creó rollout productivo.
- GET a `https://pos.dusema.com`: `/terminos` responde HTTP 200 con título `Términos y Privacidad - Café Atrato`; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` responden HTTP 404.
- Functions: 117/117 activas en `us-central1` usan `882525811433-compute@developer.gserviceaccount.com`, incluido el runtime productivo actual. Solo `aceptarDocumentosLegalesTenant` y `consultarEstadoLegalTenant` existen del corte legal; las Functions de consulta/reclamo no están desplegadas. La política directa del proyecto aún asigna `roles/editor` a la cuenta Compute predeterminada, Cloud Services y App Engine default. No hubo cambio IAM.
- Firestore Rules producción: release `cloud.firestore` actualizado a `2026-11-25T23:35:48Z`. Storage Rules: release creado `2026-08-14T01:09:02Z`, SHA-256 `4530B5043FFF7AD85DBF0BAA0279903E9186DE929C20362EE3AEC73EE435D6A9`, igual a `storage.rules` local. La consulta fue de metadatos y fuente; no hubo despliegue.
- Firestore `(default)`: un schedule de backup con retención `3024000s` (35 días), 35/35 snapshots `READY`; PITR está desactivado. Los vencimientos declarados no prueban purga ni restauración efectiva.
- El bucket Firebase Storage está en `US-CENTRAL1`, con soft delete de `604800s` (7 días), `uniformBucketLevelAccess=false` y `publicAccessPrevention=inherited`. La ACL predeterminada de objetos da `READER` a `projectViewer`; el bucket IAM contiene `roles/storage.legacyBucketReader` para `projectViewer`. La consulta de IAM directo del proyecto no encontró miembros directos con `roles/viewer`, `roles/storage.objectViewer` o `roles/storage.legacyObjectReader`; no se consultaron policies heredadas ni ACL de cada objeto. No se encontró acceso `allUsers`/`allAuthenticatedUsers` en la metadata observada. Esto es un riesgo de autorización alternativa que requiere preflight; no demuestra acceso anónimo ni una exposición explotable actual. Se prepara ADR-SAAS-111; no se cambió el bucket.
- Logging global: `_Default` retiene 30 días y `_Required` 400 días. No se inspeccionó el contenido de logs ni se probó purga.

## Vercel, correo y proveedores

- `vercel teams ls --json` devuelve plan `hobby` para `glemynarts-projects`. No hay deployments `preview` activos en el inventario actual. Permanecen cuatro deployments `production` antiguos de `cafeatrato`, cuyos HEAD anónimos responden HTTP 302 a Vercel SSO; no se inspeccionó su contenido autenticado ni se eliminaron.
- Un barrido estático limitado de Functions/UI no detectó integración de envío de correo con SMTP, Nodemailer, SendGrid, Resend, Mailgun o `sendMail`. No se hizo una prueba externa de ida/vuelta. El contacto Gmail declarado aún requiere demostrar monitoreo y recepción efectiva; la conexión Gmail no está instalada en este entorno.
- La evidencia del contrato/aceptación online de Google y la cobertura por producto/proveedor siguen sin vincularse a una cuenta, versión y fecha verificables. No se observaron credenciales ni contenido de correo.

## Estado de aceptación, salida y cumplimiento

- El catálogo candidato continúa como `dusema-pos-2026-11-v0.8`, `PREPARACION`; los cuatro documentos permanecen `BORRADOR`. No hay aprobación jurídica ni factual, y no se habilitó aceptación.
- El E2E ejecutado acredita el trámite sintético de reclamos, no la aceptación exitosa de términos definitivos ni publicación de documentos.
- Exportación integral real y entrega siguen `NOT_CERTIFIED`: no hay contacto representante ni canal de un solo uso verificados ni una instrucción de tenant verificable. No se leyó ni generó paquete real.
- Supresión/conservación reales siguen `NOT_CERTIFIED`: no hubo borrado real, ciclo de vencimiento verificado ni restauración controlada. Los plazos del proveedor no se infieren del schedule propio.
- `ADR-SAAS-109` continúa `Propuesto`; no se implementó facultad/callable/UI de designación del contacto. `ADR-SAAS-110` está aceptado para implementación y pruebas sintéticas; su interpretación sigue sujeta a revisión jurídica.

## Dictámenes

- **Merge de #706: NO APROBADO.** Aunque CI y los E2E específicos están verdes, el PR sigue en draft y quedan gates jurídicos/factuales, seguridad Storage, contacto/canal de exportación y certificación real. El ruleset no requiere una review de GitHub; la aprobación jurídica/factual de los documentos sí continúa pendiente. Una integración a `main` podría activar el rollout automático productivo.
- **Release legal a producción: NO LISTO / NO AUTORIZADO.** Las rutas actuales de producción son incorrectas y los documentos aún no están aprobados ni vigentes. No desplegar, aceptar ni exportar datos reales con este estado.

No se accedió a expedientes, identidades ni objetos reales de clientes. No se alteró producción, Rules, IAM, App Hosting o Vercel.
