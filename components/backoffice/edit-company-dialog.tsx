'use client'

import { useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { comandoComercial, envelope, mensajeError } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * ADR-SAAS-013 §5.3/§5.4 — única superficie de edición administrativa: reutiliza
 * `ActualizarDatosAdministrativosEmpresa`, acotado por el propio comando a
 * `nombreComercial`. No introduce campos nuevos (paisFiscal y estado quedan
 * fuera por diseño del comando canónico).
 */
export function EditCompanyDialog({
  empresaId,
  nombreComercialActual,
  expectedRevision,
  onActualizado,
}: {
  empresaId: string;
  nombreComercialActual: string;
  expectedRevision: number | null;
  onActualizado: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [nombreComercial, setNombreComercial] = useState(nombreComercialActual);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (expectedRevision == null || !nombreComercial.trim()) return;
    setGuardando(true);
    try {
      await comandoComercial("ActualizarDatosAdministrativosEmpresa", {
        ...envelope("BACKOFFICE_EMPRESA_ACTUALIZAR_DATOS_ADMINISTRATIVOS"),
        empresaId,
        nombreComercial: nombreComercial.trim(),
        expectedRevision,
      });
      toast.success("Nombre comercial actualizado");
      setOpen(false);
      await onActualizado();
    } catch (cause) {
      toast.error(mensajeError(cause));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setNombreComercial(nombreComercialActual); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Pencil className="mr-2 size-4" />Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar datos administrativos</DialogTitle>
          <DialogDescription>Solo el nombre comercial es editable desde el Portal. País fiscal y estado se gobiernan por sus propios servicios canónicos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="nombreComercial">Nombre comercial</Label>
          <Input id="nombreComercial" value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} disabled={guardando} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={guardando} onClick={() => setOpen(false)}>Cerrar</Button>
          <Button disabled={guardando || !nombreComercial.trim() || expectedRevision == null} onClick={() => void guardar()}>
            {guardando && <LoaderCircle className="mr-2 size-4 animate-spin" />}Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
