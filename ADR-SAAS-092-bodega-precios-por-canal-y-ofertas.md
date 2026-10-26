# ADR-SAAS-092 — Bodega MVP-1: precios por canal y ofertas programadas

## Estado

**PROPUESTO — 2026-10-26. Pendiente de aprobación explícita.**

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`; validación posterior en `M3 / E3.1`.
- **Decisor de alcance:** responsable del proyecto.
- **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-062, ADR-SAAS-070,
  ADR-SAAS-091.
- **Supersede propuesto:** ADR-SAAS-041 §8 solo en su requisito de un precio
  único por presentación, y en la exclusión de promociones; ADR-SAAS-062 solo
  en cuanto el snapshot comercial también debe incluir canal y oferta
  vigente; ADR-SAAS-070 únicamente en su adopción de precio único para todos
  los compradores. Se conserva íntegra la separación del precio del SaaS
  definido por ADR-SAAS-061.
- **Límite:** esta ADR no importa precios, crea promociones, modifica catálogo,
  escribe recursos remotos ni autoriza despliegues.

## Contexto

El catálogo Bodega actual define un `precioCOP` único por presentación. El
precio se resuelve en servidor al crear/aprobar la solicitud y al confirmar la
venta; las ventas congelan el snapshot. ADR-SAAS-070 aceptó una tarifa única.

El responsable explicó que el negocio necesita cobrar un precio mayorista a
tiendas y un precio de consumidor final para la venta al detalle desde Nevera.
También pidió que administración seleccione productos para ofertas, configure
inicio y fecha/hora de fin opcional o las cierre manualmente, y que el precio
base vuelva a aplicarse automáticamente al vencer la oferta. Confirmó que cada
oferta se configura como precio final por presentación y canal.

No hay actualmente un contrato Bodega de promoción temporal ni una autoridad
de precio por canal. Un cambio en este dominio modifica totales de solicitudes,
ventas, cobros a crédito, reportes y snapshots, por lo que no se debe resolver
solo desde UI.

## Requisitos confirmados

1. Cada presentación puede tener un precio para el canal de tienda/mayorista y
   otro para consumidor final/retail, en COP entero positivo.
2. Al vender en ubicación Bodega, el servidor selecciona el precio de tienda;
   al vender desde Nevera, el servidor selecciona el precio consumidor final.
   El cliente no puede elegir un canal distinto al de la operación autorizada.
3. Administración puede seleccionar productos/presentaciones y canales para
   una oferta e indicar el precio final promocional de cada presentación y
   canal.
4. La oferta tiene inicio y puede tener fin con hora; sin fin, se mantiene
   vigente hasta cierre manual. Al alcanzar el fin, el servidor vuelve a
   resolver el precio base sin tarea programada ni modificación del catálogo.
5. Solicitud, aprobación, venta y saldo pendiente guardan snapshots coherentes
   de canal, precio base, precio aplicado y referencia a la oferta; los hechos
   históricos no cambian cuando termina una oferta.

## Alternativas

### Opción 1 — Mantener el precio único de ADR-SAAS-070

Registrar las ventas retail a consumidores con el mismo precio mayorista.

- **A favor:** no hay migración o selección de canal.
- **En contra:** no representa las dos tarifas que Diana confirmó y vuelve
  inexacto el POS retail. No satisface el alcance aprobado.

### Opción 2 — Una tarifa base por canal y precio promocional final por presentación/canal (recomendada)

Guardar precios base `tienda` y `consumidorFinal`. Una oferta guarda el precio
final que se cobrará durante su vigencia para cada presentación/canal
seleccionado. El servidor resuelve el precio efectivo según el canal y la
ventana temporal.

- **A favor:** coincide con la hoja de precios explicada por Diana, hace
  explícito cuánto se cobrará y evita cálculos de redondeo de descuentos.
- **En contra:** agrega campos, migración y validación de integridad; deben
  existir precios consumidor final completos antes de habilitar la venta
  retail.

### Opción 3 — Tarifa por canal más porcentaje de descuento

Cada oferta aplica un porcentaje sobre la tarifa de canal vigente.

- **A favor:** campañas fáciles de parametrizar.
- **En contra:** requiere reglas de redondeo COP, manejo de cambios de precio
  base y reporte del descuento. No corresponde a la preferencia confirmada de
  configurar el precio final.

## Decisión propuesta

Se recomienda la **Opción 2**:

- La fuente de precio base será `precioTiendaCOP` y
  `precioConsumidorFinalCOP`, versionada por presentación. El precio de una
  oferta de software continúa separado.
- El canal se deriva server-side de la ubicación de salida validada. El canal
  no es un campo libre confiado al vendedor.
- La oferta se configura con un precio final por presentación/canal. Al
  activarla, el valor debe ser un entero COP mayor que cero y no puede superar
  el precio base vigente de ese canal. Una oferta puede abarcar varios
  productos, pero sus precios se guardan en unidades de presentación y canal,
  porque un producto puede tener varias presentaciones.
- Para una misma presentación/canal no se permiten intervalos de oferta
  superpuestos. El inicio es inclusivo y el fin exclusivo; sin fin se exige
  cierre manual. Una hora local ingresada se interpreta en `America/Bogota` y
  se almacena como timestamp UTC.
- El cierre manual es una operación admin-only, idempotente y auditada. Cerrar
  una oferta impide su uso futuro, pero no reescribe snapshots de solicitudes,
  ventas, cuentas por cobrar o recibos ya creados.
- No hay job de expiración: el servidor considera vigente una oferta solo si
  `inicio <= ahora < fin` (o no existe fin) y no tiene cierre manual. Al salir
  de la ventana, el servidor resuelve el precio base automáticamente.
- La oferta que se usa es la vigente en la confirmación de entrega/venta. Una
  solicitud aprobada con otra huella de canal/precio/oferta se invalida y
  requiere una nueva aprobación; no congela una promoción para una fecha
  posterior.
- Los movimientos Bodega↔Nevera no aplican precio de venta ni promoción. Solo
  una venta real usa un canal/precio.

## Compatibilidad y migración

1. El campo actual `precioCOP` se preserva y se migra a
   `precioTiendaCOP` para no alterar el precio mayorista ya publicado.
2. `precioConsumidorFinalCOP` se completa únicamente desde la lista aprobada
   por Diana. Si falta, la venta de ese producto desde Nevera falla cerrada;
   nunca vuelve silenciosamente al precio tienda.
3. Ventas históricas conservan su snapshot `precioPresentacionCOP`; no se
   recalculan. Solicitudes existentes deben seguir leyéndose: una solicitud
   cuya huella no contiene canal/precio v2 no puede aprobarse o confirmarse con
   una interpretación nueva; se deja expirar/cancelar y se recrea bajo v2.
4. No se trasladan ofertas de software (`ADR-SAAS-061`) al módulo de
   promociones de productos. Sus autoridades, permisos y almacenes son
   distintos.
5. Antes de aplicar el backfill se genera dry-run, se compara la cuenta de
   presentaciones y los precios fuente, se reportan faltantes/duplicados y se
   obtiene aprobación de datos. Ninguna migración remota está autorizada aquí.

## Seguridad y autoridad

- Solo administración con permiso canónico de gestión de catálogo/ofertas
  crea, programa o cierra ofertas.
- La callable de venta valida miembro, rol, capacidad, empresa, ubicación,
  presentación, canal, precio y oferta dentro de la transacción que crea la
  venta y su snapshot.
- Vendedor puede consultar únicamente una proyección comercial autorizada:
  precio base/effective price, canal y vigencia; no puede enviar precio,
  porcentaje, descuento, ID de oferta, ubicación ajena ni total como hechos
  autoritativos.
- Las consultas y mutaciones son tenant-aware; Rules permanecen deny-by-default
  para catálogo y ventas según ADR-SAAS-041. No se concede escritura directa
  desde cliente.
- Auditoría guarda creador, canales/presentaciones afectadas, ventana,
  cambios, cierre manual y comandos idempotentes; no incluye secretos.

## Criterios de aceptación arquitectónica

Antes de autorizar despliegue, pruebas locales/Emulator y CI deben demostrar:

1. Una venta de tienda usa el precio tienda y una venta desde Nevera usa el
   precio consumidor final, incluso si el cliente manipula su payload.
2. Producto sin precio retail completo se rechaza en ese canal sin escribir
   venta, abono, caja ni inventario.
3. Oferta antes del inicio, durante inicio inclusivo, justo antes del fin,
   justo en el fin exclusivo y después del fin usa el precio esperado; la base
   permanece intacta y vuelve automáticamente tras el fin.
4. Cierre manual impide nuevas ventas con oferta y conserva intactos los
   snapshots históricos; replay no crea una segunda auditoría o movimiento.
5. No se pueden crear precios promocionales inválidos, superpuestos,
   vencimientos anteriores al inicio o canales no válidos.
6. Solicitud y aprobación incluyen la huella del precio efectivo; si cambia
   el canal o el precio antes de confirmar, no se crea una venta con un precio
   distinto al aprobado.
7. Autorización admin/vendedor y aislamiento cross-tenant se prueban para
   consulta, alta, cierre y venta; acceso no autorizado falla sin mutación.
8. Precio base y snapshots de ventas v1 siguen siendo legibles; ventas
   históricas no cambian y módulos no-Bodega conservan su comportamiento.
9. Firestore Emulator y E2E cubren selector de canal, precio, oferta
   programada, finalización manual, vencimiento, abono/cuenta a crédito y
   total correcto en recibo/reportes.

## Riesgos y rollback

- **Precio base migrado incorrectamente:** preflight y conteo de integridad;
  detener el corte ante faltantes. Rollback de código conserva snapshots; la
  migración solo puede revertirse mediante comando compensatorio aprobado,
  nunca borrando documentos o movimientos.
- **Canal o ubicación falsificados:** resolver ubicación y canal en servidor y
  probar payload manipulado.
- **Oferta de duración incorrecta:** timestamps server-side, límites UTC y
  pruebas del instante de frontera. No aceptar reloj del navegador como
  autoridad.
- **Solicitudes con precios desfasados:** invalidar y pedir nueva aprobación;
  no cambiar importe silenciosamente.

## Consecuencias y límites

- La aceptación reabre pruebas de dominio de E2.2/Gates F–H y requiere
  compatibilidad entre catálogo, solicitudes, ventas a crédito, abonos,
  inventario por ubicación, reportes y ticket antes de Gate I.
- Esta ADR no confirma que el Excel esté importado, no escribe precios ni
  habilita ventas reales. No implica certificación fiscal/DIAN.
- No autoriza crear oferta, registrar venta, transferir inventario ni desplegar
  Functions, Rules o App Hosting.

## Aprobación pendiente

El responsable aprobó funcionalmente precios distintos por canal y confirmó
que las ofertas deben configurarse con precio final por presentación/canal.
La propuesta de autoridad, vigencia, resolución server-side, migración y
compatibilidad permanece `Propuesta`; requiere aprobación explícita antes de
implementar.
