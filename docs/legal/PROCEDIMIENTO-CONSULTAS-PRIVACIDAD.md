# Procedimiento operativo de consultas de datos personales

**BORRADOR OPERATIVO — 2026-11-25. No está activado para titulares.**

Las rutas y Functions de privacidad están disponibles en staging; producción
recibió únicamente el corte aislado de Firestore Rules. Una sesión autenticada
de Edge cargó en staging la ruta `/backoffice/privacidad` con contexto validado,
pero no presentó un caso ni probó una callable autorizada. En producción siguen
pendientes App Hosting, las Functions de consultas y reclamos y el recorrido
autenticado. Este procedimiento aún no constituye un servicio operativo ni un
canal de recepción verificado. El prestador designó a Sebastián Agudelo Muñoz,
administrador de Dusema, como contacto operativo principal de sus solicitudes;
falta designar un sustituto, probar los canales y validar el repositorio
restringido antes de activar casos reales.

La obligación legal de atender una solicitud no desaparece por esos límites
técnicos. Mientras el flujo no esté activado, cada parte debe aplicar el medio
seguro que tenga efectivamente disponible y conservar evidencia; el proyecto
no ha acreditado un archivo o repositorio externo apto para este fin. No se debe
registrar identidad, mensajes o anexos en issues, commits o canales públicos.

## Alcance y clasificación

Una **consulta** solicita conocer la información personal vinculada al titular;
un **reclamo** solicita corrección, actualización, supresión o denuncia un
incumplimiento. Una solicitud puede contener ambas partes: registrar y tramitar
cada una con su plazo y evidencia. Una consulta no crea automáticamente la
leyenda de reclamo. Las solicitudes de consumo, suplantación, información
crediticia o incidentes deben clasificarse aparte cuando tengan otro régimen o
autoridad; no forzarles los plazos de esta guía. En especial, una oposición a
una cuenta por cobrar que alegue suplantación no se debe tratar como consulta
ordinaria ni dejar que la cola estándar continúe el cobro automáticamente. Como
precaución operativa, poner el caso en revisión y escalarlo para determinar las
medidas exigibles según las Leyes 1266 de 2008 y 2573 de 2026 y la competencia
del negocio. Esto no concluye que la Ley 2573 aplique a todo comerciante que
concede crédito; su alcance requiere análisis para cada establecimiento.

Los roles se determinan por tratamiento. Si Dusema opera datos de clientes o
proveedores por instrucciones de un negocio tenant, Dusema es encargado y el
negocio es responsable de esa operación. Dusema puede ser responsable
independiente respecto de datos que usa para sus propios fines. El prestador
designó a Sebastián Agudelo Muñoz como contacto operativo principal de Dusema
para solicitudes dirigidas al servicio. Cada negocio cliente debe designar su
propia persona o área para los tratamientos de los que es responsable (Decreto
1074 de 2015, art. 2.2.2.25.4.4). El sustituto de Dusema, los canales funcionales
y las delegaciones de cada negocio aún deben documentarse.

Si Dusema recibe una solicitud relativa a datos de un tenant, conserva la fecha
original, identifica el titular y el tratamiento pertinente, avisa al negocio
responsable y presta asistencia. La remisión no reinicia el término. No revela
al negocio datos del solicitante sin verificar legitimación ni permite que el
administrador del tenant actúe automáticamente por todos sus clientes. Dusema
no decide por el negocio una entrega, rectificación o supresión sin instrucción
verificada, salvo un deber legal propio u orden competente. Esta coordinación
no elimina los deberes que la Ley 1581 también atribuye al encargado.

## Recepción y seguimiento

1. Registrar consecutivo único, fecha y hora de recepción en Colombia, canal,
   tipo de solicitud, tratamiento/tenant cuando proceda, parte que recibió,
   responsable de la atención y estado. Mantener el mensaje y los documentos
   necesarios en un repositorio con acceso restringido previamente verificado;
   en el registro operativo guardar una referencia, no copias innecesarias de
   documentos identificatorios. Si no existe un repositorio validado, no afirmar
   que el POS lo provee: derivar a un procedimiento seguro disponible y elevar
   el bloqueo operativo.
2. Verificar identidad y legitimación por un medio apropiado al riesgo; verificar
   además la representación cuando la persona actúe por otra. Si faltan datos,
   solicitar solo lo necesario y conservar constancia del requerimiento. No
   enviar información personal sin verificación ni usar PIN, contraseña o código
   de sesión como prueba de identidad.
