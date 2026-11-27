import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "../platform/authorization";
import { createHash } from "node:crypto";
import {
  fechaBogota, PRIVACY_CALENDAR_V1, PRIVACY_CALENDAR_VERSION, sumarHabiles,
  vencimientoDosMeses, type PrivacyCalendarVersion,
} from "./privacy-calendar";

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

function fechaCivil(value: unknown): string {
  return fechaBogota(fechaVerificada(value).toMillis());
}

function versionCalendario(caso: FirebaseFirestore.DocumentData): PrivacyCalendarVersion {
  // Records created before versioning used the Monday-Friday V1 implementation.
  const version = caso.calendarioVersion === undefined ? PRIVACY_CALENDAR_V1 : caso.calendarioVersion;
  if (version !== PRIVACY_CALENDAR_V1 && version !== PRIVACY_CALENDAR_VERSION) {
    throw new HttpsError("failed-precondition", "RECLAMO_CALENDARIO_INVALIDO");
  }
  return version;
}

function vencimientoRequerimiento(caso: FirebaseFirestore.DocumentData, version: PrivacyCalendarVersion): string {
  if (!(caso.recibidoEn instanceof Timestamp)) denegar();
  const esperado = sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 5, version);
  if (caso.vencimientoRequerimiento !== undefined && caso.vencimientoRequerimiento !== esperado) {
    throw new HttpsError("failed-precondition", "RECLAMO_PLAZO_INCONSISTENTE");
  }
  return caso.vencimientoRequerimiento ?? esperado;
}

function requerimientoSubsanacion(caso: FirebaseFirestore.DocumentData) {
  const campos = [caso.fechaRequerimiento, caso.requerimientoRef, caso.requerimientoOperadorUid,
    caso.requerimientoRegistradoEn, caso.vencimientoSubsanacion];
  if (campos.every(value => value === undefined)) return undefined;
  const version = versionCalendario(caso);
  const fecha = typeof caso.fechaRequerimiento === "string" ? fechaCivil(caso.fechaRequerimiento) : "";
  const vencimiento = fecha ? vencimientoDosMeses(fecha, version) : "";
  if (!fecha || typeof caso.requerimientoRef !== "string" || !ID.test(caso.requerimientoRef)
    || caso.requerimientoOperadorUid !== caso.operadorUid
    || !(caso.requerimientoRegistradoEn instanceof Timestamp)
    || caso.vencimientoSubsanacion !== vencimiento
    || !(caso.recibidoEn instanceof Timestamp)
    || fecha < fechaBogota(caso.recibidoEn.toMillis())
    || fecha > vencimientoRequerimiento(caso, version)) {
    throw new HttpsError("failed-precondition", "RECLAMO_REQUERIMIENTO_INCONSISTENTE");
  }
  return { fecha, referencia: caso.requerimientoRef as string, vencimiento };
}

function referenciaDesistimiento(caso: FirebaseFirestore.DocumentData, requerimiento: ReturnType<typeof requerimientoSubsanacion>) {
  if (caso.estado !== "DESISTIDO") return null;
  if (!requerimiento || typeof caso.desistimientoVerificacionRef !== "string"
    || !ID.test(caso.desistimientoVerificacionRef) || caso.desistidaPorUid !== caso.operadorUid
    || !(caso.desistimientoRegistradoEn instanceof Timestamp)
    || caso.subsanacionRecibidaEn !== undefined || caso.subsanacionRecibidaRef !== undefined) {
    throw new HttpsError("failed-precondition", "RECLAMO_DESISTIMIENTO_INCONSISTENTE");
  }
  return caso.desistimientoVerificacionRef as string;
}

