import { TicketBuilder, type TicketEmpresaConfig, type VentaBuilderInput } from '../ticket-builder'
import type { TicketAssets } from '../ticket-model'

/**
 * Fixtures compartidas por la suite de builder y por la matriz de golden
 * tests del renderer. Fecha y numeración quedan fijas para que la salida sea
 * determinista; el QR se stubbea (ver STUB_ASSETS) porque la generación real
 * de QR es un PR aparte (V3 §7 / decisión #2) — el renderer no debe generar
 * imágenes, así que el asset se inyecta ya resuelto, igual que hará
 * PrintService en producción.
 */

export const EMPRESA_BASE: TicketEmpresaConfig = {
  nombreComercial: 'Empresa Demo',
  razonSocial: 'Empresa Demo S.A.S.',
  nit: '900000000-0',
  direccion: 'Calle Demo #1-2',
  ciudad: 'Ciudad Demo',
  telefono: '+57 300 000 0000',
  regimenTributario: 'no_responsable',
}

export const EMPRESA_RESPONSABLE_INC: TicketEmpresaConfig = {
  ...EMPRESA_BASE,
  regimenTributario: 'responsable_inc',
}

export const STUB_ASSETS_CON_QR: TicketAssets = {
  qrDataUri: 'data:image/png;base64,STUB_QR_FIXED_FOR_GOLDEN_TESTS',
}

export const STUB_ASSETS_SIN_QR: TicketAssets = {}

const FECHA_FIJA = '2026-07-03T15:30:00-05:00'

export const VENTA_SIMPLE_INPUT: VentaBuilderInput = {
  numero: 42,
  fecha: FECHA_FIJA,
  items: [
    { descripcion: 'Producto Demo 01', codigo: 'DEMO-001', cantidad: 2, precioUnitario: 5000, subtotal: 10000 },
    { descripcion: 'Producto Demo 02', codigo: 'DEMO-002', cantidad: 1, precioUnitario: 6000, subtotal: 6000 },
  ],
  totales: { subtotalBase: 16000, totalINC: 0, total: 16000 },
  pago: { metodo: 'efectivo', recibido: 20000, cambio: 4000 },
}

export const VENTA_CON_MODIFICADORES_INPUT: VentaBuilderInput = {
  numero: 43,
  fecha: FECHA_FIJA,
  items: [{
    descripcion: 'Producto Demo 03',
    codigo: 'DEMO-003',
    cantidad: 1,
    precioUnitario: 8000,
    subtotal: 8000,
    modificadores: [
      { nombre: 'Opcion Demo A', precioDelta: 0 },
      { nombre: 'Opcion Demo B', precioDelta: 1500 },
      { nombre: 'Opcion Demo C', precioDelta: 0 },
    ],
  }],
  totales: { subtotalBase: 8000, totalINC: 0, total: 8000 },
  pago: { metodo: 'tarjeta' },
}

export const CONSUMIDOR_FINAL_DIAN_INPUT: VentaBuilderInput = {
  numero: 101,
  fecha: FECHA_FIJA,
  items: [
    {
      descripcion: 'Producto Fiscal Demo 01',
      codigo: 'DEMO-010',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      base: 45000,
      impuestoTipo: 'inc_8',
      impuestoTarifa: 8,
      impuestoValor: 3600,
    },
  ],
  totales: { subtotalBase: 45000, totalINC: 3600, total: 48600 },
  pago: { metodo: 'tarjeta' },
  dian: {
    numero: '101',
    prefijo: 'SETP',
    resolucion: 'RES-DEMO-0001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2026-01-01 a 2026-12-31',
    cufe: 'CUFE-DEMO-CONSUMIDOR-0001',
  },
}

export const CLIENTE_REGISTRADO_DIAN_INPUT: VentaBuilderInput = {
  ...CONSUMIDOR_FINAL_DIAN_INPUT,
  numero: 102,
  cliente: { nombre: 'Cliente Demo 01', documento: 'DOC-DEMO-0001', tipoDoc: 'CC' },
  dian: {
    ...CONSUMIDOR_FINAL_DIAN_INPUT.dian!,
    numero: '102',
    cufe: 'CUFE-DEMO-CLIENTE-0001',
  },
}

