# Operación, proveedores y conservación — decisión operativa para borrador 0.6

Fecha: 2026-11-26. Estado: **DECISIÓN OPERATIVA DEL PRESTADOR PARA EL BORRADOR 0.6; NO PUBLICADA NI ACTIVADA**.
La fecha objetivo es 2026-12-15 00:00, hora de Colombia, condicionada a cerrar
los gates. Esta decisión no activa contratos, no prueba capacidad técnica ni
ejecuta borrado, exportación, migración o cambios de proveedor.

La [comprobación posterior](CIERRE-COMPROBACIONES-2026-11.md) registró Gmail
personal, términos online Google, soft delete de siete días en los buckets
examinados y sinks globales de Cloud Logging con retenciones de 30/400 días. Los
plazos se seleccionaron para el borrador 0.6; aún no son compromisos vigentes ni
tareas configuradas.
La evidencia es de recursos concretos; no acredita una retención uniforme para
todos los servicios, proyectos, cuentas, clientes o ubicaciones.

## 1. Evidencia comprobada

Consulta remota exclusivamente de metadatos en `micafe-pos`, el 2026-11-23. Los
valores que siguen son una observación histórica de esa fecha; la revalidación
posterior consta en la subsección 1.1:

- Firestore `(default)` en `southamerica-east1` (Brasil); PITR deshabilitado.
- Schedule diario `fa16b7c4-ecb8-418f-bf3a-815da592fabc` con retención
  `3024000s`, equivalentes a 35 días. Coincide con ADR-SAAS-031.
- Dos backups recientes en `READY`: snapshots de 2026-11-23 13:37:49Z y
  2026-11-22 13:33:18Z; vencen respectivamente 2026-12-28 y 2026-12-27.
- Servicio Cloud Run `micafe-pos`, gestionado por Firebase App Hosting, en
  `us-central1` (EE. UU.); última revisión Ready observada
  `micafe-pos-build-2026-11-03-001`. Esta consulta no certifica SHA ni tráfico.
- Bucket `micafe-pos.firebasestorage.app` y dos buckets de fuentes/uploads de
  Functions en `US-CENTRAL1`; el soft delete observado permite recuperación por
  siete días después del borrado lógico. No se listaron objetos ni se leyeron
  archivos del cliente, y no se hizo un borrado de prueba que certifique su
  expiración. La retención del backup Firestore no cubre automáticamente Storage.
- Cloud Logging global observado: `_Default` retiene 30 días y `_Required` 400
  días. Son configuraciones de los sinks examinados, no un plazo pactado de
  conservación de todos los logs ni una demostración de que no existan otros
  buckets, vistas o copias. El contenido y la clasificación de cada registro
  requieren inventario adicional.

### 1.1 Revalidación de metadatos — 2026-11-25 16:05 UTC

Consultas de solo lectura en los proyectos `micafe-pos` y
`micafe-pos-staging`; no se leyeron payloads Firestore ni contenido de objetos,
y no se modificó ninguna política:

- En producción, `gcloud firestore databases list` confirmó `(default)` en
  `southamerica-east1`. `gcloud firestore backups schedules list` devolvió un
  schedule diario con `retention=3024000s` (35 días). En staging, la misma
  consulta devolvió una lista vacía: no se observó un schedule de backups.
- En producción, `gcloud logging buckets describe` confirmó `_Default` en 30
  días y `_Required` en 400 días. Solo se consultaron esos buckets globales.
- `gcloud storage buckets list` mostró tres buckets de producción en
  `US-CENTRAL1`. Sus metadatos raw informan soft delete de `604800s` (7 días)
  en cada uno y no muestran `retentionPolicy` bucket-level. Esto describe la
  posibilidad de recuperación configurada; no prueba una purga física.
- Para `micafe-pos.firebasestorage.app`, el metadato raw informa
  `uniformBucketLevelAccess=false` y `publicAccessPrevention=inherited`.
  La ACL del bucket, la ACL predeterminada de objetos y la política IAM no
  contienen `allUsers` ni `allAuthenticatedUsers`. Una enumeración paginada de
  ACL de objetos con `projection=full` recorrió los siete objetos activos y no
  encontró ACL pública. No se descargó contenido. Este resultado no audita
  objetos en soft delete, contenido público permitido por Firebase Storage
  Rules ni servicios ajenos a ese bucket.
