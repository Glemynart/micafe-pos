import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { evaluarReadinessConfiguracion, type ConfiguracionEmpresa } from "../../../lib/configuracion";
import { evaluarDisponibilidadVentaDemostracion, evaluarReadinessTotal } from "../../../lib/onboarding/contrato";
import { fechaFiscalActualUtc, fechaFiscalEnRango, rangoVigenciaFiscalValido, scopeEmpresa, scopeEspacio, validarIdFiscal, validarScopeFiscal, type EstadoNumeracion, type ScopeFiscal, type SnapshotFiscal, type TipoDocumentoFiscal, type Numeracion, type Asignacion } from "../../../lib/fiscal/contrato";
import type { PlanVersion, Suscripcion } from "../../../lib/suscripciones/contrato";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = (prefix: string, empresaId: string, value: string) => `${prefix}_${empresaId}_${hash(value)}`;
function sinUndefined<T>(value: T): T { if (Array.isArray(value)) return value.map(sinUndefined) as T; if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, sinUndefined(v)])) as T; return value; }
const fail = (code: "invalid-argument" | "failed-precondition" | "already-exists" | "not-found", message: string): never => { throw new HttpsError(code, message); };
const estados: readonly EstadoNumeracion[] = ["BORRADOR", "HABILITADA", "PAUSADA", "AGOTADA", "VENCIDA", "REVOCADA"];
const tipos: readonly TipoDocumentoFiscal[] = ["pos", "electronica", "contingencia"];
export interface ContextoFiscal { empresaId: string; actorId: string; paisFiscal: string; origen: "ADMIN" | "SYSTEM"; rolEfectivo?: string; }
export interface Envelope { commandId: string; idempotencyKey: string; correlationId: string; causationId: string; expectedRevision: number; motivo?: string; }
export interface CrearNumeracion extends Envelope { numeracionId: string; tipoDocumento: TipoDocumentoFiscal; scope: ScopeFiscal; prefijo: string; resolucion: string; rangoInicio: number; rangoFin: number; vigenciaDesde: string; vigenciaHasta: string; }
export interface ConfirmarVentaFiscal extends Envelope { ventaId: string; espacioId?: string; tipoDocumento: TipoDocumentoFiscal; expectedAsignacionRevision: number; venta: Record<string, unknown> & { items: Array<Record<string, unknown>> }; }
export interface CrearVentaDemostracion extends Envelope { ventaId: string; espacioId?: string; venta: Record<string, unknown> & { items: Array<Record<string, unknown>> }; }

