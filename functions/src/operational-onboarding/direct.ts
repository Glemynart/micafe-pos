import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  idCredencialOperativa,
  normalizarCodigo,
  normalizarNombre,
  esPinValido,
  esRolTenant,
} from "../contracts";
import { hashearPin } from "../pin-security";
import { permisosPredeterminados } from "../tenant-permissions";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "../platform/audit";
import { CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO, reservarCodigoOperativoEnTransaccion } from "../platform/reserva-codigo-operativo";
import { generarCodigoOperativo, generarPinTemporal, MAX_INTENTOS_UNICIDAD } from "../platform/credencial-inicial";
import { INCORPORACIONES_COLLECTION, idIncorporacionDirecta } from "../incorporaciones-query";

export interface SolicitudIncorporacionDirecta {
  nombre?: unknown;
  codigo?: unknown;
  pinTemporal?: unknown;
  rol?: unknown;
  /** Se rechaza hasta que exista una prueba de posesion aprobada. */
  uid?: unknown;
}

export interface IncorporacionDirectaCreada {
  incorporacionId: string;
  estado: "TEMP_CREDENTIAL";
  uid: string;
  codigo: string;
  pinTemporal?: string;
}

export function prepararIncorporacionDirecta(data: SolicitudIncorporacionDirecta | undefined) {
  const nombre = normalizarNombre(data?.nombre);
  const codigo = data?.codigo !== undefined && data.codigo !== null ? normalizarCodigo(data.codigo) : null;
  const pinTemporal = data?.pinTemporal !== undefined && data.pinTemporal !== null ? data.pinTemporal : null;
  if (!nombre || !esRolTenant(data?.rol) || data?.uid !== undefined) {
    throw new HttpsError("invalid-argument", "Datos de incorporacion directa invalidos.");
  }
  if (codigo !== null && !codigo) {
    throw new HttpsError("invalid-argument", "El codigo operativo es invalido.");
  }
  if (pinTemporal !== null && !esPinValido(pinTemporal)) {
    throw new HttpsError("invalid-argument", "El PIN temporal es invalido.");
  }
  return { nombre, codigo, pinTemporal, rol: data.rol };
}

