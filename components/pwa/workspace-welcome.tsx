import { Boxes, Check, ShoppingBag, Store, Users } from "lucide-react"

export function WorkspaceWelcome({ label, title = "Tu negocio, conectado.", description = "Organiza tus productos, acompaña a tus clientes y lleva el control de cada venta desde un mismo lugar." }: { label: string; title?: string; description?: string }) {
  return <section className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex xl:p-16">
    <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-current/15 bg-current/5"><Store className="size-5" /></span><div><p className="text-lg font-semibold tracking-tight">MiCafe POS</p><p className="text-[10px] font-medium uppercase tracking-[.2em] opacity-60">{label}</p></div></div>
    <div className="relative my-12 max-w-lg"><p className="text-xs font-medium uppercase tracking-[.2em] opacity-60">Tu espacio de trabajo</p><h2 className="mt-5 text-5xl leading-[1.12] font-medium tracking-tight xl:text-6xl">{title}</h2><p className="mt-6 max-w-md text-base leading-relaxed opacity-70">{description}</p>
      <div aria-hidden="true" className="mt-10 space-y-3 rounded-2xl border border-current/15 bg-current/5 p-5 shadow-xl shadow-black/5">{[{ label: "Catálogo e inventario", icon: Boxes }, { label: "Clientes y pedidos", icon: Users }, { label: "Ventas y operación", icon: ShoppingBag }].map(item => <div key={item.label} className="flex items-center gap-3 rounded-xl border border-current/10 px-4 py-3"><item.icon className="size-5 opacity-70" /><span className="flex-1 text-sm font-medium">{item.label}</span><Check className="size-4 opacity-50" /></div>)}</div>
    </div>
    <p className="text-xs opacity-50">Un espacio para administrar. Otro para vender. Un mismo negocio.</p>
  </section>
}
