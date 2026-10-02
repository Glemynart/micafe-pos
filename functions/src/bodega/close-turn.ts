import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esMembresiaAutorizada } from "../turnos/executor";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import {
  executeConContexto,
  resolverCuentaOperativa,
  writeMovement,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "./operational-core";

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operaciÃ³n financiera.", { code: dominio });
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const lineas = (snapshot: any) => Array.isArray(snapshot?.docs) ? snapshot.docs : [];

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
  let efectivo = 0;
  let suma = 0;
  for (const pago of data.pagoMixtoDetalle) {
    if (!Number.isSafeInteger(pago?.monto) || pago.monto <= 0) return null;
    suma += pago.monto;
    if (pago.metodo === "efectivo") efectivo += pago.monto;
  }
  return suma === total ? efectivo : null;
}

function esMovimientoArqueable(data: Record<string, any>) {
  const permitidos: Record<"ingreso" | "egreso", readonly string[]> = {
    ingreso: ["ventas", "ingreso_caja", "traslado_entrada"],
    egreso: ["egreso", "anulacion_venta", "devolucion_venta", "traslado_salida"],
  };
  const tipo = data.tipo;
  return (tipo === "ingreso" || tipo === "egreso")
    && money(data.monto)
    && permitidos[tipo as "ingreso" | "egreso"].includes(data.categoria);
}

function membresiaRelevoValida(data: Record<string, unknown> | undefined, empresaId: string, cajeroId: string) {
  return !!data
    && data.empresaId === empresaId
    && data.uid === cajeroId
    && data.estado === "activa"
    && data.activo === true
    && typeof data.rol === "string"
    && Array.isArray(data.permisos)
    && data.permisos.includes("shifts");
}