export function claveAsignacion(scope: ScopeFiscal, tipo: TipoDocumentoFiscal) { return `${scope}_${tipo}`; }
function validarNumeracion(input: Omit<Numeracion, "creadaEn" | "actualizadaEn">) {
  if (!validarIdFiscal(input.numeracionId) || !validarScopeFiscal(input.scope) || !tipos.includes(input.tipoDocumento) || !estados.includes(input.estado) || !input.prefijo || !input.resolucion || !Number.isInteger(input.rangoInicio) || !Number.isInteger(input.rangoFin) || input.rangoInicio > input.rangoFin || input.ultimoAsignado < input.rangoInicio - 1 || input.ultimoAsignado > input.rangoFin || !rangoVigenciaFiscalValido(input.vigenciaDesde, input.vigenciaHasta)) fail("invalid-argument", "NUMERACION_INVALIDA");
}
function validarEnvelope(e: Envelope) { if (!validarIdFiscal(e.commandId) || !e.idempotencyKey || !validarIdFiscal(e.correlationId) || !validarIdFiscal(e.causationId) || !Number.isInteger(e.expectedRevision) || e.expectedRevision < 1) fail("invalid-argument", "ENVELOPE_INVALIDO"); }
function validarEmpresa(data: FirebaseFirestore.DocumentData | undefined, contexto: ContextoFiscal) { if (!data || data.paisFiscal !== contexto.paisFiscal || (data.estado !== "trial" && data.estado !== "activa")) fail("failed-precondition", "EMPRESA_NOT_WRITABLE"); }
function numeroDoc(db: Firestore, empresaId: string, numeracionId: string) { if (!validarIdFiscal(empresaId) || !validarIdFiscal(numeracionId)) fail("invalid-argument", "ID_FISCAL_INVALIDO"); return db.collection("numeraciones").doc(`${empresaId}_${numeracionId}`); }
function asignacionDoc(db: Firestore, empresaId: string, scope: ScopeFiscal, tipo: TipoDocumentoFiscal) { if (!validarIdFiscal(empresaId) || !validarScopeFiscal(scope) || !tipos.includes(tipo)) fail("invalid-argument", "ASIGNACION_ID_INVALIDO"); return db.collection("asignaciones_numeracion").doc(`${empresaId}_${claveAsignacion(scope, tipo)}`); }
function snapshot(config: ConfiguracionEmpresa, n: Numeracion, numero: number, items: Array<Record<string, unknown>>, venta: Record<string, unknown>): SnapshotFiscal {
  const lineas = items.map((item) => ({ id: String(item.id ?? ""), nombre: String(item.nombre ?? ""), codigo: item.codigo as string | undefined, cantidad: Number(item.cantidad), precioUnitario: Number(item.precioUnitario), subtotal: Number(item.subtotal), impuestoTipo: item.impuestoTipo as string | undefined, impuestoTarifa: item.impuestoTarifa as number | undefined, impuestoValor: item.impuestoValor as number | undefined, base: item.base as number | undefined }));
  const totales = (venta.totales ?? {}) as Record<string, unknown>; const pago = (venta.pago ?? {}) as Record<string, unknown>;
  return sinUndefined({ schemaVersion: 1, configuracionRevision: config.revision, identidadFiscal: { nombreComercial: config.identidadFiscal.nombreComercial, razonSocial: config.identidadFiscal.razonSocial, numeroDocumento: config.identidadFiscal.numeroDocumento, digitoVerificacion: config.identidadFiscal.digitoVerificacion, regimenTributario: config.identidadFiscal.regimenTributario, direccion: config.localizacion.direccion.linea1, ciudad: config.localizacion.direccion.municipioNombre, telefono: config.identidadFiscal.contacto.telefono }, paisFiscal: config.localizacion.paisFiscal, moneda: config.localizacion.moneda, impuestosLineas: lineas.map((item) => ({ itemId: item.id, impuestoTipo: item.impuestoTipo, impuestoTarifa: item.impuestoTarifa, impuestoValor: item.impuestoValor, base: item.base })), documento: { items: lineas, totales: { subtotalBase: Number(totales.subtotalBase), totalINC: Number(totales.totalINC), total: Number(totales.total) }, pago: { metodo: String(pago.metodo ?? venta.metodoPago ?? ""), recibido: pago.recibido as number | undefined, cambio: pago.cambio as number | undefined }, cliente: venta.cliente as SnapshotFiscal['documento']['cliente'] }, numeracion: { numeracionId: n.numeracionId, revision: n.revision, tipoDocumento: n.tipoDocumento, scope: n.scope, numero, prefijo: n.prefijo, resolucion: n.resolucion, rangoInicio: n.rangoInicio, rangoFin: n.rangoFin, vigenciaDesde: n.vigenciaDesde, vigenciaHasta: n.vigenciaHasta }, emitidaEn: FieldValue.serverTimestamp() });
}
function validarVentaParaSnapshot(venta: ConfirmarVentaFiscal["venta"]): void { const numero = (v: unknown, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min; if (venta.items.length === 0 || venta.items.some(item => !validarIdFiscal(item.id) || typeof item.nombre !== "string" || !item.nombre.trim() || !numero(item.cantidad, 0.000001) || !numero(item.precioUnitario) || !numero(item.subtotal) || !["excluido", "inc_8", "iva_19"].includes(String(item.impuestoTipo)) || !numero(item.impuestoTarifa) || !numero(item.impuestoValor) || !numero(item.base))) fail("invalid-argument", "LINEAS_FISCALES_INVALIDAS"); const t = venta.totales as Record<string, unknown> | undefined; if (!t || !numero(t.subtotalBase) || !numero(t.totalINC) || !numero(t.total)) fail("invalid-argument", "TOTALES_FISCALES_INVALIDOS"); const metodo = ((venta.pago as Record<string, unknown> | undefined)?.metodo ?? venta.metodoPago); if (typeof metodo !== "string" || !metodo.trim()) fail("invalid-argument", "PAGO_FISCAL_INVALIDO"); }

function numeroComercial(value: unknown, minimo = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimo;
}

function textoComercial(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sumaDeltasModificadores(value: unknown): number {
  if (value === undefined) return 0;
  const grupos: unknown[] = Array.isArray(value) ? value : fail("invalid-argument", "MODIFICADORES_INVALIDOS");
  let total = 0;
  for (const grupo of grupos) {
    if (!grupo || typeof grupo !== "object" || !Array.isArray((grupo as any).opciones)) fail("invalid-argument", "MODIFICADORES_INVALIDOS");
    for (const opcion of (grupo as any).opciones) {
      if (!opcion || !numeroComercial(opcion.precioDelta)) fail("invalid-argument", "MODIFICADORES_INVALIDOS");
      total += opcion.precioDelta;
    }
  }
  return total;
}

async function construirVentaDemostracion(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  empresaId: string,
  venta: CrearVentaDemostracion["venta"],
) {
  if (!textoComercial(venta.turnoId) || !textoComercial(venta.cajeroId) || venta.items.length === 0) fail("invalid-argument", "VENTA_DEMO_INVALIDA");
  const metodo = venta.metodoPago;
  if (!["efectivo", "transferencia", "tarjeta", "cuenta_cobro", "mixto"].includes(String(metodo))) fail("invalid-argument", "PAGO_DEMO_INVALIDO");
  if (metodo === "cuenta_cobro" && (!textoComercial(venta.clienteId) || !textoComercial(venta.clienteNombre))) fail("invalid-argument", "CLIENTE_CUENTA_COBRO_REQUERIDO");

  const items: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const item of venta.items) {
    if (!textoComercial(item.id) || !numeroComercial(item.cantidad, 1) || !numeroComercial(item.precioUnitario, 1) || !numeroComercial(item.subtotal, 1)) fail("invalid-argument", "ITEM_DEMO_INVALIDO");
    const cantidad = item.cantidad as number;
    const quick = (item.id as string).startsWith("quick-");
    const productoSnap = quick ? null : await tx.get(db.collection("productos").doc(item.id as string));
    const producto = productoSnap?.exists ? productoSnap.data() as Record<string, unknown> : undefined;
    if (!quick && (!productoSnap?.exists || producto?.empresaId !== empresaId || producto?.activo === false)) fail("failed-precondition", "ARTICULO_NO_ENCONTRADO");
    if (quick && !textoComercial(item.nombre)) fail("invalid-argument", "ITEM_DEMO_INVALIDO");

    const precioBase = item.precioBaseUnitario ?? item.precioUnitario;
    const precioCatalogo = producto?.precio;
    const deltaModificadores = sumaDeltasModificadores(item.modificadores);
    if (producto && (!numeroComercial(precioCatalogo, 1) || precioBase !== precioCatalogo || item.precioUnitario !== precioCatalogo + deltaModificadores)) {
      fail("failed-precondition", "PRECIO_DEMO_DESACTUALIZADO");
    }
    if ((item.subtotal as number) !== (item.precioUnitario as number) * cantidad) fail("invalid-argument", "SUBTOTAL_DEMO_INVALIDO");
    total += item.subtotal as number;
    const costoUnitario = producto?.costo ?? item.costoUnitario ?? 0;
    if (!numeroComercial(costoUnitario)) fail("invalid-argument", "ITEM_DEMO_INVALIDO");

    items.push(sinUndefined({
      id: item.id,
      nombre: producto?.nombre ?? item.nombre,
      cantidad,
      precioUnitario: item.precioUnitario,
      costoUnitario,
      subtotal: item.subtotal,
      codigo: item.codigo ?? item.id,
      categoria: producto?.categoriaId ?? item.categoria ?? null,
      schemaVersion: item.schemaVersion,
      configurationKey: item.configurationKey,
      precioBaseUnitario: item.precioBaseUnitario,
      modificadores: item.modificadores,
    }));
  }

  if (!numeroComercial(total, 1)) fail("invalid-argument", "TOTAL_DEMO_INVALIDO");
  if (metodo === "mixto") {
    const detalle = Array.isArray(venta.pagoMixtoDetalle) ? venta.pagoMixtoDetalle : fail("invalid-argument", "PAGO_DEMO_INVALIDO");
    if (detalle.length === 0) fail("invalid-argument", "PAGO_DEMO_INVALIDO");
    const suma = detalle.reduce((acumulado: number, pago: any) => {
      if (!pago || !["efectivo", "transferencia", "tarjeta"].includes(String(pago.metodo)) || !numeroComercial(pago.monto, 1)) fail("invalid-argument", "PAGO_DEMO_INVALIDO");
      return acumulado + pago.monto;
    }, 0);
    if (suma !== total) fail("invalid-argument", "PAGO_DEMO_INVALIDO");
  }

  return {
    items,
    totales: { subtotalBase: total, totalINC: 0, totalExcluido: total, total },
    estado: metodo === "cuenta_cobro" ? "pendiente" : "pagada",
    total,
  };
}

type ResultadoVentaDemostracion = {
  ventaId: string;
  modoOperacion: "DEMO";
  referenciaOperacion: string;
};

export async function crearVentaDemostracion(
  db: Firestore,
  entrada: CrearVentaDemostracion,
  contexto: ContextoFiscal,
) {
  validarEnvelope(entrada);
  const rolEfectivo = typeof contexto.rolEfectivo === "string" && contexto.rolEfectivo
    ? contexto.rolEfectivo
    : fail("failed-precondition", "CONTEXTO_OPERATIVO_INVALIDO");
  if (!validarIdFiscal(entrada.ventaId) || (entrada.espacioId !== undefined && !validarIdFiscal(entrada.espacioId)) || !entrada.venta || !Array.isArray(entrada.venta.items)) {
    fail("invalid-argument", "VENTA_DEMO_INVALIDA");
  }

  const fingerprint = hash(entrada);
  const resultado = await db.runTransaction(async tx => {
    const previo = await deduplicar<ResultadoVentaDemostracion>(db, tx, contexto, entrada, fingerprint);
    if (previo) return { resultado: previo, idempotente: true };

    const [empresaSnap, configSnap, suscripcionSnap, ventaSnap, numeracionesSnap, asignacionesSnap] = await Promise.all([
      tx.get(db.collection("empresas").doc(contexto.empresaId)),
      tx.get(db.collection("configuraciones").doc(contexto.empresaId)),
      tx.get(db.collection("suscripciones").doc(contexto.empresaId)),
      tx.get(db.collection("ventas").doc(entrada.ventaId)),
      tx.get(db.collection("numeraciones").where("empresaId", "==", contexto.empresaId)),
      tx.get(db.collection("asignaciones_numeracion").where("empresaId", "==", contexto.empresaId)),
    ]);
    validarEmpresa(empresaSnap.data(), contexto);
    if (ventaSnap.exists) {
      if (ventaSnap.data()?.modoOperacion === "DEMO") fail("already-exists", "VENTA_DEMO_EXISTS");
      fail("already-exists", "VENTA_ALREADY_EXISTS");
    }
    if (!configSnap.exists) fail("failed-precondition", "CONFIG_NOT_FOUND");
    const empresa = empresaSnap.data() as Record<string, unknown>;
    const suscripcion = suscripcionSnap.exists ? suscripcionSnap.data() as Suscripcion : undefined;
    const planSnap = suscripcion
      ? await tx.get(db.collection("planes").doc(suscripcion.planId).collection("versiones").doc(String(suscripcion.planVersion)))
      : undefined;
    const plan = planSnap?.exists ? planSnap.data() as PlanVersion : undefined;
    const config = configSnap.data() as ConfiguracionEmpresa;
    const readinessConfiguracion = evaluarReadinessConfiguracion(config, {
      empresaId: contexto.empresaId,
      paisFiscalEmpresa: contexto.paisFiscal,
    });
    const readinessTotal = evaluarReadinessTotal(
      config,
      numeracionesSnap.docs.map((snap: FirebaseFirestore.QueryDocumentSnapshot) => snap.data() as Numeracion),
      asignacionesSnap.docs.map((snap: FirebaseFirestore.QueryDocumentSnapshot) => snap.data() as Asignacion),
      { empresaId: contexto.empresaId, paisFiscalEmpresa: contexto.paisFiscal },
    );
    const readinessFiscal = readinessConfiguracion.fiscal.lista && readinessTotal.detalles.numeracion.lista;
    const disponibilidad = evaluarDisponibilidadVentaDemostracion(
      String(empresa.estado ?? ""),
      suscripcion,
      plan,
      readinessFiscal,
    );
    if (!disponibilidad.disponible) fail("failed-precondition", `VENTA_DEMO_NO_DISPONIBLE:${disponibilidad.causa}`);

    const construida = await construirVentaDemostracion(tx, db, contexto.empresaId, entrada.venta);
    const referenciaOperacion = `DEMO-${entrada.ventaId}`;
    const ventaCanonica = sinUndefined({
      empresaId: contexto.empresaId,
      espacioId: entrada.espacioId ?? null,
      turnoId: entrada.venta.turnoId,
      cajeroId: contexto.actorId,
      cajeroNombre: entrada.venta.cajeroNombre,
      rolCajeroSnapshot: rolEfectivo,
      clienteId: entrada.venta.clienteId,
      clienteNombre: entrada.venta.clienteNombre,
      clienteDocumento: entrada.venta.clienteDocumento,
      notasFiado: entrada.venta.notasFiado,
      pedidoId: entrada.venta.pedidoId,
      items: construida.items,
      totales: construida.totales,
      metodoPago: entrada.venta.metodoPago ?? (entrada.venta.pago as Record<string, unknown> | undefined)?.metodo,
      pago: {
        metodo: entrada.venta.metodoPago ?? (entrada.venta.pago as Record<string, unknown> | undefined)?.metodo,
        recibido: entrada.venta.dineroRecibido,
        cambio: entrada.venta.cambio,
      },
      pagoMixtoDetalle: entrada.venta.pagoMixtoDetalle,
      estado: construida.estado,
      modoOperacion: "DEMO",
      referenciaOperacion,
      estadoOperativo: "PENDIENTE_EFECTOS",
      fecha: FieldValue.serverTimestamp(),
    });
    tx.create(db.collection("ventas").doc(entrada.ventaId), ventaCanonica);
    const confirmado: ResultadoVentaDemostracion = {
      ventaId: entrada.ventaId,
      modoOperacion: "DEMO",
      referenciaOperacion,
    };
    registrar(db, tx, contexto, entrada, fingerprint, confirmado, "VentaDemostracionCreada", "VENTA", 0, 1, {
      ventaId: entrada.ventaId,
      actorOriginal: { uid: contexto.actorId, rolEfectivo },
    });
    return { resultado: confirmado, idempotente: false };
  });

  return { ...resultado.resultado, idempotente: resultado.idempotente };
}
async function deduplicar<T>(db: Firestore, tx: FirebaseFirestore.Transaction, contexto: ContextoFiscal, e: Envelope, fingerprint: string): Promise<T | undefined> { const ref = db.collection("fiscal_comandos").doc(id("fiscalcmd", contexto.empresaId, e.idempotencyKey)); const commandIdRef = db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(e.commandId)}`); const [snap, commandIdSnap] = await Promise.all([tx.get(ref), tx.get(commandIdRef)]); for (const existente of [commandIdSnap, snap]) { if (!existente.exists) continue; const data = existente.data()!; if (data.empresaId !== contexto.empresaId || data.commandId !== e.commandId || data.idempotencyKey !== e.idempotencyKey || data.fingerprint !== fingerprint) fail("already-exists", existente === commandIdSnap ? "COMMAND_ID_CONFLICT" : "IDEMPOTENCY_CONFLICT"); return data.resultado as T; } return undefined; }
function registrarHecho(db: Firestore, tx: FirebaseFirestore.Transaction, contexto: ContextoFiscal, e: Envelope, tipo: string, agregado: string, anterior: number, nueva: number, sufijo = "") { const clave = `${e.commandId}${sufijo}`; const auditId = id("fiscalaudit", contexto.empresaId, clave); const eventId = id("fiscalevent", contexto.empresaId, clave); tx.create(db.collection("auditoria_logs").doc(auditId), { empresaId: contexto.empresaId, agregado, comando: tipo, commandId: e.commandId, idempotencyKey: e.idempotencyKey, correlationId: e.correlationId, causationId: e.causationId, actorId: contexto.actorId, origen: contexto.origen, motivo: e.motivo ?? null, revisionAnterior: anterior, revisionNueva: nueva, creadoEn: FieldValue.serverTimestamp() }); tx.create(db.collection("eventos_dominio").doc(eventId), { eventId, tipo, version: 1, empresaId: contexto.empresaId, agregado, revisionAnterior: anterior, revisionNueva: nueva, actorId: contexto.actorId, origen: contexto.origen, commandId: e.commandId, correlationId: e.correlationId, causationId: e.causationId, creadoEn: FieldValue.serverTimestamp() }); }
function registrarComando(db: Firestore, tx: FirebaseFirestore.Transaction, contexto: ContextoFiscal, e: Envelope, fingerprint: string, resultado: unknown, confirmacion?: { ventaId: string; actorOriginal: { uid: string; rolEfectivo: string } }) { const comando = { empresaId: contexto.empresaId, commandId: e.commandId, idempotencyKey: e.idempotencyKey, fingerprint, resultado, creadoEn: FieldValue.serverTimestamp() }; tx.create(db.collection("fiscal_comandos").doc(id("fiscalcmd", contexto.empresaId, e.idempotencyKey)), confirmacion ? { ...comando, ...confirmacion, correlationId: e.correlationId, causationId: e.causationId } : comando); tx.create(db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(e.commandId)}`), comando); }
function registrar(db: Firestore, tx: FirebaseFirestore.Transaction, contexto: ContextoFiscal, e: Envelope, fingerprint: string, resultado: unknown, tipo: string, agregado: string, anterior: number, nueva: number, confirmacion?: { ventaId: string; actorOriginal: { uid: string; rolEfectivo: string } }) { registrarComando(db, tx, contexto, e, fingerprint, resultado, confirmacion); registrarHecho(db, tx, contexto, e, tipo, agregado, anterior, nueva); }

