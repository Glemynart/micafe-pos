# Manual interno de tratamiento de datos personales — Dusema POS

**BORRADOR INTERNO 0.1 — 2026-11-28. No adoptado, no vigente y no acredita cumplimiento.**

Este borrador reúne las reglas internas de Dusema para tratar datos personales
propios y los que procesa por instrucciones de los negocios que usan el POS.
Debe revisarse y adoptarse por el prestador, y contrastarse con la operación y
la asesoría jurídica, antes de tratarlo como procedimiento vigente. La política
externa de tratamiento informa a los titulares; este documento organiza las
prácticas internas y no la reemplaza. El repositorio donde se versiona es
público: no agregar aquí expedientes, identificaciones, credenciales ni otra
información personal o confidencial.

## 1. Identificación, alcance y control

- **Servicio:** Dusema POS, prestado por la persona natural identificada en los
  términos en borrador.
- **Contacto operativo propuesto:** el prestador designó un contacto principal
  para solicitudes de privacidad. No hay suplente documentado; la continuidad
  es un riesgo pendiente.
- **Ámbito:** cuentas y contactos del servicio; datos que los negocios registran
  de sus clientes, vendedores y proveedores; solicitudes de privacidad;
  información de soporte, seguridad y facturación.
- **Regla de roles:** Dusema actúa como encargado cuando trata información de un
  negocio siguiendo sus instrucciones documentadas. Puede ser responsable
  independiente para las finalidades propias del servicio. Cada tratamiento se
  clasifica por su propósito y autoridad real; el producto no convierte por sí
  solo a Dusema en responsable de toda información del tenant.
- **Control de cambios:** cada modificación registra versión, fecha, causa,
  aprobador y procedimientos afectados. Una versión nueva no cambia
  retroactivamente los expedientes ni las aceptaciones anteriores.

## 2. Estado operativo conocido

Al 2026-11-28, el flujo legal de Backoffice y sus pruebas están en preparación;
staging contiene datos sintéticos y documentos marcados como borradores. La
interfaz legal y el recorrido operativo no están habilitados en producción. La
exportación con datos reales no está certificada y la supresión real no se ha
probado. Por tanto:

1. No registrar casos reales en staging ni en herramientas de desarrollo.
2. No enviar documentos de identidad, expedientes ni exportaciones por issues,
   commits, chats de desarrollo o enlaces públicos.
3. No afirmar que el correo publicado en los borradores, el POS o un repositorio
   concreto es un canal seguro hasta comprobar acceso, recepción, respuesta y
   conservación restringida.
4. Si llega una solicitud real antes de habilitar el flujo, preservar fecha,
   canal y contenido mínimo en un medio seguro efectivamente disponible; no
   prometer que el sistema la registró. Escalarla al contacto operativo y al
   negocio responsable cuando corresponda, sin reiniciar el plazo por traslado.
5. Detener una entrega o borrado si no se puede verificar la identidad,
   legitimación, autorización del negocio, alcance, retención legal o destino.

## 3. Reglas para el ciclo de tratamiento

### 3.1 Antes de recolectar o habilitar una finalidad

La persona que proponga un tratamiento debe documentar: finalidad específica,
categorías de datos y titulares, rol de Dusema y del negocio, fuente, fundamento
aplicable, información entregada al titular, acceso autorizado, sistemas y
proveedores, retención y método de salida. Debe limitar los campos a lo
necesario. Si la finalidad, fundamento o rol no están claros, no se amplía el
formulario ni se habilita un nuevo uso hasta resolverlo.

No se presume que datos sensibles o de menores sean necesarios para el POS. Si
un negocio propone tratarlos, debe detenerse esa incorporación hasta evaluar
necesidad, autorización y salvaguardas específicas.

### 3.2 Acceso, uso y divulgación

- Conceder acceso por función y tenant, con el mínimo privilegio necesario.
- Verificar que una consulta, corrección, exportación o entrega afecte solo al
  titular y al negocio pertinentes.
- Requerir una instrucción verificable del negocio antes de decidir sobre datos
  cuyo responsable sea ese negocio, salvo deber legal propio u orden competente.
- No copiar payloads personales a logs, reportes de CI, documentación pública ni
  evidencias de pruebas. Usar referencias opacas y datos sintéticos.
