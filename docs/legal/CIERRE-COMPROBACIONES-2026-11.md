# Cierre de comprobaciones accesibles — 2026-11-24

Estado: **COMPROBACIONES DE LECTURA REALIZADAS; NO LISTO PARA EXIGIBILIDAD**.
No es dictamen jurídico integral. No se ejecutó exportación de datos, borrado,
despliegue, aceptación de acuerdos o cambio de plan.

## 1. Contratos aplicables: resultados

El prestador declaró en este chat: **Gmail personal** y **términos online de
Google/Firebase, sin contrato firmado aparte**. Son declaraciones del titular,
no fechas de aceptación certificadas por API. No exigir una firma manuscrita
para reconocer un acuerdo online ni fingir que se leyó un contrato privado.

| Servicio usado | Marco online identificado | Resultado |
|---|---|---|
| Firestore, Functions, Storage, App Hosting y Authentication | Términos Firebase remiten a Google Cloud Terms y términos específicos; Cloud DPA incorporado | Régimen identificado mediante tabla oficial vigente consultada y declaración del prestador. No usar el DPA Firebase como único instrumento para estos servicios. |
| Cloud Messaging | Términos Google APIs y Firebase Data Processing and Security Terms según tabla oficial | Régimen identificado; no equipararlo automáticamente con Auth o ubicación de Firestore. |
| Gmail personal | Términos generales, condiciones del servicio y política Google aplicables al país/cuenta | Tipo de cuenta confirmado. No hay evidencia de DPA Workspace contratado. No declarar ilegal su uso por ser Gmail, ni ofrecer las garantías de Workspace. Revisar finalidad/rol de cada envío y minimizar datos. |
| Vercel | Equipo Hobby; DPA publicado con alcance Pro/Enterprise | Compatibilidad del uso comercial y cobertura pretendida siguen sin acreditar. No se resuelve escribiendo una cláusula del cliente. |
| GitHub | Repositorio público, titular tipo User; instrumento público DPA identificado | No introducir expedientes o exportaciones de clientes en Git. La existencia del DPA público no acredita por sí sola cobertura de la cuenta/productos. |

Fuentes oficiales consultadas:

