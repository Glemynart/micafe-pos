# ADR-SAAS-104 — Evidencia y cierre de reclamos incompletos

Estado: **Propuesto — requiere aprobación explícita antes de implementar**.
Goal: `G-SAAS-02 → M2 → E2.2`.

## Contexto

ADR-SAAS-102 permite registrar la recepción incompleta de un reclamo y calcular
el término para pedir la subsanación. La callable `tramitarReclamoPrivacidad`
crea el caso `RECIBIDO` y conserva `vencimientoRequerimiento`; el Backoffice no
permite registrar la referencia ni la fecha de envío del requerimiento. Tampoco
conserva la fecha desde la que corren los dos meses para entender desistido el
reclamo cuando no se recibe la información.

La Ley 1581 de 2012, artículo 15, exige requerir la subsanación dentro de los
cinco días siguientes cuando el reclamo está incompleto y dispone que se
entiende desistido si pasan dos meses desde el requerimiento sin recibir la
información. La Ley 4 de 1913, artículo 62, da reglas generales para contar
plazos expresados en días y meses.

### Hallazgo normativo sobre el cómputo (revisión del 2026-11-25)

- El artículo 15 de la Ley 1581 dice «cinco (5) días siguientes», mientras que
  expresa los términos de consulta y respuesta como «días hábiles».
- El artículo 62 de la Ley 4 de 1913 establece que los plazos legales en días
  excluyen feriados y días de vacancia, salvo disposición contraria, y que los
  plazos en meses se computan por calendario.
- El Concepto 148831 de 2025 de Función Pública reproduce la regla general de
  que los términos fijados en días se entienden hábiles y cita jurisprudencia
  según la cual el sábado es hábil por regla general, excepto cuando una regla
  general aplicable lo declare inhábil. El concepto advierte que su respuesta
  concreta trata de empleo público; es orientación interpretativa secundaria,
  no decisión de la SIC sobre el artículo 15 de la Ley 1581.
- La resolución SIC 55022 de 2021 reproduce el texto del artículo 15, pero en
  la búsqueda oficial realizada no se localizó una interpretación SIC que
  resuelva específicamente si el término de subsanación incluye sábados.
  Esto documenta el límite de la búsqueda y no prueba que tal doctrina no
  exista.
- El código usa `CO-LEY51-LUN-VIE-V1`, que excluye sábados, domingos y festivos.
  La fuente revisada no demuestra que Dusema haya adoptado una regla general
  aplicable que declare inhábiles los sábados. Si el sábado se considera hábil,
  el vencimiento calculado con lunes-viernes puede resultar posterior al plazo.

La interpretación más respaldada por las fuentes generales es contar los
plazos legales en días como hábiles, incluyendo sábados salvo que una regla
aplicable los declare inhábiles, y excluir domingos y feriados. Para no afirmar
que esa doctrina general resuelve por sí sola la operación de Dusema, se propone
adoptarla como regla de cálculo y registrar expresamente la política de atención
que se aplique. La revisión jurídica final debe validar la aplicabilidad al
artículo 15 de la Ley 1581 y a Dusema antes de declarar conformidad. Hasta
entonces, el calendario lunes-viernes no debe presentarse como validado para
este término.

## Problema

Con el estado actual no se puede demostrar desde el expediente que la solicitud
de subsanación se envió a tiempo, ni determinar con evidencia cuándo empezó el
plazo de dos meses. El operador debe conservar soportes en un expediente externo
restringido, pero el POS no guarda una referencia que conecte ese soporte con el
caso. Un caso incompleto puede quedar indefinidamente en `RECIBIDO`.

## Alternativas

### A. Extender de forma acotada el expediente existente — recomendada

Agregar acciones server-side para dejar constancia de la solicitud de
subsanación y del desistimiento por falta de respuesta. Persistir en el mismo
expediente referencias externas y metadatos mínimos, con campos write-once y
transiciones idempotentes. No guardar el mensaje, documentos de identidad,
adjuntos ni datos personales adicionales en Firestore.

### B. Mantener toda la trazabilidad fuera del POS

Usar únicamente el expediente externo restringido y dejar el caso del POS en
`RECIBIDO`. No requiere cambiar el modelo, pero no deja en Backoffice una
constancia vinculada ni permite verificar vencimientos y cierres integrales.

### C. Crear una colección append-only de eventos del reclamo

Guardar cada acto en una subcolección inmutable y proyectar el estado del caso.
Ofrece una historia más completa, pero amplía el modelo, Rules, exportación,
retención y recuperación más de lo necesario para cerrar esta brecha.

## Decisión recomendada

Elegir **A** y conservar `privacidad_reclamos/{casoId}` como autoridad del caso.

- Añadir una acción `REQUERIR_SUBSANACION` solo para casos `RECIBIDO` que aún
  estén dentro del vencimiento vigente. Requiere una referencia al soporte
  externo, fecha de envío y operador; la referencia es un identificador opaco,
  no el correo, contenido del mensaje, documento de identidad ni URL pública.