3. Identificar fuentes pertinentes y el papel de Dusema. Si otra organización es
   responsable, documentar el traslado y la comunicación al solicitante cuando
   corresponda. No consultar datos de otros negocios ajenos a la solicitud.
4. Para la consulta aplicar el término máximo de diez días hábiles desde su
   recepción. Si no puede atenderse a tiempo, comunicar los motivos y la fecha
   de respuesta antes de vencer ese término; la respuesta no puede superar los
   cinco días hábiles adicionales previstos en la ley. Registrar vencimientos,
   calendario aplicado y constancia del aviso, si se utiliza la extensión.
5. Preparar una respuesta verificable con la información vinculada al titular,
   de forma que no se divulguen innecesariamente datos de otras personas. Enviar
   por un canal adecuado y conservar referencia, fecha y prueba de entrega o
   intento, sin incluir contraseñas, PIN ni enlaces públicos permanentes.
6. Cerrar solo después de registrar el resultado y la constancia de respuesta;
   conservar evidencia bajo la matriz aplicable y revisar excepciones legales.
   Si la solicitud contiene reclamos abiertos, seguirlos por separado hasta su
   cierre; no presentar el cierre de la consulta como cierre de los reclamos.

## Reclamos y conservación de evidencia

Si la solicitud es un reclamo, abrir además el expediente correspondiente y
aplicar el procedimiento legal propio de reclamos: el requerimiento de
subsanación de los reclamos incompletos, el plazo de respuesta, las prórrogas y
la anotación «reclamo en trámite» en el registro afectado cuando proceda. No
usar el término de consultas para responder un reclamo ni cerrar ambos por una
sola anotación. La fecha original y los avisos realizados deben quedar
acreditados.

ADR-SAAS-104 adoptó un calendario operativo versionado para los casos nuevos,
incluyendo sábado no festivo como día hábil en ciertos términos. Es una regla
interna para calcular y persistir vencimientos, no una interpretación judicial
o concepto de la SIC sobre cómo se aplica el plazo de subsanación a Dusema. Los
expedientes históricos conservan su calendario y vencimiento guardados. Ante
ambigüedad sobre un caso concreto, escalarlo y proteger el término más corto
razonablemente aplicable mientras se obtiene orientación jurídica.

Conservar evidencia mínima con acceso restringido por la finalidad y plazo
aprobados. No asumir que los períodos de borrador (12 meses, 30/60 días u otros)
están vigentes o configurados. La ventana de backup observada de Firestore es de
35 días; Storage tiene siete días de soft delete recuperable en los buckets
examinados; Cloud Logging observó 30 días en `_Default` y 400 en `_Required`.
Estos ciclos no prueban supresión ni sustituyen la decisión de conservación del
expediente. La supresión real no fue probada y la exportación real no está
certificada.

## Verificación pendiente para operación integrada

ADR-SAAS-103 define el registro de consultas verificadas con autorización
específica, plazo, asignación al operador y registro de respuesta. Las pruebas
en Emulator no acreditan interfaz ni operación en producción. El corte observado
en staging sigue en BORRADOR y requiere smoke autenticado para ensayar el
recorrido, facultad, aislamiento y restricciones antes de habilitarlo. La
recepción pendiente de verificación se registra
con el plazo original; el operador asignado puede reasignar a otro operador
autorizado. La recuperación de expedientes de operadores inactivos requiere las
facultades conjuntas de privacidad y gobierno, y conserva una constancia; este
flujo sigue pendiente de ensayo en staging.

Fuentes: [Ley 1581 de 2012, arts. 14, 15 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981),
[Decreto 1074 de 2015, art. 2.2.2.25.4.4](https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf),
y [ADR-SAAS-102](../../ADR-SAAS-102-tramite-reclamos-privacidad.md),
[ADR-SAAS-103](../../ADR-SAAS-103-consultas-privacidad.md) y
[ADR-SAAS-104](../../ADR-SAAS-104-tramite-reclamos-incompletos.md). La
clasificación de cartera y suplantación también requiere revisar la
[Ley 2573 de 2026](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_2573_2026.htm)
y la [Ley 1266 de 2008](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=34488)
antes de habilitar ese flujo.
