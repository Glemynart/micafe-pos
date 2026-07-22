import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
} from "firebase/auth";
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, firebaseConfig, app } from "@/lib/firebase";
import { usernameToEmail, type RolUsuario, type Usuario } from "@/lib/auth-service";
import { esMembresiaCanonica, normalizarPermisos, type Membresia } from "@/lib/membresias-service";
import { getEmpresaId } from "@/lib/tenant";

export { type RolUsuario, type Usuario };

export const MODULOS = [
  "sell", "salon", "kitchen", "inventory", "recipes", "purchases",
  "reports", "shifts", "waste", "gastos", "permissions", "settings",
  "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard", "historial", "reservas", "finanzas",
];

type ActualizacionMembresia = {
  uid: string;
  rol?: RolUsuario;
  permisos?: string[];
  estado?: "activa" | "inactiva";
};

function functionsCliente() {
  const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";
  return getFunctions(app, region);
}

async function llamarActualizacion(data: ActualizacionMembresia): Promise<void> {
  const callable = httpsCallable<ActualizacionMembresia, void>(functionsCliente(), "actualizarMembresia");
  await callable(data);
}

function proyectarUsuario(uid: string, perfil: Record<string, unknown>, membresia: Membresia): Usuario {
  return {
    uid,
    nombre: typeof perfil.nombre === "string" ? perfil.nombre : uid,
    username: typeof perfil.username === "string" ? perfil.username : "",
    email: typeof perfil.email === "string" ? perfil.email : "",
    rol: membresia.rol,
    activo: membresia.estado === "activa" && membresia.activo === true,
    permisos: membresia.permisos,
    ultimoAcceso: (perfil.ultimoAcceso as { toDate?: () => Date } | undefined)?.toDate?.(),
    creadoEn: (perfil.creadoEn as { toDate?: () => Date } | undefined)?.toDate?.(),
  };
}

/** Lista perfiles globales enriquecidos exclusivamente con su membresía tenant. */
export function suscribirUsuarios(callback: (usuarios: Usuario[]) => void): Unsubscribe {
  let cerrar = () => {};
  let cancelado = false;
  void (async () => {
    try {
      const empresaId = await getEmpresaId();
      const perfiles = new Map<string, Record<string, unknown>>();
      const membresias = new Map<string, Membresia>();
      const emitir = () => {
        callback([...membresias.values()]
          .filter((membresia) => membresia.estado === "activa" || membresia.estado === "inactiva")
          .map((membresia) => {
            const perfil = perfiles.get(membresia.uid);
            return perfil ? proyectarUsuario(membresia.uid, perfil, membresia) : null;
          })
          .filter((usuario): usuario is Usuario => usuario !== null)
          .sort((a, b) => a.nombre.localeCompare(b.nombre)));
      };
      const cerrarPerfiles = onSnapshot(collection(db, "usuarios"), (snap) => {
        perfiles.clear();
        snap.docs.forEach((doc) => perfiles.set(doc.id, doc.data()));
        emitir();
      }, () => callback([]));
      const cerrarMembresias = onSnapshot(query(collection(db, "membresias"), where("empresaId", "==", empresaId)), (snap) => {
        membresias.clear();
        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (esMembresiaCanonica(data)) membresias.set(data.uid, data);
        });
        emitir();
      }, () => callback([]));
      cerrar = () => { cerrarPerfiles(); cerrarMembresias(); };
      if (cancelado) cerrar();
    } catch {
      callback([]);
    }
  })();
  return () => { cancelado = true; cerrar(); };
}

export async function crearUsuario(username: string, password: string, nombre: string, rol: RolUsuario): Promise<Usuario> {
  const email = usernameToEmail(username.toLowerCase().trim());
  const appName = `membership-create-${crypto.randomUUID()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  let creado: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | null = null;
  try {
    creado = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const callable = httpsCallable<{
      uid: string; nombre: string; username: string; email: string; rol: RolUsuario;
    }, void>(functionsCliente(), "crearUsuarioConMembresia");
    await callable({ uid: creado.user.uid, nombre, username: username.toLowerCase().trim(), email, rol });
    return {
      uid: creado.user.uid,
      nombre,
      username: username.toLowerCase().trim(),
      email,
      rol,
      activo: true,
      permisos: [],
    };
  } catch (error) {
    if (creado) await deleteUser(creado.user).catch(() => {});
    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
  }
}

export async function actualizarRolUsuario(uid: string, rol: RolUsuario): Promise<void> {
  await llamarActualizacion({ uid, rol });
}

export async function toggleUsuarioActivo(uid: string, activo: boolean): Promise<void> {
  await llamarActualizacion({ uid, estado: activo ? "activa" : "inactiva" });
}

export async function actualizarPermisosUsuario(uid: string, permisos: string[]): Promise<void> {
  const normalizados = normalizarPermisos(permisos);
  if (!normalizados) throw new Error("Permisos inválidos.");
  await llamarActualizacion({ uid, permisos: normalizados });
}
