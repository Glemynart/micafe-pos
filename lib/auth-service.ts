/**
 * auth-service.ts
 * Servicio de autenticación para MiCafe POS.
 * 
 * Estrategia: Firebase Authentication (email/password) como capa de identidad,
 * + colección `usuarios` en Firestore para datos del cajero (nombre, rol, pin, etc.)
 */

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  arrayRemove,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { obtenerTokenActual } from "./fcm-token-helper";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RolUsuario = "admin" | "cajero" | "cocinero" | "marketing";

export interface Usuario {
  /** UID de Firebase Auth */
  uid: string;
  /** Nombre para mostrar en la UI (ej: "Carlos Pérez") */
  nombre: string;
  /** Nombre de usuario corto para el login (ej: "carlos") */
  username: string;
  /** Email usado en Firebase Auth (internal, generado automáticamente) */
  email: string;
  /** Rol del cajero */
  rol: RolUsuario;
  /** Si el usuario está activo en el sistema */
  activo: boolean;
  /** Módulos a los que tiene acceso según su rol */
  permisos: string[];
  /** Timestamp del último inicio de sesión */
  ultimoAcceso?: Date;
  /** Timestamp de creación */
  creadoEn?: Date;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** 
 * Dominio "ficticio" para convertir el username en email de Firebase Auth.
 * Firebase Auth requiere formato email, así que usamos este dominio interno.
 */
const EMAIL_DOMAIN = "@micafe-pos.internal";

const PERMISOS_POR_ROL: Record<RolUsuario, string[]> = {
  admin: ["sell", "inventory", "recipes", "purchases", "reports", "shifts", "waste", "gastos", "reservas", "permissions", "settings", "historial", "finanzas"],
  cajero: ["sell", "reports", "gastos", "reservas"],
  cocinero: ["sell"],
  marketing: [],
};

// ─── Funciones Públicas ───────────────────────────────────────────────────────

/**
 * Inicia sesión con username y contraseña.
 * Retorna los datos del cajero desde Firestore.
 */
export async function loginConUsername(
  username: string,
  password: string
): Promise<Usuario> {
  const email = usernameToEmail(username.toLowerCase().trim());

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const usuario = await getUsuarioFirestore(userCredential.user.uid);

    if (!usuario) {
      await firebaseSignOut(auth);
      throw new Error("Usuario no encontrado en la base de datos.");
    }

    if (!usuario.activo) {
      await firebaseSignOut(auth);
      throw new Error("Tu cuenta está desactivada. Contacta al administrador.");
    }

    // Actualizamos el último acceso
    await setDoc(
      doc(db, "usuarios", usuario.uid),
      { ultimoAcceso: serverTimestamp() },
      { merge: true }
    );

    return usuario;
  } catch (error: unknown) {
    // Traducimos errores de Firebase a mensajes amigables
    const code = (error as { code?: string }).code;
    if (
      code === "auth/user-not-found" ||
      code === "auth/wrong-password" ||
      code === "auth/invalid-credential"
    ) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.");
    }
    // Re-lanzar si ya es un Error nuestro con mensaje claro
    throw error;
  }
}

/**
 * Cierra la sesión del cajero actual.
 *
 * Limpia el token FCM del usuario antes de signOut (D-NOTIF-02 D7). Esta limpieza
 * es **best-effort** (R-a5): depende de re-derivar el token vía `obtenerTokenActual()`.
 * Si el token no es derivable (offline, permiso revocado, Messaging no soportado o
 * `getToken()` nulo) NO se ejecuta el `arrayRemove` y el token puede permanecer
 * registrado hasta su purga server-side o expiración natural. El logout procede
 * igualmente; un fallo en la limpieza nunca bloquea el cierre de sesión.
 */
export async function logout(): Promise<void> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await obtenerTokenActual();
      if (token) {
        const userRef = doc(db, "usuarios", currentUser.uid);
        await setDoc(
          userRef,
          { fcmTokens: arrayRemove(token) },
          { merge: true }
        );
      }
    } catch (err) {
      console.error('[auth] Error limpiando token en logout:', err);
    }
  }
  await firebaseSignOut(auth);
}

/**
 * Obtiene los datos del usuario desde Firestore dado su UID.
 */
export async function getUsuarioFirestore(uid: string): Promise<Usuario | null> {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
    nombre: data.nombre,
    username: data.username,
    email: data.email,
    rol: data.rol,
    activo: data.activo,
    permisos: data.permisos ?? PERMISOS_POR_ROL[data.rol as RolUsuario] ?? [],
    ultimoAcceso: data.ultimoAcceso?.toDate(),
    creadoEn: data.creadoEn?.toDate(),
  };
}

/**
 * Resuelve el usuario autenticado actual delegando en getUsuarioFirestore.
 * Lanza mensajeSinSesion si no hay sesión activa; usa el uid como nombre
 * de respaldo si el documento de Firestore no existe.
 */
export async function getCurrentUserInfo(
  mensajeSinSesion: string
): Promise<{ uid: string; nombre: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error(mensajeSinSesion);

  const usuario = await getUsuarioFirestore(currentUser.uid);
  const nombre = usuario ? usuario.nombre : currentUser.uid;

  return { uid: currentUser.uid, nombre };
}

/**
 * Suscripción reactiva al estado de autenticación de Firebase.
 * Útil para inicializar el contexto al recargar la página.
 */
export function onAuthStateChange(
  callback: (usuario: Usuario | null) => void
): () => void {
  let unsubUserDoc: (() => void) | null = null;

  const unsubAuth = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    if (!firebaseUser) {
      callback(null);
      return;
    }

    unsubUserDoc = onSnapshot(
      doc(db, "usuarios", firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) {
          callback(null);
          return;
        }
        const data = snap.data();
        callback({
          uid: snap.id,
          nombre: data.nombre,
          username: data.username,
          email: data.email,
          rol: data.rol,
          activo: data.activo,
          permisos: data.permisos ?? PERMISOS_POR_ROL[data.rol as RolUsuario] ?? [],
          ultimoAcceso: data.ultimoAcceso?.toDate(),
          creadoEn: data.creadoEn?.toDate(),
        });
      },
      () => {
        callback(null);
      }
    );
  });

  return () => {
    unsubAuth();
    if (unsubUserDoc) unsubUserDoc();
  };
}

/**
 * Busca un usuario por su username en Firestore (usado para validaciones).
 */
export async function buscarUsuarioPorUsername(username: string): Promise<Usuario | null> {
  const q = query(
    collection(db, "usuarios"),
    where("username", "==", username.toLowerCase().trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  const data = docSnap.data();
  return {
    uid: docSnap.id,
    nombre: data.nombre,
    username: data.username,
    email: data.email,
    rol: data.rol,
    activo: data.activo,
    permisos: data.permisos ?? [],
    ultimoAcceso: data.ultimoAcceso?.toDate(),
    creadoEn: data.creadoEn?.toDate(),
  };
}

// ─── Helpers Internos ─────────────────────────────────────────────────────────

/** Convierte un username corto en email para Firebase Auth */
export function usernameToEmail(username: string): string {
  return `${username}${EMAIL_DOMAIN}`;
}

/** Retorna los permisos por defecto según el rol */
export function getPermisosPorRol(rol: RolUsuario): string[] {
  return PERMISOS_POR_ROL[rol] ?? [];
}
