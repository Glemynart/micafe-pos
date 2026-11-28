# ADR-SAAS-110 — Inicio del término de respuesta a reclamos incompletos

Estado: **Aceptado para implementación y validación sintética/staging**, 2026-11-28.
Goal: `G-SAAS-02 → M2 → E2.2`.

El responsable aprobó la alternativa A el 2026-11-28. La aceptación habilita
implementar y validar el origen de plazo con datos sintéticos/Emulator/staging;
no constituye concepto jurídico profesional, no autoriza escrituras o
despliegues productivos y no sustituye validación jurídica antes de publicar
documentos o activar el flujo en producción.

## Contexto

ADR-SAAS-102/104 y `functions/src/legal/privacy-claims.ts` mantienen por separado
la recepción inicial (`recibidoEn`) y la fecha en que el reclamo quedó completo
(`completoEn`). Para un reclamo que llegó incompleto, el servidor actualmente
calcula los quince días de respuesta desde `recibidoEn`, incluso si el
solicitante entrega la subsanación dentro de los dos meses y el reclamo solo se
completa mucho después. El plazo puede vencer antes de que exista un reclamo
completo que se pueda tramitar.

El artículo 15 de la Ley 1581 regula primero cómo completar el reclamo
incompleto y, a continuación, dispone que el término máximo de respuesta de
quince días hábiles se cuenta desde el día siguiente al recibo. El texto de la
misma disposición vincula la inclusión de la leyenda y el trámite posterior al
momento en que se recibe el reclamo completo. La lectura sistemática sugiere
usar la fecha en que se recibió toda la información requerida como origen del
plazo de respuesta; debe validarse jurídicamente para la operación de Dusema.

Fuente primaria: [Ley 1581 de 2012, artículo 15 — Gestor Normativo de Función
Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).

## Problema

El origen actual del vencimiento no distingue la recepción de un reclamo
incompleto de la recepción de un reclamo completo. Cambiarlo sin una política
versionada podría reinterpretar expedientes abiertos e invalidar extensiones
ya registradas.

## Alternativas

### A. Contar desde la recepción del reclamo completo — recomendada

Para casos nuevos, contar los quince días hábiles desde el día siguiente a la
fecha efectiva en que el responsable recibe el reclamo completo. En casos con
subsanación, usar la fecha documentada de recepción de la información faltante;
no la fecha posterior en que un operador verifica o registra el expediente.
El plazo de cinco días para solicitar subsanación conserva como origen la
recepción inicial. La anotación de dos días continúa contándose desde el
reclamo completo.

Ventaja: separa los dos momentos que la norma trata por separado y evita un
vencimiento anterior a la completitud. Requiere registrar una base de plazo
explícita y conservar la compatibilidad histórica.

### B. Mantener la recepción inicial como origen

Conserva el comportamiento actual y es más corto para el responsable, pero el
plazo puede agotarse durante el período permitido para subsanar. No representa
claramente el flujo posterior a la recepción del reclamo completo.

### C. Pausar el plazo durante la subsanación y reanudar el saldo

Evita que el reloj corra mientras falta información, pero introduce un cálculo
de suspensión y reanudación no expresado en el artículo 15 y más complejo que
las alternativas anteriores.

## Recomendación

Se acepta **A**, sujeta a revisión jurídica colombiana. El sistema debe considerar
la fecha efectiva y verificable de recepción completa como el origen del
término de respuesta, mientras conserva `recibidoEn` para el requerimiento
inicial de subsanación y el historial.

## Invariantes propuestas

- Los casos nuevos escriben una versión explícita del origen del término de
  respuesta, por ejemplo `RECIBO_COMPLETO_V1`; no se infiere del estado del caso.
- Un expediente sin `plazoRespuestaVersion` se interpreta como la política
  histórica `RECIBO_INICIAL_LEGACY`. Sus vencimientos persistidos prevalecen;
  si falta el vencimiento, solo se reconstruye desde `recibidoEn` y el
  `calendarioVersion` histórico.
- En un reclamo completo desde el primer contacto, la fecha efectiva de
  recepción completa se registra como tal, aunque el operador lo verifique
  posteriormente.
- En un reclamo subsanado, la fecha efectiva debe coincidir con la recepción
  documentada de la información faltante (`subsanacionRecibidaEn`). El tiempo
  de registro server-side se conserva aparte y no sustituye ese dato.
- `vencimientoRespuesta` se calcula desde el día siguiente a esa fecha, con la
  versión de calendario ya guardada en el expediente. La prórroga motivada se
  calcula desde ese vencimiento base.
- El requerimiento de subsanación conserva su plazo de cinco días desde
  `recibidoEn`; el desistimiento conserva los dos meses desde la fecha del
  requerimiento; la anotación conserva los dos días desde que el caso quedó
  completo.
- Expedientes históricos conservan exactamente los vencimientos y prórrogas
  persistidos. Si falta un vencimiento, el lector usa la política histórica
  explícita o el fallback legacy definido arriba; nunca lo recalcula
  silenciosamente con la política nueva.
- Una actualización de política no recalcula en bloque casos abiertos ni
  convierte expedientes vencidos en estado distinto.
- El expediente retiene la referencia opaca de la recepción de subsanación y
  los metadatos mínimos; no almacena contenido de correo, documentos de
  identidad, adjuntos ni otros datos personales adicionales.
- Emulator y staging deben cubrir: reclamo completo inicial; subsanación antes
  y después de quince días desde la recepción inicial; fecha efectiva versus
  registro tardío; idempotencia; prórroga; expedientes V1 históricos con y sin
  vencimientos persistidos; calendario V1/V2; y aislamiento/roles sin cambios.

## Migración, compatibilidad y rollback

- No hay migración masiva ni cambio destructivo. La nueva base se aplica solo a
  casos cuya política explícita así lo indique.
- Los expedientes históricos sin el nuevo campo siguen la regla histórica y
  preservan su vencimiento persistido.
- La implementación debe validar discrepancias entre fecha declarada y
  referencia de recepción; un caso inconsistente falla cerrado y requiere
  revisión manual.
- El rollback deshabilita únicamente el camino nuevo para crear o completar
  casos. Conserva todos los campos y plazos existentes; no borra ni reescribe
  expedientes.

## Alcance de una eventual aprobación

Una aprobación permitiría actualizar ADR-SAAS-102/104 y documentos maestros,
implementar la versión del origen de plazo, probarla en Emulator y validar el
flujo sintético en staging. No autorizaría publicaciones legales definitivas,
mutaciones productivas, exportación o supresión de datos reales ni cambios IAM.
