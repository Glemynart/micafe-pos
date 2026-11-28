# Vigencia, reclamos y salida de datos

**Decisión operativa delegada — 26 de noviembre de 2026**, bajo G-SAAS-02, M2,
E2.2. El responsable delegó la selección de vigencia y plazos de conservación.
Esta decisión orienta el borrador 0.6; no publica los documentos ni los hace
exigibles. La fecha objetivo de release es 15 de diciembre de 2026, 00:00,
hora de Colombia, condicionada a cerrar los gates técnicos, de proveedores,
recepción de solicitudes, salida de datos y revisión jurídica. Si no se cierran,
no habrá activación automática en esa fecha.

## Vigencia

Fecha objetivo de publicación: 15 de diciembre de 2026, 00:00, hora de Colombia.
La fecha efectiva será la del release definitivo posterior al cierre de los
gates; si el release se aplaza, también se aplaza la fecha efectiva. Términos y
anexo contractual aplicarán a cada negocio solo después de que su administrador
autorizado acepte la versión exacta y el servidor registre la aceptación. La
política se hará pública desde el release; el aviso no sustituye una autorización
personal cuando esta sea necesaria. No hay efecto retroactivo ni cambio de precio,
Trial, vigencia comercial o acceso por la sola publicación.

## Vigencia de las bases y conservación

| Categoría | Decisión de retención para el release, sujeta a ejecución verificable |
| --- | --- |
| Operación del negocio y accesos exclusivos | Durante el servicio. Tras terminación efectiva, retirar acceso ordinario y permitir solicitar entrega durante 30 días calendario. Suprimir o anonimizar datos prescindibles de sistemas activos dentro de 60 días calendario, después de verificar entrega, instrucciones, dependencias y ausencia de deber de conservación. No hay TTL/job que lo implemente; no se ha certificado supresión real. |
| Soporte e incidencias ordinarias | Hasta 12 meses desde cierre; eliminar antes los adjuntos que dejaron de ser necesarios. Una reclamación, incidente abierto u obligación exige expediente separado, fundamento documentado y acceso restringido. |
| Expedientes de privacidad ordinarios | Hasta 12 meses desde cierre. Si hay controversia, requerimiento u obligación aplicable, conservar la evidencia mínima restringida hasta que cese su fundamento y revisar trimestralmente. |
| Contrato, recibos y papeles propios del comerciante | Durante la relación y, cuando la pieza clasifique como libro o papel de comercio, diez años desde el último asiento, documento o comprobante de esa categoría. Para evidencia fuera de esa categoría, documentar el fundamento específico y revisar su necesidad al cierre y anualmente. No aplicar diez años a todo el catálogo, los usuarios ni los logs. |
| Paquete local de exportación | Mantenerlo cifrado y con acceso restringido hasta confirmar la entrega; eliminar la copia temporal dentro de los 7 días calendario siguientes a esa confirmación y conservar solo recibo mínimo. El flujo no está certificado ni automatiza ese borrado. |
| Logs y respaldos administrados | Evidencia de metadatos en recursos concretos: Firestore backups diarios con retención de 35 días desde cada snapshot; Storage soft delete recuperable por 7 días en los buckets examinados; Cloud Logging global `_Default` 30 días y `_Required` 400 días. No se certificó la expiración real ni se inventarió cada log, bucket, exportación o copia. Son ciclos observados del proveedor, no una garantía global de supresión. |

Suspender el tratamiento ordinario al vencer su finalidad. Los períodos de 30,
60 días y 12 meses son decisiones operativas del prestador, no plazos que la Ley
1581 imponga a todo SaaS. La ley exige conservar durante el tiempo razonable y
necesario para la finalidad, sin perjuicio de deberes legales o contractuales.
Documentar por categoría cualquier deber de conservar, orden, disputa o
referencia compartida. No eliminar el ledger, la evidencia obligatoria ni
identidades compartidas por un trámite automático. El día 60 es el objetivo
operativo para sistemas activos dentro del alcance verificable. No es una
garantía de purga integral ni de respaldos. Una supresión de sistemas activos
puede dejar datos en backups Firestore anteriores hasta por 35 días adicionales;
el límite aritmético de 95 días depende de ejecutar la supresión activa a más
tardar el día 60 y no cubre copias no inventariadas. Tampoco se ha probado la
restauración del backup ni la expiración de objetos Storage de prueba.

## Entrega al terminar

Propuesta pendiente: incluir una entrega estándar sin costo adicional y recibir
solicitudes durante 30 días calendario desde la terminación. El acuse dentro de
dos días hábiles y la entrega dentro de diez días hábiles desde verificar
identidad/facultad son objetivos comerciales propuestos, no oferta aceptada ni
capacidad certificada. El canal de soporte no se ha comprobado como recepción
operativa. Si falta cobertura técnica, no se genera ni entrega un paquete parcial
como si fuera completo; se informan los límites y se deja constancia. Los plazos
de hábeas data se atienden por su régimen propio, incluso fuera de esa ventana.

