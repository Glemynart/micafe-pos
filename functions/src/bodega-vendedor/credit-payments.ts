import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  resolverCuentaOperativa,
  resolverTurnoRecaudoPropioOpcionalEnTransaccion,
  writeMovement,
  type ContextoFinancieroOperativo,
} from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { SCHEMA_VERSION_VENTA_BODEGA_CREDITO } from "./ventas-contract";

const REGION = "us-central1";
const MAX_FACTURAS_CARTERA = 500;
const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible registrar el abono Bodega.", { code: domain });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const MAX_ID = 512;

function requiredText(value: unknown, code: string, max = MAX_ID) {
  if (!text(value) || value.trim().length > max) fail("invalid-argument", code);
  return (value as string).trim();
}

function fechaLocalValida(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function normalizarComandoAbonoVentaBodega(raw: unknown) {
  if (!object(raw) || !object(raw.payload)
    || Object.keys(raw).some(key => !["commandId", "idempotencyKey", "correlationId", "causationId", "payload"].includes(key))) {
    fail("invalid-argument", "COMANDO_BODEGA_INVALIDO");
  }
  const command = raw as Record<string, unknown>;
  const payload = command.payload as Record<string, unknown>;
  if (Object.keys(payload).some(key => !["ventaId", "montoCOP", "metodoPago", "fechaCompromisoPagoLocal"].includes(key))) {
    fail("invalid-argument", "PAYLOAD_BODEGA_INVALIDO");
  }
  if (!Number.isSafeInteger(payload.montoCOP) || (payload.montoCOP as number) <= 0) fail("invalid-argument", "ABONO_INVALIDO");
  if (payload.metodoPago !== "efectivo" && payload.metodoPago !== "transferencia") fail("invalid-argument", "METODO_PAGO_BODEGA_INVALIDO");
  if (payload.fechaCompromisoPagoLocal !== undefined && !fechaLocalValida(payload.fechaCompromisoPagoLocal)) {
    fail("invalid-argument", "FECHA_COMPROMISO_INVALIDA");
  }
  const causationId = command.causationId;
  if (causationId !== null && typeof causationId !== "string") fail("invalid-argument", "CAUSATION_ID_INVALIDO");
  return {
    commandId: requiredText(command.commandId, "COMMAND_ID_INVALIDO", 160),
    idempotencyKey: requiredText(command.idempotencyKey, "IDEMPOTENCY_KEY_INVALIDA", 160),
    correlationId: requiredText(command.correlationId, "CORRELATION_ID_INVALIDO", 160),
    causationId: causationId === null ? null : requiredText(causationId, "CAUSATION_ID_INVALIDO", 160),
    payload: {
      ventaId: requiredText(payload.ventaId, "VENTA_ID_INVALIDO"),
      montoCOP: payload.montoCOP as number,
      metodoPago: payload.metodoPago as "efectivo" | "transferencia",
      ...(payload.fechaCompromisoPagoLocal === undefined ? {} : { fechaCompromisoPagoLocal: payload.fechaCompromisoPagoLocal as string }),
    },
  };
}

async function efectoRegistrarAbono(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: ReturnType<typeof normalizarComandoAbonoVentaBodega>) {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "sell");
  if (rol !== "vendedor") fail("permission-denied", "ROL_VENDEDOR_REQUERIDO");
  const configSnap = await tx.get(db.collection("configuraciones").doc(empresaId));
  const config = configSnap.data() as Record<string, any> | undefined;
  if (!configSnap.exists || config?.empresaId !== empresaId || config.vertical !== "BODEGA_MVP1"
    || !Array.isArray(config.modulos?.habilitados) || !config.modulos.habilitados.includes("sell")) {
    fail("permission-denied", "VENTA_BODEGA_NO_AUTORIZADA");
  }

  const ventaRef = db.collection("ventas").doc(input.payload.ventaId);
  const ventaSnap = await tx.get(ventaRef);
  if (!ventaSnap.exists || ventaSnap.data()?.empresaId !== empresaId) fail("not-found", "VENTA_NO_ENCONTRADA");
  const venta = ventaSnap.data() as Record<string, any>;
  if (venta.schemaVersion !== SCHEMA_VERSION_VENTA_BODEGA_CREDITO || venta.metodoPago !== "cuenta_cobro"
    || venta.estado !== "pendiente" || venta.estadoOperativo !== "COMPLETO") fail("failed-precondition", "VENTA_NO_PENDIENTE");
  const total = venta.totales?.total;
  const totalAbonado = venta.totalAbonadoCOP;
  const saldoActual = venta.saldoPendienteCOP;
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(totalAbonado) || totalAbonado < 0
    || !Number.isSafeInteger(saldoActual) || saldoActual <= 0 || totalAbonado + saldoActual !== total) {
    fail("failed-precondition", "SALDO_VENTA_INCONSISTENTE");
  }
  const monto = input.payload.montoCOP;
  if (monto > saldoActual) fail("failed-precondition", "ABONO_SUPERA_SALDO");
  if (!text(venta.clienteId)) fail("failed-precondition", "CLIENTE_CUENTA_COBRO_REQUERIDO");
  const clienteRef = db.collection("clientes").doc(venta.clienteId);
  const clienteSnap = await tx.get(clienteRef);
  if (!clienteSnap.exists || clienteSnap.data()?.empresaId !== empresaId || clienteSnap.data()?.activo !== true) {
    fail("failed-precondition", "CLIENTE_CUENTA_INCONSISTENTE");
  }
  const saldoCliente = clienteSnap.data()?.saldoPendienteBodegaCOP ?? 0;
  if (!Number.isSafeInteger(saldoCliente) || saldoCliente < monto) fail("failed-precondition", "SALDO_CLIENTE_INCONSISTENTE");

  const esEfectivo = input.payload.metodoPago === "efectivo";
  const cuenta = await resolverCuentaOperativa(tx, db, empresaId, esEfectivo ? "caja-principal" : "bancolombia");
  const turnoId = esEfectivo ? await resolverTurnoRecaudoPropioOpcionalEnTransaccion(tx, db, empresaId, actorUid) : null;
  const abonoId = crearIdentificadorInterno(empresaId, `abono-venta-bodega:${input.commandId}`);
  const abonoRef = ventaRef.collection("abonos_bodega").doc(abonoId);
  const compromisoId = crearIdentificadorInterno(empresaId, `compromiso-venta-bodega:${input.commandId}`);
  const compromisoRef = ventaRef.collection("compromisos_pago_bodega").doc(compromisoId);
  const saldoNuevo = saldoActual - monto;
  const abonadoNuevo = totalAbonado + monto;
  const movimiento = writeMovement(tx, db, {
    empresaId, command: input, key: `abono-venta-bodega:${input.payload.ventaId}:${input.commandId}`,
    account: cuenta, tipo: "ingreso", monto, categoria: "cuentas_cobro", actorUid, rol, turnoId,
    ventaId: input.payload.ventaId,
  });
  tx.create(abonoRef, {
    id: abonoId, empresaId, ventaId: input.payload.ventaId, clienteId: venta.clienteId,
    montoCOP: monto, metodoPago: input.payload.metodoPago, actorUid, rol,
    commandId: input.commandId, idempotencyKey: input.idempotencyKey,
    movimientoFinancieroId: movimiento.id, turnoId, fecha: FieldValue.serverTimestamp(),
    ...(input.payload.fechaCompromisoPagoLocal ? { fechaCompromisoPagoLocal: input.payload.fechaCompromisoPagoLocal } : {}),
  });
  if (input.payload.fechaCompromisoPagoLocal && input.payload.fechaCompromisoPagoLocal !== venta.fechaCompromisoPagoLocal) {
    tx.create(compromisoRef, {
      id: compromisoId, empresaId, ventaId: input.payload.ventaId, clienteId: venta.clienteId,
      fechaCompromisoPagoLocal: input.payload.fechaCompromisoPagoLocal,
      actorUid, commandId: input.commandId, creadoEn: FieldValue.serverTimestamp(),
    });
  }
  tx.update(ventaRef, {
    totalAbonadoCOP: abonadoNuevo,
    saldoPendienteCOP: saldoNuevo,
    estado: saldoNuevo === 0 ? "pagada" : "pendiente",
    actualizadoEn: FieldValue.serverTimestamp(),
    ...(saldoNuevo === 0 ? { fechaPago: FieldValue.serverTimestamp() } : {}),
    ...(input.payload.fechaCompromisoPagoLocal ? { fechaCompromisoPagoLocal: input.payload.fechaCompromisoPagoLocal } : {}),
  });
  tx.update(clienteRef, { saldoPendienteBodegaCOP: saldoCliente - monto });
  return {
    commandId: input.commandId, ventaId: input.payload.ventaId, abonoId,
    movimientoFinancieroId: movimiento.id, totalAbonadoCOP: abonadoNuevo,
    saldoPendienteCOP: saldoNuevo, estado: saldoNuevo === 0 ? "pagada" : "pendiente", turnoId,
    ...(input.payload.fechaCompromisoPagoLocal ? { fechaCompromisoPagoLocal: input.payload.fechaCompromisoPagoLocal } : {}),
  };
}

export async function ejecutarRegistrarAbonoVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown) {
  const input = normalizarComandoAbonoVentaBodega(raw);
  return executeConContexto(db, contexto, input, "registrarAbonoVentaBodegaV1", (tx, firestore, empresaId, actorUid, rol) =>
    efectoRegistrarAbono(tx, firestore, empresaId, actorUid, rol, input));
}

export async function ejecutarConsultarCarteraClienteBodegaV1(db: any, contexto: { empresaId: string; rol: string; permisos: readonly string[]; ventasHabilitadas: boolean; clientesHabilitados: boolean }, raw: unknown) {
  if (contexto.rol !== "vendedor" || !contexto.permisos.includes("sell") || !contexto.ventasHabilitadas || !contexto.clientesHabilitados) {
    fail("permission-denied", "ROL_VENDEDOR_REQUERIDO");
  }
  if (!object(raw) || Object.keys(raw).some(key => key !== "clienteId")) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const clienteId = requiredText((raw as Record<string, unknown>).clienteId, "CLIENTE_ID_INVALIDO");
  const cliente = await db.collection("clientes").doc(clienteId).get();
  if (!cliente.exists || cliente.data()?.empresaId !== contexto.empresaId || cliente.data()?.activo !== true) fail("not-found", "CLIENTE_NO_ENCONTRADO");
  const saldoCliente = cliente.data()?.saldoPendienteBodegaCOP ?? 0;
  if (!Number.isSafeInteger(saldoCliente) || saldoCliente < 0) fail("failed-precondition", "SALDO_CLIENTE_INCONSISTENTE");
  const snapshot = await db.collection("ventas")
    .where("empresaId", "==", contexto.empresaId)
    .where("clienteId", "==", clienteId)
    .where("schemaVersion", "==", SCHEMA_VERSION_VENTA_BODEGA_CREDITO)
    .where("estado", "==", "pendiente")
    .limit(MAX_FACTURAS_CARTERA + 1)
    .get();
  if (snapshot.size > MAX_FACTURAS_CARTERA) fail("resource-exhausted", "CARTERA_SUPERA_LIMITE");
  const facturas = snapshot.docs.map((doc: any) => {
    const venta = doc.data() as Record<string, any>;
    const total = venta.totales?.total;
    if (venta.metodoPago !== "cuenta_cobro" || venta.estadoOperativo !== "COMPLETO"
      || !Number.isSafeInteger(total) || total <= 0
      || !Number.isSafeInteger(venta.saldoPendienteCOP) || venta.saldoPendienteCOP <= 0
      || !Number.isSafeInteger(venta.totalAbonadoCOP) || venta.totalAbonadoCOP < 0
      || venta.totalAbonadoCOP + venta.saldoPendienteCOP !== total) fail("failed-precondition", "SALDO_VENTA_INCONSISTENTE");
    return {
      ventaId: doc.id, fecha: venta.fecha ?? null,
      totalCOP: total, totalAbonadoCOP: venta.totalAbonadoCOP,
      saldoPendienteCOP: venta.saldoPendienteCOP,
      fechaCompromisoPagoLocal: fechaLocalValida(venta.fechaCompromisoPagoLocal) ? venta.fechaCompromisoPagoLocal : null,
    };
  }).sort((a: any, b: any) => {
    const millis = (value: any) => typeof value?.toMillis === "function" ? value.toMillis() : 0;
    return millis(a.fecha) - millis(b.fecha);
  });
  const saldoPendienteCOP = facturas.reduce((total: number, factura: any) => total + factura.saldoPendienteCOP, 0);
  if (!Number.isSafeInteger(saldoPendienteCOP) || saldoPendienteCOP !== saldoCliente) fail("failed-precondition", "SALDO_CLIENTE_INCONSISTENTE");
  return { clienteId, facturas, saldoPendienteCOP };
}

export const registrarAbonoVentaBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarRegistrarAbonoVentaBodegaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const consultarCarteraClienteBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return ejecutarConsultarCarteraClienteBodegaV1(db, {
    empresaId: tenant.id, rol: tenant.rol, permisos: tenant.permisos,
    ventasHabilitadas: configuracion.modulos.habilitados.includes("sell"),
    clientesHabilitados: configuracion.modulos.habilitados.includes("clientes"),
  }, request.data);
});
