'use client'

/**
 * auth-context.tsx
 * Proveedor global de sesión del cajero para MiCafe POS.
 * 
 * - Escucha el estado de Firebase Auth al montar.
 * - Expone el usuario activo, funciones de login/logout y estado de carga.
 * - Permite que cualquier componente acceda a la sesión con `useAuthContext()`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  activarCredencial as activarCredencialServicio,
  loginConCodigoYPin,
  logout as authLogout,
  onAuthStateChange,
  type Usuario,
} from "@/lib/auth-service";
import { auth } from "@/lib/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";

// ─── Tipos del Contexto ───────────────────────────────────────────────────────

/** ADR-SAAS-013 §9 — credencial inicial pendiente de fijar PIN definitivo. */
interface ActivacionPendiente {
  incorporacionId: string;
  pinTemporal: string;
}

interface AuthContextValue {
  /** Cajero actualmente autenticado, o null si no hay sesión */
  usuario: Usuario | null;
  /** true mientras se verifica el estado inicial de auth (splash guard) */
  cargando: boolean;
  /** true si se está ejecutando el proceso de login */
  iniciandoSesion: boolean;
  /** Mensaje de error del último intento de login */
  errorLogin: string | null;
  /** Ruta primaria MT-U5a: código operativo + PIN. */
  login: (codigo: string, pin: string) => Promise<void>;
  /** Cierra la sesión del cajero actual */
  logout: () => Promise<void>;
  /** Limpia el mensaje de error de login */
  limpiarError: () => void;
  /**
   * No nulo cuando `login` encontró una credencial inicial sin activar
   * (ADR-SAAS-013 §9). La UI debe renderizar el paso "define tu PIN" en vez
   * del error genérico; no afecta a ningún login con credencial normal.
   */
  activacionPendiente: ActivacionPendiente | null;
  /** true mientras se procesa `activarCredencial` */
  activandoCredencial: boolean;
  /** Fija el PIN definitivo y completa el login con la sesión tenant resultante. */
  activarCredencial: (pinNuevo: string) => Promise<void>;
  /** Descarta la activación pendiente y cierra la sesión temporal DIRECTA_TEMP. */
  cancelarActivacion: () => Promise<void>;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [iniciandoSesion, setIniciandoSesion] = useState(false);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [activacionPendiente, setActivacionPendiente] = useState<ActivacionPendiente | null>(null);
  const [activandoCredencial, setActivandoCredencial] = useState(false);

  // Suscripción reactiva: restaura la sesión al recargar la página
  useEffect(() => {
    let isMounted = true;
    
    // Timeout de seguridad: si Firebase se cuelga (muy común en móviles/redes locales), 
    // forzamos la salida de la pantalla de carga después de 8 segundos.
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        console.warn("Auth state timeout: Forzando fin de carga.");
        setCargando(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChange((usuarioActual) => {
      if (!isMounted) return;
      clearTimeout(fallbackTimer);
      setUsuario(usuarioActual);
      setCargando(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (codigo: string, pin: string) => {
    setIniciandoSesion(true);
    setErrorLogin(null);
    try {
      const resultado = await loginConCodigoYPin(codigo, pin);
      if (resultado.requiereActivacion) {
        setActivacionPendiente({ incorporacionId: resultado.incorporacionId, pinTemporal: resultado.pinTemporal });
        return;
      }
      setUsuario(resultado.usuario);
    } catch (error: unknown) {
      const mensaje = error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado. Intenta de nuevo.";
      setErrorLogin(mensaje);
    } finally {
      setIniciandoSesion(false);
    }
  }, []);

  const activarCredencial = useCallback(async (pinNuevo: string) => {
    if (!activacionPendiente) return;
    setActivandoCredencial(true);
    setErrorLogin(null);
    try {
      const usuarioAutenticado = await activarCredencialServicio(activacionPendiente.pinTemporal, pinNuevo);
      setActivacionPendiente(null);
      setUsuario(usuarioAutenticado);
    } catch (error: unknown) {
      const mensaje = error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado. Intenta de nuevo.";
      setErrorLogin(mensaje);
    } finally {
      setActivandoCredencial(false);
    }
  }, [activacionPendiente]);

  const cancelarActivacion = useCallback(async () => {
    setActivacionPendiente(null);
    setErrorLogin(null);
    // La sesión DIRECTA_TEMP no lleva claims tenant: cerrarla aquí no afecta
    // ninguna sesión operativa real, solo descarta el intento de activación.
    if (auth.currentUser) await firebaseSignOut(auth).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUsuario(null);
    setErrorLogin(null);
  }, []);

  const limpiarError = useCallback(() => setErrorLogin(null), []);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        cargando,
        iniciandoSesion,
        errorLogin,
        login,
        logout,
        limpiarError,
        activacionPendiente,
        activandoCredencial,
        activarCredencial,
        cancelarActivacion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook para acceder al contexto de autenticación.
 * Lanza un error si se usa fuera del `AuthProvider`.
 */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}
