import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  crearBorradoresConfirmacionAperturaTurno,
  crearHuellaSemanticaAperturaTurno,
  crearReferenciasOperacionAperturaTurno,
} from "./confirmation";
import type { EnvelopeAbrirTurno, ResultadoAbrirTurno } from "./contracts";
import { crearIdentificadorInterno } from "./identificadores";

const CAPACIDAD_TURNOS = "shifts";

export interface ContextoAperturaTurno {
  empresaId: string;
  actorUid: string;
}

export interface DependenciasAperturaTurno {
  serverTimestamp(): unknown;
}

const dependenciasAdmin: DependenciasAperturaTurno = {
  serverTimestamp: () => FieldValue.serverTimestamp(),
};

function errorDominio(codigo: HttpsError["code"], code: string): never {
  throw new HttpsError(codigo, "No fue posible abrir el turno.", { code });
}

export function esMembresiaAutorizada(data: Record<string, unknown> | undefined, contexto: ContextoAperturaTurno): data is Record<string, unknown> & { rol: string; permisos: unknown[] } {
  return !!data
    && data.empresaId === contexto.empresaId
    && data.uid === contexto.actorUid
    && data.estado === "activa"
    && data.activo === true
    && typeof data.rol === "string"
    && Array.isArray(data.permisos)
    && data.permisos.every((permiso) => typeof permiso === "string");
}

function resultadoPersistido(value: unknown): ResultadoAbrirTurno | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  return typeof result.commandId === "string"
    && typeof result.turnoId === "string"
    && typeof result.cajeroId === "string"
    && result.estado === "abierto"
    && typeof result.correlationId === "string"
    ? result as unknown as ResultadoAbrirTurno
    : null;
}

function validarIdempotencia(input: {
  recibo: { exists: boolean; data(): Record<string, unknown> | undefined };
  indice: { exists: boolean; data(): Record<string, unknown> | undefined };
  contexto: ContextoAperturaTurno;
  envelope: EnvelopeAbrirTurno;
  huella: string;
  reciboPath: string;
}): ResultadoAbrirTurno | null {
  const { recibo, indice, contexto, envelope, huella, reciboPath } = input;
  if (!recibo.exists && !indice.exists) return null;
  const reciboData = recibo.data();
  if (!recibo.exists) {
    return errorDominio("already-exists", "IDEMPOTENCY_CONFLICT");
  }
  if (!reciboData
    || reciboData.empresaId !== contexto.empresaId
    || reciboData.commandId !== envelope.commandId
    || reciboData.idempotencyKey !== envelope.idempotencyKey
    || reciboData.huella !== huella) {
    return errorDominio("already-exists", "COMMAND_ID_CONFLICT");
  }
  const indiceData = indice.data();
  if (!indice.exists || !indiceData
    || indiceData.empresaId !== contexto.empresaId
    || indiceData.idempotencyKey !== envelope.idempotencyKey
    || indiceData.commandId !== envelope.commandId
    || indiceData.huella !== huella
    || indiceData.reciboPath !== reciboPath) {
    return errorDominio("already-exists", "IDEMPOTENCY_CONFLICT");
  }
  const resultado = resultadoPersistido(reciboData.resultado);
  if (!resultado) return errorDominio("already-exists", "COMMAND_ID_CONFLICT");
  return resultado;
}

/**
 * Ejecuta exclusivamente la apertura R1-A con Admin SDK. Todos los documentos
 * decisivos se leen dentro de una única transacción antes de su primera escritura.
 */
