import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "../platform/authorization";
import { createHash } from "node:crypto";
import { fechaBogota, PRIVACY_CALENDAR_VERSION, sumarHabiles } from "./privacy-calendar";

const FACULTAD = "PRIVACIDAD_RECLAMOS_TRAMITAR";
const ID = /^[a-zA-Z0-9_-]{1,120}$/;
const ACCIONES = ["ABRIR", "CONSULTAR", "CERRAR", "DOCUMENTAR_RESPUESTA", "PRORROGAR"] as const;
type Accion = (typeof ACCIONES)[number];
type Actor = { uid: string; token: TokenPlataforma };

function denegar(): never {
  throw new HttpsError("permission-denied", "RECLAMO_NO_AUTORIZADO");
}

function entradaInvalida(): never {
  throw new HttpsError("invalid-argument", "RECLAMO_ENTRADA_INVALIDA");
}

function identificador(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) entradaInvalida();
  return value;
}

function textoBreve(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) entradaInvalida();
  return value.trim();
}

function fechaVerificada(value: unknown): Timestamp {
  if (typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) entradaInvalida();
  const millis = Date.parse(value + "T00:00:00-05:00");
  if (!Number.isFinite(millis) || fechaBogota(millis) !== value || millis > Date.now()) entradaInvalida();
  return Timestamp.fromMillis(millis);
}

const claveCaso = (empresaId: string, consecutivo: string) =>
  createHash("sha256").update(JSON.stringify([empresaId, consecutivo])).digest("hex");

async function recibir(db: Firestore, actor: Actor, data: Record<string, unknown>) {
  const { accion, empresaId, consecutivo, recibido, ...extra } = data;
  if (accion !== "RECIBIR" || Object.keys(extra).length) entradaInvalida();
  const tenant = identificador(empresaId);
  const radicado = identificador(consecutivo);
  const recibidoEn = fechaVerificada(recibido);
  const casoId = claveCaso(tenant, radicado);
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const existente = (await tx.get(casoRef)).data();
    if (existente) {
      if (existente.operadorUid !== actor.uid) denegar();
      if (!(existente.recibidoEn instanceof Timestamp) || !existente.recibidoEn.isEqual(recibidoEn)) {
        throw new HttpsError("already-exists", "RECLAMO_REGISTRO_DISTINTO");
      }
      return { casoId, estado: existente.estado as string };
    }
    if (!(await tx.get(db.collection("empresas").doc(tenant))).exists) denegar();
    tx.create(casoRef, {
      consecutivo: radicado, empresaId: tenant, operadorUid: actor.uid,
      estado: "RECIBIDO", recibidoEn, radicadoEn: FieldValue.serverTimestamp(),
      vencimientoRequerimiento: sumarHabiles(fechaBogota(recibidoEn.toMillis()), 5),
      calendarioVersion: PRIVACY_CALENDAR_VERSION,
    });
    return { casoId, estado: "RECIBIDO" };
  });
}

async function registrar(db: Firestore, actor: Actor, data: Record<string, unknown>) {
  const { accion, consecutivo, empresaId, clienteId, motivo, instruccionRef,
    identidadRef, recibido, completo, trasladoRef, verificacionConfirmada, ...extra } = data;
  if (accion !== "REGISTRAR" || Object.keys(extra).length || verificacionConfirmada !== true) entradaInvalida();
  const datos = {
    consecutivo: identificador(consecutivo), empresaId: identificador(empresaId),
    clienteId: identificador(clienteId), motivo: textoBreve(motivo),
    instruccionRef: identificador(instruccionRef), identidadRef: identificador(identidadRef),
    trasladoRef: identificador(trasladoRef),
  };
  const recibidoEn = fechaVerificada(recibido);
  const completoEn = fechaVerificada(completo);
  if (completoEn.toMillis() < recibidoEn.toMillis()) entradaInvalida();
  const casoId = claveCaso(datos.empresaId, datos.consecutivo);
  const huella = createHash("sha256").update(JSON.stringify([datos, recibido, completo])).digest("hex");
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const anterior = (await tx.get(casoRef)).data();
    if (anterior) {
      if (anterior.operadorUid !== actor.uid) denegar();
      if (anterior.estado !== "RECIBIDO") {
        if (anterior.huellaRegistro !== huella) throw new HttpsError("already-exists", "RECLAMO_REGISTRO_DISTINTO");
        return { casoId, estado: anterior.estado as string };
      }
      if (!(anterior.recibidoEn instanceof Timestamp) || !anterior.recibidoEn.isEqual(recibidoEn)) {
        throw new HttpsError("already-exists", "RECLAMO_REGISTRO_DISTINTO");
      }
    }
    const fichaRef = db.collection("clientes").doc(datos.clienteId);
    const ficha = (await tx.get(fichaRef)).data();
    if (!ficha || ficha.empresaId !== datos.empresaId || !(ficha.creadoEn instanceof Timestamp)) denegar();
    const abiertos: unknown = ficha.reclamosPrivacidadAbiertos ?? 0;
    if (typeof abiertos !== "number" || !Number.isSafeInteger(abiertos) || abiertos < 0
      || abiertos >= Number.MAX_SAFE_INTEGER) throw new HttpsError("failed-precondition", "RECLAMO_INDICADOR_INCONSISTENTE");
    const vencimientoAnotacion = sumarHabiles(fechaBogota(completoEn.toMillis()), 2);
    const vencimientoRespuesta = sumarHabiles(fechaBogota(recibidoEn.toMillis()), 15);
    const expediente = {
      ...datos, huellaRegistro: huella, operadorUid: actor.uid, identidadVerificada: true,
      fichaCreadaEn: ficha.creadoEn, recibidoEn, completoEn,
      vencimientoAnotacion, vencimientoRespuesta, calendarioVersion: PRIVACY_CALENDAR_VERSION,
      estado: "ABIERTO", anotadoEn: FieldValue.serverTimestamp(), verificadoEn: FieldValue.serverTimestamp(),
    };
    if (anterior) tx.update(casoRef, expediente);
    else tx.create(casoRef, expediente);
    tx.update(fichaRef, { reclamosPrivacidadAbiertos: abiertos + 1 });
    return { casoId, estado: "ABIERTO" };
  });
}