/** Cierre atómico tenant-aware; reutiliza únicamente la closure operativa neutral. */
async function efectoCerrarTurnoOperativo(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const { turnoId, efectivoContado } = input.payload;
  const relevoCajeroIdRaw = input.payload.relevoCajeroId;
  if (!text(turnoId)
    || !Number.isSafeInteger(efectivoContado)
    || (efectivoContado as number) < 0
    || (relevoCajeroIdRaw !== undefined && relevoCajeroIdRaw !== null && !text(relevoCajeroIdRaw))) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
  const relevoCajeroId = text(relevoCajeroIdRaw) ? relevoCajeroIdRaw : undefined;
  const contado = efectivoContado as number;
  const turnoRef = db.collection("turnos").doc(turnoId as string);
  const lock = db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, actorUid));
  const empresaRef = db.collection("empresas").doc(empresaId);
  const membresiaActorRef = db.collection("membresias").doc(`${empresaId}_${actorUid}`);
  const relevoLock = text(relevoCajeroId)
    ? db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, relevoCajeroId as string))
    : null;
  const [turno, caja, fuerte, lockSnap, empresa, membresiaActor, configuracion] = await Promise.all([
    tx.get(turnoRef),
    resolverCuentaOperativa(tx, db, empresaId, "caja-principal"),
    resolverCuentaOperativa(tx, db, empresaId, "caja-fuerte"),
    tx.get(lock),
    tx.get(empresaRef),
    tx.get(membresiaActorRef),
    tx.get(db.collection("configuraciones").doc(empresaId)),
  ]);
  const [movimientos, ventas, egresos, relevoMembresia, relevoUsuario, relevoLockSnap, relevoTurnos] = await Promise.all([
    tx.get(db.collection("transacciones_financieras").where("empresaId", "==", empresaId).where("cuentaDocumentoId", "==", caja.ref.id).where("turnoId", "==", turnoId)),
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
  const umbralConfigurado = configuracion.data()?.caja?.umbralAlertaFaltante;
  const umbralAlertaFaltante = Number.isSafeInteger(umbralConfigurado) && (umbralConfigurado as number) >= 0 ? umbralConfigurado as number : 20000;
  const alertaFaltante = difference < -umbralAlertaFaltante;
  const notasCierre = typeof input.motivo === "string" ? input.motivo.trim() : "";
  const finalSaldo = caja.saldo - deposit + difference;
  if (finalSaldo < 0) fail("failed-precondition", "FONDOS_INSUFICIENTES");
  const ventasCompletas = lineas(ventas).map((snap: any) => snap.data() as Record<string, any>);
  const ventasEfectivo = ventasCompletas.reduce((sum: number, venta: Record<string, any>) => sum + (efectivoVenta(venta) ?? fail("failed-precondition", "PAGO_INVALIDO")), 0);
  const ventasTotales = ventasCompletas.reduce((sum: number, venta: Record<string, any>) => sum + (totalVenta(venta) ?? fail("failed-precondition", "PAGO_INVALIDO")), 0);
  const totalEgresos = lineas(egresos).reduce((sum: number, snap: any) => {
    const data = snap.data();
    return data?.estado === "anulado" ? sum : sum + (money(data?.monto) ? data.monto : fail("failed-precondition", "EGRESO_INVALIDO"));
  }, 0);
  if (relevoCajeroId !== undefined && (relevoCajeroId === actorUid || !membresiaRelevoValida(relevoMembresia?.data(), empresaId, relevoCajeroId as string) || !text(relevoUsuario?.data()?.nombre) || relevoLockSnap?.exists || lineas(relevoTurnos).length)) {
    fail("failed-precondition", "RELEVO_NO_DISPONIBLE");
  }
  const ids: string[] = [];
  let saldoCajaTrasDeposito = caja.saldo;
  if (deposit > 0) {
    const out = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:deposito:origen`, account: caja, tipo: "egreso", monto: deposit, categoria: "cierre_deposito", actorUid, rol, turnoId: turnoId as string, actualizarSaldo: false, validarFondos: false });
    const inn = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:deposito:destino`, account: fuerte, tipo: "ingreso", monto: deposit, categoria: "cierre_deposito", actorUid, rol, turnoId: turnoId as string, movimientoRelacionadoId: out.id, actualizarSaldo: false });
    saldoCajaTrasDeposito = out.saldo;
    ids.push(out.id, inn.id);
  }
  if (difference !== 0) {
    const adjustment = writeMovement(tx, db, { empresaId, command: input, key: `cierre:${turnoId as string}:${input.commandId}:${difference < 0 ? "faltante" : "sobrante"}`, account: { ...caja, saldo: saldoCajaTrasDeposito }, tipo: difference < 0 ? "egreso" : "ingreso", monto: Math.abs(difference), categoria: difference < 0 ? "faltante_caja" : "sobrante_caja", actorUid, rol, turnoId: turnoId as string, actualizarSaldo: false, validarFondos: false });
    ids.push(adjustment.id);
  }
  tx.update(caja.ref, { saldo: finalSaldo });
  tx.update(fuerte.ref, { saldo: fuerte.saldo + deposit });
  tx.update(turnoRef, { estado: "cerrado", fechaCierre: FieldValue.serverTimestamp(), ventasEfectivo, ventasOtrosMetodos: ventasTotales - ventasEfectivo, totalEgresos, totalReportadoEfectivo: contado, totalEsperadoEfectivo: esperado, diferenciaEfectivo: difference, depositoNeto: deposit, conteoDetalle: input.payload.conteoDetalle ?? null, notasCierre, esCierreDefinitivo: relevoCajeroId === undefined, umbralAlertaFaltante, alertaFaltante });
  tx.delete(lock);
  let relevoTurnoId: string | null = null;
  if (relevoCajeroId !== undefined) {
    const relevoTurno = db.collection("turnos").doc();
    relevoTurnoId = relevoTurno.id;
    tx.create(relevoTurno, { id: relevoTurno.id, empresaId, cajeroId: relevoCajeroId, cajeroNombre: relevoUsuario.data().nombre.trim(), fechaApertura: FieldValue.serverTimestamp(), estado: "abierto", baseApertura: base, notasApertura: null });
    tx.create(relevoLock!, { empresaId, cajeroId: relevoCajeroId, turnoId: relevoTurno.id, fechaApertura: FieldValue.serverTimestamp() });
  }
  return { commandId: input.commandId, turnoId: turnoId as string, movimientos: ids, efectivoEsperado: esperado, diferenciaEfectivo: difference, depositoNeto: deposit, relevoCajeroId: relevoCajeroId ?? null, relevoTurnoId };
}

export async function ejecutarCerrarTurnoOperativoV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "cerrarTurnoOperativoV1", efectoCerrarTurnoOperativo);
}
