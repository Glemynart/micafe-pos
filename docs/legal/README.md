# Dusema POS — borradores legales

Estado: **BORRADOR PARA REVISIÓN; NO VIGENTE NI EXIGIBLE COMO NUEVA VERSIÓN**.
Preparación: 2026-11-23; revisiones documentales: 2026-11-25, 2026-11-26 y 2026-11-28. Versión de trabajo: `0.7`.

La revisión de términos, política, aviso y anexo del 2026-11-25 produjo la
versión de trabajo `0.3`; las revisiones posteriores produjeron `0.4` y `0.5`.
`0.2` a `0.5` permanecen como versiones históricas inmutables en sus rutas
públicas. La `0.7` es el borrador vigente de trabajo, todavía no exigible; los
assets `0.6` ya servidos en staging se conservan sin cambios.
Véanse [hallazgos y fuentes](REVISION-2026-11.md) y
[ADR-SAAS-099 aceptado para implementación](../../ADR-SAAS-099-aceptacion-legal-versionada.md).
La revisión no cierra los pendientes ni convierte el texto en exigible.

La [decisión operativa inicialmente preparada para el borrador 0.6](OPERACION-Y-CONSERVACION.md)
incorpora metadatos remotos de backups/regiones y fija objetivos por categoría
para conservación y salida. Distingue esos objetivos de los ciclos observados
de proveedores y de mecanismos todavía no implementados.

La [comprobación de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md) confirmó Vercel
Hobby y sus límites. PR #704 retiró Analytics y deshabilitó nuevos despliegues Git
automáticos; después se retiraron 106 previews y el alias público Café Atrato.
Quedan cuatro deployments directos de producción restringidos por SSO; no se
cambió el plan ni se borraron esos deployments. La aptitud contractual del uso
residual sigue sin resolverse. La exportación se diseña en
[ADR-SAAS-100 aceptado para implementación controlada](../../ADR-SAAS-100-exportacion-salida-tenant.md).
Ninguno de esos resultados acredita firma de contratos o entrega de datos reales.

El [cierre de comprobaciones accesibles](CIERRE-COMPROBACIONES-2026-11.md)
incorpora las respuestas del prestador, ciclos reales de Storage/logs, ausencia
de TTL y metadatos de 48 colecciones raíz. Identifica las capacidades todavía
no implementadas que impiden declarar exigibilidad o cumplimiento completo.

Trazabilidad: `G-SAAS-02 → M2 → E2.2`, preparación documental del onboarding
comercial autorizada por el responsable en este chat. Base técnica:
`ce70af69754d98d5d61311dd2673423a9d471eef`.

## Documentos

- [Términos del servicio](terminos-servicio.md).
- [Política de tratamiento](politica-tratamiento.md).
- [Aviso de privacidad](aviso-autorizacion.md).
- [Anexo de tratamiento por cuenta del negocio](anexo-tratamiento.md).

Estos borradores usan los datos suministrados por el prestador. El extracto del
RUT que el prestador compartió el 2026-11-26 se cotejó con los datos de
identificación que aparecen en los borradores; no se hizo una consulta
independiente a DIAN. Esto no acredita registro de marca ni constitución de una
sociedad.
«Dusema POS» identifica el servicio; el prestador indicado es una persona natural.

## Revisión necesaria antes de publicar

La [decisión operativa de vigencia, reclamos y salida](VIGENCIA-Y-TRAMITE.md)
fija la fecha prevista y los plazos por categoría, con el resultado del ensayo
sintético. El mecanismo para tramitar reclamos reales está en el
[ADR-SAAS-102 aceptado para implementación](../../ADR-SAAS-102-tramite-reclamos-privacidad.md).

1. Completar la revisión jurídica de las cláusulas y conservar la trazabilidad
   de los datos del prestador; el RUT suministrado fue cotejado, pero no hubo
   validación independiente ante DIAN.
2. Definir tiempos reales de atención, disponibilidad y recuperación. No ofrecer
   un SLA, respaldo periódico o restauración garantizada sin evidencia operativa.
