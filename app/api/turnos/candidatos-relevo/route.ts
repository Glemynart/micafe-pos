import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

type MembresiaDatos = {
  uid?: unknown;
  rol?: unknown;
  estado?: unknown;
  activo?: unknown;
};

function esMembresiaActiva(data: MembresiaDatos | undefined): data is MembresiaDatos & { uid: string } {
  return !!data
    && typeof data.uid === "string"
    && data.estado === "activa"
    && data.activo === true;
}

/**
 * Lista exclusivamente los posibles relevos del tenant de la sesión.
 * La Rules no permite a cajeros listar membresías, por lo que esta lectura
 * privilegiada conserva el flujo de relevo sin volver a usar `usuarios.rol`.
 */
export async function GET(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (typeof decoded.empresaId !== "string") {
      return NextResponse.json({ error: "Sesión tenant inválida" }, { status: 403 });
    }

    const db = getAdminDb();
    const propiaSnap = await db.collection("membresias").doc(`${decoded.empresaId}_${decoded.uid}`).get();
    if (!esMembresiaActiva(propiaSnap.data() as MembresiaDatos | undefined)) {
      return NextResponse.json({ error: "Membresía inactiva" }, { status: 403 });
    }

    const membresiasSnap = await db.collection("membresias")
      .where("empresaId", "==", decoded.empresaId)
      .get();
    const candidatos = membresiasSnap.docs
      .map((doc) => doc.data() as MembresiaDatos)
      .filter(esMembresiaActiva)
      .filter((membresia) => (membresia.rol === "cajero" || membresia.rol === "supervisor")
        && membresia.uid !== decoded.uid);
    const perfiles = candidatos.length > 0
      ? await db.getAll(...candidatos.map((membresia) => db.collection("usuarios").doc(membresia.uid)))
      : [];

    return NextResponse.json({
      candidatos: perfiles
        .filter((perfil) => perfil.exists)
        .map((perfil) => ({
          uid: perfil.id,
          nombre: typeof perfil.data()?.nombre === "string" ? perfil.data()!.nombre : perfil.id,
        })),
    });
  } catch (error) {
    console.error("[turnos] Error cargando candidatos de relevo:", error);
    return NextResponse.json({ error: "No fue posible cargar candidatos de relevo" }, { status: 500 });
  }
}
