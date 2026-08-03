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
 *   (b) La membresía canónica decide rol, permisos y estado. El claim es una
 *       proyección emitida por Functions que se verifica contra ella.
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
import { esSesionTemporalSinTenant, resolverEmpresaIdActivo, TenantSinSesionError } from "@/lib/tenant-context";
import { esRolUsuario, type RolUsuario } from "@/lib/auth-service";
import { esMembresiaActiva, obtenerMembresia, type Membresia } from "@/lib/membresias-service";

// ─── Tipos del Contexto ───────────────────────────────────────────────────────

interface SaaSContextValue {
  /** empresaId activo, resuelto exclusivamente desde el claim del token. */
  empresaId: string | null;
  /** Documento de la empresa activa (enriquece empresaId con nombre/estado) */
  empresa: Empresa | null;
  /** Membresía canónica de la sesión activa; fuente de rol, permisos y estado. */
  membresia: Membresia | null;
  /** Rol efectivo proyectado desde la membresía. */
  rol: RolUsuario | null;
  /** true mientras se resuelve el claim/la empresa */
  loading: boolean;
  /** La identidad Firebase es válida, pero no posee una sesión tenant autorizada. */
  accesoTenantDenegado: boolean;
  /** Fuerza un refresh del token (getIdToken(true)) y re-resuelve el estado */
  refresh: () => Promise<void>;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

export const SaaSContext = createContext<SaaSContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SaaSProvider({ children }: { children: ReactNode }) {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [membresia, setMembresia] = useState<Membresia | null>(null);
  const [loading, setLoading] = useState(true);
  const [accesoTenantDenegado, setAccesoTenantDenegado] = useState(false);

  const resolver = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
       // Resolución exclusiva desde claim — misma ruta que usa lib/tenant.ts
       // para servicios planos. MT-U5a eliminó el fallback transitorio.
       const { empresaId: empresaIdResuelto } =
         await resolverEmpresaIdActivo();

      // El claim se lee del mismo token cacheado por el SDK y se contrasta con
      // la membresía canónica antes de exponer la sesión tenant.
      const tokenResult = await firebaseUser.getIdTokenResult();
       const rolDelClaim = esRolUsuario(tokenResult.claims.rol) ? tokenResult.claims.rol : null;
       if (!rolDelClaim) throw new TenantSinSesionError("La sesión no contiene un rol tenant válido.");
       const membresiaActual = await obtenerMembresia(empresaIdResuelto, firebaseUser.uid);
       if (!membresiaActual || !esMembresiaActiva(membresiaActual) || membresiaActual.rol !== rolDelClaim) {
         throw new TenantSinSesionError("La membresía activa no coincide con la sesión tenant.");
       }

      // Camino normal (claim): el resolvedor no trae el doc (evita una
      // lectura que solo este contexto necesita) — se obtiene aquí, igual
      // que antes. Camino de fallback: el resolvedor YA lo trae (lo obtuvo
      // como parte de la propia consulta de descubrimiento) — no se repite
      // la lectura.
       const empresaDoc = await obtenerEmpresaPorId(empresaIdResuelto);

      setEmpresaId(empresaIdResuelto);
      setMembresia(membresiaActual);
      setEmpresa(empresaDoc);
      setAccesoTenantDenegado(false);
    } catch (err) {
      if (err instanceof TenantSinSesionError) {
         // La identidad Firebase puede ser válida para otro plano (por
         // ejemplo, Backoffice SaaS) aunque no tenga sesión tenant. Se limpia
         // solo este contexto y el guard del plano tenant rechaza la vista;
         // cerrar Auth aquí afectaría todas las pestañas del mismo origen.
         setEmpresaId(null);
         setMembresia(null);
         setEmpresa(null);
         setAccesoTenantDenegado(true);
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
        setMembresia(null);
        setAccesoTenantDenegado(false);
        setLoading(false);
        return;
      }

      // Ver `esSesionTemporalSinTenant` (lib/tenant-context.ts): una sesión
      // `DIRECTA_TEMP` es una sesión de Auth válida que aún no es tenant.
      // Este provider no tiene contexto SaaS que ofrecerle (no hay empresa
      // ni membresía que resolver todavía) pero tampoco debe tratarla como
      // inválida — se mantiene estable, sin resolver ni cerrar sesión, hasta
      // que la activación (fuera de este provider) la reemplace por una
      // sesión tenant y este mismo listener vuelva a disparar.
      const tokenCacheado = await firebaseUser.getIdTokenResult();
      if (esSesionTemporalSinTenant(tokenCacheado.claims)) {
        setEmpresaId(null);
        setEmpresa(null);
        setMembresia(null);
        setAccesoTenantDenegado(false);
        setLoading(false);
        return;
      }

      setAccesoTenantDenegado(false);
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
    const tokenCacheado = await firebaseUser.getIdTokenResult();
    if (esSesionTemporalSinTenant(tokenCacheado.claims)) {
      setEmpresaId(null);
      setEmpresa(null);
      setMembresia(null);
      setAccesoTenantDenegado(false);
      setLoading(false);
      return;
    }
    setAccesoTenantDenegado(false);
    await resolver(firebaseUser);
    setLoading(false);
  }, [resolver]);

  return (
    <SaaSContext.Provider value={{ empresaId, empresa, membresia, rol: membresia?.rol ?? null, loading, accesoTenantDenegado, refresh }}>
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
