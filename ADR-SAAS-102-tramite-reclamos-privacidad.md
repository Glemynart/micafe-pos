# ADR-SAAS-102 — Trámite de reclamos de privacidad

Estado: **Aceptado para implementación**, 2026-11-24, por decisión delegada
expresamente por Sebastián tras revisar y corregir la alternativa A.
G-SAAS-02 → M2 → E2.2.

La leyenda y el motivo deben acompañar al dato afectado mientras se decide el
reclamo. El flujo legal actual conserva aceptaciones y no tiene autoridad para
escribir sobre los registros objeto de reclamo.

## Alternativas

- A. Operación privada en servidor, limitada a rutas y actores autorizados.
  Abrir/cerrar cada expediente y actualizar la anotación en una transacción.
- B. Tramitar por correo y anotar a mano con acceso a consola. Es menos
  trabajo inicial, pero da acceso más amplio del necesario y el correo solo
  no demuestra que la anotación quedó en el registro.

## Diseño aceptado

- Empezar por fichas del directorio `clientes/{clienteId}` con `empresaId`
  verificable y un solo registro afectado por operación. El servidor comprueba
  la relación entre expediente, titular verificado, ficha y empresa. Sin ruta
  libre ni búsqueda global. Para otros dominios, remitir al responsable y
  registrar el pendiente y su plazo. La cobertura del directorio no acredita
  cobertura de usuarios, ledgers ni expedientes de plataforma.
- Reusar el control de operador activo, versión de autorización y revocación.
  Usar una facultad de privacidad asignada explícitamente y restringida al caso
  verificado. No añadirla al Bootstrap ni derivarla del rol admin o de
  `CONSERVACION_GOBERNAR`. Cuando Dusema actúe por cuenta del negocio, exigir
  instrucción verificada del responsable y documentar el traslado. Revalidar
  operador, alcance y estado del expediente en cada transacción.
- Abrir el expediente y vincular al dato la leyenda «reclamo en trámite» en la
  misma transacción. Mantener el motivo y referencia del caso en anotaciones
  privadas ligadas a la ficha. Mostrar la leyenda y los motivos vigentes juntos
  en la consulta autorizada de la ficha. Las lecturas operativas del directorio
  no reciben los motivos, la identidad del solicitante ni el expediente.
  Proteger el indicador reservado de escrituras ordinarias y mantener las
  colecciones privadas sin acceso directo desde el cliente.
- Usar una clave de caso estable por empresa; un reintento idéntico devuelve el
  resultado existente. Rechazar reutilizar la clave con otro registro o motivo.
  El cierre cambia solo la anotación de ese caso. El indicador permanece mientras
  haya casos abiertos en la ficha. Guardar el resultado y la constancia de
  respuesta en el expediente. Rectificaciones, supresiones y borrados siguen
  sus autoridades existentes. Restringir eliminación o reemplazo de la ficha
  mientras existan anotaciones abiertas, con escalamiento al responsable.
- Registrar recepción, recepción completa, traslado, anotación, respuesta y
  cierre. La anotación vence en dos días hábiles desde el reclamo completo. El
  plazo de respuesta es 15 días hábiles desde el día siguiente a la recepción.
  Comunicar una extensión motivada antes de que venza ese plazo, hasta ocho días
  hábiles adicionales. Aplicar el calendario colombiano y conservar la evidencia
  del cómputo. Antes de almacenar datos reales, definir las proyecciones de
  exportación y la conservación de expedientes sin copiar motivos al export
  comercial ordinario.

## Verificación antes de activar el trámite

Probar operador revocado o sin facultad, instrucción ausente, ficha de otra
empresa, motivo inaccesible al vendedor, reintento, concurrencia de dos casos,
cierre parcial, edición y eliminación de la ficha, exportación y plazos en
festivos. Verificar una solicitud sintética por el canal de recepción y su
respuesta. El ensayo local previo demuestra únicamente la transacción con un
registro ficticio. El despliegue y la habilitación para casos reales se revisan
por separado. [Ley 1581 de 2012, arts. 15 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