function normalizar(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "RECLAMO_ENTRADA_INVALIDA");
  }
  const { casoId, accion, respuestaRef, resultado, ...extra } = data as Record<string, unknown>;
  const requiereReferencia = accion === "CERRAR" || accion === "DOCUMENTAR_RESPUESTA" || accion === "PRORROGAR";
  if (Object.keys(extra).length || typeof casoId !== "string" || !ID.test(casoId)
    || !ACCIONES.includes(accion as Accion)
    || (requiereReferencia ? typeof respuestaRef !== "string" || !ID.test(respuestaRef) : respuestaRef !== undefined)) {
    throw new HttpsError("invalid-argument", "RECLAMO_ENTRADA_INVALIDA");
  }
  const documenta = accion === "DOCUMENTAR_RESPUESTA" || accion === "PRORROGAR";
  if (!documenta && resultado !== undefined) entradaInvalida();
  return { casoId, accion: accion as Accion, respuestaRef: respuestaRef as string | undefined,
    resultado: documenta ? textoBreve(resultado) : undefined };
}

/** La verificación documental se atestigua por el operador de privacidad.
 * La aplicación comprueba autoridad, trazabilidad y la ficha, no el medio externo. */
export async function tramitarReclamoPrivacidad(
  db: Firestore, actor: Actor, data: unknown,
) {
  if (data && typeof data === "object" && "accion" in data && data.accion === "REGISTRAR") {
    return registrar(db, actor, data as Record<string, unknown>);
  }
  if (data && typeof data === "object" && "accion" in data && data.accion === "RECIBIR") {
    return recibir(db, actor, data as Record<string, unknown>);
  }
  const { casoId, accion, respuestaRef, resultado } = normalizar(data);
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const caso = (await tx.get(casoRef)).data();
    if (caso?.estado === "RECIBIDO" && caso.operadorUid === actor.uid && accion === "CONSULTAR") {
      return { casoId, estado: "RECIBIDO", vencimientoRequerimiento: caso.vencimientoRequerimiento };
    }
    if (!caso || caso.operadorUid !== actor.uid || caso.identidadVerificada !== true
      || typeof caso.empresaId !== "string" || !ID.test(caso.empresaId)
      || typeof caso.clienteId !== "string" || !ID.test(caso.clienteId)
      || typeof caso.motivo !== "string" || !caso.motivo.trim() || caso.motivo.length > 500
      || typeof caso.instruccionRef !== "string" || !ID.test(caso.instruccionRef)
      || !["VERIFICADO", "ABIERTO", "RESUELTO"].includes(caso.estado)
      || !(caso.recibidoEn instanceof Timestamp)
      || !(caso.completoEn instanceof Timestamp)
      || caso.completoEn.toMillis() < caso.recibidoEn.toMillis()
      || caso.completoEn.toMillis() > Date.now()) denegar();

    if (accion === "CERRAR" && caso.estado === "RESUELTO") {
      if (caso.respuestaRef !== respuestaRef) {
        throw new HttpsError("already-exists", "RECLAMO_CIERRE_DISTINTO");
      }
      return { casoId, estado: "RESUELTO" };
    }
    if (accion === "CONSULTAR" && caso.estado === "RESUELTO") {
      return {
        casoId, clienteId: caso.clienteId, estado: caso.estado, leyenda: null, motivo: null,
        vencimientoAnotacion: caso.vencimientoAnotacion ?? sumarHabiles(fechaBogota(caso.completoEn.toMillis()), 2),
        vencimientoRespuesta: caso.vencimientoProrroga ?? caso.vencimientoRespuesta
          ?? sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 15),
        respuestaDocumentada: true,
      };
    }
    const fichaRef = db.collection("clientes").doc(caso.clienteId);
    const ficha = (await tx.get(fichaRef)).data();
    if (!ficha || ficha.empresaId !== caso.empresaId
      || !(caso.fichaCreadaEn instanceof Timestamp)
      || !(ficha.creadoEn instanceof Timestamp)
      || !ficha.creadoEn.isEqual(caso.fichaCreadaEn)) denegar();
    const abiertos: unknown = ficha.reclamosPrivacidadAbiertos ?? 0;
    if (typeof abiertos !== "number" || !Number.isSafeInteger(abiertos) || abiertos < 0
      || (caso.estado === "ABIERTO" && abiertos === 0)) {
      throw new HttpsError("failed-precondition", "RECLAMO_INDICADOR_INCONSISTENTE");
    }

    if (accion === "CONSULTAR") {
      return {
        casoId, clienteId: caso.clienteId, estado: caso.estado,
        leyenda: abiertos > 0 ? "reclamo en trámite" : null,
        motivo: caso.estado === "ABIERTO" ? caso.motivo : null,
        recibidoEnMillis: caso.recibidoEn.toMillis(),
        completoEnMillis: caso.completoEn.toMillis(),
        vencimientoAnotacion: caso.vencimientoAnotacion ?? sumarHabiles(fechaBogota(caso.completoEn.toMillis()), 2),
        vencimientoRespuesta: caso.vencimientoProrroga ?? caso.vencimientoRespuesta
          ?? sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 15),
        respuestaDocumentada: typeof caso.respuestaVerificadaRef === "string",
        respuestaRef: typeof caso.respuestaVerificadaRef === "string" ? caso.respuestaVerificadaRef : null,
      };
    }
    if (accion === "DOCUMENTAR_RESPUESTA" || accion === "PRORROGAR") {
      if (caso.estado !== "ABIERTO") throw new HttpsError("failed-precondition", "RECLAMO_ESTADO_INVALIDO");
      if (accion === "DOCUMENTAR_RESPUESTA") {
        if (caso.respuestaVerificadaRef && (caso.respuestaVerificadaRef !== respuestaRef
          || caso.resultadoVerificado !== resultado)) throw new HttpsError("already-exists", "RECLAMO_RESPUESTA_DISTINTA");
        if (!caso.respuestaVerificadaRef) tx.update(casoRef, {
          respuestaVerificadaRef: respuestaRef, resultadoVerificado: resultado, respuestaRegistradaEn: FieldValue.serverTimestamp(),
        });
      } else {
        if (caso.prorrogaRef === respuestaRef && caso.prorrogaMotivo === resultado) return { casoId, estado: "ABIERTO" };
        const vence: string = caso.vencimientoRespuesta ?? sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 15);
        if (caso.prorrogaRef || caso.respuestaVerificadaRef || fechaBogota(Date.now()) > vence) {
          throw new HttpsError("failed-precondition", "RECLAMO_PRORROGA_NO_DISPONIBLE");
        }
        tx.update(casoRef, { prorrogaRef: respuestaRef, prorrogaMotivo: resultado,
          prorrogaRegistradaEn: FieldValue.serverTimestamp(), vencimientoProrroga: sumarHabiles(vence, 8) });
      }
      return { casoId, estado: "ABIERTO" };
    }
    if (accion === "ABRIR" && caso.estado === "ABIERTO") return { casoId, estado: "ABIERTO" };
    const abrir = accion === "ABRIR";
    if (caso.estado !== (abrir ? "VERIFICADO" : "ABIERTO")) {
      throw new HttpsError("failed-precondition", "RECLAMO_ESTADO_INVALIDO");
    }
    if (!abrir && (caso.respuestaVerificadaRef !== respuestaRef
      || typeof caso.resultadoVerificado !== "string" || !caso.resultadoVerificado.trim()
      || caso.resultadoVerificado.length > 500)) denegar();
    const estado = abrir ? "ABIERTO" : "RESUELTO";
    tx.update(fichaRef, { reclamosPrivacidadAbiertos: abrir ? abiertos + 1 : abiertos - 1 });
    tx.update(casoRef, abrir
      ? { estado, anotadoEn: FieldValue.serverTimestamp() }
      : { estado, respuestaRef, resultado: caso.resultadoVerificado, cerradoEn: FieldValue.serverTimestamp() });
    return { casoId, estado };
  });
}