La exportación real no se ha ejecutado y `productionExportCertified=false`.
El prototipo local probado con datos sintéticos no acredita cobertura de
esquemas históricos, referencias, Storage ni consistencia de una entrega real.
No leer ni entregar datos de producción hasta cerrar ese gate.

El alcance propuesto sería CSV o JSON, según el formato disponible, catálogo y presentaciones,
inventario y movimientos, clientes y proveedores del negocio, pedidos, compras,
ventas y abonos, documentos comerciales propios y configuración operativa.
Incluir archivos propios autorizados cuando pueda verificarse su pertenencia.
Entregar por un canal restringido y conservar constancia de alcance, conteo y
entrega. Excluir PIN, hashes de credenciales, tokens, expedientes internos de
plataforma y registros de terceros. El CSV de reportes sirve para lo que declara
su contenido. La exportación integral requiere validar fuentes históricas y
archivos en un ensayo representativo antes de ofrecerla como disponible.

## Trámite de reclamos

Cada parte debe designar una persona o área responsable de tramitar solicitudes
de titulares (Decreto 1074 de 2015, art. 2.2.2.25.4.4). El prestador designó a
Sebastián Agudelo Muñoz, administrador de Dusema, como contacto operativo
principal para solicitudes dirigidas a Dusema. No hay suplente; se trata de un
riesgo de continuidad, no de una condición legal autónoma identificada. Falta
probar los canales y verificar el archivo restringido. Cada negocio debe
designar y registrar su propio contacto para sus tratamientos antes de ofrecer
el trámite en producción. Para datos tratados por
cuenta de un tenant, Dusema conserva la fecha original, informa al responsable
y presta asistencia; el traslado no reinicia términos. La identidad del titular
y su legitimación se validan antes de revelar información. El administrador del
tenant no queda facultado automáticamente para ejercer derechos por los clientes
del negocio. La asignación contractual no elimina los deberes legales propios de
responsable o encargado según la operación.

Una oposición al cobro por presunta suplantación debe salir de la cola ordinaria
de cartera, evitar que el cobro continúe automáticamente y escalarse para
determinar las medidas exigibles bajo las Leyes 1266 de 2008 y 2573 de 2026
antes de cualquier circulación externa. Es una precaución operativa, no una
conclusión de que la Ley 2573 aplique a todo comerciante. Su aplicabilidad a cada
establecimiento requiere determinar si tiene la competencia descrita por esa
norma; no se presume por conceder crédito en el POS.

1. Registrar fecha de recepción y consecutivo. Verificar identidad, facultad,
   dato afectado y motivo. Si falta información, requerirla dentro de los cinco
   días siguientes y guardar la referencia opaca del soporte, fecha declarada,
   operador y hora de registro. Si corresponde a otro responsable, trasladar
   dentro de dos días hábiles e informar al titular.
2. Con el reclamo completo, poner la leyenda «reclamo en trámite» y su motivo en
   el registro afectado dentro de dos días hábiles. Restringir el detalle. Un
   correo o el expediente por sí solos no sustituyen la anotación.
3. Resolver en 15 días hábiles desde el día siguiente a la recepción del
   reclamo completo. Para reclamos incompletos, el plazo empieza con la recepción
   verificable de la información que los completa, conforme a ADR-SAAS-110;
   conservar el plazo persistido en expedientes históricos. Comunicar el motivo
   y la fecha de una eventual extensión de hasta ocho días hábiles.
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
y la ficha canónica. En una misma transacción, cada reclamo abierto conserva su
motivo en el expediente privado y en
`clientes/{clienteId}/anotaciones_privacidad/{casoId}`; el indicador de la ficha
debe coincidir con el número de anotaciones activas. Una consulta autorizada
desde un caso verificado devuelve la leyenda y todos los motivos activos de esa
ficha, incluso si el caso consultado ya se resolvió. El cierre elimina solo la
anotación activa de ese caso; el expediente conserva el historial. Las Rules
deniegan acceso directo del cliente a la subcolección y protegen el expediente
y el indicador. La exportación comercial clasifica esa subcolección como
información privada excluida y no lee sus motivos. Para cerrar hay que documentar
primero la referencia y el resultado de la respuesta comunicada.

Los expedientes históricos conservan su calendario V1 (lunes a viernes,
excluidos domingos y festivos) y los vencimientos guardados. No se recalculan en
bloque. En V1, una versión ausente solo se admite si la estructura y los
vencimientos coinciden con el comportamiento anterior. Una versión desconocida
o inconsistente falla cerrada.

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

### ADR-SAAS-104 aceptado; implementación local en PR #706

Para expedientes nuevos, la versión V2 cuenta sábados no festivos como hábiles,
excluye domingos y festivos colombianos, y requiere cobertura operativa los
sábados. Consultas, anotación, respuesta y extensiones usan la versión guardada
al abrir el caso. Los vencimientos persistidos se validan y no se reinterpretan
con otro calendario. Los casos históricos sin versión solo se leen como V1 si
sus fechas son consistentes; una versión desconocida o un vencimiento alterado
falla cerrado. No hay recálculo en bloque.

