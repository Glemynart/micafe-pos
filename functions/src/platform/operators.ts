import { createHash } from "node:crypto";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { crearObligacionAuditoria, emitirObligacionAuditoria, registrarHechoAuditoria } from "./audit";
import {
  facultadesValidas,
  type EnvelopePlataforma,
  type FacultadPlataforma,
  type OperadorSaas,
  type TipoAuditoria,
} from "./contracts";
import { OPERADORES_COLLECTION } from "./authorization";
import { exigirId, validarEnvelope } from "./validation";

const COMANDOS_COLLECTION = "saas_comandos";
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface EntradaOperador extends EnvelopePlataforma {
  objetivoUid: string;
  expectedVersionAutorizacion?: number;
  facultades?: FacultadPlataforma[];
}

async function proyectarClaims(auth: Auth, operador: OperadorSaas): Promise<void> {
  const user = await auth.getUser(operador.uid);
  await auth.setCustomUserClaims(operador.uid, {
    ...(user.customClaims ?? {}),
    saas: {
      operador: operador.estado === "ACTIVO",
      versionAutorizacion: operador.versionAutorizacion,
      facultades: operador.estado === "ACTIVO" ? operador.facultades : [],
    },
  });
  await auth.revokeRefreshTokens(operador.uid);
}

function tipoEvento(tipo: string): TipoAuditoria {
  const map: Record<string, TipoAuditoria> = {
    IncorporarOperador: "OPERADOR_INCORPORADO",
    CambiarFacultadesOperador: "OPERADOR_FACULTADES_CAMBIADAS",
    SuspenderOperador: "OPERADOR_SUSPENDIDO",
    ReactivarOperador: "OPERADOR_REACTIVADO",
    RevocarOperador: "OPERADOR_REVOCADO",
  };
  return map[tipo];
}

export async function ejecutarComandoOperador(
  db: Firestore,
  actorUid: string,
  tipo: "IncorporarOperador" | "CambiarFacultadesOperador" | "SuspenderOperador" | "ReactivarOperador" | "RevocarOperador",
  entrada: EntradaOperador,
  auth: Auth = getAuth(),
) {
  validarEnvelope(entrada);
  const objetivoUid = exigirId(entrada.objetivoUid, "OBJETIVO_UID_INVALIDO");
  if (objetivoUid === actorUid) {
    await registrarHechoAuditoria(db, {
      tipo: "AUTOESCALAMIENTO_DENEGADO",
      resultado: "DENEGADO",
      actor: { tipo: "OPERADOR", uid: actorUid },
      facultad: "OPERADORES_GOBERNAR",
      comando: { id: entrada.commandId, tipo },
      agregado: { tipo: "OPERADOR", id: objetivoUid },
      empresaObjetivoId: null,
      revision: { esperada: entrada.expectedVersionAutorizacion ?? null, resultante: null },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: "AUTOESCALAMIENTO_DENEGADO", resumen: null },
    });
    throw new HttpsError("permission-denied", "AUTOESCALAMIENTO_DENEGADO");
  }
  if (
    ["IncorporarOperador", "CambiarFacultadesOperador", "ReactivarOperador"].includes(tipo)
    && !facultadesValidas(entrada.facultades)
  ) {
    throw new HttpsError("invalid-argument", "FACULTADES_INVALIDAS");
  }
  await auth.getUser(objetivoUid);

  const huella = fingerprint({ tipo, ...entrada });
  const comandoRef = db.collection(COMANDOS_COLLECTION).doc(`operador_${entrada.idempotencyKey}`);
  const objetivoRef = db.collection(OPERADORES_COLLECTION).doc(objetivoUid);
  const resultado = await db.runTransaction(async (tx) => {
    const [comandoSnap, objetivoSnap] = await Promise.all([
      tx.get(comandoRef),
      tx.get(objetivoRef),
    ]);
    if (comandoSnap.exists) {
      const anterior = comandoSnap.data()!;
      if (anterior.fingerprint !== huella) {
        throw new HttpsError("already-exists", "IDEMPOTENCY_CONFLICT");
      }
      return { ...anterior.resultado, obligacionId: anterior.obligacionId, idempotente: true };
    }

    const actual = objetivoSnap.exists ? objetivoSnap.data() as OperadorSaas : null;
    let siguiente: OperadorSaas;
    if (tipo === "IncorporarOperador") {
      if (actual) throw new HttpsError("already-exists", "OPERADOR_ALREADY_EXISTS");
      siguiente = {
        schemaVersion: 1,
        uid: objetivoUid,
        estado: "ACTIVO",
        facultades: entrada.facultades!,
        versionAutorizacion: 1,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
        creadoPor: { tipo: "OPERADOR", uid: actorUid },
        ultimoCambioPorUid: actorUid,
        motivoCambioCodigo: entrada.motivoCodigo,
      };
      tx.create(objetivoRef, siguiente);
    } else {
      if (!actual) throw new HttpsError("not-found", "OPERADOR_NOT_FOUND");
      if (actual.estado === "REVOCADO") {
        throw new HttpsError("failed-precondition", "OPERADOR_REVOCADO_TERMINAL");
      }
      if (actual.versionAutorizacion !== entrada.expectedVersionAutorizacion) {
        throw new HttpsError("failed-precondition", "CONFLICTO_REVISION");
      }
      const estadosPermitidos: Record<string, string> = {
        CambiarFacultadesOperador: "ACTIVO",
        SuspenderOperador: "ACTIVO",
        ReactivarOperador: "SUSPENDIDO",
      };
      if (tipo !== "RevocarOperador" && actual.estado !== estadosPermitidos[tipo]) {
        throw new HttpsError("failed-precondition", "TRANSICION_OPERADOR_INVALIDA");
      }
      const estado = tipo === "SuspenderOperador"
        ? "SUSPENDIDO"
        : tipo === "RevocarOperador"
          ? "REVOCADO"
          : "ACTIVO";
      siguiente = {
        ...actual,
        estado,
        facultades: estado === "ACTIVO" ? entrada.facultades! : [],
        versionAutorizacion: actual.versionAutorizacion + 1,
        actualizadoEn: FieldValue.serverTimestamp(),
        ultimoCambioPorUid: actorUid,
        motivoCambioCodigo: entrada.motivoCodigo,
      };
      tx.update(objetivoRef, siguiente);
    }

    const { obligacionId } = crearObligacionAuditoria(db, tx, {
      tipo: tipoEvento(tipo),
      resultado: "CONFIRMADO",
      actor: { tipo: "OPERADOR", uid: actorUid },
      facultad: "OPERADORES_GOBERNAR",
      comando: { id: entrada.commandId, tipo },
      agregado: { tipo: "OPERADOR", id: objetivoUid },
      empresaObjetivoId: null,
      revision: {
        esperada: entrada.expectedVersionAutorizacion ?? null,
        resultante: siguiente.versionAutorizacion,
      },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: entrada.motivoCodigo, resumen: null },
    });
    const durable = {
      uid: objetivoUid,
      estado: siguiente.estado,
      facultades: siguiente.facultades,
      versionAutorizacion: siguiente.versionAutorizacion,
    };
    tx.create(comandoRef, {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      fingerprint: huella,
      resultado: durable,
      obligacionId,
      creadoEn: FieldValue.serverTimestamp(),
    });
    return { ...durable, obligacionId, idempotente: false };
  });

  const operadorSnap = await objetivoRef.get();
  await proyectarClaims(auth, operadorSnap.data() as OperadorSaas);
  await emitirObligacionAuditoria(db, resultado.obligacionId);
  return resultado;
}
