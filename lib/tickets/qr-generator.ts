import QRCode from 'qrcode'

/**
 * Generador de QR local (diseño H2 V3, PR2).
 *
 * Reemplaza la dependencia de `api.qrserver.com` por generación de imagen
 * 100% local. Es una pieza HOJA, deliberadamente agnóstica:
 *
 *  - Recibe únicamente un `string` (el texto a codificar) y opciones de
 *    presentación de imagen. Devuelve únicamente un Data URI PNG.
 *  - NO conoce ni importa nada del motor de tickets ni del dominio:
 *    TicketModel, TicketBuilder, TicketRenderer, TicketAssets, RenderOptions,
 *    Factus, Firestore, Electron, la DIAN, el CUFE ni `bill.links.qr`.
 *  - NO interpreta el contenido: no valida que el payload provenga de Factus,
 *    no construye URLs, no deriva el fallback DIAN (eso vive en el builder).
 *    Funciona idéntico si mañana se reemplaza Factus por otro proveedor.
 *  - NO conoce el tamaño físico del papel: nunca recibe `paperWidth`,
 *    `ticketWidth`, "58mm" ni "80mm". Produce un PNG de alta resolución; el
 *    tamaño físico impreso lo resuelve el renderer mediante CSS. Por eso
 *    `width` aquí es solo la resolución del PNG, no el ancho del ticket.
 *
 * El cableado `qrPayload -> generateQrDataUri -> TicketAssets.qrDataUri ->
 * renderTicket` lo hace el consumidor (Historial) en un PR posterior; este
 * módulo nace sin llamadores.
 */

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/**
 * Opciones de presentación de la imagen del QR. Todas opcionales: la API
 * crece añadiendo campos opcionales sin romper compatibilidad. Los nombres
 * son de dominio propio pero mapean 1:1 con `qrcode` para una implementación
 * mecánica.
 */
export interface QrOptions {
  /**
   * Lado de la imagen PNG en píxeles (el QR es cuadrado, así que ancho = alto).
   * Es la resolución del PNG, NO el tamaño físico impreso. Default: 300.
   */
  width?: number
  /** Ancho de la zona de silencio (quiet zone) en módulos. Default: 4. */
  margin?: number
  /** Nivel de corrección de errores. Default: 'M' (15%). */
  errorCorrectionLevel?: QrErrorCorrectionLevel
}

export const DEFAULT_QR_OPTIONS: Required<QrOptions> = {
  width: 300,
  margin: 4,
  errorCorrectionLevel: 'M',
}

/**
 * Genera la imagen del QR como Data URI PNG a partir del texto `payload`.
 *
 * El contenido no vacío se codifica tal cual (no se recorta ni transforma).
 * Un `payload` vacío o compuesto solo por espacios rechaza la Promise con un
 * error explícito: el generador no tiene un QR con sentido que producir.
 *
 * @returns Promise que resuelve a `"data:image/png;base64,..."`.
 * @throws Rechaza la Promise si `payload` es vacío o solo espacios, o si la
 *         codificación falla.
 */
export function generateQrDataUri(payload: string, options?: QrOptions): Promise<string> {
  if (!payload || payload.trim() === '') {
    return Promise.reject(new Error('generateQrDataUri: el payload no puede estar vacío.'))
  }

  const opts = { ...DEFAULT_QR_OPTIONS, ...options }

  return QRCode.toDataURL(payload, {
    type: 'image/png',
    width: opts.width,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
  })
}

/** Namespace del generador (espejo de `TicketBuilder`), punto de crecimiento. */
export const QrGenerator = {
  toDataUri: generateQrDataUri,
}
