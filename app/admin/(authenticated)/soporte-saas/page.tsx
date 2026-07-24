'use client'

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { envelope, listarSoporteTenant, mensajeError, transicionarSoporte } from "@/lib/platform/client";
import { EstadoBadge, fecha } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SoporteTenantPage() {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems((await listarSoporteTenant()).items); } catch (cause) { setError(mensajeError(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(item: Record<string, any>, destino: "AUTORIZADA" | "RECHAZADA" | "REVOCADA") {
    setBusy(item.autorizacionId);
    try {
      await transicionarSoporte(destino, {
        ...envelope(`TENANT_ADMIN_SOPORTE_${destino}`),
        autorizacionId: item.autorizacionId,
        expectedVersion: item.version,
      });
      toast.success("Decisión de soporte registrada"); await load();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-4 text-white">
      <div><p className="text-xs uppercase tracking-wider text-white/40">Consentimiento tenant</p><h1 className="mt-1 text-xl font-semibold">Soporte SaaS</h1><p className="mt-2 text-sm text-white/50">Autoriza, rechaza o revoca acceso temporal de diagnóstico. No concede operación ni escritura.</p></div>
      {loading ? <div className="flex min-h-48 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-white/40" /></div> : error ? <Card><CardContent className="text-sm text-rose-500">{error}<Button className="mt-4 w-full" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Reintentar</Button></CardContent></Card> : items.length === 0 ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No existen solicitudes para esta Empresa.</CardContent></Card> : items.map((item) => <Card key={item.autorizacionId}><CardHeader className="flex-row items-start justify-between"><CardTitle className="font-mono text-sm">{item.operadorUid}</CardTitle><EstadoBadge estado={item.estado} /></CardHeader><CardContent><div className="grid grid-cols-2 gap-4 text-xs"><div><span className="text-muted-foreground">Alcance</span><p className="mt-1 font-medium">{item.alcanceCodigo}</p></div><div><span className="text-muted-foreground">Expira</span><p className="mt-1 font-medium">{fecha(item.expiraEn)}</p></div></div><div className="mt-5 flex gap-2">{item.estado === "SOLICITADA" && <><Button size="sm" disabled={busy === item.autorizacionId} onClick={() => void decide(item, "AUTORIZADA")}>Autorizar</Button><Button size="sm" variant="outline" disabled={busy === item.autorizacionId} onClick={() => void decide(item, "RECHAZADA")}>Rechazar</Button></>}{["AUTORIZADA", "EN_SESION"].includes(item.estado) && <Button size="sm" variant="destructive" disabled={busy === item.autorizacionId} onClick={() => void decide(item, "REVOCADA")}>Revocar</Button>}</div></CardContent></Card>)}
    </div>
  );
}

