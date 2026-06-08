import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
  type Unsubscribe,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signOut,
  getAuth,
} from "firebase/auth";
import { initializeApp, getApps as getAppsLocal } from "firebase/app";
import { db, firebaseConfig } from "@/lib/firebase";
import { usernameToEmail, getPermisosPorRol, type RolUsuario, type Usuario } from "@/lib/auth-service";

export { type RolUsuario, type Usuario, getPermisosPorRol };

export const MODULOS = [
  "sell", "kitchen", "inventory", "recipes", "purchases",
  "reports", "shifts", "waste", "gastos", "permissions", "settings",
  "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard", "historial"
];

export function suscribirUsuarios(callback: (usuarios: Usuario[]) => void): Unsubscribe {
  const q = query(collection(db, "usuarios"));

  return onSnapshot(q, (snap) => {
    const usuarios: Usuario[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        nombre: data.nombre,
        username: data.username,
        email: data.email,
        rol: data.rol,
        activo: data.activo,
        permisos: data.permisos ?? getPermisosPorRol(data.rol as RolUsuario),
        ultimoAcceso: data.ultimoAcceso?.toDate?.(),
        creadoEn: data.creadoEn?.toDate?.(),
      } as Usuario;
    });
    callback(usuarios);
  });
}

export async function crearUsuario(
  username: string,
  password: string,
  nombre: string,
  rol: RolUsuario
): Promise<Usuario> {
  const email = usernameToEmail(username.toLowerCase().trim());

  const secondaryAppName = `secondary-${crypto.randomUUID()}`;
  const secondaryApps = getAppsLocal();
  const existingNames = new Set(secondaryApps.map((a) => a.name));
  let appName = secondaryAppName;
  let counter = 0;
  while (existingNames.has(appName)) {
    appName = `${secondaryAppName}-${++counter}`;
  }

  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = userCredential.user.uid;

    await signOut(secondaryAuth);

    const permisos = getPermisosPorRol(rol);
    const usuarioData = {
      uid,
      nombre,
      username: username.toLowerCase().trim(),
      email,
      rol,
      activo: true,
      permisos,
      creadoEn: serverTimestamp(),
    };

    await setDoc(doc(db, "usuarios", uid), usuarioData);

    return {
      ...usuarioData,
      creadoEn: undefined,
      ultimoAcceso: undefined,
    } as Usuario;
  } catch (error) {
    await signOut(secondaryAuth).catch(() => {});
    throw error;
  }
}

export async function actualizarRolUsuario(uid: string, rol: RolUsuario): Promise<void> {
  const permisos = getPermisosPorRol(rol);
  await updateDoc(doc(db, "usuarios", uid), {
    rol,
    permisos,
    actualizadoEn: serverTimestamp(),
  });
}

export async function toggleUsuarioActivo(uid: string, activo: boolean): Promise<void> {
  await updateDoc(doc(db, "usuarios", uid), {
    activo,
    actualizadoEn: serverTimestamp(),
  });
}

export async function actualizarPermisosUsuario(
  uid: string,
  permisos: string[]
): Promise<void> {
  await updateDoc(doc(db, "usuarios", uid), {
    permisos,
    actualizadoEn: serverTimestamp(),
  });
}

export interface PermisosRol {
  rol: string;
  permisos: string[];
}

export async function guardarPermisosRol(rol: string, permisos: string[]): Promise<void> {
  await setDoc(
    doc(db, "permisos_roles", rol),
    { rol, permisos, actualizadoEn: serverTimestamp() },
    { merge: true }
  );
}

export async function getPermisosRol(rol: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "permisos_roles", rol));
  if (snap.exists()) {
    return snap.data().permisos as string[];
  }
  return getPermisosPorRol(rol as RolUsuario);
}

export function suscribirPermisosRoles(
  callback: (permisosRoles: PermisosRol[]) => void
): Unsubscribe {
  const q = query(collection(db, "permisos_roles"));

  return onSnapshot(q, (snap) => {
    const roles: PermisosRol[] = snap.docs.map((d) => ({
      rol: d.id,
      ...(d.data() as Omit<PermisosRol, "rol">),
    }));
    callback(roles);
  });
}

export { MODULOS };
