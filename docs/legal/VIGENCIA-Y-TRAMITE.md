# Vigencia, reclamos y salida de datos

Decisión operativa del 24 de noviembre de 2026, bajo G-SAAS-02, M2, E2.2.
Aplicable a la primera versión definitiva. El paquete 0.2 conserva su estado
de borrador y sus huellas.

## Vigencia

Fecha prevista: 15 de diciembre de 2026, 00:00, hora de Colombia. Solo se usa
si la versión definitiva se publica y se comprueba de antemano el canal de
reclamos, el mecanismo para anotar el reclamo en el registro afectado y el
alcance de la entrega que se ofrece. Si falta alguna comprobación, la fecha
efectiva será el día de publicación de la versión definitiva, sin retroactividad.
La versión publicada indicará la fecha exacta. Para negocios existentes,
comunicar antes de aplicar los cambios y recabar aceptación cuando corresponda.
No cambiar precio, vigencia comercial ni acceso por la sola publicación.

## Vigencia de las bases y conservación

| Categoría | Plazo y acción |
| --- | --- |
| Operación del negocio y accesos exclusivos | Mientras se presta el servicio. A la terminación efectiva, retirar el acceso ordinario y reservar 30 días calendario para solicitar la entrega. Revisar cada expediente al día 30 y programar, como objetivo interno, la supresión o anonimización de datos prescindibles para el día 60. Verificar entrega, instrucciones y dependencias antes de ejecutar. |
| Soporte e incidencias ordinarias | Hasta 12 meses desde cierre. Antes, retirar adjuntos que dejaron de ser necesarios. Una reclamación, incidente abierto u obligación de conservación exige expediente separado y revisión de la justificación. |
| Expedientes de privacidad ordinarios | Hasta 12 meses desde cierre para seguimiento. Si hay controversia, requerimiento u obligación aplicable, conservar la evidencia mínima de forma restringida hasta que cese su fundamento, con revisión trimestral. |
| Contrato, recibos y papeles propios del comerciante | Durante la relación y, cuando la pieza clasifique como libro o papel de comercio, diez años desde el último asiento, documento o comprobante de esa categoría. Para evidencia fuera de esa categoría, documentar el fundamento específico y revisar su necesidad al cierre y anualmente. No aplicar diez años a todo el catálogo, los usuarios ni los logs. |
| Logs y respaldos administrados | Firestore: 35 días desde el snapshot según el schedule observado. Storage: siete días recuperables desde el borrado por soft delete observado. En Logging global se observaron 30 días para `_Default` y 400 para `_Required`. Son ciclos de recursos específicos y pueden coexistir con otros ciclos del proveedor. |

Suspender el tratamiento ordinario al vencer su finalidad. Documentar por
categoría cualquier deber de conservar, orden, disputa o referencia compartida.
No eliminar el ledger, la evidencia obligatoria ni identidades compartidas por
un trámite automático. El día 60 es un objetivo para sistemas activos dentro
del alcance verificable. No es una garantía de purga integral ni de respaldos.

## Entrega al terminar

Una entrega estándar sin costo adicional. Recibir solicitudes por el canal de
soporte durante 30 días calendario desde la terminación. Acusar recibo y
comunicar el alcance inicial en dos días hábiles. Objetivo de entrega: diez días
hábiles desde la verificación de identidad y facultad, para los datos cuya
proyección y entrega estén verificadas. Si falta cobertura, identificar dominios
faltantes, comunicar la fecha estimada y mantener el expediente abierto. Los
plazos de hábeas data se tramitan por separado, incluso fuera de esa ventana.

Entregar en CSV o JSON, según el formato disponible, catálogo y presentaciones,
inventario y movimientos, clientes y proveedores del negocio, pedidos, compras,
ventas y abonos, documentos comerciales propios y configuración operativa.
Incluir archivos propios autorizados cuando pueda verificarse su pertenencia.
Entregar por un canal restringido y conservar constancia de alcance, conteo y
entrega. Excluir PIN, hashes de credenciales, tokens, expedientes internos de
plataforma y registros de terceros. El CSV de reportes sirve para lo que declara
su contenido. La exportación integral requiere validar fuentes históricas y
archivos en un ensayo representativo antes de ofrecerla como disponible.

