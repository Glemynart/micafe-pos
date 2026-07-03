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
  nombreComercial: 'Mi Cafe Especial',
  razonSocial: 'Mi Cafe Especial S.A.S.',
  nit: '900.123.456-7',
  direccion: 'Calle 123 #45-67',
  ciudad: 'Bogota',
  telefono: '+57 300 123 4567',
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
    { descripcion: 'Cafe Americano', codigo: 'CAF-001', cantidad: 2, precioUnitario: 5000, subtotal: 10000 },
    { descripcion: 'Croissant', codigo: 'PAN-010', cantidad: 1, precioUnitario: 6000, subtotal: 6000 },
  ],
  totales: { subtotalBase: 16000, totalINC: 0, total: 16000 },
  pago: { metodo: 'efectivo', recibido: 20000, cambio: 4000 },
}

export const CONSUMIDOR_FINAL_DIAN_INPUT: VentaBuilderInput = {
  numero: 101,
  fecha: FECHA_FIJA,
  items: [
    {
      descripcion: 'Cafe Especial 500g',
      codigo: 'CAF-500',
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
    resolucion: '187640000001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2024-01-01 a 2025-12-31',
    cufe: 'cufe-consumidor-final-0000000000000000000000000000000000',
  },
}

export const CLIENTE_REGISTRADO_DIAN_INPUT: VentaBuilderInput = {
  ...CONSUMIDOR_FINAL_DIAN_INPUT,
  numero: 102,
  cliente: { nombre: 'Juan Perez', documento: '1020304050', tipoDoc: 'CC' },
  dian: {
    ...CONSUMIDOR_FINAL_DIAN_INPUT.dian!,
    numero: '102',
    cufe: 'cufe-cliente-registrado-000000000000000000000000000000000',
  },
}

export const CON_IVA_DIAN_INPUT: VentaBuilderInput = {
  numero: 103,
  fecha: FECHA_FIJA,
  cliente: { nombre: 'Maria Gomez', documento: '900999888' },
  items: [
    {
      descripcion: 'Equipo Cafetero',
      codigo: 'EQ-100',
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
    resolucion: '187640000001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2024-01-01 a 2025-12-31',
    cufe: 'cufe-con-iva-00000000000000000000000000000000000000000',
  },
}

export const CON_INC_DIAN_INPUT: VentaBuilderInput = CONSUMIDOR_FINAL_DIAN_INPUT

export const VENTA_MIXTA_DIAN_INPUT: VentaBuilderInput = {
  numero: 104,
  fecha: FECHA_FIJA,
  cliente: { nombre: 'Carlos Ruiz', documento: '800111222' },
  items: [
    {
      descripcion: 'Cafe Especial 500g',
      codigo: 'CAF-500',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      base: 45000,
      impuestoTipo: 'inc_8',
      impuestoTarifa: 8,
      impuestoValor: 3600,
    },
    {
      descripcion: 'Equipo Cafetero',
      codigo: 'EQ-100',
      cantidad: 1,
      precioUnitario: 200000,
      subtotal: 200000,
      base: 200000,
      impuestoTipo: 'iva_19',
      impuestoTarifa: 19,
      impuestoValor: 38000,
    },
    {
      descripcion: 'Bolsa de Tela (excluido)',
      codigo: 'BOL-001',
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
    resolucion: '187640000001',
    rangoInicio: '1',
    rangoFin: '10000',
    vigencia: '2024-01-01 a 2025-12-31',
    cufe: 'cufe-venta-mixta-0000000000000000000000000000000000000000',
  },
}

export const GOLDEN_CASES = [
  { nombre: 'venta-simple', input: VENTA_SIMPLE_INPUT, empresa: EMPRESA_BASE, assets: STUB_ASSETS_SIN_QR },
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
