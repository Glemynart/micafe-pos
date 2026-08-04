import type { FormatoPapel } from '../configuracion/contrato'
import {
  DEFAULT_RENDER_OPTIONS,
  RENDER_OPTIONS_58MM,
  RENDER_OPTIONS_80MM,
  type RenderOptions,
} from './render-options'

export type TicketPrintChannel = 'electron-printer' | 'electron-pdf' | 'browser-dialog' | 'unavailable'

export interface TicketPrintResult {
  success: boolean
  channel: TicketPrintChannel
  reason?: string
}

/**
 * Selecciona el layout físico a partir de la configuración canónica del tenant.
 * CARTA conserva el layout histórico de 80 mm hasta que exista un renderer de
 * documentos carta; no se inventa una plantilla nueva dentro de P0-07.
 */
export function resolverOpcionesImpresion(formatoPapel?: FormatoPapel): RenderOptions {
  if (formatoPapel === 'MM_58') return RENDER_OPTIONS_58MM
  if (formatoPapel === 'MM_80') return RENDER_OPTIONS_80MM
  return DEFAULT_RENDER_OPTIONS
}

function resultadoElectron(resultado: unknown, channel: TicketPrintChannel): TicketPrintResult {
  if (resultado && typeof resultado === 'object' && 'success' in resultado) {
    const success = (resultado as { success?: unknown }).success === true
    const reason = (resultado as { reason?: unknown }).reason
    return {
      success,
      channel,
      ...(typeof reason === 'string' ? { reason } : {}),
    }
  }
  return { success: true, channel }
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
 * Abre un documento aislado para que el navegador use su diálogo de impresión.
 * Esto mantiene la PWA funcional sin asumir que `window.api` existe.
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
 * Usa el puente Electron existente cuando está disponible y cae al diálogo
 * estándar del navegador en la PWA. No escribe datos de negocio ni crea una
 * autoridad adicional: solo transporta HTML ya generado por el renderer.
 */
export async function imprimirTicketHtml(html: string): Promise<TicketPrintResult> {
  if (typeof window !== 'undefined') {
    const api = (window as Window & {
      api?: { print?: { toPrinter?: (value: string) => Promise<unknown>; ticket?: (value: string) => Promise<unknown> } }
    }).api

    if (typeof api?.print?.toPrinter === 'function') {
      return resultadoElectron(await api.print.toPrinter(html), 'electron-printer')
    }
    if (typeof api?.print?.ticket === 'function') {
      return resultadoElectron(await api.print.ticket(html), 'electron-pdf')
    }
  }

  return imprimirEnDialogoNavegador(html)
}
