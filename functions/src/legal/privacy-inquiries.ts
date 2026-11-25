import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "../platform/authorization";
import { fechaBogota, PRIVACY_CALENDAR_VERSION, sumarHabiles } from "./privacy-calendar";

const FACULTAD = "PRIVACIDAD_CONSULTAS_TRAMITAR";
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const fail = (code: "invalid-argument" | "permission-denied" | "already-exists" | "failed-precondition") => { throw new HttpsError(code, "CONSULTA_PRIVACIDAD_NO_DISPONIBLE"); };
const id = (value: unknown): string => typeof value === "string" && ID.test(value) ? value : fail("invalid-argument");
const text = (value: unknown): string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 500 ? value.trim() : fail("invalid-argument");
const date = (value: unknown): Timestamp => {
  if (typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) return fail("invalid-argument");
  const millis = Date.parse(`${value}T00:00:00-05:00`);
  if (!Number.isFinite(millis) || fechaBogota(millis) !== value || millis > Date.now()) return fail("invalid-argument");
  return Timestamp.fromMillis(millis);
};
type Actor = { uid: string; token: TokenPlataforma };
function casoIntegro(casoId: string, caso: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!caso || typeof caso.empresaId !== "string" || !ID.test(caso.empresaId)
    || typeof caso.consecutivo !== "string" || !ID.test(caso.consecutivo)
    || !(caso.recibidoEn instanceof Timestamp) || typeof caso.vencimientoRespuesta !== "string"
    || caso.calendarioVersion !== PRIVACY_CALENDAR_VERSION) return false;
  const expected = createHash("sha256").update(JSON.stringify([caso.empresaId, caso.consecutivo])).digest("hex");
  try {
    const original = sumarHabiles(fechaBogota(caso.recibidoEn.toMillis()), 10);
    const tieneProrroga = caso.prorrogaRef !== undefined || caso.prorrogaMotivo !== undefined || caso.vencimientoProrroga !== undefined;
    return casoId === expected && caso.vencimientoRespuesta === original && (!tieneProrroga
      || (typeof caso.prorrogaRef === "string" && ID.test(caso.prorrogaRef)
        && typeof caso.prorrogaMotivo === "string" && !!caso.prorrogaMotivo.trim()
        && caso.prorrogaRegistradaEn instanceof Timestamp
        && caso.vencimientoProrroga === sumarHabiles(original, 5)))
      && (caso.estado !== "RESPONDIDA" || (typeof caso.respuestaRef === "string" && ID.test(caso.respuestaRef)
        && typeof caso.resultado === "string" && !!caso.resultado.trim() && caso.respondidaEn instanceof Timestamp));
  }
  catch { return false; }
}

