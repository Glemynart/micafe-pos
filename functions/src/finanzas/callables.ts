import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import { esMembresiaAutorizada } from "../turnos/executor";
import { crearIdentificadorInterno } from "../turnos/identificadores";

const REGION = "us-central1";
const MOVIMIENTOS = "transacciones_financieras";
type Tipo = "ingreso" | "egreso";
const CLAVE_CAJA_PRINCIPAL = "caja-principal";
const CLAVE_CUENTA_ELECTRONICA = "bancolombia";

interface Envelope {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string | null;
  motivo?: string | null;
  payload: Record<string, unknown>;
}

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operación financiera.", { code: dominio });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function canonizarHuella(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonizarHuella);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonizarHuella(value[key])]));
  return value;
}

export function crearHuellaSemantica(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonizarHuella(value))).digest("hex");
}

function envelope(value: unknown): Envelope {
  if (!object(value) || !text(value.commandId) || !text(value.idempotencyKey) || !text(value.correlationId) || !object(value.payload)) {
    return fail("invalid-argument", "PAYLOAD_INVALID");
  }
  return value as unknown as Envelope;
}

function operationRefs(db: any, empresaId: string, input: Envelope) {
  return {
    recibo: db.collection("operaciones_comandos").doc(crearIdentificadorInterno(empresaId, input.commandId)),
    indice: db.collection("operaciones_command_idempotency").doc(crearIdentificadorInterno(empresaId, input.idempotencyKey)),
    auditoria: db.collection("operaciones_auditoria").doc(crearIdentificadorInterno(empresaId, input.commandId)),
  };
}

async function account(tx: any, db: any, empresaId: string, id: string) {
  const ref = db.collection("cuentas_bancarias").doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("failed-precondition", "CUENTA_INVALIDA");
  const saldo = snap.data()?.saldo;
  if (!Number.isSafeInteger(saldo) || saldo < 0) fail("failed-precondition", "CUENTA_INVALIDA");
  return { ref, snap, data: snap.data() as Record<string, unknown>, saldo: saldo as number };
}

/** R1-B §5.1: las claves reservadas son lógicas; el ID físico depende del tenant. */
async function cuentaReservada(tx: any, db: any, empresaId: string, claveOperativa: "caja-principal" | "caja-fuerte") {
  const empresa = await tx.get(db.collection("empresas").doc(empresaId));
  if (!empresa.exists || typeof empresa.data()?.esFundacional !== "boolean") fail("failed-precondition", "CUENTA_INVALIDA");
  const cuentaDocumentoId = empresa.data()?.esFundacional === true
    ? claveOperativa
    : crearIdentificadorInterno(empresaId, `cuenta:${claveOperativa}`);
  const cuenta = await account(tx, db, empresaId, cuentaDocumentoId);
  if (cuenta.data.id !== cuentaDocumentoId || cuenta.data.claveOperativa !== claveOperativa) fail("failed-precondition", "CUENTA_INVALIDA");
  return cuenta;
}

/** Resuelve la identidad lógica de una cuenta sin aceptar un ID físico como autoridad. */
async function resolverCuentaOperativa(tx: any, db: any, empresaId: string, claveOperativa: string) {
  if (claveOperativa === "caja-principal" || claveOperativa === "caja-fuerte") {
    return cuentaReservada(tx, db, empresaId, claveOperativa);
  }
  const candidatas = await tx.get(db.collection("cuentas_bancarias")
    .where("empresaId", "==", empresaId)
    .where("claveOperativa", "==", claveOperativa));
  if (candidatas.size !== 1) fail("failed-precondition", "CUENTA_INVALIDA");
  const snap = candidatas.docs[0];
  const data = snap.data() as Record<string, unknown>;
  const saldo = data.saldo;
  if (data.id !== snap.id || data.empresaId !== empresaId || data.claveOperativa !== claveOperativa || !Number.isSafeInteger(saldo) || (saldo as number) < 0) {
    fail("failed-precondition", "CUENTA_INVALIDA");
  }
  return { ref: snap.ref, snap, data, saldo: saldo as number };
}

function claveCuentaPorMedioPago(medio: unknown) {
  if (!text(medio)) fail("invalid-argument", "PAGO_INVALIDO");
  return medio === "efectivo" ? CLAVE_CAJA_PRINCIPAL : CLAVE_CUENTA_ELECTRONICA;
}

async function turnoAbierto(tx: any, db: any, empresaId: string, turnoId: unknown) {
  if (!text(turnoId)) fail("failed-precondition", "TURNO_CERRADO");
  const ref = db.collection("turnos").doc(turnoId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.estado !== "abierto") fail("failed-precondition", "TURNO_CERRADO");
  return { ref, snap };
}

function assertReplay(recibo: any, indice: any, empresaId: string, input: Envelope, fingerprint: string, reciboPath: string): unknown | null {
  if (!recibo.exists && !indice.exists) return null;
  const r = recibo.data(); const i = indice.data();
  if (!recibo.exists || !r || r.empresaId !== empresaId || r.commandId !== input.commandId || r.idempotencyKey !== input.idempotencyKey || r.huella !== fingerprint) fail("already-exists", "COMMAND_ID_CONFLICT");
  if (!indice.exists || !i || i.empresaId !== empresaId || i.commandId !== input.commandId || i.idempotencyKey !== input.idempotencyKey || i.huella !== fingerprint || i.reciboPath !== reciboPath) fail("already-exists", "IDEMPOTENCY_CONFLICT");
  return r.resultado ?? fail("already-exists", "COMMAND_ID_CONFLICT");
}