export const CON_IVA_DIAN_INPUT: VentaBuilderInput = {
  numero: 103,
  fecha: FECHA_FIJA,
  cliente: { nombre: 'Cliente Demo 02', documento: 'DOC-DEMO-0002' },
  items: [
    {
      descripcion: 'Producto Fiscal Demo 02',
      codigo: 'DEMO-020',
      cantidad: 1,
      precioUnitario: 200000,
      subtotal: 200000,
      base: 200000,
      impuestoTipo: 'iva_19',
      impuestoTarifa: 19,
      impuestoValor: 38000,
    },
  ],
  totales: { subtotalBase: 200000, totalINC: 0, otros: 38000, total: 238000 },
  pago: { metodo: 'transferencia' },
  dian: {
    numero: '103',
    prefijo: 'SETP',
    resolucion: 'RES-DEMO-0001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2026-01-01 a 2026-12-31',
    cufe: 'CUFE-DEMO-IVA-0001',
  },
}

export const CON_INC_DIAN_INPUT: VentaBuilderInput = CONSUMIDOR_FINAL_DIAN_INPUT

export const VENTA_MIXTA_DIAN_INPUT: VentaBuilderInput = {
  numero: 104,
  fecha: FECHA_FIJA,
  cliente: { nombre: 'Cliente Demo 03', documento: 'DOC-DEMO-0003' },
  items: [
    {
      descripcion: 'Producto Fiscal Demo 01',
      codigo: 'DEMO-010',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      base: 45000,
      impuestoTipo: 'inc_8',
      impuestoTarifa: 8,
      impuestoValor: 3600,
    },
    {
      descripcion: 'Producto Fiscal Demo 02',
      codigo: 'DEMO-020',
      cantidad: 1,
      precioUnitario: 200000,
      subtotal: 200000,
      base: 200000,
      impuestoTipo: 'iva_19',
      impuestoTarifa: 19,
      impuestoValor: 38000,
    },
    {
      descripcion: 'Producto Excluido Demo',
      codigo: 'DEMO-030',
      cantidad: 1,
      precioUnitario: 3000,
      subtotal: 3000,
      base: 3000,
      impuestoTipo: 'excluido',
      impuestoTarifa: 0,
      impuestoValor: 0,
    },
  ],
  totales: { subtotalBase: 248000, totalINC: 3600, otros: 38000, total: 289600 },
  pago: { metodo: 'efectivo', recibido: 300000, cambio: 10400 },
  dian: {
    numero: '104',
    prefijo: 'SETP',
    resolucion: 'RES-DEMO-0001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2026-01-01 a 2026-12-31',
    cufe: 'CUFE-DEMO-MIXTA-0001',
  },
}

export const GOLDEN_CASES = [
  { nombre: 'venta-simple', input: VENTA_SIMPLE_INPUT, empresa: EMPRESA_BASE, assets: STUB_ASSETS_SIN_QR },
  { nombre: 'venta-con-modificadores', input: VENTA_CON_MODIFICADORES_INPUT, empresa: EMPRESA_BASE, assets: STUB_ASSETS_SIN_QR },
  {
    nombre: 'consumidor-final-dian',
    input: CONSUMIDOR_FINAL_DIAN_INPUT,
    empresa: EMPRESA_RESPONSABLE_INC,
    assets: STUB_ASSETS_CON_QR,
  },
  {
    nombre: 'cliente-registrado-dian',
    input: CLIENTE_REGISTRADO_DIAN_INPUT,
    empresa: EMPRESA_RESPONSABLE_INC,
    assets: STUB_ASSETS_CON_QR,
  },
  {
    nombre: 'con-iva-dian',
    input: CON_IVA_DIAN_INPUT,
    empresa: { ...EMPRESA_BASE, regimenTributario: 'responsable_iva' as const },
    assets: STUB_ASSETS_CON_QR,
  },
  {
    nombre: 'con-inc-dian',
    input: CON_INC_DIAN_INPUT,
    empresa: EMPRESA_RESPONSABLE_INC,
    assets: STUB_ASSETS_CON_QR,
  },
  {
    nombre: 'venta-mixta-dian',
    input: VENTA_MIXTA_DIAN_INPUT,
    empresa: EMPRESA_RESPONSABLE_INC,
    assets: STUB_ASSETS_CON_QR,
  },
] as const

export function construirModelo(caso: (typeof GOLDEN_CASES)[number]) {
  return TicketBuilder.fromVenta(caso.input, caso.empresa)
}
