# Ejercicio documental de respuesta a incidente — 2026-11-25

**Estado:** ejercicio de mesa sintético y documental; no es un incidente real ni
una certificación del canal regulatorio.

## Propósito y límites

Recorrer el borrador de respuesta a incidentes para comprobar que distingue
roles, preserva evidencia, inicia el cómputo sin esperar la investigación y
separa la notificación al negocio de un eventual reporte regulatorio.

No se accedió a producción, no se usaron datos de personas, no se contactó a un
negocio o a una autoridad y no se creó ningún registro en Firebase. Los nombres,
tenant, timestamps y eventos de abajo son ficticios para el ejercicio.

## Escenario

Una alerta de prueba indica que una respuesta generada en un entorno aislado
podría haber incluido información del tenant ficticio `tenant-demo-a` al
consultarse desde `tenant-demo-b`. El evento inicial se trata como hipótesis; no
se presume que hubo lectura por una persona ni que afectó un sistema real.

## Recorrido y resultado

| Paso | Ejercicio | Resultado documental |
|---|---|---|
| Recepción y contención | Abrir expediente restringido; anotar detección y conocimiento por el área; suspender la ruta hipotética; preservar metadatos y logs sin copiar payloads. | El runbook cubre la secuencia. No se probó una ruta técnica ni un repositorio real. |
| Alcance y roles | Separar datos propios de Dusema de los que un negocio habría cargado; identificar tenant, categorías, sistemas, productos y proveedores; separar hechos de hipótesis. | El árbol de decisión distingue a Dusema como responsable o encargado por tratamiento. La determinación depende de hechos del caso. |
| Plazo y RNBD | Iniciar el cálculo desde detección y conocimiento del área formalmente designada; consultar la clasificación RNBD vigente; escoger el canal SIC que corresponda al rol y al sujeto. | El método está escrito, pero la persona/área aún no está formalizada, la clasificación no está cerrada con el RUT y el acceso a los canales no se probó. Este paso queda **no verificado operativamente**. |
| Coordinación | Si Dusema actúa como encargado, avisar al responsable sin demora indebida y cooperar; mantener aparte cualquier deber regulatorio propio. | La separación está contemplada en el runbook. No se envió comunicación en este ejercicio. |
| Reporte y cierre | Preparar hechos confirmados, incertidumbres, medidas, evidencia, responsable y seguimiento; no afirmar que una notificación se hizo sin acuse. | La lista de evidencia es suficiente como guía. No se presentó reporte SIC ni se generó acuse porque no existe incidente real. |

## Hallazgos y acciones

1. El runbook sirve como guía para el análisis, pero el ejercicio **no acredita
   preparación operativa completa**: faltan la designación formal de la persona
   o área, clasificación RNBD con el RUT y prueba de acceso al canal que aplique.
2. El suplente queda como control interno de continuidad, no como requisito
   legal autónomo; su designación sigue siendo recomendada para disponibilidad.
3. Al implementar ADR-SAAS-104, conservar en el mismo expediente la evidencia de
   envío del requerimiento de subsanación de una solicitud incompleta. Ese flujo
   es distinto del proceso de incidente y permanece pendiente.
4. Repetir el ejercicio como simulacro operativo con responsables designados,
   archivo restringido y acceso verificado; usar solo fixtures ficticios y no
   enviar reportes externos.

## Criterio de cierre del ejercicio

**Resultado: PARCIAL — procedimiento recorrido en escritorio; controles externos
y responsables no verificados.** Esta evidencia solo respalda una revisión
documental del runbook. No demuestra cumplimiento de plazos en un caso real,
acceso al RNBD/SIC, notificación a tenants ni capacidad de exportar o suprimir
datos.

Fuente oficial consultada: [SIC — cumplimiento de la obligación de reporte de
incidentes de seguridad](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad).