function writeConfirmation(tx: any, refs: ReturnType<typeof operationRefs>, empresaId: string, actorUid: string, rol: string, input: Envelope, fingerprint: string, tipo: string, resultado: unknown, referencias: Record<string, unknown>, ejecutorTecnico?: string) {
  const now = FieldValue.serverTimestamp();
  tx.create(refs.recibo, { empresaId, commandId: input.commandId, idempotencyKey: input.idempotencyKey, huella: fingerprint, tipo, actor: { uid: actorUid, rolEfectivo: rol }, ejecutorTecnico: ejecutorTecnico ?? null, correlationId: input.correlationId, causationId: input.causationId ?? null, motivo: input.motivo ?? null, resultado, referencias, estado: "CONFIRMADO", creadoEn: now });
  tx.create(refs.indice, { empresaId, commandId: input.commandId, idempotencyKey: input.idempotencyKey, huella: fingerprint, reciboPath: refs.recibo.path, creadoEn: now });
  tx.create(refs.auditoria, { empresaId, tipo, resultado: "CONFIRMADO", actor: { uid: actorUid, rolEfectivo: rol }, ejecutorTecnico: ejecutorTecnico ?? null, causationId: input.causationId ?? null, comando: { id: input.commandId, tipo, idempotencyKey: input.idempotencyKey, huella: fingerprint, correlationId: input.correlationId }, motivo: input.motivo ?? null, referencias, creadoEn: now });
}

function writeMovement(tx: any, db: any, input: { empresaId: string; command: Envelope; key: string; account: { ref: any; data: Record<string, unknown>; saldo: number }; tipo: Tipo; monto: number; categoria: string; actorUid: string; rol: string; turnoId?: string | null; ventaId?: string | null; egresoId?: string | null; movimientoRelacionadoId?: string | null; actualizarSaldo?: boolean; validarFondos?: boolean; }) {
  const id = crearIdentificadorInterno(input.empresaId, `movfin:${input.key}`);
  const ref = db.collection(MOVIMIENTOS).doc(id);
  const next = input.tipo === "ingreso" ? input.account.saldo + input.monto : input.account.saldo - input.monto;
  if (input.validarFondos !== false && next < 0) fail("failed-precondition", "FONDOS_INSUFICIENTES");
  tx.create(ref, { id, empresaId: input.empresaId, claveIdempotencia: input.key, commandId: input.command.commandId, idempotencyKey: input.command.idempotencyKey, correlationId: input.command.correlationId, tipo: input.tipo, monto: input.monto, moneda: "COP", fecha: FieldValue.serverTimestamp(), cuentaDocumentoId: input.account.ref.id, cuentaClaveSnapshot: input.account.data.claveOperativa ?? input.account.ref.id, cuentaNombreSnapshot: input.account.data.nombre ?? input.account.ref.id, saldoDespues: next, categoria: input.categoria, referenciaColeccion: input.ventaId ? "ventas" : input.egresoId ? "egresos" : "operacion", referenciaId: input.ventaId ?? input.egresoId ?? input.command.commandId, turnoId: input.turnoId ?? null, ventaId: input.ventaId ?? null, egresoId: input.egresoId ?? null, movimientoRelacionadoId: input.movimientoRelacionadoId ?? null, motivo: input.command.motivo ?? null, usuarioId: input.actorUid, usuarioNombreSnapshot: input.actorUid, rolEfectivoSnapshot: input.rol });
  if (input.actualizarSaldo !== false) tx.update(input.account.ref, { saldo: next });
  return { id, ref, saldo: next };
}

/** Hecho fiscal congelado: solo determina cuantas piernas financieras debieron existir. */
export function importesPagoVenta(venta: Record<string, any>): number[] | null {
  const total = Number(venta.totales?.total ?? 0);
  const metodo = venta.metodoPago ?? venta.pago?.metodo;
  if (!money(total) || !text(metodo)) return null;
  if (metodo !== "mixto") return [total];
  if (!Array.isArray(venta.pagoMixtoDetalle) || venta.pagoMixtoDetalle.length === 0) return null;
  const importes = venta.pagoMixtoDetalle.map((p: any) => p?.monto);
  return importes.every(money) && importes.reduce((sum: number, monto: number) => sum + monto, 0) === total ? importes : null;
}

async function execute(request: any, tipo: string, effect: (tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope) => Promise<Record<string, unknown>>) {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return executeConContexto(db, { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol }, request.data, tipo, effect);
}

export interface ContextoFinancieroOperativo {
  empresaId: string;
  actorUid: string;
  rol: string;
  ejecutorTecnico?: string;
}

