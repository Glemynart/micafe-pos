'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Building2, ChevronRight, ClipboardList, Headphones, LayoutDashboard,
  LogOut, Menu, PackageOpen, Settings, ShieldCheck, Users, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePlatform } from "@/contexts/platform-context";
import type { FacultadPlataforma } from "@/lib/platform/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navegacion: Array<{ href: string; label: string; icon: typeof Activity; facultad?: FacultadPlataforma }> = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/empresas", label: "Empresas", icon: Building2, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/planes", label: "Planes", icon: PackageOpen, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/suscripciones", label: "Suscripciones", icon: Activity, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/operadores", label: "Operadores", icon: Users, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/auditoria", label: "Auditoría", icon: ClipboardList, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/soporte", label: "Soporte", icon: Headphones },
  { href: "/backoffice/configuracion", label: "Configuración", icon: Settings },
];

export function PlatformShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { contexto, tiene, logout } = usePlatform();
  const items = navegacion.filter((item) => !item.facultad || tiene(item.facultad));
  const actual = items.findLast((item) => pathname.startsWith(item.href));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      {open && <button aria-label="Cerrar navegación" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-6">
          <Link href="/backoffice" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-slate-950"><ShieldCheck className="size-5" /></span>
            <span><strong className="block tracking-tight">MiCafe SaaS</strong><small className="text-slate-500">Control de plataforma</small></span>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {items.map((item) => {
            const active = item.href === "/backoffice" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition", active ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/30" : "text-slate-400 hover:bg-slate-900 hover:text-white")}>
                <item.icon className="size-4" /><span className="flex-1">{item.label}</span>{active && <ChevronRight className="size-4" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-400">
            <span className="block truncate font-mono text-slate-200">{contexto?.uid}</span>
            Autorización v{contexto?.versionAutorizacion}
          </div>
          <Button variant="ghost" className="w-full justify-start text-slate-400 hover:bg-slate-900 hover:text-white" onClick={() => void logout()}>
            <LogOut className="mr-2 size-4" /> Cerrar sesión
          </Button>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b bg-white/90 px-5 backdrop-blur lg:px-10">
          <button aria-label="Abrir navegación" className="rounded-lg border p-2 lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Backoffice</p><h1 className="font-semibold">{actual?.label ?? "Plataforma"}</h1></div>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" /> Contexto validado</span>
        </header>
        <main className="mx-auto max-w-7xl p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}