export async function crearIncorporacionDirecta({
  empresaId,
  emisorUid,
  data,
  pepper,
}: {
  empresaId: string;
  emisorUid: string;
  data: SolicitudIncorporacionDirecta | undefined;
  pepper: string;
}): Promise<IncorporacionDirectaCreada> {
  const preparado = prepararIncorporacionDirecta(data);
  const { nombre, rol } = preparado;
  let { codigo, pinTemporal } = preparado;
  const codigoFueProvisto = codigo !== null;
  const pinTemporalGenerada = pinTemporal === null;
  const db = getFirestore();
  const auth = getAuth();
  let obligacionId: string | null = null;

  if (pinTemporal === null) pinTemporal = generarPinTemporal();

  let intento = 0;
  while (true) {
    if (codigo === null) {
      const empresaSnap = await db.collection("empresas").doc(empresaId).get();
      const nombreComercial = empresaSnap.data()?.nombreComercial ?? empresaSnap.data()?.nombre ?? empresaId;
      codigo = generarCodigoOperativo(nombreComercial, nombre, intento);
    }
    const codigoResuelto: string = codigo;
    const incorporacionRef = db.collection(INCORPORACIONES_COLLECTION).doc(idIncorporacionDirecta(empresaId, codigoResuelto));
    const credencialRef = db.collection("credenciales_operativas").doc(idCredencialOperativa(empresaId, codigoResuelto));
    const incorporacionExistente = await incorporacionRef.get();
    if (incorporacionExistente.exists) {
      const credencialExistente = await credencialRef.get();
      return validarIncorporacionDirectaExistente(incorporacionExistente.data(), credencialExistente.data(), codigoResuelto, rol, incorporacionRef.id);
    }
    if ((await credencialRef.get()).exists) {
      throw new HttpsError("already-exists", "El codigo operativo ya esta asignado.");
    }

    const permisosEfectivos = await permisosPredeterminados(rol);
    const { principal, creadaAhora } = await obtenerPrincipalDirecto(auth, incorporacionRef.id, nombre);
    const usuarioRef = db.collection("usuarios").doc(principal.uid);
    let resultadoExistente: IncorporacionDirectaCreada | undefined;
    try {
      const pinHash = await hashearPin(pinTemporal, pepper);
      await db.runTransaction(async (transaction) => {
        const [incorporacionSnap, usuarioSnap, credencialSnap, credencialesUidSnap] = await Promise.all([
          transaction.get(incorporacionRef),
          transaction.get(usuarioRef),
          transaction.get(credencialRef),
          transaction.get(db.collection("credenciales_operativas").where("empresaId", "==", empresaId).where("uid", "==", principal.uid).limit(2)),
        ]);
        if (incorporacionSnap.exists) {
          resultadoExistente = validarIncorporacionDirectaExistente(incorporacionSnap.data(), credencialSnap.data(), codigoResuelto, rol, incorporacionRef.id);
          return;
        }
        if (usuarioSnap.exists) throw new HttpsError("already-exists", "La identidad ya tiene perfil global.");
        if (credencialSnap.exists) throw new HttpsError("already-exists", "El codigo operativo ya esta asignado.");
        if (credencialesUidSnap.size > 0) throw new HttpsError("already-exists", "La identidad ya tiene credencial operativa en esta empresa.");
        await reservarCodigoOperativoEnTransaccion(db, transaction, codigoResuelto);
        transaction.create(usuarioRef, { uid: principal.uid, nombre, creadoEn: FieldValue.serverTimestamp() });
        transaction.create(credencialRef, {
          empresaId, uid: principal.uid, codigo: codigoResuelto, incorporacionId: incorporacionRef.id,
          pinHash, activo: true, requiereCambio: true, fallosConsecutivos: 0, bloqueadoHasta: null,
          creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(), pinActualizadoEn: FieldValue.serverTimestamp(),
        });
        transaction.create(incorporacionRef, {
          empresaId, mecanismo: "DIRECTA", estado: "TEMP_CREDENTIAL", rol, permisosEfectivos,
          emitidaPorUid: emisorUid, uid: principal.uid, nombre, codigo: codigoResuelto,
          creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
        });
        obligacionId = crearObligacionAuditoria(db, transaction, {
          tipo: "CREDENCIAL_INICIAL_EMITIDA",
          resultado: "CONFIRMADO",
          actor: { tipo: "ADMIN_TENANT", uid: emisorUid },
          facultad: null,
          comando: null,
          agregado: { tipo: "OPERADOR", id: principal.uid },
          empresaObjetivoId: empresaId,
          revision: { esperada: null, resultante: null },
          correlacionId: incorporacionRef.id,
          causacionId: null,
          motivo: { codigo: "TENANT_OPERATIVO_CREAR_INCORPORACION_DIRECTA", resumen: null },
        }).obligacionId;
      });
      if (resultadoExistente) return resultadoExistente;
    } catch (error) {
      if (error instanceof HttpsError && error.message === CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO && !codigoFueProvisto && intento < MAX_INTENTOS_UNICIDAD) {
        if (creadaAhora) {
          try { await auth.deleteUser(principal.uid); } catch { logger.error("incorporacion_directa_auth_cleanup_failed", { empresaId, uid: principal.uid }); throw error; }
        }
        intento++;
        codigo = null;
        continue;
      }
      const incorporacionConfirmada = await incorporacionRef.get().catch(() => null);
      if (incorporacionConfirmada === null) {
        logger.error("incorporacion_directa_outcome_unknown", { empresaId, uid: principal.uid });
        throw error;
      }
      if (incorporacionConfirmada.exists) {
        const credencialConfirmada = await credencialRef.get().catch(() => null);
        if (credencialConfirmada === null) {
          logger.error("incorporacion_directa_credential_outcome_unknown", { empresaId, uid: principal.uid });
          throw error;
        }
        try { return validarIncorporacionDirectaExistente(incorporacionConfirmada.data(), credencialConfirmada.data(), codigoResuelto, rol, incorporacionRef.id); } catch { }
        throw error;
      }
      if (creadaAhora) await auth.deleteUser(principal.uid).catch(() => logger.error("incorporacion_directa_auth_cleanup_failed", { empresaId, uid: principal.uid }));
      throw error;
    }

    if (obligacionId) await emitirObligacionAuditoria(db, obligacionId);

    logger.info("incorporacion_directa_created", { empresaId, incorporacionId: incorporacionRef.id, uid: principal.uid, rol });
    const result: IncorporacionDirectaCreada = { incorporacionId: incorporacionRef.id, estado: "TEMP_CREDENTIAL", uid: principal.uid, codigo: codigoResuelto };
    if (pinTemporalGenerada) result.pinTemporal = pinTemporal;
    return result;
  }
}

async function obtenerPrincipalDirecto(auth: Auth, uid: string, nombre: string): Promise<{ principal: UserRecord; creadaAhora: boolean }> {
  try {
    const existente = await auth.getUser(uid);
    if (existente.disabled) throw new HttpsError("failed-precondition", "La identidad Firebase esta deshabilitada.");
    return { principal: existente, creadaAhora: false };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "auth/user-not-found")) {
      if (error instanceof HttpsError) throw error;
      throw error;
    }
  }
  try {
    const creada = await auth.createUser({ uid, displayName: nombre });
    return { principal: creada, creadaAhora: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "auth/uid-already-exists") {
      const existente = await auth.getUser(uid);
      if (existente.disabled) throw new HttpsError("failed-precondition", "La identidad Firebase esta deshabilitada.");
      return { principal: existente, creadaAhora: false };
    }
    throw error;
  }
}

function validarIncorporacionDirectaExistente(data: FirebaseFirestore.DocumentData | undefined, credencial: FirebaseFirestore.DocumentData | undefined, codigo: string, rol: string, incorporacionId: string): IncorporacionDirectaCreada {
  if (data?.mecanismo !== "DIRECTA" || data.estado !== "TEMP_CREDENTIAL" || data.codigo !== codigo
    || typeof data.uid !== "string" || data.rol !== rol
    || credencial?.uid !== data.uid || credencial.codigo !== codigo || credencial.activo !== true) {
    throw new HttpsError("already-exists", "Ya existe una incorporacion para ese codigo operativo.");
  }
  return { incorporacionId, estado: "TEMP_CREDENTIAL", uid: data.uid, codigo };
}