- Revisar accesos privilegiados y conservar las actuaciones en el expediente
  restringido definido para ese flujo.

### 3.3 Consultas y reclamos

Aplicar el [procedimiento operativo de consultas y privacidad](PROCEDIMIENTO-CONSULTAS-PRIVACIDAD.md)
y el expediente autorizado. Registrar fecha y hora de Colombia, canal, tipo,
identidad/legitimación verificada, tratamiento, tenant, responsable, eventos,
plazo, respuesta y constancia de envío. Solicitar solo los datos necesarios
para verificar identidad o representación; nunca usar PIN, contraseña o código
de sesión como prueba.

Como referencia legal, las consultas tienen un máximo de diez días hábiles y,
si no se atienden dentro de ese término, se informa antes del vencimiento el
motivo y la nueva fecha, que no puede superar cinco días hábiles adicionales.
Si quien recibe no es competente para resolver, trasladar el reclamo a quien
corresponda en máximo dos días hábiles e informar al solicitante. Si está
incompleto, pedir subsanación dentro del término legal de cinco días desde su
recepción; si no se aporta lo requerido dentro de dos meses desde el
requerimiento, registrar el desistimiento conforme a la ley. Recibido completo,
incluir la leyenda «reclamo en trámite» y su motivo en el registro afectado en
un máximo de dos días hábiles y mantenerla hasta decidirlo.

El artículo 15 fija quince días hábiles contados desde el día siguiente al
recibo del reclamo completo. Si no puede responderse en ese plazo, informar al
solicitante los motivos y la fecha de respuesta; esa fecha no puede superar
ocho días hábiles adicionales. Para nuevos expedientes, ADR-SAAS-110 fija el
cómputo interno desde el día siguiente a la recepción verificable del reclamo
completo; los vencimientos históricos se conservan. La regla de calendario de
ADR-SAAS-104 es una convención operativa y no una interpretación oficial:
mientras tenga revisión jurídica pendiente, el responsable debe proteger el
término más corto razonablemente aplicable y escalar cualquier duda.

No cerrar un caso sin registrar decisión, fundamento, respuesta, fecha,
constancia de entrega o intento, anotación en el registro afectado cuando
corresponda y el destino de la evidencia. Una queja que corresponda a un
negocio se traslada con la fecha original y se coordina sin revelar datos del
solicitante antes de verificar legitimación.

### 3.4 Incidentes de seguridad

Ante sospecha de acceso, alteración, pérdida, divulgación o indisponibilidad que
pueda afectar datos personales:

1. Preservar la evidencia técnica disponible y limitar nuevos accesos o cambios
   que puedan agravar el evento; no borrar evidencia.
2. Registrar cuándo se detectó, quién la reportó, sistemas/tenants potenciales,
   datos posiblemente afectados y acciones tomadas, minimizando datos en el
   registro.
3. Determinar si Dusema es responsable, encargado o ambos para cada tratamiento.
   Cuando actúe como encargado, informar al negocio responsable y asistirlo de
   acuerdo con el contrato y los hechos verificados.
4. Evaluar obligaciones de comunicación a titulares y autoridades, destinatario,
   contenido y plazo aplicables con asesoría competente. No inferir que un
   evento es reportable o no reportable sin esa evaluación.
5. Documentar decisión, fundamento, comunicaciones, seguimiento y cierre.

El simulacro documentado es de mesa; no certifica detección, notificación ni
respuesta real en producción.

### 3.5 Proveedores y transferencias

Antes de habilitar un proveedor que procese datos personales, registrar servicio,
propósito, categorías, región/configuración relevante, subencargados conocidos,
instrumento contractual aplicable, instrucciones, seguridad, retención/salida y
responsable de verificarlo. No extender automáticamente un acuerdo a productos
distintos del que cubre. Si esos datos no están acreditados, registrar la
incertidumbre y no describir al proveedor como aprobado para ese tratamiento.

El [inventario de proveedores y evidencia](PROVEEDORES-EVIDENCIA-2026-11.md)
contiene hallazgos de solo lectura. No es un registro contractual completo ni
demuestra qué versión aceptó cada cuenta.

