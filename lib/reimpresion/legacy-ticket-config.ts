/**
 * Forma mínima de configuración conservada exclusivamente para adaptar ventas
 * históricas sin `snapshotFiscal`. No carga datos, no conoce Firestore y no
 * representa una autoridad de configuración vigente.
 */
export interface ConfiguracionHistoricaTicket {
  nombre_tienda: string
  razonSocial?: string
  nit_tienda: string
  direccion_tienda: string
  ciudad?: string
  telefono: string
  email: string
  prefijo_factura: string
  resolucion_dian: string
  rangoInicio?: string
  rangoFin?: string
  resolucionVigencia?: string
  mensaje_ticket: string
}