/** Relee autoridad canónica en la misma transacción que materializa el efecto. */
export async function revalidarAutoridadFinancieraEnTransaccion(tx: any, db: any, contexto: ContextoFinancieroOperativo, capacidad: string) {
  const [empresa, membresiaSnap] = await Promise.all([
    tx.get(db.collection("empresas").doc(contexto.empresaId)),
    tx.get(db.collection("membresias").doc(`${contexto.empresaId}_${contexto.actorUid}`)),
  ]);
  if (!empresa.exists || !["trial", "activa"].includes(empresa.data()?.estado)) fail("failed-precondition", "EMPRESA_NO_OPERATIVA");
  const membresia = membresiaSnap.data() as Record<string, unknown> | undefined;
  if (!esMembresiaAutorizada(membresia, contexto)) fail("permission-denied", "TENANT_ACCESS_DENIED");
  const membresiaVigente = membresia as Record<string, unknown> & { rol: string; permisos: unknown[] };
  if (membresiaVigente.rol !== contexto.rol) fail("permission-denied", "TENANT_ACCESS_DENIED");
  if (!membresiaVigente.permisos.includes(capacidad)) fail("permission-denied", "ROLE_FORBIDDEN");
}

async function executeConContexto(db: any, contexto: ContextoFinancieroOperativo, data: unknown, tipo: string, effect: (tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope) => Promise<Record<string, unknown>>) {
  const input = envelope(data);
  const fingerprint = crearHuellaSemantica({ tipo, causationId: input.causationId ?? null, motivo: input.motivo ?? null, payload: input.payload });
  const refs = operationRefs(db, contexto.empresaId, input);
  return db.runTransaction(async (tx: any) => {
    const [recibo, indice] = await Promise.all([tx.get(refs.recibo), tx.get(refs.indice)]);
    const replay = assertReplay(recibo, indice, contexto.empresaId, input, fingerprint, refs.recibo.path);
    if (replay) return replay;
    const result = await effect(tx, db, contexto.empresaId, contexto.actorUid, contexto.rol, input);
    writeConfirmation(tx, refs, contexto.empresaId, contexto.actorUid, contexto.rol, input, fingerprint, tipo, result, result, contexto.ejecutorTecnico);
    return result;
  });
}

export const registrarMovimientoFinancieroV1 = onCall({ region: REGION }, async request => execute(request, "registrarMovimientoFinancieroV1", async (tx, db, empresaId, actorUid, rol, input) => {
  const { cuentaId, monto, tipo, categoria, turnoId } = input.payload;
  if (!text(cuentaId) || !money(monto) || (tipo !== "ingreso" && tipo !== "egreso") || !text(categoria) || !text(input.motivo)) fail("invalid-argument", "PAYLOAD_INVALID");
  const cuenta = await account(tx, db, empresaId, cuentaId as string);
  if (cuenta.data.claveOperativa === "caja-principal" || cuenta.ref.id === "caja-principal") await turnoAbierto(tx, db, empresaId, turnoId);
  const movement = writeMovement(tx, db, { empresaId, command: input, key: `movimiento_manual:${input.commandId}`, account: cuenta, tipo: tipo as Tipo, monto: monto as number, categoria: categoria as string, actorUid, rol, turnoId: text(turnoId) ? turnoId : null });
  return { commandId: input.commandId, movimientoId: movement.id };
}));