- Registrar la solicitud una sola vez. Reintentos idénticos son no-op; una
  referencia o fecha distinta se rechaza. La identidad del operador, el
  timestamp de registro y la referencia se escriben en una transacción y no se
  pueden reemplazar.
- Si la persona entrega la información, permitir completar el mismo caso por su
  consecutivo. Si existe un requerimiento, validar que la recepción de la
  subsanación ocurra dentro de los dos meses computados desde su envío. La
  recepción se registra con fecha y referencia externa; después sigue el flujo
  vigente de verificación, anotación y respuesta.
- Añadir `DESISTIR_POR_FALTA_DE_SUBSANACION`, permitido solo después de los dos
  meses y si no existe subsanación registrada. El operador confirma la
  verificación del canal externo; el servidor registra actor, instante y estado
  terminal `DESISTIDO`. No se automatiza el cierre por reloj porque el POS no
  observa por sí mismo la recepción en el canal externo.
- `DESISTIDO` es terminal para ese consecutivo: no puede abrir una anotación ni
  aceptarse una subsanación posterior dentro del mismo caso. Un contacto tardío
  requiere un expediente nuevo, enlazado solo por referencia, sin borrar el
  antecedente.
- Mantener autorización `PRIVACIDAD_RECLAMOS_TRAMITAR`, ownership por operador,
  aislamiento de Rules y lectura restringida actuales. No otorgar facultades ni
  cambiar reglas de acceso.
- Actualizar el calendario versionado para contar sábados como hábiles y
  excluir domingos y feriados, salvo que una regla aplicable a Dusema declare
  inhábil el sábado; probar los cinco días, los términos explícitos en días
  hábiles y vencimientos en festivo. No recalcular en bloque expedientes
  existentes: conservar su fecha y versión histórica y revisar manualmente
  cualquier caso abierto antes de usarlo en operación real.
- Para los dos meses se computan meses calendario y se aplica la regla legal
  para el vencimiento que caiga en día feriado o de vacancia. La aplicación
  concreta a Dusema requiere la revisión jurídica final indicada arriba.

## Consecuencias y riesgos

- El Backoffice podrá demostrar que se solicitó completar el reclamo y cuándo
  venció el plazo, sin almacenar el contenido o soportes identificatorios.
- La declaración de no recepción sigue siendo una atestación del operador: el
  POS no integra el buzón externo. Debe conservarse allí el soporte de envío y
  la búsqueda del canal debe estar documentada.
- Los casos anteriores `RECIBIDO` no tienen una fecha fiable de requerimiento.
  No se les inventa fecha, no se convierten automáticamente en `DESISTIDO` y no
  se les calcula un plazo de dos meses retroactivo. Deben resolverse caso por
  caso por el canal restringido.
- Las nuevas referencias de comunicación son metadatos personales potenciales;
  deben quedar fuera del export comercial ordinario y cubiertas por retención,
  acceso restringido y supresión conforme a ADR-SAAS-100/101.

## Migración y recuperación

- No hay migración destructiva. Los campos nuevos son opcionales y los casos
  históricos conservan su estado.
- Toda transición es transaccional e idempotente; ninguna recuperación borra
  el expediente ni sus referencias.
- Si falla el nuevo flujo, se deshabilitan las acciones nuevas mediante una
  reversión de código y se mantiene la atención manual con expediente externo.
  Los campos ya escritos se preservan para una reanudación compatible.

## Validación requerida antes de activar

- Emulator: actor sin facultad, actor ajeno, referencias inválidas, envío fuera
  de plazo, reintento idéntico, conflicto de referencia, subsanación anterior y
  posterior a dos meses, desistimiento anticipado, idempotencia y estado
  terminal.
- Backoffice staging: recepción incompleta, solicitud documentada, consulta de
  vencimientos, subsanación y desistimiento con identidad autorizada.
- Rules/exportación: sin lectura directa del expediente y sin inclusión de
  referencias privadas en exportaciones ordinarias.
- Confirmar el calendario aplicable con validación jurídica; después actualizar
  ADR-SAAS-102 y documentos maestros en el PR de implementación.

## Fuera de alcance

- Envío o recepción automática de correo.
- Almacenar documentos de identidad o el contenido de comunicaciones.
- Borrar casos al desistirse.
- Alterar facultades, Rules, datos reales o producción.
- Declarar el flujo operativo o jurídicamente certificado antes del smoke y la
  revisión factual/jurídica requeridos.

## Fuentes

- [Ley 1581 de 2012, artículo 15](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Ley 4 de 1913, artículo 62](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426).
- [Concepto 148831 de 2025 — Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=261616), que recoge la regla general de cómputo y la jurisprudencia citada sobre sábados; su conclusión concreta trata empleo público.
- [Resolución SIC 55022 de 2021](https://sedeelectronica.sic.gov.co/sites/default/files/estados/072022/RE55022-2021.pdf), que cita el artículo 15 sin resolver en el texto revisado el tratamiento de sábados.