- En staging, el bucket `micafe-pos-staging-e2-2-prov-192423427245` tiene
  retención bucket-level de `2592000s` (30 días), soft delete de siete días y
  prevención de acceso público `enforced`. El bucket
  `micafe-pos-staging-e2-2-src-192423427245` tiene soft delete de siete días y
  prevención `enforced`, sin retención bucket-level reportada. Los buckets de
  fuentes/uploads de Functions también reportan soft delete de siete días.

La evidencia de comandos y resultados del corte se documenta en
[`CIERRE-COMPROBACIONES-2026-11.md`](CIERRE-COMPROBACIONES-2026-11.md). Son
metadatos de recursos observados, no prueba de vencimiento real, supresión
integral, ausencia de copias, configuración de cada servicio o plazo contractual
aprobado. Los plazos de esta propuesta permanecen sin aprobar ni activar.

Comprobación de código, no de telemetría ni de configuración de cuentas:

- `lib/firebase.ts`: caché persistente Firestore con múltiples pestañas.
- `app/layout.tsx` en `main@aa1c4fe`: PR #704 retiró `@vercel/analytics` del
  layout productivo. No se certifica la recepción histórica de eventos.
- `functions/src/email-invitation-delivery.ts`: puerto de entrega pendiente;
  no integra un proveedor real de invitaciones en esa implementación.
- `lib/bodega/financial-report.ts`: CSV de ventas operativas; no es una
  exportación completa de tenant ni un respaldo restaurable.
- `app/(tenant)/admin/(authenticated)/soporte-saas/page.tsx`: el admin puede
  autorizar, rechazar y revocar diagnóstico temporal de solo lectura. Ese flujo
  no es una mesa de ayuda general ni un gestor de reclamaciones legales.

No se observaron valores de secretos ni datos comerciales. No se consultó la
bandeja de correo. La existencia de un SDK o una región no acredita aceptación
del contrato del proveedor, todos sus subencargados o la ubicación de cada dato.
El conjunto de metadatos es parcial: se observó Firestore en `southamerica-east1`
(Brasil), Cloud Run y buckets indicados en `us-central1`/`US-CENTRAL1` (EE. UU.).
No acredita por sí solo la ubicación de Auth, FCM, soporte, telemetría, réplicas,
subencargados ni transferencias de cada dato personal.

## 2. Roles y solicitudes sobre datos

El negocio tenant decide finalidades y medios esenciales de los datos que usa
para su propia operación; en esos tratamientos es responsable. Dusema actúa como
encargado si trata esos datos bajo instrucciones verificadas. Dusema será
responsable independiente de los datos cuyo propósito determine para su propia
contratación, facturación, seguridad o administración. La asignación se hace por
actividad y debe constar en el inventario; una solicitud dirigida a Dusema no
convierte al administrador del tenant en representante automático del titular.

Cada parte debe designar la persona o área que recibe y tramita derechos de los
titulares. Para datos de un tenant, la recepción por Dusema se registra desde la
fecha original, se comunica al negocio y se presta asistencia sin trasladar ni
reiniciar términos legales. No se entrega información al negocio ni se modifica
o suprime el registro sin verificar legitimación e instrucción, salvo deber legal
propio u orden competente. El flujo de Backoffice no envía el correo externo y
no sustituye un procedimiento operativo completo.

Las funciones de cartera registran cuentas por cobrar entre negocios; no
acreditan por sí solas autorización para reportar datos a operadores de
información o para perfilar riesgo. La Ley 2573 de 2026, junto con las Leyes
1266 de 2008 y 1581 de 2012, debe revisarse antes de tramitar una oposición al
cobro que alegue suplantación o de habilitar cualquier reporte. La definición de
los «establecimientos comerciales con esta competencia» requiere evaluación
jurídica para el negocio y la operación concretos; no se presume cobertura ni
exclusión.

## 3. Inventario de proveedores

