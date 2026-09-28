import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esRolTenant, type RolTenant } from "../contracts";

const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";

interface MembresiaCanonica {
  empresaId?: unknown;
  uid?: unknown;
  rol?: unknown;
  permisos?: unknown;
  estado?: unknown;
  activo?: unknown;
}

function errorCredenciales(): HttpsError {
  return new HttpsError("unauthenticated", ERROR_CREDENCIALES);
}

function esMembresiaActivaYValida(
  data: MembresiaCanonica | undefined,
  empresaId: string,
  uid: string,
): data is MembresiaCanonica & { rol: RolTenant; permisos: string[] } {
  return !!data
    && data.empresaId === empresaId
    && data.uid === uid
    && data.estado === "activa"
    && data.activo === true
    && esRolTenant(data.rol)
    && Array.isArray(data.permisos)
    && data.permisos.every((permiso) => typeof permiso === "string" && permiso.length > 0);
}

/** La membresía, no `usuarios`, decide rol, permisos y estado. */
export async function validarMembresiaActiva(
  empresaId: string,
  uid: string,
  dbParam?: any,
): Promise<{ rol: RolTenant; permisos: string[] }> {
  const db = dbParam ?? getFirestore();
  let membresiaSnap;
  try {
    const res = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${uid}`).get(),
      getAuth().getUser(uid).catch(() => null),
    ]);
    membresiaSnap = res[0];
  } catch {
    membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${uid}`).get();
  }

  const membresia = membresiaSnap.data() as MembresiaCanonica | undefined;
  if (!membresiaSnap.exists || !esMembresiaActivaYValida(membresia, empresaId, uid)) {
    throw errorCredenciales();
  }
  return { rol: membresia.rol, permisos: membresia.permisos };
}

/** Revalida claim, Empresa y membresía para lecturas tenant de backend. */
export async function exigirTenantActivo(
  request: { auth?: { uid: string; token: Record<string, unknown> } },
  dbParam?: any,
) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || !empresaId.trim()) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  const estado = snap.data()?.estado;
  const paisFiscal = snap.data()?.paisFiscal;
  if (!snap.exists || (estado !== "activa" && estado !== "trial")) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const membresiaActual = await validarMembresiaActiva(empresaId, request.auth.uid, db);
  if (request.auth.token.rol !== membresiaActual.rol) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return {
    id: empresaId,
    estado: estado as string,
    rol: membresiaActual.rol,
    permisos: membresiaActual.permisos,
    paisFiscal: typeof paisFiscal === "string" ? paisFiscal : undefined,
  };
}