- [Términos Firebase](https://firebase.google.com/terms), versión publicada
  2026-09-24: tabla por servicio. [Privacidad Firebase](https://firebase.google.com/support/privacy),
  actualizada 2026-11-16, confirma distinción entre términos de tratamiento.
- [Google Cloud Terms](https://cloud.google.com/terms/), protección de datos y
  términos incorporados; [Cloud DPA](https://cloud.google.com/terms/data-processing-addendum).
- [FAQ Firebase](https://firebase.google.com/support/faq#projects-accounts): la
  aceptación es por cuenta Google, no por proyecto; la consola es el mecanismo
  documentado de aceptación. No afirmar que el billing o un recurso prueban fecha
  y versión. Si hace falta constancia adicional, observar la consola con la cuenta
  del titular sin aceptar nuevos términos en esta auditoría.
- [Google Privacy](https://policies.google.com/privacy?hl=es): versión consultada
  2026-10-16. La apertura de los términos generales seleccionó Brasil por ubicación
  de la consulta; el intento de forzar Colombia no fue accesible. No se certifican
  con esa página las condiciones regionales de la cuenta colombiana.
- [Vercel DPA](https://vercel.com/legal/dpa) y [Terms](https://vercel.com/legal/terms).

**Recomendación:** mantener Google/App Hosting; limitar Gmail a recepción de
solicitudes y comunicaciones mínimas, sin dumps o credenciales. No contratar
Workspace por inferencia. Vercel ya no recibe Analytics del código productivo ni
crea previews Git automáticos; aún requiere resolver la aptitud contractual de
los previews históricos y del plan para uso comercial. Las obligaciones colombianas
responsable/encargado y la circulación internacional se revisan por tratamiento;
no se certifican solo por usar un proveedor conocido.

## 2. Conservación efectiva: consultas remotas de metadatos

| Recurso | Configuración observada | Consecuencia para los textos |
|---|---|---|
| Backup Firestore | Diario, 35 días; snapshots recientes READY, ya documentados | Solo cubre esos backups. No es plazo de purga de todos los sistemas. |
| TTL Firestore `(default)` | Lista de políticas vacía | No prometer vencimiento automático de documentos por TTL. No prueba ausencia de todo borrado manual o de aplicación. |
| Storage `micafe-pos.firebasestorage.app` | Soft delete 604800 segundos (7 días) | Un objeto borrado puede seguir recuperable durante ese periodo. No equivale a borrado físico inmediato. |
| Storage, respuesta raw | No se devolvieron `versioning`, `lifecycle` o `retentionPolicy` | No se observó política de ciclo de vida ni retención en esa respuesta. Registrar ausencia de configuración, no inventar borrado programado. |
| Logging global `_Default` | 30 días | El plazo de 90 días propuesto no es configuración actual. |
| Logging global `_Required` | 400 días | Tratar aparte los logs obligatorios del proveedor. No prometer 90 días para todos los logs. |

Las consultas de Logging se limitaron a `global`; no certifican todos los buckets,
sinks, destinos regionales o copias posibles del proyecto. Las regiones y ciclos
de almacenamiento no determinan por sí solos todas las transmisiones internacionales.
Las cláusulas de eliminación de Google describen otros ciclos internos bajo sus
supuestos; no convertir el schedule Firestore en promesa global.

## 3. Eliminación en código y navegador

- `transicionarEmpresa`, en `functions/src/suscripciones/service.ts`, cambia
  estado/revisión y revoca sesiones en los casos previstos; no borra físicamente
  el árbol del negocio. Estado `eliminada` no prueba supresión de datos.
- `lib/clientes-service.ts` y `lib/productos-service.ts`: «eliminar» desactiva.
  Tampoco acredita una supresión solicitada por un titular.
- `lib/firebase.ts`: caché persistente. `lib/auth-service.ts`: logout cierra
  Firebase y retira token FCM de forma best-effort; no ejecuta una limpieza
  explícita de IndexedDB en la implementación inspeccionada.
- Los schedules inspeccionados en `functions/src/index.ts` reconcilian soporte,
  claims, auditoría, ventas y vencimientos; no se verificó aquí una purga integral
  del tenant. No inferirla por nombres de lifecycle.

**Resultado:** no se puede prometer todavía supresión integral en 60 días como
capacidad ejecutable. Hace falta procedimiento de clasificación/conservación,
ejecución autorizada por dominio y verificación, sin romper ledger y evidencias
legales. La política propuesta no modifica esas invariantes ni las supersede.

## 4. Cobertura de exportación: comprobación real

Se consultó únicamente `documents:listCollectionIds`, operación de metadatos de
lectura aunque use POST. Paginación agotada; se observaron **48 colecciones raíz**.
No se leyó contenido de clientes ni se descargaron archivos.

La lista histórica MT-U3 cubre 25 colecciones y no es un exportador. Entre las
raíces reales adicionales están `presentaciones_producto`, `configuraciones`,
`empresas`, `membresias`, `suscripciones`, `ofertas_comerciales_tenant` y datos
internos que no deben entregarse indiscriminadamente.

Exclusiones obligatorias observables por nombre/dominio: `credenciales_operativas`,
`restablecimientos_credencial`, `reservas_codigos_operativos`,
`bootstrap_identidades_owner`, `saas_operadores` y metadatos de idempotencia.
Una lista de exclusión no sustituye allowlists de campos y autorización.

Las raíces FIFO/control y `proveedores` no figuraron en esa respuesta. Eso no
certifica que no haya información relacionada en otras rutas, snapshots o
subcolecciones; tampoco autoriza decir que todos los módulos se han usado.
La lectura no inspeccionó subcolecciones de cada tenant. El código confirma
abonos/compromisos bajo ventas y agenda/pedidos bajo empresas, por lo que exportar
solo raíces perdería información.

**Resultado:** el exportador local de ADR-SAAS-100 está implementado y cuenta con
pruebas sintéticas, incluida la clasificación de las 48 raíces observadas. No se
ha realizado exportación real ni se han verificado payloads históricos, referencias,
subcolecciones y consistencia de `readTime` contra una entrega de producción;
`productionExportCertified=false`. No se necesita extraer datos de Diana para
seguir fortaleciendo las pruebas con datos sintéticos.

## 5. Decisión operativa resultante

Las comprobaciones ya no dependen de una duda genérica sobre proveedores:

1. Google online y Gmail personal están identificados por declaración y fuentes.
2. Vercel Hobby permanece como asunto contractual; el flujo Git automático está detenido.
3. Exportación y supresión tienen una base local probada con datos sintéticos,
   pero no están certificadas ni habilitadas para operaciones reales.
4. Plazos comerciales de soporte/salida y matriz de conservación siguen propuestos;
   aprobarlos no equivale a que su ejecución esté implementada.

No repetir una auditoría general ni exigir una aceptación ficticia del cliente.
ADR-SAAS-100 y ADR-SAAS-099 ya fueron aceptados para implementación controlada;
sus diseños no equivalen a certificación, despliegue ni exigibilidad. El PR
#706 contiene la aceptación legal versionada y sus recibos; sigue en borrador y no
está integrado ni desplegado en producción. App Hosting de staging sí recibió el
candidato `6e63c172d4cba7cc68c6f756148c84a79589e44e`; su smoke y límites se registran
abajo. El PR #704 ya está integrado en `main`; detuvo nuevos
despliegues Git de Vercel y retiró Analytics, sin borrar previews históricos.
Antes de publicación/exigibilidad siguen pendientes la certificación de
exportación/supresión para casos reales, resolver el uso comercial de Vercel y la
aprobación jurídica final de los textos frente al tratamiento efectivo. Ningún
resultado de este informe acredita legalidad integral, aceptación de Diana ni un
consentimiento retroactivo.

## Actualización de staging — 2026-11-25 UTC

Esta evidencia posterior supersede solo el estado del corte de staging descrito
en la matriz del 2026-11-24. No cambia `main`, el estado PREPARACION ni los gates
de producción.

- Candidato verificado: `6e63c172d4cba7cc68c6f756148c84a79589e44e`. PR #706 continúa
  abierto en borrador; el check CI del SHA exacto terminó `SUCCESS`.
- App Hosting `micafe-pos-staging`: rollout creado expresamente desde ese SHA y
  finalizado con éxito. Cloud Run confirma `micafe-pos-build-2026-11-25-001`
  `Ready=True`, latest-created/latest-ready, y 100 % del tráfico; digest
  `sha256:0a4539c6f455e005c6ac83106f7230313762012160a3a6f7ff3f07a7a1a77282`.
  El backend App Hosting ya no estaba reconciliando al verificarlo. Producción no
  recibió este rollout.
- Las callables `tramitarConsultaPrivacidadSaas` y
  `cambiarFacultadesOperadorSaas` responden `401 UNAUTHENTICATED` ante una petición
  sin sesión. Ambas están `ACTIVE`, usan Node.js 22 y la cuenta de ejecución
  predeterminada de Compute. La consulta pertenece a `saas-legal` (hash de
  despliegue `30d4b0a39eb5dc37e28f8fe49b6c046fcc52ed1c`, URI
  `https://tramitarconsultaprivacidadsaas-qn7mt3dyyq-uc.a.run.app`); la gestión de
  facultades pertenece a `saas-auth` (hash `68140cfb0d60432a2f3c181e4827a5a98db4d760`,
  URI `https://cambiarfacultadesoperadorsaas-qn7mt3dyyq-uc.a.run.app`). El resultado
  acredita disponibilidad y rechazo anónimo, no funcionamiento autenticado.
- La pantalla pública de los cuatro documentos (`/terminos`, `/privacidad`,
  `/aviso-autorizacion`, `/anexo-tratamiento`) muestra versión 0.2 y “Borrador · no
  exigible”. No hay aceptación habilitada ni se registró consentimiento.
- La sesión integrada autenticada pudo abrir `/backoffice/consultas-privacidad`,
  pero recibió “No tienes permiso para tramitar consultas de privacidad”. Esto
  confirma denegación para esa identidad; no se concedieron facultades ni se
  consultaron o modificaron expedientes.
- El despliegue de Functions informó que Firebase CLI generaba/aseguraba identidades
  de servicio de Pub/Sub y Eventarc. Las lecturas IAM de descripción fallaron por
  falta de `iam.serviceAccounts.get` y las consultas disponibles de auditoría no
  devolvieron eventos. Por tanto, no se puede distinguir con la evidencia accesible
  si las identidades fueron nuevas o preexistentes. No se modificó IAM para
  investigarlo; queda documentado como límite de evidencia, no como incidente
  resuelto ni como prueba de ausencia de cambios.

**Resultado del smoke:** staging muestra los borradores y las protecciones de
autorización esperadas. Sigue pendiente un recorrido autenticado positivo para
consultas con un operador de pruebas identificado y facultado de forma explícita;
no debe otorgarse la capacidad a la sesión actual por defecto. La recepción externa
de correo, exportación/supresión real, vigencia/aprobación de textos, condiciones de
proveedores y el preflight productivo continúan abiertos. Este corte no autoriza
publicar los textos ni desplegar a producción.

## Actualización comparativa de producción y Vercel — 2026-11-25 UTC

Esta comprobación es de solo lectura y no altera el corte anterior.

### PR y aplicación

- PR #706 continúa `OPEN` y `DRAFT`. A las 06:35 UTC el HEAD observado era
  `06c333b82e77fcb5587ff7d58054710532321838`, con base `main` en
  `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. `Tipos y pruebas` terminó
  `SUCCESS` (128 pasos); no había revisiones de código enviadas. El único
  comentario era el aviso de preview de Vercel del 2026-11-24. `CLEAN` describe
  la relación GitHub con la base; no equivale a aprobación jurídica ni a
  autorización de publicación.
- App Hosting de producción sirve `build-2026-11-24-002`, `READY`, con 100 % del
  tráfico. La consulta del recurso Build confirmó que su `source.codebase.uri`
  apunta a `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, integrado mediante #704;
  no corresponde al candidato #706. En staging, `build-2026-11-25-001` tiene
  rollout `SUCCEEDED`, 100 % del tráfico y origen
  `6e63c172d4cba7cc68c6f756148c84a79589e44e`. No hay rollout de #706 a producción.
- En staging, las cuatro rutas legales responden HTTP 200 y muestran versión
  0.2 como borrador no exigible. En producción, `/terminos` responde HTTP 200,
  pero no muestra esa versión ni el marcador de borrador; las otras tres rutas
  (`/privacidad`, `/aviso-autorizacion`, `/anexo-tratamiento`) responden 404.
  Por tanto, la vista productiva no contiene el conjunto legal actual.
- La lista de Functions de producción contiene las funciones existentes de
  aceptación/consulta de estado y una versión anterior de
  `cambiarFacultadesOperadorSaas`; no contiene
  `tramitarConsultaPrivacidadSaas` ni `tramitarReclamoPrivacidadSaas`. Staging
  sí las tiene activas. No se desplegó este candidato a producción.

### Rules

La consulta de solo lectura al API de Firebase Rules devolvió HTTP 403 para
`micafe-pos` y `micafe-pos-staging` con la identidad disponible. No se pudo
revalidar qué Ruleset está activo en este momento. El 403 no demuestra que falten
Rules ni que estén incorrectas; la verificación previa documentada no se presenta
como comprobación actual. No se amplió IAM ni se publicó Rules.

### Vercel

- `main` conserva `git.deploymentEnabled=false`, integrado en PR #704 el
  2026-11-24 a las 05:20:32 UTC. La consulta paginada encontró 110 despliegues
  históricos: 106 previews y 4 de producción, creados entre el 14 de septiembre
  y el 24 de noviembre. El preview más reciente fue creado el 24 de noviembre a
  las 05:12:06 UTC, antes de integrar #704; no apareció uno posterior.
- Tres URLs de preview probadas sin sesión respondieron HTTP 302. El proyecto
  informa protección SSO `all_except_custom_domains`; las URLs de preview probadas
  requieren autenticación. No se eliminaron despliegues: la protección observada
  reduce exposición y la lista incluye evidencia histórica de PRs anteriores.
- Los cuatro despliegues productivos de Vercel siguen `READY` y el alias
  `cafeatrato.vercel.app` responde HTTP 200. Es distinto de las URLs de preview.
  El inventario de cuenta previamente consultado registra el equipo en Hobby
  activo; la consulta actual de despliegues no mostró el plan. Los términos de
  Vercel vigentes desde el 19 de octubre de 2026 limitan Hobby al uso personal o
  no comercial, y su DPA publicado aplica a clientes Pro y Enterprise. No queda
  acreditada la aptitud de este alias productivo para el uso comercial de Dusema
  POS. No se pausó el sitio ni se cambió el plan por el posible impacto público y
  de facturación.

Fuentes primarias actuales consultadas: [términos de Vercel, sección Hobby](https://vercel.com/legal/terms)
y [DPA de Vercel](https://vercel.com/legal/dpa). La publicación de previews y la
existencia de una protección SSO no resuelven la restricción de uso comercial del
plan.

**Resultado del corte:** producción no está certificada para esta liberación.
Quedan bloqueantes la publicación/aprobación de los textos, la comprobación
actual de Rules con una identidad autorizada, las nuevas Functions y la interfaz
del PR #706, además de resolver el uso comercial del alias productivo de Vercel.
La exportación y supresión reales tampoco están certificadas. No se activa
aceptación ni se declara cumplimiento legal integral.

## Revalidación del candidato y rutas — 2026-11-25 07:06 UTC

- `main` remoto sigue en `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. PR #706 está
  abierto y en borrador, HEAD `f26f8b6c1fc29a37cddddfa9365f7c15dfee0a01`, base
  `main`, sin reviews ni decisión de aprobación. El run `45562213980` del SHA
  exacto terminó `SUCCESS`; el PR continúa abierto y no se integró.
- App Hosting staging mantiene 100 % del tráfico en
  `build-2026-11-25-001`. Su rollout exacto está `SUCCEEDED`, el build `READY`, y
  `source.codebase.commit` es `6e63c172d4cba7cc68c6f756148c84a79589e44e`; no es
  el HEAD actual de #706. Producción permanece 100 % en
  `build-2026-11-24-002`, `READY`, con origen
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- Las Functions de privacidad y gobierno de facultades están `ACTIVE`, Node.js 22,
  en staging. En producción siguen ausentes `tramitarConsultaPrivacidadSaas` y
  `tramitarReclamoPrivacidadSaas`; la función productiva de facultades es una
  revisión anterior. No se desplegó ninguna Function en este corte.
- La lectura de releases de Firebase Rules devolvió `403` en ambos proyectos con
  la identidad disponible. No se puede certificar qué Ruleset está activo hoy;
  tampoco se amplió IAM ni se publicó Rules para superar la denegación.
- La página pública de staging `/privacidad` responde `200` y contiene “Borrador”.
  `/backoffice/operadores` entrega el shell de la aplicación (`200` sin sesión),
  lo cual no prueba la identidad ni los permisos de una sesión. El smoke positivo
  de la bandeja sigue sin ejecutarse. La identidad probada anteriormente fue
  denegada por carecer de la facultad; no se ha concedido la nueva facultad a
  ningún operador.
- Revalidación de las cuatro rutas: en staging `/terminos`, `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento` responden `200` y muestran
  “Borrador”/“no exigible”. En producción `/terminos` responde `200` con el título
  “Términos y Privacidad - Café Atrato”; las otras tres rutas responden `404`.
  El conjunto legal actual no está publicado en producción.
- El recorrido de gobierno requiere un actor distinto del objetivo con
  `OPERADORES_GOBERNAR`, y la cuenta objetivo debe existir en Firebase Auth. La
  pantalla solicita el UID global; para editar facultades reemplaza el conjunto
  completo, así que debe conservarse `PLATAFORMA_CONSULTAR` y las facultades
  existentes, agregando solo `PRIVACIDAD_CONSULTAS_TRAMITAR`. Guardar incrementa
  la versión de autorización y revoca los refresh tokens del objetivo. No se hizo
  ningún cambio de autorización.
- `https://pos.dusema.com/` responde `307` a `/pos`; `/pos` responde `200` con
  título “Dusema POS”. El alias separado `cafeatrato.vercel.app` sigue respondiendo
  `200` con título “POS Empresarial”. No se cambió ese alias ni se borró o pausó
  ningún deployment de Vercel.

El CI verde solo certifica ese commit para CI; no certifica Rules, permisos,
exportación real, supresión, aprobación jurídica ni publicación en producción.
La actualización de `REVISION-2026-11.md` incorpora la Ley 2573/2026: su vigencia
general comenzó el 19 de noviembre de 2026; el alcance de “establecimientos
comerciales con esta competencia” sigue sin definición en el texto y la SFC
remitió las preguntas de alcance a la SIC. No se atribuye su cumplimiento a
Dusema ni a todos los negocios clientes sin análisis jurídico por rol.

## Revisión del CI y de las capacidades del trámite — 2026-11-25 08:47 UTC

- El run `45575219149` terminó `SUCCESS` para el HEAD `6ba86adfd276bbb8cf852f2e853ab203cb0916c3` a las 08:47:40 UTC. No hubo pasos fallidos ni omitidos; pasaron las suites legales, Rules, E2E y E4.1. Esto acredita CI en Emulator y repositorio, no producción.
- El artefacto E4.2 `e4-02-1795596454706` declara `G-MVP-01/M4/E4.2` y `READY_WITH_CONDITIONAL_CAPABILITIES`. Su campo `commit` es el merge sintético normal de GitHub `6f585be12daa306a7cc4821305f9633e6545f30f`, con padres `main@aa1c4fe` y el HEAD del PR; no es una discrepancia de código. La discrepancia es de jerarquía: el Goal activo es `G-SAAS-02/M2/E2.2`, pero `scripts/release/e4-02-release-readiness.mjs` fija `G-MVP-01` y hace pasar `E4.2-GOAL-STRUCTURE` buscando títulos y estado en la sección histórica del Goal. Ese resultado no certifica la preparación del Goal activo ni el release legal de #706. No se modificó el runner porque esa corrección de alcance/gobernanza es independiente del PR E2.2.
- El flujo de reclamos permite registrar una recepción incompleta y calcula el plazo de cinco días, pero no tiene una acción/campo que deje constancia en Backoffice de la solicitud de subsanación enviada. El procedimiento exige conservar tal constancia; por ahora debe quedar en un expediente externo restringido y ese canal no se ha probado. La recepción completa, anotación, respuesta y cierre sí tienen acciones del caso, cubiertas por las pruebas automatizadas. No se certifica el trámite integral de reclamos hasta comprobar el canal externo o aprobar una extensión del flujo con su decisión de persistencia.

**Resultado:** CI del candidato aprobado; E4.2 no aplicable como certificación del Goal activo; operación integral de reclamos, smoke autenticado, Rules productivas, exportación/supresión reales, revisión factual/jurídica y producción siguen pendientes. El estado del PR continúa **NO APROBADO PARA MERGE**.

## Revalidación de Vercel — 2026-11-25 09:44 UTC

- La consulta autenticada de solo lectura a la API de Vercel confirmó que el
  equipo `glemynarts-projects` está en el plan `hobby` activo. El proyecto
  `cafeatrato` corresponde al repositorio público `Glemynart/micafe-pos`. Los
  términos de Vercel vigentes desde el 19 de octubre de 2026 reservan Hobby al
  uso personal o no comercial; la guía de uso justo requiere Pro o Enterprise
  para uso comercial. No hay evidencia de que el uso de Vercel por este SaaS
  cumpla esa condición.
- El alias público `cafeatrato.vercel.app` responde `HTTP 200` y apunta al
  deployment de producción `e8ce92d235a181248d9dc162efc55c3ad1cef4c2`, creado
  el 6 de octubre de 2026. Ese SHA es anterior al `main` y al release candidato
  actuales. No se pausó el proyecto, retiró el alias ni cambió el plan: hacerlo
  podría afectar una URL pública o generar cargos.
- La configuración consultada informa protección SSO `all_except_custom_domains`
  y protección de forks habilitada. Tres muestras de URL de preview —el preview
  más reciente de #706 (`ff422718`), uno de #705 y uno de Dependabot del 14 de
  septiembre— respondieron `HTTP 302` a Vercel SSO sin sesión. Esto confirma la
  protección de esas muestras, no de cada deployment histórico. El alias
  productivo `cafeatrato.vercel.app` respondió `HTTP 200`.
- La API del proyecto informa la política heredada del equipo: 30 días para
  previews, producción, cancelados y fallidos, con al menos 10 deployments
  conservados (`expirationSettings` del proyecto es nulo).
  Aun así, el inventario contiene 110 deployments (106 previews y 4 de
  producción), desde el 14 de septiembre hasta el 24 de noviembre; el más
  antiguo continúa listado y redirige a SSO. La política de Vercel contempla
  excepciones de retención, por lo que no se deduce una falla ni una eliminación
  automática completa de esa configuración. No se borró ningún deployment y la
  limpieza/expiración efectiva no queda certificada.
- Vercel documenta que Standard Protection protege previews y URLs de
  deployment, mientras los dominios de producción permanecen públicos. Las
  previews probadas están protegidas; la protección no resuelve la aptitud
  contractual del plan Hobby ni la exposición del alias productivo.

Fuentes oficiales: [Términos de Vercel](https://vercel.com/legal/terms),
[uso justo de Hobby](https://vercel.com/docs/limits/fair-use-guidelines),
[protección de deployments](https://vercel.com/docs/deployment-protection) y
[retención de deployments](https://vercel.com/docs/deployment-retention).

**Bloqueo Vercel:** antes de tratar el hosting Vercel de este SaaS como apto para
uso comercial se debe resolver el plan Hobby. La alternativa técnica es retirar
el uso comercial de Vercel y alojar las superficies necesarias en un servicio
con condiciones adecuadas; la alternativa contractual requiere que el titular
decida y habilite un plan comercial, pues puede generar cargos. Ninguna de estas
acciones se ejecutó en esta comprobación.

## Revalidación de App Hosting, rutas legales y CI — 2026-11-25 UTC

- La consulta read-only del API de App Hosting confirmó producción en
  `build-2026-11-24-002`, rollout `SUCCEEDED`, estado `READY` y 100 % del tráfico;
  su fuente es `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. Staging sirve
  `build-2026-11-25-001`, rollout `SUCCEEDED`, estado `READY` y 100 % del tráfico,
  con fuente `6e63c172d4cba7cc68c6f756148c84a79589e44e`. No se encontró rollout
  del HEAD actual de #706 en producción.
- La comprobación HTTP repetida obtuvo en staging `200` para las cuatro rutas
  (`/terminos`, `/privacidad`, `/aviso-autorizacion`, `/anexo-tratamiento`);
  todas muestran la versión 0.2 como borrador. En `pos.dusema.com`, `/terminos`
  devuelve `200` con la página anterior de Café Atrato y sin la marca de borrador;
  las otras tres rutas devuelven `404`. Esta diferencia se mantiene y bloquea
  publicar o exigir el conjunto legal vigente.
- PR #706 continúa `OPEN`, `DRAFT` y `BLOCKED`, con HEAD
  `243b4b3e768bcf8680cd3249059fdc44015c10c1`, sin decisión de revisión registrada.
  El run `45588855887` del HEAD exacto seguía `in_progress` a las 09:59 UTC, con
  pasos E2E y certificaciones Emulator pendientes; no se declara CI verde para
  este SHA.
- No se concedió la facultad `PRIVACIDAD_CONSULTAS_TRAMITAR`. La sesión autenticada
  previamente observada en staging fue denegada por falta de esa facultad. El
  recorrido autenticado positivo sigue pendiente; para concederla, un operador
  distinto del destinatario debe usar la gestión oficial y tener
  `OPERADORES_GOBERNAR`. No se ampliaron permisos ni se modificaron datos.

**Resultado:** este corte actualiza el estado operativo, pero no cambia las
conclusiones de exigibilidad, certificación, revisión jurídica, exportación ni
supresión. No se integró ni se desplegó #706; no se aceptaron documentos ni se
escribió en producción.

## Actualización normativa — Ley 2573 y Carta Circular 77 — 2026-11-25

- El texto oficial de la Ley 2573 fija vigencia general seis meses después de su
  promulgación del 19 de mayo de 2026; por ello inició el 19 de noviembre de 2026.
  Los parágrafos 1 y 2 del artículo 5 rigen desde la promulgación.
- La SFC publicó el 18 de noviembre la Carta Circular 77, que comunica un
  protocolo para entidades bajo vigilancia de esa Superintendencia. El Boletín
  Jurídico 124 de la SFC indica que la Ley 2573 no define “demás establecimientos
  comerciales con esta competencia”, que trasladó la pregunta de alcance a la SIC
  y que, para las medidas de los artículos 7 y 8 discutidas en ese concepto,
  resulta relevante si la entidad es fuente de información sobre la obligación.
- Este protocolo de la SFC no acredita que Dusema esté bajo la vigilancia de la
  SFC ni resuelve el alcance para Dusema o para los comercios clientes. La búsqueda
  de fuentes oficiales SIC realizada el 25 de noviembre no localizó un protocolo
  general aplicable; es un resultado de búsqueda, no prueba de inexistencia.
  Tampoco hay evidencia en el código revisado de que Dusema reporte obligaciones a
  operadores de información. Sigue pendiente evaluar por separado el rol de cada
  negocio que vende a crédito y el de Dusema como proveedor de software antes de
  declarar conformidad o diseñar un flujo específico de suplantación.

Fuentes oficiales: [Ley 2573/2026 — MINTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm),
[Carta Circular 77 — SFC](https://www.superfinanciera.gov.co/publicaciones/10115975/cartas-circulares-2026/)
y [Boletín Jurídico 124 — SFC](https://www.superfinanciera.gov.co/publicaciones/10116313/boletin-juridico-no-124/).

## Revisión del término de subsanación — 2026-11-25

- El artículo 15 de la Ley 1581 de 2012 fija cinco días siguientes para pedir
  subsanar un reclamo incompleto, sin añadir la palabra «hábiles» en esa frase.
  El artículo 62 de la Ley 4 de 1913 contiene la regla general de cómputo de
  términos legales en días. Función Pública, en el Concepto 148831 de 2025,
  reproduce la regla según la cual los sábados son hábiles por regla general,
  salvo que una norma general aplicable los declare inhábiles; el concepto
  concreto trata de empleo público y no resuelve específicamente la Ley 1581.
- El código presente en #706 usa un calendario lunes-viernes y excluye sábados.
  No encontramos evidencia de que Dusema haya declarado el sábado inhábil para
  este cómputo. En consecuencia, no se certifica que la fecha actualmente
  calculada para el requerimiento sea conforme: podría exceder el término si el
  sábado cuenta como hábil.
- La recomendación de ADR-SAAS-104 es versionar el calendario para contar
  sábados como hábiles y excluir domingos y festivos, a menos que una regla
  aplicable a Dusema establezca otra cosa. La aplicación de esa regla al
  artículo 15 y a Dusema continúa pendiente de revisión jurídica final; no se
  recalculan casos históricos ni se activa el flujo real con este ADR propuesto.

Fuentes: [Ley 1581, art. 15 — SIC](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Ley_1581_2012.pdf),
[Ley 4 de 1913, art. 62 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426),
[Concepto 148831 de 2025 — Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=261616),
[Resolución SIC 55022 de 2021](https://sedeelectronica.sic.gov.co/sites/default/files/estados/072022/RE55022-2021.pdf).

## Revalidación de rutas y CI — 2026-11-25 10:24 UTC

- Staging devolvió `200` en las cuatro rutas legales y cada una aún muestra la
  versión 0.2 como borrador. `/backoffice/operadores` y
  `/backoffice/consultas-privacidad` también devuelven `200` al solicitar el
  HTML sin sesión; esto comprueba únicamente que carga el shell, no la identidad
  autenticada ni las facultades de ningún operador.
- `pos.dusema.com/terminos` sigue devolviendo `200` con “Términos y Privacidad -
  Café Atrato”; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`
  devuelven `404`. El paquete legal de #706 no está publicado en producción.
- El run `45590883573` corresponde al SHA remoto `84edd3136b13d4fb885db7be541d97f500628cfc` y seguía `in_progress` a las 10:24 UTC; el job `Tipos y pruebas` estaba en el E2E Bodega de solicitud, aprobación y venta canónica. `gh pr checks 706` mostraba `pending`. No se atribuye ese resultado al HEAD local posterior `d7d6f7f`, que aún no se ha enviado.
- No se cambiaron facultades, Rules, Functions, App Hosting ni registros productivos en esta revalidación.