3. Validar factual y técnicamente los plazos seleccionados para v0.7 (propuestos
   inicialmente en v0.6), implementar
   o asignar las tareas de salida/supresión y documentar los ciclos de copias.
   La ausencia de borrado automático actual no justifica conservación indefinida.
4. Inventariar proveedores, destinatarios, países/regiones efectivos y contratos
   de transmisión. Google/Firebase/GCP aparece en la arquitectura; deben
   verificarse también hosting, correo y cualquier otro proveedor efectivo.
5. Revisar obligaciones tributarias del prestador y aplicabilidad de normas de
   consumo según la relación concreta; no presumir que todo contrato empresarial
   queda excluido ni prometer facturación DIAN no habilitada.
6. Evaluar si corresponde inscripción en RNBD según sujeto obligado y régimen
   vigente; no afirmar que todo SaaS debe inscribirse.
7. El prestador designó a Sebastián Agudelo Muñoz como contacto operativo
   principal de privacidad. No hay suplente, lo que es un riesgo de continuidad,
   no un requisito legal autónomo identificado. Aún deben probarse los canales y
   el archivo restringido antes de activar casos reales.
8. El objetivo de publicación es 2026-12-15 00:00, hora de Colombia, solo si
   los gates cierran. Confirmar la fecha del release definitivo, comunicarla y
   ofrecer aceptación de la versión exacta; no hay efecto retroactivo para
   clientes existentes.

Avance: backup diario Firestore de 35 días y snapshots recientes `READY`
comprobados solo por metadatos; soporte temporal de diagnóstico y CSV parcial
comprobados en código. Pendientes materiales: acuerdos efectivos con proveedores,
exportación completa de tenant, supresión/ciclo de archivos y limpieza de caché.
ADR-SAAS-099 está aceptado para implementar la aceptación versionada; estos
pendientes siguen impidiendo publicar los textos como finales o exigirlos.

La revisión 0.5 documenta además que las imágenes del módulo de eventos son
públicas y descargables, y que eliminar el evento no retira el archivo de Storage.
La interfaz de administración ahora lo advierte; la eliminación automática del
asset sigue pendiente y no se declara implementada.

## Corte técnico de aceptación versionada

La ruta histórica `/terminos` se reemplazó en la rama con una vista del borrador,
claramente marcada como no vigente. La versión final se mostrará solo después de
su aprobación. Publicar documentos accesibles antes de aceptar y permitir descargar
la versión exacta. El representante del negocio acepta el contrato; la
autorización personal corresponde al titular o a quien esté legitimado. Un
administrador no puede autorizar indiscriminadamente por todos sus clientes.

ADR-SAAS-099 aceptado define la autoridad y persistencia: identidad autenticada,
tenant, facultad declarada de representación, documentos/versiones/huellas,
fecha de servidor y evidencia de acción afirmativa. La implementación separa
aceptación contractual de autorizaciones personales. No guarda PIN, contraseñas,
tokens ni IP/UA. Las pruebas cubren autorización, aislamiento, idempotencia,
huellas y Rules. No cambia snapshots, precio, Trial, pagos ni plazo.

El flujo técnico de aceptación versionada está implementado en PR #706. El
2026-11-24 se desplegaron las dos callables del codebase `saas-legal` y las Rules
en `micafe-pos-staging` y `micafe-pos`. Los Rulesets activos coinciden con el
candidato desplegado. Ambas callables responden `UNAUTHENTICATED` (HTTP 401) sin
credenciales. No se ejecutó un smoke autenticado ni se registraron aceptaciones
durante el corte. El PR sigue abierto en draft; App Hosting no ha recibido este
candidato. El catálogo legal permanece en `PREPARACION`: los textos siguen siendo
borradores, no se ofrece su aceptación contractual y no se bloquean clientes
existentes. No se registran consentimientos personales desde la aceptación del
contrato empresarial. Las condiciones para tratar clientes existentes y exigir
una versión siguen pendientes de decisión y release.

## Fuentes oficiales consultadas

- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981): derechos, autorización, deberes y atención de solicitudes.
- [Decreto 1074 de 2015, protección de datos](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm): política, aviso y autorización.
- [Decreto 1074, transmisión](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm): relación responsable/encargado.
- [Ley 527 de 1999](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276): mensajes de datos y contratación electrónica.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306): aplicación condicionada a la relación de consumo.

