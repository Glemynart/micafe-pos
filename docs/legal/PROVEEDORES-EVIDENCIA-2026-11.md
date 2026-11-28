# Proveedores — evidencia contractual y límites

Fecha: 2026-11-25. Revisión pública de instrumentos y consultas autenticadas de
metadatos; no acredita firma por el prestador ni sustituye análisis jurídico.

Actualización: el prestador confirmó Gmail personal y contratación online Google
sin contrato aparte. La tabla por producto y las comprobaciones técnicas quedan
en [cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md). Esto resuelve el
tipo de cuenta/régimen declarado; no inventa fecha o versión histórica aceptada.

La [FAQ oficial de Firebase](https://firebase.google.com/support/faq) indica que
aceptar los términos de Firebase es requisito para usar todas sus capacidades,
que se aceptan desde Firebase Console, una vez por cuenta de Google y no a nivel
de proyecto para todos sus miembros; la aceptación no se realiza por CLI, REST
ni Terraform. El prestador reportó que hubo aceptación online, por lo que la
ausencia de un contrato firmado aparte no se trata por sí sola como falta de
acuerdo. Sin embargo, no se identificó de forma independiente qué cuenta de
Google aceptó, ni la fecha o versión conservada; el reporte no se extiende a
cuentas de los demás miembros del proyecto.

## Google

Los [términos Firebase](https://firebase.google.com/terms) remiten a instrumentos
según el servicio/contrato; no asignar el mismo documento a todos los productos.
Los [Firebase Data Processing and Security Terms](https://firebase.google.com/terms/data-processing-terms)
consultados indican modificación 2024-08-21 y eficacia vinculada al acuerdo de
las partes. El [Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)
está incorporado a los acuerdos allí definidos, con fecha efectiva según aceptación
o acuerdo. Debe conservarse evidencia de la cuenta y contrato realmente aplicables.

La tabla pública de Firebase, modificada el 2026-09-24, separa productos por
instrumento. A esa fecha, Firestore, Functions, Storage, App Hosting y Auth
aparecen bajo los Google Cloud Platform Terms; Firebase Cloud Messaging aparece
bajo Google APIs Terms junto con Firebase Data Processing and Security Terms.
Esto describe la documentación pública, no prueba qué versión o entidad aceptó
el proyecto ni que un producto condicional esté activado. Que no exista un PDF
firmado aparte no demuestra por sí solo ausencia de términos de tratamiento:
hay que cotejar el producto, la cuenta contratante, el acuerdo online aceptado y
la cobertura correspondiente. La página de Firebase advierte además que, si no
se ofrece y selecciona una ubicación de datos para el servicio, los datos pueden
procesarse donde Google o sus agentes mantengan instalaciones.

| Productos del stack | Instrumento publicado a 2026-09-24 | Estado probatorio del proyecto |
|---|---|---|
| Firestore, Functions, Storage, App Hosting, Authentication | Google Cloud Platform Terms y sus términos específicos; revisar Cloud DPA aplicable. | El uso aparece en código/infraestructura; falta vincular cuenta, aceptación y configuración de ubicación por servicio. |
| Firebase Cloud Messaging | Google APIs Terms y Firebase Data Processing and Security Terms. | El código puede usar FCM sujeto a permisos/configuración; falta verificar activación, instrumento de la cuenta y uso efectivo. |

Revisión pública de fuentes oficiales — 2026-11-26: los [términos de Firebase](https://firebase.google.com/terms)
mantienen la fecha de modificación del 2026-09-24 y la clasificación de la tabla.
La [página de privacidad y seguridad de Firebase](https://firebase.google.com/support/privacy/), actualizada el
2026-11-16, explica que el cliente normalmente controla los datos de sus usuarios,
que Google generalmente actúa como encargado respecto de los datos enviados por
el cliente, y que ciertos productos bajo GCP quedan cubiertos por el Cloud DPA.
Esto confirma la distinción por producto, pero no demuestra qué cuenta aceptó los
términos del proyecto, la versión aceptada ni la localización efectiva de cada
recurso.

Fuentes oficiales: [Términos de Firebase](https://firebase.google.com/terms),
[Firebase Data Processing and Security Terms](https://firebase.google.com/terms/data-processing-terms)
y [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum).

La cláusula 6 de los [Firebase Data Processing and Security Terms](https://firebase.google.com/terms/data-processing-terms)
consultados dispone que una instrucción de borrado durante la vigencia se cumple
tan pronto como sea razonablemente posible y en un máximo de 180 días, salvo
retención exigida por ley. Al terminar el acuerdo, la cláusula 6.2 contempla un
periodo de recuperación de hasta 30 días y luego el mismo máximo de 180 días.
La documentación técnica general de [eliminación en Google Cloud](https://docs.cloud.google.com/docs/security/deletion),
actualizada el 2026-11-10, describe como objetivo marcar datos en hasta 24 horas,
eliminarlos de sistemas activos generalmente en unos dos meses y expirar copias
de backup dentro de seis meses desde la solicitud. La guía técnica y los términos
no demuestran por sí solos qué instrumento fue aceptado por esta cuenta ni el
ciclo exacto de cada producto Firebase usado; eso sigue pendiente de vincularse
con el acuerdo online y el servicio concreto. Terminar el contrato de un tenant
no termina automáticamente nuestra cuenta Google. No prometer eliminación física
de todas las copias en 35 o 95 días: esos números describen el schedule de backups
controlado y una hipótesis interna, no el ciclo global de proveedor. Separar
supresión activa, snapshots propios y eliminación del proveedor.

Regiones de Firestore/Cloud Run/Storage constan en OPERACION-Y-CONSERVACION.md;
no prueban ubicación exclusiva de Auth, FCM, logs, soporte o subencargados.
Instrumento y localización por servicio deben formar parte del registro contractual.

**Pendiente concreto:** evidencia de términos aplicables desde la cuenta/contrato
del proyecto y perfil del cliente contratante. No se detectó un mecanismo CLI de
esta revisión que pruebe por sí solo quién aceptó qué versión y cuándo. Una
factura o el billing activo no son sustitutos de esa evidencia. No se solicita
compartir tokens, medios de pago ni contenido de contratos confidenciales en Git.

## Vercel

Consulta `GET /v2/teams/{id}` mediante CLI autenticada: equipo
`glemynarts-projects`, `billing.plan = hobby`, `billing.status = active`.
La lista general de equipos omitía plan; se contrastó con el recurso del equipo.
Solo se mostraron esos campos, sin información de pago.

El [DPA publicado](https://vercel.com/legal/dpa), actualizado 2026-03-17 y efectivo
2026-03-31, delimita su aplicación como encargado a clientes Enterprise/Pro.
No se acredita cobertura de ese DPA para la cuenta Hobby observada.
Los [términos, sección Hobby](https://vercel.com/legal/terms) restringen ese plan
a uso personal o no comercial. No asumir que un preview comercial queda exento.

La producción observada está en Firebase App Hosting. PR #704 se fusionó en
`main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`: retiró Analytics y configuró
`git.deploymentEnabled=false`, que detiene nuevos despliegues Git de Vercel en
todas las ramas. No deshabilitó GitHub CI ni App Hosting.

Revisión autenticada del 2026-11-24: entre los 100 despliegues más recientes
listados, el preview más reciente asociado a #706 usaba un commit anterior al head
de entonces. En el corte del 2026-11-25 se recorrieron las páginas de la lista:
110 despliegues en total, 106 previews y 4 de producción, desde el 2026-09-14
hasta el 2026-11-24. El preview más reciente se creó el 2026-11-24 a las
05:12:06 UTC, antes del merge de #704 a las 05:20:32 UTC; no apareció un preview
posterior. La configuración `git.deploymentEnabled=false` sigue en `main`.

La protección SSO continúa configurada como `all_except_custom_domains`. Tres
URLs de preview consultadas sin sesión respondieron HTTP 302; esas muestras
requieren SSO, pero no sustituyen una inspección individual del contenido de los
106 previews. No se borraron previews: están restringidos en las muestras y
conservan evidencia de PRs anteriores.

Hallazgo distinto: los cuatro despliegues de producción siguen `READY`. El alias
estable `cafeatrato.vercel.app` responde HTTP 200; las otras dos variantes de
alias verificadas redirigen a SSO. El alias estable está excluido por la
configuración `all_except_custom_domains`, por lo que su contenido permanece
público. No se inspeccionó el cuerpo para evitar registrar datos de la página y
no se pausó el sitio, porque esa acción interrumpiría una URL de producción. Esto
deja pendiente decidir su retiro o restricción.

El equipo Hobby activo ya había sido observado mediante la API del equipo. Los
términos vigentes desde el 2026-10-19 limitan Hobby a uso personal o no comercial;
el DPA de Vercel publicado aplica a clientes Pro/Enterprise. Por eso no queda
acreditada la aptitud contractual del alias productivo para el uso comercial de
Dusema POS. No se cambió el plan ni se incurrió en cargos. La configuración
actual reduce nuevas publicaciones Git, pero no elimina despliegues ni resuelve
el uso comercial del alias estable.

Revalidación autenticada del 2026-11-25 a las 11:00 UTC: `vercel teams list
--json` confirmó que `glemynarts-projects` continúa en `hobby`. `vercel inspect
https://cafeatrato.vercel.app` identificó el deployment de producción
`cafeatrato-f9n5lfjee-glemynarts-projects.vercel.app`, ID
`dpl_GoFEeU2pjnnbEgo5jR7F863swYY4`, estado `Ready`, creado el 2026-10-06 a las
04:10:07 UTC. Una solicitud HTTP al alias estable devolvió `200` con el título
«POS Empresarial».

Los [Términos de Vercel](https://vercel.com/legal/terms), actualizados el
2026-10-19, limitan Hobby a uso personal o no comercial y disponen que el
contenido del cliente en Hobby o en una prueba Pro puede utilizarse para entrenar
modelos de IA/ML. El servicio principal usa Firebase para sus datos operativos;
esta comprobación no demuestra que datos de clientes hayan sido enviados a
Vercel ni que Vercel haya entrenado modelos con contenido de Dusema. El DPA
publicado limita su cobertura a planes Pro/Enterprise; no se acredita cobertura
para el equipo Hobby observado.

El alias es una superficie pública de producción asociada a un equipo Hobby y
sirve contenido del POS. No se hizo upgrade, pausa, borrado ni cambio de alias.
La elegibilidad comercial no es una incertidumbre documental: el plan y el
estado del deployment están confirmados; falta resolver su retiro o la migración
a un plan comercial con la autorización económica correspondiente.

### Mitigación verificada — 2026-11-25 11:17 UTC

Por autorización del corte legal se retiró únicamente el alias estable
`cafeatrato.vercel.app` mediante `vercel alias remove`. No se borró ni pausó el
deployment. La comprobación HTTP posterior devolvió `404 DEPLOYMENT_NOT_FOUND`.
El dominio operativo `pos.dusema.com` quedó intacto: la raíz respondió `307` a
`/pos` y `/pos` respondió `200` desde Firebase App Hosting.

La consulta paginada de aliases del equipo encontró 123 aliases `cafeatrato-*`;
una comprobación HEAD sin seguir redirecciones obtuvo 46 respuestas `302` a SSO,
76 respuestas `410` y una `404`. También se verificaron por separado las cuatro
URLs de deployments de producción y la URL de preview del PR #706: los cinco
redireccionaron a SSO. No queda una respuesta pública `200` entre esas 123
direcciones y aliases comprobados. Esto verifica acceso HTTP, no inspecciona el
contenido protegido ni prueba ausencia de otros recursos/despliegues sin alias.

El equipo continúa en Hobby y los deployments siguen alojados en Vercel; por ello
la elegibilidad contractual de ese uso interno/remanente no se declara resuelta.
No se actualizó el plan, no se borraron deployments y no se incurrió en cargos.

## Correo

El prestador confirmó que el contacto es Gmail personal. En la instrucción de
cierre del 2026-11-26 reportó que el buzón envió y respondió una prueba desde la
misma cuenta. Se conserva como dato declarado, no como evidencia externa
independiente: no demuestra recepción desde un tercero, MFA, archivo restringido
ni continuidad operativa. No se consultó la bandeja de correo.

La [documentación Google de cuentas gestionadas](https://support.google.com/accounts/answer/181692?hl=es)
distingue el contrato empresarial de los términos de servicios adicionales.
No afirmar que el Cloud DPA cubre automáticamente el correo personal.

**Pendiente concreto:** completar la prueba externa de ida y vuelta, comprobar
protección del canal y definir el tratamiento de la correspondencia. El expediente
mínimo puede llevar identificador y enlace a entrega autenticada; no adjuntar
bases completas, credenciales o PIN. Un buzón empresarial es una alternativa,
no una compra autorizada en este corte.

## Integraciones adicionales detectadas en el código

Revisión de código: 2026-11-25. Estas integraciones aparecen en rutas o módulos
heredados; su presencia en el repositorio no demuestra que estén activas en cada
entorno. No se verificó la configuración runtime de sus variables ni los acuerdos
aplicables. Deben quedar en la política solo con alcance condicional y confirmarse
antes de habilitar esas funciones comercialmente.

| Servicio | Flujo observado | Datos que el código envía o conserva | Estado/evidencia pendiente |
|---|---|---|---|
| Wompi | Widget `checkout.wompi.co` en `/reservar`; callable de reserva crea la reserva y una intención de pago, y el webhook confirma el resultado | El formulario conserva nombre, correo, teléfono, sala/espacio, bloques y fecha en Firestore. Al widget se pasan moneda, importe, referencia, firma de integridad y llave pública; el código revisado no le pasa esos tres datos de contacto en la configuración del widget. | `RESERVAS_PUBLICAS_ENABLED` y llaves no se comprobaron en runtime. Verificar productos, contrato y política de Wompi, campos que el widget recopila y si la ruta heredada se ofrece a clientes de Dusema. |
| Make.com | `lib/eventos-service.ts` hace POST a `NEXT_PUBLIC_MAKE_WEBHOOK_URL` cuando se crea un evento y la variable existe | ID del evento, `empresaId`, título, descripción, fecha, hora, URL de imagen y categoría. La variable tiene prefijo `NEXT_PUBLIC_`; si se configura, su URL queda disponible al cliente. | No se comprobó si la variable está configurada ni quién controla el escenario destino. Confirmar finalidad, minimización, contrato/subencargados y controles contra invocaciones no autorizadas antes de habilitarlo. |
| Google Maps Platform | La landing heredada renderiza el mapa de Café Atrato con `@vis.gl/react-google-maps` | Solicitudes del navegador al servicio de mapas y coordenadas estáticas de Café Atrato; el componente revisado no entrega datos del POS al mapa. | La llave runtime y restricciones no se inspeccionaron. La página/alias público heredado sigue siendo una superficie separada que debe clasificarse. |
| Google Fonts | La landing heredada solicita Pacifico desde `fonts.googleapis.com` | Solicitud del navegador al proveedor; no se observó envío explícito de datos del tenant desde el código. | Confirmar si la landing sigue publicada y si se conserva la dependencia externa antes de describirla como activa. |
| DIAN, catálogo de documentos | El generador de tiquete construye un enlace de consulta QR cuando hay CUFE | El CUFE se incluye como `documentKey` en la URL de consulta que abre el navegador. | Es un enlace de validación documental, no un subencargado de Dusema por esta sola integración. Verificar el proveedor/flujo de facturación usado y la semántica actual del endpoint antes de afirmar que este enlace constituye una factura electrónica. |

FCM forma parte del stack Google/Firebase ya inventariado: el cliente obtiene un
token de mensajería cuando el usuario acepta notificaciones y el backend puede
enviar mensajes push. La habilitación depende de permisos del dispositivo y de la
configuración; no se atribuyen finalidades publicitarias por defecto.

**Acción correctiva documental:** antes de publicar versión definitiva, conciliar
esta tabla con variables y despliegues reales, distinguir rutas heredadas de
funciones de Dusema POS y completar los instrumentos/roles de cada proveedor.
No publicar la lista como exhaustiva hasta terminar esa conciliación.

El tipo de cuenta ya quedó confirmado como personal. La recomendación es minimizar
datos en el correo y no asumir cobertura Workspace. El plan por sí solo no decide
si cada uso es lícito o ilícito: falta contrastar finalidad, rol y salvaguardas.

## GitHub y evidencia de aceptación

Instrumento público identificado: [GitHub DPA](https://github.com/customer-terms/github-data-protection-agreement).
La URL antigua en docs redirige a un índice; no usar esa redirección como prueba
de inexistencia de DPA. Falta vincular el contrato aplicable al titular/cuenta.
La revisión no necesita enviar datos operativos a GitHub para resolverlo.

Registro recomendado por proveedor: sujeto contratante, identificador de cuenta
no secreto, productos, rol por tratamiento, instrumento/versión/fecha consultada,
fundamento de incorporación o aceptación, ubicación de evidencia restringida,
subencargados y próxima revisión. Evidencia confidencial fuera del repositorio;
en Git únicamente estado, referencia no secreta y conclusión sustentada.

## Decisiones pendientes

1. El alias estable público fue retirado y las 123 direcciones `cafeatrato-*`
   consultadas ya no sirven una respuesta HTTP pública `200`. Los deployments
   protegidos y sus contenidos siguen alojados; #704 deshabilita los nuevos
   despliegues Git automáticos. Resolver si mantener ese uso interno de Vercel
   Hobby es compatible con los términos aplicables, sin suponer cobertura DPA.
2. Acreditar contratos Google/correo/GitHub en la cuenta; no inventar firmas ni
   aceptar nuevos acuerdos en nombre del prestador sin mandato específico.
3. ADR-SAAS-100 ya fue aceptado para implementación y pruebas controladas. Completar
   exportación sintética/local y sus gates antes de ofrecer una entrega real.
   ADR-SAAS-099 autoriza por separado la implementación de aceptación versionada;
   ninguno autoriza escrituras, extracción o exigibilidad en producción.
4. Confirmar las integraciones condicionales Wompi, Make.com, Maps, Fonts y FCM
   descritas arriba y revisar el CUFE del QR DIAN; no inferir estado activo por
   existencia de código.

### Retirada de previews — 2026-11-25 15:20 UTC

La lista autenticada del proyecto `cafeatrato` devolvió 106 deployments de
preview y ninguno tenía alias personalizado. Se retiraron los 106; la consulta
posterior devolvió cero y un endpoint archivado responde 404. El manifiesto de
URLs, estado y fecha, sin identidad de creador, está en
`evidence/vercel-cafeatrato-previews-2026-11-25.json` con SHA-256
`59a79ada6f26a03545e5de2b50b396a9a3b57a3361c3b4ba4fc85db20b9c19fd`.

Se conservaron los cuatro deployments `production` ocultos por SSO para no
borrar artefactos de producción sin autorización específica. No tienen alias
personalizado y cada URL consultada devuelve 302 a SSO. Firebase App Hosting
sigue prestando `pos.dusema.com/pos`; la ruta respondió 200 después de la
limpieza. El equipo Vercel sigue en Hobby y los cuatro despliegues/proyecto
remanentes no quedan acreditados como compatibles con sus términos no comerciales
ni con el DPA Pro/Enterprise. No hubo cambio de plan o cobros. Este pendiente
requiere retirar esos artefactos/proyecto o resolverlo mediante un plan/contrato
comercial autorizado; no se presume que la retirada de previews lo resuelva.

### Revalidación HTTP pública — 2026-11-26 13:49 UTC

Solicitudes `GET` sin autenticación confirmaron que `https://cafeatrato.vercel.app`
ahora devuelve HTTP 404. Esto corrige la disponibilidad observada anteriormente
del alias estable, pero no demuestra que los cuatro deployments `production`
protegidos se hayan borrado, que el proyecto Vercel esté eliminado o que sus
artefactos hayan expirado. No se modificó el plan, los deployments, el proyecto
ni sus permisos. `pos.dusema.com` redirige al POS en App Hosting; las rutas
legales productivas siguen incompletas. El uso comercial previo/persistente del
equipo Hobby y la cobertura del DPA no se consideran resueltos por el 404 del
alias público.

### Revalidación Vercel y dominio operativo — 2026-11-26 15:12 UTC

`vercel project inspect cafeatrato --scope glemynarts-projects` confirmó el
proyecto `cafeatrato` en el equipo `glemynarts-projects`. La lista autenticada
actual devolvió cuatro deployments, todos con `target=production` y sin alias;
las cuatro URLs directas respondieron HTTP `302` al comprobarlas sin seguir
redirecciones. Esta respuesta no inspeccionó contenido ni prueba por sí sola el
destino de SSO. No se encontró alias público en la lista de deployments.

El dominio operativo no depende de ese proyecto: `pos.dusema.com/` respondió
`307` y `/pos` respondió `200` en la comprobación HEAD sin seguir redirecciones.
La consulta de producción legal quedó registrada en
[`CIERRE-COMPROBACIONES-2026-11.md`](CIERRE-COMPROBACIONES-2026-11.md).

Se intentó pausar `cafeatrato` para mantener sus artefactos sin atender tráfico.
La CLI devolvió `interactive_confirmation_required` y ordenó que una persona
ejecute el comando en una terminal interactiva y escriba el nombre del proyecto;
por tanto, **no se pausó ni cambió el proyecto**. La acción no se eludió mediante
API. Si el propietario confirma manualmente esa pausa, Vercel documenta que el
proyecto puede reanudarse desde Settings o REST API y que las visitas mostrarán
`503` mientras permanezca pausado ([gestión oficial de proyectos Vercel](https://vercel.com/docs/projects/managing-projects)).

El equipo sigue observado como Hobby, cuyos términos limitan el plan a uso
personal/no comercial; el DPA publicado aplica a planes Pro/Enterprise. La
pausa aún no está ejecutada y no equivale a borrar los artefactos, cerrar la
cuenta o resolver la cobertura contractual. No se modificó el plan, no se
borraron deployments y no se incurrió en cargos. El siguiente paso externo
concreto es que el propietario confirme la pausa escribiendo el nombre del
proyecto en la CLI interactiva; el dominio de POS permanece en App Hosting.

### Proyecto Vercel de staging separado — 2026-11-28

La revalidación ampliada enumeró `saa-s-web`, un proyecto separado del proyecto
histórico `cafeatrato`, ligado al repositorio público `Glemynart/SaaS` (`apps/web`)
y al dominio `staging.dusema.com`. El proyecto tiene despliegues Git activos y
la protección SSO excluye dominios personalizados. Solicitudes HTTP anónimas de
solo encabezados a `staging.dusema.com` y `saa-s-web-two.vercel.app` devolvieron
200. No se leyó el contenido ni se verificó si la app pertenece al alcance del
POS o procesa datos personales de sus clientes.

La consulta reportó 591 previews paginados (531 `READY`, 60 `CANCELED`) con
fechas del 2026-10-29 al 2026-11-17. La retención configurada en la API es de
30 días/conservar 10, lo que no demuestra purga efectiva. El equipo continúa en
Hobby; los [términos vigentes](https://vercel.com/legal/terms) limitan Hobby a
uso personal/no comercial y contemplan uso de contenido para entrenamiento de
modelos. El [DPA vigente](https://vercel.com/legal/dpa) aplica a clientes Pro y
Enterprise, no a Hobby. No se examinó tráfico, datos, configuración de IA o
variables/secretos. No se puede certificar ni que datos del POS se enviaron ni
que exista cobertura DPA aplicable para ese proyecto.

No se pausó, restringió, borró o migró este staging: pertenece a un proyecto y
repositorio separados, su dominio personalizado está activo y cambiar su acceso
podría interrumpir el trabajo de ese equipo. Tampoco se cambió de plan ni se
generaron costos. Resolver si se retira/migra o si se adopta un plan/contrato
comercial compatible queda como bloqueo externo; consultar
[`VERCEL-PROYECTOS-DUSEMA-READONLY-2026-11-28.md`](evidence/VERCEL-PROYECTOS-DUSEMA-READONLY-2026-11-28.md)
para la evidencia detallada.

### Corrección de inventario y protección de Vercel — 2026-11-26 16:08 UTC

La observación de las 15:12 que decía que las cuatro URLs no tenían alias se
basó en `vercel ls`, cuya salida no incluye el arreglo `aliases` de cada
Deployment. La reconsulta distingue metadatos de alias y respuesta pública:

- `vercel ls cafeatrato --scope glemynarts-projects --environment production`
  devolvió cuatro deployments `READY`, todos `target=production`; la metadata
  incluye el alias de rama `cafeatrato-git-main-glemynarts-projects.vercel.app`.
- `vercel inspect` del deployment `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`
  devolvió aliases de proyecto y rama: `cafeatrato-glemynarts-projects.vercel.app`
  y `cafeatrato-git-main-glemynarts-projects.vercel.app`.
- Se hicieron solicitudes HEAD sin credenciales a las cuatro URLs directas de
  deployment y a ambos aliases. Las seis respondieron `302` a `vercel.com/sso-api`;
  al seguir la redirección terminaron en `vercel.com/login` (`200`), no en la
  aplicación. `cafeatrato.vercel.app` devuelve `404`.
- **Conclusión corregida:** los deployments y aliases siguen existiendo, pero
  las seis direcciones comprobadas están protegidas por SSO y no sirvieron
  contenido de aplicación a una solicitud anónima. Esta prueba no acredita que
  todos los recursos o artefactos estén protegidos ni elimina la restricción
  comercial del plan Hobby. No se pausó ni eliminó el proyecto, no se borraron
  deployments y no se cambió el plan.

El plan Hobby y la aptitud contractual siguen pendientes; la pausa requiere que
el propietario confirme el nombre del proyecto en la terminal interactiva. Esta
corrección sustituye solo las conclusiones previas de «sin alias» y no cambia la
fecha de la consulta anterior.

### Revalidación read-only — 2026-11-27 09:10 UTC

Con Vercel CLI 62.1 autenticada, `vercel ls cafeatrato --scope
glemynarts-projects --environment production` volvió a listar cuatro deployments
`READY` de producción. `vercel api GET /v9/projects/{id}` devolvió
`gitProviderOptions.createDeployments=disabled`; no se hicieron escrituras ni se
crearon deployments. El proyecto continúa activo en Hobby y sus artefactos de
producción no fueron pausados ni borrados.

Se comprobó con HEAD anónimo, sin seguir redirecciones, cada una de las cuatro
URLs de deployment listadas, los aliases de proyecto y rama observados en la
metadata, y el alias estable `cafeatrato.vercel.app`. Las primeras seis
respondieron `302` a `vercel.com/sso-api`; el alias estable respondió `404`.
Esto acredita protección frente a esas solicitudes anónimas puntuales, no
elimina los artefactos, no inspecciona el contenido tras autenticación y no
prueba el estado de todo recurso no enumerado. `gitProviderOptions` deshabilita
la creación automática Git observada, pero el equipo sigue en Hobby: su
compatibilidad con uso comercial y la cobertura contractual/DPA permanecen
pendientes.
