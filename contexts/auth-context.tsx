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
  loginConUsername,
  logout as authLogout,
  onAuthStateChange,
  type Usuario,
} from "@/lib/auth-service";
import { notificar } from "@/lib/notificaciones-cliente";

// ─── Tipos del Contexto ───────────────────────────────────────────────────────

interface AuthContextValue {
  /** Cajero actualmente autenticado, o null si no hay sesión */
  usuario: Usuario | null;
  /** true mientras se verifica el estado inicial de auth (splash guard) */
  cargando: boolean;
  /** true si se está ejecutando el proceso de login */
  iniciandoSesion: boolean;
  /** Mensaje de error del último intento de login */
  errorLogin: string | null;
  /** Inicia sesión con username y contraseña */
  login: (username: string, password: string) => Promise<void>;
  /** Cierra la sesión del cajero actual */
  logout: () => Promise<void>;
  /** Limpia el mensaje de error de login */
  limpiarError: () => void;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [iniciandoSesion, setIniciandoSesion] = useState(false);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);

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

  const login = useCallback(async (username: string, password: string) => {
    setIniciandoSesion(true);
    setErrorLogin(null);
    try {
      const usuarioAutenticado = await loginConUsername(username, password);
      setUsuario(usuarioAutenticado);
      if (usuarioAutenticado.rol === 'cajero') {
        notificar({
          title: 'Cajero inició sesión',
          message: `${usuarioAutenticado.nombre} inició sesión`,
          url: '/admin/turnos',
        });
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado. Intenta de nuevo.";
      setErrorLogin(mensaje);
    } finally {
      setIniciandoSesion(false);
    }
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