| Proveedor/servicio | Tratamiento identificado | Evidencia y pendiente |
|---|---|---|
| Google / Firebase / Google Cloud | Autenticación, base de datos, ejecución, hosting, archivos, logs y notificaciones según funciones habilitadas | Servicios en código; regiones anteriores confirmadas para recursos indicados. Vincular cuenta/contrato aplicable, versiones de términos y subencargados. No atribuir residencia Brasil a Auth, FCM o soporte sin evidencia específica. |
| Vercel | Artefactos y builds heredados; App Hosting sirve el POS | PR #704 retiró Analytics y detuvo nuevos despliegues Git. El 2026-11-25 se retiraron 106 previews y el alias público `cafeatrato.vercel.app`; la lista posterior devolvió cero previews. Las cuatro URLs directas de deployments `Production` consultadas redirigieron a SSO. Entre 123 aliases históricos comprobados, 46 redirigieron a SSO, 76 devolvieron 410 y el alias estable retirado devolvió 404. `pos.dusema.com` sigue servido por Firebase App Hosting. El equipo observado continúa en Hobby. Los [Términos de Vercel](https://vercel.com/legal/terms), actualizados el 2026-10-19, restringen Hobby a uso personal o no comercial; SSO limita acceso, pero no cambia esa restricción contractual. No se hizo upgrade, no se borraron los cuatro deployments ni se incurrió en cargos. El uso residual debe retirarse o resolverse con un plan/contrato comercial antes de servir tráfico comercial desde Vercel; no se declara aptitud contractual. Véase [evidencia del proveedor](PROVEEDORES-EVIDENCIA-2026-11.md). |
| Google / correo Gmail indicado por el prestador | Consultas, soporte y reclamaciones que se envíen a `segucor0526@gmail.com` | Correo declarado por el titular. No se ha verificado recepción, administración, MFA, retención ni si existe contrato empresarial. No equiparar automáticamente Gmail personal con Workspace contratado. |
| GitHub | Código, CI, PR y evidencias de desarrollo | Repositorio y CI existentes. Evitar datos personales de clientes, secretos y dumps en logs/artefactos. No es el respaldo de la base operativa. Revisar contrato y retención efectiva de artefactos. |

No se agrega Cloudflare, una pasarela o un SMTP como proveedor efectivo por
aparecer en una CSP o una consulta DNS inconclusa. Facturación electrónica,
pagos o integraciones futuras requieren su revisión al habilitarse.

Instrumentos públicos identificados, cuya existencia no prueba aceptación por
la cuenta ni suficiencia para cada tratamiento:

