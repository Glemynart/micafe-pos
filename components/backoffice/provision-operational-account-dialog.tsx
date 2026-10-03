'use client'

import { useState } from "react";
import { Landmark, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { mensajeError, provisionarCuentaOperativa } from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CLAVE = /^[a-z][a-z0-9-]{2,63}$/;
const RESERVADAS = new Set(["caja-principal", "caja-fuerte"]);

export function ProvisionOperationalAccountDialog({
  empresaId,
  onCompletado,
}: {
  empresaId: string;
  onCompletado: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [claveOperativa, setClaveOperativa] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const claveNormalizada = claveOperativa.trim().toLowerCase();
  const valida = CLAVE.test(claveNormalizada)
    && !RESERVADAS.has(claveNormalizada)
    && nombre.trim().length >= 2
    && nombre.trim().length <= 120;

  async function provisionar() {
    if (!valida) return;
    setGuardando(true);
    try {
      const resultado = await provisionarCuentaOperativa(empresaId, {
        claveOperativa: claveNormalizada,
        nombre: nombre.trim(),
      });
      toast.success(resultado.idempotente ? "La cuenta operativa ya estaba provisionada" : "Cuenta operativa provisionada");
      setOpen(false);
      setClaveOperativa("");
      setNombre("");
      await onCompletado();
    } catch (cause) {
      toast.error(mensajeError(cause));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Landmark className="mr-2 size-4" />Provisionar cuenta operativa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provisionar cuenta operativa</DialogTitle>
          <DialogDescription>
            Crea una cuenta no reservada para esta empresa mediante el comando canónico de plataforma. Inicia con saldo cero y no genera movimientos financieros.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="clave-operativa">Clave operativa</Label>
            <Input id="clave-operativa" value={claveOperativa} onChange={(event) => setClaveOperativa(event.target.value)} placeholder="bancolombia" disabled={guardando} />
            <p className="text-xs text-slate-500">Minúsculas, números y guiones; las claves reservadas no son válidas.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombre-cuenta-operativa">Nombre visible</Label>
            <Input id="nombre-cuenta-operativa" value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Bancolombia" disabled={guardando} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={guardando} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={guardando || !valida} onClick={() => void provisionar()}>
            {guardando && <LoaderCircle className="mr-2 size-4 animate-spin" />}Provisionar cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
