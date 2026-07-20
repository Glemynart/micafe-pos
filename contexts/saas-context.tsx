'use client'

/**
 * saas-context.tsx
 *
 * MT-U2 — Capa 3 (runtime SaaS en cliente). Única fuente de verdad de "en
 * qué empresa opero y con qué rol según el token". Resuelve la empresa
 * activa desde el custom claim `{empresaId, rol}` acuñado en la Capa 2
 * (scripts/set-claims-mt-u2.ts).
 *
 * MT-U3 Capa 1: la resolución claim→fallback (incl. el `console.warn` de
 * anomalía) se delegó a `resolverEmpresaIdActivo()` (`lib/tenant-context.ts`)
 * — el mismo resolvedor que usa `lib/tenant.ts` para servicios planos. Una
 * sola ruta de resolución en todo el sistema. La API pública de este
 * contexto (`SaaSContextValue`) no cambió.
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
import { obtenerEmpresaPorId, type Empresa } from "@/lib/empresas-service";
import { resolverEmpresaIdActivo, TenantSinSesionError } from "@/lib/tenant-context";
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
    try {
      // Resolución compartida (claim → fallback D-U2-1, incl. el warn de
      // anomalía) — misma ruta que usa lib/tenant.ts para servicios planos.
      const { empresaId: empresaIdResuelto, empresa: empresaDelFallback } =
        await resolverEmpresaIdActivo();

      // rolClaim es exclusivo de este contexto (D-U2-2, solo informativo) —
      // se lee del mismo token ya cacheado por el SDK, sin red adicional.
      const tokenResult = await firebaseUser.getIdTokenResult();
      const huboClaim = tokenResult.claims.empresaId !== undefined;
      const rolDelClaim = huboClaim ? (tokenResult.claims.rol as RolUsuario | undefined) ?? null : null;

      // Camino normal (claim): el resolvedor no trae el doc (evita una
      // lectura que solo este contexto necesita) — se obtiene aquí, igual
      // que antes. Camino de fallback: el resolvedor YA lo trae (lo obtuvo
      // como parte de la propia consulta de descubrimiento) — no se repite
      // la lectura.
      const empresaDoc = empresaDelFallback ?? (await obtenerEmpresaPorId(empresaIdResuelto));

      setEmpresaId(empresaIdResuelto);
      setRolClaim(rolDelClaim);
      setEmpresa(empresaDoc);
    } catch (err) {
      if (err instanceof TenantSinSesionError) {
        // No debería alcanzarse aquí por "sin sesión" (onIdTokenChanged ya
        // garantiza firebaseUser no nulo), pero SÍ puede ocurrir si el
        // fallback tampoco encuentra ninguna empresa fundacional — mismo
        // estado que el código anterior toleraba (empresaId/empresa null).
        setEmpresaId(null);
        setRolClaim(null);
        setEmpresa(null);
        return;
      }
      throw err;
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