export async function ejecutarAperturaTurnoOperativo(
  db: any,
  contexto: ContextoAperturaTurno,
  envelope: EnvelopeAbrirTurno,
  deps: DependenciasAperturaTurno = dependenciasAdmin,
): Promise<ResultadoAbrirTurno> {
  const huella = crearHuellaSemanticaAperturaTurno(envelope);
  const empresaRef = db.collection("empresas").doc(contexto.empresaId);
  const membresiaRef = db.collection("membresias").doc(`${contexto.empresaId}_${contexto.actorUid}`);
  const usuarioRef = db.collection("usuarios").doc(contexto.actorUid);
  const reciboRef = db.collection("operaciones_comandos").doc(crearIdentificadorInterno(contexto.empresaId, envelope.commandId));
  const indiceRef = db.collection("operaciones_command_idempotency").doc(crearIdentificadorInterno(contexto.empresaId, envelope.idempotencyKey));
  const lockRef = db.collection("turnos_activos").doc(crearIdentificadorInterno(contexto.empresaId, contexto.actorUid));
  const auditoriaRef = db.collection("operaciones_auditoria").doc(crearIdentificadorInterno(contexto.empresaId, envelope.commandId));

  return db.runTransaction(async (transaction: any): Promise<ResultadoAbrirTurno> => {
    const [empresa, membresia, usuario, recibo, indice, lock] = await Promise.all([
      transaction.get(empresaRef), transaction.get(membresiaRef), transaction.get(usuarioRef),
      transaction.get(reciboRef), transaction.get(indiceRef), transaction.get(lockRef),
    ]);

    const replay = validarIdempotencia({ recibo, indice, contexto, envelope, huella, reciboPath: reciboRef.path });
    if (replay) return replay;

    if (!empresa.exists || !["trial", "activa"].includes(empresa.data()?.estado)) {
      return errorDominio("failed-precondition", "EMPRESA_NO_OPERATIVA");
    }
    const datosMembresia = membresia.data();
    if (!esMembresiaAutorizada(datosMembresia, contexto)) {
      return errorDominio("permission-denied", "TENANT_ACCESS_DENIED");
    }
    if (!datosMembresia.permisos.includes(CAPACIDAD_TURNOS)) {
      return errorDominio("permission-denied", "ROLE_FORBIDDEN");
    }
    const cajeroNombre = usuario.data()?.nombre;
    if (!usuario.exists || typeof cajeroNombre !== "string" || !cajeroNombre.trim()) {
      return errorDominio("permission-denied", "TENANT_ACCESS_DENIED");
    }
    if (lock.exists) return errorDominio("failed-precondition", "LOCK_CONFLICT");

    const turnoRef = db.collection("turnos").doc();
    const resultado: ResultadoAbrirTurno = {
      commandId: envelope.commandId,
      turnoId: turnoRef.id,
      cajeroId: contexto.actorUid,
      estado: "abierto",
      correlationId: envelope.correlationId,
    };
    const referencias = crearReferenciasOperacionAperturaTurno(
      contexto.empresaId,
      envelope,
      { turnoId: turnoRef.id, actorUid: contexto.actorUid },
    );
    const borradores = crearBorradoresConfirmacionAperturaTurno({
      empresaId: contexto.empresaId,
      envelope,
      huella,
      actor: { uid: contexto.actorUid, rolEfectivo: datosMembresia.rol },
      resultado,
      referencias,
    });
    const timestamp = deps.serverTimestamp();

    transaction.create(turnoRef, {
      id: turnoRef.id,
      empresaId: contexto.empresaId,
      cajeroId: contexto.actorUid,
      cajeroNombre: cajeroNombre.trim(),
      fechaApertura: timestamp,
      estado: "abierto",
      baseApertura: envelope.payload.baseApertura,
      notasApertura: envelope.payload.notasApertura,
    });
    transaction.create(lockRef, {
      empresaId: contexto.empresaId,
      cajeroId: contexto.actorUid,
      turnoId: turnoRef.id,
      fechaApertura: timestamp,
    });
    transaction.create(reciboRef, { ...borradores.recibo, creadoEn: timestamp });
    transaction.create(indiceRef, { ...borradores.indice, creadoEn: timestamp });
    transaction.create(auditoriaRef, { ...borradores.auditoria, creadoEn: timestamp });
    return resultado;
  });
}
