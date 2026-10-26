"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, LogOut, Menu, ShieldCheck } from "lucide-react"
import { useState, type ReactNode } from "react"
import { usePlatform } from "@/contexts/platform-context"
import { obtenerNavegacionVisible } from "@/components/backoffice/platform-navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const grupos = [
  { label: "OPERACIÓN", paths: ["/backoffice", "/backoffice/empresas"] },
  { label: "COMERCIAL", paths: ["/backoffice/planes", "/backoffice/ofertas", "/backoffice/suscripciones"] },
  { label: "GESTIÓN", paths: ["/backoffice/operadores", "/backoffice/auditoria", "/backoffice/soporte", "/backoffice/configuracion"] },
]

export function PlatformShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { contexto, tiene, logout } = usePlatform()
  const items = obtenerNavegacionVisible(tiene)
  const actual = items.findLast(item => pathname.startsWith(item.href))
  const navegacion = <>
    <Link href="/backoffice" onClick={() => setOpen(false)} className="flex h-20 shrink-0 items-center gap-3 border-b border-border/60 px-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ShieldCheck className="size-5" /></span>
      <span><strong className="block text-lg tracking-tight">Dusema POS</strong><small className="text-[10px] font-medium uppercase tracking-[.16em] text-muted-foreground">Control de plataforma</small></span>
    </Link>
    <nav aria-label="Navegación de plataforma" className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
      {grupos.map(grupo => {
        const visibles = items.filter(item => grupo.paths.includes(item.href))
        if (visibles.length === 0) return null
        return <div key={grupo.label}><p className="mb-2 px-3 text-[10px] font-semibold tracking-[.16em] text-muted-foreground">{grupo.label}</p><div className="space-y-1">{visibles.map(item => {
          const active = item.href === "/backoffice" ? pathname === item.href : pathname.startsWith(item.href)
          return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><item.icon className="size-[18px] shrink-0" /><span className="flex-1">{item.label}</span>{active && <ChevronRight className="size-4" />}</Link>
        })}</div></div>
      })}
    </nav>
    <div className="border-t border-border/60 p-4">
      <details className="mb-3 rounded-xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Identidad de la sesión</summary><span className="mt-2 block break-all font-mono">{contexto?.uid}</span><span className="mt-1 block">Autorización v{contexto?.versionAutorizacion}</span></details>
      <Button variant="ghost" className="min-h-11 w-full justify-start text-muted-foreground" onClick={() => void logout()}><LogOut className="mr-2 size-4" />Cerrar sesión</Button>
    </div>
  </>
  return <div className="platform-workspace min-h-screen bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card lg:flex">{navegacion}</aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-border/60 bg-card/95 px-4 backdrop-blur-md sm:px-6 lg:px-10">
        <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button type="button" aria-label="Abrir navegación" className="flex size-11 items-center justify-center rounded-xl border border-border lg:hidden"><Menu className="size-5" /></button></SheetTrigger><SheetContent side="left" className="w-[min(320px,90vw)] gap-0 bg-card"><SheetTitle className="sr-only">Menú de plataforma</SheetTitle><SheetDescription className="sr-only">Accesos disponibles para tu operador.</SheetDescription>{navegacion}</SheetContent></Sheet>
        <a href="#platform-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Ir al contenido</a>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Backoffice</p><p className="mt-1 truncate text-sm font-medium">{actual?.label ?? "Plataforma"}</p></div>
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-700/15 bg-emerald-500/5 px-3 py-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" /><span className="hidden sm:inline">Contexto validado</span><span className="sm:hidden">Validado</span></span>
      </header>
      <main id="platform-content" className="@container mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  </div>
}
