"use client";

import { useState, type FormEvent } from "react";
import { usePlatform } from "@/contexts/platform-context";
import { consultarReclamo, tramitarReclamo, type ReclamoPrivacidad, type ReclamoRecibido } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageIntro } from "./ui";

const camposRegistro = [
  ["consecutivo", "Consecutivo de recepción"],
  ["empresaId", "ID de empresa"],
  ["clienteId", "ID de ficha del cliente"],
  ["identidadRef", "Referencia de identidad verificada"],
  ["instruccionRef", "Referencia de la instrucción del negocio"],
  ["trasladoRef", "Referencia del traslado al negocio"],
] as const;
const valor = (form: FormData, campo: string) => String(form.get(campo) ?? "").trim();

export function PrivacyClaimsPage() {
  const { tiene } = usePlatform();
  const [reclamo, setReclamo] = useState<ReclamoPrivacidad | ReclamoRecibido | null>(null);
  const [casoId, setCasoId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  if (!tiene("PRIVACIDAD_RECLAMOS_TRAMITAR")) return <p>Tu usuario no tiene permiso para tramitar reclamos de privacidad.</p>;

  async function ejecutar(action: () => Promise<void>, limpiar = false) {
    setOcupado(true);
    setError("");
    setMensaje("");
    if (limpiar) setReclamo(null);
    try { await action(); }
    catch { setError("No se pudo completar la operación. Verifica la referencia, los permisos y el estado del reclamo."); }
    finally { setOcupado(false); }
  }

  async function registrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await ejecutar(async () => {
      const resultado = await tramitarReclamo({
        accion: "REGISTRAR",
        ...Object.fromEntries(camposRegistro.map(([key]) => [key, valor(form, key)])),
        motivo: valor(form, "motivo"), recibido: valor(form, "recibido"), completo: valor(form, "completo"),
        verificacionConfirmada: form.get("verificacion") === "on",
      });
      setCasoId(resultado.casoId);
      setMensaje("Reclamo registrado. Conserva el código para consultarlo.");
      element.reset();
      setReclamo(await consultarReclamo(resultado.casoId));
    }, true);
  }

  async function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ejecutar(async () => setReclamo(await consultarReclamo(casoId.trim())), true);
  }

  async function recibir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await ejecutar(async () => {
      const resultado = await tramitarReclamo({
        accion: "RECIBIR", consecutivo: valor(form, "consecutivo"),
        empresaId: valor(form, "empresaId"), recibido: valor(form, "recibido"),
      });
      setCasoId(resultado.casoId);
      setReclamo(await consultarReclamo(resultado.casoId));
      setMensaje("Recepción registrada. Conserva el código para consultarlo.");
      element.reset();
    }, true);
  }

  async function documentar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reclamo) return;
    const form = new FormData(event.currentTarget);
    await ejecutar(async () => {
      await tramitarReclamo({
        accion: valor(form, "accion"), casoId: reclamo.casoId,
        respuestaRef: valor(form, "referencia"), resultado: valor(form, "resumen"),
      });
      setReclamo(await consultarReclamo(reclamo.casoId));
    });
  }

  async function cerrar() {
    if (!reclamo || reclamo.estado === "RECIBIDO" || !reclamo.respuestaRef) return;
    const { casoId, respuestaRef } = reclamo;
    await ejecutar(async () => {
      await tramitarReclamo({ accion: "CERRAR", casoId, respuestaRef });
      setReclamo(await consultarReclamo(casoId));
      setMensaje("Reclamo cerrado.");
    });
  }

  return <div className="space-y-5">
    <PageIntro eyebrow="Privacidad" title="Reclamos de privacidad" description="Registra un reclamo completo del directorio de clientes y consulta sus vencimientos." />
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {mensaje && <p role="status" className="rounded-lg border p-3 text-sm">{mensaje}</p>}
    <Card><CardContent>
      <details>
        <summary className="cursor-pointer font-semibold">Registrar recepción de un reclamo incompleto</summary>
        <form onSubmit={recibir} className="mt-4"><fieldset disabled={ocupado} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Label className="grid gap-2">Consecutivo de recepción<Input name="consecutivo" maxLength={120} required /></Label>
            <Label className="grid gap-2">ID de empresa<Input name="empresaId" maxLength={120} required /></Label>
            <Label className="grid gap-2">Fecha de recepción en Colombia<Input name="recibido" type="date" required /></Label>
          </div>
          <Button>Registrar recepción</Button>
        </fieldset></form>
      </details>
    </CardContent></Card>
    <Card><CardContent className="space-y-4">
      <h2 className="font-semibold">Registrar reclamo verificado</h2>
      <p className="text-sm text-muted-foreground">Guarda los soportes en el expediente privado. Aquí usa referencias, sin adjuntar documentos de identidad.</p>
      <form onSubmit={registrar}><fieldset disabled={ocupado} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {camposRegistro.map(([name, label]) => <Label key={name} className="grid gap-2">{label}
            <Input name={name} maxLength={120} pattern="[a-zA-Z0-9_\-]+" required />
          </Label>)}
          <Label className="grid gap-2">Fecha de recepción en Colombia<Input name="recibido" type="date" required /></Label>
          <Label className="grid gap-2">Fecha en que quedó completo<Input name="completo" type="date" required /></Label>
        </div>
        <Label className="grid gap-2">Motivo<Textarea name="motivo" maxLength={500} required /></Label>
        <Label className="flex items-start gap-2"><input type="checkbox" name="verificacion" required />
          Revisé la identidad, la ficha, la instrucción del negocio y la constancia de traslado.
        </Label>
        <Button>Registrar y anotar en la ficha</Button>
      </fieldset></form>
    </CardContent></Card>
    <Card><CardContent className="space-y-4">
      <h2 className="font-semibold">Consultar reclamo</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={consultar}>
        <Label className="grid min-w-56 flex-1 gap-2">Código del reclamo
          <Input value={casoId} onChange={event => { setCasoId(event.target.value); setReclamo(null); }} disabled={ocupado} maxLength={120} required />
        </Label>
        <Button disabled={ocupado}>Consultar</Button>
      </form>
      {reclamo?.estado === "RECIBIDO" && <div className="space-y-1 border-t pt-4 text-sm">
        <p className="font-medium">Recibido. Falta completar el reclamo.</p>
        <p>Plazo para solicitar la información faltante: {reclamo.vencimientoRequerimiento}</p>
        <p className="text-muted-foreground">Cuando esté completo, usa el mismo consecutivo, empresa y fecha de recepción.</p>
      </div>}
      {reclamo && reclamo.estado !== "RECIBIDO" && <section className="space-y-4 border-t pt-4" aria-label="Detalle del reclamo">
        <p className="font-medium">{reclamo.estado === "RESUELTO" ? "Resuelto" : reclamo.leyenda ?? "Verificado"}</p>
        {reclamo.motivo && <p className="break-words text-sm">{reclamo.motivo}</p>}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Plazo de anotación</dt><dd>{reclamo.vencimientoAnotacion}</dd></div>
          <div><dt className="text-muted-foreground">Plazo de respuesta</dt><dd>{reclamo.vencimientoRespuesta}</dd></div>
        </dl>
        {reclamo.estado === "ABIERTO" && (reclamo.respuestaDocumentada
          ? <Button type="button" disabled={ocupado || !reclamo.respuestaRef} onClick={() => void cerrar()}>Cerrar reclamo</Button>
          : <form onSubmit={documentar}><fieldset disabled={ocupado} className="space-y-4">
            <Label className="grid gap-2">Gestión realizada
              <select name="accion" className="h-10 rounded-md border bg-background px-3">
                <option value="DOCUMENTAR_RESPUESTA">Respuesta comunicada</option>
                <option value="PRORROGAR">Prórroga comunicada</option>
              </select>
            </Label>
            <Label className="grid gap-2">Referencia de la comunicación<Input name="referencia" maxLength={120} required /></Label>
            <Label className="grid gap-2">Resultado de la respuesta o motivo de prórroga<Textarea name="resumen" maxLength={500} required /></Label>
            <Button>Guardar constancia</Button>
          </fieldset></form>)}
      </section>}
    </CardContent></Card>
  </div>;
}