function validarSubsanacionRecibida(
  caso: FirebaseFirestore.DocumentData,
  requerimiento: ReturnType<typeof requerimientoSubsanacion>,
): boolean {
  const campos = [caso.subsanacionRecibidaEn, caso.subsanacionRecibidaRef, caso.subsanacionRegistradaEn];
  if (campos.every(value => value === undefined)) {
    if (requerimiento && ["ABIERTO", "RESUELTO", "VERIFICADO"].includes(caso.estado)) {
      throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_SIN_CONSTANCIA");
    }
    return false;
  }
  if (!requerimiento || !(caso.subsanacionRecibidaEn instanceof Timestamp)
    || typeof caso.subsanacionRecibidaRef !== "string" || !ID.test(caso.subsanacionRecibidaRef)
    || !(caso.subsanacionRegistradaEn instanceof Timestamp)
    || !(caso.completoEn instanceof Timestamp)
    || ["RECIBIDO", "DESISTIDO"].includes(caso.estado)) {
    throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_INCONSISTENTE");
  }
  const fecha = fechaBogota(caso.subsanacionRecibidaEn.toMillis());
  if (fecha < requerimiento.fecha || fecha > requerimiento.vencimiento
    || caso.subsanacionRecibidaEn.toMillis() > caso.completoEn.toMillis()) {
    throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_FUERA_DE_PLAZO");
  }
  return true;
}

function vencimientosReclamo(caso: FirebaseFirestore.DocumentData, version: PrivacyCalendarVersion) {
  if (!(caso.recibidoEn instanceof Timestamp) || !(caso.completoEn instanceof Timestamp)) denegar();
  const anotacionEsperada = sumarHabiles(fechaBogota(caso.completoEn.toMillis()), 2, version);
  const respuestaEsperada = sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 15, version);
  if ((caso.vencimientoAnotacion !== undefined && caso.vencimientoAnotacion !== anotacionEsperada)
    || (caso.vencimientoRespuesta !== undefined && caso.vencimientoRespuesta !== respuestaEsperada)) {
    throw new HttpsError("failed-precondition", "RECLAMO_PLAZO_INCONSISTENTE");
  }
  const tieneProrroga = [caso.prorrogaRef, caso.prorrogaMotivo, caso.prorrogaRegistradaEn, caso.vencimientoProrroga]
    .some(value => value !== undefined);
  const vencimientoProrroga = tieneProrroga ? sumarHabiles(respuestaEsperada, 8, version) : undefined;
  if (tieneProrroga && (typeof caso.prorrogaRef !== "string" || !ID.test(caso.prorrogaRef)
    || typeof caso.prorrogaMotivo !== "string" || !caso.prorrogaMotivo.trim()
    || !(caso.prorrogaRegistradaEn instanceof Timestamp)
    || caso.vencimientoProrroga !== vencimientoProrroga)) {
    throw new HttpsError("failed-precondition", "RECLAMO_PRORROGA_INCONSISTENTE");
  }
  return {
    vencimientoAnotacion: caso.vencimientoAnotacion ?? anotacionEsperada,
    vencimientoRespuesta: caso.vencimientoProrroga ?? caso.vencimientoRespuesta ?? respuestaEsperada,
    vencimientoRespuestaBase: caso.vencimientoRespuesta ?? respuestaEsperada,
  };
}

async function requerirSubsanacion(db: Firestore, actor: Actor, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["accion", "casoId", "fechaEnvio", "referencia"].includes(key))) entradaInvalida();
  const casoId = identificador(data.casoId);
  const fecha = fechaCivil(data.fechaEnvio);
  const referencia = identificador(data.referencia);
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const caso = (await tx.get(casoRef)).data();
    if (!caso || caso.operadorUid !== actor.uid || !(caso.recibidoEn instanceof Timestamp)) denegar();
    const existente = requerimientoSubsanacion(caso);
    if (existente) {
      if (existente.fecha !== fecha || existente.referencia !== referencia) {
        throw new HttpsError("already-exists", "RECLAMO_REQUERIMIENTO_DISTINTO");
      }
      if (!["RECIBIDO", "ABIERTO", "RESUELTO", "DESISTIDO"].includes(caso.estado)) {
        throw new HttpsError("failed-precondition", "RECLAMO_ESTADO_INVALIDO");
      }
      validarSubsanacionRecibida(caso, existente);
      return { casoId, estado: caso.estado as string, idempotente: true };
    }
    if (caso.estado !== "RECIBIDO") denegar();
    validarSubsanacionRecibida(caso, undefined);
    const version = versionCalendario(caso);
    const vence = vencimientoRequerimiento(caso, version);
    const recibido = fechaBogota(caso.recibidoEn.toMillis());
    if (fecha < recibido || fecha > vence || fechaBogota(Date.now()) > vence) {
      throw new HttpsError("failed-precondition", "RECLAMO_REQUERIMIENTO_FUERA_DE_PLAZO");
    }
    tx.update(casoRef, {
      fechaRequerimiento: fecha, requerimientoRef: referencia, requerimientoOperadorUid: actor.uid,
      requerimientoRegistradoEn: FieldValue.serverTimestamp(), vencimientoSubsanacion: vencimientoDosMeses(fecha, version),
    });
    return { casoId, estado: "RECIBIDO", idempotente: false };
  });
}

