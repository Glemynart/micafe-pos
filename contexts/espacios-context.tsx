'use client'

/**
 * espacios-context.tsx
 *
 * Contexto React que carga los espacios activos desde Firestore
 * y mantiene el espacio y categoría seleccionados actualmente.
 *
 * Uso: envuelve la app con <EspaciosProvider> y consume con useEspacios().
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
  suscribirEspacios,
  suscribirCategorias,
  type Espacio,
  type Categoria,
} from "@/lib/espacios-service";
import { useSaaS } from "@/contexts/saas-context";

// ─── Tipos del Contexto ───────────────────────────────────────────────────────

interface EspaciosContextValue {
  /** Lista de espacios activos cargados desde Firestore */
  espacios: Espacio[];
  /** Espacio actualmente seleccionado (null mientras carga) */
  espacioActivo: Espacio | null;
  /** Categorías del espacio activo */
  categorias: Categoria[];
  /** Categoría actualmente seleccionada (null = "Todas") */
  categoriaActiva: Categoria | null;
  /** true mientras los espacios cargan por primera vez */
  cargandoEspacios: boolean;
  /** Cambia el espacio activo y resetea la categoría */
  seleccionarEspacio: (espacio: Espacio) => void;
  /** Cambia la categoría activa dentro del espacio actual */
  seleccionarCategoria: (categoria: Categoria | null) => void;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const EspaciosContext = createContext<EspaciosContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EspaciosProvider({ children }: { children: ReactNode }) {
  const { empresaId, loading } = useSaaS();
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [espacioActivo, setEspacioActivo] = useState<Espacio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<Categoria | null>(null);
  const [cargandoEspacios, setCargandoEspacios] = useState(true);

  // Los espacios solo existen dentro de una sesión tenant resuelta. Durante
  // DIRECTA_TEMP no se consulta Firestore; al completar la activación,
  // empresaId cambia y este efecto crea el listener correspondiente.
  useEffect(() => {
    if (loading || !empresaId) {
      setEspacios([]);
      setEspacioActivo(null);
      setCategorias([]);
      setCategoriaActiva(null);
      setCargandoEspacios(false);
      return;
    }

    setCargandoEspacios(true);
    const unsub = suscribirEspacios((nuevosEspacios) => {
      setEspacios(nuevosEspacios);
      setCargandoEspacios(false);
      // Seleccionar el primero automáticamente si aún no hay selección
      setEspacioActivo((prev) => {
        if (prev) {
          // Verificar que el espacio activo sigue existiendo
          const still = nuevosEspacios.find((e) => e.id === prev.id);
          return still ?? (nuevosEspacios[0] ?? null);
        }
        return nuevosEspacios[0] ?? null;
      });
    });
    return unsub;
  }, [empresaId, loading]);

  // Cuando cambia el espacio activo, suscribir a sus categorías
  useEffect(() => {
    if (!espacioActivo) {
      setCategorias([]);
      return;
    }
    setCategoriaActiva(null); // resetear categoría al cambiar espacio
    const unsub = suscribirCategorias(espacioActivo.id, (nuevasCategorias) => {
      setCategorias(nuevasCategorias);
    });
    return unsub;
  }, [espacioActivo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const seleccionarEspacio = useCallback((espacio: Espacio) => {
    setEspacioActivo(espacio);
    setCategoriaActiva(null);
  }, []);

  const seleccionarCategoria = useCallback(
    (categoria: Categoria | null) => {
      setCategoriaActiva(categoria);
    },
    []
  );

  return (
    <EspaciosContext.Provider
      value={{
        espacios,
        espacioActivo,
        categorias,
        categoriaActiva,
        cargandoEspacios,
        seleccionarEspacio,
        seleccionarCategoria,
      }}
    >
      {children}
    </EspaciosContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook para acceder al contexto de espacios.
 * Lanza un error si se usa fuera del EspaciosProvider.
 */
export function useEspacios(): EspaciosContextValue {
  const ctx = useContext(EspaciosContext);
  if (!ctx) {
    throw new Error("useEspacios debe usarse dentro de <EspaciosProvider>");
  }
  return ctx;
}