## Trámite de reclamos

1. Registrar fecha de recepción y consecutivo. Verificar identidad, facultad,
   dato afectado y motivo. Si falta información, requerirla dentro de los cinco
   días siguientes. Si corresponde a otro responsable, trasladar dentro de dos
   días hábiles e informar al titular.
2. Con el reclamo completo, poner la leyenda «reclamo en trámite» y su motivo en
   el registro afectado dentro de dos días hábiles. Restringir el detalle. Un
   correo o el expediente por sí solos no sustituyen la anotación.
3. Resolver en 15 días hábiles desde el día siguiente a la recepción. Comunicar
   el motivo y la fecha de una eventual extensión de hasta ocho días hábiles.
4. Al resolver, retirar la leyenda del caso cerrado, conservar el resultado y
   constancia de respuesta. Si quedan otros reclamos abiertos, mantener su
   anotación. Si Dusema actúa como encargado, coordinar con el responsable.

El ensayo del 24 de noviembre comprobó en Firestore Emulator que se puede
anotar el motivo y abrir el caso en la misma operación, luego rectificar el
registro y cerrar el caso sin afectar el tenant vecino. Usó un fixture con
autoridad local de emulador. No valida permisos de operadores, registros reales,
reclamos simultáneos ni recepción del correo. Las 19 pruebas de salida pasaron
con fuentes sintéticas, incluidas entrega con abonos, exclusión de credenciales
y rechazo de datos de otra empresa.

### Implementación del ADR-SAAS-102

En Backoffice, `/backoffice/privacidad` permite registrar recepción, completar
la verificación, consultar plazos, guardar constancias de prórroga y respuesta
y cerrar el expediente. Un operador con facultad expresa registra la recepción
del correo y comprueba los soportes afuera del POS. Usa referencias de
evidencias del registro restringido, sin copiar allí los adjuntos de identidad
ni el correo completo.

La callable `tramitarReclamoPrivacidadSaas` revalida el token y su revocación,
el operador, la facultad `PRIVACIDAD_RECLAMOS_TRAMITAR`, la asignación al caso
y la ficha canónica. El motivo queda en el expediente. La consulta autorizada
devuelve la leyenda y el motivo del caso asignado. Completar el expediente
actualiza el indicador de la ficha en una transacción. Las Rules protegen el
expediente y los cambios directos al indicador. Para cerrar hay que documentar
primero la referencia y el resultado de la respuesta comunicada.

Los plazos se calculan con fecha civil de Bogotá, de lunes a viernes y con
festivos nacionales fijos, trasladados y móviles de la Ley 51 de 1983. Se guarda
la versión del calendario y los vencimientos calculados con la apertura. Si
aplica un día no hábil adicional o un calendario distinto al de atención
ordinaria, verificar el vencimiento del expediente con el responsable. La
prórroga exige referencia de aviso, motivo y registro dentro del plazo inicial.

En Emulator se verificaron reintentos, dos reclamos concurrentes, cierre
parcial, falta de facultad/instrucción/respuesta, operador revocado y separación
de empresas. El ensayo incluye recepción incompleta, anotación al completar,
constancia de prórroga y respuesta y cierre. La salida comercial excluye los
motivos y el indicador. Las solicitudes de acceso al expediente se verifican
y tramitan por el canal restringido, fuera del export comercial.

Antes de activar casos reales: hacer un ensayo de recepción y respuesta del
buzón publicado con mensaje sintético, designar operador titular y sustituto,
verificar el archivo restringido de soportes y ejecutar smoke con cuenta de
pruebas en staging. El sistema no envía correos. Los registros antiguos sin
fecha canónica de creación quedan fuera del primer adaptador. Los casos fuera
del directorio, los desistimientos y el traslado al responsable se gestionan
en el registro restringido con sus plazos. Validar Rules, callable, registro de
la nueva facultad y App Hosting en ese orden antes de activar el acceso real.

## Fuentes

- [Decreto 1074 de 2015, arts. 2.2.2.25.2.8 y 2.2.2.25.3.1](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm).
- [Ley 1581 de 2012, arts. 14, 15, 17 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Ley 962 de 2005, art. 28](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=17004).
- [Ley 51 de 1983, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4954).
