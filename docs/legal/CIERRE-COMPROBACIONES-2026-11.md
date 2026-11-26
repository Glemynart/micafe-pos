# Cierre de comprobaciones accesibles — 2026-11-24

Estado: **COMPROBACIONES DE LECTURA REALIZADAS; NO LISTO PARA EXIGIBILIDAD**.
No es dictamen jurídico integral. No se ejecutó exportación de datos, borrado,
despliegue, aceptación de acuerdos o cambio de plan.

La consulta read-only posterior del 2026-11-26 registró el estado actual de
App Hosting, Functions, IAM y Rules en
[`evidence/PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md`](evidence/PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md).
Detectó que 117 Functions usan la cuenta Compute predeterminada con
`roles/editor`; la migración queda propuesta en
[`ADR-SAAS-105`](../../ADR-SAAS-105-identidades-runtime-functions-minimo-privilegio.md)
y no se cambiaron permisos. La versión de Rules no pudo leerse por HTTP 403.

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
2. Se retiró el alias público estable de Vercel y las direcciones `cafeatrato-*`
   verificadas requieren SSO o están retiradas; el equipo sigue en Hobby, así que
   la aptitud contractual de los deployments internos remanentes sigue sin resolver.
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
La actualización de `REVISION-2026-11.md` incorpora la Ley 2573/2026. La fecha
exacta de su entrada en vigor se corrige en la revisión normativa posterior de
este expediente; no se atribuye su cumplimiento a Dusema ni a todos los negocios
clientes sin análisis jurídico por rol.

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
  promulgación. El encabezado indica 19 de mayo de 2026, pero el Diario Oficial
  53.496 consta fechado el 20 de mayo; el artículo 52 de la Ley 4 de 1913 define
  promulgación por la inserción en el periódico oficial. Por ello no debe
  afirmarse el 19 de noviembre como fecha exacta basándose solo en la sanción.
  Al 25 de noviembre ya transcurrió el período de seis meses bajo los cómputos
  posibles desde esas dos fechas. La fecha diaria exacta requiere validación
  jurídica por la redacción «dentro de los seis meses». Los parágrafos 1 y 2 del
  artículo 5 rigen desde la promulgación.
- La SFC publicó el 18 de noviembre la Carta Circular 77, que comunica un
  protocolo de atención de reportes de suplantación. La SFC clasifica las cartas
  circulares como informativas y no como regulación; la Carta Circular 77 no
  resuelve por sí misma el alcance para todo comercio. El Boletín Jurídico 124
  indica que la Ley 2573 no define “demás establecimientos comerciales con esta
  competencia”, que trasladó la pregunta de alcance a la SIC y que, para las
  medidas de los artículos 7 y 8 discutidas en ese concepto, resulta relevante
  si la entidad es fuente de información sobre la obligación.
- Este protocolo de la SFC no acredita que Dusema esté bajo la vigilancia de la
  SFC ni resuelve el alcance para Dusema o para los comercios clientes. La búsqueda
  de fuentes oficiales SIC realizada el 25 de noviembre no localizó un protocolo
  general aplicable; es un resultado de búsqueda, no prueba de inexistencia.
  Tampoco hay evidencia en el código revisado de que Dusema reporte obligaciones a
  operadores de información. Sigue pendiente evaluar por separado el rol de cada
  negocio que vende a crédito y el de Dusema como proveedor de software antes de
  declarar conformidad o diseñar un flujo específico de suplantación.