export async function crearNumeracion(db: Firestore, entrada: CrearNumeracion, contexto: ContextoFiscal) { validarEnvelope(entrada); const fingerprint = hash(entrada); return db.runTransaction(async tx => { const existente = await deduplicar<{ numeracionId: string }>(db, tx, contexto, entrada, fingerprint); if (existente) return { ...existente, idempotente: true }; const empresa = await tx.get(db.collection("empresas").doc(contexto.empresaId)); validarEmpresa(empresa.data(), contexto); const ref = numeroDoc(db, contexto.empresaId, entrada.numeracionId); if ((await tx.get(ref)).exists) fail("already-exists", "NUMERACION_EXISTS"); const n: Numeracion = { empresaId: contexto.empresaId, numeracionId: entrada.numeracionId, paisFiscal: contexto.paisFiscal, tipoDocumento: entrada.tipoDocumento, scope: entrada.scope, prefijo: entrada.prefijo, resolucion: entrada.resolucion, rangoInicio: entrada.rangoInicio, rangoFin: entrada.rangoFin, ultimoAsignado: entrada.rangoInicio - 1, vigenciaDesde: entrada.vigenciaDesde, vigenciaHasta: entrada.vigenciaHasta, estado: "BORRADOR", revision: 1, schemaVersion: 1, creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() }; validarNumeracion(n); tx.create(ref, n); const resultado = { numeracionId: n.numeracionId, revision: 1 }; registrar(db, tx, contexto, entrada, fingerprint, resultado, "NumeracionCreada", "NUMERACION", 0, 1); return { ...resultado, idempotente: false }; }); }
export async function transicionarNumeracion(db: Firestore, entrada: Envelope & { numeracionId: string; accion: "HABILITAR" | "PAUSAR" | "REANUDAR" | "REVOCAR" }, contexto: ContextoFiscal) { validarEnvelope(entrada); const objetivo: Record<typeof entrada.accion, EstadoNumeracion> = { HABILITAR: "HABILITADA", PAUSAR: "PAUSADA", REANUDAR: "HABILITADA", REVOCAR: "REVOCADA" }; const permitidos: Record<EstadoNumeracion, EstadoNumeracion[]> = { BORRADOR: ["HABILITADA", "REVOCADA"], HABILITADA: ["PAUSADA", "REVOCADA"], PAUSADA: ["HABILITADA", "REVOCADA"], AGOTADA: [], VENCIDA: [], REVOCADA: [] }; const fingerprint = hash(entrada); return db.runTransaction(async tx => { const previo = await deduplicar<{ revision: number }>(db, tx, contexto, entrada, fingerprint); if (previo) return { ...previo, idempotente: true }; const ref = numeroDoc(db, contexto.empresaId, entrada.numeracionId); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "NUMERACION_NOT_FOUND"); const n = snap.data() as Numeracion; if (n.revision !== entrada.expectedRevision || !permitidos[n.estado].includes(objetivo[entrada.accion])) fail("failed-precondition", "NUMERACION_TRANSITION_INVALID"); if ((entrada.accion === "HABILITAR" || entrada.accion === "REANUDAR") && (!fechaFiscalEnRango(fechaFiscalActualUtc(), n.vigenciaDesde, n.vigenciaHasta) || n.ultimoAsignado >= n.rangoFin)) fail("failed-precondition", "NUMERACION_NOT_EMITTABLE"); const siguiente = n.revision + 1; tx.update(ref, { estado: objetivo[entrada.accion], revision: siguiente, actualizadaEn: FieldValue.serverTimestamp() }); const resultado = { revision: siguiente }; registrar(db, tx, contexto, entrada, fingerprint, resultado, objetivo[entrada.accion] === "HABILITADA" ? "NumeracionHabilitada" : objetivo[entrada.accion] === "PAUSADA" ? "NumeracionPausada" : "NumeracionRevocada", "NUMERACION", n.revision, siguiente); return { ...resultado, idempotente: false }; }); }
export async function establecerAsignacion(db: Firestore, entrada: Envelope & { scope: ScopeFiscal; tipoDocumento: TipoDocumentoFiscal; numeracionId: string }, contexto: ContextoFiscal) { validarEnvelope(entrada); const fingerprint = hash(entrada); return db.runTransaction(async tx => { const previo = await deduplicar<{ revision: number }>(db, tx, contexto, entrada, fingerprint); if (previo) return { ...previo, idempotente: true }; const [empresa, nSnap, aSnap] = await Promise.all([tx.get(db.collection("empresas").doc(contexto.empresaId)), tx.get(numeroDoc(db, contexto.empresaId, entrada.numeracionId)), tx.get(asignacionDoc(db, contexto.empresaId, entrada.scope, entrada.tipoDocumento))]); validarEmpresa(empresa.data(), contexto); if (!nSnap.exists) fail("not-found", "NUMERACION_NOT_FOUND"); const n = nSnap.data() as Numeracion; if (n.estado !== "HABILITADA" || n.scope !== entrada.scope || n.tipoDocumento !== entrada.tipoDocumento || n.paisFiscal !== contexto.paisFiscal) fail("failed-precondition", "NUMERACION_ASSIGNMENT_INVALID"); const anterior = aSnap.exists ? aSnap.data() as Asignacion : undefined; if (anterior && anterior.revision !== entrada.expectedRevision) fail("failed-precondition", "ASIGNACION_REVISION_CONFLICT"); const revision = (anterior?.revision ?? 0) + 1; const asignacion: Asignacion = { empresaId: contexto.empresaId, scope: entrada.scope, tipoDocumento: entrada.tipoDocumento, numeracionId: entrada.numeracionId, estado: "VIGENTE", revision, schemaVersion: 1, actualizadaEn: FieldValue.serverTimestamp() }; tx.set(asignacionDoc(db, contexto.empresaId, entrada.scope, entrada.tipoDocumento), asignacion); const resultado = { revision }; registrar(db, tx, contexto, entrada, fingerprint, resultado, anterior ? "AsignacionNumeracionReemplazada" : "AsignacionNumeracionEstablecida", "ASIGNACION_NUMERACION", anterior?.revision ?? 0, revision); return { ...resultado, idempotente: false }; }); }
export async function retirarAsignacion(db: Firestore, entrada: Envelope & { scope: ScopeFiscal; tipoDocumento: TipoDocumentoFiscal }, contexto: ContextoFiscal) { validarEnvelope(entrada); const fingerprint = hash(entrada); return db.runTransaction(async tx => { const previo = await deduplicar<{ revision: number }>(db, tx, contexto, entrada, fingerprint); if (previo) return { ...previo, idempotente: true }; const ref = asignacionDoc(db, contexto.empresaId, entrada.scope, entrada.tipoDocumento); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "ASIGNACION_NOT_FOUND"); const actual = snap.data() as Asignacion; if (actual.revision !== entrada.expectedRevision) fail("failed-precondition", "ASIGNACION_REVISION_CONFLICT"); if (actual.estado === "RETIRADA") { const resultado = { revision: actual.revision }; registrarComando(db, tx, contexto, entrada, fingerprint, resultado); return { ...resultado, idempotente: true }; } const revision = actual.revision + 1; tx.update(ref, { estado: "RETIRADA", revision, actualizadaEn: FieldValue.serverTimestamp() }); const resultado = { revision }; registrar(db, tx, contexto, entrada, fingerprint, resultado, "AsignacionNumeracionRetirada", "ASIGNACION_NUMERACION", actual.revision, revision); return { ...resultado, idempotente: false }; }); }
export async function actualizarNumeracionBorrador(db: Firestore, entrada: CrearNumeracion & { expectedRevision: number }, contexto: ContextoFiscal) { validarEnvelope(entrada); const fingerprint = hash(entrada); return db.runTransaction(async tx => { const previo = await deduplicar<{ revision: number }>(db, tx, contexto, entrada, fingerprint); if (previo) return { ...previo, idempotente: true }; const ref = numeroDoc(db, contexto.empresaId, entrada.numeracionId); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "NUMERACION_NOT_FOUND"); const actual = snap.data() as Numeracion; if (actual.estado !== "BORRADOR" || actual.revision !== entrada.expectedRevision || actual.ultimoAsignado !== actual.rangoInicio - 1) fail("failed-precondition", "NUMERACION_DRAFT_LOCKED"); const siguiente: Numeracion = { ...actual, tipoDocumento: entrada.tipoDocumento, scope: entrada.scope, prefijo: entrada.prefijo, resolucion: entrada.resolucion, rangoInicio: entrada.rangoInicio, rangoFin: entrada.rangoFin, ultimoAsignado: entrada.rangoInicio - 1, vigenciaDesde: entrada.vigenciaDesde, vigenciaHasta: entrada.vigenciaHasta, revision: actual.revision + 1, actualizadaEn: FieldValue.serverTimestamp() }; validarNumeracion(siguiente); tx.set(ref, siguiente); const resultado = { revision: siguiente.revision }; registrar(db, tx, contexto, entrada, fingerprint, resultado, "NumeracionActualizada", "NUMERACION", actual.revision, siguiente.revision); return { ...resultado, idempotente: false }; }); }
type ResultadoConfirmacion = { estado: "CONFIRMADA"; ventaId: string; numero: number; prefijo: string } | { estado: "RECHAZADA"; codigo: "NUMERACION_VENCIDA" | "NUMERACION_AGOTADA" };
export async function confirmarVentaFiscal(db: Firestore, entrada: ConfirmarVentaFiscal, contexto: ContextoFiscal) {
  validarEnvelope(entrada);
  const rolEfectivo = typeof contexto.rolEfectivo === "string" && contexto.rolEfectivo
    ? contexto.rolEfectivo
    : fail("failed-precondition", "CONTEXTO_OPERATIVO_INVALIDO");
  if (!validarIdFiscal(entrada.ventaId) || (entrada.espacioId !== undefined && !validarIdFiscal(entrada.espacioId)) || !tipos.includes(entrada.tipoDocumento) || !Number.isInteger(entrada.expectedAsignacionRevision) || entrada.expectedAsignacionRevision < 1 || !Array.isArray(entrada.venta.items)) fail("invalid-argument", "VENTA_FISCAL_INVALIDA");
  validarVentaParaSnapshot(entrada.venta);
  const fingerprint = hash(entrada);
  const resultado = await db.runTransaction(async tx => {
    const previo = await deduplicar<ResultadoConfirmacion>(db, tx, contexto, entrada, fingerprint);
    if (previo) return { resultado: previo, idempotente: true };
    const exacto = entrada.espacioId ? scopeEspacio(entrada.espacioId) : undefined;
    const scopes = exacto ? [exacto, scopeEmpresa()] : [scopeEmpresa()];
    const [empresaSnap, configSnap, ventaSnap, ...asignaciones] = await Promise.all([
      tx.get(db.collection("empresas").doc(contexto.empresaId)),
      tx.get(db.collection("configuraciones").doc(contexto.empresaId)),
      tx.get(db.collection("ventas").doc(entrada.ventaId)),
      ...scopes.map(scope => tx.get(asignacionDoc(db, contexto.empresaId, scope, entrada.tipoDocumento))),
    ]);
    validarEmpresa(empresaSnap.data(), contexto);
    if (!configSnap.exists) fail("failed-precondition", "CONFIG_NOT_FOUND");
    if (ventaSnap.exists) {
      if (ventaSnap.data()?.modoOperacion === "DEMO") fail("failed-precondition", "VENTA_DEMO_NO_FISCALIZABLE");
      fail("already-exists", "VENTA_ALREADY_EXISTS");
    }
    const asignacion = asignaciones.map(s => s.exists ? s.data() as Asignacion : undefined).find(a => a?.estado === "VIGENTE");
    if (!asignacion) fail("failed-precondition", "ASIGNACION_NOT_FOUND");
    const asignacionVigente = asignacion as Asignacion;
    if (asignacionVigente.revision !== entrada.expectedAsignacionRevision) fail("failed-precondition", "ASIGNACION_REVISION_CONFLICT");
    const nRef = numeroDoc(db, contexto.empresaId, asignacionVigente.numeracionId);
    const nSnap = await tx.get(nRef);
    if (!nSnap.exists) fail("failed-precondition", "NUMERACION_NOT_FOUND");
    const n = nSnap.data() as Numeracion;
    if (n.revision !== entrada.expectedRevision) fail("failed-precondition", "NUMERACION_REVISION_CONFLICT");
    if (n.empresaId !== contexto.empresaId || n.scope !== asignacionVigente.scope || n.tipoDocumento !== entrada.tipoDocumento || n.estado !== "HABILITADA" || n.paisFiscal !== contexto.paisFiscal) fail("failed-precondition", "NUMERACION_INVALIDA");
    const config = configSnap.data() as ConfiguracionEmpresa;
    if (!evaluarReadinessConfiguracion(config, { empresaId: contexto.empresaId, paisFiscalEmpresa: contexto.paisFiscal }).fiscal.lista) fail("failed-precondition", "READINESS_FISCAL_INCOMPLETA");
    const hoy = fechaFiscalActualUtc();
    if (!rangoVigenciaFiscalValido(n.vigenciaDesde, n.vigenciaHasta)) fail("failed-precondition", "NUMERACION_INVALIDA");
    if (hoy > n.vigenciaHasta) {
      const rechazado: ResultadoConfirmacion = { estado: "RECHAZADA", codigo: "NUMERACION_VENCIDA" };
      tx.update(nRef, { estado: "VENCIDA", revision: n.revision + 1, actualizadaEn: FieldValue.serverTimestamp() });
      registrar(db, tx, contexto, entrada, fingerprint, rechazado, "NumeracionVencida", "NUMERACION", n.revision, n.revision + 1);
      return { resultado: rechazado, idempotente: false };
    }
    if (hoy < n.vigenciaDesde) fail("failed-precondition", "NUMERACION_NO_VIGENTE");
    const numero = n.ultimoAsignado + 1;
    if (numero > n.rangoFin) {
      const rechazado: ResultadoConfirmacion = { estado: "RECHAZADA", codigo: "NUMERACION_AGOTADA" };
      tx.update(nRef, { estado: "AGOTADA", revision: n.revision + 1, actualizadaEn: FieldValue.serverTimestamp() });
      registrar(db, tx, contexto, entrada, fingerprint, rechazado, "NumeracionAgotada", "NUMERACION", n.revision, n.revision + 1);
      return { resultado: rechazado, idempotente: false };
    }
    const siguienteEstado: EstadoNumeracion = numero === n.rangoFin ? "AGOTADA" : "HABILITADA";
    const fiscalSnapshot = snapshot(config, n, numero, entrada.venta.items, entrada.venta);
    tx.update(nRef, { ultimoAsignado: numero, estado: siguienteEstado, revision: n.revision + 1, actualizadaEn: FieldValue.serverTimestamp() });
    tx.create(db.collection("ventas").doc(entrada.ventaId), sinUndefined({ ...entrada.venta, empresaId: contexto.empresaId, espacioId: entrada.espacioId ?? null, consecutivo: numero, snapshotFiscal: fiscalSnapshot, estadoOperativo: "PENDIENTE_EFECTOS", fecha: FieldValue.serverTimestamp() }));
    const confirmado: ResultadoConfirmacion = { estado: "CONFIRMADA", ventaId: entrada.ventaId, numero, prefijo: n.prefijo };
    registrar(db, tx, contexto, entrada, fingerprint, confirmado, "VentaFiscalConfirmada", "VENTA", 0, 1, { ventaId: entrada.ventaId, actorOriginal: { uid: contexto.actorId, rolEfectivo } });
    if (siguienteEstado === "AGOTADA") registrarHecho(db, tx, contexto, entrada, "NumeracionAgotada", "NUMERACION", n.revision, n.revision + 1, ":agotada");
    return { resultado: confirmado, idempotente: false };
  });
  if (resultado.resultado.estado === "RECHAZADA") fail("failed-precondition", resultado.resultado.codigo);
  const confirmada = resultado.resultado as Extract<ResultadoConfirmacion, { estado: "CONFIRMADA" }>;
  return { ventaId: confirmada.ventaId, numero: confirmada.numero, prefijo: confirmada.prefijo, idempotente: resultado.idempotente };
}
