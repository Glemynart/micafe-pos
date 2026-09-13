import { HttpsError } from "firebase-functions/v2/https";

/** Identifica inequívocamente las ventas cuya compensación pertenece a U3-E. */
export const SCHEMA_VERSION_VENTA_BODEGA = "BODEGA_MVP1_V1" as const;

/**
 * El máximo se fija en 50 líneas: U3-B necesitará, por línea, dos lecturas de
 * catálogo y hasta tres documentos de inventario. Con los documentos fijos de
 * autoridad, cliente, cuenta e idempotencia deja un margen amplio bajo los
 * límites de transacción de Firestore; ADR-SAAS-042 conserva el presupuesto.
 */
export const MAX_LINEAS_BODEGA_U3 = 50;

export interface LineaVentaBodegaIntento {
  productoId: string;
  presentacionId: string;
  cantidad: number;
}

export interface ComandoConfirmacionVentaBodega {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  payload: {
    clienteId: string;
    lineas: LineaVentaBodegaIntento[];
    metodoPago: "efectivo" | "transferencia";
  };
}

export interface LineaVentaBodegaPersistida {
  productoId: string;
  productoNombreSnapshot: string;
  unidadBaseSnapshot: string;
  presentacionId: string;
  presentacionNombreSnapshot: string;
  cantidadPresentaciones: number;
  factorUnidadBase: number;
  cantidadUnidadBase: number;
  precioPresentacionCOP: number;
  subtotalCOP: number;
  costoUnidadBaseCOP: number;
  costoPresentacionCOP: number;
  costoTotalLineaCOP: number;
  id: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  costoUnitario: number;
}

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "Comando de venta Bodega inválido.", { code: domain });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const own = (data: Record<string, unknown>, fields: readonly string[]) => Object.keys(data).every(key => fields.includes(key));

function requiredText(value: unknown, domain: string): string {
  if (typeof value !== "string") fail("invalid-argument", domain);
  const normalized = (value as string).trim();
  if (!normalized || normalized.length > 160) fail("invalid-argument", domain);
  return normalized;
}

function normalizarLinea(raw: unknown): LineaVentaBodegaIntento {
  if (!object(raw) || !own(raw, ["productoId", "presentacionId", "cantidad"])) fail("invalid-argument", "LINEA_BODEGA_INVALIDA");
  const data = raw as Record<string, unknown>;
  if (typeof data.cantidad !== "number" || !Number.isSafeInteger(data.cantidad) || data.cantidad <= 0) {
    fail("invalid-argument", "CANTIDAD_PRESENTACIONES_INVALIDA");
  }
  return {
    productoId: requiredText(data.productoId, "PRODUCTO_ID_INVALIDO"),
    presentacionId: requiredText(data.presentacionId, "PRESENTACION_ID_INVALIDO"),
    cantidad: data.cantidad as number,
  };
}

/**
 * Contrato de intención de U3-A. No acepta empresa, precio, costo, stock ni
 * snapshots: U3-B resolverá esos hechos dentro de su transacción.
 */
export function normalizarComandoConfirmacionVentaBodega(raw: unknown): ComandoConfirmacionVentaBodega {
  if (!object(raw) || !own(raw, ["commandId", "idempotencyKey", "correlationId", "causationId", "payload"])) {
    fail("invalid-argument", "COMANDO_BODEGA_INVALIDO");
  }
  const data = raw as Record<string, unknown>;
  if (data.causationId !== null && typeof data.causationId !== "string") fail("invalid-argument", "CAUSATION_ID_INVALIDO");
  const causationId = data.causationId === null ? null : requiredText(data.causationId, "CAUSATION_ID_INVALIDO");
  if (!object(data.payload) || !own(data.payload, ["clienteId", "lineas", "metodoPago"])) fail("invalid-argument", "PAYLOAD_BODEGA_INVALIDO");
  const payload = data.payload as Record<string, unknown>;
  if (!Array.isArray(payload.lineas) || payload.lineas.length === 0 || payload.lineas.length > MAX_LINEAS_BODEGA_U3) {
    fail("invalid-argument", "LINEAS_BODEGA_INVALIDAS");
  }
  if (payload.metodoPago !== "efectivo" && payload.metodoPago !== "transferencia") fail("invalid-argument", "METODO_PAGO_BODEGA_INVALIDO");
  return {
    commandId: requiredText(data.commandId, "COMMAND_ID_INVALIDO"),
    idempotencyKey: requiredText(data.idempotencyKey, "IDEMPOTENCY_KEY_INVALIDA"),
    correlationId: requiredText(data.correlationId, "CORRELATION_ID_INVALIDO"),
    causationId,
    payload: {
      clienteId: requiredText(payload.clienteId, "CLIENTE_ID_INVALIDO"),
      lineas: (payload.lineas as unknown[]).map(normalizarLinea),
      metodoPago: payload.metodoPago as "efectivo" | "transferencia",
    },
  };
}
