"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { construirBusquedaWebProducto } from "@/lib/bodega/category-suggestions";
import { sugerirCategoriaCatalogoDiana } from "@/lib/bodega/diana-catalog-category-suggestions";
import {
  ejecutarImportacionCatalogo,
  prepararImportacionCatalogo,
  validarPlanImportacionCatalogo,
  type CatalogImportProgress,
  type DianaCatalogImportPlan,
  type ImportacionCatalogoPreparada,
} from "@/lib/bodega/diana-catalog-import";
import { ejecutarComandoImportacionCatalogo } from "@/lib/bodega/diana-catalog-import-service";
import { obtenerSnapshotCatalogoBodega } from "@/lib/bodega/admin-service";

interface Espacio { id: string; nombre: string }

export function DianaCatalogImporter({ tenantId, espacios, onRunningChange }: { tenantId: string; espacios: Espacio[]; onRunningChange?: (running: boolean) => void }) {
  const [plan, setPlan] = useState<DianaCatalogImportPlan | null>(null);
  const [archivo, setArchivo] = useState("");
  const [espacioId, setEspacioId] = useState(espacios[0]?.id ?? "");
  const [preparado, setPreparado] = useState<ImportacionCatalogoPreparada | null>(null);
  const [error, setError] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState<CatalogImportProgress | null>(null);
  const [resultado, setResultado] = useState<{ categoriasCreadas: number; productosCreados: number; presentacionesCreadas: number } | null>(null);

  const actualizarPreflight = useCallback(async (value: DianaCatalogImportPlan, targetSpaceId: string) => {
    const snapshot = await obtenerSnapshotCatalogoBodega();
    const next = prepararImportacionCatalogo(value, tenantId, targetSpaceId, snapshot);
    setPreparado(next);
    setConfirmado(false);
    return next;
  }, [tenantId]);

  useEffect(() => {
    if (espacios.length === 0) {
      if (espacioId !== "") setEspacioId("");
      return;
    }
    if (!espacios.some(space => space.id === espacioId)) {
      const nextSpaceId = espacios[0].id;
      setPreparado(null);
      setEspacioId(nextSpaceId);
      if (plan) void actualizarPreflight(plan, nextSpaceId).catch(() => setError("No se pudo comprobar el catálogo en el espacio seleccionado."));
    }
  }, [espacios, espacioId, plan, actualizarPreflight]);

  const cargarArchivo = async (file: File | undefined) => {
    setError(""); setPlan(null); setPreparado(null); setResultado(null); setConfirmado(false); setArchivo("");
    if (!file) return;
    if (!file.name.toLocaleLowerCase("es-CO").endsWith(".json") || file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setError("Selecciona un plan JSON de hasta 2 MiB generado por el proceso offline de revisión.");
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()) as unknown; }
    catch { setError("El archivo no contiene JSON válido."); return; }
    const errors = validarPlanImportacionCatalogo(parsed);
    if (errors.length > 0) { setError(errors.join(" ")); return; }
    const validPlan = parsed as DianaCatalogImportPlan;
    setPlan(validPlan); setArchivo(file.name);
    try { await actualizarPreflight(validPlan, espacioId); }
    catch { setError("No se pudo leer el catálogo actual del tenant para comprobar duplicados. No se inició ninguna escritura."); }
  };

  const cambiarEspacio = async (value: string) => {
    setEspacioId(value); setError(""); setConfirmado(false);
    setPreparado(null);
    if (!plan) return;
    try { await actualizarPreflight(plan, value); }
    catch { setError("No se pudo actualizar la comprobación del catálogo actual."); }
  };

  const importar = async () => {
    if (!plan || !confirmado || corriendo) return;
    setError(""); setResultado(null); setCorriendo(true); setProgreso(null);
    onRunningChange?.(true);
    try {
      const fresh = await actualizarPreflight(plan, espacioId);
      if (fresh.errores.length > 0) {
        setError(`El preflight encontró bloqueos: ${fresh.errores.join(" ")}`);
        return;
      }
      const result = await ejecutarImportacionCatalogo(fresh, ejecutarComandoImportacionCatalogo, setProgreso);
      setResultado(result);
      await actualizarPreflight(plan, espacioId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La carga se detuvo por un error no identificado.";
      setError(`${message} No vuelvas a editar el mapeo para reintentar: carga el mismo plan y revisa el estado actual; los comandos usan claves idempotentes.`);
    } finally { setCorriendo(false); onRunningChange?.(false); }
  };

  const rows = preparado?.filas ?? [];
  const reviewNeeded = rows.filter(item => sugerirCategoriaCatalogoDiana(item.row.name).estado === "REVISAR").length;
  const categoryDisagreements = rows.filter(item => {
    const suggestion = sugerirCategoriaCatalogoDiana(item.row.name);
    return suggestion.estado === "SUGERIDA" && suggestion.categoria !== item.row.category;
  }).length;
  return (
    <details className="group mb-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-6">
      <summary onClick={event => { if (corriendo) event.preventDefault() }} className="flex cursor-pointer list-none items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Upload className="size-5" aria-hidden="true" /></span><span className="flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Carga masiva · Distribuidora Las Jiménez</span><span className="mt-1 block font-semibold tracking-tight">{corriendo ? "Importación en curso…" : "Importar catálogo revisado"}</span></span><span className="text-xs font-medium text-muted-foreground group-open:hidden">Abrir +</span></summary>
      <div className="mt-5 border-t border-border/60 pt-1">
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">Carga el plan JSON revisado con categorías, unidades, presentaciones y costos confirmados. Se usará el precio de tienda como tarifa única y el inventario empezará en cero; la lista de consumidor y las existencias quedan fuera de esta carga.</p>
      <div className="mt-5 grid items-center gap-5 @xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary/30 bg-primary/[.025] p-4 text-center transition-colors hover:bg-primary/5 focus-within:ring-3 focus-within:ring-ring/30">
          <Upload className="mb-1 size-5 text-primary" aria-hidden="true" /><span className="text-sm font-semibold">Seleccionar plan JSON revisado</span><span className="text-xs text-muted-foreground">{archivo || "Archivo .json · máximo 2 MiB"}</span>
          <input type="file" aria-label="Plan JSON revisado" accept=".json,application/json" disabled={corriendo} onChange={event => { void cargarArchivo(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        </label>
        <label className="min-w-0 text-sm font-medium">Espacio de destino
          <select value={espacioId} onChange={event => { void cambiarEspacio(event.target.value) }} disabled={corriendo || espacios.length === 0} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3">
            <option value="">Seleccionar</option>
            {espacios.map(space => <option key={space.id} value={space.id}>{space.nombre}</option>)}
          </select>
          <span className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">Revisarás el contenido y los posibles duplicados antes de confirmar.</span>
        </label>
      </div>
      {archivo && <p className="mt-2 text-xs text-muted-foreground">Plan cargado: {archivo} · tenant activo: {tenantId}</p>}
      {preparado && <>
        <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <p>Productos: {preparado.resumen.productosTotales} ({preparado.resumen.productosPorCrear} nuevos)</p>
          <p>Categorías: {preparado.resumen.categoriasTotales} ({preparado.resumen.categoriasPorCrear} nuevas)</p>
          <p>Presentaciones: {preparado.filas.length} ({preparado.resumen.presentacionesPorCrear} nuevas)</p>
          <p>Sin regla local: {reviewNeeded} (requieren confirmación manual)</p>
          <p>Diferencias entre sugerencia local y plan: {categoryDisagreements} (revisar antes de importar)</p>
          <p>Filas consumidor diferidas: {plan?.consumerReference.consumerOnlyRowsDeferred ?? 0}</p>
          <p>Coincidencias entre listas aún sin resolver: {plan?.consumerReference.crossListDecisionsPending ?? 0}</p>
        </div>
        {plan && <p className="mt-2 break-all text-[11px] text-muted-foreground">SHA-256 fuente: {plan.sourceSha256} · revisión: {plan.reviewSha256}</p>}
        {reviewNeeded > 0 && <p className="mt-2 text-xs text-muted-foreground">Las reglas se ejecutan localmente. Para los nombres sin coincidencia, abre la búsqueda manual solo si pulsas el enlace de la fila; Google recibirá el nombre consultado.</p>}
        <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[800px] text-left text-xs">
            <caption className="sr-only">Vista previa del catálogo y categorías antes de la importación</caption>
            <thead className="sticky top-0 bg-muted"><tr><th scope="col" className="p-2">Origen</th><th scope="col" className="p-2">Producto</th><th scope="col" className="p-2">Categoría del plan</th><th scope="col" className="p-2">Regla local</th><th scope="col" className="p-2">Presentación</th><th scope="col" className="p-2">Precio</th><th scope="col" className="p-2">Costo del empaque</th></tr></thead>
            <tbody>{rows.map(item => {
              const suggestion = sugerirCategoriaCatalogoDiana(item.row.name);
              return <tr key={item.row.sourceRow} className="border-t border-border align-top">
                <td className="p-2">Fila {item.row.sourceRow}</td>
                <td className="p-2 font-medium">{item.row.name}</td>
                <td className="p-2">{item.row.category}</td>
                <td className="p-2">{suggestion.estado === "SUGERIDA" ? suggestion.categoria : "Revisar"}{suggestion.estado === "SUGERIDA" && suggestion.categoria !== item.row.category && <><br /><span className="font-semibold text-amber-700">Difiere del plan: confirma manualmente</span><br /><a href={construirBusquedaWebProducto(item.row.name)} target="_blank" rel="noopener noreferrer" className="underline">Buscar producto en Colombia</a></>}{suggestion.estado === "REVISAR" && <><br /><a href={construirBusquedaWebProducto(item.row.name)} target="_blank" rel="noopener noreferrer" className="underline">Buscar producto en Colombia</a></>}</td>
                <td className="p-2">{item.row.presentation} × {item.row.unitsPerPresentation} {item.row.baseUnit}</td>
                <td className="p-2">{item.row.salesPriceCop.toLocaleString("es-CO")} COP</td>
                <td className="p-2">{item.row.costCopPerPresentation.toLocaleString("es-CO")} COP</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {preparado.errores.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"><strong>Importación bloqueada:</strong><ul className="mt-1 list-disc pl-5">{preparado.errores.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {preparado.errores.length === 0 && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmado} onChange={event => setConfirmado(event.target.checked)} disabled={corriendo} className="mt-1" /><span>Confirmo que revisé todas las filas, incluidas las sugerencias ausentes o distintas, y que el plan representa el catálogo de tienda aprobado. Entiendo que las categorías, productos y presentaciones se crearán mediante acciones separadas, sin existencias, y que una interrupción se reanuda cargando el mismo plan.</span></label>}
        <button type="button" onClick={() => { void importar() }} disabled={!confirmado || preparado.errores.length > 0 || corriendo} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{corriendo ? "Importando…" : "Importar plan revisado"}</button>
      </>}
      {progreso && corriendo && <p role="status" className="mt-3 text-sm">{progreso.fase}: {progreso.completadas}/{progreso.total}</p>}
      {resultado && <p role="status" className="mt-3 rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm">Terminado: {resultado.categoriasCreadas} categorías, {resultado.productosCreados} productos y {resultado.presentacionesCreadas} presentaciones creadas. Revisa la conciliación del catálogo antes de habilitar ventas o compras.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
      </div>
    </details>
  );
}
