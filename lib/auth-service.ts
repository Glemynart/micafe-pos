/**
 * auth-service.ts
 * Servicio de autenticación para MiCafe POS.
 * 
 * Estrategia: Firebase Authentication (email/password) como capa de identidad,
 * + colección `usuarios` en Firestore para datos del cajero (nombre, rol, pin, etc.)
 */

import { signOut as firebaseSignOut, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  arrayRemove,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { obtenerTokenActual } from "./fcm-token-helper";
import { activarSesionOperativa, iniciarSesionOperativa } from "./operational-auth-service";
import {
  esMembresiaActiva,
  esRolMembresia,
  obtenerMembresia,
  type Membresia,
  type RolMembresia,
} from "./membresias-service";
import {
  esSesionTransicionDirecta,
  obtenerIncorporacionSesionTransicionDirecta,
  resolverEmpresaIdActivo,
} from "./tenant-context";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RolUsuario = RolMembresia;

export interface Usuario {
  /** UID de Firebase Auth */
  uid: string;
  /** Nombre para mostrar en la UI (ej: "Carlos Pérez") */
  nombre: string;
  /** Nombre de usuario corto para el login (ej: "carlos") */
  username: string;
  /** Email usado en Firebase Auth (internal, generado automáticamente) */
  email: string;
  /** Rol efectivo de la membresía de la empresa activa. */
  rol: RolUsuario;
  /** Estado efectivo de la membresía de la empresa activa. */
  activo: boolean;
  /** Permisos efectivos de la membresía de la empresa activa. */
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

// ─── Funciones Públicas ───────────────────────────────────────────────────────

/** ADR-SAAS-013 §9 — resultado de `loginConCodigoYPin` cuando la credencial requiere activación. */
export interface ActivacionRequerida {
  requiereActivacion: true;
  incorporacionId: string;
  /** El PIN temporal que el usuario acaba de usar para entrar; lo exige `activarCredencial`. */
  pinTemporal: string;
}

export type ResultadoLoginOperativo = { requiereActivacion: false; usuario: Usuario } | ActivacionRequerida;

/**
 * Inicia la ruta operativa MT-U5a: código + PIN independiente de Firebase
 * Email/Password. La Function emite el custom token y sus claims tenant.
 *
 * ADR-SAAS-013 §9 — si la credencial es la inicial y aún no fue activada,
 * no lanza: devuelve `requiereActivacion: true` con la sesión `DIRECTA_TEMP`
 * ya iniciada (sin claims tenant), a la espera de `activarCredencial`.
 */
export async function loginConCodigoYPin(codigo: string, pin: string): Promise<ResultadoLoginOperativo> {
  const resultado = await iniciarSesionOperativa(codigo.trim(), pin);
  if (resultado.requiereCambio) {
    return { requiereActivacion: true, incorporacionId: resultado.incorporacionId, pinTemporal: pin };
  }
  return { requiereActivacion: false, usuario: await materializarSesionOperativa(resultado.user) };
}

/**
 * Completa la activación de la credencial inicial: fija el PIN definitivo y
 * canjea la sesión `DIRECTA_TEMP` por una sesión tenant plena.
 */
export async function activarCredencial(pinTemporal: string, pinNuevo: string): Promise<Usuario> {
  const firebaseUser = await activarSesionOperativa(pinTemporal, pinNuevo);
  return materializarSesionOperativa(firebaseUser);
}

async function materializarSesionOperativa(firebaseUser: FirebaseUser): Promise<Usuario> {
  const usuario = await getUsuarioFirestore(firebaseUser.uid);

  if (!usuario || !usuario.activo) {
    await firebaseSignOut(auth);
    throw new Error("Credenciales operativas inválidas.");
  }

  await setDoc(
    doc(db, "usuarios", usuario.uid),
    { ultimoAcceso: serverTimestamp() },
    { merge: true }
  );

  return usuario;
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
  const { empresaId } = await resolverEmpresaIdActivo();
  const [snap, membresia] = await Promise.all([
    getDoc(doc(db, "usuarios", uid)),
    obtenerMembresia(empresaId, uid),
  ]);
  if (!snap.exists() || !membresia || !esMembresiaActiva(membresia)) return null;
  return proyectarUsuario(snap.id, snap.data(), membresia);
}

function proyectarUsuario(uid: string, data: Record<string, unknown>, membresia: Membresia): Usuario {
  return {
    uid,
    nombre: typeof data.nombre === "string" ? data.nombre : uid,
    username: typeof data.username === "string" ? data.username : "",
    email: typeof data.email === "string" ? data.email : "",
    rol: membresia.rol,
    activo: esMembresiaActiva(membresia),
    permisos: membresia.permisos,
    ultimoAcceso: (data.ultimoAcceso as { toDate?: () => Date } | undefined)?.toDate?.(),
    creadoEn: (data.creadoEn as { toDate?: () => Date } | undefined)?.toDate?.(),
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
export interface ActivacionDirectaRestaurada {
  tipo: "DIRECTA_TEMP";
  incorporacionId: string;
}

export type EstadoAuth = Usuario | ActivacionDirectaRestaurada | null;

export interface SuscripcionAuth {
  cancelar: () => void;
  invalidarPendientes: () => void;
}

export function esActivacionDirectaRestaurada(
  estado: EstadoAuth,
): estado is ActivacionDirectaRestaurada {
  return estado !== null && "tipo" in estado && estado.tipo === "DIRECTA_TEMP";
}

export function onAuthStateChange(
  callback: (estado: EstadoAuth) => void
): SuscripcionAuth {
  let unsubUserDoc: (() => void) | null = null;
  let generacion = 0;

  const unsubAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    const generacionEvento = ++generacion;
    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    if (!firebaseUser) {
      if (generacionEvento === generacion) callback(null);
      return;
    }

    // Ver `esSesionTransicionDirecta` — una sesión `DIRECTA_TEMP` no tiene
    // (ni debe adquirir) claims tenant. `resolverEmpresaIdActivo` fuerza una
    // renovación de red del ID token cuando no encuentra `empresaId`, algo
    // que aquí SIEMPRE ocurre por diseño; esa renovación forzada, justo
    // después del canje del customToken, corre en carrera con la propia
    // renovación interna del SDK tras `signInWithCustomToken` y puede
    // invalidar la sesión recién creada antes de que la activación llegue a
    // usarla (H-4). Se corta aquí con la lectura cacheada del token (sin
    // red) — no hay `usuario` que proyectar para esta sesión de todas formas.
    const tokenCacheado = await firebaseUser.getIdTokenResult();
    if (generacionEvento !== generacion) return;
    if (esSesionTransicionDirecta(tokenCacheado.claims)) {
      const incorporacionId = obtenerIncorporacionSesionTransicionDirecta(tokenCacheado.claims);
      callback(incorporacionId ? { tipo: "DIRECTA_TEMP", incorporacionId } : null);
      return;
    }

    try {
      const { empresaId } = await resolverEmpresaIdActivo();
      if (generacionEvento !== generacion) return;
      let perfil: Record<string, unknown> | null = null;
      let membresia: Membresia | null = null;
      const emitir = () => {
        if (generacionEvento !== generacion) return;
        if (!perfil || !membresia || !esMembresiaActiva(membresia)) {
          callback(null);
          return;
        }
        callback(proyectarUsuario(firebaseUser.uid, perfil, membresia));
      };
      const unsubPerfil = onSnapshot(doc(db, "usuarios", firebaseUser.uid), (snap) => {
        perfil = snap.exists() ? snap.data() : null;
        emitir();
      }, () => { if (generacionEvento === generacion) callback(null); });
      const unsubMembresia = onSnapshot(doc(db, "membresias", `${empresaId}_${firebaseUser.uid}`), (snap) => {
        const data = snap.data();
        membresia = data && esMembresiaCanonicaLocal(data) ? data : null;
        emitir();
      }, () => { if (generacionEvento === generacion) callback(null); });
      unsubUserDoc = () => { unsubPerfil(); unsubMembresia(); };
    } catch {
      if (generacionEvento === generacion) callback(null);
    }
  });

  return {
    cancelar: () => {
      generacion += 1;
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    },
    invalidarPendientes: () => {
      generacion += 1;
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
    },
  };
}

// ─── Helpers Internos ─────────────────────────────────────────────────────────

/** Convierte un username corto en email para Firebase Auth */
export function usernameToEmail(username: string): string {
  return `${username}${EMAIL_DOMAIN}`;
}

export function esRolUsuario(rol: unknown): rol is RolUsuario {
  return esRolMembresia(rol);
}

function esMembresiaCanonicaLocal(valor: unknown): valor is Membresia {
  return !!valor && typeof valor === "object"
    && esRolMembresia((valor as Membresia).rol)
    && Array.isArray((valor as Membresia).permisos)
    && ((valor as Membresia).estado === "activa" || (valor as Membresia).estado === "inactiva")
    && typeof (valor as Membresia).activo === "boolean";
}