async function desistirPorFaltaDeSubsanacion(db: Firestore, actor: Actor, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["accion", "casoId", "referenciaVerificacion", "verificacionConfirmada"].includes(key))
    || data.verificacionConfirmada !== true) entradaInvalida();
  const casoId = identificador(data.casoId);
  const referenciaVerificacion = identificador(data.referenciaVerificacion);
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const caso = (await tx.get(casoRef)).data();
    if (!caso || caso.operadorUid !== actor.uid) denegar();
    const requerimiento = requerimientoSubsanacion(caso);
    validarSubsanacionRecibida(caso, requerimiento);
    if (caso.estado === "DESISTIDO") {
      if (referenciaDesistimiento(caso, requerimiento) !== referenciaVerificacion) {
        throw new HttpsError("already-exists", "RECLAMO_DESISTIMIENTO_DISTINTO");
      }
      return { casoId, estado: "DESISTIDO", idempotente: true };
    }
    if (caso.estado !== "RECIBIDO") throw new HttpsError("failed-precondition", "RECLAMO_ESTADO_INVALIDO");
    if (!requerimiento) {
      throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_PENDIENTE_O_INCONSISTENTE");
    }
    if (fechaBogota(Date.now()) <= requerimiento.vencimiento) {
      throw new HttpsError("failed-precondition", "RECLAMO_PLAZO_SUBSANACION_VIGENTE");
    }
    tx.update(casoRef, {
      estado: "DESISTIDO", desistimientoVerificacionRef: referenciaVerificacion,
      desistidaPorUid: actor.uid, desistimientoRegistradoEn: FieldValue.serverTimestamp(),
    });
    return { casoId, estado: "DESISTIDO", idempotente: false };
  });
}

const claveCaso = (empresaId: string, consecutivo: string) =>
  createHash("sha256").update(JSON.stringify([empresaId, consecutivo])).digest("hex");

type AnotacionPrivacidad = { casoId: string; motivo: string };

async function leerAnotacionesAbiertas(
  tx: FirebaseFirestore.Transaction,
  fichaRef: FirebaseFirestore.DocumentReference,
  empresaId: string,
): Promise<AnotacionPrivacidad[]> {
  const snapshot = await tx.get(fichaRef.collection("anotaciones_privacidad"));
  return snapshot.docs.map(documento => {
    const anotacion = documento.data();
    if (!ID.test(documento.id) || anotacion.casoId !== documento.id
      || anotacion.clienteId !== fichaRef.id || anotacion.empresaId !== empresaId
      || anotacion.estado !== "ABIERTO" || typeof anotacion.motivo !== "string"
      || !anotacion.motivo.trim() || anotacion.motivo.length > 500
      || !(anotacion.anotadoEn instanceof Timestamp)) {
      throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
    }
    return { casoId: documento.id, motivo: anotacion.motivo };
  });
}