Fuentes oficiales: [Ley 2573/2026 — MINTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm),
[Ley 4 de 1913, arts. 52, 59 y 60](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426),
[Cartas Circulares 2026 — SFC](https://www.superfinanciera.gov.co/publicaciones/10115975/cartas-circulares-2026/),
[Carta Circular 77 — SFC](https://www.superfinanciera.gov.co/publicaciones/10115975/cartas-circulares-2026/)
y [Boletín Jurídico 124 — SFC](https://www.superfinanciera.gov.co/publicaciones/10116313/boletin-juridico-no-124/).

## Revalidación de Vercel y alias históricos — 2026-11-25 19:52 UTC

- `vercel list cafeatrato` muestra cuatro deployments de entorno Production con
  estado `Ready`, de aproximadamente 50 días de antigüedad. Las cuatro URLs
  únicas devuelven la página de acceso de Vercel cuando se consultan sin sesión;
  ninguna mostró contenido de Café Atrato. Esto confirma una barrera de acceso
  anónimo para esas cuatro muestras, no la eliminación de los deployments.
- `https://cafeatrato.vercel.app/` devolvió la respuesta `DEPLOYMENT_NOT_FOUND`;
  el alias que antes servía la landing ya no la publica. La raíz productiva
  `https://pos.dusema.com/` sigue en Firebase App Hosting (GET `200`, título
  “Dusema POS”), no en Vercel. No se borró ni cambió ningún deployment, alias,
  plan o dominio en esta revalidación.
- El estado previo del equipo Vercel Hobby y las limitaciones de uso comercial
  siguen documentados. La verificación nueva confirma que los deployments
  antiguos están protegidos y que el alias público antiguo no está asignado;
  no determina por sí sola si conservar deployments protegidos cumple los
  términos del plan ni acredita su borrado definitivo.

## Revisión del término de subsanación — 2026-11-25

- El artículo 15 de la Ley 1581 de 2012 fija cinco días siguientes para pedir
  subsanar un reclamo incompleto, sin añadir la palabra «hábiles» en esa frase.
  El artículo 62 de la Ley 4 de 1913 contiene la regla general de cómputo de
  términos legales en días. La Corte Suprema, en sentencia del 28 de marzo de
  1984, interpretó que el artículo 62 se aplica a plazos legales también en
  relaciones entre particulares. Función Pública, en el Concepto 148831 de
  2025, reproduce la regla general y recoge jurisprudencia administrativa sobre
  sábados hábiles, pero su caso concreto trata de empleo público y no resuelve
  cómo se determina la vacancia operativa de Dusema ni el artículo 15 de la Ley
  1581.
- El código presente en #706 usa un calendario lunes-viernes y excluye sábados
  para calcular también consultas (10 + 5 días hábiles) y reclamos completos
  (anotación en 2, respuesta en 15 y extensión en 8), además del requerimiento
  de subsanación. No encontramos evidencia de que Dusema haya declarado el
  sábado inhábil para estos términos. No se certifica que las fechas calculadas
  sean conformes: podrían exceder el plazo si el sábado cuenta como hábil.
- ADR-SAAS-104 se aceptó el 2026-11-25 para implementación y validación
  sintética/staging. La versión V2 cuenta sábados no festivos, excluye domingos
  y festivos, y mantiene el cómputo V1 en expedientes históricos. La aceptación
  es operativa y no constituye revisión jurídica final para Dusema.

## Implementación local de reclamos incompletos — 2026-11-25

- PR #706 incorpora acciones server-side para registrar el requerimiento de
  subsanación, completar el mismo caso con fecha/referencia de recepción y
  desistir manualmente después de documentar una verificación del canal externo.
  No hay correo automático, cierre por reloj, borrado ni escritura productiva.
- La callable mantiene la misma facultad, operador asignado y aislamiento. Los
  campos se escriben en el expediente existente; los reintentos son idempotentes
  y las constancias no reemplazables. El sistema separa fecha declarada de
  timestamp server-side y no confirma por sí mismo el canal externo.
- V2 se aplica a expedientes nuevos. Los registros sin `calendarioVersion` se
  validan como V1; se preservan fechas guardadas y los datos incompatibles o con
  versión desconocida se rechazan. No se modifican reglas ni se recalculan
  expedientes en lote.
- Validación local: 21 pruebas unitarias legales, 32 de Backoffice, 3 recorridos
  de Emulator, TypeScript, build de Functions, build de Next.js y ESLint
  focalizado pasaron. El Emulator requirió seleccionar el JDK 21 ya instalado
  para ese proceso; no se cambió la instalación ni la configuración del sistema.
- Sigue pendiente el smoke autenticado en staging y el rollout. Los documentos
  continúan en borrador; la implementación no equivale a aprobación jurídica ni
  activa el flujo para datos reales.

Fuentes: [Ley 1581, art. 15 — SIC](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Ley_1581_2012.pdf),
[Ley 4 de 1913, art. 62 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426),
[Corte Suprema, sentencia 28-03-1984](https://cortesuprema.gov.co/corte/wp-content/uploads/2022/07/SC-28-03-1984.pdf),
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

## Revalidación de producción y CI — 2026-11-25 10:48 UTC

- Producción vuelve a servir `/terminos` con el título histórico «Términos y
  Privacidad - Café Atrato» (`200`); `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento` devuelven `404`. Los documentos de #706 siguen sin estar
  publicados en producción.
- Staging devuelve `200` para las cuatro rutas legales y para los shells HTML
  de `/backoffice/operadores` y `/backoffice/consultas-privacidad`. El código
  HTTP de estas dos páginas no demuestra autenticación ni facultades efectivas.
- PR #706 sigue abierto y en borrador, con base remota
  `aa1c4fece1386edc6ba31b439a2be98ed9216d0b` y HEAD remoto
  `ec8b928c4767f3d5156dd85845109bd0ca1214eb`. Su run `45595698705` seguía
  `in_progress` a las 10:48 UTC: 106 de 127 pasos completados, en el E2E Bodega
  de solicitud, aprobación y venta canónica; no había fallos reportados.
  El commit local `38ddeb3` no estaba incluido en ese run ni enviado al PR.
- No se modificaron recursos ni datos productivos durante esta revalidación.

## Revalidación de Vercel y CI — 2026-11-25 11:00 UTC

- La CLI autenticada confirmó que el equipo Vercel `glemynarts-projects` está
  en Hobby. `vercel inspect` clasificó `cafeatrato.vercel.app` como alias del
  deployment de producción `cafeatrato-f9n5lfjee-glemynarts-projects.vercel.app`,
  ID `dpl_GoFEeU2pjnnbEgo5jR7F863swYY4`, `Ready`. Una petición HTTP al alias
  devolvió `200` y el título «POS Empresarial».
- Los [Términos de Vercel](https://vercel.com/legal/terms), actualizados el
  2026-10-19, permiten el plan Hobby solo para uso personal o no comercial y
  reservan el uso de contenido del cliente en Hobby o en una prueba Pro para
  entrenamiento de modelos de IA/ML. El DPA publicado no se acredita para el
  equipo Hobby. No hay evidencia en esta comprobación de que datos de clientes
  hayan sido transmitidos a Vercel ni de que se hayan usado para entrenar.
- El alias productivo está activo bajo una cuenta cuyo plan no permite el uso
  comercial; la aptitud contractual queda **NO APROBADA** hasta retirar el uso
  comercial de ese hosting o contar con una autorización contractual válida.
  No se cambió el plan, se pausó o borró el proyecto ni se modificó el alias.
- El run `45595698705` cubre el HEAD remoto
  `ec8b928c4767f3d5156dd85845109bd0ca1214eb` y terminó `success` el
  2026-11-25 a las 10:58:17 UTC. PR #706 sigue abierto y en borrador. Los commits
  locales `38ddeb3` y `b824835` aún no forman parte de ese run ni del PR.

## Revalidación de acceso Vercel — 2026-11-25 11:17 UTC

- Se retiró el alias público estable `cafeatrato.vercel.app` sin eliminar ni
  pausar su deployment. La verificación posterior obtuvo `404
  DEPLOYMENT_NOT_FOUND`.
- La paginación de `vercel alias list` produjo 123 aliases `cafeatrato-*` en el
  equipo. Las solicitudes HEAD, sin seguir redirecciones, resultaron en 46 `302`
  a SSO, 76 `410` y una `404`; ninguna devolvió `200`.
- Las cuatro URLs de deployments de producción y el preview de #706 dieron `302`
  a SSO en comprobaciones separadas. Esta evidencia no inspecciona el contenido
  protegido ni descarta deployments o recursos que no aparezcan en el inventario
  de aliases.
- `pos.dusema.com` conserva su ruta Firebase: `/` redirige `307` a `/pos`, y
  `/pos` respondió `200`.
- No se actualizó el plan ni se borraron deployments. Vercel sigue en Hobby y
  almacena los deployments protegidos; por eso la compatibilidad contractual de
  ese uso remanente aún no se declara resuelta.
- El CI exacto de #706, run `45600820307` para
  `e12ae9a47b78f75b33df301496fd63601db2c723`, seguía `in_progress` en el smoke
  E2E P0-01 a las 11:17 UTC. No iniciar un nuevo run ni atribuirle resultados
  anteriores.

## Revalidación de App Hosting y Rules — 2026-11-25 11:49 UTC

- Consulta de solo lectura a los backends y tráfico de App Hosting:
  - Producción `micafe-pos`: build `build-2026-11-24-002`, `READY`, 100% del
    tráfico; su `codebase.hash` es
    `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, el `main` actual (#704).
  - Staging `micafe-pos-staging`: build `build-2026-11-25-001`, `READY`, rollout
    `SUCCEEDED`, 100% del tráfico; commit
    `6e63c172d4cba7cc68c6f756148c84a79589e44e`.
- HTTP sin autenticación: staging devuelve `200` en `/terminos`, `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento`. En producción `/terminos` aún
  muestra «Términos y Privacidad - Café Atrato»; las otras tres rutas devuelven
  `404`. El candidato legal de #706 no está publicado en producción.
- La consulta `GET projects/{project}/releases` a Firebase Rules devolvió `403`
  tanto para `micafe-pos` como para `micafe-pos-staging`; no fue posible comparar
  el release/hash activo con el candidato. El permiso de solo lectura requerido
  por la API es `firebaserules.releases.list`; no se cambió IAM. Fuentes: [Rules
  REST API](https://firebase.google.com/docs/reference/rules/rest) y [permisos de
  Firebase Rules](https://firebase.google.com/docs/projects/iam/permissions).
- Estas consultas no hicieron escrituras, no desplegaron Rules ni App Hosting y
  no ejecutaron smoke autenticado. Producción permanece en `main@aa1c4fe`; no se
  debe publicar el release legal mientras los gates abiertos sigan sin evidencia.

## Revalidación verificable de staging y producción — 2026-11-25 13:31 UTC

- PR #706 sigue abierto y en borrador. El SHA remoto exacto es
  `42006b7e8b36dfab529c81589107554e1adee899`, con base
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. Los checks `Tipos y pruebas`
  y `App Hosting - Rollout (micafe-pos-staging/us-central1/micafe-pos)` están en
  `SUCCESS`; no hay review ni aprobación de auditoría registrada.
- Staging: App Hosting build `build-2026-11-25-002` está `READY`; el rollout
  correspondiente está `SUCCEEDED` y Cloud Run sirve
  `micafe-pos-build-2026-11-25-002` al 100%. El recurso Build atribuye el origen
  al SHA exacto del PR. Las cuatro rutas legales responden `200` y el contenido
  marca los documentos como borradores. `/backoffice/privacidad` entrega el
  shell HTML, lo cual no prueba una sesión ni autorización.
- Staging: el release de Firestore Rules apunta al ruleset
  `766510d4-1cd6-44bb-a693-2e1e7589030f`, actualizado a las 13:09:42 UTC. El
  contenido fuente remoto coincide exactamente con `firestore.rules` después de
  normalizar CRLF/LF. Están `ACTIVE` las cuatro Functions legales:
  `aceptarDocumentosLegalesTenant`, `consultarEstadoLegalTenant`,
  `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas`.
- Las cuatro callables de staging rechazaron una invocación anónima con HTTP 401
  `UNAUTHENTICATED`. Es evidencia negativa de autenticación, no un smoke positivo
  ni prueba de tramitación autorizada.
- Producción no recibió este corte. Cloud Run conserva
  `micafe-pos-build-2026-11-24-002` al 100%; el Build API consultado no expuso un
  SHA de origen. El release de Firestore Rules apunta al ruleset
  `2a122fe8-7e11-479c-aff0-66f4c5f7d60b`; su fuente difiere de las Rules del
  candidato. La web de producción aún sirve en `/terminos` el título histórico
  «Términos y Privacidad - Café Atrato» y devuelve `404` en las otras tres rutas
  legales. `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas` no
  están desplegadas en producción.
- No se concedió ninguna facultad ni se abrió o modificó un expediente real. El
  smoke positivo requiere un operador distinto del objetivo con
  `OPERADORES_GOBERNAR`; el Backoffice identifica al operador objetivo por su UID
  de Auth, reemplaza el conjunto completo de facultades y revoca sus tokens al
  guardar. La facultad para consultas y la facultad para reclamos son separadas;
  el objetivo debe volver a iniciar sesión después de la concesión.
- Firebase CLI informó que generaba o consultaba las service identities de
  Pub/Sub y Eventarc. La lectura actual de la política IAM de staging confirma
  que existen y muestra `roles/pubsub.serviceAgent` y
  `roles/iam.serviceAccountTokenCreator` para Pub/Sub, y
  `roles/eventarc.serviceAgent` para Eventarc. No se ejecutó un comando manual
  para editar bindings IAM, pero no puede descartarse un efecto de
  `GenerateServiceIdentity` durante el deploy. La cuenta operadora no tiene
  `iam.serviceAccounts.get`, por lo que no se obtuvieron las fechas de creación;
  tampoco se vieron eventos coincidentes de generación, creación o cambio de
  política en los logs consultables de 13:00–13:25 UTC. La ausencia de logs no
  prueba que no hubiera cambios. Este límite no bloquea el smoke de staging; no
  se considera resuelto ni autoriza ampliar IAM en producción.
- Los documentos v0.2 permanecen en `PREPARACION`; no hay activación contractual,
  publicación en producción, exportación integral real ni certificación de
  supresión. Siguen pendientes la identidad y concesión de prueba, smoke
  autenticado, verificación factual/jurídica, prueba externa del canal de correo,
  exportación/supresión controladas y aptitud contractual de los previews
  remanentes de Vercel Hobby. No se desplegó nada a producción.

## Verificación posterior de facultades — 2026-11-25 14:18 UTC

- Para el smoke autorizado de staging, una consulta de solo lectura con el
  proyecto fijado explícitamente en `micafe-pos-staging` encontró el operador de
  prueba activo, `versionAutorizacion=2`, y las facultades separadas
  `PRIVACIDAD_CONSULTAS_TRAMITAR` y `PRIVACIDAD_RECLAMOS_TRAMITAR` tanto en
  Firestore (`saas_operadores`) como en los claims actuales de Firebase Auth.
  No se persistieron el UID, correo, ni otras facultades.
- El usuario informa que tiene abierta la sesión de Glemynart y el contexto del
  navegador integrado reporta `/backoffice/privacidad`. No se observó el
  contenido DOM/visual ni se ejecutó una operación autenticada. Por ello, la
  concesión y su proyección de claims quedan verificadas; autorización efectiva
  en interfaz y trámite sintético siguen `NOT VERIFIED`.
- No se registró ningún expediente ni se leyeron datos personales de titulares.
  No hubo cambios en producción.
- El run `45626959540` para `db3a6b8ab02e07ea2ea1d36598dff14bafc0c723` terminó
  `SUCCESS` a las 14:14:03 UTC. Esa CI no sustituye el smoke de interfaz, la
  revisión jurídica, una exportación real ni los demás gates de liberación.

## Mitigación de previews Vercel — 2026-11-25 15:20 UTC

- Vercel CLI 62.1.0 enumeró 106 deployments `preview` del proyecto `cafeatrato`,
  creados entre el 2026-09-14 y el 2026-11-24 05:12 UTC: 105 `READY`, 1 `ERROR`.
  Todos eran URLs de deployment `*.vercel.app`; no había alias personalizado.
- Se archivó el manifiesto de URLs, estado y fecha (sin identidad de creador,
  secretos ni datos de aplicación) en
  `docs/legal/evidence/vercel-cafeatrato-previews-2026-11-25.json`, SHA-256
  `59a79ada6f26a03545e5de2b50b396a9a3b57a3361c3b4ba4fc85db20b9c19fd`.
- Con la autorización de gestión de previews de este Goal, se retiraron los 106
  deployments `preview` en lotes dirigidos. La consulta posterior devuelve cero
  previews y un URL archivado devuelve HTTP 404. No se modificó DNS, el dominio
  operativo ni ningún deployment de Firebase/App Hosting.
- Los cuatro deployments Vercel `production` se conservaron: continúan `READY`,
  sin alias personalizado; sus cuatro URLs devuelven HTTP 302 a SSO. No hay
  evidencia de que el tráfico de `pos.dusema.com` dependa de Vercel; su ruta
  `/pos` respondió HTTP 200 tras la limpieza.
- No se cambió el plan Hobby ni se incurrió en cobros. Sus términos actuales
  restringen Hobby a uso personal/no comercial y permiten uso del contenido para
  entrenamiento de modelos; el DPA publicado cubre Pro/Enterprise. La limpieza
  reduce la superficie de previews, pero no resuelve la compatibilidad contractual
  de conservar los cuatro deployments `production` y el proyecto. Tampoco prueba
  eliminación de datos retenidos internamente por el proveedor. No se afirma que
  Vercel haya usado contenido de Dusema para entrenamiento ni que haya recibido
  datos personales de clientes.

## Reconciliación posterior — 2026-11-25 16:00 UTC

- `origin/codex/e2-2-legal-acceptance` apunta a `f2d078be7d0257060907c4cce13694f9b0e4fde6`. Sin embargo, la API de PR #706 y `refs/pull/706/head` continúan señalando `9ec4a2ba872369727b3713d4c9185e39d0b2fa56`; el listado de commits del PR también termina en ese SHA. No hay run de CI para `f2d078b`. El run `45644571720` terminó `SUCCESS` únicamente para `9ec4a2b`; la discrepancia impide considerar #706 actualizado o fusionable.
- App Hosting staging sirve `micafe-pos-build-2026-11-25-002` al 100 %, desde `42006b7e8b36dfab529c81589107554e1adee899`, seis commits antes de la punta de la rama remota. Las cuatro rutas legales responden HTTP 200 y conservan el marcador de borrador. No se probó aceptación autenticada ni se desplegó el SHA `f2d078b`.
- El comentario de Vercel del PR conserva una URL de preview obsoleta. `vercel inspect` ya no encuentra el deployment y la URL devuelve HTTP 404, coherente con el inventario posterior de cero previews. Los cuatro deployments de producción siguen protegidos por SSO; el plan Hobby y sus términos siguen pendientes de resolver.
- La revisión documental independiente quedó en `docs/legal/evidence/REVISION-PARALELA-TERMINOS-2026-11-25.md`. No encontró un error textual verificable en los cuatro borradores; no equivale a concepto o aprobación jurídica. Los documentos siguen `BORRADOR`/`PREPARACION` y no se habilitó aceptación.
- No se hicieron cambios en producción. La descripción del PR tampoco se actualizó: el intento con GitHub CLI fue rechazado por la política automática de comandos (`blocked by policy`), y no se intentó eludir el bloqueo.

## Reconciliación posterior — 2026-11-25 16:16 UTC

- La punta se sincronizó: rama remota, API de PR #706 y `refs/pull/706/head` apuntan a `ca21a1f0cc752f8a95b837b4ffb4bb7d102f5dcf`, con base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. El nuevo run `45650590494` sigue `in_progress` para ese SHA. PR #706 permanece `OPEN`/`DRAFT`.
- App Hosting staging sigue sirviendo `micafe-pos-build-2026-11-25-002` al 100 %, desde `42006b7e8b36dfab529c81589107554e1adee899`, siete commits antes de la rama remota. Las cuatro rutas legales responden HTTP 200 con marcador de borrador. No se desplegó `ca21a1f` y no se probó aceptación autenticada.
- El preflight metadata-only de 16:05 UTC vio 48 raíces Firestore en producción y 41 en staging; todas están clasificadas por el esquema o como internas, pero `productionExportCertified=false`. No leyó documentos ni payloads.
- Firestore `(default)` está en `southamerica-east1` en producción y `us-central1` en staging. El backup schedule productivo sigue diario, `3024000s` (35 días); staging no mostró schedule. PITR y delete protection están deshabilitados en ambos. Cloud Logging global conserva `_Default` 30 días y `_Required` 400 días.
- La enumeración actual de Storage reportó tres buckets productivos en `US-CENTRAL1`, cada uno con soft delete de siete días y sin retención de bucket reportada. En el bucket Firebase, uniform bucket-level access está deshabilitado y la prevención pública es `inherited`; bucket ACL, default object ACL e IAM no muestran principals públicos. Una enumeración completa de ACL con `projection=full` revisó siete objetos activos y encontró cero ACL públicas; no se descargó contenido. No cubre objetos en soft delete ni los accesos públicos definidos por Firebase Storage Rules. En staging, el bucket de evidencia E2.2 tiene retención de 30 días, soft delete de siete días y prevención pública `enforced`; el bucket de fuentes tiene soft delete de siete días y prevención `enforced`.
- El informe documental independiente está incluido en la punta remota. No detectó errores textuales verificables; los cuatro documentos siguen `BORRADOR`/`PREPARACION`, sin aprobación jurídica ni aceptación activada. El nuevo reporte de retenciones todavía está en el worktree y aún no está en la punta de PR/CI.
- No hubo cambios de configuración, archivos de clientes, Rules, Functions ni producción durante estas consultas.

## Revisión paralela de documentos legales — 2026-11-25 16:30 UTC

- Tres revisiones independientes se realizaron sobre los cuatro borradores, el procedimiento de privacidad, los flujos de código y la evidencia de operación. Los informes son: `evidence/REVISION-TERMINOS-PARALELA-2026-11-25.md`, `evidence/REVISION-PRIVACIDAD-PARALELA-2026-11-25.md` y `evidence/REVISION-DPA-OPERACION-PARALELA-2026-11-25.md`. Son evidencia interna, no dictámenes ni aprobación legal.
- Los términos no presentan un error textual material en retracto/reintegro; quedan sujetos a la clasificación de consumo por contrato. Si se configura relación de consumo por comercio electrónico, el canal PQR requiere radicación en ese entorno con fecha/hora y seguimiento. El buzón de contacto no está probado y el Backoffice de privacidad no sustituye ese canal. La pantalla contractual tampoco resuelve IVA/impuestos/cargos por oferta.
- Política y aviso separan correctamente el contrato del SaaS de autorizaciones individuales. No prueban que cada titular de clientes/proveedores/empleados del tenant haya recibido el aviso o autorizado el tratamiento; ese proceso debe existir en el negocio o acordarse como una función nueva. El formulario de clientes no valida edad. El código operativo queda guardado en `localStorage` sin expiración y el control inicia marcado; no debe describirse como cookie ni como PIN.
- El anexo y la operación siguen sin acreditación de contratos/subencargados activos por producto/cuenta, persona/área y canales de privacidad operativos, manejo de incidentes, exportación integral real y supresión productiva. Diez años de conservación aplican a los libros/papeles comerciales que corresponda preservar, no automáticamente a toda PII; el SLA de exportación total debe ser contractual, no presentarse como plazo legal general.
- Estado release: PR #706 `OPEN`/`DRAFT`, `ca21a1f` tiene CI `45650590494` `SUCCESS`. El commit local `da01478` y los tres informes aún no están en la rama remota ni cubiertos por CI. Producción no recibió cambios de este corte. Los documentos continúan `BORRADOR`/`PREPARACION`; no aprobar ni exigir aceptaciones.
- Fuentes oficiales consultadas: Ley 1581/2012, Decreto 1074/2015, Leyes 1480/2011 y 2439/2024, Ley 527/1999, Ley 2573/2026, SIC Resolución 65387/2024 y material SIC de autorización/incidentes. Los informes enlazan los artículos/páginas específicos y distinguen obligación condicionada de recomendación.

## Candidato documental y ajustes de consentimiento — 2026-11-25

- La revisión paralela de v0.3 motivó una nueva edición local de los términos,
  la política, el aviso y el anexo. Los cambios están en el worktree y todavía
  no son parte de la rama remota ni están cubiertos por CI. La copia pública de
  trabajo se conserva en `public/legal/v0.3`; los cuatro documentos v0.2 no se
  modifican.
- Los términos explicitan que, si una contratación concreta constituye una
  relación de consumo celebrada electrónicamente, el flujo debe mostrar resumen
  completo descargable, permitir corrección/cancelación, registrar aceptación
  expresa, enviar confirmación dentro del plazo legal con datos completos y
  explicar retracto/reversión cuando procedan. La UI actual no está certificada
  para ese flujo. La obligación de radicar PQR en el mismo medio, con fecha/hora
  y seguimiento, sigue siendo condicional a que aplique el régimen de consumo y
  no se considera satisfecha por el Backoffice de privacidad.
- El aviso enumera acceso gratuito y queja ante la SIC; la política aclara que
  el tratamiento de datos de menores tiene condiciones reforzadas y no una
  prohibición absoluta, pero que el módulo actual no implementa esas garantías.
  Los códigos locales de login pasan a opt-in explícito; las claves heredadas
  que no tengan prueba de selección afirmativa se eliminan al leerlas. Nunca se
  guarda el PIN.
- El anexo incorpora una ficha por tenant para detallar responsable, contacto,
  titulares/datos, finalidades/instrucciones, duración, subencargados/regiones,
  seguridad/atención y salida. No está completada para ningún cliente y no
  constituye un contrato aceptado.
- Se preparó un runbook interno de respuesta a incidentes con contención,
  clasificación de roles, inicio del término SIC, reporte y cierre. Sigue como
  borrador: falta formalizar la persona o área responsable y probar sus canales.
  El suplente sigue pendiente como control interno de continuidad, no como un
  requisito legal independiente. También falta clasificar la obligación RNBD
  con el RUT y la naturaleza del sujeto, verificar el canal de reporte aplicable
  y hacer un simulacro autorizado con datos sintéticos.
- Pendientes externos/operativos que bloquean versión definitiva: cotejar
  identidad/NIT/dirección con RUT; nombrar formalmente persona/área de privacidad
  y probar sus canales; confirmar proveedores, servicios, transferencias y
  subencargados por cuenta; implementar y ensayar el canal PQR de consumo si
  Dusema realiza contratación de consumo por comercio electrónico; probar la
  recepción y el registro íntegro de solicitudes, incidentes, exportación y
  supresión en escenarios autorizados; completar la ficha de tratamiento por
  tenant y acordar salida y retención por categoría.
- El expediente de privacidad conserva la fecha declarada de recepción y un
  timestamp de registro en Backoffice, pero no necesariamente la hora ni el
  canal original donde llegó la solicitud. La evidencia externa debe conservarse
  de forma restringida; una mejora del modelo de entrada requiere reconciliarla
  con ADR-SAAS-102/104 antes de cambiar el contrato de datos. Esta limitación no
  equivale por sí sola a incumplimiento del plazo legal, pero impide afirmar que
  el sistema prueba la hora/canal originales.
- El run `45655584641` sigue asociado al SHA `dd70c4b` y estaba `in_progress`
  cuando se redactó este apunte. No cubre estos cambios locales. No se publica
  ni se activa la versión v0.3, y no se hizo despliegue productivo.

## Validación técnica adicional del candidato v0.3 — 2026-11-25

- En el worktree con el catálogo v0.3, `npm run test:backoffice-ui` pasó 34/34;
  `npm --prefix functions-legal test` pasó 22 pruebas con tres suites Emulator
  inicialmente omitidas porque no había emulator activo; el build de
  `functions-legal`, `npx tsc --noEmit` y `npm run build` también pasaron.
- Después de instalar Temurin JDK 21.0.13 se ejecutaron esas tres suites bajo
  Firestore Emulator de proyecto demo; aceptación, reclamos y consultas pasaron
  3/3. Se usó `JAVA_HOME` de manera temporal para el proceso de prueba; la
  instalación global sigue apuntando a JDK 17.
- `git diff --check` no reportó errores. Estos resultados son validación local;
  no sustituyen la CI del SHA final, smoke autenticado, revisión jurídica,
  designación/canales operativos ni aprobación de documentos. No hubo escrituras
  en Firestore real, producción ni despliegues.

## Revisión jurídica paralela adicional — 2026-11-25

- Tres revisiones independientes de solo lectura cubrieron términos, privacidad,
  anexo de encargado, RNBD y operación. No encontraron otra omisión sustantiva
  en la separación responsable/encargado, autorización de titulares o supresión.
- Se amplió la sección de PQR de consumo electrónico para incluir, cuando aplique,
  canales de fácil acceso y atención, orientación y asistencia, trazabilidad,
  radicado, fecha y hora, y seguimiento posterior, según el artículo 50(g) de la
  Ley 1480 modificado por la Ley 2439. El flujo de PQR de consumo aún no está
  implementado ni probado; el texto no lo presenta como una capacidad disponible.
- Se precisó RNBD: la Resolución SIC 56579 de 2025 (art. 12) dispone inscripción
  para sociedades y ESAL con activos totales iguales o superiores a 100.000 UVT,
  y personas jurídicas públicas. No se presume obligación ni exención antes de
  cotejar el RUT y determinar la naturaleza del responsable. No estar obligado
  al RNBD no elimina las demás obligaciones de protección de datos.
- La designación de una persona o área para atender privacidad debe formalizarse;
  el suplente solicitado por el runbook se clasifica como control de continuidad,
  no como una obligación legal autónoma.
- Para Google/Firebase, los instrumentos públicos cambian por producto; la falta
  de un contrato en papel separado no prueba que no haya términos de tratamiento
  incorporados al acuerdo online. Sigue pendiente vincular la aceptación de la
  cuenta contratante, versión, productos realmente usados y opciones de ubicación.
  La matriz está en `docs/legal/PROVEEDORES-EVIDENCIA-2026-11.md`.
- Permanecen bloqueos operativos: probar canales/archivo restringido, completar
  la ficha de tratamiento por tenant, acreditar acuerdos y subencargados efectivos,
  verificar el RUT, smoke autenticado, y certificar exportación/supresión en el
  alcance autorizado. Los flujos de aceptación no se habilitan y los documentos
  siguen en `BORRADOR`/`PREPARACION`.
- El flujo legal aún no conserva evidencia propia del envío del requerimiento de
  subsanación de un reclamo incompleto; ADR-SAAS-104 mantiene ese paso como
  trabajo aprobado pendiente. Hasta completarlo y probarlo, el runbook debe usar
  un expediente externo restringido y no afirmar que Backoffice acredita el
  envío.
- Se recorrió el runbook mediante un ejercicio documental de mesa con un
  escenario ficticio. Resultado parcial: la secuencia y distinción de roles se
  entienden, pero no se verificaron responsables, canal SIC/RNBD ni archivo real.
  Evidencia: `docs/legal/evidence/SIMULACRO-INCIDENTE-EN-MESA-2026-11-25.md`.
- Fuentes primarias: [artículo 50(g) consolidado de Ley 1480](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1480_2011.htm),
  [Ley 2439 de 2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116),
  [Resolución SIC 56579 de 2025](https://sedeelectronica.sic.gov.co/sites/default/files/normativa/Resoluci%C3%B3n%20No.%2056579-2025.pdf),
  [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)
  y [Decreto 1074 de 2015](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608).

## Smoke visual de reclamos en staging — 2026-11-25 18:55 UTC

- En el navegador integrado se observó la ruta
  `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app/backoffice/privacidad`.
  La captura proporcionada por el responsable muestra “Contexto validado”, el
  módulo “Reclamos de privacidad”, la sección para registrar recepción
  incompleta y el formulario de reclamo verificado. No aparecen casos ni datos
  personales en la captura.
- Esto acredita que la interfaz de staging cargó en la sesión mostrada. La
  captura no expone el UID/identidad autenticada y no demuestra una lectura o
  escritura exitosa de una callable ni el guardado de un expediente sintético.
  El smoke funcional autenticado permanece incompleto; no se crearon casos ni
  se modificaron datos reales o producción.

## Verificación HTTP de documentos — 2026-11-25 18:58 UTC

- Consulta GET de solo lectura a las cuatro rutas legales de staging: todas
  respondieron `200` y muestran la versión `v0.2` como borrador/no exigible.
  Por tanto, la interfaz del PR puede mostrar la bandeja actualizada mientras
  el paquete `v0.3` de la rama aún no se sirve en staging.
- En producción, `/terminos` respondió `200` con el título histórico
  “Términos y Privacidad - Café Atrato”; `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento` no están disponibles (404).
  No se desplegó ni modificó ningún entorno.

## Rollout controlado del paquete v0.3 a staging — 2026-11-25 19:36 UTC

- Functions: `firebase deploy --only functions:saas-legal` terminó con éxito en
  `micafe-pos-staging`. El inventario posterior muestra las cuatro callables
  esperadas en estado `ACTIVE`, runtime Node.js 22:
  `consultarEstadoLegalTenant`, `aceptarDocumentosLegalesTenant`,
  `tramitarConsultaPrivacidadSaas` y `tramitarReclamoPrivacidadSaas`.
- Las cuatro URLs rechazaron POST sin credenciales con HTTP `401`. Esto confirma
  que los endpoints exigen autenticación; no es un smoke funcional autenticado.
- App Hosting: rollout `build-2026-11-25-003` terminó `SUCCEEDED`; el build está
  `READY` y su `source.codebase.commit` coincide exactamente con
  `520b7b271978e6a4e29fff0390111f9adb51ccfa`. Cloud Run reporta la revisión
  `micafe-pos-build-2026-11-25-003` como la última lista y con 100 % del tráfico.
- Las cuatro rutas legales de staging (`/terminos`, `/privacidad`,
  `/aviso-autorizacion` y `/anexo-tratamiento`) respondieron HTTP `200`,
  muestran `v0.3` y siguen marcadas como borrador/no exigibles. La actualización
  despliega el paquete preparatorio; no publica ni activa los documentos.
- El preflight de Functions imprimió que Firebase CLI estaba generando las
  identidades administradas de Pub/Sub y Eventarc. Una consulta IAM posterior
  devolvió HTTP `404` para las cuentas esperadas de ambos agentes de servicio en
  el proyecto staging. No se modificaron políticas IAM. La evidencia no permite
  atribuir un cambio persistente a `GenerateServiceIdentity`; se conserva el
  límite de evidencia sobre esa invocación.
- No se desplegaron Firestore Rules ni se hizo ningún cambio en producción.
  Siguen pendientes el smoke funcional autenticado y los gates jurídicos y
  operativos enumerados arriba; este rollout no certifica cumplimiento legal.

## Corrección de idempotencia para requerimientos — 2026-11-25 19:44 UTC

- La revisión de ADR-SAAS-104 encontró que repetir un requerimiento idéntico
  después de completar o desistir el caso era rechazado por la validación de
  estado antes de comprobar la referencia write-once. Se cambió el orden: la
  repetición idéntica retorna el estado actual como no-op, y una referencia o
  fecha distinta sigue rechazándose; los casos sin requerimiento aún exigen
  estado `RECIBIDO` para crear uno nuevo.
- Se añadieron regresiones para reintentar después de completar y después de
  desistir. `npm --prefix functions-legal run build` pasó; la suite unitaria
  pasó con 22 pruebas y omitió las tres pruebas Emulator por no estar iniciado;
  al iniciarlo con JDK 21, la suite Emulator pasó 3/3 (aceptación, reclamos y
  consultas), usando solamente el proyecto demo sintético.
- `git diff --check` pasó. El despliegue y las verificaciones posteriores se
  registran en la sección siguiente. No se cambiaron Rules ni se escribieron
  datos reales.

## Rollout de idempotencia de reclamos en staging — 2026-11-25

- CI del PR #706 terminó `SUCCESS` en el SHA exacto
  `5af87a36bba2fe13f5679a71763614aaecdc6010` (run `45689796036`). Pasaron tipos,
  builds, pruebas legales/Rules/Storage, E2E del portal/PWA/Bodega y E4.1/E4.2.
- El run emitió avisos de mantenimiento de GitHub Actions para acciones Node 20
  y `actions/setup-java@v4`; no fueron fallos del check.
- Desde ese checkout se ejecutó
  `firebase deploy --only functions:saas-legal --project micafe-pos-staging --non-interactive`;
  el CLI terminó `Deploy complete`. No se usó `--force`, no se desplegaron Rules
  ni App Hosting, y no se modificó producción. La diferencia desde el commit de
  App Hosting `520b7b2` solo contiene dos archivos de Functions y este documento;
  el frontend no cambió y no requería otro rollout.
- `firebase functions:list` posterior muestra activas, callable, Node.js 22 y
  `us-central1` las cuatro funciones del codebase: `consultarEstadoLegalTenant`,
  `aceptarDocumentosLegalesTenant`, `tramitarConsultaPrivacidadSaas` y
  `tramitarReclamoPrivacidadSaas`.
- POST sin credenciales a cada una de las cuatro URLs de staging devolvió HTTP
  `401`, confirmando que el endpoint rechaza solicitudes no autenticadas. No es
  prueba funcional positiva autenticada del registro de un expediente.
- Firebase CLI volvió a informar generación de identidades de Pub/Sub y
  Eventarc. La consulta directa de cuentas de servicio devolvió
  `PERMISSION_DENIED` para `iam.serviceAccounts.get`; por tanto no se puede
  concluir si esas identidades fueron creadas o ya existían. No se amplió IAM.
- La captura del Backoffice acredita únicamente que `/backoffice/privacidad`
  carga en la sesión mostrada. La pestaña del navegador integrado no apareció
  entre las ventanas controlables disponibles; no se interactuó con Brave ni
  Edge ni se registró un reclamo desde la sesión.
- El PR #706 sigue `OPEN`/`DRAFT`; no se fusionó. Los documentos continúan
  `BORRADOR`/`PREPARACION`, sin publicación exigible ni aprobación jurídica.

## Revalidación read-only de Vercel — 2026-11-25 20:55 UTC

- La configuración local mantiene `git.deploymentEnabled=false`. La
  documentación oficial de Vercel confirma que esto desactiva despliegues
  automáticos Git para todas las ramas; `vercel list` es un inventario de
  despliegues y no crea ni modifica recursos. Referencias: [CLI `vercel list`](https://vercel.com/docs/cli/list)
  y [configuración Git](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).
- `vercel list cafeatrato --environment preview --limit 100 --json` devolvió
  cero deployments de preview en `glemynarts-projects`. El enlace de preview
  incluido por el bot de Vercel en el comentario histórico de este PR devolvió
  HTTP `404`; dicho comentario no acredita que el preview continúe disponible.
- El inventario de producción aún devuelve cuatro deployments `READY` antiguos;
  comparten el alias generado de `main`, que actualmente redirige HTTP `302` a
  `vercel.com/sso-api`. No se modificaron ni eliminaron; los previews actuales
  están vacíos. La aptitud contractual del plan Hobby para cualquier uso
  remanente sigue sin resolverse. No hubo cambios en `pos.dusema.com` ni en Firebase.

## Revalidación read-only de Firebase — 2026-11-25 21:08 UTC

- Las cuatro rutas legales de staging responden HTTP `200`. En producción,
  `/terminos` responde `200`; `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento` responden `404`.
- `firebase functions:list` informa 68 Functions listadas en staging; el codebase
  `saas-legal` contiene cuatro (`aceptarDocumentosLegalesTenant`,
  `consultarEstadoLegalTenant`, `tramitarConsultaPrivacidadSaas` y
  `tramitarReclamoPrivacidadSaas`), Node.js 22, hash de codebase
  `cbad43a2af26e692ac86648c1368a0e661cb93e2`. Producción informa 117 Functions;
  `saas-legal` contiene únicamente las dos primeras, Node.js 22, hash
  `f8fe2c7a72eaf763790eab2d5944f668f04801c7`. Estos hashes de Firebase no son
  SHA de Git y no prueban por sí solos la procedencia de un release.
- `apphosting:backends:list` muestra como fechas de actualización del backend
  staging `2026-11-25 14:33:51` y del backend de producción
  `2026-11-24 00:24:17`. Esta salida no identifica el commit servido; la última
  evidencia de procedencia consultada apunta staging a `520b7b2` y producción a
  `main@aa1c4fe`, no al candidato #706.
- `gcloud run services describe` confirma que staging sirve
  `micafe-pos-build-2026-11-25-003` al 100 % desde la imagen
  `us-central1-docker.pkg.dev/micafe-pos-staging/firebaseapphosting-images/micafe-pos:build-2026-11-25-003`; producción sirve
  `micafe-pos-build-2026-11-24-002` al 100 % desde
  `us-central1-docker.pkg.dev/micafe-pos/firebaseapphosting-images/micafe-pos:build-2026-11-24-002`. Las revisiones de Cloud Run confirman
  tráfico e imagen; la procedencia Git corresponde al metadato de App Hosting
  registrado arriba. El candidato #706 no está desplegado en ninguno de los dos
  entornos. No se desplegaron recursos en esta revalidación.
- En la consulta del PR #706, el HEAD `cb45adae8d4b0ca7a7ea471fff1899195a2cb8e0`
  y su CI `45701250548` seguían en curso. No se atribuye a este SHA el CI verde
  de un commit anterior.

## Rollout manual del HEAD #706 a App Hosting staging — 2026-11-25 22:28 UTC

- CI del HEAD `0248b1fe46b4a4d3ac759f61f0d7b8bb918cf284` terminó `SUCCESS` en
  el run `45706024559`, incluyendo E4.1 y E4.2. El PR #706 continúa abierto y
  en borrador.
- Se creó un rollout manual únicamente en el backend `micafe-pos` del proyecto
  `micafe-pos-staging`, fijado al commit exacto `0248b1f`. El build
  `build-2026-11-25-004` quedó `READY`; el rollout quedó `SUCCEEDED` y la API
  reportó 100 % del tráfico actual en ese build. La fuente del build informa el
  mismo SHA. Producción no fue modificada.
- Antes del rollout, las Rules de Firestore activas en staging eran el ruleset
  `766510d4-1cd6-44bb-a693-2e1e7589030f`; su SHA-256 normalizado
  `9e0e320647998323e997d172a80200bf8f7f14871700dbbc6ce6d4391d6bc948`
  coincide con `firestore.rules` del HEAD. El codebase `saas-legal` mantenía
  sus cuatro Functions `ACTIVE`; entre `5af87a3` y `0248b1f` no hay cambios de
  Functions, Rules ni `functions-legal`.
- Una lectura HTTP sin credenciales de `/backoffice/privacidad` respondió `200`
  y entregó el título `Backoffice · Dusema POS`. Se revisaron 15 assets JS y
  todos respondieron; el literal corregido `Operador autorizado` está en los
  assets del build actual. Esto comprueba despliegue y contenido estático, no
  una sesión autenticada, autorización efectiva de la callable ni un envío del
  formulario. La captura de pantalla del usuario muestra la página anterior,
  pero no incluye dominio/URL, por lo que no identifica independientemente el
  entorno.
- La lectura de Rules de producción devolvió el ruleset
  `2a122fe8-7e11-479c-aff0-66f4c5f7d60b`, actualizado
  `2026-11-24T07:54:19Z`, con SHA normalizado
  `37b4eb4fb7a2b6a65080f50c22e9fc5ba09676a64aed59db9c2e098fb6bd154e`.
  No coincide con el candidato: producción aún no tiene las restricciones del
  campo server-owned `clientes.reclamosPrivacidadAbiertos` del PR #706. No se
  cambiaron Rules ni IAM productivos. Este mismatch y la ausencia de smoke
  autenticado impiden certificar el corte legal de producción.
- Resultado: el cambio de etiqueta y la página están en staging; los documentos
  siguen como borrador. No se creó un reclamo sintético ni real desde el
  formulario, no se publicó aceptación obligatoria y no se desplegó a
  producción.

## Despliegue aislado de Firestore Rules a producción — 2026-11-25 23:35 UTC

- Inmediatamente antes del despliegue se revalidaron en solo lectura los estados
  activos/Trial: aparecieron tres documentos, incluidos el tenant de Diana, el
  tenant fundacional y un fixture histórico. Solo se leyeron identificadores y
  estados; no se consultaron documentos operativos ni archivos. El fixture se
  identificó por su antigüedad y su falta de cambios desde la creación.
- `firebase deploy --only firestore:rules --project micafe-pos --non-interactive`
  terminó `Deploy complete`. No se desplegaron Functions, App Hosting, Storage
  Rules ni se modificaron IAM o datos.
- A las `2026-11-25T23:44:19Z`, una lectura autenticada de la API de Firebase
  Rules confirmó el release activo `cloud.firestore`, ruleset
  `23b49a84-6282-4df1-9c97-60513697c5d7`, actualizado
  `2026-11-25T23:35:48.074157Z`. El SHA-256 del contenido fuente, normalizando
  CRLF/LF, es
  `9e0e320647998323e997d172a80200bf8f7f14871700dbbc6ce6d4391d6bc948`; coincide
  exactamente con `firestore.rules` del HEAD #706 y con el release activo de
  staging (`766510d4-1cd6-44bb-a693-2e1e7589030f`).
- Firebase CLI mostró la advertencia no fatal `Unused function: esMarketing`.
  El deploy terminó correctamente; no se amplió IAM para silenciarla.
- Este resultado supersede la lectura anterior que indicaba que producción
  conservaba el ruleset `2a122fe8-7e11-479c-aff0-66f4c5f7d60b`. Solo acredita
  Rules: #706 sigue abierto/en borrador, el candidato de App Hosting no está en
  producción; no se probaron operaciones autenticadas ni se certificó la
  exportación integral con datos y archivos reales.
- Como comprobación separada, Edge cargó con una sesión de operador autorizado
  la ruta de staging
  `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app/backoffice/privacidad`;
  el contexto se mostró validado y los formularios estaban vacíos. Esto acredita
  un smoke autenticado de lectura de la interfaz. No se envió un reclamo ni se
  probó una escritura callable, la facultad específica de conservación, el
  aislamiento en una operación ni el exportador productivo.
- El usuario aportó recortes del RUT. Los campos visibles de identidad, contacto,
  dirección y actividades coinciden con los datos declarados anteriormente;
  los recortes no muestran la fecha de actualización y no acreditan por sí solos
  autenticidad o vigencia ante DIAN. No se guardó el RUT en el repositorio.
- El responsable confirma que Diana autoriza un piloto de exportación de su
  tenant bajo la condición de no iniciar sesión ni usar una cuenta de ese tenant.
  No hace falta una cuenta de Diana: la herramienta exige un token de un operador
  SaaS de producción activo con `CONSERVACION_GOBERNAR` y una referencia de
  solicitud verificable. La autorización confirmada aún no está vinculada a esa
  referencia; no se leyeron datos operativos ni archivos reales.
- En una revalidación manual de Edge del 2026-11-26, la pestaña con contexto
  `Operador autorizado` seguía en staging y el formulario permanecía vacío. Al
  abrir `https://pos.dusema.com/backoffice/privacidad`, producción respondió
  `404`. No se usó una cuenta de Diana ni se enviaron datos; la interfaz productiva
  para vincular la solicitud y operar el piloto no está publicada.
- A las `2026-11-26T00:30Z`, la suite legal de Emulator se ejecutó con el JDK
  Temurin 21 ya instalado, seleccionado mediante `JAVA_HOME` solo para el proceso.
  `firebase emulators:exec --project demo-legal-acceptance --only firestore`
  terminó correctamente: aceptación legal, reclamos y consultas pasaron `3/3`,
  incluidos permisos, idempotencia, concurrencia y aislamiento sintético. El
  Emulator se apagó al finalizar; no se consultaron datos ni hubo escrituras en
  staging o producción.

## Revisión normativa de crédito comercial — 2026-11-26 UTC

- La Ley Estatutaria 2573 de 2026 fue publicada en el Diario Oficial 53.496 del
  20 de mayo de 2026. Su artículo 13 dispone entrada en vigor dentro de los seis
  meses siguientes a la promulgación, con una excepción para dos parágrafos del
  artículo 5. La ficha de Función Pública también muestra el 19 de mayo como
  fecha de vigencia, aunque el artículo 13 difiere la vigencia de la mayoría de
  sus disposiciones. En cualquiera de las fechas, al 25 de noviembre de 2026 ya
  transcurrieron seis meses. Fuentes oficiales: [texto de Cancillería](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_2573_2026.htm)
  y [Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=277136).
- La ley regula respuestas frente a suplantación y cobro/reporte de obligaciones
  para operadores de telecomunicaciones, entidades financieras-crediticias y
  establecimientos comerciales «con esta competencia». Sus artículos 8 y 9
  prevén suspensión de cobro cuando se informa suplantación y regulan la
  continuidad según el trámite posterior. No se concluye que toda tienda que
  conceda plazo quede automáticamente dentro de ese ámbito; la actividad real y
  cualquier reporte o gestión externa deben evaluarse por negocio.
- Revisión del código POS: la cuenta de crédito Bodega registra internamente
  saldos, abonos y compromisos de pago; no se encontraron integraciones para
  reportar a operadores de información ni automatizaciones de cobranza. Esta es
  una conclusión limitada al código revisado, no a procesos manuales fuera del
  POS. La política y el anexo v0.4 conservan una advertencia condicional para
  cada negocio; no se declara que Dusema cumpla por cuenta del negocio con un
  eventual proceso de suplantación, ni se añade una promesa de función inexistente.

## Revalidación de rutas y autorización del piloto — 2026-11-26 02:25 UTC

- `HEAD` a las rutas, sin sesión ni envío de datos: staging
  `/backoffice/privacidad` respondió `200`; producción en `pos.dusema.com` y el
  host de App Hosting respondió `404` para `/backoffice/privacidad`; producción
  `/terminos` respondió `200`. Esto comprueba disponibilidad HTTP, no contenido,
  autorización ni un recorrido autenticado en producción.
- En staging se observó la página con el estado «Operador autorizado». Se
  rellenó parcialmente el formulario con referencias de prueba sintéticas, pero
  Computer Use se detuvo al no poder confirmar la URL vigente. No se pulsó
  «Registrar», no se creó un caso y no hubo escritura de formulario en Firestore.
  El smoke de escritura y la prueba de aislamiento siguen pendientes.
- El responsable confirma que el negocio autoriza el piloto con la condición de
  no necesitar una cuenta ni sesión del tenant. El diseño de exportación ya usa
  una identidad de operador SaaS de producción con `CONSERVACION_GOBERNAR`; no
  requiere autenticarse como el negocio. Antes de leer datos operativos aún debe
  verificarse el soporte/referencia de la instrucción y la facultad del operador.
  La afirmación recibida en esta conversación no se ha convertido en un soporte
  independiente dentro del expediente. No se leyeron documentos operativos ni
  archivos reales y `productionExportCertified=false`.
- PR #706 permanece `OPEN`/`DRAFT`, con base `main@aa1c4fe` y HEAD
  `8aa41f2`. El run `45734253581` del HEAD terminó `success`; esto no cierra los
  gates de staging, salida real, conservación/supresión, publicación ni revisión
  jurídica descritos en el PR.

## Preflight de lectura puntual de Firestore — 2026-11-26

- ADR-SAAS-100 requiere fijar `readTime` desde Firestore y reutilizarlo durante
  todas las lecturas del paquete. `RunQueryResponse` entrega el tiempo del
  servidor también cuando la consulta no encuentra documentos.
- `scripts/legal/firestore-source.mjs` ahora obtiene ese tiempo con un nombre de
  documento aleatorio, consulta exacta y sin devolver documentos al llamador. Si
  aparece una colisión o falta `readTime`, la operación se cierra sin continuar.
- La prueba de producción a `micafe-pos` ejecutó solo esa consulta exacta con un
  ID aleatorio inexistente: `RunQuery` respondió con `readTime` y cero documentos.
  No se consultaron colecciones del tenant ni se leyeron archivos. La consulta
  inicial con un ID reservado por Firestore respondió `INVALID_ARGUMENT`; se
  corrigió y se repitió con el formato válido.
- `node --test scripts/legal/legal-tools.test.mjs`: 27/27 aprobadas; `git diff
  --check`: aprobado.
- Esto valida el mecanismo puntual de obtener el snapshot en producción, no los
  adaptadores/campos históricos del tenant, Storage, autorización del operador,
  referencia verificable de Diana, salida privada ni una exportación integral.
  No cambia `productionExportCertified=false`.
- PR #706 sigue `OPEN`/`DRAFT`. El run `45742932500` sigue activo sobre el HEAD
  anterior `a9c3bc5`; el cambio de este preflight requiere su propia CI cuando se
  publique en la rama.

## Runner local de exportación — validación sintética

- `tenant-export-runner.mjs` valida el directorio de salida antes de leer datos,
  exige autorización de operador y referencia del pedido, fija un `readTime`,
  cifra el bundle y comprueba su round-trip sin entregar payloads al llamador.
- `tenant-export-cli.mjs` deriva el bucket del proyecto y restringe el piloto de
  producción a `distribuidora-las-jimenez`. No requiere cuenta ni sesión de ese
  tenant: requiere token Firebase de un operador SaaS activo con
  `CONSERVACION_GOBERNAR`, ADC/gcloud para lecturas y una referencia externa que
  el operador verifique de forma interactiva. La CLI no consulta un expediente
  de autorización en Firestore; por eso la afirmación reportada de Diana aún debe
  vincularse a esa referencia antes de ejecutar.
- `node --test scripts/legal/legal-tools.test.mjs scripts/legal/tenant-export-cli.test.mjs`:
  34/34 aprobadas. ESLint focalizado, `node --check` de CLI/runner y
  `git diff --check` aprobaron.
- El ensayo REST contra Firestore Emulator pasó 1/1 con Temurin JDK 21. El primer
  intento tomó Java 17 y Firebase CLI lo rechazó; se repitió seleccionando el JDK
  21 instalado, sin conectar a Firebase remoto.
- No se ejecutó el CLI, no se leyeron payloads ni objetos Storage de Diana, y no
  se creó un paquete. `productionExportCertified=false` permanece. La validación
  sintética no certifica compatibilidad con los campos históricos reales.

## Revalidación de consumidores de identidad runtime — 2026-11-26

- El responsable aceptó ADR-SAAS-105, alternativa C, para migración gradual por
  codebase y piloto de `saas-legal` en staging. No autorizó cambios IAM ni
  despliegues productivos; no se creó identidad ni binding.
- El inventario read-only confirmó 117 Functions en `us-central1` con la cuenta
  Compute predeterminada y `roles/editor`; encontró seis jobs Scheduler usando
  la misma cuenta para OIDC. En 42 de 43 ubicaciones consultadas se observaron
  118 servicios Cloud Run (117 Functions y un servicio App Hosting); no hubo
  Cloud Run Jobs en las 42 ubicaciones respondidas. App Engine no tiene
  aplicación y staging no tiene una cuenta dedicada a `saas-legal`.
- `compute.googleapis.com` y `cloudasset.googleapis.com` están deshabilitadas.
  No se habilitaron para obtener permisos de lectura. Por ello faltan las VMs y
  una búsqueda global de recursos; no se puede concluir que los seis Scheduler
  y los servicios enumerados sean todos los consumidores existentes.
- En el código de `saas-legal`, las APIs observadas son Firestore y Admin Auth;
  no se observó uso de Storage ni Pub/Sub. `roles/datastore.user` es de alcance
  proyecto y permite leer/escribir datos; `roles/firebaseauth.viewer` incluye
  `firebaseauth.users.get`, además de lecturas de configuración/proyecto. Ambos
  quedan como candidatos para validación, no como asignaciones aprobadas.
- La matriz final y cualquier cuenta/binding de staging deben quedar en un PR
  revisable. La cuenta Compute conservará sus bindings hasta terminar el
  inventario global y validar los consumidores programados y restantes.

## Integridad de referencias Storage — corrección añadida al candidato

- La inspección de los flujos de productos y eventos confirmó que almacenan
  `getDownloadURL()` de Firebase Storage en `productos.imagenUrl` y
  `eventos.imagenUrl`. El comportamiento previo rechazaba URLs con token, así
  que un export integral podía fallar aunque los archivos estuvieran presentes.
- El candidato ahora inventaría primero `tenants/{tenant}/`, resuelve URLs
  Firebase del bucket esperado a referencias de archivo del bundle, comprueba
  generación/ruta exactas y rechaza referencias huérfanas o cruzadas antes de
  completar. Tokens no se copian. El verificador relaciona cada referencia con
  un asset entregado y el manifiesto registra la cantidad de objetos Storage.
- Las pruebas focales locales pasaron 34/34, incluyendo conversión de URL con
  token, rechazo de asset faltante y cierre previo a leer Firestore cuando falla
  el inventario Storage. En ese corte el cambio aún no estaba en CI y requería
  otro commit y un run nuevo; su estado posterior está en la revalidación que
  sigue. No se consultaron archivos ni documentos productivos.

## Revalidación pública de rutas y CI — 2026-11-26 10:41 UTC

- Se hicieron únicamente solicitudes HTTP GET sin sesión ni envío de datos.
  En `pos.dusema.com`, `/` y `/pos` respondieron 200 con título `Dusema POS`;
  `/terminos` respondió 200 con título `Términos y Privacidad - Café Atrato`,
  mientras `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`
  respondieron 404. En el host oficial de App Hosting staging, las cuatro rutas
  legales respondieron 200 con títulos de Dusema POS.
- La lectura confirma que los documentos del candidato están disponibles en
  staging y que producción no sirve todavía el conjunto legal Dusema. No se
  registraron aceptaciones ni se hicieron cambios a App Hosting, Functions,
  Rules, datos o IAM.
- PR #706 seguía `OPEN`/`DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`,
  HEAD `a79294649bd330216173fecc48c72b9fbd6e684e`, sin revisiones humanas y con
  estado de merge `BLOCKED`. El run `45801081945` de ese HEAD seguía
  `in_progress` a las 10:41 UTC, ejecutando `E2E Bodega — solicitud, aprobación
  y venta canónica`; quedaban 20 pasos y no había fallos observados. El mismo run
  terminó `success` a las 10:47:50 UTC para ese HEAD. Esto valida ese candidato,
  no los cambios documentales locales que se agregan después ni el smoke
  autenticado.
- En la consulta posterior al CI, PR #706 seguía `OPEN`/`DRAFT`, sin revisión
  humana; base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, HEAD
  `a79294649bd330216173fecc48c72b9fbd6e684e` y `mergeStateStatus=CLEAN`.
- Computer Use no pudo identificar con confianza la URL de Edge, por lo que no
  se completó el smoke autenticado de staging en esta revalidación.
- Un barrido de alta confianza en los 111 archivos modificados del PR no encontró
  formatos conocidos de claves privadas, tokens GitHub, llaves API de Firebase,
  tokens de Slack o claves secretas de pagos. No es una auditoría exhaustiva de
  secretos ni prueba ausencia de credenciales con formatos no cubiertos.
