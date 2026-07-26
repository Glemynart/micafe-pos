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
  useRef,
  type ReactNode,
} from "react";
import {
  activarCredencial as activarCredencialServicio,
  esActivacionDirectaRestaurada,
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
  /** Solo vive en memoria; nunca se restaura ni se deriva desde Firebase. */
  pinTemporal: string | null;
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
  activarCredencial: (pinNuevo: string, pinTemporalRestaurado?: string) => Promise<void>;
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
  const restauracionInicialPendienteRef = useRef(true);
  const invalidarAuthPendienteRef = useRef<() => void>(() => {});

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

    const unsubscribe = onAuthStateChange((estadoAuth) => {
      if (!isMounted) return;
      clearTimeout(fallbackTimer);
      if (esActivacionDirectaRestaurada(estadoAuth)) {
        if (!restauracionInicialPendienteRef.current) {
          setCargando(false);
          return;
        }
        restauracionInicialPendienteRef.current = false;
        setUsuario(null);
        // Si el login ya guardó el PIN temporal, esta restauración tardía no
        // puede reemplazarlo. Si no existe, solo se reconstruye el id no secreto.
        setActivacionPendiente((actual) => actual?.pinTemporal
          ? actual
          : { incorporacionId: estadoAuth.incorporacionId, pinTemporal: null });
      } else {
        restauracionInicialPendienteRef.current = false;
        setUsuario(estadoAuth);
        setActivacionPendiente(null);
      }
      setCargando(false);
    });
    invalidarAuthPendienteRef.current = unsubscribe.invalidarPendientes;

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      invalidarAuthPendienteRef.current = () => {};
      unsubscribe.cancelar();
    };
  }, []);

  const login = useCallback(async (codigo: string, pin: string) => {
    restauracionInicialPendienteRef.current = false;
    invalidarAuthPendienteRef.current();
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

  const activarCredencial = useCallback(async (pinNuevo: string, pinTemporalRestaurado?: string) => {
    if (!activacionPendiente) return;
    const pinTemporal = activacionPendiente.pinTemporal ?? pinTemporalRestaurado;
    if (!pinTemporal) return;
    invalidarAuthPendienteRef.current();
    setActivandoCredencial(true);
    setErrorLogin(null);
    try {
      const usuarioAutenticado = await activarCredencialServicio(pinTemporal, pinNuevo);
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
    invalidarAuthPendienteRef.current();
    setActivacionPendiente(null);
    setErrorLogin(null);
    // La sesión DIRECTA_TEMP no lleva claims tenant: cerrarla aquí no afecta
    // ninguna sesión operativa real, solo descarta el intento de activación.
    if (auth.currentUser) await firebaseSignOut(auth).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    invalidarAuthPendienteRef.current();
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
