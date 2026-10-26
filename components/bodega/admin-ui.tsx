"use client"

import type { LucideIcon } from "lucide-react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function BodegaEditorDialog({ title, description, icon: Icon, disabled, primary, open, onOpenChange, children }: {
  title: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  primary?: boolean
  open?: boolean
  onOpenChange?(open: boolean): void
  children: React.ReactNode
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      <button type="button" disabled={disabled} className={cn("admin-action", primary && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />{title}
      </button>
    </DialogTrigger>
    <DialogContent className="@container max-h-[85dvh] overflow-y-auto rounded-2xl bg-card p-5 sm:max-w-2xl sm:p-7">
      <DialogHeader className="pr-6 text-left">
        <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
        <DialogDescription className="leading-relaxed">{description}</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
}

export function BodegaSearch({ label, placeholder, value, onChange }: {
  label: string
  placeholder: string
  value: string
  onChange(value: string): void
}) {
  return <label className="relative block w-full sm:max-w-md">
    <span className="sr-only">{label}</span>
    <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
    <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="admin-search h-11 w-full rounded-xl border border-border bg-card pr-3 pl-10 text-sm outline-none transition-shadow focus:border-primary focus:ring-3 focus:ring-primary/10" />
  </label>
}

export function BodegaEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
    <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/5 text-primary"><Icon className="size-6" aria-hidden="true" /></div>
    <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
  </div>
}
