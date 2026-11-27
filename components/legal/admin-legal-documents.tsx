"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useAuthContext } from "@/contexts/auth-context";
import { aceptarDocumentosLegalesTenant, consultarEstadoLegalTenant, type EstadoLegalTenant, type ReciboAceptacionLegal } from "@/lib/legal/legal-acceptance-service";
import { rutaDocumentoAceptado } from "@/lib/legal/historical-documents";

const LABELS: Record<string, string> = {
  terminos: "Términos del servicio",
  "politica-tratamiento": "Política de tratamiento de datos",
  "aviso-autorizacion": "Aviso y autorización de datos",
  "anexo-tratamiento": "Anexo de tratamiento por cuenta del negocio",
};

function descargarRecibo(estado: EstadoLegalTenant, recibo: ReciboAceptacionLegal) {
  const contenido = {
    tipo: "Recibo de aceptación contractual de Dusema POS",
    empresa: { id: estado.empresaId, nombre: estado.nombreEmpresa },
    aceptacionId: recibo.aceptacionId,
    bundleId: recibo.bundleId,
    aceptadoEn: recibo.aceptadoEn,
    referenciaContrato: recibo.referenciaContrato,
    sha256CondicionesComerciales: recibo.sha256CondicionesComerciales,
    condicionesComerciales: recibo.condicionesComerciales,
    sha256AnexoTenant: recibo.sha256AnexoTenant,
    anexoTenant: recibo.anexoTenant,
    documentos: recibo.documentos,
  };
  const blob = new Blob([JSON.stringify(contenido, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dusema-aceptacion-${recibo.aceptacionId.slice(0, 12)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminLegalDocuments() {
  const { usuario } = useAuthContext();
  const [estado, setEstado] = useState<EstadoLegalTenant | null>(null);
  const [recibo, setRecibo] = useState<ReciboAceptacionLegal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [terminos, setTerminos] = useState(false);
  const [anexo, setAnexo] = useState(false);
  const [facultad, setFacultad] = useState(false);
  const [instrucciones, setInstrucciones] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (usuario?.rol !== "admin") return;
    setLoading(true);
    setError(null);
    try {
      const current = await consultarEstadoLegalTenant();
      setEstado(current);
      setRecibo(current.aceptado && current.aceptacionId && current.condicionesComerciales
        && current.sha256CondicionesComerciales && current.documentosAceptados
        && current.sha256AnexoTenant && current.anexoTenant
        ? {
            aceptacionId: current.aceptacionId,
            bundleId: current.bundleId,
            idempotente: true,
            aceptadoEn: current.aceptadoEn,
            referenciaContrato: current.condicionesComerciales.referenciaContrato,
            sha256CondicionesComerciales: current.sha256CondicionesComerciales,
            condicionesComerciales: current.condicionesComerciales,
            documentos: current.documentosAceptados,
            sha256AnexoTenant: current.sha256AnexoTenant,
            anexoTenant: current.anexoTenant,
          }
        : null);
    } catch {
      setError("No fue posible consultar los documentos del negocio. Actualiza e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [usuario?.rol]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cargarMas = async () => {
    const cursor = estado?.siguienteCursor;
    if (!cursor || loadingHistory) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const page = await consultarEstadoLegalTenant(cursor);
      setEstado(previous => previous && previous.empresaId === page.empresaId && previous.siguienteCursor === cursor
        ? { ...previous, historial: [...previous.historial, ...page.historial], historialLimitado: page.historialLimitado, siguienteCursor: page.siguienteCursor }
        : previous);
    } catch {
      setError("No fue posible cargar más aceptaciones. Inténtalo de nuevo.");
    } finally { setLoadingHistory(false); }
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!estado?.condicionesComerciales || !estado.anexoTenant || !estado.sha256AnexoTenant || !estado.aceptacionDisponible
      || !terminos || !anexo || !facultad || !instrucciones) return;
    setSaving(true);
    setError(null);
    try {
      const result = await aceptarDocumentosLegalesTenant({
        bundleId: estado.bundleId,
        aceptoTerminos: true,
        aceptoAnexo: true,
        declaroFacultad: true,
        confirmoInstruccionesAnexo: true,
        sha256AnexoTenant: estado.sha256AnexoTenant,
        correlationId: crypto.randomUUID(),
        referenciaContrato: estado.condicionesComerciales.referenciaContrato,
      });
      setRecibo(result);
      setEstado((previous) => previous ? {
        ...previous,
        aceptado: true,
        requiereAceptacion: false,
        aceptacionId: result.aceptacionId,
        aceptadoEn: result.aceptadoEn,
        documentosAceptados: result.documentos,
        sha256CondicionesComerciales: result.sha256CondicionesComerciales,
        sha256AnexoTenant: result.sha256AnexoTenant,
        anexoTenant: result.anexoTenant,
      } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible registrar la aceptación.");
    } finally {
      setSaving(false);
    }
  };

  if (usuario?.rol !== "admin") return <p className="rounded-xl border p-5 text-sm text-muted-foreground">Esta sección está disponible solo para el administrador del negocio.</p>;
  if (loading) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin" aria-label="Consultando documentos legales" /></div>;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Documentos del negocio</p>
          <h1 className="mt-1 text-2xl font-bold">Términos y privacidad</h1>
          <p className="mt-2 text-sm text-muted-foreground">Revisa las versiones, su estado y la evidencia de aceptación contractual de {estado?.nombreEmpresa ?? "tu empresa"}.</p>
        </div>

        <button type="button" onClick={() => void cargar()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold"><RefreshCw className="size-4" />Actualizar</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

      {estado && <>
        <div className={`flex gap-3 rounded-xl border p-4 ${estado.estado === "PREPARACION" ? "border-amber-300 bg-amber-50 text-amber-950" : estado.aceptado ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-blue-300 bg-blue-50 text-blue-950"}`}>
          {estado.estado === "PREPARACION" ? <AlertTriangle className="mt-0.5 size-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0" />}
          <div>
            <p className="font-semibold">{estado.estado === "PREPARACION" ? "Los textos siguen en revisión" : estado.aceptado ? "Aceptación registrada" : "Aceptación pendiente"}</p>
            <p className="mt-1 text-sm">{estado.estado === "PREPARACION"
              ? "No se te pedirá aceptar una versión marcada como borrador. Estamos cerrando revisión jurídica y condiciones operativas antes de publicarla como vigente."
              : estado.aceptado
                ? `Recibo ${estado.aceptacionId}${estado.aceptadoEn ? ` · ${new Date(estado.aceptadoEn).toLocaleString("es-CO")}` : ""}.`
                : "La persona administradora debe revisar los documentos contractuales y declarar que puede representar a la empresa."}</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Ficha de tratamiento de este negocio</h2>
          {estado.anexoTenant ? <>
            <p className="mt-2 text-sm text-muted-foreground">Revisión {estado.anexoTenant.revision} · {estado.anexoTenant.perfil.nombreComercial} · {estado.anexoTenant.perfil.tipoPersona === "NATURAL" ? "Persona natural" : "Persona jurídica"}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="text-muted-foreground">Módulos contratados incluidos</dt><dd className="font-medium">{estado.anexoTenant.capacidades.join(", ")}</dd></div>
              <div><dt className="text-muted-foreground">Finalidades declaradas</dt><dd className="font-medium">{estado.anexoTenant.instrucciones.finalidades.join(", ")}</dd></div>
              <div><dt className="text-muted-foreground">Titulares</dt><dd className="font-medium">{estado.anexoTenant.instrucciones.titulares.join(", ")}</dd></div>
              <div><dt className="text-muted-foreground">Categorías de datos</dt><dd className="font-medium">{estado.anexoTenant.instrucciones.categoriasDatos.join(", ")}</dd></div>
              <div><dt className="text-muted-foreground">Contacto de privacidad</dt><dd className="font-medium">Canal verificado: {estado.anexoTenant.contactoPrivacidad.canal.replace("_VERIFICADO", "").toLowerCase()} · versión {estado.anexoTenant.contactoPrivacidad.version}</dd></div>
              <div><dt className="text-muted-foreground">Salida del servicio</dt><dd className="font-medium">{estado.anexoTenant.instrucciones.instruccionSalida === "DEVOLVER_Y_SUPRIMIR_SEGUN_RETENCIONES" ? "Devolución y supresión conforme a retenciones legales" : "Devolución y solicitud de supresión"}</dd></div>
            </dl>
            <div className="mt-4"><p className="text-sm font-medium">Subencargados y regiones</p><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{estado.anexoTenant.subencargados.entradas.map((item) => <li key={item.id}>{item.producto} · {item.paisIso2} · {item.finalidad}</li>)}</ul></div>
            <p className="mt-3 text-xs text-muted-foreground">Huella SHA-256 de la ficha: <code className="break-all">{estado.sha256AnexoTenant}</code></p>
          </> : <>
            <p className="mt-2 text-sm text-amber-900">La ficha específica no está completa o verificada. No se permite aceptar el anexo hasta resolver estos puntos:</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">{estado.faltantesAnexoTenant.map((item) => <li key={item}>{item}</li>)}</ul>
          </>}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Condiciones comerciales actuales</h2>
          {estado.condicionesComerciales ? <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Plan</dt><dd className="font-medium">{estado.condicionesComerciales.codigoPlan} · v{estado.condicionesComerciales.planVersion}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Precio registrado en el contrato</dt><dd className="font-medium">{new Intl.NumberFormat("es-CO", { style: "currency", currency: estado.condicionesComerciales.precio.moneda, maximumFractionDigits: 0 }).format(estado.condicionesComerciales.precio.importe)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Periodicidad</dt><dd className="font-medium">{estado.condicionesComerciales.periodicidad}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Vigencia registrada</dt><dd className="font-medium">{estado.condicionesComerciales.vigencia.inicio} – {estado.condicionesComerciales.vigencia.fin}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Trial</dt><dd className="font-medium">{estado.condicionesComerciales.trialDias === null ? "No indicado en el snapshot" : `${estado.condicionesComerciales.trialDias} días`}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Fiscalidad</dt><dd className="font-medium">{estado.condicionesComerciales.fiscalidad ? [estado.condicionesComerciales.fiscalidad.modalidad, estado.condicionesComerciales.fiscalidad.habilitada === undefined ? null : estado.condicionesComerciales.fiscalidad.habilitada ? "Habilitada" : "No habilitada"].filter(Boolean).join(" · ") || "Configuración sin detalle" : "No especificada en el snapshot"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Módulos</dt><dd className="font-medium">{estado.condicionesComerciales.capacidades.length ? estado.condicionesComerciales.capacidades.join(", ") : "No especificados"}</dd></div>
            </dl>
            {Object.keys(estado.condicionesComerciales.limites).length > 0 && <p className="mt-3 text-sm"><span className="font-medium">Límites:</span> {Object.entries(estado.condicionesComerciales.limites).map(([key, value]) => `${key}: ${value.valor} ${value.unidad}`).join(" · ")}</p>}
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">El snapshot no indica si el precio incluye IVA u otros cargos. Ese detalle debe confirmarse y quedar definido antes de publicar condiciones exigibles.</p>
          </> : <p className="mt-2 text-sm text-amber-900">No hay un snapshot contractual vigente que pueda verificarse. La aceptación quedará bloqueada hasta corregir o completar ese dato.</p>}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4"><h2 className="font-semibold">Bundle {estado.bundleId}</h2><p className="mt-1 text-xs text-muted-foreground">Identificador estable; cada archivo se publica y descarga en su versión exacta.</p></div>
          <ul className="divide-y">
            {estado.documentos.map((doc) => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3"><FileText className="size-5 shrink-0 text-slate-500" /><div><p className="font-medium">{LABELS[doc.id] ?? doc.titulo}</p><p className="text-xs text-muted-foreground">v{doc.version} · {doc.tipo === "CONTRACTUAL" ? "Contractual" : "Informativo"} · {doc.estado === "BORRADOR" ? "Borrador" : "Publicado"}</p></div></div>
              <div className="flex gap-2"><Link className="rounded-lg border px-3 py-2 text-sm" href={doc.id === "terminos" ? "/terminos" : doc.id === "politica-tratamiento" ? "/privacidad" : doc.id === "anexo-tratamiento" ? "/anexo-tratamiento" : "/aviso-autorizacion"}>Leer</Link><a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" href={doc.rutaPublica} download><Download className="size-4" />Descargar</a></div>
            </li>)}
          </ul>
        </div>

        {estado.requiereAceptacion && !estado.aceptado && estado.condicionesComerciales && estado.aceptacionDisponible && estado.anexoTenant && <form onSubmit={enviar} className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Aceptar condiciones del negocio</h2>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} /><span>He leído y acepto los <Link className="underline" href="/terminos">Términos del servicio</Link>.</span></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={anexo} onChange={(e) => setAnexo(e.target.checked)} /><span>He leído y acepto el <Link className="underline" href="/anexo-tratamiento">Anexo de tratamiento de datos por cuenta del negocio</Link>.</span></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={instrucciones} onChange={(e) => setInstrucciones(e.target.checked)} /><span>Confirmo que las instrucciones, finalidades, categorías, módulos y subencargados mostrados en la ficha corresponden a este negocio.</span></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={facultad} onChange={(e) => setFacultad(e.target.checked)} /><span>Declaro que tengo facultad para aceptar estos documentos en representación de esta empresa.</span></label>
          <p className="text-xs leading-5 text-muted-foreground">La política de privacidad y el aviso de autorización se consultan por separado. Esta aceptación contractual no sustituye la autorización de cada titular ni consiente publicidad.</p>
          <button disabled={!terminos || !anexo || !facultad || !instrucciones || saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="size-4 animate-spin" />}Aceptar y guardar recibo</button>
        </form>}

        {recibo && estado.aceptado && <button type="button" onClick={() => descargarRecibo(estado, recibo)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"><Download className="size-4" />Descargar recibo de aceptación</button>}
        <section className="rounded-xl border bg-card p-5" aria-label="Historial de aceptaciones">
          <h2 className="font-semibold">Historial de aceptaciones</h2>
          {!Array.isArray(estado.historial) ? <p className="mt-2 text-sm text-amber-900">El historial aún no está disponible. Inténtalo más tarde.</p> : estado.historial.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aún no hay aceptaciones registradas.</p> : <ul className="mt-3 space-y-3">{estado.historial.map((item) => <li key={item.aceptacionId} className="rounded-lg border p-3 text-sm"><p className="font-medium">{new Date(item.aceptadoEn).toLocaleString("es-CO")} · {item.bundleId}</p><p>Administrador: {item.uid} · Contrato: {item.referenciaContrato}</p><ul className="mt-2 space-y-1">{item.documentos.map((doc) => { const path = rutaDocumentoAceptado(doc); return <li key={`${doc.id}:${doc.version}`}>{path ? <a className="underline" href={path} download>{LABELS[doc.id] ?? doc.id} v{doc.version}</a> : <span>{LABELS[doc.id] ?? doc.id} v{doc.version} · Archivo histórico no disponible; solicita una copia a soporte.</span>}</li>; })}</ul></li>)}</ul>}
          {estado.siguienteCursor && <button type="button" disabled={loadingHistory} onClick={() => void cargarMas()} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{loadingHistory ? "Cargando…" : "Cargar más aceptaciones"}</button>}
        </section>
      </>}
    </section>
  );
}