- [Términos Firebase](https://firebase.google.com/terms),
  [tratamiento y seguridad](https://firebase.google.com/terms/data-processing-terms),
  [subencargados](https://firebase.google.com/terms/subprocessors).
- [DPA Vercel](https://vercel.com/legal/dpa): comprobar alcance por plan y contrato;
  no trasladar condiciones de Enterprise/Pro a otra cuenta sin confirmación.
- [Privacidad de Analytics](https://vercel.com/docs/analytics/privacy-policy):
  revisar campos/eventos, URL y exclusión de identificadores sensibles.

Actualización verificada: el equipo Vercel consultado está en plan Hobby. No
atribuirle cobertura del DPA Pro/Enterprise ni asumir aptitud para uso comercial.
Véase [evidencia contractual](PROVEEDORES-EVIDENCIA-2026-11.md).

**Estado:** PR #704 retiró Analytics del código y detuvo nuevos despliegues Git
automáticos en Vercel. La política final debe describir con precisión los
despliegues históricos que permanezcan accesibles. No reactivar Analytics ni
despliegues comerciales Vercel sin revisar previamente el plan y el instrumento
contractual aplicable.

El Decreto 1074 exige que el contrato de transmisión defina el alcance, las
actividades del encargado y sus obligaciones, incluida la seguridad y la
confidencialidad. El inventario anterior no equivale a ese contrato ni acredita
que un DPA público cubra esta cuenta o este plan. Antes de habilitar un proveedor
con datos personales se debe confirmar el producto y cuenta, la relación de rol,
el acuerdo aplicable, la lista y localización de subencargados y el mecanismo de
notificación/cambio. La transferencia a otro responsable se evalúa separada de
la transmisión a un encargado. La Circular SIC 002 de 2025 trata casos de
transferencia de tecnología con datos personales o tecnologías para tratarlos;
no se usa aquí como regla general para toda operación SaaS.

## 4. Matriz de conservación seleccionada para el borrador 0.6

Los plazos de esta tabla son **decisiones operativas del prestador para el
borrador 0.6**, salvo la obligación legal expresamente indicada. No son plazos
generales impuestos por la ley ni compromisos activados. No se han configurado
TTL ni tareas de eliminación.

| Categoría | Plazo previsto y punto de partida | Disposición y límite |
|---|---|---|
| Datos operativos del negocio | Durante el contrato; ventana para solicitar salida de 30 días calendario tras terminación efectiva | No confundir suspensión temporal por impago con terminación. Objetivo de suprimir o anonimizar datos prescindibles de sistemas activos dentro de 60 días calendario, tras verificar entrega, instrucciones/dependencias y ausencia de deber documentado de conservación. |
| Usuarios y membresías exclusivos del tenant terminado | Retirar acceso ordinario al terminar; objetivo de depuración dentro del mismo plazo de 60 días | Verificar dependencias y otros tenants antes de borrar identidad Auth; no borrar UID compartido, credenciales de otro negocio ni evidencia sujeta a conservación. |
| Logs de Cloud Logging observados | `_Default`: 30 días; `_Required`: 400 días | Configuración observada para sinks globales concretos, no política uniforme de Dusema. Falta inventariar contenido, sinks/buckets adicionales y retenciones propias. No prometer supresión anterior a la expiración efectiva del proveedor. |
| Soporte ordinario | Hasta 12 meses desde cierre del caso | Eliminar adjuntos innecesarios antes y anonimizar métricas. Si el caso es reclamación/contrato/incidente, clasificar su evidencia por fundamento, sin conservar toda la bandeja por defecto. |
| Libros y papeles de comercio del propio prestador | Diez años desde último asiento, documento o comprobante, cuando corresponda a esa categoría | Art. 28 Ley 962/2005. Determinar documentos concretos con revisión contable/jurídica. No aplicar automáticamente a todo el tenant ni a toda telemetría. |
| Aceptaciones y autorizaciones | Durante la relación y el plazo legal que corresponda a cada evidencia | Clasificar si son papeles de comercio sujetos a diez años; si no, conservar solo el fundamento y plazo específico. Retener solo documento/versiones y datos probatorios necesarios. No suplir esta decisión con retención infinita. |
| Recordatorio de código en dispositivo | Hasta que el usuario lo desactive, borre almacenamiento o se aplique la política de dispositivo | Es opcional y solo guarda el código. Advertir uso de dispositivos compartidos. No prometer limpieza remota de todos los navegadores. |
| Caché Firestore, PWA y sesión en dispositivo | Ligada al ciclo de uso y cierre seguro de sesión | Pendiente probar limpieza/aislamiento efectivo. No afirmar que logout elimina IndexedDB: no se encontró una limpieza explícita en las superficies inspeccionadas. |
| Backups Firestore | 35 días desde cada snapshot, según el schedule observado | PITR estaba deshabilitado y había snapshots `READY`; no se ejecutó restauración. Un dato eliminado de sistemas activos puede seguir en snapshots existentes hasta su expiración. El cálculo condicional de hasta 95 días (60 días objetivo + 35 de backup) no incluye copias adicionales y no es una garantía global. |
| Objetos de los buckets Storage examinados | Soft delete observado: recuperación durante 7 días desde el borrado lógico | Es una configuración observada; no se certificó expiración de un objeto de prueba ni todos los buckets/versiones/copias. No equivale a un máximo de borrado físico en todo Google Cloud. |
| Exportaciones y otras copias | Sin ciclo completo acreditado | No están inventariados todos los destinos, archivos temporales, copias de proveedor o cachés. No prometer un máximo global antes de cerrar el inventario y ensayar los ciclos. |

La supresión en producción no se ha ejecutado ni certificado. La herramienta de
supresión se ensayó solo con datos sintéticos en Firestore Emulator; no elimina
datos reales de Firestore, Firebase Auth, Storage, logs, dispositivos, respaldos
ni subencargados. La exportación integral tampoco está certificada: no se leyeron
payloads reales y no se realizó una entrega. `productionExportCertified=false`.
Un estado de tenant eliminado o un borrado de la base activa no demuestra por sí
solo supresión de toda copia.

Toda excepción por obligación legal o litigio debe identificar categoría,
fundamento, alcance mínimo, responsable y próxima revisión. No seguir usando esos
datos en operación ordinaria o publicidad. La restauración debe reaplicar el
registro de supresiones y restricciones antes de devolver acceso; restaurar un
backup no autoriza resucitar tratamientos ya terminados.

**Límite del cálculo de 95 días:** no es plazo de eliminación física total.
Los términos públicos Google contemplan otros ciclos de eliminación interna en
sus respectivos supuestos, incluidos máximos de hasta 180 días; su cómputo y
aplicabilidad dependen del contrato/operación. No publicar un máximo global de
35/95 días para todos los sistemas. Antes de fijarlo deben distinguirse datos
activos, snapshots controlados, copias de servicio y excepciones legales.

## 5. Soporte, privacidad y reclamaciones

Propuesta comercial fuera de esta decisión: atención lunes a viernes, 08:00–17:00, hora
de Colombia, excepto festivos. Objetivo inicial de respuesta de soporte: dos días
hábiles. No es compromiso vigente de resolución ni servicio 24/7. No reduce
términos legales, cuya recepción y cómputo se registran desde la fecha real de
entrada, aunque llegue fuera del horario propuesto.

Canales declarados: correo `segucor0526@gmail.com` y teléfono `3103337837`;
pertenecen a la persona natural identificada como prestador. El prestador designó
a Sebastián Agudelo Muñoz como contacto operativo principal de privacidad para
solicitudes dirigidas a Dusema. No hay suplente, lo que representa un riesgo de
continuidad, no una exigencia legal autónoma identificada; esto tampoco declara
cobertura continua. Aún no se comprobaron recepción, seguridad de la cuenta ni archivo
restringido; tampoco se activa el procedimiento hasta validar un medio de
recepción y conservación con acceso restringido. No anunciar el teléfono como
WhatsApp. Para datos tratados por cuenta de un tenant, este contacto coordina
con su responsable sin sustituirlo ni cambiar sus instrucciones.

Procedimiento ejecutable manualmente sin crear una nueva base de clientes:

1. Recibir y asignar consecutivo; registrar recepción, remitente mínimo, tenant
   si corresponde, tipo de petición y canal de respuesta en un registro de acceso
   restringido. No usar Issues/PR públicos como expediente legal.
2. Clasificar soporte, consulta de datos, reclamo de datos, reclamo de consumo,
   incidente o solicitud de salida. Aplicar plazo legal de cada tipo; una consulta
   de datos no tiene el mismo plazo que una falla técnica.
3. Verificar identidad/representación de manera proporcional; nunca pedir PIN ni
   aceptar captura de credenciales como verificación.
4. Consultas de datos: diez días hábiles y extensión motivada de hasta cinco.
   Reclamos de datos: quince días hábiles y extensión motivada de hasta ocho,
   con los demás pasos de la política. Reclamo directo de consumo: quince días
   hábiles cuando ese régimen aplica.
5. Si Dusema es encargado, remitir al responsable y asistir sin entregar datos de
   terceros. Mantener fecha, remisión y evidencia del trámite. La anotación de
   reclamo debe llegar al registro afectado por mecanismo autorizado; anotarla
   solo en correo no acredita ese paso.
6. Responder por el canal adecuado y conservar evidencia de entrega y cierre.
   Revisar vencimientos cada día hábil. Registrar causa y comunicación de las
   extensiones dentro de sus límites.

### Respuesta a incidentes de seguridad de datos personales — borrador operativo

Este flujo orienta la respuesta; no está certificado ni reemplaza las
instrucciones vigentes de la SIC. Sebastián Agudelo Muñoz es el contacto
operativo principal designado por el prestador. No se ha designado suplente;
esta es una brecha de continuidad, no una condición legal autónoma identificada.
Antes de activarlo faltan comprobar acceso a los canales de reporte y realizar un
simulacro con datos sintéticos. Mientras tanto, el incidente se escala de
inmediato al prestador y no se declara que existe cobertura continua.

1. **Recibir y contener.** Abrir un expediente restringido. Registrar hora de
   detección, quién detectó, hora en que se informó al área designada, fuente,
   sistemas/tenants potencialmente afectados y acciones iniciales. Proteger
   personas y datos, limitar accesos comprometidos y preservar evidencia útil;
   no borrar registros, alterar evidencia ni poner secretos o datos personales
   en Issues, PRs o chats públicos.
2. **Evaluar alcance y roles.** Determinar qué datos personales, titulares,
   operaciones, productos, proveedores y regiones pueden estar afectados; separar
   hechos verificados de hipótesis; identificar si Dusema actúa como responsable,
   encargado o ambos por tratamientos diferentes. Coordinar con el negocio
   responsable y subencargados sin divulgar información de otros tenants.
3. **Calcular el plazo regulatorio.** La SIC indica que el reporte aplicable se
   realiza dentro de los quince (15) días hábiles siguientes al momento en que
   el incidente se detecta y se pone en conocimiento de la persona/área encargada
   de atenderlo. No esperar a terminar la investigación para iniciar el cómputo.
   Si el responsable está obligado a inscribir bases en el RNBD, el reporte se
   presenta por ese registro; los responsables no obligados y los encargados usan
   el aplicativo/canal de incidentes dispuesto por la SIC. Para el prestador
   actual, el RUT aportado lo identifica como persona natural. El artículo
   2.2.2.26.1.2 del Decreto 1074 de 2015 y la orientación de la SIC limitan la
   inscripción obligatoria a las categorías allí previstas; con la evidencia
   actual no se atribuye a Dusema persona natural deber de inscripción en RNBD.
   Esta conclusión cubre solo al prestador actual y debe revalidarse si cambia
   la persona contratante o se constituye una persona jurídica. No elimina las
   demás obligaciones de protección de datos. Cada tenant debe clasificar por
   separado su propia obligación. Para incidentes propios de Dusema, el canal
   SIC aplicable a responsables no obligados sigue pendiente de prueba operativa.
4. **Reportar y coordinar.** El responsable del caso prepara un reporte factual,
   presenta la comunicación SIC por el canal aplicable dentro del término y
   conserva número/acuse. Si Dusema es encargado, notifica al negocio responsable
   y coopera con la decisión del responsable; no retrasa un deber regulatorio
   propio esperando una instrucción del tenant. Las comunicaciones a titulares,
   autoridades adicionales y clientes se deciden por el rol, los hechos, la ley
   y los contratos concretos; no se promete aviso universal ni se omite uno
   exigible por esperar certeza absoluta.
5. **Cerrar y prevenir repetición.** Registrar línea de tiempo, impacto,
   decisiones, destinatarios, medidas, evidencia de entrega y responsable de
   cada acción correctiva. Revisar la conservación de evidencia y el acceso al
   expediente; documentar hallazgos confirmados y pendientes. Cerrar solo cuando
   las obligaciones aplicables se hayan atendido o tengan un dueño y vencimiento.

Registro mínimo del caso: identificador restringido; fecha/hora de detección y
conocimiento del área; roles por tratamiento; sistemas/tenants/categorías
afectados; nivel de certeza; decisiones y fundamentos; plazo y canal SIC;
notificaciones requeridas; medidas de contención y recuperación; referencias a
evidencia; responsable, suplente si existe, vencimientos y cierre. No copiar payloads,
credenciales o datos de otros negocios a este registro.

El término de reporte SIC y los canales se verifican con el [concepto oficial de
la SIC sobre reporte de incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad)
y las instrucciones vigentes al momento del evento. El reporte no sustituye el
objetivo de aviso contractual del encargado ni las demás obligaciones aplicables.
La clasificación del RNBD se contrasta con el [artículo 2.2.2.26.1.2 del
Decreto 1074 de 2015](https://cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm)
y la [orientación de la SIC sobre responsables obligados al
RNBD](https://sedeelectronica.sic.gov.co/index.php/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd).

## 6. Salida y entrega de datos

Decisión operativa para el borrador 0.6: aceptar solicitudes de entrega dentro
de 30 días calendario desde terminación; responder con alcance y método en dos
días hábiles y entregar ordinariamente dentro de diez días hábiles desde
verificar identidad/representación. No es una obligación legal general de
exportar un tenant completo en ese plazo y no se vuelve compromiso activo hasta
publicar/aceptar los documentos y certificar el proceso. Los derechos de acceso
de titulares se atienden por su régimen propio.

El borrador establece una entrega estándar por terminación sin cargo adicional;
trabajos extraordinarios requerirán presupuesto y autorización previa. Esta
condición no está activa mientras los documentos sigan en preparación.

Formato propuesto: CSV/JSON con IDs, referencias, moneda y fechas UTC, más archivos
propios autorizados y manifiesto de alcance, conteos y hashes. Verificar ausencia
de información de otros tenants y excluir secretos, hashes de PIN, tokens,
credenciales e información de plataforma ajena a la entrega. Entregar por canal
autenticado y restringido; evitar adjuntar dumps completos a Gmail.

**Limitación actual:** el CSV de reportes es parcial. El exportador local de
ADR-SAAS-100 tiene lectura acotada por tenant, allowlists versionadas, cifrado y
pruebas con datos sintéticos; clasifica las 48 raíces observadas. No se leyeron
payloads reales ni se realizó una entrega. `productionExportCertified=false`:
faltan verificar esquemas históricos, referencias, subcolecciones y consistencia
de `readTime` con evidencia representativa antes de usarlo con datos reales. Un
export Firestore de toda la base puede incluir otros clientes y no se entrega al
negocio.

Preparación técnica: [ADR-SAAS-100](../../ADR-SAAS-100-exportacion-salida-tenant.md)
está aceptado para implementación y pruebas controladas. El ejecutor local de
supresión solo admite fixtures sintéticos en Firestore Emulator; no borra datos
productivos, Auth ni Storage, ni demuestra eliminación física de respaldos.
Ninguna de estas herramientas está certificada para una salida real.

La ventana de salida no obliga a mantener ventas o escrituras después del fin
contractual. Solicitud tardía, obligación de conservación o disputa requieren
revisión del caso y derechos aplicables; no autoriza una eliminación precipitada.

## 7. Comprobaciones restantes para poder publicar y activar las decisiones

- Probar que los plazos de salida/conservación pueden cumplirse y desarrollar o
  asignar responsables a las tareas de supresión todavía manuales.
- Fijar fundamento y plazo de evidencia legal no cubierta por papeles de comercio.
- Acreditar términos aplicables de Google, Vercel y correo sin compartir secretos.
- Verificar los canales de privacidad de Dusema y el registro de acceso
  restringido; Sebastián Agudelo Muñoz está designado como contacto principal.
  No hay suplente ni cobertura continua, un riesgo de continuidad y no una
  condición legal autónoma identificada. Cada negocio debe identificar su
  propio responsable para los datos que trata.
- Determinar si la operación de cartera del tenant cae bajo Ley 1266 de 2008 o
  Ley 2573 de 2026 antes de habilitar procesos de reporte o atención de
  suplantación; el repositorio no resuelve el alcance para establecimientos
  comerciales con esta competencia.
- Conciliar flujos activos con cada proveedor, país/región, subencargado,
  instrumento y categorías de datos; no habilitar integraciones sin clasificar.
- Verificar registro restringido de casos, recepción del canal, manejo de adjuntos
  y proceso de supresión; escoger archivo/procedimiento con control de acceso.
- Validar con fixtures y casos autorizados la exportación completa, supresión,
  ciclo Storage, backups, logs y caché local. No prometerlos como implementados
  por estar escritos en una política.
- ADR-SAAS-099 está aceptado para implementar aceptación legal versionada; esa
  aprobación no finaliza los textos ni activa exigibilidad frente a Diana.

## Fuentes

- [Ley 962/2005, artículo 28](https://normativa.archivogeneral.gov.co/ley-962-de-2005/).
- [SIC: temporalidad](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Concepto_13-183213.pdf).
- [SIC: reclamo directo](https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor/derechos-y-deberes/fallas-en-un-producto).
- [SIC: incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad).
- [Ley 1581 de 2012, arts. 14, 15, 17 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Decreto 1074 de 2015, arts. 2.2.2.25.4.4 y 2.2.2.25.5.1–.2](https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf).
- [SIC, concepto sobre Firebase y transmisión por cuenta del responsable](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/uso-de-firebase-en-almacenamiento-de-datos-y-cumplimiento-normativo-en-colombia).
- [SIC, alcance de la Circular 002 de 2025](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos).
- [Ley 2573 de 2026](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_2573_2026.htm).

Los plazos operativos 30/60 días y 12 meses, y la entrega de salida, no provienen
de una obligación general de SaaS. El prestador los seleccionó para el borrador
0.6; no están activados ni deben ofrecerse hasta pasar la revisión factual,
jurídica y técnica correspondiente.