### 3.6 Conservación, exportación y supresión

Seguir la [operación y conservación](OPERACION-Y-CONSERVACION.md) y el
[procedimiento de salida](IMPLEMENTACION-SALIDA.md), pero distinguir propuesta,
configuración observada y comportamiento probado. Para toda salida:

- verificar identidad, autoridad, tenant, alcance y canal de entrega;
- generar la exportación con alcance declarado, integridad y cifrado;
- comprobar legibilidad, relaciones y archivos dentro del alcance;
- registrar entrega y acuse sin exponer el contenido en la evidencia;
- identificar obligaciones, retenciones, litigios, ledger o identidades
  compartidas que impidan borrar;
- dejar constancia de lo eliminado, anonimizado, retenido y de lo que pueda
  persistir en respaldos o ciclos del proveedor.

El preflight, las pruebas con fixtures y los despliegues de staging no equivalen
a exportación integral o supresión real. No ejecutar esas acciones en
producción hasta que sus gates, autorizaciones y mecanismos sean verificables.

## 4. Registros, confidencialidad y revisión

El expediente de privacidad conserva referencias y actuaciones necesarias, no
copias de identidad innecesarias. El acceso debe restringirse a operadores
autorizados y quedar registrado. La retención se define por categoría,
finalidad, obligación y holds; no usar una fecha genérica para todo el tenant.
La matriz y configuración real de sistemas y respaldos deben reconciliarse antes
de prometer un plazo de eliminación.

Quien acceda a datos debe mantener confidencialidad y reportar usos fuera de su
función. El responsable revisa este manual y sus procedimientos cuando cambien
finalidades, proveedores, infraestructura, ley, plazos, autoridad o hallazgos de
incidente; también registra una revisión periódica y los elementos correctivos.

## 5. Pendientes para adopción y operación

Este borrador no queda adoptado hasta cerrar y dejar evidencia de:

- revisión jurídica colombiana de documentos, calendario y procesos;
- contacto y canal de recepción/respuesta externos verificados, con medio
  restringido para expedientes y cobertura de continuidad;
- implementación y pruebas sintéticas de la facultad/callables/UI dedicada
  aceptada en ADR-SAAS-109; el contacto real y el proveedor siguen sin estar
  autorizados ni verificados;
- contratos/instrumentos y subencargados confirmados para cada producto usado;
- conciliación de retenciones, regiones, respaldos, logs y Storage; resolución
  del riesgo de ACL/identidad reportado en ADR-SAAS-111 sin cambios hasta contar
  con decisión y preflight aprobados;
- pruebas autenticadas completas en staging de consultas/reclamos, aislamiento,
  exportación y supresión dentro del alcance que pueda probarse sin datos reales;
- autorización específica y procedimiento controlado antes de cualquier
  exportación real; ninguna supresión real se autoriza mediante este manual;
- aprobación expresa del prestador y asignación de responsable/suplente.

Hasta entonces, mantener `BORRADOR / PREPARACIÓN`, no exigir aceptación a
clientes ni declarar el servicio legalmente certificado.

## Fuentes y documentos relacionados

- [Ley 1581 de 2012, artículos 14, 15, 17 y 18 — Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [SIC: diferencia entre política de tratamiento y manuales internos](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/diferencia-entre-politica-de-tratamiento-de-datos-y-manuales-internos-de-tratamiento-de-datos).
- [Política para titulares](politica-tratamiento.md), [aviso](aviso-autorizacion.md), [términos](terminos-servicio.md) y [anexo por negocio](anexo-tratamiento.md), todos borradores.
- [Consultas y reclamos](PROCEDIMIENTO-CONSULTAS-PRIVACIDAD.md), [conservación](OPERACION-Y-CONSERVACION.md), [salida](IMPLEMENTACION-SALIDA.md) e [inventario de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md).
- [ADR-SAAS-104](../../ADR-SAAS-104-tramite-reclamos-incompletos.md), [ADR-SAAS-110](../../ADR-SAAS-110-plazo-reclamo-completo.md), [ADR-SAAS-109](../../ADR-SAAS-109-facultad-contacto-exportacion.md) y [ADR-SAAS-111](../../ADR-SAAS-111-acceso-acls-storage.md).
