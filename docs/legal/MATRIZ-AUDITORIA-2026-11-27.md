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
- El CI remoto `46011711664` terminó `success` sobre el HEAD previo `6e55b1d`; el código `70e5088` aún requiere push y su propio CI. Esta corrección no se ha desplegado a staging o producción y no altera ni cierra el pendiente de revisión jurídica.
