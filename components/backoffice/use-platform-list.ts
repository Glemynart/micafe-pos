'use client'

import { useCallback, useEffect, useState } from "react";
import { listarRecursos, mensajeError, type RecursoPlataforma } from "@/lib/platform/client";

export function usePlatformList(recurso: RecursoPlataforma, filtros: { estado?: string; empresaId?: string } = {}) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listarRecursos(recurso, { limite: 50, ...filtros });
      setItems(result.items);
      setCursor(result.cursor);
    } catch (cause) {
      setError(mensajeError(cause));
    } finally {
      setLoading(false);
    }
  }, [recurso, filtros.estado, filtros.empresaId]);

  useEffect(() => { void load(); }, [load]);

  const more = useCallback(async () => {
    if (!cursor) return;
    const result = await listarRecursos(recurso, { limite: 50, ...filtros, cursor });
    setItems((current) => [...current, ...result.items]);
    setCursor(result.cursor);
  }, [cursor, recurso, filtros.estado, filtros.empresaId]);

  return { items, cursor, loading, error, reload: load, more };
}

