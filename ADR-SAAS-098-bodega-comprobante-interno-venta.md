# ADR-SAAS-098 — Comprobante interno numerado para ventas Bodega

## Estado

**PROPUESTO — 2026-10-30. No aprobado.**

- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`, con certificación
  posterior en `M3 / E3.1`.
- **Decisor de alcance:** responsable del proyecto.
- **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-042, ADR-SAAS-062, ADR-SAAS-064 y ADR-SAAS-091.
- **Límite:** esta propuesta no autoriza implementación, despliegue, emisión de
  documentos productivos ni escrituras en Firebase.

## Contexto

Diana necesita entregar al cliente un papel ordenado con los productos, las
cantidades, el total y un consecutivo reconocible en el sistema. Muchos clientes
reciben la mercancía y pagan después; el registro del abono actualiza la cuenta
por cobrar. El responsable pidió que el documento sea interno y entregable al
cliente, no que se presente como factura DIAN.

El flujo aceptado de Bodega mantiene separadas la solicitud y la venta. Según
ADR-SAAS-091, la venta se materializa al confirmar la entrega, y puede quedar
pagada o pendiente. La solicitud o agenda de ADR-SAAS-062/064 no crea por sí
misma una venta, cuenta por cobrar ni movimiento de inventario. Por ello, el
documento que se llame comprobante de venta no debe emitirse como venta al
crear una solicitud que todavía puede cambiar, ser rechazada o no entregarse.

El checkout genérico ya imprime tickets para ventas confirmadas, pero esa
capacidad no define el documento, consecutivo, snapshot ni reimpresión para el
flujo de venta a crédito de Bodega. La numeración fiscal y los documentos
internos son autoridades distintas.

## Problema

Se necesita representar y reimprimir una evidencia comercial numerada para una
venta Bodega entregada, sin:

- convertir una solicitud en venta antes de entregar la mercancía;
- confundir el consecutivo interno con numeración fiscal autorizada;
- crear una segunda venta o cambiar el saldo cuando se imprime o reimprime;
- perder los datos originales si el catálogo o los datos del cliente cambian;
- generar duplicados por concurrencia o reintento.

## Opciones consideradas

### Opción A — Reutilizar el identificador técnico del pedido o de la venta

Imprimir el ID actual de Firestore o una referencia técnica existente.

- **Ventajas:** no agrega autoridad ni contador.
- **Consecuencias:** los IDs no son un consecutivo comercial legible y no
  garantizan que el papel contenga los datos congelados de la venta. No satisface
  lo que pidió Diana.
- **Resultado:** no recomendada.

### Opción B — Numerar un pedido al momento de registrarlo

Asignar un folio visible cuando el vendedor captura la solicitud, antes de la
entrega. El papel se llamaría **pedido** y no factura ni comprobante de venta.

- **Ventajas:** Diana y el cliente pueden referirse a la solicitud con un
  número legible, incluso si la entrega será posterior.
- **Consecuencias:** no confirma cantidades, precio definitivo, venta, ingreso
  ni saldo. Si el cliente pide cambios, se requiere historial de revisiones o
  un nuevo pedido. Para documentar la entrega se necesitaría otro acto o
  documento.
- **Resultado:** viable solo si la necesidad principal es numerar solicitudes,
  no emitir una evidencia de la mercancía efectivamente entregada.

### Opción C — Comprobante interno numerado al confirmar la venta entregada

Asignar el consecutivo dentro de la misma operación server-authoritative que
confirma la venta Bodega al entregar el pedido. Guardar en la venta un snapshot
comercial y permitir imprimirlo o reimprimirlo. Si la venta queda a crédito, el
comprobante identifica el saldo inicial pendiente y el compromiso de pago si se
registró.

- **Ventajas:** el folio corresponde a una venta real confirmada; total,
  cantidades, cliente y precios coinciden con la autoridad del servidor; sirve
  para ventas pagadas y a crédito.
- **Consecuencias:** la solicitud previa conserva su propia referencia interna,
  pero no se entrega como comprobante de venta. El consecutivo requiere una
  secuencia transaccional por tenant y manejo explícito de anulaciones.
- **Resultado:** recomendada para la necesidad descrita.

### Opción D — Emitir factura fiscal o equivalente DIAN

Integrar numeración autorizada, requisitos tributarios, emisión y validación
electrónica o modalidad fiscal aplicable al tenant.

- **Ventajas:** podría producir el documento fiscal que corresponda cuando el
  negocio esté listo y obligado a emitirlo por ese medio.
- **Consecuencias:** amplía el alcance fiscal, exige readiness legal y técnica,
  datos fiscales completos y una decisión de integración. El Goal mantiene la
  operación inicial Bodega en DEMO/no fiscal.
- **Resultado:** fuera de este ADR; requiere decisión y certificación fiscal
  separadas.

## Decisión recomendada

Adoptar la **Opción C** y mostrar el documento como **“Comprobante interno de
venta”**. Aunque en conversación se le llame “factura interna”, el título
impreso no debe afirmar que sea factura electrónica, documento equivalente,
soporte fiscal o documento con numeración DIAN.

El consecutivo se asignará únicamente cuando se confirme la entrega y se cree
la venta canónica. La venta puede quedar pagada o pendiente de pago de acuerdo
con ADR-SAAS-091. La solicitud o agenda previa no consume un número de venta.

### Contrato propuesto

- El servidor asigna un entero consecutivo monotónico, único por tenant y tipo
  de documento Bodega. El cliente no propone ni puede modificar el número.
- La asignación del número, la venta canónica, la cuenta por cobrar si aplica y
  el snapshot del comprobante se confirman atómicamente. Reintentar el mismo
  comando devuelve el mismo `folioInterno` y la misma venta.
- Los números ya confirmados nunca se reutilizan, incluso si la venta se anula.
  Las solicitudes rechazadas/canceladas y comandos que no llegan a confirmar
  una venta no consumen consecutivo.
- El snapshot inmutable conserva: tenant y nombre comercial disponible,
  cliente, fecha de confirmación, líneas con nombre de producto y presentación,
  cantidades, precios y subtotales resueltos en servidor, descuentos/ofertas
  aplicados, total, forma/estado de pago y saldo inicial cuando quede pendiente.
  No incluye valores fiscales que no estén configurados y certificados.
- La impresión y reimpresión son de solo lectura. Reimprimir no crea otra venta,
  no asigna otro folio y no cambia cuenta, stock, caja ni movimientos.
- Para una venta a crédito, el comprobante indica **“PENDIENTE DE PAGO”** y el
  saldo inicial. Los abonos posteriores no reescriben el comprobante histórico;
  se consultan en la cuenta por cobrar. Emitir recibos numerados de abono queda
  fuera de este alcance y requerirá decisión si Diana los necesita.
- Una venta anulada conserva el folio y su evidencia histórica; el documento
  reimpreso debe identificarla como anulada según la transición canónica. No se
  borra ni se corrige directamente el snapshot.
- La lectura/reimpresión usa la autorización existente de venta e historial,
  con aislamiento por tenant. El folio no es una credencial ni un enlace de
  acceso.
- La presentación será imprimible desde Web/PWA. No se exige un proveedor
  externo ni guardar un PDF generado en Storage.

El documento debe incluir una leyenda visible: **“Comprobante interno de
venta. No es factura electrónica ni documento fiscal.”** La factura electrónica
o la modalidad de documento equivalente que corresponda a Diana se mantiene
separada y no queda satisfecha por este comprobante.

## Invariantes

1. Solo existe un folio para cada venta canónica Bodega y cada folio se asocia a
   una sola venta del tenant.
2. El consecutivo se genera y persiste en servidor, con unicidad aun ante dos
   confirmaciones concurrentes.
3. Replay idempotente no duplica venta, folio, inventario, saldo, movimiento ni
   documento.
4. La solicitud, agenda y aprobación no crean el comprobante de venta. La
   emisión corresponde a la confirmación de la entrega.
5. El snapshot impreso no depende de lecturas actuales del catálogo para
   reconstruir una venta histórica.
6. La impresión, vista previa y reimpresión no escriben datos.
7. El papel no se presenta como factura DIAN ni sustituye readiness fiscal.
8. No se migran ventas históricas ni se completa su numeración retroactivamente.
9. No se alteran ADR-SAAS-091/062/064 sobre aprobación, momento de venta,
   crédito, abonos, agenda o reservas.
10. No se altera la venta retail de Nevera ni su comprobante en este corte.

## Criterios de aceptación arquitectónica y pruebas requeridas

Antes de autorizar despliegue, el PR de implementación deberá demostrar:

- folio único en ventas concurrentes de un mismo tenant y secuencia aislada
  entre dos tenants;
- asignación atómica con venta, inventario, cobro/cuenta por cobrar y snapshot;
- mismo folio y documento en reintento idempotente; conflicto con payload
  distinto sin efectos parciales;
- no se emite folio de venta en solicitudes rechazadas, canceladas o no
  entregadas;
- precio, presentación, cantidades, descuentos y total coinciden con la
  resolución server-side al momento de la venta;
- estados de pago inmediato y crédito se imprimen correctamente; los abonos
  posteriores actualizan el saldo sin alterar el snapshot original;
- anulación conserva el folio y no permite reutilizarlo;
- vista previa, impresión y reimpresión producen el mismo snapshot sin
  escrituras;
- usuarios autorizados del tenant acceden al documento y las identidades de
  otro tenant no pueden consultarlo;
- modo DEMO no agrega etiquetas, impuestos, resoluciones, prefijos ni datos
  fiscales inventados;
- pruebas de regresión de venta Bodega, solicitud/agenda, cuenta por cobrar,
  abonos, reimpresión, idempotencia y Rules aplicables.

## Implementación, compatibilidad y recuperación

La implementación deberá limitarse al codebase Bodega y a la superficie de
App Hosting estrictamente necesarios. El PR deberá identificar sus callables,
dependencias, reglas efectivas y orden de despliegue antes de publicarse.

- El nuevo campo y snapshot serán opcionales para ventas históricas.
- No habrá backfill ni asignación retroactiva de folios.
- El lector de historial seguirá mostrando ventas antiguas usando la evidencia
  que ya tengan; no generará un comprobante nuevo a partir de datos actuales.
- Si el despliegue de código se revierte, las ventas y folios ya confirmados se
  conservan. El código previo no debe borrar ni reutilizar la secuencia; el
  recovery debe volver a una versión que pueda ignorar los nuevos campos sin
  cambiar los hechos de venta.
- Una vez emitidos folios, la recuperación es de código y no borra datos. Las
  correcciones financieras se realizan con los comandos compensatorios
  existentes; nunca editando la secuencia o borrando el comprobante.

## Decisiones que siguen pendientes

- Aceptar o rechazar la Opción C y el momento propuesto de emisión: al confirmar
  la entrega como venta canónica, no al crear el pedido previo.
- Confirmar el rótulo recomendado “Comprobante interno de venta”. El título
  “Factura” no se usará como afirmación fiscal; si se requiere factura fiscal,
  habrá que abrir un alcance de readiness/Integración DIAN separado.
- El diseño visual final del papel (carta, media carta o ticket) se define en
  el PR de interfaz, sin cambiar el contrato de datos ni la autoridad del folio.

## Registro de aprobación

Pendiente. La instrucción del responsable de que sea un documento interno para
entregar al cliente aprueba esa intención de producto, pero esta ADR presenta
para revisión la autoridad, secuencia, snapshot y momento de emisión. No se
registrará como aceptada hasta recibir aprobación explícita de esta decisión.
