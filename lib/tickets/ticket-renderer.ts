import type { RenderOptions } from './render-options'
import type { TicketAssets, TicketModel, VentaTicketModel } from './ticket-model'
import { formatFecha, formatMoney } from './format'

/**
 * Renderer puro del motor de tickets (diseño H1 V3).
 *
 * No debe importar nada de Electron, Firestore, Factus, React, window.api ni
 * configuración global — solo recibe `TicketModel` (negocio), `RenderOptions`
 * (presentación) y `TicketAssets` (imágenes ya resueltas, ej. el QR). No
 * genera el QR ni ninguna otra imagen: si `assets.qrDataUri` no viene, el
 * bloque de QR simplemente no se imprime.
 *
 * Un solo árbol de HTML/CSS para 58mm y 80mm: solo cambian las constantes de
 * `RenderOptions` (ancho, tamaño de fuente, tamaño de QR, columnas).
 */
export function renderTicket(model: TicketModel, options: RenderOptions, assets: TicketAssets): string {
  switch (model.tipoDocumento) {
    case 'venta':
      return renderVenta(model, options, assets)
    default: {
      const _exhaustive: never = model.tipoDocumento
      throw new Error(`Tipo de documento de ticket no implementado: ${_exhaustive}`)
    }
  }
}

function renderVenta(model: VentaTicketModel, options: RenderOptions, assets: TicketAssets): string {
  const { empresa, meta, pie, cliente, items, impuestos, totales, pago, dian } = model
  const isDian = !!dian

  const { fecha, hora } = formatFecha(meta.fecha, options)
  const money = (value: number) => formatMoney(value, options)

  const itemsHtml = items
    .map((item) => {
      const codigoLinea = item.codigo ? ` | COD: ${item.codigo}` : ''
      const modificadoresHtml = item.modificadores
        ?.map((modificador) => {
          const adicional = modificador.precioDelta === 0
            ? ''
            : ` (${modificador.precioDelta > 0 ? '+' : '-'}${money(Math.abs(modificador.precioDelta))})`
          return `\n            <span class="modifier-line">&bull; ${modificador.nombre}${adicional}</span>`
        })
        .join('') ?? ''
      return `
        <div class="row3">
          <span class="desc">${item.descripcion}<br>
            <span class="line-meta">CANT: ${item.cantidad}${codigoLinea}</span>${modificadoresHtml}
          </span>
          <span class="unit">${money(item.precioUnitario)}</span>
          <span class="sub">${money(item.subtotal)}</span>
        </div>
      `
    })
    .join('')

  const taxesHtml = isDian
    ? impuestos
        .map(
          (linea) =>
            `<tr><td>${linea.tipo}</td><td>${linea.tasa}%</td><td>${money(linea.base)}</td><td>${money(
              linea.valor
            )}</td></tr>`
        )
        .join('')
    : ''

  const encabezadoNumero = `${isDian ? 'N° FACTURA' : meta.modoOperacion === 'DEMO' ? 'N° OPERACIÓN' : 'N° TICKET'}:`
  const numeroCompleto = `${isDian && meta.prefijo ? `${meta.prefijo} ` : ''}${meta.numero}`

  const qrHtml =
    isDian && assets.qrDataUri
      ? `<div class="qr-container"><img class="qr-image" src="${assets.qrDataUri}" /></div>`
      : ''

  const resolucionHtml = isDian
    ? `
      <div class="res">
        <div>Resolución DIAN N° ${dian!.resolucion || ''} Prefijo: ${dian!.prefijo} Habilitada del ${
        dian!.rangoInicio || ''
      } al ${dian!.rangoFin || ''}</div>
        ${dian!.vigencia ? `<div>Vigencia: ${dian!.vigencia}</div>` : ''}
        ${pie.proveedorTecnologico ? `<div class="bold" style="margin-top:4px">Proveedor Tecnológico: ${pie.proveedorTecnologico}</div>` : ''}
      </div>
    `
    : ''

  return `<html><head>
    <meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: ${options.fuenteBasePx}px;
        line-height: 1.35;
        width: ${options.anchoCuerpoPx}px;
        margin: 0;
        padding: 0 4px;
        color: #000;
      }
      .center  { text-align: center; }
      .bold    { font-weight: bold; }
      .uppercase { text-transform: uppercase; }
      .titulo  {
        text-align: center;
        font-size: ${options.fuenteBasePx}px;
        font-weight: bold;
        margin: 8px 0;
        border-top: 1.5px dashed #000;
        border-bottom: 1.5px dashed #000;
        padding: 6px 0;
      }
      .store   { text-align: center; font-size: ${options.fuenteBasePx + 2}px; font-weight: bold; margin: 6px 0 2px 0; }
      .sub     { text-align: center; font-size: ${options.fuenteBasePx - 2}px; margin: 2px 0; line-height: 1.25; }
      .sep     { text-align: center; margin: 8px 0; border-top: 1.5px dashed #000; }
      .row2    { display: flex; justify-content: space-between; margin: 3px 0; }
      .row3    { display: flex; margin: 6px 0; border-bottom: 0.5px solid #ddd; padding-bottom: 4px; }
      .row3 .desc { flex: 1; padding-right: 4px; }
      .row3 .unit { width: ${options.columnas.unitPx}px; text-align: right; font-size: ${options.fuenteBasePx - 1}px; }
      .row3 .sub  { width: ${options.columnas.totalPx}px; text-align: right; font-size: ${options.fuenteBasePx - 1}px; font-weight: bold; }
      .line-meta { font-size: ${options.fuenteBasePx - 1.5}px; font-weight: bold; color: #000; }
      .modifier-line { display: block; font-size: ${options.fuenteBasePx - 1.5}px; font-weight: normal; line-height: 1.3; margin-top: 2px; padding-left: 8px; }
      .hdr3    { display: flex; font-weight: bold; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; font-size: ${options.fuenteBasePx - 1}px; }
      .hdr3 .desc { flex: 1; }
      .hdr3 .unit { width: ${options.columnas.unitPx}px; text-align: right; }
      .hdr3 .sub  { width: ${options.columnas.totalPx}px; text-align: right; }
      .total-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: ${options.fuenteBasePx}px; }
      .total-main{ font-weight: bold; font-size: ${options.fuenteBasePx + 2}px; border-top: 1.5px dashed #000; padding-top: 6px; margin-top: 6px; }
      .tax-table { width: 100%; font-size: ${options.fuenteBasePx - 2}px; margin-top: 8px; border-collapse: collapse; }
      .tax-table th { border-bottom: 1.5px dashed #000; text-align: left; font-weight: bold; padding-bottom: 4px; }
      .tax-table td { padding: 4px 0; }
      .cufe    { font-size: ${options.fuenteBasePx - 3}px; word-break: break-all; text-align: justify; margin: 6px 0; line-height: 1.2; font-family: monospace; }
      .qr-container { text-align: center; margin: 12px 0; }
      .qr-image { display: inline-block; width: ${options.qrPx}px; height: ${options.qrPx}px; }
      .res     { font-size: ${options.fuenteBasePx - 3}px; line-height: 1.4; margin-top: 8px; border-top: 1.5px dashed #000; padding-top: 6px; }
      .footer  { text-align: center; margin-top: 15px; font-size: ${options.fuenteBasePx - 2}px; line-height: 1.4; }
    </style></head><body>

    <div class="store uppercase">${empresa.nombreComercial}</div>
    ${empresa.razonSocial ? `<div class="sub uppercase">${empresa.razonSocial}</div>` : ''}
    <div class="sub">NIT: ${empresa.nit}</div>
    ${empresa.direccion ? `<div class="sub uppercase">${empresa.direccion}</div>` : ''}
    ${empresa.ciudad ? `<div class="sub uppercase">${empresa.ciudad} - COLOMBIA</div>` : ''}
    ${empresa.telefono ? `<div class="sub">TEL: ${empresa.telefono}</div>` : ''}
    <div class="sub">${empresa.rotuloFiscal}</div>

    <div class="titulo">${meta.titulo}</div>

    <div class="row2"><span class="bold">${encabezadoNumero}</span><span class="bold">${numeroCompleto}</span></div>
    <div class="row2"><span>FECHA:</span><span>${fecha}</span></div>
    <div class="row2"><span>HORA:</span><span>${hora}</span></div>

    ${
      isDian
        ? `
      <div class="sep"></div>
      <div class="sub" style="text-align:left"><span class="bold">ADQUIRIENTE:</span> ${cliente.nombre.toUpperCase()}</div>
      <div class="sub" style="text-align:left"><span class="bold">NIT/CC:</span> ${cliente.documento}</div>
    `
        : ''
    }

    <div class="sep"></div>
    <div class="hdr3">
      <span class="desc">DESCRIPCIÓN</span>
      <span class="unit">UNIT.</span>
      <span class="sub">TOTAL</span>
    </div>

    ${itemsHtml}

    <div class="sep"></div>
    <div class="total-row"><span>SUBTOTAL:</span><span>${money(totales.subtotalBase)}</span></div>
    ${totales.totalINC > 0 ? `<div class="total-row"><span>INC:</span><span>${money(totales.totalINC)}</span></div>` : ''}
    ${totales.otros ? `<div class="total-row"><span>OTROS IMPUESTOS:</span><span>${money(totales.otros)}</span></div>` : ''}
    <div class="total-row total-main"><span>TOTAL A PAGAR:</span><span>${money(totales.total)}</span></div>

    <div class="row2" style="margin-top: 6px;"><span class="bold">FORMA PAGO:</span><span class="bold uppercase">${pago.metodo}</span></div>
    ${
      pago.recibido !== undefined && pago.cambio !== undefined
        ? `
      <div class="row2"><span>RECIBIDO:</span><span>${money(pago.recibido)}</span></div>
      <div class="row2"><span class="bold">CAMBIO:</span><span class="bold">${money(pago.cambio)}</span></div>
    `
        : ''
    }

    ${
      isDian
        ? `
      <div class="sep"></div>
      <div class="bold center" style="font-size:${options.fuenteBasePx - 2}px;">DETALLE DE IMPUESTOS</div>
      <table class="tax-table">
        <thead><tr><th>TIPO</th><th>TASA</th><th>BASE</th><th>VALOR</th></tr></thead>
        <tbody>${taxesHtml}</tbody>
      </table>

      <div class="sep"></div>
      <div class="bold">CUFE:</div>
      <div class="cufe">${dian!.cufe}</div>

      ${qrHtml}
      ${resolucionHtml}
    `
        : ''
    }

    <div class="footer">
      <p class="bold">${empresa.nombreComercial}</p>
      <p>${pie.fabricanteSoftware}</p>
      <p style="margin-top:6px; font-weight: bold;">${pie.mensajeTicket || '¡GRACIAS POR SU COMPRA!'}</p>
    </div>
    <div style="height:35px"></div>
  </body></html>`
}
