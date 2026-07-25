'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { consultarContexto, type ContextoPlataforma, type FacultadPlataforma } from "@/lib/platform/client";

interface PlatformContextValue {
  user: User | null;
  contexto: ContextoPlataforma | null;
  cargando: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refrescar: () => Promise<void>;
  tiene: (facultad: FacultadPlataforma) => boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [contexto, setContexto] = useState<ContextoPlataforma | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (actual: User | null) => {
    setUser(actual);
    if (!actual) {
      setContexto(null);
      setError(null);
      setCargando(false);
      return;
    }
    try {
      const ctx = await consultarContexto();
      setContexto(ctx);
      setError(null);
    } catch (cause) {
      setContexto(null);
      setError(cause instanceof Error ? cause.message : "PLATFORM_ACCESS_DENIED");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => onIdTokenChanged(auth, (actual) => {
    setCargando(true);
    void cargar(actual);
  }), [cargar]);

  const value = useMemo<PlatformContextValue>(() => ({
    user,
    contexto,
    cargando,
    error,
    login: async (email, password) => {
      setCargando(true);
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await credential.user.getIdToken(true);
      await cargar(credential.user);
    },
    logout: async () => {
      await signOut(auth);
      setContexto(null);
    },
    refrescar: async () => {
      setCargando(true);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);
      await cargar(auth.currentUser);
    },
    tiene: (facultad) => contexto?.facultades.includes(facultad) ?? false,
  }), [user, contexto, cargando, error, cargar]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("usePlatform requiere PlatformProvider");
  return value;
}