export const registrarEgresoOperativoV1 = onCall({ region: REGION }, async request => execute(request, "registrarEgresoOperativoV1", async (tx, db, empresaId, actorUid, rol, input) => {
  const { cuentaId, turnoId, monto } = input.payload;
  if (!text(cuentaId) || !text(turnoId) || !money(monto) || !text(input.motivo)) fail("invalid-argument", "PAYLOAD_INVALID");
  await turnoAbierto(tx, db, empresaId, turnoId);
  const cuenta = await account(tx, db, empresaId, cuentaId as string);
  const egresoId = crearIdentificadorInterno(empresaId, `egreso:${input.commandId}`);
  const egresoRef = db.collection("egresos").doc(egresoId);
  const existing = await tx.get(egresoRef);
  if (existing.exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  const movement = writeMovement(tx, db, { empresaId, command: input, key: `egreso:${input.commandId}`, account: cuenta, tipo: "egreso", monto: monto as number, categoria: "egreso", actorUid, rol, turnoId: turnoId as string, egresoId });
  tx.create(egresoRef, { id: egresoId, empresaId, turnoId: turnoId as string, cajeroId: actorUid, monto: monto as number, motivo: input.motivo, fecha: FieldValue.serverTimestamp(), movimientoId: movement.id });
  return { commandId: input.commandId, egresoId, movimientoId: movement.id };
}));

export const trasladarEntreCuentasV1 = onCall({ region: REGION }, async request => execute(request, "trasladarEntreCuentasV1", async (tx, db, empresaId, actorUid, rol, input) => {
  const { cuentaOrigenId, cuentaDestinoId, monto, turnoId } = input.payload;
  if (!text(cuentaOrigenId) || !text(cuentaDestinoId) || cuentaOrigenId === cuentaDestinoId || !money(monto)) fail("invalid-argument", "PAYLOAD_INVALID");
  const [origin, destination] = await Promise.all([account(tx, db, empresaId, cuentaOrigenId as string), account(tx, db, empresaId, cuentaDestinoId as string)]);
  if ((origin.data.claveOperativa === "caja-principal" || origin.ref.id === "caja-principal") && text(turnoId)) await turnoAbierto(tx, db, empresaId, turnoId);
  const out = writeMovement(tx, db, { empresaId, command: input, key: `traslado:${input.commandId}:origen`, account: origin, tipo: "egreso", monto: monto as number, categoria: "traslado_salida", actorUid, rol, turnoId: text(turnoId) ? turnoId : null });
  const inn = writeMovement(tx, db, { empresaId, command: input, key: `traslado:${input.commandId}:destino`, account: destination, tipo: "ingreso", monto: monto as number, categoria: "traslado_entrada", actorUid, rol, turnoId: text(turnoId) ? turnoId : null, movimientoRelacionadoId: out.id });
  return { commandId: input.commandId, movimientos: [out.id, inn.id] };
}));

async function efectoAplicarEfectosVentaOperativa(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "pos");
  const ventaId = input.payload.ventaId;
  if (!text(ventaId)) fail("invalid-argument", "PAYLOAD_INVALID");
  const ventaRef = db.collection("ventas").doc(ventaId as string); const venta = await tx.get(ventaRef);
  if (!venta.exists || venta.data()?.empresaId !== empresaId || venta.data()?.estadoOperativo !== "PENDIENTE_EFECTOS") fail("failed-precondition", "VENTA_NO_PENDIENTE");
  const data = venta.data() as Record<string, any>; const total = Number(data.totales?.total ?? 0); const metodo = data.metodoPago ?? data.pago?.metodo;
  if (!money(total) || !text(metodo)) fail("invalid-argument", "PAGO_INVALIDO");
  const legs: Array<{ claveOperativa: string; monto: number; turnoId: string | null }> = metodo === "mixto" ? (Array.isArray(data.pagoMixtoDetalle) ? data.pagoMixtoDetalle.map((p: any) => ({ claveOperativa: claveCuentaPorMedioPago(p.metodo), monto: p.monto, turnoId: p.metodo === "efectivo" ? data.turnoId ?? null : null })) : []) : [{ claveOperativa: claveCuentaPorMedioPago(metodo), monto: total, turnoId: metodo === "efectivo" ? data.turnoId ?? null : null }];
  if (!legs.length || legs.some(leg => !money(leg.monto))) fail("invalid-argument", "PAGO_INVALIDO");
  if (legs.reduce((sum, leg) => sum + leg.monto, 0) !== total) fail("invalid-argument", "PAGO_INVALIDO");
  const cuentas = await Promise.all([...new Set(legs.map(leg => leg.claveOperativa))].map(clave => resolverCuentaOperativa(tx, db, empresaId, clave)));
  const porId = new Map(cuentas.map(cuenta => [cuenta.ref.id, cuenta]));
  if (legs.some(leg => leg.claveOperativa === CLAVE_CAJA_PRINCIPAL)) {
    const turnoId = legs.find(leg => leg.claveOperativa === CLAVE_CAJA_PRINCIPAL)!.turnoId;
    if (!text(turnoId)) fail("failed-precondition", "TURNO_CERRADO");
    const turno = await tx.get(db.collection("turnos").doc(turnoId));
    if (!turno.exists || turno.data()?.empresaId !== empresaId) fail("failed-precondition", "TURNO_CERRADO");
  }
  // Todas las lecturas del inventario preceden a cualquier mutación. La venta
  // no puede completar si una línea fiscal no puede materializar su efecto.
  const consumos = new Map<string, { tipo: "producto" | "insumo"; cantidad: number }>();
  const items = Array.isArray(data.items) ? data.items : fail("failed-precondition", "VENTA_SIN_ITEMS");
  const recetas = new Map<string, any>();
  for (const item of items) {
    if (!text(item?.id) || !money(item?.cantidad)) fail("failed-precondition", "ITEM_VENTA_INVALIDO");
    if ((item.id as string).startsWith("quick-")) continue;
    const receta = await tx.get(db.collection("recetas").doc(item.id));
    if (receta.exists) recetas.set(item.id, receta.data());
  }
  for (const item of items) {
    if ((item?.id as string | undefined)?.startsWith("quick-")) continue;
    const receta = recetas.get(item.id);
    if (Array.isArray(receta?.ingredientes) && receta.ingredientes.length) {
      for (const ingrediente of receta.ingredientes) {
        if (!text(ingrediente?.insumoId) || !money(ingrediente?.cantidad)) fail("failed-precondition", "RECETA_INVALIDA");
        const key = `insumo:${ingrediente.insumoId}`; const actual = consumos.get(key);
        consumos.set(key, { tipo: "insumo", cantidad: (actual?.cantidad ?? 0) + ingrediente.cantidad * item.cantidad });
      }
    } else {
      const key = `producto:${item.id}`; const actual = consumos.get(key);
      consumos.set(key, { tipo: "producto", cantidad: (actual?.cantidad ?? 0) + item.cantidad });
    }
  }
  const inventario: Array<{ key: string; articulo: any; movimiento: any; cantidad: number; tipo: "producto" | "insumo" }> = [];
  for (const [key, consumo] of consumos) {
    const articuloId = key.slice(key.indexOf(":") + 1); const coleccion = consumo.tipo === "producto" ? "productos" : "insumos";
    const articulo = await tx.get(db.collection(coleccion).doc(articuloId));
    if (!articulo.exists || articulo.data()?.empresaId !== empresaId) fail("failed-precondition", "ARTICULO_NO_ENCONTRADO");
    const movimiento = db.collection("movimientos_inventario").doc(`venta:${ventaId}:${consumo.tipo}:${articuloId}:0`);
    const existente = await tx.get(movimiento);
    if (existente.exists && (existente.data()?.empresaId !== empresaId || existente.data()?.referenciaId !== ventaId)) fail("failed-precondition", "EFECTO_INVENTARIO_INCONSISTENTE");
    inventario.push({ key, articulo, movimiento, cantidad: consumo.cantidad, tipo: consumo.tipo });
  }
  const lineasExistentes = await Promise.all(legs.map((_, ordinal) => tx.get(db.collection(MOVIMIENTOS).doc(crearIdentificadorInterno(empresaId, `movfin:venta:${ventaId}:pago:${ordinal}`)))));
  if (lineasExistentes.some(linea => linea.exists)) fail("failed-precondition", "EFECTOS_VENTA_INCONSISTENTES");
  const saldos = new Map(cuentas.map(cuenta => [cuenta.ref.id, cuenta.saldo]));
  const movementIds: string[] = [];
  for (const [ordinal, leg] of legs.entries()) { const a = cuentas.find(cuenta => cuenta.data.claveOperativa === leg.claveOperativa)!; const saldo = saldos.get(a.ref.id)!; const m = writeMovement(tx, db, { empresaId, command: input, key: `venta:${ventaId as string}:pago:${ordinal}`, account: { ...a, saldo }, tipo: "ingreso", monto: leg.monto, categoria: "ventas", actorUid, rol, turnoId: leg.turnoId, ventaId: ventaId as string, actualizarSaldo: false }); saldos.set(a.ref.id, m.saldo); movementIds.push(m.id); }
  for (const cuenta of cuentas) tx.update(cuenta.ref, { saldo: saldos.get(cuenta.ref.id)! });
  for (const entrada of inventario) {
    const articulo = entrada.articulo.data(); const stock = Number(articulo.stock ?? 0); const secuencia = Number(articulo.secuenciaLedger ?? 0);
    tx.create(entrada.movimiento, { id: entrada.movimiento.id, empresaId, articuloTipo: entrada.tipo, articuloId: entrada.articulo.id, articuloNombre: articulo.nombre ?? entrada.articulo.id, unidad: articulo.unidadMedida ?? articulo.unidad ?? "und", tipo: entrada.tipo === "insumo" ? "consumo_receta" : "venta", clase: "salida", signo: -1, cantidad: -entrada.cantidad, saldoCantidadDespues: stock - entrada.cantidad, secuencia: secuencia + 1, referenciaColeccion: "ventas", referenciaId: ventaId, claveIdempotencia: entrada.movimiento.id, usuarioId: actorUid, rolEfectivoSnapshot: rol, creadoEn: FieldValue.serverTimestamp() });
    tx.update(db.collection(entrada.tipo === "producto" ? "productos" : "insumos").doc(entrada.articulo.id), { stock: stock - entrada.cantidad, secuenciaLedger: secuencia + 1 });
  }
  tx.update(ventaRef, { estadoOperativo: "COMPLETO", efectosOperativosEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, ventaId, movimientos: movementIds, movimientosInventario: inventario.map(entrada => entrada.movimiento.id) };
}

export async function ejecutarAplicarEfectosVentaOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "aplicarEfectosVentaOperativaV1", efectoAplicarEfectosVentaOperativa);
}

export const aplicarEfectosVentaOperativaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore(); const tenant = await exigirTenantActivo(request, db);
  return ejecutarAplicarEfectosVentaOperativaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

/** R1-B.1: compensa inmutablemente cada pierna financiera original de la venta. */
async function efectoAnularVentaOperativa(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  const ventaId = input.payload.ventaId;
  if (!text(ventaId)) fail("invalid-argument", "PAYLOAD_INVALID");
  if (rol !== "admin" && rol !== "cajero") fail("permission-denied", "ROL_NO_AUTORIZADO");

  const ventaRef = db.collection("ventas").doc(ventaId as string);
  const venta = await tx.get(ventaRef);
  if (!venta.exists || venta.data()?.empresaId !== empresaId) fail("not-found", "VENTA_NO_ENCONTRADA");
  const ventaData = venta.data() as Record<string, any>;
  const estado = ventaData.estadoOperativo;
  if (estado === "ANULADA_SIN_EFECTOS" || estado === "ANULADA_CON_EFECTOS" || ventaData.estado === "anulada") fail("failed-precondition", "VENTA_YA_ANULADA");

  if (estado === "PENDIENTE_EFECTOS") {
    tx.update(ventaRef, { estado: "anulada", estadoOperativo: "ANULADA_SIN_EFECTOS", anuladaPor: actorUid, anuladaPorNombre: actorUid, anuladaEn: FieldValue.serverTimestamp() });
    return { commandId: input.commandId, ventaId: ventaId as string, estadoOperativo: "ANULADA_SIN_EFECTOS", movimientos: [] };
  }
  if (estado !== "COMPLETO") fail("failed-precondition", "ESTADO_VENTA_INVALIDO");

  const importesVenta = importesPagoVenta(ventaData);
  const importes = importesVenta ?? fail("failed-precondition", "PAGO_INVALIDO");
  const fuentes = await Promise.all(importes.map((monto, ordinal) => {
    const key = `venta:${ventaId as string}:pago:${ordinal}`;
    return tx.get(db.collection(MOVIMIENTOS).doc(crearIdentificadorInterno(empresaId, `movfin:${key}`))).then((snap: any) => ({ snap, monto, ordinal }));
  }));
  if (fuentes.some(({ snap, monto }) => !snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.ventaId !== ventaId || snap.data()?.tipo !== "ingreso" || snap.data()?.categoria !== "ventas" || snap.data()?.monto !== monto || !text(snap.data()?.cuentaDocumentoId))) fail("failed-precondition", "EFECTOS_VENTA_INCONSISTENTES");

  const cuentaIds = [...new Set(fuentes.map(({ snap }) => snap.data().cuentaDocumentoId as string))];
  const cuentas = await Promise.all(cuentaIds.map(id => account(tx, db, empresaId, id)));
  const porId = new Map(cuentas.map(cuenta => [cuenta.ref.id, cuenta]));
  const debitos = new Map<string, number>();
  for (const { snap, monto } of fuentes) {
    const cuentaId = snap.data().cuentaDocumentoId as string;
    debitos.set(cuentaId, (debitos.get(cuentaId) ?? 0) + monto);
  }
  for (const [cuentaId, monto] of debitos) if ((porId.get(cuentaId)?.saldo ?? -1) < monto) fail("failed-precondition", "FONDOS_INSUFICIENTES");

  const hayEfectivo = fuentes.some(({ snap }) => snap.data()?.cuentaClaveSnapshot === "caja-principal" || snap.data()?.cuentaDocumentoId === "caja-principal");
  let turnoCompensacion: string | null = null;
  if (hayEfectivo) {
    const lock = await tx.get(db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, actorUid)));
    if (!lock.exists || lock.data()?.empresaId !== empresaId || lock.data()?.cajeroId !== actorUid) fail("failed-precondition", "TURNO_CERRADO");
    await turnoAbierto(tx, db, empresaId, lock.data()?.turnoId);
    turnoCompensacion = lock.data()?.turnoId;
  }

  const saldos = new Map(cuentas.map(cuenta => [cuenta.ref.id, cuenta.saldo]));
  const movimientoIds: string[] = [];
  for (const { snap, monto, ordinal } of fuentes) {
    const cuentaId = snap.data().cuentaDocumentoId as string;
    const cuenta = porId.get(cuentaId)!;
    const esEfectivo = snap.data()?.cuentaClaveSnapshot === "caja-principal" || cuentaId === "caja-principal";
    const movimiento = writeMovement(tx, db, { empresaId, command: input, key: `anulacion:${ventaId as string}:pago:${ordinal}`, account: { ...cuenta, saldo: saldos.get(cuentaId)! }, tipo: "egreso", monto, categoria: "anulacion_venta", actorUid, rol, turnoId: esEfectivo ? turnoCompensacion : null, ventaId: ventaId as string, movimientoRelacionadoId: snap.id, actualizarSaldo: false });
    saldos.set(cuentaId, movimiento.saldo);
    movimientoIds.push(movimiento.id);
  }
  for (const cuenta of cuentas) tx.update(cuenta.ref, { saldo: saldos.get(cuenta.ref.id)! });
  tx.update(ventaRef, { estado: "anulada", estadoOperativo: "ANULADA_CON_EFECTOS", anuladaPor: actorUid, anuladaPorNombre: actorUid, anuladaEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, ventaId: ventaId as string, estadoOperativo: "ANULADA_CON_EFECTOS", movimientos: movimientoIds, turnoCompensacion };
}

