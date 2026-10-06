'use client'

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, CalendarDays, CircleDollarSign, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatform } from "@/contexts/platform-context";
import { comandoComercial, consultarOfertaComercialTenant, envelope, mensajeError, type ResultadoConsultaOfertaComercialTenant } from "@/lib/platform/client";
import { permiteGestionOfertasTenant } from "@/lib/platform/tenant-offer-guard";
import { firebaseConfig } from "@/lib/firebase";
import { ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";

const CODIGO_APROBACION = "GATE_I_OFFER_1";

type AccionOferta = "crear" | "aprobar";

function precioCop(importe: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(importe);
}

export function TenantOfferPage() {
  const { contexto } = usePlatform();
  const habilitada = permiteGestionOfertasTenant(firebaseConfig.projectId, contexto?.facultades);
  const [consulta, setConsulta] = useState<ResultadoConsultaOfertaComercialTenant | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iniciaEn, setIniciaEn] = useState("");
  const [expiraEn, setExpiraEn] = useState("");
  const [sinVencimiento, setSinVencimiento] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<AccionOferta | null>(null);
  const [ocupada, setOcupada] = useState(false);

  const recargar = useCallback(async () => {
    if (!habilitada) return;
    setCargando(true);
    setError(null);
    try {
      setConsulta(await consultarOfertaComercialTenant(CODIGO_APROBACION));
    } catch (cause) {
      setError(mensajeError(cause));
    } finally {
      setCargando(false);
    }
  }, [habilitada]);

  useEffect(() => { void recargar(); }, [recargar]);

  function solicitarCreacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorFormulario(null);
    if (!consulta || consulta.oferta || consulta.ofertaActivaId) return;
    if (!sinVencimiento && !expiraEn) {
      setErrorFormulario("Indica una fecha de vencimiento o confirma explícitamente que la oferta no vence.");
      return;
    }
    if (!sinVencimiento && expiraEn <= iniciaEn) {
      setErrorFormulario("La fecha de vencimiento debe ser posterior al inicio de vigencia.");
      return;
    }
    setAccionPendiente("crear");
  }

  async function ejecutarAccion() {
    if (!accionPendiente || !consulta || !habilitada) return;
    const accion = accionPendiente;
    setOcupada(true);
    setAccionPendiente(null);
    try {
      if (accion === "crear") {
        await comandoComercial("CrearOfertaComercialTenant", {
          ...envelope("OFERTA_COMERCIAL_TENANT_REGISTRAR"),
          expectedRevision: consulta.controlRevision,
          codigoAprobacion: CODIGO_APROBACION,
          iniciaEn,
          expiraEn: sinVencimiento ? null : expiraEn,
        });
        toast.success("Borrador de oferta creado en staging.");
      } else {
        const oferta = consulta.oferta;
        if (!oferta || oferta.estado !== "BORRADOR" || consulta.ofertaActivaId) return;
        await comandoComercial("AprobarOfertaComercialTenant", {
          ...envelope("OFERTA_COMERCIAL_TENANT_APROBAR"),
          expectedRevision: oferta.revision,
          codigoAprobacion: CODIGO_APROBACION,
        });
        toast.success("Oferta aprobada en staging. Bootstrap no fue ejecutado.");
      }
      await recargar();
    } catch (cause) {
      toast.error(mensajeError(cause));
      setError(mensajeError(cause));
    } finally {
      setOcupada(false);
    }
  }

  const oferta = consulta?.oferta;
  const autorizacion = consulta?.autorizacion;
  const puedeCrear = habilitada && !cargando && !error && consulta !== null && oferta === null && consulta.ofertaActivaId === null;
  const puedeAprobar = habilitada && !cargando && !error && oferta?.estado === "BORRADOR" && consulta?.ofertaActivaId === null;

  return <>
    <PageIntro
      eyebrow="Condición comercial tenant-specific"
      title="Oferta de staging"
      description="Consulta y registra la oferta aprobada para Gate I. Los términos comerciales se resuelven en servidor; la pantalla no cambia el plan público ni ejecuta Bootstrap."
    />

    {!habilitada ? (
      <Card className="border-amber-300 bg-amber-50"><CardContent className="flex gap-4 p-6">
        <ShieldCheck className="mt-1 size-5 shrink-0 text-amber-800" />
        <div><h3 className="font-semibold text-amber-950">Acciones bloqueadas fuera de staging</h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">Esta vista solo funciona cuando Firebase apunta exactamente a <code>micafe-pos-staging</code> y la sesión tiene la facultad <code>COMERCIAL_GOBERNAR</code>. Proyecto detectado: <code>{firebaseConfig.projectId ?? "no configurado"}</code>. No se enviaron solicitudes.</p>
        </div>
      </CardContent></Card>
    ) : (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4" /><span><strong>STAGING</strong> · Firebase <code>micafe-pos-staging</code></span></div>
          <Button variant="outline" size="sm" disabled={cargando || ocupada} onClick={() => void recargar()}><RefreshCw className="mr-2 size-4" />Consultar oferta</Button>
        </div>

        {cargando ? <LoadingState label="Consultando la oferta por el comando de plataforma…" /> : error ? <ErrorState message={error} retry={() => void recargar()} /> : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.75fr)]">
            <Card>
              <CardContent className="space-y-6 p-6">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Oferta autorizada</p><h3 className="mt-2 text-xl font-semibold">{autorizacion?.nombreEmpresaObjetivo ?? "Oferta Gate I"}</h3><p className="mt-1 font-mono text-sm text-slate-500">{autorizacion?.empresaIdObjetivo}</p></div>
                <dl className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div><dt className="text-xs uppercase tracking-wide text-slate-500">Plan base</dt><dd className="mt-1 font-medium">{autorizacion?.planIdBase} · v{autorizacion?.planVersionBase}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wide text-slate-500">Periodicidad</dt><dd className="mt-1 font-medium">Anual</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-slate-500">Precio acordado</dt><dd className="mt-1 flex items-center gap-2 text-lg font-semibold"><CircleDollarSign className="size-5 text-cyan-700" />{autorizacion ? precioCop(autorizacion.precioAcordado.importe) : "—"} {autorizacion?.precioAcordado.moneda}</dd></div>
                </dl>

                {oferta ? (
                  <div className="space-y-4 rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Oferta existente</h4><EstadoBadge estado={oferta.estado} /></div>
                    <p className="font-mono text-sm text-slate-600">{oferta.ofertaId} · revisión {oferta.revision}</p>
                    <p className="text-sm text-slate-600">Vigencia: {oferta.iniciaEn} a {oferta.expiraEn ?? "sin vencimiento"}</p>
                    {consulta?.ofertaActivaId === oferta.ofertaId ? <p className="text-sm font-medium text-emerald-700">Es la oferta activa para Bootstrap. El tenant aún no ha sido creado por esta pantalla.</p> : null}
                    {oferta.estado === "BORRADOR" ? (
                      <Button disabled={!puedeAprobar || ocupada} onClick={() => setAccionPendiente("aprobar")}>
                        {ocupada ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <BadgeCheck className="mr-2 size-4" />}Aprobar oferta
                      </Button>
                    ) : null}
                    {consulta?.ofertaActivaId && consulta.ofertaActivaId !== oferta.ofertaId ? <p className="text-sm text-amber-800">Existe otra oferta activa ({consulta.ofertaActivaId}); esta no se puede aprobar hasta resolverla mediante el flujo canónico.</p> : null}
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={solicitarCreacion}>
                    <div><h4 className="font-semibold">Crear borrador</h4><p className="mt-1 text-sm leading-relaxed text-slate-500">El monto, el plan, la empresa y la referencia se resuelven en servidor desde la aprobación registrada; solo define la vigencia.</p><p className="mt-1 font-mono text-xs text-slate-500">{autorizacion?.referenciaAprobacion}</p></div>
                    {consulta?.ofertaActivaId ? (
                      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">La empresa ya tiene activa otra oferta ({consulta.ofertaActivaId}). No se creará otro borrador; primero debe resolverse esa oferta por el flujo canónico.</p>
                    ) : (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-1"><Label htmlFor="oferta-inicia">Inicia el</Label><Input id="oferta-inicia" type="date" value={iniciaEn} onChange={(event) => setIniciaEn(event.target.value)} required /></div>
                          <div className="grid gap-1"><Label htmlFor="oferta-expira">Vence el</Label><Input id="oferta-expira" type="date" min={iniciaEn} value={expiraEn} onChange={(event) => setExpiraEn(event.target.value)} disabled={sinVencimiento} required={!sinVencimiento} /></div>
                        </div>
                        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm text-slate-700">
                          <input type="checkbox" className="mt-0.5 size-4 accent-cyan-700" checked={sinVencimiento} onChange={(event) => setSinVencimiento(event.target.checked)} />
                          <span><strong className="block">Sin fecha de vencimiento</strong><span className="text-slate-500">Elige esto explícitamente si la autorización comercial no vence.</span></span>
                        </label>
                        {errorFormulario ? <p role="alert" className="text-sm text-rose-700">{errorFormulario}</p> : null}
                        <Button type="submit" disabled={!puedeCrear || ocupada} className="w-full sm:w-auto"><CalendarDays className="mr-2 size-4" />Revisar y crear borrador</Button>
                      </>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit border-slate-200 bg-slate-50">
              <CardContent className="space-y-4 p-6">
                <h3 className="font-semibold">Control de alcance</h3>
                <ul className="space-y-3 text-sm leading-relaxed text-slate-600">
                  <li>La lectura puntual y cada cambio pasan por Functions y revalidan <code>COMERCIAL_GOBERNAR</code>.</li>
                  <li>Crear genera solo un borrador; aprobar es una acción separada y auditada.</li>
                  <li>La aprobación documenta los términos internos; no afirma aceptación del cliente ni autoriza Bootstrap.</li>
                  <li>El precio público del plan permanece en {precioCop(1_800_000)} COP.</li>
                  <li>Aprobar habilita su consumo por Bootstrap, pero esta página no crea Empresa, suscripción, usuarios ni catálogo.</li>
                  <li>La UI no contiene escrituras directas a Firestore ni funciona fuera del proyecto de staging.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    )}

    <AlertDialog open={accionPendiente !== null} onOpenChange={(open) => !open && !ocupada && setAccionPendiente(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{accionPendiente === "crear" ? "Crear el borrador de oferta" : "Aprobar la oferta"}</AlertDialogTitle>
          <AlertDialogDescription>
            {accionPendiente === "crear"
              ? <>Se registrará en <strong>micafe-pos-staging</strong> la oferta resuelta por servidor para <strong>{autorizacion?.nombreEmpresaObjetivo}</strong>, a partir de la aprobación vigente. Esta acción no crea el tenant ni ejecuta Bootstrap.</>
              : <>La oferta aprobada por <strong>{autorizacion ? `${precioCop(autorizacion.precioAcordado.importe)} ${autorizacion.precioAcordado.moneda}` : "el precio autorizado"}</strong> quedará activa para su eventual consumo atómico por Bootstrap. No se creará el tenant ni se iniciará el Trial.</>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupada}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={ocupada} onClick={(event) => { event.preventDefault(); void ejecutarAccion(); }}>
            {ocupada && <LoaderCircle className="mr-2 size-4 animate-spin" />}{accionPendiente === "crear" ? "Confirmar borrador" : "Confirmar aprobación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
