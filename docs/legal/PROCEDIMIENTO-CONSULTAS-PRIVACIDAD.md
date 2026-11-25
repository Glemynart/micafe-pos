# Procedimiento operativo de consultas de datos personales

Estado: preparación para revisión y ensayo. ADR-SAAS-103 incorpora una ruta
de consultas verificadas en la rama de desarrollo; todavía no está desplegada ni
se ha ensayado el recorrido de interfaz en staging. Hasta que se verifique la
gestión de consultas, el responsable debe emplear un expediente restringido y
un mecanismo de seguimiento fuera del POS; no registrar el contenido sensible
en issues, commits o canales públicos.

## Alcance y clasificación

Una **consulta** solicita conocer la información personal vinculada al titular;
un **reclamo** solicita corrección, actualización, supresión o denuncia un
incumplimiento. Una solicitud puede contener ambas partes: registrar y tramitar
cada una con su plazo y evidencia. Una consulta no crea automáticamente la
leyenda de reclamo. Si Dusema recibe una solicitud sobre datos tratados por
cuenta de un negocio, identificar el responsable y coordinar con él sin asumir
que el representante del negocio puede actuar por todos sus clientes.

## Recepción y seguimiento

1. Registrar consecutivo único, fecha y hora de recepción en Colombia, canal,
   tipo de solicitud, responsable de su atención y estado. Mantener el mensaje
   y documentos de identidad en un repositorio restringido; en el expediente
   operativo registrar una referencia, no copias innecesarias de los documentos.
2. Verificar identidad y legitimación por un medio apropiado al riesgo. Si se
   requieren datos adicionales, solicitarlos de forma proporcional y conservar
   constancia del requerimiento. No enviar información personal sin verificación.
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

## Verificación pendiente para operación integrada

ADR-SAAS-103 implementa el registro de consultas verificadas con autorización
específica, plazo, asignación al operador y registro de respuesta. Pasaron pruebas
de concurrencia y facultad en Emulator; esto no acredita interfaz ni operación en
producción. Se requiere ensayar el recorrido en staging y comprobar facultad,
aislamiento y restricciones. La recepción pendiente de verificación se registra
con el plazo original; el operador asignado puede reasignar a otro operador
autorizado. La recuperación de expedientes de operadores inactivos requiere las
facultades conjuntas de privacidad y gobierno, y conserva una constancia; este
flujo sigue pendiente de ensayo en staging.

Fuentes: [Ley 1581 de 2012, artículos 14 y 15](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)
y [Decreto 1074 de 2015](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608).