Las fuentes orientan la revisión; los borradores no constituyen certificación de
cumplimiento. La rama añade validaciones automatizadas de hashes, Functions y
Rules; el estado de ejecución de esas validaciones se reporta en el PR. Ningún
resultado técnico por sí solo certifica cumplimiento jurídico.

## Revisión documental del 2026-11-25

Se revisaron en paralelo términos, política, aviso, anexo y documentos
operativos. Los cuatro espejos internos/públicos coinciden y el catálogo
versionado usa sus hashes actuales. Los textos continúan en `BORRADOR` y el
bundle en `PREPARACION`; no hay versión exigible ni aceptación registrada.
Las fechas y plazos propuestos en la matriz de conservación no están aprobados
ni configurados como borrado automático.

La política y el aviso separan el contrato del negocio de las autorizaciones
personales de sus clientes, empleados y otros titulares. Los logins de admin,
Backoffice y POS muestran enlaces a privacidad/aviso antes de pedir credenciales;
solo el admin tenant ve también los documentos contractuales. Los enlaces no
registran consentimiento.

La auditoría de vigencia sigue **NO APROBADA**. El RUT suministrado ya se cotejó
con los campos de identificación de los borradores, sin consulta independiente a
DIAN. Antes de publicar o exigir una versión definitiva aún deben comprobarse los
canales y el archivo restringido; cerrar productos, cuentas, subencargados y
ubicaciones efectivos; validar datos, finalidades e instrucciones por
tratamiento; y completar el smoke autenticado y la evidencia de exportación y
supresión dentro de su alcance. El inventario de proveedores aún incluye
integraciones heredadas no confirmadas. La revisión no es un dictamen jurídico
ni una certificación integral.

## Revisión documental 0.6 — 2026-11-26

La revisión 0.6 alinea términos, política, aviso, anexo y catálogo versionado
con la decisión operativa delegada: objetivo de release 2026-12-15, ventana de
salida de 30 días calendario, objetivo de supresión/anonimización activa dentro
de 60 días y conservación ordinaria de soporte y expedientes de privacidad hasta
12 meses, con excepciones documentadas. La versión 0.5 y sus hashes se conservan
sin cambios. La decisión no se ha activado ni se presenta como obligación legal
general; el bundle sigue en `PREPARACION` y los cuatro documentos en `BORRADOR`.

La fecha solo será efectiva con el release definitivo y cierre de sus gates. Los
plazos no certifican exportación, borrado, expiración de respaldos, cumplimiento
jurídico integral ni capacidad de atención. Continúan pendientes los canales y
archivo restringido, smoke autenticado positivo, acuerdos/alcance de proveedores,
exportación real autorizada, supresión real, control de copias y revisión jurídica
externa. Detalle y fuentes oficiales: [revisión v0.6](REVISION-V0.6-2026-11-26.md).

## Revisión documental 0.7 — 2026-11-28

La revisión v0.7 conserva los assets v0.6 que ya respondían en staging y genera
una nueva ruta versionada para los cuatro borradores. Los términos explicitan
que el POS no verifica edad ni bloquea una venta de bebidas alcohólicas; se
contrastó con [Ley 124 de 1994, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=291),
[Decreto 120 de 2010](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=38680)
y [Ley 1801 de 2016, art. 38](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80538).
La política, el aviso y el anexo no cambian sustantivamente en este corte; su
versión se incrementa para mantener el bundle homogéneo.

El bundle `dusema-pos-2026-11-v0.7` está en `PREPARACION` y sus cuatro
documentos en `BORRADOR`. No se publicaron estos assets v0.7 en staging o
producción, ni se habilitó la aceptación. La verificación automatizada compara
las fuentes `docs/legal`, los assets públicos v0.7 y sus hashes UTF-8/LF.
Esta revisión no es aprobación jurídica. Siguen abiertos los gates de exactitud
factual, contratos/canales de proveedores, contacto/canal para exportación,
supresión y conservación real, ADR-SAAS-109, IAM productivo y revisión humana.
