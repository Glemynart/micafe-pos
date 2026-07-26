'use client'

import { Copy, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface CredencialEntrega {
  codigo: string;
  pinTemporal: string;
}

/**
 * ADR-SAAS-013 §7.2 — diálogo de entrega única. El backend nunca vuelve a
 * exponer el PIN (ni en reintentos ni en réplicas idempotentes): esta es la
 * única oportunidad de leerlo, así que se bloquea el cierre accidental
 * (click afuera, Escape, botón de cierre estándar) y se exige el
 * reconocimiento explícito de "ya lo entregué".
 */
export function CredentialRevealDialog({ credencial, onClose }: { credencial: CredencialEntrega | null; onClose: () => void }) {
  return (
    <Dialog open={credencial !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" />Credencial inicial emitida</DialogTitle>
          <DialogDescription>Este PIN no vuelve a mostrarse. Entrégalo ahora al administrador por un canal seguro.</DialogDescription>
        </DialogHeader>
        {credencial && (
          <div className="space-y-4 py-2">
            <CredentialField label="Código" value={credencial.codigo} />
            <CredentialField label="PIN temporal" value={credencial.pinTemporal} />
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Si se pierde, la única forma de recuperarlo es reemitir la credencial — invalida esta.
            </p>
          </div>
        )}
        <DialogFooter><Button onClick={onClose}>Ya lo entregué, cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-mono text-lg font-semibold tracking-wide">{value}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => { void navigator.clipboard.writeText(value); toast.success(`${label} copiado`); }}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