/** Ejecutor compartido por la callable y sus pruebas de invariantes transaccionales. */
export async function ejecutarAnularVentaOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "anularVentaOperativaV1", efectoAnularVentaOperativa);
}

/** Frontera completa de la Callable, inyectable para pruebas sin cambiar su contrato público. */
export async function manejarAnularVentaOperativaV1(db: any, request: any) {
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarAnularVentaOperativaV1(db, { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol }, request.data);
}

export const anularVentaOperativaV1 = onCall({ region: REGION }, async request => manejarAnularVentaOperativaV1(getFirestore(), request));

/** Cierre atómico: los totales cliente nunca participan en el cálculo financiero. */
function totalVenta(data: Record<string, any>) {
  const total = data.totales?.total;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function efectivoVenta(data: Record<string, any>) {
  const total = totalVenta(data);
  if (total === null) return null;
  const metodo = data.metodoPago ?? data.pago?.metodo;
  if (metodo === "efectivo") return total;
  if (metodo !== "mixto" || !Array.isArray(data.pagoMixtoDetalle)) return 0;
  let efectivo = 0; let suma = 0;
  for (const pago of data.pagoMixtoDetalle) {
    if (!Number.isSafeInteger(pago?.monto) || pago.monto <= 0) return null;
    suma += pago.monto;
    if (pago.metodo === "efectivo") efectivo += pago.monto;
  }
  return suma === total ? efectivo : null;
}

function lineas(snapshot: any) { return Array.isArray(snapshot?.docs) ? snapshot.docs : []; }
function esMovimientoArqueable(data: Record<string, any>) {
  const permitidos: Record<Tipo, readonly string[]> = {
    ingreso: ["ventas", "ingreso_caja", "traslado_entrada"],
    egreso: ["egreso", "anulacion_venta", "devolucion_venta", "traslado_salida"],
  };
  const tipo = data.tipo;
  return (tipo === "ingreso" || tipo === "egreso")
    && money(data.monto) && permitidos[tipo as Tipo].includes(data.categoria);
}

function membresiaRelevoValida(data: Record<string, any> | undefined, empresaId: string, cajeroId: string) {
  return !!data && data.empresaId === empresaId && data.uid === cajeroId
    && data.estado === "activa" && data.activo === true && typeof data.rol === "string"
    && Array.isArray(data.permisos) && data.permisos.includes("shifts");
}

async function efectoCerrarTurnoOperativo(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  const { turnoId, efectivoContado, relevoCajeroId } = input.payload;
  if (!text(turnoId) || !Number.isSafeInteger(efectivoContado) || (efectivoContado as number) < 0 || (relevoCajeroId !== undefined && !text(relevoCajeroId))) fail("invalid-argument", "PAYLOAD_INVALID");
  const contado = efectivoContado as number;
  const turnoRef = db.collection("turnos").doc(turnoId as string);
  const lock = db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, actorUid));
  const empresaRef = db.collection("empresas").doc(empresaId);
  const membresiaActorRef = db.collection("membresias").doc(`${empresaId}_${actorUid}`);
  const relevoLock = text(relevoCajeroId) ? db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, relevoCajeroId)) : null;
  const [turno, caja, fuerte, lockSnap, empresa, membresiaActor] = await Promise.all([
    tx.get(turnoRef), cuentaReservada(tx, db, empresaId, "caja-principal"), cuentaReservada(tx, db, empresaId, "caja-fuerte"), tx.get(lock), tx.get(empresaRef), tx.get(membresiaActorRef),
  ]);
  const [movimientos, ventas, egresos, relevoMembresia, relevoUsuario, relevoLockSnap, relevoTurnos] = await Promise.all([
    tx.get(db.collection(MOVIMIENTOS).where("empresaId", "==", empresaId).where("cuentaDocumentoId", "==", caja.ref.id).where("turnoId", "==", turnoId)),
    tx.get(db.collection("ventas").where("empresaId", "==", empresaId).where("turnoId", "==", turnoId).where("estadoOperativo", "==", "COMPLETO")),
    tx.get(db.collection("egresos").where("empresaId", "==", empresaId).where("turnoId", "==", turnoId)),
    relevoCajeroId === undefined ? Promise.resolve(null) : tx.get(db.collection("membresias").doc(`${empresaId}_${relevoCajeroId}`)),
    relevoCajeroId === undefined ? Promise.resolve(null) : tx.get(db.collection("usuarios").doc(relevoCajeroId as string)),
    relevoLock === null ? Promise.resolve(null) : tx.get(relevoLock),
    relevoCajeroId === undefined ? Promise.resolve(null) : tx.get(db.collection("turnos").where("empresaId", "==", empresaId).where("cajeroId", "==", relevoCajeroId).where("estado", "==", "abierto")),
  ]);
  if (!empresa.exists || !["trial", "activa"].includes(empresa.data()?.estado)) fail("failed-precondition", "EMPRESA_NO_OPERATIVA");
  const membresia = membresiaActor.data() as Record<string, unknown> | undefined;
  if (!esMembresiaAutorizada(membresia, { empresaId, actorUid })) fail("permission-denied", "TENANT_ACCESS_DENIED");
  const membresiaVigente = membresia as Record<string, unknown> & { rol: string; permisos: unknown[] };
  if (membresiaVigente.rol !== rol) fail("permission-denied", "TENANT_ACCESS_DENIED");
  if (!membresiaVigente.permisos.includes("shifts")) fail("permission-denied", "ROLE_FORBIDDEN");
  if (!turno.exists || turno.data()?.empresaId !== empresaId || turno.data()?.estado !== "abierto" || turno.data()?.cajeroId !== actorUid) fail("failed-precondition", "TURNO_CERRADO");
  if (!lockSnap.exists || lockSnap.data()?.empresaId !== empresaId || lockSnap.data()?.cajeroId !== actorUid || lockSnap.data()?.turnoId !== turnoId) fail("failed-precondition", "LOCK_CONFLICT");
  const base = Number(turno.data()?.baseApertura ?? 0);
  if (!Number.isSafeInteger(base) || base < 0) fail("failed-precondition", "TURNO_CERRADO");
  const movimientosCaja = lineas(movimientos).filter((snap: any) => snap.data()?.cuentaDocumentoId === caja.ref.id && snap.data()?.turnoId === turnoId && esMovimientoArqueable(snap.data()));
  const flujo = movimientosCaja.reduce((sum: number, snap: any) => sum + (snap.data().tipo === "ingreso" ? snap.data().monto : -snap.data().monto), 0);
  const esperado = base + flujo;
  const deposit = Math.max(0, contado - base);
  const difference = contado - esperado;
  const finalSaldo = caja.saldo - deposit + difference;
  if (finalSaldo < 0) fail("failed-precondition", "FONDOS_INSUFICIENTES");
  const ventasCompletas = lineas(ventas).map((snap: any) => snap.data() as Record<string, any>);
  const ventasEfectivo = ventasCompletas.reduce((sum: number, venta: Record<string, any>) => sum + (efectivoVenta(venta) ?? fail("failed-precondition", "PAGO_INVALIDO")), 0);
  const ventasTotales = ventasCompletas.reduce((sum: number, venta: Record<string, any>) => sum + (totalVenta(venta) ?? fail("failed-precondition", "PAGO_INVALIDO")), 0);
  const totalEgresos = lineas(egresos).reduce((sum: number, snap: any) => {
    const data = snap.data(); return data?.estado === "anulado" ? sum : sum + (money(data?.monto) ? data.monto : fail("failed-precondition", "EGRESO_INVALIDO"));
  }, 0);
  if (relevoCajeroId !== undefined) {
    if (relevoCajeroId === actorUid || !membresiaRelevoValida(relevoMembresia?.data(), empresaId, relevoCajeroId as string) || !text(relevoUsuario?.data()?.nombre) || relevoLockSnap?.exists || lineas(relevoTurnos).length) fail("failed-precondition", "RELEVO_NO_DISPONIBLE");
  }
  const ids: string[] = [];
  let saldoCajaTrasDeposito = caja.saldo;
  if (deposit > 0) {
    const out = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:deposito:origen`, account: caja, tipo: "egreso", monto: deposit, categoria: "cierre_deposito", actorUid, rol, turnoId: turnoId as string, actualizarSaldo: false, validarFondos: false });
    const inn = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:deposito:destino`, account: fuerte, tipo: "ingreso", monto: deposit, categoria: "cierre_deposito", actorUid, rol, turnoId: turnoId as string, movimientoRelacionadoId: out.id, actualizarSaldo: false });
    saldoCajaTrasDeposito = out.saldo;
    ids.push(out.id, inn.id);
  }
  if (difference !== 0) { const adjustment = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:${difference < 0 ? "faltante" : "sobrante"}`, account: { ...caja, saldo: saldoCajaTrasDeposito }, tipo: difference < 0 ? "egreso" : "ingreso", monto: Math.abs(difference), categoria: difference < 0 ? "faltante_caja" : "sobrante_caja", actorUid, rol, turnoId: turnoId as string, actualizarSaldo: false, validarFondos: false }); ids.push(adjustment.id); }
  tx.update(caja.ref, { saldo: finalSaldo });
  tx.update(fuerte.ref, { saldo: fuerte.saldo + deposit });
  tx.update(turnoRef, { estado: "cerrado", fechaCierre: FieldValue.serverTimestamp(), ventasEfectivo, ventasOtrosMetodos: ventasTotales - ventasEfectivo, totalEgresos, totalReportadoEfectivo: contado, totalEsperadoEfectivo: esperado, diferenciaEfectivo: difference, depositoNeto: deposit, conteoDetalle: input.payload.conteoDetalle ?? null });
  tx.delete(lock);
  let relevoTurnoId: string | null = null;
  if (relevoCajeroId !== undefined) {
    const relevoTurno = db.collection("turnos").doc(); relevoTurnoId = relevoTurno.id;
    tx.create(relevoTurno, { id: relevoTurno.id, empresaId, cajeroId: relevoCajeroId, cajeroNombre: relevoUsuario.data().nombre.trim(), fechaApertura: FieldValue.serverTimestamp(), estado: "abierto", baseApertura: base, notasApertura: null });
    tx.create(relevoLock!, { empresaId, cajeroId: relevoCajeroId, turnoId: relevoTurno.id, fechaApertura: FieldValue.serverTimestamp() });
  }
  return { commandId: input.commandId, turnoId: turnoId as string, movimientos: ids, efectivoEsperado: esperado, diferenciaEfectivo: difference, depositoNeto: deposit, relevoCajeroId: relevoCajeroId ?? null, relevoTurnoId };
}

/** Ejecutor inyectable del cierre R1-B.3 para pruebas de atomicidad e idempotencia. */
export async function ejecutarCerrarTurnoOperativoV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "cerrarTurnoOperativoV1", efectoCerrarTurnoOperativo);
}

export const cerrarTurnoOperativoV1 = onCall({ region: REGION }, async request => execute(request, "cerrarTurnoOperativoV1", efectoCerrarTurnoOperativo));
