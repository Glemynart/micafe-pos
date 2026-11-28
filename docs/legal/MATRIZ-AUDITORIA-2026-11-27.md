# Matriz de auditoría — cumplimiento y liberación

**Corte inicial:** 2026-11-27 10:33 UTC. La revalidación operativa más reciente está al final de este archivo.
**Goal / Milestone / Epic:** G-SAAS-02 / M2 / E2.2
**Rama y PR:** `codex/e2-2-legal-acceptance`, #706
**Alcance:** comprobación de evidencias disponibles. No es concepto jurídico,
certificación integral de seguridad ni autorización para exportar/borrar datos
reales o desplegar a producción.

## Estado comprobado al corte inicial

| Requisito | Estado y evidencia | Riesgo o límite | Criterio de cierre |
|---|---|---|---|
| PR #706 y CI | Revalidado 2026-11-27 10:33 UTC: PR abierto y en borrador, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `e07713d9963e867cea7034e611c8f1a7eda20fcc`. CI [45979770457](https://github.com/Glemynart/micafe-pos/actions/runs/45979770457) terminó `success` en 22m28s; el check obligatorio de GitHub está `pass`. GitHub informa `mergeState=CLEAN`, `mergeable=MERGEABLE`, sin revisión humana registrada. | El PR sigue en draft y continúan gates sustantivos abiertos. No debe integrarse. | Cerrar los gates restantes y confirmar checks verdes del SHA final, sin pendientes, antes de integrar. |
| Textos legales | Bundle `dusema-pos-2026-11-v0.6` permanece `PREPARACION`; los cuatro documentos están `BORRADOR`. En revalidación, staging devolvió 200 para las cuatro rutas y marcadores de borrador. El build servido de política aún incluye la referencia histórica a Café Atrato; el source del PR ya la quitó y recalculó su SHA-256 (`d4820244…`), sin tocar v0.2–v0.5. El PR actualizó esta corrección en `e07713d`. | El staging visible todavía corresponde al build `2026-11-26-003` y no refleja la corrección. Los documentos siguen sin vigencia ni aceptación exigible; faltan validación factual y revisión/aprobación jurídica. | Publicar una nueva revisión en staging y comprobar ruta/hash/marcador; cerrar hechos y canales, obtener aprobación jurídica/empresarial y solo entonces versionar como vigente. |
| Documentos en producción | `https://pos.dusema.com/terminos` respondió 200, pero su contenido todavía contiene la marca Café Atrato. La ruta `/legal/v0.6/terminos-servicio.md` devolvió 404. | El texto productivo visible no representa el borrador Dusema actual y podría confundir a clientes. No se cambió ni se publicó nada en esta auditoría. | Preparar un corte de publicación coherente con documentos aprobados; validar rutas y contenido en staging antes de un despliegue autorizado. |
| Aceptación electrónica | El código de aceptación versionada está en #706. En producción aparecen `aceptarDocumentosLegalesTenant` y `consultarEstadoLegalTenant` como `ACTIVE`; esto no prueba recorrido autenticado ni aceptación de documentos definitivos. | No se activó ni verificó aceptación real en producción; los documentos continúan en borrador. | Probar en staging la lectura, aceptación sintética, historial, reaceptación y bloqueo aplicable con bundle aprobado; comprobar producción solo tras aprobar/publicar documentos. |
| Consultas y reclamos | En revalidación, Functions legales de staging están `ACTIVE`. La suite dedicada de Emulator ejecutada el 2026-11-27 pasó 3/3: aceptación contractual, reclamos (autoridad/concurrencia/cierre/aislamiento) y consultas (facultad/idempotencia/plazos/aislamiento/respuesta). | No hay evidencia de un recorrido autenticado completo en la interfaz/runtime de staging ni de una respuesta externa real. Las pruebas Emulator no certifican el estado de un expediente previamente creado en staging. | Completar el smoke autenticado de UI/Functions en staging, usar solo expediente sintético y guardar evidencia sin datos personales. |
| Runtime Functions e IAM | Lectura de `gcloud functions list` el 2026-11-27: producción tiene 117 Functions, incluidas `aceptarDocumentosLegalesTenant` y `consultarEstadoLegalTenant` `ACTIVE` con Compute predeterminada; staging tiene 68 Functions y las cuatro legales `ACTIVE` con `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com` (últimas actualizadas 2026-11-26 20:18 UTC). | Producción aún no tiene las Functions de reclamos/consultas del corte actual. No se validó el principal efectivo mediante Cloud Audit; `GenerateServiceIdentity` sigue sin evidencia concluyente. La auditoría previa observó el binding productivo de `roles/editor` para la cuenta Compute. | Confirmar atribución de operaciones con Cloud Audit y el riesgo de roles amplios; cualquier cambio IAM/productivo requiere su gate propio. |
| App Hosting | Lectura de Cloud Run el 2026-11-27: staging sirve `micafe-pos-build-2026-11-26-003` al 100 %; producción sirve `micafe-pos-build-2026-11-24-002` al 100 %. | Producción aún no incluye la interfaz del corte #706. Una revisión `READY` acredita disponibilidad, no corrección funcional/legal. | Tras cerrar gates, desplegar por corte controlado y verificar SHA, Functions, Rules, rutas y smoke en el entorno correspondiente. |
| Firestore Rules | Revalidado 2026-11-27 mediante REST de solo lectura con token de `gcloud` y quota project: staging release `a204c10c-4742-4c63-aa30-8ee390777ec3`, actualizado `2026-11-26T12:55:33Z`, SHA-256 UTF-8/LF `8ceb842a7c74e4677474f11a56c6624152c3ce29668500e39760abee0904bb0d`; producción release `23b49a84-6282-4df1-9c97-60513697c5d7`, actualizado `2026-11-25T23:35:48Z`, SHA-256 `9e0e320647998323e997d172a80200bf8f7f14871700dbbc6ce6d4391d6bc948`. Staging coincide byte por byte con `firestore.rules` del HEAD. Producción coincide con las reglas del HEAD excepto que no contiene el `match /clientes/{id}/anotaciones_privacidad/{casoId}` explícito; esa ruta continúa denegada por el `match /{document=**}` global, que solo permite `false`. Las restricciones de `reclamosPrivacidadAbiertos`, las colecciones privadas y los recibos legales están presentes. | La diferencia de producción es una denegación explícita redundante, no una concesión de acceso. El cotejo no es un smoke autenticado de Functions/UI ni una certificación integral. No se escribió Rules ni se cambió IAM. | Mantener la evidencia de Rules junto con las pruebas Emulator; completar smoke autenticado de staging por los flujos afectados y comprobar nuevamente el release tras cualquier despliegue. |
| Firebase Storage Rules | El bucket de producción existe en `us-central1`; su release activo es `1df06087-5bca-4822-ba5a-50ac951c9cf4` (2026-08-14) y la fuente normalizada SHA-256 `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b` coincide con `storage.rules` del branch. El bucket `micafe-pos-staging.firebasestorage.app` no existe y no hay release de Storage en staging. | No se validó un flujo real de archivos en staging; no hay bucket de staging para ese recorrido. La lectura fue de metadatos/Rules, sin leer ni escribir objetos. | Mantener el corte sintético de Storage en Emulator; si se habilitan archivos en staging, crear bucket y desplegar/probar Rules antes del uso. No se requiere despliegue de Storage en producción en este corte. |
| Exportación | ADR-SAAS-106 está aceptado para implementación controlada. El exportador valida una autorización server-side de un solo uso, con alcance/proyecto/tenant/contacto, expiración y revocación; incluye reconciliación del esquema declarado. Las pruebas sintéticas/Emulator existentes pasaron en el corte registrado. | Falta el emisor/consumidor del enlace y una autoridad versionada que verifique la designación del representante del tenant y el control del canal. [ADR-SAAS-107](../../ADR-SAAS-107-contacto-representante-tenant.md) está `Propuesto`; su aprobación explícita para crear esa autoridad de persistencia sigue pendiente. Tampoco se ha seleccionado ni probado un proveedor de entrega. No se completó exportación integral con datos históricos y archivos reales; certificación productiva sigue `NOT_CERTIFIED`. | Aprobar o rechazar ADR-SAAS-107; si se aprueba, implementar y probar el flujo end-to-end solo con contacto sintético y adapter stub; cerrar proveedor/canal mediante gate separado; solo entonces preparar un ensayo real mínimo con instrucción verificable y custodia aprobada. |
| Conservación y supresión | Supresión probada con fixtures sintéticos/Emulator; el planificador permanece en modo de vista previa. | No hay supresión real, certificación de conservación por categoría ni evidencia de expiración completa en respaldos. | Completar retención por categoría, lotes verificables, exportación previa cuando proceda y límites de backups; no borrar datos reales como prueba. |
| Canales de atención | Se conoce un correo Gmail personal, pero no hay evidencia de entrega/recepción desde una cuenta externa en el corte actual. | Una prueba de autoenvío no demuestra disponibilidad externa sostenida ni prueba la identidad del representante del tenant. | Configurar/corroborar un canal operable y hacer ida/vuelta con contenido sintético desde un remitente externo; verificar el contacto del representante antes de usarlo para exportaciones. |
| Vercel y previews | Revalidación read-only con CLI 62.1 el 2026-11-27: equipo en plan `Hobby`; cuatro deployments `READY` de producción. HEAD anónimo sin seguir redirección devolvió `302` a `vercel.com/sso-api` para las cuatro URLs de deployment y dos aliases observados; `cafeatrato.vercel.app` devolvió `404`. API autenticada del proyecto confirmó `gitProviderOptions.createDeployments=disabled`; el `vercel.json` declara `git.deploymentEnabled: false`. | Los cuatro artefactos siguen alojados, el proyecto no está pausado y no se inspeccionó su contenido tras autenticación. Los seis resultados 302 verifican esas direcciones puntuales, no todos los recursos. Hobby está limitado a uso personal/no comercial según los [términos vigentes](https://vercel.com/legal/terms) y la [descripción del plan](https://vercel.com/docs/plans/hobby); compatibilidad comercial y DPA siguen sin resolverse. | Mantener deshabilitada la creación Git y protegidas las URLs enumeradas; resolver si se retiran los artefactos/proyecto remanentes o si existe base contractual y plan aptos para uso comercial. No se actualizó el plan ni se borró contenido. |
| Seguridad y aislamiento | Firestore Rules activas leídas; staging coincide con HEAD, producción conserva las restricciones y solo omite un deny redundante. Storage de producción coincide con branch; staging no tiene bucket. Pruebas locales: Rules 51/51 y Emulator legal 3/3. CI de referencia `26dfe27` y CI del HEAD `e07713d` pasaron; el último run fue `45979770457`. | Las validaciones locales/CI no reemplazan el smoke autenticado actual de Backoffice/Functions ni certifican la seguridad integral. | Terminar pruebas positivas/negativas autenticadas en staging, sin datos reales. |

## Validaciones ejecutadas en esta revalidación

- `npm run test:rules`: 51/51 pasaron en Firestore Emulator. Firebase CLI exige Java 21; JDK 21 ya estaba instalado y se seleccionó solo para ese proceso, sin cambiar el Java global.
- `npm --prefix functions-legal test`: 27 pasaron, 3 emulator tests omitidos por no tener emulador en esa invocación; posteriormente `firebase ... emulators:exec ... test:emulator` pasó esos 3/3.
- `npm --prefix functions-legal run build` y `npm run build:functions`: ambos pasaron.
- CI del HEAD `e07713d9963e867cea7034e611c8f1a7eda20fcc`: run `45979770457`, `success`; `gh pr checks 706` mostró el check obligatorio `Tipos y pruebas` en `pass`, sin checks pendientes al cierre.

## Decisión de alcance sobre ADR-SAAS-106

Se mantiene la alternativa A aceptada para ADR-SAAS-106 por decisión delegada
por el responsable: autorización de un solo uso, acotada y fail-closed. El
repositorio no contiene una fuente versionada que pruebe la designación del
representante y el control del canal. ADR-SAAS-107 propone esa autoridad
persistente y sigue `Propuesto`; es un gate distinto que requiere aprobación
explícita conforme a `AGENTS.md`. Hasta resolverlo no se implementará el
emisor/consumidor del enlace ni se escogerá/inventará un proveedor de entrega.
Un correo escrito por un operador o una referencia libre no demuestra
autorización. Exportar datos reales permanece bloqueado hasta aprobar e
implementar el flujo, probar un canal externo y completar los gates operativos
independientes.

## Resultado de auditoría

**NO APROBADO PARA MERGE.** El CI del HEAD `e07713d` terminó en verde y GitHub
reporta `CLEAN`/`MERGEABLE`, pero el PR continúa en borrador y no tiene revisión
humana registrada. Se cerró la lectura y el cotejo de Rules; esa evidencia no
cierra el smoke autenticado actual, la atribución IAM ni la autorización
verificable de exportación. Continúan abiertos
los gates de ADR-SAAS-107, canal de entrega, validación factual/jurídica, Vercel,
recorrido de aceptación y atribución IAM. La descripción del PR ya refleja el
HEAD y el CI actual. No se desplegó ni
modificó producción; no se exportaron ni borraron datos reales.

## Revalidación de normas oficiales — 2026-11-27

Se contrastaron, en las fuentes oficiales de Función Pública, únicamente las
reglas que sustentan los plazos de privacidad y la cláusula condicional de PQR
electrónicas del borrador 0.6:

- La Ley 1581 de 2012, artículos 14 y 15, establece hasta diez días hábiles
  para consultas, con hasta cinco días hábiles adicionales si se informa la
  demora; para reclamos incompletos dispone requerir subsanación dentro de los
  cinco días siguientes y desistimiento después de dos meses sin respuesta al
  requerimiento; al recibirse completo exige la anotación dentro de dos días
  hábiles, y el término de respuesta es de quince días hábiles, prorrogable
  hasta ocho días hábiles con aviso motivado.
- Hallazgo de cómputo que sigue abierto: la ley dice que los quince días corren
  desde el día siguiente a la fecha de recibo, pero regula por separado el
  reclamo incompleto y el momento en que se recibe completo. El código actual
  calcula el vencimiento de respuesta desde `recibidoEn` (recepción inicial),
  incluso cuando hubo subsanación tardía, no desde `completoEn`. Esto puede
  dejar el vencimiento interno anterior a la fecha en que el caso quedó
  completo. Las fuentes oficiales consultadas no aclaran de forma específica
  esta interacción. Hasta obtener revisión jurídica, ese vencimiento no debe
  presentarse como cómputo legal resuelto ni usarse como certificación del
  flujo; revisar ADR-SAAS-104 y los casos sintéticos/históricos antes de activar.
  La ley y el borrador coinciden en las duraciones, pero no queda cerrada la
  fecha de inicio aplicable a un reclamo subsanado.
- La Ley 2439 de 2024 modificó el artículo 50(g) de la Ley 1480: cuando exista
  una relación de consumo en comercio electrónico, debe haber canales de fácil
  acceso en el mismo medio, orientación y asistencia, trazabilidad, número de
  registro o radicado con fecha y hora, y mecanismo de seguimiento. La sección 9
  de los términos condiciona correctamente esta obligación a esa relación; el
  Backoffice de privacidad no acredita por sí mismo un mecanismo de PQR de
  consumo.

Fuentes oficiales: [Ley 1581 de 2012, artículos 14–15](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981),
[Ley 2439 de 2024, artículo 4](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116)
y [Ley 1480 de 2011, artículo 50](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306).
Las páginas oficiales se consultaron el 2026-11-27; no se obtuvo dictamen
jurídico ni revisión integral de vigencia o aplicabilidad. Se mantienen
pendientes la revisión jurídica profesional y la verificación operativa de los
canales y flujos descritos.

## Actualización del candidato y estado operativo — 2026-11-27 12:05 UTC

- PR #706 está abierto y en borrador, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`,
  HEAD `f1574700f163764459e82765a245e1dbd9525aaf`; el check `Tipos y pruebas`
  terminó `SUCCESS` en el run `45991808012`, sin checks pendientes en la lectura
  de GitHub.
- ADR-SAAS-106 alternativa A está aceptado por decisión delegada y el flujo
  interno de enlace está probado con datos sintéticos/Emulator. No existe aún
  API, interfaz, fuente de contacto aprobada ni proveedor real conectado.
- ADR-SAAS-107 continúa `Propuesto`; no se implementó su autoridad persistente.
  No se hizo despliegue, envío externo, exportación real ni supresión productiva.
- Auditoría vigente: **NO APROBADO PARA MERGE**. Además de los gates previamente
  descritos, queda señalado el cómputo de respuesta para reclamos que llegan
  incompletos, el canal de PQR de consumo si aplica, la revisión factual/jurídica,
  Vercel y el smoke de los recorridos de aceptación y privacidad en staging.

## Revalidación operativa posterior al rollout — 2026-11-27

- PR #706 permanece abierto y en borrador, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `88a89301dc2f5c4b4c4caab2ac4ec7bf7cd6f52d` (la matriz de este corte añade solo documentación). CI `46007447032` está en ejecución; el CI `45998132167` pasó sobre el SHA previo `63ac1a0cf51f0a5ee9476af60eff49c3ff8bfc45`. El check `App Hosting - Rollout (micafe-pos-staging/us-central1/micafe-pos)` pasó para ese runtime.
- Se creó manualmente en App Hosting staging el build `build-2026-11-27-001` desde el SHA de runtime `63ac1a0cf51f0a5ee9476af60eff49c3ff8bfc45`. Está `READY`, su rollout está `SUCCEEDED` y Cloud Run asigna 100 % del tráfico a `micafe-pos-build-2026-11-27-001`. El build anterior `build-2026-11-26-003` continúa `READY` y disponible para rollback.
- Prueba anónima de solo lectura: `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` responden 200, presentan marca Dusema, muestran `BORRADOR` y no contienen la marca Café Atrato. No se enviaron formularios ni se escribieron recibos de aceptación o casos.
- La lectura de producción posterior al rollout confirma que no cambió: Cloud Run sirve `micafe-pos-build-2026-11-24-002` al 100 %. `/terminos` aún muestra Café Atrato y las otras tres rutas responden 404. No se hizo rollout a producción porque el bundle continúa en preparación y sus documentos no están aprobados/publicados.
- En el anexo estático v0.6 se exige completar por tenant una ficha con representante/facultad, alcance e instrucciones, subencargados/regiones, controles y condiciones de salida. La UI actual registra el bundle estático y el snapshot comercial, pero no esa ficha versionada. [ADR-SAAS-108](../../ADR-SAAS-108-anexo-tratamiento-tenant.md) queda propuesto para resolver su fuente y huella; no se implementará hasta aprobación. La UI además advierte que el precio del snapshot no determina si incluye IVA u otros cargos; no se infiere ese dato.
- La sesión disponible de Backoffice en staging es de operador de plataforma, no de administrador tenant. El acceso anterior a `/admin/documentos-legales` fue denegado por falta de sesión tenant; por tanto, este rollout no certifica la aceptación autenticada. No se elevó el rol ni se crearon credenciales.
- Estas acciones solo tocaron App Hosting staging y la descripción del PR. No se desplegaron Functions, Rules, IAM ni recursos productivos, y no se exportaron, entregaron o suprimieron datos reales.
- ADR-SAAS-106 alternativa A sigue aceptado para implementación controlada. ADR-SAAS-107 continúa `Propuesto`; su aprobación para crear la autoridad versionada del representante sigue pendiente. El canal externo, la autorización real de exportación, la exportación integral con archivos/históricos, la supresión productiva y la revisión jurídica/empresarial también permanecen sin certificar.
- ADR-SAAS-108 queda `Propuesto` para la ficha tenant-específica del anexo; no habilita aceptación real ni publicación.

**Auditoría actual: NO APROBADO PARA MERGE.** El verde de CI y de App Hosting no cierra los gates legales, de modelo tenant-específico, de aceptación autenticada, contacto/canal, exportación/supresión real, Vercel ni atribución IAM productiva.

## Probe anónimo de rutas y Functions en staging — 2026-11-27

- Sin sesión, GET `/admin/documentos-legales` y `/backoffice/privacidad` responden HTTP 200 con el cascarón Next.js. El HTML inicial no contiene los marcadores de la vista privada (formularios de reclamos, aceptación, historial o condiciones comerciales). Las rutas usan guardas cliente; HTTP 200 no se presenta como bloqueo server-side.
- POST sin autenticación a `consultarEstadoLegalTenant`, `tramitarReclamoPrivacidadSaas` y `tramitarConsultaPrivacidadSaas` devolvió `401 UNAUTHENTICATED` en los tres casos. La prueba no incluyó identidad ni datos de tenant; no escribió registros.
- Alcance: verificación anónima de denegación en Functions y ausencia de contenido privado específico en el HTML inicial. No sustituye la prueba autenticada de autorización positiva, aislamiento multiempresa ni recorrido de aceptación tenant.

## Revalidación de CI y arquitectura — 2026-11-27

- El HEAD `88a89301dc2f5c4b4c4caab2ac4ec7bf7cd6f52d` tiene `Tipos y pruebas` en `pass` en [run 46007447032](https://github.com/Glemynart/micafe-pos/actions/runs/46007447032); `gh pr checks 706` no mostró otros checks pendientes. `main` continúa en `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, igual a la base del PR.
- La CI verde valida ese candidato; no cierra los gates de revisión jurídica y factual, aceptación autenticada, proveedor/canal, exportación integral y supresión real, Vercel, ni atribución IAM productiva. PR #706 permanece abierto/en borrador y la auditoría sigue `NO APROBADO PARA MERGE`.
- ADR-SAAS-106 permanece `Aceptado para implementación controlada` por decisión técnica delegada. Su autorización cubre pruebas sintéticas/Emulator/staging; no datos reales, despliegues ni IAM.
- ADR-SAAS-108 se incorpora como `Propuesto` para el snapshot versionado del anexo por tenant. No habilita implementación ni publicación hasta aprobación explícita, ni modifica los límites de producción.

## Transparencia del plazo de respuesta tras subsanación — 2026-11-27

- El commit local `70e5088` expone en la respuesta autenticada de consulta el indicador server-side `subsanacionRecibida`. En Backoffice, los casos subsanados rotulan el vencimiento como referencia interna provisional y explican que su cómputo desde la recepción inicial no constituye una conclusión jurídica validada. El algoritmo de vencimiento no cambió.
- Validación local del candidato: Emulator Firestore legal `3/3`; `npm --prefix functions-legal test` `27 passed / 3 skipped` (las tres pruebas que requieren Emulator pasaron en la ejecución separada); `npx tsc --noEmit`, `npm run build:functions`, `npm --prefix functions-legal run build`, `npm run build` y ESLint focalizado pasaron. La primera ejecución del test Emulator detectó una referencia local no asignada; se corrigió y el rerun pasó completo.
- El CI remoto `46015348673` terminó `success` para HEAD `1d101b30a280b2ece419398c942213af81f23248`, con 128 pasos completados y ninguno pendiente. El commit `70e5088` quedó incluido en ese HEAD. Esta evidencia reemplaza la nota anterior que indicaba que el commit estaba sin push.
- El 2026-11-27 se desplegó únicamente `functions:saas-legal` en `micafe-pos-staging`. Las cuatro funciones quedaron `ACTIVE` con actualización entre 14:43:43Z y 14:43:47Z y conservaron `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`. POST anónimo a las cuatro URLs respondió `401`; no se envió identidad/tenant y no hubo escrituras. El CLI informó que aseguró APIs y que generaba las identidades de Pub/Sub/Eventarc; la salida no prueba si fueron creadas en esta ejecución ni resuelve el hallazgo `GenerateServiceIdentity` de producción.
- App Hosting staging creó `build-2026-11-27-002` desde el mismo SHA `1d101b30a280b2ece419398c942213af81f23248`; el build quedó `READY`, el rollout `SUCCEEDED` y Cloud Run sirve `micafe-pos-build-2026-11-27-002` al 100 %. Las cuatro rutas públicas legales responden 200, identifican Dusema POS, muestran `BORRADOR` y no contienen Café Atrato. `/backoffice/privacidad` respondió 200 sin marcadores de contenido privado en HTML inicial; esto no certifica acceso autenticado.
- El bundle JavaScript publicado en staging contiene el rótulo `Referencia interna provisional de respuesta`. Esto verifica que el texto llegó al artefacto público, pero no que se renderice para un caso autenticado; la interacción sigue sin comprobarse. Producción no se tocó. No hubo escritura de expedientes, aceptación real, exportación ni supresión de datos.
- La auditoría continúa `NO APROBADO PARA MERGE`: ADR-SAAS-107 y ADR-SAAS-108 siguen propuestos; faltan canal y contacto representante verificables, smoke positivo autenticado, revisión factual/jurídica de los documentos, y certificación de exportación/supresión reales. Los documentos siguen borradores; no se publica a producción.

## Despliegue controlado de PR #706 en staging — 2026-11-27

- CI del SHA exacto `1d101b30a280b2ece419398c942213af81f23248`: [run 46015348673](https://github.com/Glemynart/micafe-pos/actions/runs/46015348673), `success`; `Tipos y pruebas` completó 128 pasos sin pendientes.
- Firebase Functions: se ejecutó `firebase deploy --only functions:saas-legal --project micafe-pos-staging --non-interactive`. El CLI terminó `Deploy complete`; actualizó las cuatro funciones legales, sin seleccionar Rules ni otro codebase. Las cuatro siguen `ACTIVE` con `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- La salida del CLI incluyó mensajes de aseguramiento de APIs y generación de service identities Pub/Sub/Eventarc. La operación terminó correctamente en staging, pero no acredita si creó identidades nuevas ni resuelve el hallazgo separado de `GenerateServiceIdentity` en producción.
- POST sin autenticación a `consultarEstadoLegalTenant`, `aceptarDocumentosLegalesTenant`, `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas` devolvió `401` en los cuatro casos. No se incluyeron identidad ni datos del tenant; no se escribieron documentos.
- App Hosting: rollout manual de `micafe-pos` al commit `1d101b30a280b2ece419398c942213af81f23248`, sin modificar producción. `build-2026-11-27-002` está `READY`, su rollout `SUCCEEDED`, y la revisión `micafe-pos-build-2026-11-27-002` tiene 100 % del tráfico de staging. La revisión anterior `build-2026-11-27-001` existía antes del corte y queda disponible según la retención normal del backend.
- GET anónimo a `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` devolvió 200; las cuatro páginas mencionan Dusema POS y `BORRADOR`, sin la marca Café Atrato. `/backoffice/privacidad` devolvió 200 con HTML inicial sin los marcadores probados de formularios/historial privado. El HTTP 200 solo demuestra que carga la carcasa; no es smoke autenticado positivo ni prueba de autorización del operador.
- Se descargaron en memoria 15 bundles JavaScript referenciados por `/backoffice/privacidad`; uno contiene el rótulo `Referencia interna provisional de respuesta`. Es evidencia de que la actualización de interfaz está en el artefacto servido, no de que un expediente se renderice correctamente bajo una sesión autenticada.
- Alcance no demostrado: acceso positivo autenticado, aceptación de documentos por un administrador tenant, tramitación completa de un reclamo, aislamiento negativo con dos identidades tenant, y visualización autenticada del vencimiento provisional tras subsanación.
- No se desplegó producción, Rules, Storage ni codebases ajenos a `saas-legal`, y no se ejecutaron comandos de cambio de IAM ni se alteraron manualmente bindings. El CLI mostró operaciones de aseguramiento/generación de service identities cuyo resultado de creación no se verificó. No se creó ni modificó expediente, recibo de aceptación, exportación o supresión. Los textos permanecen borradores.

## Revalidación pública y smoke de Backoffice — 2026-11-27 15:35 UTC

- GET anónimo a `https://pos.dusema.com/terminos` y al host productivo de App Hosting devolvió `200`, pero el contenido todavía incluye Café Atrato y no muestra el marcador `BORRADOR`. `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` devolvieron `404` en ambos hosts. No se debe publicar el bundle actual como definitivo ni hacer rollout productivo con este estado.
- En el host correcto de staging, las cuatro rutas legales devolvieron `200`, mostraron Dusema POS y `BORRADOR`, y no incluyeron Café Atrato. `/backoffice/privacidad` devolvió `200` con el HTML inicial sin los marcadores privados comprobados; esto no prueba acceso autenticado.
- El intento de observar Edge para un smoke autenticado se detuvo antes de interactuar: Computer Use no pudo determinar con suficiente confianza la URL activa. No se hicieron clics, no se ingresaron credenciales y no se leyeron expedientes. El smoke positivo autenticado permanece pendiente.
- El alias de preview histórico de #706 volvió a devolver `404 DEPLOYMENT_NOT_FOUND` y `vercel inspect` no encontró ese deployment. `vercel ls cafeatrato` enumeró cuatro deployments `production` antiguos; no se modificaron. Esta revalidación no certifica expiración de sus artefactos.
- Producción, Rules, IAM, datos, recibos, exportaciones y supresiones permanecieron sin cambios.

**Auditoría vigente: NO APROBADO PARA MERGE.** Persisten la publicación legal/factual, ADR-SAAS-107/108, el canal operativo de contacto/entrega, el smoke autenticado, la exportación y supresión reales y la revisión de los deployments de producción Vercel.

## Revalidación posterior — rollout `5f66c14` en staging, 2026-11-27 17:24 UTC

- El CI del SHA `5f66c146fa0339a16414fa59d6906b348699d97a` terminó `success` en el run `46036507027` (27m45s). La rama contiene `main@aa1c4fe`; PR #706 sigue abierto/en borrador.
- Firestore Rules se desplegaron con éxito a staging. La lectura independiente de release devolvió 403; se conserva la salida del CLI y la validación local 52/52, sin afirmar que se haya cotejado el hash remoto.
- Las cuatro Functions `saas-legal` están `ACTIVE/READY`, revisiones `00007`, 100 % de tráfico, identidad runtime `saas-legal-runtime`. POST anónimo a cada callable devolvió HTTP 401.
- App Hosting build `build-2026-11-27-003` está `READY`, rollout `SUCCEEDED`; la revisión exacta del SHA `5f66c14` recibe 100 % del tráfico de staging. Automáticos siguen desactivados.
- Cuatro páginas legales respondieron HTTP 200 y los bytes de los cuatro markdown v0.6 coincidieron con los hashes de bundle. Siguen marcados `BORRADOR`; ninguna aceptación real fue activada.
- El smoke autenticado positivo no se ejecutó por fallo de Computer Use al determinar la URL de Edge. Producción permaneció en `build-2026-11-24-002`; `/terminos` aún muestra Café Atrato y tres rutas legales siguen 404. No se desplegó producción ni se leyeron/exportaron/suprimieron datos reales.
- El CLI informó que solicitó asegurar APIs y generar/verificar identidades Pub/Sub/Eventarc. La consulta de auditoría no encontró eventos `GenerateServiceIdentity`; esa ausencia no demuestra que no hubiera efecto. No se modificaron bindings manualmente; el runtime legal conserva solo su rol custom acotado.
- Evidencia completa: [rollout controlado de staging](evidence/ROLLOUT-STAGING-LEGAL-PR706-5F66C14-2026-11-27.md).

**Auditoría vigente: NO APROBADO PARA MERGE.** Continúan sin cerrar la aprobación jurídica/factual, el canal y contacto verificables, el smoke autenticado, la certificación de exportación/supresión reales y los artefactos Vercel históricos.

La reconciliación posterior de los estados de ADR-SAAS-106/107/108, el CI
actual, el rollout `5f66c14` y los gates restantes está en
[reconciliación legal 2026-11-27](evidence/RECONCILIACION-LEGAL-ADR106-108-2026-11-27.md).

## Smoke autenticado adicional — 2026-11-27

El recorrido server-side de lectura legal y aislamiento de tenant en staging
pasó con un usuario sintético. Callable del tenant propio: `200`; Firestore
Rules permitió lectura propia (`200`) y denegó otro tenant (`403`); la callable
rechazó el tenant indicado por el cliente (`400 INVALID_ARGUMENT`). Se verificó
la limpieza de Auth y Firestore. Una aceptación sintética completa fue rechazada
con `FAILED_PRECONDITION` mientras el bundle permanece en borrador, sin crear
recibo. No cubre Backoffice/UI, aceptación exitosa, exportación, supresión ni
producción. Evidencia: [smoke autenticado de staging](evidence/SMOKE-AUTENTICADO-STAGING-2026-11-27.md).

La auditoría continúa `NO APROBADO PARA MERGE` mientras sigan abiertos los gates
jurídicos, factuales, del canal/contacto y de exportación/supresión.

La revalidación GET de las 18:26 UTC confirmó que `/terminos` en producción
todavía incluye Café Atrato sin el marcador `BORRADOR`, y que `/privacidad`,
`/aviso-autorizacion` y `/anexo-tratamiento` responden 404. No hubo rollout.
Evidencia: [rutas legales de producción](evidence/PRODUCCION-RUTAS-LEGALES-READONLY-2026-11-27.md).

La revisión Vercel de las 18:34 UTC encontró cero previews activos; tres URLs
históricas devolvieron 404. Los cuatro deployments Production y dos aliases
requieren la pantalla de login de Vercel ante solicitudes anónimas. El dominio
no está configurado para enrutar a Vercel; no hubo cambios ni borrados. Evidencia:
[Vercel](evidence/VERCEL-ACCESO-READONLY-2026-11-27.md).

## Revalidación de cierre de turno — 2026-11-27 19:16 UTC

- PR #706 HEAD `f736113d28eddcb774856845b4c258e526323093` mantiene el `main`
  remoto actual. CI run `46050700139` terminó `success` (28m29s), sin checks
  pendientes; el PR sigue abierto/en draft.
- La vista autenticada `/backoffice/privacidad` cargó en staging y mostró
  `Operador autorizado`; fue inspección de solo lectura, sin enviar el formulario
  ni consultar casos. Esto verifica render, no la interacción del flujo.
- Las rutas legales de producción se revalidaron: `/terminos` aún muestra Café
  Atrato y las otras tres rutas siguen en 404.
- IAM de producción: 117 Functions activas, todas con cuenta Compute default y
  `roles/editor`. En staging las cuatro Functions legales sí usan runtime
  dedicado. El agente Firebase App Hosting tiene el binding esperado
  `roles/firebaseapphosting.serviceAgent`; la consulta acotada no encontró
  `GenerateServiceIdentity`. Esto no demuestra que el intento original haya
  concluido ni que el error interno de Cloud Run esté resuelto. No hubo cambios
  de IAM.
- El PR no queda aprobado para merge: documentos en borrador, contacto/canal de
  exportación sin verificación, exportación/supresión real no certificadas,
  interacción UI de privacidad incompleta y riesgo IAM productivo pendiente.

Evidencias: [smoke autenticado](evidence/SMOKE-AUTENTICADO-STAGING-2026-11-27.md),
[rutas productivas](evidence/PRODUCCION-RUTAS-LEGALES-READONLY-2026-11-27.md) y
[IAM runtime](evidence/IAM-RUNTIME-PRODUCCION-READONLY-2026-11-27.md).

## Estado actual y smoke visual sintético — 2026-11-27

- Revalidación de GitHub: PR #706 abierto y en draft; base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; HEAD remoto `e38ea1334c776619866a81fff4902f06fbdf49b1`; CI [run `46066931745`](https://github.com/Glemynart/micafe-pos/actions/runs/46066931745) terminó `SUCCESS` a las 21:26:26Z (30m26s), sin pasos pendientes ni fallidos. No hay aprobación/revisión registrada. El candidato abarca 147 archivos (+20.852/−686 líneas) frente a `main`, por lo que sigue requiriendo revisión integral de alcance y dependencias; el verde de CI no es dictamen de merge.
- Smoke visual local/Emulator completado: autenticación sintética, acceso autorizado, registro/consulta/gestión/cierre de reclamo, separación entre tenants y rechazo de operador sin facultad; **2/2 pruebas**. Evidencia y límites: [smoke visual de privacidad en Emulator](SMOKE-VISUAL-PRIVACIDAD-EMULATOR-2026-11-27.md). No se presenta como smoke visual de staging.
- El artefacto E4.2 de la CI (`e4-02-46066931745`) terminó `PASS_WITH_CONDITIONAL_CAPABILITIES`, pero su contrato declara `G-MVP-01 / M4 / E4.2`, entorno local/CI sin Firebase ni producción y `productionWrites=false`; no certifica el release legal de `G-SAAS-02 / M2 / E2.2`. Sus auditorías de dependencias de producción registran 4 vulnerabilidades moderadas en la raíz y 6 moderadas + 1 baja en Functions, todas con fix disponible y sin altas/críticas; el runner las deja como seguimiento para un PR separado.
- ADR-SAAS-106, 107 y 108 están aceptados para implementación controlada. Para 107 ya existen lógica de dominio, persistencia versionada y pruebas Emulator, pero falta callable/UI operativa para mantener y verificar el contacto. Para 108 existen snapshot tenant-específico, validación fail-closed y visualización/confirmación de la ficha en la UI de aceptación; sus fuentes reales faltan y el bundle sigue en borrador. ADR-106 tiene helpers probados sintéticamente, pero no callable/UI operativa conectada ni canal real. Evidencia: [reconciliación ADR 106–108](evidence/RECONCILIACION-LEGAL-ADR106-108-2026-11-27.md) y [resultado de implementación controlada](evidence/RESULTADO-ADR107-108-IMPLEMENTACION-CONTROLADA-2026-11-27.md).
- ADR-SAAS-109 quedó redactado como **Propuesto** para definir una facultad dedicada `EXPORTACION_CONTACTO_GOBERNAR`. AGENTS.md y el gate de ADR-107 impiden implementar la callable/UI hasta la aprobación de esa autoridad. La propuesta no autoriza despliegues ni operaciones reales.
- Revalidación pública de las 21:21Z: producción conserva `/terminos` con `<title>` de Café Atrato y sin `BORRADOR`; las otras tres rutas legales responden 404. Staging entrega las cuatro rutas Dusema POS marcadas `BORRADOR`. El SHA actual del PR no se desplegó; la evidencia del rollout previo de staging corresponde a `5f66c146`. No se hizo despliegue productivo ni se habilitó aceptación. Detalle: [rutas legales públicas](evidence/PRODUCCION-RUTAS-LEGALES-READONLY-2026-11-27.md).
- Exportación: siguen sin identificarse por fuente autorizada el contacto representante de Diana ni un canal de entrega validado. No hay autorización individual verificable conectada a una callable/UI de producto, exportación real, recepción ni certificación integral de archivos. El adapter de entrega disponible es stub de pruebas.
- Supresión/conservación: el procedimiento probado sigue siendo sintético/Emulator. No se certificaron adaptadores productivos de Auth y Storage, borrados relacionados, respaldo/soft delete hasta vencimiento ni retención por categoría en un ciclo real. No hubo supresión productiva.
- IAM: lectura de solo consulta confirma 117/117 Functions activas de producción en la cuenta Compute predeterminada con `roles/editor`. El alcance exacto de permisos por codebase, usos externos/inherited y pruebas de revocación siguen incompletos. El piloto `saas-legal-runtime` solo aplica a staging. No se cambió IAM productivo; la ausencia de evento `GenerateServiceIdentity` no resuelve la incidencia de Cloud Run.
- Gate de release legal: los cuatro documentos siguen en borrador; falta validación factual y jurídica, cierre del cómputo legal para reclamos subsanados, decisión del canal PQR si aplica comercio electrónico, contacto/canal operativo, exportación/supresión reales y aprobación humana del PR. Producción permanece intacta.

**Auditoría vigente: NO APROBADO PARA MERGE.** El CI de `e38ea13` y el smoke sintético están verdes, pero no cierran la revisión integral de alcance, no existe revisión humana y siguen abiertos los gates jurídicos, operativos y de producción. El contacto de exportación carece de una facultad aprobada; ADR-SAAS-109 permanece propuesto.

## Revalidación de cierre — 2026-11-27T22:00Z

- PR #706 sigue abierto y en draft, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `fa1406c2867368d13d5658a2fe244354e3a329eb`. El único check requerido, `Tipos y pruebas`, terminó `pass` en [run 46071707186](https://github.com/Glemynart/micafe-pos/actions/runs/46071707186): 128 pasos completados, cero fallidos y cero pendientes. No hay revisión humana registrada; el merge no está aprobado.
- E4.2 de esa misma ejecución produjo `PASS_WITH_CONDITIONAL_CAPABILITIES` y `READY_WITH_CONDITIONAL_CAPABILITIES`, pero el contrato declara `G-MVP-01/M4/E4.2`, commit `049eb8e31199e1c72d2b85f7c35fdc86bf60f9a3`, entorno local/CI sin Firebase ni producción y `productionWrites=false`. No certifica `G-SAAS-02/M2/E2.2`. Sus seguimientos de dependencias reportan cuatro moderadas en raíz y seis moderadas más una baja en Functions, sin vulnerabilidades altas/críticas; el artefacto pide PR separado.
- Lectura App Hosting staging: backend `micafe-pos` en `micafe-pos-staging` sirve `build-2026-11-27-003`, `READY`, rollout `SUCCEEDED`, desde SHA `5f66c146fa0339a16414fa59d6906b348699d97a`. Comparación del SHA desplegado con `fa1406c` encontró únicamente ADR, documentación y el arnés/configuración Playwright; no cambia `app/`, `components/`, `functions/`, Rules, configuración Firebase ni dependencias del build. El runtime de staging es equivalente en código de aplicación al HEAD, pero no existe rollout del SHA exacto ni una certificación de reproducibilidad del artefacto.
- Revalidación GET pública a `2026-11-27T21:45:50Z`: producción `/terminos` sigue sirviendo Café Atrato y las otras tres rutas legales responden 404; en staging las cuatro rutas Dusema responden 200 y llevan `BORRADOR`. No hubo autenticación, escrituras ni cambios de despliegue. Detalles en [rutas legales](evidence/PRODUCCION-RUTAS-LEGALES-READONLY-2026-11-27.md) y [rollout de staging](evidence/ROLLOUT-STAGING-LEGAL-PR706-5F66C14-2026-11-27.md).
- Los documentos v0.6 siguen en `BORRADOR/PREPARACION`; no se activó aceptación contractual en producción. Siguen pendientes la validación factual y aprobación jurídica/empresarial, el cierre de ADR-SAAS-109, el contacto/canal verificable para exportación, la exportación integral real con archivos, la certificación de conservación/supresión y el smoke autenticado de operaciones en staging.
- IAM de producción conserva el hallazgo de 117 Functions con Compute predeterminada y `roles/editor`; no se cambió IAM. La revisión Vercel actual no encontró previews activos y confirma protección SSO en las muestras, pero no resolvió el plan/contrato comercial de los cuatro deployments `Production` remanentes.

**Dictamen vigente: NO APROBADO PARA MERGE.** El check verde no cierra los gates anteriores ni reemplaza revisión humana. No se desplegó producción, no se aceptaron documentos, no se exportaron ni suprimieron datos reales.

## Revalidación operativa — 2026-11-27T22:19Z

- PR #706 continúa abierto y en draft, `main@aa1c4fe`, HEAD `38415589b807354f070fdf57a735e4d017796f99`, sin revisión humana ni decisión de aprobación. CI run `46074607556` corresponde exactamente a ese SHA y continúa `in_progress`; E2E Operator Portal terminó `success`, E2E R1-A está ejecutándose y las etapas E2E P0-01/Bodega aún estaban pendientes al consultar. No hay un fallo nuevo confirmado. El dictamen no cambia.
- Revisión de rutas: la discrepancia productiva se explica por el build de `main` actualmente servido. Ese `main` todavía tiene el documento heredado de Café Atrato en `/terminos` y no contiene las otras tres rutas; el candidato incluye las cuatro páginas Dusema. Staging devuelve las cuatro en HTTP 200 con la marca `BORRADOR`. No se desplegó producción porque los textos todavía requieren aprobación jurídica/factual.
- Firestore de producción: se observó programación diaria con retención de 35 días, 35/35 snapshots `READY`, última copia `2026-11-27T14:08:10Z` con vencimiento `2027-01-01T14:08:10Z`; PITR está desactivado y la retención de versiones es 1 hora. Esto mejora la precisión del runbook: datos borrados de la base viva pueden seguir presentes en snapshots hasta que venzan. La lectura no prueba restauración, borrado selectivo, ni cubre Auth/Storage. Evidencia: [respaldos Firestore](evidence/RESPALDOS-FIRESTORE-PRODUCCION-READONLY-2026-11-27.md).
- El formulario autenticado de Backoffice de staging fue observado visualmente con un fixture sintético precargado. No se envió porque el formulario crea una anotación persistente y falta confirmar esa acción puntual; no se consultaron expedientes reales. Por tanto, la verificación visual de acceso/render pasó, pero el recorrido de escritura/cierre desde UI sigue pendiente.

**Dictamen vigente: NO APROBADO PARA MERGE.** Mantener #706 en draft. La CI sigue su curso; no se volvió a lanzar ni se hicieron escrituras o despliegues productivos.

## Cierre CI y reconciliación read-only — 2026-11-27T22:29Z

- El run `46074607556` del SHA `38415589b807354f070fdf57a735e4d017796f99` terminó `success`: 128/128 pasos exitosos, 0 fallidos y 0 pendientes. Los E2E de Operator Portal, R1-A, P0-01, Bodega y la certificación E4.1 terminaron en verde. No se atribuye este resultado a cambios posteriores a ese SHA.
- El colector release-evidence, en modo `readOnly=true` y `productionWrites=false`, confirmó ese run verde y 117/117 Functions activas en Node.js 22. App Hosting de producción sirve `build-2026-11-24-002` desde `main@aa1c4fe`, así que no sirve el SHA candidato. Storage Rules coincide con la fuente; Firestore Rules difiere del candidato únicamente por bloques explícitos de denegación que no están en la fuente productiva, aunque el diff directo previo mostró que la versión productiva es más restrictiva que `main` en protecciones de privacidad y que el deny global bloquea las rutas nuevas. El estado de Rules del recolector es una diferencia de hash, no evidencia de concesión adicional. Faltan atestaciones independientes de smoke autenticado y ensayo de recuperación.
- La relectura del recurso Firestore confirmó 1 programación diaria, retención de 35 días y 35 snapshots `READY`; PITR desactivado. No se restauró nada ni se examinó contenido.
- GET público repetido a las 22:26 UTC: en producción `/terminos` sigue devolviendo el contenido de Café Atrato (200) y las otras tres rutas 404; las cuatro rutas en staging devuelven 200 y el marcador `BORRADOR`. El build activo deriva de `main`, cuyo árbol todavía tiene la página antigua de términos; el candidato ya contiene las páginas Dusema. No se hizo rollout.
- Se corrigió el texto del colector que atribuía el hash comparado a `origin/main`: en realidad compara el árbol local del corte. Suite focalizada `npm run test:g-saas-02:release-evidence`: 21/21 pruebas pasaron. El nuevo cambio de código/documentación requiere su propio CI; no está cubierto por el run anterior.

**Dictamen vigente: NO APROBADO PARA MERGE.** Aunque el run anterior está verde, este PR sigue en draft y sin revisión humana; los textos continúan en borrador y los gates de contacto/entrega, datos reales, restauración/supresión y publicación no están cerrados.

## Revalidación tras CI y alcance PQR — 2026-11-27T22:57Z

- El run `46077219684` para `2854fb1e103f56e919829f6c5b833169db869fb0` terminó `success`: 128/128 pasos exitosos, sin fallos, omisiones ni pendientes. El PR sigue abierto y en draft, sin revisión humana.
- El colector read-only ejecutado a las 22:56 UTC devolvió `INCOMPLETE` sin errores de recolección. CI pasó; App Hosting sirve `build-2026-11-24-002` desde `main@aa1c4fe`, no el candidato. 117/117 Functions están activas en Node.js 22; se observaron sus hashes. Storage Rules coincide con la fuente local; Firestore Rules tiene drift de hash explicado por los bloques `deny` explícitos y redundantes del candidato, con deny global activo. Faltan atestaciones independientes de smoke y recuperación. Hay 1 schedule y 35 backups Firestore; PITR está desactivado. No se desplegó ni se escribió producción.
- La búsqueda normativa oficial acota el gate PQR: art. 50(g) de Ley 1480 (modificado por Ley 2439/2024) habla de ventas electrónicas a consumidores; la definición y el criterio publicado por SIC distinguen el uso empresarial ligado intrínsecamente a la actividad del comprador. Como el SaaS POS se utiliza para operar el negocio, la inaplicabilidad de esa regla específica parece probable para el segmento B2B objetivo, pero sigue siendo una **inferencia pendiente de aprobación jurídica**, no una exención ni conclusión definitiva. Se documentó en [vigencia y trámite](VIGENCIA-Y-TRAMITE.md) con fuentes oficiales.
- La vista autenticada de staging sigue mostrando el fixture de reclamo sintético en el formulario. El envío crearía una anotación persistente; se pidió confirmación puntual antes de enviarlo. No se abrieron expedientes reales ni se hizo el smoke UI de escritura/cierre.

**Dictamen vigente: NO APROBADO PARA MERGE.** Siguen abiertos la aprobación jurídica/factual de los textos, canal/contacto verificables, exportación/supresión reales, ensayo de restauración, acción visual sintética pendiente, decisión expresa sobre ADR-SAAS-109, migración IAM productiva y revisión humana. Producción continúa sin cambios.

## Reconciliación de E2E visual y relecturas — 2026-11-27T23:34Z

- PR #706 está abierto y en draft, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `9209e66716ef2db4c28f7155eb07b74a0f6352fa`. El run CI `46079731068` corresponde exactamente a ese SHA y terminó `success`; el check `Tipos y pruebas` no tiene trabajos pendientes. E2E Bodega y los demás pasos listados por el run concluyeron exitosamente. No hay revisión humana registrada. Los cambios locales de este checkpoint aún no forman parte de ese SHA ni están cubiertos por ese CI.
- El gap anterior de interacción UI sintética en staging queda cerrado por el recorrido Playwright: **2/2 PASS**, caso sintético completo y resuelto, aislamiento A/B, autorización negativa y cleanup verificado. Detalle y límites en [smoke visual autenticado de staging](evidence/SMOKE-VISUAL-PRIVACIDAD-STAGING-2026-11-27.md). No se usó la sesión de Diana ni se tocaron datos de producción.
- Relectura GET de las cuatro rutas: producción devuelve `/terminos` HTTP 200 con contenido heredado Café Atrato y HTTP 404 para las otras tres; staging devuelve HTTP 200 para las cuatro rutas Dusema `BORRADOR`. No se desplegó.
- Relectura IAM de nivel proyecto: los tres miembros de `micafe-pos` con `roles/editor` son la cuenta Compute predeterminada, `882525811433@cloudservices.gserviceaccount.com` y `micafe-pos@appspot.gserviceaccount.com`. Las 117/117 Functions activas continúan con la Compute predeterminada. No está atribuido el uso de las otras dos cuentas; IAM productivo permanece sin cambios. Detalle en [IAM runtime read-only](evidence/IAM-RUNTIME-PRODUCCION-READONLY-2026-11-27.md).
- Exportación y supresión: las pruebas sintéticas/Emulator y el cleanup del smoke no certifican exportación integral real, entrega/recepción, borrado productivo ni conservación hasta vencimiento de Auth/Storage/respaldos. No se realizó ninguna operación real. ADR-SAAS-109 permanece propuesto; no se creó la facultad de administración de contacto.
- Documentos: técnicamente disponibles en staging como borradores; aprobación jurídica/empresarial y verificación factual siguen pendientes. No se habilita aceptación real ni release legal en producción. Vercel comercial/retención y el ensayo de restauración también siguen abiertos.

**Dictamen actualizado: NO APROBADO PARA MERGE.** El smoke visual ya no es un bloqueo técnico; permanecen la revisión humana, la reconciliación de alcance, documentos en borrador y gates de exportación, supresión/conservación, recuperación, contacto/canal, Vercel e IAM. No se desplegó ni modificó producción.

## Revalidación de assets estáticos legales — 2026-11-28T00:10Z

- Relectura GET de los cuatro archivos `/legal/v0.6/*.md` en staging: los cuatro devolvieron `200` con marcadores de borrador. En producción, `/legal/v0.6/terminos-servicio.md` devolvió `404`, y `/terminos` aún es la página de Café Atrato. Los assets de staging viven bajo `public/`; ocultar únicamente el componente de página no evitaría servir esas descargas si se publicara el candidato. Evidencia: [smoke visual staging, actualización de assets](evidence/SMOKE-VISUAL-PRIVACIDAD-STAGING-2026-11-27.md).
- Gate de publicación: mantener #706 en draft y sin despliegue mientras los documentos sigan en `BORRADOR/PREPARACION` y no exista aprobación factual/jurídica. No se modificó producción ni se habilitó aceptación contractual.
- PR #706 sigue OPEN/DRAFT en `3aff13e`, con CI `46083579381` exitoso para ese SHA; esta actualización documental aún requiere su CI exacta después del push.

**Dictamen: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.** La disponibilidad en staging es de revisión; no es autorización para publicar el bundle.

## Revalidación independiente — 2026-11-28T01:16Z

- **PR/CI:** #706 sigue abierto y en draft, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `5b544e71585dc310a95c10bc5189ebcf2ad66c12`, sin revisión humana. El único check requerido `Tipos y pruebas` terminó `SUCCESS` en [run 46086703865](https://github.com/Glemynart/micafe-pos/actions/runs/46086703865), para ese SHA exacto. El E2E Bodega y los demás pasos del job concluyeron exitosamente. Los cambios de esta revalidación aún no están cubiertos por ese CI.
- **Rutas públicas:** GET read-only a producción devuelve `/terminos` 200 con referencias tanto a Dusema como a Café Atrato; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` devuelven 404. Staging devuelve 200 para las cuatro rutas, con marca Dusema y `BORRADOR`, sin Café Atrato. App Hosting staging sirve `micafe-pos-build-2026-11-27-003` al 100 %. El término corregido de esta revisión sigue local hasta desplegar un candidato de staging; no se publicó en producción.
- **Omisión factual corregida en el borrador:** los términos ahora dicen expresamente que el POS no verifica edad ni bloquea ventas de bebidas alcohólicas, y que registrar una operación no prueba la verificación exigida en la venta. La formulación se contrastó con [Ley 124 de 1994, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=291), [Decreto 120 de 2010](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=38680) y [Ley 1801 de 2016, art. 38](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80538). Continúa siendo un borrador, no un concepto ni aprobación jurídica.
- **Versionado:** el bundle candidato quedó en `dusema-pos-2026-11-v0.7`; conserva `public/legal/v0.6/` intacta y crea cuatro fuentes/assets v0.7. Términos v0.7 registra SHA-256 UTF-8/LF `efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b`. La prueba automatizada compara fuente, asset y hash. `npm run test:legal-bundle` pasó 1/1 y `npx tsc --noEmit` terminó con código 0.
- **Validación local posterior:** con `npm run build` y `npm run start -- -p 3011`, las cuatro páginas públicas v0.7 devolvieron 200 con Dusema/BORRADOR y sin Café Atrato; los cuatro assets v0.7 y los cuatro assets históricos v0.6 devolvieron 200. La suite del bundle pasó 2/2, incluyendo los hashes históricos v0.6; TypeScript y build pasaron. Esto es validación local, no publicación en staging.
- **Smoke autenticado:** repetición Playwright de staging terminó **2/2 PASS en 34.6 s**. Cubrió acceso Backoffice, registro/respuesta/cierre sintético, aislamiento A/B, autorización negativa y limpieza verificada. No usó sesión de Diana ni datos de producción. Detalle en [evidencia de smoke](evidence/SMOKE-VISUAL-PRIVACIDAD-STAGING-2026-11-27.md).
- **IAM de producción:** nueva consulta read-only confirma 117/117 Functions activas en `us-central1`, todas con `882525811433-compute@developer.gserviceaccount.com`; solo `consultarEstadoLegalTenant` y `aceptarDocumentosLegalesTenant` están activas del grupo legal productivo. La cuenta Compute tiene binding de proyecto `roles/editor`. La política del proyecto muestra otros dos miembros con el mismo rol —Cloud Services y App Engine default— cuyo uso no está atribuido. Seis jobs Scheduler tienen OIDC configurado con la Compute predeterminada. Staging conserva 68 Functions; las cuatro legales usan `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`. No se evaluaron permisos heredados o resource-level en forma integral ni se cambió IAM.
- **Exportación/supresión:** se mantiene la evidencia sintética y Emulator; no se verificaron contacto representante ni canal externo, no existe autorización real verificable y no se generó/entregó exportación de datos reales. No se suprimieron datos reales. Firestore declara retención de backups de 35 días, con 35/35 `READY` y expiraciones próximas entre `2026-11-28T09:42:31Z` y `2027-01-01T14:08:10Z`; Storage productivo declara soft delete de siete días y Logging global retiene `_Default` 30 días / `_Required` 400 días. No se comprobó la purga efectiva al vencimiento, el contenido de logs o un ciclo de restore; el bucket default de Firebase Storage no está presente en staging. ADR-SAAS-109 sigue `Propuesto`; no se añadió la facultad privilegiada.

### Estado de los documentos del bundle

| Etapa | Estado comprobado |
| --- | --- |
| Redactado | Sí, cuatro documentos v0.7 en borrador; se corrigió una limitación del producto en los términos. Los assets v0.6 previos se preservaron. |
| Validado técnicamente | Parcial: hash/fuente/assets v0.7 del candidato verificados; staging aún sirve un build con rutas públicas v0.6 anteriores. |
| Aprobado jurídicamente y factual | No. |
| Publicado en producción | No; producción sigue con la página heredada y tres rutas 404. |
| Aceptación habilitada para v0.6 | No: bundle `PREPARACION` y documentos `BORRADOR`. |

**Dictamen vigente: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.** El CI verde registrado cubre `5b544e7`, anterior a este checkpoint; el nuevo commit y su CI exacta aún no existen. Además siguen sin revisión humana, aprobación jurídica/factual, ADR-SAAS-109 aprobado, canal/contacto exportador real, certificación de salida/supresión y cierre de IAM productivo.

Evidencia operativa detallada de esta relectura: [CI, rutas, smoke e IAM — 2026-11-28](evidence/REVALIDACION-PR706-IAM-RUTAS-2026-11-28.md).

## Revalidación posterior — 2026-11-28

- PR #706 está en `f853104faee0fc4541c300890c2d9d918da58f5e`, basado en
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; el run CI
  `46105507227` de ese SHA está en curso y no tiene fallo confirmado. El PR
  sigue abierto/en draft y sin review registrada.
- El smoke autenticado sintético de Backoffice en staging pasó 2/2. La nueva
  cobertura de exportación sintética también pasó 51/51 unitarias y 2/2 con
  Firestore+Storage Emulator; CI ahora inicia ambos emuladores para esa suite.
- La revalidación posterior confirma que staging sirve `build-2026-11-28-001`
  al 100 % y que las cuatro rutas públicas y cuatro assets v0.7 están
  disponibles, con contenido/hash canónico coincidente, Dusema y `BORRADOR`.
  Esto supersede la observación histórica anterior de que staging aún servía
  v0.6.
- Producción sigue sin cambios: `/terminos` contiene referencias heredadas a
  Café Atrato; las otras tres rutas legales dan 404. Los documentos siguen en
  `BORRADOR`/`PREPARACION`; exportación y supresión reales no están certificadas.
- **Dictamen vigente: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.**
  Persisten aprobación factual/jurídica, el gate de ADR-SAAS-109, contacto y
  canal verificables para exportar, certificación real de supresión/conservación,
  IAM productivo y review final. Detalle en la
  [revalidación operativa](evidence/REVALIDACION-PR706-IAM-RUTAS-2026-11-28.md).

## Reconciliación de plazo de reclamos y bundle v0.8 — 2026-11-28

- El responsable aprobó ADR-SAAS-110, alternativa A: para casos nuevos, el
  vencimiento de respuesta se ancla a la recepción verificable del reclamo
  completo. Los expedientes históricos conservan sus vencimientos; el origen de
  cinco días para pedir subsanación no cambia.
- La implementación en la rama de #706 escribe `plazoRespuestaVersion` y
  mantiene una ruta legacy explícita. El Emulator cubrió un caso que se completa
  30 días tras la recepción inicial y compatibilidad de expedientes antiguos.
- Se creó el bundle `dusema-pos-2026-11-v0.8` en `PREPARACION`; los cuatro
  documentos siguen `BORRADOR`. Los assets v0.7 no se modificaron. El hash de
  las fuentes, los assets v0.8 y el catálogo se verifica con pruebas.
- Las pruebas locales de aceptación legal, Emulator, bundle, TypeScript y builds
  pasaron. La CI del nuevo HEAD debe confirmarse después del push.
- En el momento de esta comprobación local, v0.8 aún no se había desplegado.
  Después se publicó solo en staging; el release productivo legal sigue
  bloqueado por aprobación factual/jurídica, operación de exportación y
  supresión real, IAM, revisión integral y otros gates ya registrados. La
  evidencia del rollout posterior está en
  `evidence/REVALIDACION-GATES-PR706-2026-11-28.md`.

## Revalidación autónoma — 2026-11-28 07:32 UTC

La lectura actual confirma que el último rollout de staging es `SUCCEEDED` y
sirve el commit `485970a` al 100 %; el E2E autenticado sintético pasó 2/2 y el
bundle v0.8 coincide con sus hashes canónicos tras normalizar CRLF a LF. El PR
#706 sigue abierto/en draft, sin review; el CI del HEAD está verde (129/129). En
producción continúa el build `2026-11-24-002`, `/terminos` muestra Café Atrato y
las otras tres rutas responden 404. Las Functions de consultas/reclamos no
están en producción y 117 Functions usan la identidad Compute con
`roles/editor`. La nueva revisión de Storage encontró un ACL de objetos
`projectViewer` con UBLA desactivado; no demuestra acceso anónimo, pero requiere
preflight antes de certificar aislamiento. Ver
[revalidación operativa y de seguridad](evidence/REVALIDACION-CIERRE-2026-11-28-0732Z.md)
y [ADR-SAAS-111 propuesto](../../ADR-SAAS-111-acceso-acls-storage.md).

**Dictamen vigente: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.**
Los documentos siguen en borrador; continúan pendientes aprobación jurídica y
factual, verificación del contacto/canal, exportación y supresión reales,
revisión de ACL Storage e IAM productivo. La métrica confirma 20 accesos
históricos concedidos exclusivamente por ACL; el censo de 7 objetos activos no
halló grants públicos, pero no atribuye los accesos. Además, una sola cuenta
de usuario no presente en el IAM actual tiene grant directo `OWNER` en los 7
objetos activos; su identidad fue omitida y no se revocó. Ver
[revalidación ACL](evidence/REVALIDACION-ACL-STORAGE-2026-11-28-0758Z.md). El
proyecto no tiene ancestros Resource Manager ni configuración explícita de
Data Access audit logs para Storage. El ruleset activo de `main` exige cero
aprobaciones de GitHub; no hay review registrada, pero eso no es un gate formal.
La aprobación jurídica/factual de los documentos sigue pendiente.

## Revalidación final del candidato y rutas — 2026-11-28 08:54 UTC

- PR #706 continúa `OPEN/DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `565c4dc57ca9c7bc61ede1cdbb44c53a8d6c13d7`. El CI del SHA exacto, run `46126149854`, terminó `SUCCESS`; `Tipos y pruebas` reportó 129/129 pasos y `gh pr checks 706` confirmó `pass`. El estado de merge de GitHub es `CLEAN`, pero esto no cierra los gates jurídicos, factuales y operativos que siguen abajo.
- El smoke `npm run e2e:privacy:staging` pasó 2/2 en Chromium contra staging build `485970a`: tramitó un reclamo sintético completo, comprobó aislamiento entre tenants y recibió `403` para un operador sin facultad. Los fixtures, el usuario Auth y los registros sintéticos fueron retirados y la propia prueba comprobó su ausencia.
- GET anónimo revalidado en las cuatro rutas: staging devuelve `200` en `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`; todas muestran Dusema y `BORRADOR`. Producción devuelve `/terminos` `200` con contenido heredado de Café Atrato y `404` para las otras tres rutas. No se desplegó ni escribió en producción.
- ADR-SAAS-111 continúa `Propuesto`. El bucket productivo conserva los hallazgos de ACL registrados en la evidencia enlazada; en staging la lista del proyecto solo mostró buckets auxiliares de Functions y provisioning y no existe `micafe-pos-staging.firebasestorage.app`. Por eso no se probó la mitigación ACL/UBLA en bucket Firebase de staging. No se creó bucket ni se modificaron ACL, Rules o IAM.
- Los documentos v0.8 siguen en `PREPARACION/BORRADOR`, sin aprobación jurídica ni factual. Exportación/entrega con datos reales, supresión y conservación físicas, ciclo real de respaldos, canal de correo, Vercel comercial y mínimo privilegio IAM productivo siguen sin certificarse.

**Dictamen actualizado: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.** El check ahora está verde para el HEAD actual, pero CI no sustituye la resolución del grant `OWNER` no mapeado, la prueba de Storage que no puede ejecutarse sin bucket staging, ni las aprobaciones y verificaciones operativas pendientes. No se habilita la aceptación en producción ni se publican documentos definitivos.

## Corrección de versión del bundle v0.8 — 2026-11-28 09:39 UTC

- La fuente y el asset público de política v0.8 decían “esta versión 0.7” en
  conservación, pese a que el catálogo identifica ambos como v0.8. Se corrigió
  solo esa referencia; el contenido sustantivo, estado `BORRADOR`, fecha
  objetivo y assets v0.7 permanecen sin cambio.
- SHA-256 canónico UTF-8/LF de la política v0.8 y del asset correspondiente:
  `22e17b3fff7d6c4c55300585f74492780399ad56e2e5e49e9a8977afffe0c1b4`. La
  fuente, asset, catálogo y tabla de hashes de `REVISION-V0.8-2026-11-28.md`
  coinciden.
- `npm run test:legal-bundle`: 2/2 PASS; `git diff --check`: PASS. No hubo
  despliegue; la corrección queda pendiente del CI del commit y de validación
  factual/jurídica antes de cualquier publicación.

## Alineación de rótulos v0.8 — 2026-11-28 10:05 UTC

- Al cotejar el bundle con los cuatro assets v0.8, sus metadatos internos aún
  mostraban `BORRADOR 0.7`, aunque el catálogo los identifica como v0.8. Se
  alinearon los rótulos en las fuentes y los assets públicos v0.8. Los textos
  sustantivos no cambiaron y los assets históricos v0.7 permanecen intactos.
- Los hashes canónicos de los cuatro documentos fueron recalculados y quedan
  registrados en `REVISION-V0.8-2026-11-28.md`; fuente y asset coinciden. La
  prueba de bundle terminó 2/2 PASS y `git diff --check` pasó.
- No se desplegó esta corrección. El build de staging actualmente sirviendo es
  `micafe-pos-build-2026-11-28-002` (`485970a`); sigue pendiente el CI del nuevo
  SHA para crear un rollout staging exacto. Producción y aceptación siguen sin
  cambios.

## Rollout de rótulos v0.8 — 2026-11-28 10:41 UTC

- CI `46133603091` terminó `success`, 129/129 pasos. Se creó el rollout manual
  exacto para `3de251d6b3c704033b4de97d435ce4e33a4c1272` solo en
  `micafe-pos-staging/us-central1/micafe-pos`.
- `build-2026-11-28-003` quedó `SUCCEEDED`/`READY`; Cloud Run dirige 100 % del
  tráfico de staging a esa revisión. El build informa el SHA esperado.
- Las cuatro páginas públicas y los cuatro assets v0.8 responden 200. El texto
  conserva `BORRADOR`, las páginas muestran Dusema, los assets muestran el
  rótulo 0.8 y las huellas remotas coinciden con las locales.
- `npm run e2e:privacy:staging` terminó 2/2 PASS en 32.8 s con datos
  sintéticos. Producción no cambió y no hubo despliegues de Functions, Rules o
  IAM ni operaciones con datos reales.
- [Detalle y hashes del rollout](evidence/ROLLOUT-STAGING-LEGAL-PR706-3DE251D-2026-11-28.md).

## Revalidación de proyectos Vercel — 2026-11-28

- La consulta read-only del equipo encontró dos proyectos relevantes: `cafeatrato`
  y `saa-s-web`. El plan sigue en `Hobby`. `cafeatrato` conserva cuatro
  deployments `Production/READY`, sin creación Git, con SSO en las URLs
  muestreadas; su alias público devuelve 404. Esto no acredita expiración ni
  borrado de artefactos.
- `saa-s-web` es un proyecto separado, ligado al repositorio público
  `Glemynart/SaaS` (`apps/web`), con deployments Git habilitados y dominio
  `staging.dusema.com`. Su protección SSO excluye dominios personalizados;
  solicitudes anónimas de encabezados a `staging.dusema.com` y
  `saa-s-web-two.vercel.app` devolvieron HTTP 200 en solicitudes de encabezados;
  no se hizo revisión manual de la aplicación ni se probó acceso a datos privados.
- Un GET acotado al `/` del staging devolvió título de una app de gestión laboral,
  distinta de la UI POS. El escaneo automatizado del HTML inicial encontró cuatro
  patrones de correo en atributos href y ocho secuencias numéricas; los valores
  no se conservaron y no se clasificaron. No se determinó si esa app pertenece al
  servicio POS o procesa datos de sus clientes.
- El inventario paginado de previews contó 591 deployments (531 `READY`, 60
  `CANCELED`), con fechas observadas entre el 29-oct y el 17-nov. No se verificó
  expiración efectiva de cada artefacto. La retención configurada de 30 días y
  10 deployments se registró como configuración, no como purga observada.
- Los términos de Hobby incluyen uso de contenido para entrenamiento de IA, y
  el DPA publicado por Vercel aplica a clientes Pro/Enterprise, no a Hobby. No
  se verificó si datos de clientes transitan por `saa-s-web` ni la preferencia
  de entrenamiento de la cuenta; no se afirma que haya ocurrido uso o exposición.
- La política v0.8 en revisión distingue ahora el staging separado, el estado
  contractual de Hobby/DPA y el límite de que el flujo de datos al POS no fue
  verificado. Su hash canónico UTF-8/LF es
  `405c40f992b6c73bac87c8e03131bb244bfdb64f704094423cc2833ff96090f4`; el test
  `npm run test:legal-bundle` pasó 2/2 después de sincronizar el catálogo.
  Este contenido aún no está desplegado.
- Esto amplía y supersede el alcance de la entrada de la fila Vercel arriba,
  que solo cubría `cafeatrato`: no se ha resuelto la aptitud comercial del
  hosting Vercel de Dusema. La app de staging pertenece a otro repo/proyecto y
  no se ha demostrado un flujo de datos con el POS. No se cambió el plan, el proyecto, aliases ni
  dominios. Detalle: [revisión read-only de proyectos Vercel](evidence/VERCEL-PROYECTOS-DUSEMA-READONLY-2026-11-28.md).

**Estado Vercel: BLOQUEADO para declarar uso comercial regularizado.** La
alternativa sin costo adicional requiere retirar/migrar el staging activo a una
plataforma autorizada. No se interrumpió el proyecto separado ni se activó un
plan de pago.

## Revalidación final v0.9 y release — 2026-11-28 14:08 UTC

- PR #706 permanece `OPEN/DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD `47cfc44c51b8c0aa588def0ca9d87df6e34549d6`. El CI exacto `46150644886` terminó `SUCCESS`; `gh pr checks 706` reportó todos los checks en verde y sin pendientes. El PR no tiene review registrada. `mergeStateStatus=CLEAN` no sustituye los gates de producto, privacidad y aprobación jurídica.
- El artefacto E4.2 del run informa `PASS_WITH_CONDITIONAL_CAPABILITIES` / `READY_WITH_CONDITIONAL_CAPABILITIES`, `failedChecks=[]`. Sus condiciones son del readiness técnico general del MVP (fiscalidad si el tenant la solicita, hardware físico, funciones posteriores); no certifica revisión legal, exportación/supresión real ni release de documentos.
- El bundle vigente de trabajo es `dusema-pos-2026-11-v0.9`, `PREPARACION`; los cuatro documentos continúan `BORRADOR`. La versión v0.9 añadió los datos de contacto del prestador al anexo y preservó los assets históricos.
- App Hosting de staging: `build-2026-11-28-005` `READY`, rollout `SUCCEEDED`, 100 % del tráfico a la revisión. La fuente fue el commit validado `a9d0b5a826421b2d61f029276ce35bda39eeb9a6`; el HEAD final `47cfc44` solo añadió evidencia/README/matriz, sin cambiar el bundle desplegado. Las cuatro rutas públicas responden 200 y muestran `BORRADOR`; los cuatro hashes remotos de `/legal/v0.9/` coinciden con los locales. `npm run e2e:privacy:staging` terminó 2/2 PASS con operadores, reclamos y tenants sintéticos. Detalle en [evidencia del rollout v0.9](evidence/ROLLOUT-STAGING-LEGAL-PR706-A9D0B5A-2026-11-28.md).
- Verificación read-only de producción posterior al rollout: App Hosting sigue en `micafe-pos-build-2026-11-24-002`, 100 % del tráfico; `/terminos` responde 200 con el sitio heredado y `/privacidad`, `/aviso-autorizacion`, `/anexo-tratamiento` responden 404. No se desplegó ni escribió en producción.
- Revalidación Vercel: las cuatro URLs de deployments productivos de `cafeatrato` devuelven 302 a `/sso-api`; el preview de #706 da 404 y ya no aparece en la lista actual de deployments. No se borraron ni modificaron deployments. El proyecto separado `saa-s-web` permanece como riesgo contractual Hobby según la revisión read-only enlazada; no hay evidencia de que maneje datos del POS, pero tampoco se ha demostrado su relación con la operación comercial.
- Sigue pendiente la revisión jurídica colombiana de los cuatro documentos, validación de proveedores/contratos, prueba de canal desde una cuenta externa, aprobación/contacto verificable del tenant para salida real, exportación integral con archivos e históricos, supresión/conservación reales y cierre del ciclo de backups. ADR-SAAS-109 y ADR-SAAS-111 siguen `Propuesto`; la infraestructura productiva conserva gates separados de IAM/Storage. No se usaron datos reales para el smoke.

**Dictamen final de este corte: NO APROBADO PARA MERGE NI PARA RELEASE LEGAL PRODUCTIVO.** Aunque el CI exacto y staging están verdes, los documentos no están aprobados jurídicamente y permanecen marcados borrador; los gates de autorización/exportación, supresión, proveedores, IAM y ACL Storage tampoco están cerrados. Como producción sigue el `main` y su rollout no aparece deshabilitado, fusionar puede publicar el bundle borrador. No se cambió esa configuración ni se desplegó producción.

## Corrección del SHA auditado y CI — 2026-11-28 15:25 UTC

- La sección de las 14:08 UTC dejó registrado `47cfc44`, el HEAD de ese momento. El commit documental `542d27245e1b2aca4211f3f3be9b92c305a853d7` añadió después la revalidación de v0.9; no cambió código ni el bundle desplegado.
- El CI del SHA `542d272` falló en el primer intento en el E2E de Bodega cuando el helper de login terminó en `/admin/login`; la prueba siguiente falló en cascada al no encontrar el cliente que debía crear la primera. El rerun del job fallido, run [46153149281](https://github.com/Glemynart/micafe-pos/actions/runs/46153149281), intento 2, terminó `SUCCESS` (20m27s) y `gh pr checks 706` no muestra checks pendientes.
- La reproducción local con JDK 21 de `npm run e2e:bodega-u4-u5` terminó 12/12 PASS. Esto, junto con el rerun verde, verifica el HEAD actual. El primer fallo de autenticación no se reprodujo; su causa raíz no quedó confirmada, y el fallo de la prueba siguiente fue consecuencia de que la anterior no creó el cliente esperado.
- En la revalidación, PR #706 estaba `OPEN/DRAFT`, sin review, `mergeStateStatus=CLEAN`, sobre `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; el ref remoto de `main` coincidía con esa base. El PR permanece no aprobado para merge por los gates de release descritos arriba, aunque los checks técnicos estén verdes.
- Esta revalidación no desplegó ni escribió en producción. El estado de producción y la evidencia de staging siguen siendo los consignados en la sección de las 14:08 UTC; este cambio es solo la corrección del registro de CI/SHA.
