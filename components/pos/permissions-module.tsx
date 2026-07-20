"use client"

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Shield, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { actualizarPermisosUsuario, MODULOS, suscribirUsuarios, type Usuario } from "@/lib/permisos-service";

const ETIQUETAS: Record<string, string> = {
  sell: "Vender", salon: "Salón", kitchen: "Cocina", inventory: "Inventario",
  recipes: "Recetas", purchases: "Compras", reports: "Reportes", shifts: "Turnos",
  waste: "Mermas", gastos: "Gastos", permissions: "Permisos", settings: "Configuración",
  cuentas_cobro: "Cuentas de cobro", clientes: "Clientes", consignaciones: "Consignaciones",
  alquiler_dashboard: "Alquileres", historial: "Historial", reservas: "Reservas", finanzas: "Finanzas",
};

/** Administración de permisos efectivos por membresía. Las plantillas no se leen en runtime. */
export function PermissionsModule() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const unsub = suscribirUsuarios((datos) => { setUsuarios(datos); setCargando(false); });
    return unsub;
  }, []);

  const usuario = usuarios.find((item) => item.uid === seleccionado) ?? null;
  const filtrados = useMemo(() => usuarios.filter((item) =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase()) || item.username.toLowerCase().includes(busqueda.toLowerCase())
  ), [usuarios, busqueda]);

  const alternar = async (permiso: string) => {
    if (!usuario) return;
    setGuardando(true);
    const nuevos = new Set(usuario.permisos);
    nuevos.has(permiso) ? nuevos.delete(permiso) : nuevos.add(permiso);
    try {
      await actualizarPermisosUsuario(usuario.uid, [...nuevos]);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Shield className="h-6 w-6" /> Permisos efectivos</h1><p className="text-sm text-muted-foreground">Cada cambio actualiza la membresía y revoca la sesión afectada.</p></div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
        <section className="space-y-3 overflow-auto rounded-lg border p-3">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar usuario" /></div>
          {filtrados.map((item) => <button key={item.uid} onClick={() => setSeleccionado(item.uid)} className={`w-full rounded p-3 text-left ${item.uid === seleccionado ? "bg-primary/10" : "hover:bg-muted"}`}><p className="font-medium">{item.nombre}</p><p className="text-xs text-muted-foreground">@{item.username}</p><Badge className="mt-1" variant="secondary">{item.rol}</Badge></button>)}
        </section>
        <section className="col-span-2 overflow-auto rounded-lg border p-4">
          {!usuario ? <div className="flex h-full flex-col items-center justify-center text-muted-foreground"><Users className="mb-3 h-12 w-12" />Selecciona una membresía</div> : <>
            <h2 className="text-lg font-semibold">{usuario.nombre}</h2><p className="mb-4 text-sm text-muted-foreground">Permisos efectivos de su membresía ({usuario.rol})</p>
            <div className="grid gap-2 sm:grid-cols-2">{MODULOS.map((permiso) => { const activo = usuario.permisos.includes(permiso); return <Button key={permiso} variant="outline" disabled={guardando} onClick={() => alternar(permiso)} className="justify-between"><span>{ETIQUETAS[permiso] ?? permiso}</span>{activo ? <Check className="text-green-600" /> : <X className="text-muted-foreground" />}</Button>; })}</div>
          </>}
        </section>
      </div>
    </div>
  );
}
