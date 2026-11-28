"use client";

import { useState, type FormEvent } from "react";
import { usePlatform } from "@/contexts/platform-context";
import { administrarContactoExportacion, type ResumenContactoExportacion } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageIntro } from "./ui";

const soloEmuladores = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
const campo = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function ExportContactPage() {
  const { tiene } = usePlatform();
  const [empresaId, setEmpresaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [designacion, setDesignacion] = useState<ResumenContactoExportacion | null>(null);
  const [estado, setEstado] = useState("SIN_DESIGNACION");
  const [challengeId, setChallengeId] = useState("");
  const [vence, setVence] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  if (!tiene("EXPORTACION_CONTACTO_GOBERNAR")) return <p>No tienes permiso para administrar el contacto de exportación.</p>;

  async function ejecutar(action: () => Promise<void>) {
    setOcupado(true); setError(""); setMensaje("");
    try { await action(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message.includes("CONTACTO_EXPORTACION_SOLO_SINTETICO")) setError("Las escrituras están bloqueadas fuera del Emulator sintético.");
      else if (message.includes("CONTACTO_EXPORTACION_CANAL_NO_CONFIGURADO")) setError("No hay proveedor de correo o mensajería configurado; no se envió ningún código.");
      else if (message.includes("PLATFORM_CONTEXT_STALE")) setError("La autorización cambió. Actualiza tu sesión y vuelve a intentarlo.");
      else if (message.includes("PLATFORM_ACCESS_DENIED")) setError("No tienes autorización vigente para esta operación.");
      else setError("No fue posible completar la operación. Revisa los datos y el permiso del operador.");
    } finally { setOcupado(false); }
  }

  async function consultar(id = empresaId) {
    const result = await administrarContactoExportacion({ accion: "CONSULTAR", empresaId: id });
    setEstado(result.estado);
    setDesignacion(result.designacion ?? null);
  }

  async function consultarSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = campo(form, "empresaId");
    await ejecutar(async () => { setEmpresaId(id); await consultar(id); });
  }

  async function designar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = campo(form, "empresaId");
    const instruccionRef = campo(form, "instruccionRef");
    await ejecutar(async () => {
      const result = await administrarContactoExportacion({
        accion: "DESIGNAR", empresaId: id, canal: "EMAIL_VERIFICADO",
        destino: campo(form, "destino"), instruccionRef,
        instruccionConfirmada: form.get("confirmacion") === "on",
      });
      setEmpresaId(id); setReferencia(instruccionRef); setChallengeId(""); setVence("");
      await consultar(id);
      setMensaje(`Designación sintética guardada como versión ${result.revision}. Aún requiere prueba de control del canal.`);
    });
  }

  async function iniciarVerificacion() {
    if (!designacion || !empresaId) return;
    await ejecutar(async () => {
      const result = await administrarContactoExportacion({
        accion: "INICIAR_VERIFICACION", empresaId, instruccionRef: designacion.designationRef,
      });
      setChallengeId(result.challengeId ?? ""); setVence(result.expiresAt ?? "");
      setMensaje("Se inició el desafío sintético. No se envía correo fuera del Emulator.");
      await consultar(empresaId);
    });
  }

  async function verificar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await ejecutar(async () => {
      await administrarContactoExportacion({
        accion: "VERIFICAR_CANAL", empresaId, challengeId, codigo: campo(form, "codigo"),
      });
      setChallengeId(""); setVence("");
      await consultar(empresaId);
      setMensaje("Canal sintético verificado. El resumen solo muestra el destino enmascarado.");
      element.reset();
    });
  }

  async function revocar() {
    if (!empresaId) return;
    await ejecutar(async () => {
      await administrarContactoExportacion({ accion: "REVOCAR", empresaId });
      setChallengeId(""); setVence("");
      await consultar(empresaId);
      setMensaje("Designación revocada. El destino activo fue eliminado.");
    });
  }

  return <div className="space-y-5">
    <PageIntro eyebrow="Privacidad" title="Contacto de exportación" description="Administra la designación versionada requerida para autorizar una futura entrega de datos del negocio." />
    <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Solo pruebas sintéticas.</strong> No ingreses datos reales. Las escrituras se aceptan únicamente desde un proyecto Emulator `demo-*`, usando correos con dominio `.invalid`. No hay proveedor de entrega configurado, ni se habilita la exportación de datos.
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-800">{error}</p>}
    {mensaje && <p role="status" className="rounded-lg border p-3 text-sm">{mensaje}</p>}
    <form onSubmit={consultarSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-5">
      <Label className="grid min-w-60 flex-1 gap-1">ID de empresa<Input name="empresaId" value={empresaId} onChange={event => setEmpresaId(event.target.value)} maxLength={120} required /></Label>
      <Button disabled={ocupado}>Consultar estado</Button>
    </form>
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Estado de la designación</h2>
      <p>Estado: <strong>{estado}</strong></p>
      {designacion && <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Canal</dt><dd>{designacion.channel}</dd></div>
        <div><dt className="text-muted-foreground">Destino</dt><dd>{designacion.maskedDestination}</dd></div>
        <div><dt className="text-muted-foreground">Versión</dt><dd>{designacion.revision}</dd></div>
        <div><dt className="text-muted-foreground">Referencia verificada</dt><dd>{designacion.designationRef}</dd></div>
      </dl>}
      {designacion && estado !== "REVOCADO" && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={ocupado || !soloEmuladores || estado !== "PENDIENTE_CANAL"} onClick={() => void iniciarVerificacion()}>Iniciar prueba sintética de canal</Button>
        <Button type="button" variant="outline" disabled={ocupado || !soloEmuladores} onClick={() => void revocar()}>Revocar designación sintética</Button>
      </div>}
    </section>
    <form onSubmit={designar} className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Registrar designación sintética</h2>
      <p className="text-sm text-muted-foreground">En producción y staging el servidor rechazará esta escritura. El operador debe conservar la instrucción externa por su canal, sin cargar documentos de identidad.</p>
      <fieldset disabled={ocupado || !soloEmuladores} className="grid gap-3 sm:grid-cols-2">
        <Label className="grid gap-1">ID de empresa<Input name="empresaId" value={empresaId} onChange={event => setEmpresaId(event.target.value)} maxLength={120} required /></Label>
        <Label className="grid gap-1">Correo sintético (.invalid)<Input name="destino" type="email" placeholder="operador@example.invalid" maxLength={320} required /></Label>
        <Label className="grid gap-1 sm:col-span-2">Referencia opaca de la instrucción del negocio<Input name="instruccionRef" value={referencia} onChange={event => setReferencia(event.target.value)} maxLength={160} minLength={4} required /></Label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="confirmacion" type="checkbox" required className="mt-1" />Confirmo que, en este fixture sintético, verifiqué la instrucción de designación.</label>
        <Button disabled={ocupado || !soloEmuladores}>Guardar designación sintética</Button>
      </fieldset>
      {!soloEmuladores && <p className="text-sm text-muted-foreground">El formulario queda deshabilitado fuera del modo Emulator.</p>}
    </form>
    {challengeId && <form onSubmit={verificar} className="grid gap-3 rounded-xl border p-5 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Verificar prueba de canal sintética</h2>
      <p className="text-sm text-muted-foreground sm:col-span-2">Desafío: {challengeId} · Vence: {vence}. El código se recibe por el adapter de prueba; no se registra en auditoría ni se devuelve por la callable.</p>
      <Label className="grid gap-1">Código de un solo uso<Input name="codigo" type="password" inputMode="text" autoComplete="one-time-code" maxLength={43} required /></Label>
      <Button disabled={ocupado || !soloEmuladores}>Confirmar canal</Button>
    </form>}
  </div>;
}
