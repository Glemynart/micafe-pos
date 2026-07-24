import { getAuth, type Auth } from "firebase-admin/auth";
import { createHash } from "node:crypto";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import { OPERADORES_COLLECTION } from "./authorization";
import { facultadesValidas, type FacultadPlataforma, type OperadorSaas } from "./contracts";
import { exigirId } from "./validation";

export async function bootstrapOperadorInicial(
  db: Firestore,
  entrada: { uid: string; facultades: FacultadPlataforma[] },
  auth: Auth = getAuth(),
) {
  const uid = exigirId(entrada.uid, "BOOTSTRAP_UID_INVALIDO");
  if (!facultadesValidas(entrada.facultades)) {
    throw new HttpsError("invalid-argument", "FACULTADES_INVALIDAS");
  }
  await auth.getUser(uid);
  const ref = db.collection(OPERADORES_COLLECTION).doc(uid);
  const bootstrapCommandId = `bootstrap-${createHash("sha256").update(uid).digest("hex").slice(0, 32)}`;
  const resultado = await db.runTransaction(async (tx) => {
    const existentes = await tx.get(db.collection(OPERADORES_COLLECTION).limit(1));
    if (!existentes.empty) {
      throw new HttpsError("failed-precondition", "PLATFORM_INITIAL_BOOTSTRAP_CLOSED");
    }
    const operador: OperadorSaas = {
      schemaVersion: 1,
      uid,
      estado: "ACTIVO",
      facultades: entrada.facultades,
      versionAutorizacion: 1,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
      creadoPor: { tipo: "BOOTSTRAP", uid: null },
      ultimoCambioPorUid: uid,
      motivoCambioCodigo: "PLATFORM_INITIAL_BOOTSTRAP",
    };
    tx.create(ref, operador);
    const { obligacionId } = crearObligacionAuditoria(db, tx, {
      tipo: "OPERADOR_INCORPORADO",
      resultado: "CONFIRMADO",
      origen: "SISTEMA",
      actor: { tipo: "SISTEMA", uid: null },
      facultad: null,
      comando: { id: bootstrapCommandId, tipo: "BootstrapOperadorInicial" },
      agregado: { tipo: "OPERADOR", id: uid },
      empresaObjetivoId: null,
      revision: { esperada: null, resultante: 1 },
      correlacionId: bootstrapCommandId,
      causacionId: null,
      motivo: { codigo: "PLATFORM_INITIAL_BOOTSTRAP", resumen: null },
    });
    return { obligacionId, operador };
  });
  await proyectarOperador(auth, resultado.operador);
  await emitirObligacionAuditoria(db, resultado.obligacionId);
  return { uid, estado: "ACTIVO", versionAutorizacion: 1 };
}

export async function proyectarOperador(auth: Auth, operador: OperadorSaas) {
  const user = await auth.getUser(operador.uid);
  const proyeccion = {
    operador: operador.estado === "ACTIVO",
    versionAutorizacion: operador.versionAutorizacion,
    facultades: operador.estado === "ACTIVO" ? operador.facultades : [],
  };
  await auth.setCustomUserClaims(operador.uid, { ...(user.customClaims ?? {}), saas: proyeccion });
  await auth.revokeRefreshTokens(operador.uid);
}

export async function reconciliarClaimsOperadores(
  db: Firestore,
  auth: Auth = getAuth(),
): Promise<number> {
  let reconciliados = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  do {
    let consulta = db.collection(OPERADORES_COLLECTION)
      .orderBy("actualizadoEn", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(100);
    if (cursor) consulta = consulta.startAfter(cursor);
    const snap = await consulta.get();
    for (const doc of snap.docs) {
      const operador = doc.data() as OperadorSaas;
      const user = await auth.getUser(operador.uid);
      const esperado = {
        operador: operador.estado === "ACTIVO",
        versionAutorizacion: operador.versionAutorizacion,
        facultades: operador.estado === "ACTIVO" ? operador.facultades : [],
      };
      if (JSON.stringify(user.customClaims?.saas ?? null) !== JSON.stringify(esperado)) {
        await proyectarOperador(auth, operador);
        reconciliados += 1;
      }
    }
    cursor = snap.docs.at(-1);
  } while (cursor);
  return reconciliados;
}
