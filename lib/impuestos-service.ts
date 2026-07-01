/**
 * impuestos-service.ts
 *
 * Módulo tributario canónico — ADR-TRIB-001 (Modelo Tributario V1).
 * Fuente única de verdad para tarifas, resolución por línea y agregación de
 * totales. Ningún otro módulo debe recalcular o duplicar esta lógica (D3/D4).
 */

// `iva_19` queda reservado para V2 (franquicia, ADR §11) — ningún productor
// de V1 lo emite; se declara aquí solo para no requerir migración de tipos
// cuando se active.
export type ImpuestoTipo = 'excluido' | 'inc_8' | 'iva_19';

// `responsable_iva` queda reservado para V2 (franquicia, ADR §11) — el
// override que anularía el tratamiento de línea no se implementa en V1.
export type RegimenTributario = 'no_responsable' | 'responsable_inc' | 'responsable_iva';

export const REGIMEN_TRIBUTARIO_DEFAULT: RegimenTributario = 'no_responsable';
export const IMPUESTO_TIPO_DEFAULT: ImpuestoTipo = 'inc_8';

/**
 * Catálogo canónico de tasas (D4). Fechado por vigencia: un cambio de tarifa
 * se añade como entrada nueva, sin migrar datos existentes (la Venta ya
 * congeló su propia tarifa en el snapshot).
 */
const CATALOGO_TASAS: ReadonlyArray<{ tipo: ImpuestoTipo; tarifa: number; vigenteDesde: string }> = [
  { tipo: 'excluido', tarifa: 0, vigenteDesde: '2020-01-01' },
  { tipo: 'inc_8', tarifa: 8, vigenteDesde: '2020-01-01' },
  { tipo: 'iva_19', tarifa: 19, vigenteDesde: '2020-01-01' },
];

export function tarifaVigente(tipo: ImpuestoTipo): number {
  const entradas = CATALOGO_TASAS.filter((e) => e.tipo === tipo);
  return entradas[entradas.length - 1]?.tarifa ?? 0;
}

export interface LineaImpuestoResuelta {
  impuestoTipo: ImpuestoTipo;
  impuestoTarifa: number;
  base: number;
  impuestoValor: number;
}

/**
 * Resuelve el impuesto de una línea de venta ya inclusive (precioLinea =
 * precioUnitario × cantidad, entero COP). Descompone hacia atrás: nunca suma
 * impuesto encima del precio (D5).
 *
 * INV-6: régimen `no_responsable` colapsa la tarifa efectiva a 0 para toda
 * línea, sin importar el tipo del producto.
 * INV-1: base + impuestoValor === precioLinea (cierre exacto de línea).
 */
export function resolverLineaImpuesto(
  precioLinea: number,
  impuestoTipo: ImpuestoTipo,
  regimen: RegimenTributario,
): LineaImpuestoResuelta {
  const tarifa = regimen === 'no_responsable' ? 0 : tarifaVigente(impuestoTipo);
  const base = tarifa === 0 ? precioLinea : Math.round(precioLinea / (1 + tarifa / 100));
  const impuestoValor = precioLinea - base;
  return { impuestoTipo, impuestoTarifa: tarifa, base, impuestoValor };
}

export interface TotalesImpuestoVenta {
  subtotalBase: number;
  totalINC: number;
  totalExcluido: number;
  total: number;
}

/**
 * Agrega el desglose de la venta a partir de líneas ya resueltas.
 * INV-2: total === subtotalBase + Σ(impuestoValor). Sin re-redondeo a nivel
 * de total (§7): la suma de líneas ya enteras es exacta.
 */
export function agregarTotalesImpuesto(
  lineas: ReadonlyArray<{ precioLinea: number; impuestoTipo: ImpuestoTipo; base: number; impuestoValor: number }>,
): TotalesImpuestoVenta {
  let subtotalBase = 0;
  let totalINC = 0;
  let totalExcluido = 0;
  let total = 0;

  for (const linea of lineas) {
    subtotalBase += linea.base;
    total += linea.precioLinea;
    if (linea.impuestoTipo === 'inc_8') {
      totalINC += linea.impuestoValor;
    } else if (linea.impuestoTipo === 'excluido') {
      totalExcluido += linea.precioLinea;
    }
  }

  return { subtotalBase, totalINC, totalExcluido, total };
}
