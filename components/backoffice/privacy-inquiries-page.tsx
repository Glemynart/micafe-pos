"use client";

import { useState, type FormEvent } from "react";
import { usePlatform } from "@/contexts/platform-context";
import { consultarConsultaPrivacidad, tramitarConsultaPrivacidad, type ConsultaPrivacidad } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageIntro } from "./ui";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function PrivacyInquiriesPage() {
  const { tiene } = usePlatform();
  const [casoId, setCasoId] = useState("");
  const [caso, setCaso] = useState<ConsultaPrivacidad | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!tiene("PRIVACIDAD_CONSULTAS_TRAMITAR")) return <p>No tienes permiso para tramitar consultas de privacidad.</p>;
  async function execute(operation: () => Promise<void>) {
    setPending(true); setError("");
    try { await operation(); } catch { setError("No fue posible completar la operación. Comprueba los datos y el estado de la consulta."); }
    finally { setPending(false); }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget, form = new FormData(element);
    await execute(async () => {
      const result = await tramitarConsultaPrivacidad({ accion: "REGISTRAR", empresaId: value(form, "empresaId"), consecutivo: value(form, "consecutivo"), recibido: value(form, "recibido"), identidadRef: value(form, "identidadRef"), instruccionRef: value(form, "instruccionRef"), verificacionConfirmada: form.get("verificacion") === "on" });
      setCasoId(result.casoId); setCaso(await consultarConsultaPrivacidad(result.casoId)); element.reset();
    });
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget, form = new FormData(element);
    await execute(async () => {
      const result = await tramitarConsultaPrivacidad({ accion: "RECIBIR", empresaId: value(form, "empresaId"), consecutivo: value(form, "consecutivo"), recibido: value(form, "recibido") });
      setCasoId(result.casoId); setCaso(await consultarConsultaPrivacidad(result.casoId)); element.reset();
    });
  }
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await execute(async () => setCaso(await consultarConsultaPrivacidad(casoId.trim())));
  }
  async function document(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!caso) return;
    const form = new FormData(event.currentTarget);
    await execute(async () => {
      await tramitarConsultaPrivacidad({ accion: value(form, "accion"), casoId: caso.casoId, referencia: value(form, "referencia"), resultado: value(form, "resultado") });
      setCaso(await consultarConsultaPrivacidad(caso.casoId));
    });
  }
  return <div className="space-y-5">
    <PageIntro eyebrow="Privacidad" title="Consultas de datos personales" description="Registra la solicitud, controla el plazo y conserva la referencia de la respuesta." />
    {error && <p role="alert" className="rounded-lg border p-3 text-sm text-red-800">{error}</p>}
    <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Registrar recepción pendiente de verificación</summary><form onSubmit={receive} className="mt-4 grid gap-3 sm:grid-cols-2"><Label className="grid gap-1">ID de empresa<Input name="empresaId" maxLength={120} required /></Label><Label className="grid gap-1">Consecutivo de recepción<Input name="consecutivo" maxLength={120} required /></Label><Label className="grid gap-1">Fecha de recepción en Colombia<Input type="date" name="recibido" required /></Label><Button disabled={pending}>Registrar recepción</Button></form><p className="mt-3 text-sm">Para completar la verificación, usa el mismo consecutivo, empresa y fecha en el formulario siguiente.</p></details>
    <form onSubmit={register} className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Registrar consulta verificada</h2><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      {[ ["empresaId", "ID de empresa"], ["consecutivo", "Consecutivo de recepción"], ["identidadRef", "Referencia de identidad verificada"], ["instruccionRef", "Referencia de instrucción del negocio"] ].map(([name, label]) => <Label key={name} className="grid gap-1">{label}<Input name={name} maxLength={120} required /></Label>)}
      <Label className="grid gap-1">Fecha de recepción en Colombia<Input type="date" name="recibido" required /></Label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verificacion" required />Confirmo que verifiqué la identidad y facultad.</label>
      <Button>Registrar consulta</Button>
    </fieldset></form>
    <form onSubmit={lookup} className="flex flex-wrap items-end gap-3 rounded-xl border p-5"><Label className="grid min-w-60 flex-1 gap-1">Código de consulta<Input value={casoId} onChange={event => setCasoId(event.target.value)} required /></Label><Button disabled={pending}>Consultar</Button></form>
    {caso && <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Consulta {caso.casoId}</h2><p>Estado: {caso.estado} · Vencimiento: {caso.vencimientoRespuesta}</p>
      {caso.estado === "RECIBIDA" && <p>La consulta está pendiente de verificación. El plazo se cuenta desde la recepción.</p>}
      {caso.estado === "ABIERTA" && <form onSubmit={document} className="grid gap-3 sm:grid-cols-2"><Label className="grid gap-1">Actuación<select name="accion" className="min-h-10 rounded-md border px-3"><option value="RESPONDER">Registrar respuesta comunicada y cerrar</option><option value="PRORROGAR">Registrar aviso de prórroga</option></select></Label><Label className="grid gap-1">Referencia de la comunicación<Input name="referencia" maxLength={120} required /></Label><Label className="grid gap-1 sm:col-span-2">Resultado o motivo, sin datos sensibles<Input name="resultado" maxLength={500} required /></Label><Button disabled={pending}>Guardar actuación</Button></form>}
      {caso.estado === "RESPONDIDA" && <p>Respuesta registrada. Referencia: {caso.respuestaRef}</p>}
    </section>}
  </div>;
}
