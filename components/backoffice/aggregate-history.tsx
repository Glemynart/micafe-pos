'use client'

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { consultarAuditoria, mensajeError } from "@/lib/platform/client";
import { EmptyState, ErrorState, EstadoBadge, fecha, LoadingState } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type TipoAgregadoHistorial = "EMPRESA" | "SUSCRIPCION";

/**
 * ADR-SAAS-012 — historial de plataforma de un agregado (Empresa, Suscripción,
 * …), reutilizando la misma evidencia append-only de `saas_auditoria` acotada
 * por `agregado.tipo`+`agregado.id`, en vez de una colección o proyección por
 * agregado. Los `TipoAgregadoAuditoria` con `id: empresaId` (ver
 * `functions/src/platform/operations.ts`) hacen que `valor` sea siempre el
 * `empresaId`, incluso para el agregado `SUSCRIPCION`.
 */
export function AggregateHistory({
  tipoAgregado,
  valor,
  vacioDescripcion = "Aún no existe evidencia de plataforma para este agregado.",
}: {
  tipoAgregado: TipoAgregadoHistorial;
  valor: string;
  vacioDescripcion?: string;
}) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const resultado = await consultarAuditoria({ por: "agregado", tipoAgregado, valor });
      setItems(resultado.items);
      setCursor(resultado.cursor);
    } catch (cause) {
      setError(mensajeError(cause));
    } finally {
      setLoading(false);
    }
  }, [tipoAgregado, valor]);
  useEffect(() => { void load(); }, [load]);

  async function cargarMas() {
    if (!cursor) return;
    setCargandoMas(true);
    try {
      const resultado = await consultarAuditoria({ por: "agregado", tipoAgregado, valor }, cursor);
      setItems((current) => [...current, ...resultado.items]);
      setCursor(resultado.cursor);
    } catch (cause) {
      setError(mensajeError(cause));
    } finally {
      setCargandoMas(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Cargando historial…" /> : error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <EmptyState title="Sin hechos registrados" description={vacioDescripcion} /> : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Hecho</TableHead><TableHead>Resultado</TableHead><TableHead>Actor</TableHead><TableHead>Registrado</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><strong className="text-xs">{item.tipo}</strong>{item.motivo?.codigo && <p className="mt-1 text-[11px] text-slate-400">{item.motivo.codigo}</p>}</TableCell>
                    <TableCell><EstadoBadge estado={item.resultado} /></TableCell>
                    <TableCell className="font-mono text-xs">{item.actor?.uid ?? item.actor?.tipo ?? "SISTEMA"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fecha(item.registradoEn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {cursor && <div className="mt-4 text-center"><Button variant="outline" disabled={cargandoMas} onClick={() => void cargarMas()}>{cargandoMas && <LoaderCircle className="mr-2 size-4 animate-spin" />}Cargar más</Button></div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
