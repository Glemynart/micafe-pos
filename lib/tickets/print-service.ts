import type { FormatoPapel } from '../configuracion/contrato'
import {
  DEFAULT_RENDER_OPTIONS,
  RENDER_OPTIONS_58MM,
  RENDER_OPTIONS_80MM,
  type RenderOptions,
} from './render-options'

export type TicketPrintChannel = 'browser-dialog' | 'unavailable'

export interface TicketPrintResult {
  success: boolean
  channel: TicketPrintChannel
  reason?: string
}

/**
 * Selecciona el layout fisico a partir de la configuracion canonica del tenant.
 * CARTA conserva el layout historico de 80 mm hasta que exista un renderer de
 * documentos carta; no se inventa una plantilla nueva dentro de P0-07.
 */
export function resolverOpcionesImpresion(formatoPapel?: FormatoPapel): RenderOptions {
  if (formatoPapel === 'MM_58') return RENDER_OPTIONS_58MM
  if (formatoPapel === 'MM_80') return RENDER_OPTIONS_80MM
  return DEFAULT_RENDER_OPTIONS
}

function htmlParaDialogoImpresion(html: string): string {
  const estilos = `
    <style>
      @page { margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; }
      }
    </style>
  `
  return html.includes('</head>') ? html.replace('</head>', `${estilos}</head>`) : `${estilos}${html}`
}

/**
 * Abre un documento aislado para que el navegador use su dialogo de impresion.
 * La PWA no depende de un puente de escritorio.
 */
export function imprimirEnDialogoNavegador(html: string): Promise<TicketPrintResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ success: false, channel: 'unavailable', reason: 'NO_CLIENTE' })
  }

  const ventana = window.open('', '_blank', 'noopener,noreferrer,width=420,height=750')
  if (!ventana) {
    return Promise.resolve({ success: false, channel: 'browser-dialog', reason: 'POPUP_BLOQUEADO' })
  }

  return new Promise((resolve) => {
    let impreso = false
    let finalizado = false
    const cerrar = () => {
      if (!ventana.closed) ventana.close()
    }
    const finalizar = (resultado: TicketPrintResult) => {
      if (finalizado) return
      finalizado = true
      resolve(resultado)
    }
    const imprimir = () => {
      if (impreso || finalizado) return
      impreso = true
      try {
        ventana.focus()
        ventana.print()
        ventana.addEventListener('afterprint', cerrar, { once: true })
        // Algunos navegadores no emiten afterprint cuando el usuario cancela.
        window.setTimeout(cerrar, 2000)
        finalizar({ success: true, channel: 'browser-dialog' })
      } catch (error) {
        cerrar()
        finalizar({
          success: false,
          channel: 'browser-dialog',
          reason: error instanceof Error ? error.message : 'ERROR_DIALOGO_IMPRESION',
        })
      }
    }

    try {
      ventana.document.open()
      ventana.document.write(htmlParaDialogoImpresion(html))
      ventana.document.close()
      if (ventana.document.readyState === 'complete') {
        window.setTimeout(imprimir, 0)
      } else {
        ventana.addEventListener('load', imprimir, { once: true })
      }
      window.setTimeout(() => {
        if (!impreso) {
          cerrar()
          finalizar({ success: false, channel: 'browser-dialog', reason: 'TIMEOUT_CARGA_IMPRESION' })
        }
      }, 10000)
    } catch (error) {
      cerrar()
      finalizar({
        success: false,
        channel: 'browser-dialog',
        reason: error instanceof Error ? error.message : 'ERROR_DIALOGO_IMPRESION',
      })
    }
  })
}

/**
 * Imprime la representacion HTML usando el dialogo estandar del navegador.
 * No escribe datos de negocio ni crea una autoridad adicional.
 */
export function imprimirTicketHtml(html: string): Promise<TicketPrintResult> {
  return imprimirEnDialogoNavegador(html)
}
