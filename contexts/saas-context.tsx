'use client'

/**
 * saas-context.tsx
 *
 * MT-U2 — Capa 3 (runtime SaaS en cliente). Única fuente de verdad de "en
 * qué empresa opero y con qué rol según el token". Resuelve la empresa
 * activa desde el custom claim `{empresaId, rol}` acuñado en la Capa 2
 * (scripts/set-claims-mt-u2.ts); es el seam donde MT-U3+ engancharán el
 * `empresaId` del helper de tenant.
 *
 * Límites de responsabilidad (ver MT-U2-runtime-saas-diseno.md §3):
 *   (a) NO decide el `empresaId` — lo impone el claim (D-U2-1); el fallback
 *       de descubrimiento solo lee la empresa fundacional ya existente.
 *   (b) NO autoriza — `rolClaim` es informativo. La autoridad de
 *       autorización sigue siendo `usuarios` hasta MT-U5b (D-U2-2). Ningún
 *       guard/servicio/regla debe leer `rolClaim` todavía.
 *   (c) NO lee colecciones operativas.
 *   (d) NO escribe claims (eso es el backend/script de Capa 2).
 *   (e) NO conoce suscripciones ni planes (MT-U8).
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { onIdTokenChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  obtenerEmpresaFundacional,
  obtenerEmpresaPorId,
  type Empresa,
} from "@/lib/empresas-service";
import type { RolUsuario } from "@/lib/auth-service";

// ─── Tipos del Contexto ───────────────────────────────────────────────────────

interface SaaSContextValue {
  /** empresaId activo, resuelto desde el claim (o el fallback transitorio de D-U2-1) */
  empresaId: string | null;
  /** Documento de la empresa activa (enriquece empresaId con nombre/estado) */
  empresa: Empresa | null;
  /** rol tal como viaja en el claim del token — solo informativo (D-U2-2) */
  rolClaim: RolUsuario | null;
  /** true mientras se resuelve el claim/la empresa */
  loading: boolean;
  /** Fuerza un refresh del token (getIdToken(true)) y re-resuelve el estado */
  refresh: () => Promise<void>;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const SaaSContext = createContext<SaaSContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SaaSProvider({ children }: { children: ReactNode }) {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [rolClaim, setRolClaim] = useState<RolUsuario | null>(null);
  const [loading, setLoading] = useState(true);

  const resolver = useCallback(async (firebaseUser: FirebaseUser) => {
    // Camino normal: leer el claim del token ya cacheado (sin forzar red).
    let tokenResult = await firebaseUser.getIdTokenResult();

    // "Refrescar el token cuando corresponda": si el claim aún no aparece,
    // puede ser que se acuñó server-side (Capa 2) después de emitido el
    // token cacheado. Un único refresh forzado basta para ver el claim
    // recién propagado, sin forzar red en cada carga.
    if (tokenResult.claims.empresaId === undefined) {
      tokenResult = await firebaseUser.getIdTokenResult(true);
    }

    const empresaIdClaim = tokenResult.claims.empresaId as string | undefined;
    const rolDelClaim = tokenResult.claims.rol as RolUsuario | undefined;

    if (empresaIdClaim) {
      // Camino normal (D-U2-1/D-U2-2): el empresaId del claim ES la fuente
      // de verdad. Se lee su documento directamente por id — nunca se
      // vuelve a "descubrir" la empresa por otra vía. Válido sin cambios
      // cuando exista más de una empresa (MT-U11).
      const empresaDoc = await obtenerEmpresaPorId(empresaIdClaim);
      setEmpresaId(empresaIdClaim);
      setRolClaim(rolDelClaim ?? null);
      setEmpresa(empresaDoc);
    } else {
      // Fallback transitorio (D-U2-1): SOLO válido mientras el claim aún
      // no existe/propaga. En régimen permanente esto es un ESTADO
      // INVÁLIDO, no comportamiento normal — se marca como anomalía, nunca
      // como camino feliz. obtenerEmpresaFundacional() queda reservado
      // EXCLUSIVAMENTE a esta rama.
      console.warn(
        "[SaaSContext] Token sin claim 'empresaId' — usando fallback de " +
          "descubrimiento de la empresa fundacional (D-U2-1). Esperado " +
          "solo durante la transición de MT-U2; si persiste después de " +
          "que todos los usuarios tengan su claim acuñado, es una " +
          "anomalía a investigar."
      );
      const empresaFundacional = await obtenerEmpresaFundacional();
      setEmpresaId(empresaFundacional?.id ?? null);
      setRolClaim(null);
      setEmpresa(empresaFundacional);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setEmpresaId(null);
        setEmpresa(null);
        setRolClaim(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      await resolver(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, [resolver]);

  const refresh = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    setLoading(true);
    await firebaseUser.getIdToken(true);
    await resolver(firebaseUser);
    setLoading(false);
  }, [resolver]);

  return (
    <SaaSContext.Provider value={{ empresaId, empresa, rolClaim, loading, refresh }}>
      {children}
    </SaaSContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook para acceder al contexto SaaS.
 * Lanza un error si se usa fuera del `SaaSProvider`.
 */
export function useSaaS(): SaaSContextValue {
  const ctx = useContext(SaaSContext);
  if (!ctx) {
    throw new Error("useSaaS debe usarse dentro de <SaaSProvider>");
  }
  return ctx;
}