El calendario V2 es una decisión operativa interna, no una interpretación
jurídica definitiva sobre el alcance de «cinco días siguientes» para Dusema. El
artículo 15 de la Ley 1581 no llama expresamente hábiles a esos cinco días; las
reglas generales de cómputo y la calificación de sábados para una operación
privada requieren validación jurídica para el caso concreto. No dejar vencer un
reclamo por esta incertidumbre: documentar la recepción y usar el vencimiento
conservador que indique el sistema mientras se obtiene revisión.

La rama de PR #706 implementa el registro write-once del requerimiento de
subsanación y su fecha, la recepción con fecha/referencia y la finalización del
mismo expediente dentro de los dos meses, además del desistimiento manual tras
verificar el canal externo. Los reintentos idénticos son idempotentes. Se
guardan referencias opacas y timestamps del servidor, no copias de mensajes ni
identificaciones. La aplicación no envía ni verifica el correo externo.

## Alcance provisional de PQR de consumo por comercio electrónico

La Ley 1480 define comercio electrónico para operaciones telemáticas entre
proveedores y consumidores (art. 49). Cuando se ofrecen productos o servicios
electrónicamente a consumidores, su art. 50(g), modificado por la Ley 2439 de
2024, exige en ese mismo medio canales accesibles para orientar y asistir,
radicar PQR con trazabilidad, entregar número/fecha/hora de radicación y permitir
seguimiento. La SIC describe como consumidor a quien usa el servicio como
destinatario final para una necesidad propia; una necesidad empresarial ligada
intrínsecamente a la actividad económica no configura esa calidad según su
criterio publicado.

**Inferencia de alcance, no dictamen:** el segmento objetivo de Dusema POS son
negocios que adquieren el sistema para administrar ventas e inventario de su
actividad. Para ese contrato B2B, el uso aparece intrínsecamente ligado a la
actividad económica del cliente, por lo que la obligación específica del art.
50(g) no se puede dar por aplicable automáticamente. La clasificación puede
cambiar para una oferta, comprador o finalidad distinta y requiere revisión
jurídica del modelo contractual real. La ruta de reclamos de privacidad tampoco
sustituye PQR de consumo si el régimen llegara a aplicar. Por prudencia, cualquier
oferta directa a consumidores por medios electrónicos debe resolver primero un
canal con radicado y seguimiento en el mismo medio. No hay evidencia de que el
correo actual entregue constancia o seguimiento, así que no se presenta como
PQR operativo.

Validación local del 2026-11-25: Emulator de Firestore pasó las pruebas de
reclamos, consultas y recibo; las pruebas unitarias legales, las pruebas de
Backoffice, TypeScript, build de Functions, build de Next.js y ESLint focalizado
pasaron. No se hizo smoke en staging con operador autenticado. PR #706 sigue
abierto y en draft; este cambio no está desplegado ni habilitado para casos
reales. La regla de sábado es una decisión operativa interna; no es concepto
jurídico ni certifica su aplicación concreta a Dusema.

## Fuentes

- [Ley 1581 de 2012, arts. 14, 15 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Decreto 1074 de 2015, arts. 2.2.2.25.2.8, 2.2.2.25.4.4 y 2.2.2.25.5.1–.2](https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf).
- [Decreto 1074 de 2015, arts. 2.2.2.25.2.8 y 2.2.2.25.3.1](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm).
- [Ley 1581 de 2012, arts. 14, 15, 17 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Ley 962 de 2005, art. 28](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=17004).
- [Ley 51 de 1983, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4954).
- [SIC, Concepto sobre Firebase](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/uso-de-firebase-en-almacenamiento-de-datos-y-cumplimiento-normativo-en-colombia).
- [SIC, alcance de Circular Externa 002 de 2025](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos).
- [Ley 1480 de 2011, arts. 5, 49 y 50(g)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306), [Ley 2439 de 2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116), and [SIC, concepto sobre relación de consumo](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/relacion-de-consumo).
- [Ley 2573 de 2026](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_2573_2026.htm) y [Ley 1266 de 2008](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=34488), para evaluar separadamente datos de cartera y alegaciones de suplantación.

## Actualización de despliegue — 25 de noviembre de 2026, 13:31 UTC

La nota anterior describía el estado antes del corte de staging. El SHA
`42006b7e8b36dfab529c81589107554e1adee899` ahora está publicado únicamente en
staging: App Hosting `build-2026-11-25-002`, rollout `SUCCEEDED`, 100% de tráfico;
Rules del candidato coincidentes con el release activo de staging y Functions
legales activas. La verificación HTTP confirmó que las cuatro páginas continúan
marcadas como borrador. Las callables rechazan llamadas anónimas, pero no se ha
completado un smoke autenticado en Backoffice.

Producción no fue desplegada: aún sirve la ruta histórica de términos, faltan
las otras tres rutas y las Functions de consultas/reclamos de privacidad; las
Rules activas difieren del candidato. No se concedieron permisos ni se
tramitaron casos reales. Los documentos siguen en `PREPARACION`; su publicación,
aceptación contractual y habilitación operativa esperan la validación factual y
jurídica y los gates restantes. Esta revalidación no certifica cumplimiento
legal ni exportación/supresión integral.