function validarIndicadorAbiertos(valor: unknown, anotaciones: AnotacionPrivacidad[]): asserts valor is number {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0
    || valor !== anotaciones.length) {
    throw new HttpsError("failed-precondition", "RECLAMO_INDICADOR_INCONSISTENTE");
  }
}

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
      const version = versionCalendario(existente);
      vencimientoRequerimiento(existente, version);
      const requerimiento = requerimientoSubsanacion(existente);
      validarSubsanacionRecibida(existente, requerimiento);
      return { casoId, estado: existente.estado as string };
    }
    if (!(await tx.get(db.collection("empresas").doc(tenant))).exists) denegar();
    tx.create(casoRef, {
      consecutivo: radicado, empresaId: tenant, operadorUid: actor.uid,
      estado: "RECIBIDO", recibidoEn, radicadoEn: FieldValue.serverTimestamp(),
      vencimientoRequerimiento: sumarHabiles(fechaBogota(recibidoEn.toMillis()), 5, PRIVACY_CALENDAR_VERSION),
      calendarioVersion: PRIVACY_CALENDAR_VERSION,
    });
    return { casoId, estado: "RECIBIDO" };
  });
}

async function registrar(db: Firestore, actor: Actor, data: Record<string, unknown>) {
  const { accion, consecutivo, empresaId, clienteId, motivo, instruccionRef,
    identidadRef, recibido, completo, trasladoRef, verificacionConfirmada,
    subsanacionRecibida, subsanacionRef, ...extra } = data;
  if (accion !== "REGISTRAR" || Object.keys(extra).length || verificacionConfirmada !== true) entradaInvalida();
  const tieneSubsanacion = subsanacionRecibida !== undefined || subsanacionRef !== undefined;
  if (tieneSubsanacion && (typeof subsanacionRecibida !== "string" || typeof subsanacionRef !== "string")) entradaInvalida();
  const datos = {
    consecutivo: identificador(consecutivo), empresaId: identificador(empresaId),
    clienteId: identificador(clienteId), motivo: textoBreve(motivo),
    instruccionRef: identificador(instruccionRef), identidadRef: identificador(identidadRef),
    trasladoRef: identificador(trasladoRef),
  };
  const recibidoEn = fechaVerificada(recibido);
  const completoEn = fechaVerificada(completo);
  if (completoEn.toMillis() < recibidoEn.toMillis()) entradaInvalida();
  const subsanacionEn = tieneSubsanacion ? fechaVerificada(subsanacionRecibida) : undefined;
  const referenciaSubsanacion = tieneSubsanacion ? identificador(subsanacionRef) : undefined;
  if (subsanacionEn && subsanacionEn.toMillis() > completoEn.toMillis()) entradaInvalida();
  const casoId = claveCaso(datos.empresaId, datos.consecutivo);
  const huella = createHash("sha256").update(JSON.stringify(tieneSubsanacion
    ? [datos, recibido, completo, subsanacionRecibida, referenciaSubsanacion]
    : [datos, recibido, completo])).digest("hex");
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const anterior = (await tx.get(casoRef)).data();
    if (anterior) {
      if (anterior.operadorUid !== actor.uid) denegar();
      const reqAnterior = requerimientoSubsanacion(anterior);
      validarSubsanacionRecibida(anterior, reqAnterior);
      if (anterior.estado !== "RECIBIDO") {
        if (anterior.huellaRegistro !== huella) throw new HttpsError("already-exists", "RECLAMO_REGISTRO_DISTINTO");
        if (anterior.estado === "ABIERTO") {
          const fichaRef = db.collection("clientes").doc(datos.clienteId);
          const anotacion = (await tx.get(fichaRef.collection("anotaciones_privacidad").doc(casoId))).data();
          if (!anotacion || anotacion.casoId !== casoId || anotacion.empresaId !== datos.empresaId
            || anotacion.clienteId !== datos.clienteId || anotacion.estado !== "ABIERTO"
            || anotacion.motivo !== datos.motivo || !(anotacion.anotadoEn instanceof Timestamp)) {
            throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
          }
        }
        return { casoId, estado: anterior.estado as string };
      }
      if (!(anterior.recibidoEn instanceof Timestamp) || !anterior.recibidoEn.isEqual(recibidoEn)) {
        throw new HttpsError("already-exists", "RECLAMO_REGISTRO_DISTINTO");
      }
    }
    const calendarioVersion = anterior ? versionCalendario(anterior) : PRIVACY_CALENDAR_VERSION;
    const requerimiento = anterior ? requerimientoSubsanacion(anterior) : undefined;
    if (requerimiento) {
      if (!subsanacionEn || !referenciaSubsanacion) {
        throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_SIN_CONSTANCIA");
      }
      const fechaSubsanacion = fechaBogota(subsanacionEn.toMillis());
      if (fechaSubsanacion < requerimiento.fecha || fechaSubsanacion > requerimiento.vencimiento) {
        throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_FUERA_DE_PLAZO");
      }
    } else if (tieneSubsanacion) {
      throw new HttpsError("failed-precondition", "RECLAMO_SUBSANACION_SIN_REQUERIMIENTO");
    }
    const fichaRef = db.collection("clientes").doc(datos.clienteId);
    const ficha = (await tx.get(fichaRef)).data();
    if (!ficha || ficha.empresaId !== datos.empresaId || !(ficha.creadoEn instanceof Timestamp)) denegar();
    const abiertos: unknown = ficha.reclamosPrivacidadAbiertos ?? 0;
    const anotacionesAbiertas = await leerAnotacionesAbiertas(tx, fichaRef, datos.empresaId);
    validarIndicadorAbiertos(abiertos, anotacionesAbiertas);
    if (abiertos >= Number.MAX_SAFE_INTEGER) throw new HttpsError("failed-precondition", "RECLAMO_INDICADOR_INCONSISTENTE");
    const anotacionRef = fichaRef.collection("anotaciones_privacidad").doc(casoId);
    if ((await tx.get(anotacionRef)).exists) throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
    const vencimientoAnotacion = sumarHabiles(fechaBogota(completoEn.toMillis()), 2, calendarioVersion);
    const vencimientoRespuesta = sumarHabiles(fechaBogota(recibidoEn.toMillis()), 15, calendarioVersion);
    const expediente = {
      ...datos, huellaRegistro: huella, operadorUid: actor.uid, identidadVerificada: true,
      fichaCreadaEn: ficha.creadoEn, recibidoEn, completoEn,
      vencimientoAnotacion, vencimientoRespuesta, calendarioVersion,
      estado: "ABIERTO", anotadoEn: FieldValue.serverTimestamp(), verificadoEn: FieldValue.serverTimestamp(),
      ...(subsanacionEn && referenciaSubsanacion ? {
        subsanacionRecibidaEn: subsanacionEn, subsanacionRecibidaRef: referenciaSubsanacion,
        subsanacionRegistradaEn: FieldValue.serverTimestamp(),
      } : {}),
    };
    if (anterior) tx.update(casoRef, expediente);
    else tx.create(casoRef, expediente);
    tx.create(anotacionRef, {
      casoId, clienteId: datos.clienteId, empresaId: datos.empresaId,
      motivo: datos.motivo, estado: "ABIERTO", anotadoEn: FieldValue.serverTimestamp(),
    });
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
  if (data && typeof data === "object" && "accion" in data && data.accion === "REQUERIR_SUBSANACION") {
    return requerirSubsanacion(db, actor, data as Record<string, unknown>);
  }
  if (data && typeof data === "object" && "accion" in data && data.accion === "DESISTIR_POR_FALTA_DE_SUBSANACION") {
    return desistirPorFaltaDeSubsanacion(db, actor, data as Record<string, unknown>);
  }
  const { casoId, accion, respuestaRef, resultado } = normalizar(data);
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const casoRef = db.collection("privacidad_reclamos").doc(casoId);
    const caso = (await tx.get(casoRef)).data();
    if ((caso?.estado === "RECIBIDO" || caso?.estado === "DESISTIDO")
      && caso.operadorUid === actor.uid && accion === "CONSULTAR") {
      const version = versionCalendario(caso);
      const requerimiento = requerimientoSubsanacion(caso);
      const subsanacionRecibida = validarSubsanacionRecibida(caso, requerimiento);
      const referencia = referenciaDesistimiento(caso, requerimiento);
      return {
        casoId, empresaId: caso.empresaId, consecutivo: caso.consecutivo,
        estado: caso.estado as "RECIBIDO" | "DESISTIDO",
        fechaRecepcion: fechaBogota(caso.recibidoEn.toMillis()),
        vencimientoRequerimiento: vencimientoRequerimiento(caso, version),
        fechaRequerimiento: requerimiento?.fecha ?? null,
        requerimientoRef: requerimiento?.referencia ?? null,
        vencimientoSubsanacion: requerimiento?.vencimiento ?? null,
        subsanacionRecibida,
        desistimientoVerificacionRef: referencia,
      };
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
    const calendarioVersion = versionCalendario(caso);
    const requerimiento = requerimientoSubsanacion(caso);
    const subsanacionRecibida = validarSubsanacionRecibida(caso, requerimiento);
    const vencimientos = vencimientosReclamo(caso, calendarioVersion);

    if (accion === "CERRAR" && caso.estado === "RESUELTO") {
      if (caso.respuestaRef !== respuestaRef) {
        throw new HttpsError("already-exists", "RECLAMO_CIERRE_DISTINTO");
      }
      return { casoId, estado: "RESUELTO" };
    }
    const fichaRef = db.collection("clientes").doc(caso.clienteId);
    const ficha = (await tx.get(fichaRef)).data();
    if (!ficha || ficha.empresaId !== caso.empresaId
      || !(caso.fichaCreadaEn instanceof Timestamp)
      || !(ficha.creadoEn instanceof Timestamp)
      || !ficha.creadoEn.isEqual(caso.fichaCreadaEn)) denegar();
    const abiertos: unknown = ficha.reclamosPrivacidadAbiertos ?? 0;
    const anotacionesAbiertas = await leerAnotacionesAbiertas(tx, fichaRef, caso.empresaId);
    validarIndicadorAbiertos(abiertos, anotacionesAbiertas);
    if (caso.estado === "ABIERTO" && !anotacionesAbiertas.some(anotacion => anotacion.casoId === casoId)) {
      throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
    }

    if (accion === "CONSULTAR") {
      return {
        casoId, clienteId: caso.clienteId, estado: caso.estado,
        leyenda: abiertos > 0 ? "reclamo en trámite" : null,
        motivo: caso.estado === "ABIERTO" ? caso.motivo : null,
        motivosActivos: anotacionesAbiertas.map(anotacion => anotacion.motivo),
        recibidoEnMillis: caso.recibidoEn.toMillis(),
        completoEnMillis: caso.completoEn.toMillis(),
        subsanacionRecibida,
        vencimientoAnotacion: vencimientos.vencimientoAnotacion,
        vencimientoRespuesta: vencimientos.vencimientoRespuesta,
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
        const vence = vencimientos.vencimientoRespuestaBase;
        if (caso.prorrogaRef || caso.respuestaVerificadaRef || fechaBogota(Date.now()) > vence) {
          throw new HttpsError("failed-precondition", "RECLAMO_PRORROGA_NO_DISPONIBLE");
        }
        tx.update(casoRef, { prorrogaRef: respuestaRef, prorrogaMotivo: resultado,
          prorrogaRegistradaEn: FieldValue.serverTimestamp(), vencimientoProrroga: sumarHabiles(vence, 8, calendarioVersion) });
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
    const anotacionRef = fichaRef.collection("anotaciones_privacidad").doc(casoId);
    if (abrir) {
      if (anotacionesAbiertas.some(anotacion => anotacion.casoId === casoId)) {
        throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
      }
      tx.create(anotacionRef, {
        casoId, clienteId: caso.clienteId, empresaId: caso.empresaId,
        motivo: caso.motivo, estado: "ABIERTO", anotadoEn: FieldValue.serverTimestamp(),
      });
    } else {
      if (!anotacionesAbiertas.some(anotacion => anotacion.casoId === casoId)) {
        throw new HttpsError("failed-precondition", "RECLAMO_ANOTACION_INCONSISTENTE");
      }
      tx.delete(anotacionRef);
    }
    tx.update(fichaRef, { reclamosPrivacidadAbiertos: abrir ? abiertos + 1 : abiertos - 1 });
    tx.update(casoRef, abrir
      ? { estado, anotadoEn: FieldValue.serverTimestamp() }
      : { estado, respuestaRef, resultado: caso.resultadoVerificado, cerradoEn: FieldValue.serverTimestamp() });
    return { casoId, estado };
  });
}