/** Expediente restringido: guarda referencias a verificaciones, nunca copias de identidad. */
export async function tramitarConsultaPrivacidad(db: Firestore, actor: Actor, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid-argument");
  const data = input as Record<string, unknown>;
  const accion = data.accion;
  if (accion === "RECUPERAR") {
    if (Object.keys(data).some(key => !["accion", "casoId", "destinoUid", "motivoRef", "comandoId"].includes(key))) return fail("invalid-argument");
    const casoId = id(data.casoId), destinoUid = id(data.destinoUid), motivoRef = id(data.motivoRef), comandoId = id(data.comandoId);
    const eventoId = createHash("sha256").update(JSON.stringify(["RECUPERAR", casoId, actor.uid, comandoId])).digest("hex");
    return db.runTransaction(async tx => {
      await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
      await autorizarPlataforma(db, actor.uid, actor.token, "OPERADORES_GOBERNAR", tx);
      const casoRef = db.collection("privacidad_consultas").doc(casoId);
      const eventoRef = casoRef.collection("reasignaciones").doc(eventoId);
      const [casoSnap, eventoSnap, destinoSnap] = await Promise.all([
        tx.get(casoRef), tx.get(eventoRef), tx.get(db.collection("saas_operadores").doc(destinoUid)),
      ]);
      const evento = eventoSnap.data();
      if (evento) {
        if (evento.actorUid !== actor.uid || evento.destinoUid !== destinoUid || evento.motivoRef !== motivoRef) return fail("already-exists");
        return { casoId, estado: "REASIGNADA", idempotente: true };
      }
      const caso = casoSnap.data(), destino = destinoSnap.data();
      if (!caso || !casoIntegro(casoId, caso) || !["RECIBIDA", "ABIERTA"].includes(caso.estado)
        || typeof caso.operadorUid !== "string" || !ID.test(caso.operadorUid) || caso.operadorUid === destinoUid) return fail("failed-precondition");
      const origen = (await tx.get(db.collection("saas_operadores").doc(caso.operadorUid))).data();
      if (origen && !["REVOCADO", "SUSPENDIDO"].includes(origen.estado)) return fail("failed-precondition");
      if (!destino || destino.uid !== destinoUid || destino.estado !== "ACTIVO" || !Array.isArray(destino.facultades)
        || !destino.facultades.includes(FACULTAD) || !Number.isSafeInteger(destino.versionAutorizacion) || destino.versionAutorizacion < 1) return fail("permission-denied");
      tx.update(casoRef, { operadorUid: destinoUid, reasignadoEn: FieldValue.serverTimestamp() });
      tx.create(eventoRef, { tipo: "RECUPERACION", actorUid: actor.uid, origenUid: caso.operadorUid, destinoUid, motivoRef, comandoId, registradoEn: FieldValue.serverTimestamp() });
      return { casoId, estado: "REASIGNADA", idempotente: false };
    });
  }
  if (accion === "REASIGNAR") {
    if (Object.keys(data).some(key => !["accion", "casoId", "destinoUid", "motivoRef", "comandoId"].includes(key))) return fail("invalid-argument");
    const casoId = id(data.casoId), destinoUid = id(data.destinoUid), motivoRef = id(data.motivoRef), comandoId = id(data.comandoId);
    if (destinoUid === actor.uid) return fail("invalid-argument");
    const eventoId = createHash("sha256").update(JSON.stringify([casoId, actor.uid, comandoId])).digest("hex");
    return db.runTransaction(async tx => {
      await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
      const casoRef = db.collection("privacidad_consultas").doc(casoId);
      const eventoRef = casoRef.collection("reasignaciones").doc(eventoId);
      const [casoSnap, eventoSnap, destinoSnap] = await Promise.all([
        tx.get(casoRef), tx.get(eventoRef), tx.get(db.collection("saas_operadores").doc(destinoUid)),
      ]);
      const evento = eventoSnap.data();
      if (evento) {
        if (evento.origenUid !== actor.uid || evento.destinoUid !== destinoUid || evento.motivoRef !== motivoRef) return fail("already-exists");
        return { casoId, estado: "REASIGNADA", idempotente: true };
      }
      const caso = casoSnap.data(), destino = destinoSnap.data();
      if (!caso || caso.operadorUid !== actor.uid) return fail("permission-denied");
      if (!casoIntegro(casoId, caso) || !["RECIBIDA", "ABIERTA"].includes(caso.estado)) return fail("failed-precondition");
      if (!destino || destino.uid !== destinoUid || destino.estado !== "ACTIVO" || !Array.isArray(destino.facultades)
        || !destino.facultades.includes(FACULTAD) || !Number.isSafeInteger(destino.versionAutorizacion) || destino.versionAutorizacion < 1) return fail("permission-denied");
      tx.update(casoRef, { operadorUid: destinoUid, reasignadoEn: FieldValue.serverTimestamp() });
      tx.create(eventoRef, { origenUid: actor.uid, destinoUid, motivoRef, comandoId, registradoEn: FieldValue.serverTimestamp() });
      return { casoId, estado: "REASIGNADA", idempotente: false };
    });
  }
  if (accion === "RECIBIR") {
    if (Object.keys(data).some(key => !["accion", "empresaId", "consecutivo", "recibido"].includes(key))) return fail("invalid-argument");
    const empresaId = id(data.empresaId), consecutivo = id(data.consecutivo), recibidoEn = date(data.recibido);
    const casoId = createHash("sha256").update(JSON.stringify([empresaId, consecutivo])).digest("hex");
    return db.runTransaction(async tx => {
      await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
      const ref = db.collection("privacidad_consultas").doc(casoId);
      const existing = (await tx.get(ref)).data();
      if (existing) {
        if (!casoIntegro(casoId, existing)) return fail("failed-precondition");
        if (existing.operadorUid !== actor.uid) return fail("permission-denied");
        if (!(existing.recibidoEn instanceof Timestamp) || !existing.recibidoEn.isEqual(recibidoEn)) return fail("already-exists");
        return { casoId, estado: existing.estado as string };
      }
      if (!(await tx.get(db.collection("empresas").doc(empresaId))).exists) return fail("permission-denied");
      tx.create(ref, { empresaId, consecutivo, operadorUid: actor.uid, recibidoEn, registradoEn: FieldValue.serverTimestamp(),
        vencimientoRespuesta: sumarHabiles(fechaBogota(recibidoEn.toMillis()), 10), calendarioVersion: PRIVACY_CALENDAR_VERSION, estado: "RECIBIDA" });
      return { casoId, estado: "RECIBIDA" };
    });
  }
  if (accion === "REGISTRAR") {
    if (Object.keys(data).some(key => !["accion", "empresaId", "consecutivo", "recibido", "identidadRef", "instruccionRef", "verificacionConfirmada"].includes(key)) || data.verificacionConfirmada !== true) return fail("invalid-argument");
    const empresaId = id(data.empresaId), consecutivo = id(data.consecutivo);
    const identidadRef = id(data.identidadRef), instruccionRef = id(data.instruccionRef);
    const recibidoEn = date(data.recibido);
    const casoId = createHash("sha256").update(JSON.stringify([empresaId, consecutivo])).digest("hex");
    const huella = createHash("sha256").update(JSON.stringify([empresaId, consecutivo, data.recibido, identidadRef, instruccionRef])).digest("hex");
    return db.runTransaction(async tx => {
      await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
      const ref = db.collection("privacidad_consultas").doc(casoId);
      const existing = (await tx.get(ref)).data();
      if (existing) {
        if (!casoIntegro(casoId, existing)) return fail("failed-precondition");
        if (existing.operadorUid !== actor.uid) return fail("permission-denied");
        if (existing.estado !== "RECIBIDA") {
          if (existing.huellaRegistro !== huella) return fail("already-exists");
          return { casoId, estado: existing.estado as string };
        }
        if (!(existing.recibidoEn instanceof Timestamp) || !existing.recibidoEn.isEqual(recibidoEn)) return fail("already-exists");
      }
      if (!existing && !(await tx.get(db.collection("empresas").doc(empresaId))).exists) return fail("permission-denied");
      const expediente = { empresaId, consecutivo, operadorUid: actor.uid, identidadRef, instruccionRef,
        identidadVerificada: true, huellaRegistro: huella, recibidoEn,
        vencimientoRespuesta: sumarHabiles(fechaBogota(recibidoEn.toMillis()), 10), calendarioVersion: PRIVACY_CALENDAR_VERSION, estado: "ABIERTA" };
      if (existing) tx.update(ref, { ...expediente, verificadoEn: FieldValue.serverTimestamp() });
      else tx.create(ref, { ...expediente, registradoEn: FieldValue.serverTimestamp() });
      return { casoId, estado: "ABIERTA" };
    });
  }
  if (!["CONSULTAR", "PRORROGAR", "RESPONDER"].includes(String(accion))) return fail("invalid-argument");
  if (Object.keys(data).some(key => !["accion", "casoId", "referencia", "resultado"].includes(key))) return fail("invalid-argument");
  const casoId = id(data.casoId);
  const referencia = accion === "CONSULTAR" ? undefined : id(data.referencia);
  const resultado = accion === "CONSULTAR" ? undefined : text(data.resultado);
  if (accion === "CONSULTAR" && (data.referencia !== undefined || data.resultado !== undefined)) return fail("invalid-argument");
  return db.runTransaction(async tx => {
    await autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
    const ref = db.collection("privacidad_consultas").doc(casoId);
    const caso = (await tx.get(ref)).data();
    if (!caso || caso.operadorUid !== actor.uid) return fail("permission-denied");
    if (!casoIntegro(casoId, caso)) return fail("failed-precondition");
    if (caso?.estado === "RECIBIDA" && caso.operadorUid === actor.uid && caso.recibidoEn instanceof Timestamp
      && typeof caso.vencimientoRespuesta === "string") {
      if (accion === "CONSULTAR") return { casoId, estado: "RECIBIDA", vencimientoRespuesta: caso.vencimientoProrroga ?? caso.vencimientoRespuesta, respuestaDocumentada: false, respuestaRef: null };
      if (accion === "PRORROGAR") {
        if (caso.prorrogaRef === referencia && caso.prorrogaMotivo === resultado) return { casoId, estado: "RECIBIDA" };
        if (caso.prorrogaRef || fechaBogota(Date.now()) > caso.vencimientoRespuesta) return fail("failed-precondition");
        tx.update(ref, { prorrogaRef: referencia, prorrogaMotivo: resultado, prorrogaRegistradaEn: FieldValue.serverTimestamp(), vencimientoProrroga: sumarHabiles(caso.vencimientoRespuesta, 5) });
        return { casoId, estado: "RECIBIDA" };
      }
      return fail("permission-denied");
    }
    if (!caso || caso.operadorUid !== actor.uid || caso.identidadVerificada !== true || !ID.test(caso.empresaId ?? "")
      || !ID.test(caso.identidadRef ?? "") || !ID.test(caso.instruccionRef ?? "") || !["ABIERTA", "RESPONDIDA"].includes(caso.estado)
      || !(caso.recibidoEn instanceof Timestamp) || typeof caso.vencimientoRespuesta !== "string") return fail("permission-denied");
    if (accion === "CONSULTAR") return { casoId, estado: caso.estado, vencimientoRespuesta: caso.vencimientoProrroga ?? caso.vencimientoRespuesta,
      respuestaDocumentada: caso.estado === "RESPONDIDA", respuestaRef: caso.respuestaRef ?? null };
    if (accion === "PRORROGAR") {
      if (caso.prorrogaRef === referencia && caso.prorrogaMotivo === resultado) return { casoId, estado: caso.estado };
      if (caso.estado !== "ABIERTA" || caso.prorrogaRef || fechaBogota(Date.now()) > caso.vencimientoRespuesta) return fail("failed-precondition");
      tx.update(ref, { prorrogaRef: referencia, prorrogaMotivo: resultado, prorrogaRegistradaEn: FieldValue.serverTimestamp(), vencimientoProrroga: sumarHabiles(caso.vencimientoRespuesta, 5) });
      return { casoId, estado: "ABIERTA" };
    }
    if (caso.estado === "RESPONDIDA") {
      if (caso.respuestaRef !== referencia || caso.resultado !== resultado) return fail("already-exists");
      return { casoId, estado: "RESPONDIDA" };
    }
    tx.update(ref, { estado: "RESPONDIDA", respuestaRef: referencia, resultado, respondidaEn: FieldValue.serverTimestamp() });
    return { casoId, estado: "RESPONDIDA" };
  });
}
