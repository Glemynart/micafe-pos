'use client'

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, ShieldX } from "lucide-react";
import { usePlatform } from "@/contexts/platform-context";
import { Button } from "@/components/ui/button";

export function PlatformGuard({ children }: { children: ReactNode }) {
  const { user, contexto, cargando, error, refrescar, logout } = usePlatform();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!cargando && !user) router.replace(`/backoffice/login?from=${encodeURIComponent(pathname)}`);
  }, [cargando, user, pathname, router]);

  if (cargando) return (
    <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
      <div className="flex items-center gap-3 text-sm"><LoaderCircle className="size-5 animate-spin" /> Verificando autorización canónica…</div>
    </div>
  );
  if (!user) return null;
  if (!contexto) return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-rose-400/20 bg-slate-900 p-8 text-center shadow-2xl">
        <ShieldX className="mx-auto mb-4 size-10 text-rose-400" />
        <h1 className="text-xl font-semibold">Acceso de plataforma no disponible</h1>
        <p className="mt-2 text-sm text-slate-400">{error?.includes("STALE") ? "Tu contexto cambió y debe renovarse." : "La identidad no posee una autorización SaaS activa."}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => void refrescar()}>Revalidar</Button>
          <Button variant="outline" onClick={() => void logout()}>Cerrar sesión</Button>
        </div>
      </div>
    </div>
  );
  return <>{children}</>;
}

