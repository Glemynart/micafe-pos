import {
  Activity, Building2, ClipboardList, Headphones, LayoutDashboard, PackageOpen, Settings, ShieldCheck, Tag, Users,
} from "lucide-react";
import type { FacultadPlataforma } from "@/lib/platform/client";

type ItemNavegacion = {
  href: string;
  label: string;
  icon: typeof Activity;
  facultad?: FacultadPlataforma;
};

export const navegacionPlataforma: ItemNavegacion[] = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/empresas", label: "Empresas", icon: Building2, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/planes", label: "Planes", icon: PackageOpen, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/ofertas", label: "Ofertas comerciales", icon: Tag, facultad: "COMERCIAL_GOBERNAR" },
  { href: "/backoffice/suscripciones", label: "Suscripciones", icon: Activity, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/operadores", label: "Operadores", icon: Users, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/auditoria", label: "Auditoría", icon: ClipboardList, facultad: "PLATAFORMA_CONSULTAR" },
  { href: "/backoffice/soporte", label: "Soporte", icon: Headphones },
  { href: "/backoffice/privacidad", label: "Reclamos de privacidad", icon: ShieldCheck, facultad: "PRIVACIDAD_RECLAMOS_TRAMITAR" },
  { href: "/backoffice/consultas-privacidad", label: "Consultas de privacidad", icon: ShieldCheck, facultad: "PRIVACIDAD_CONSULTAS_TRAMITAR" },
  { href: "/backoffice/contactos-exportacion", label: "Contacto de exportación", icon: ShieldCheck, facultad: "EXPORTACION_CONTACTO_GOBERNAR" },
  { href: "/backoffice/configuracion", label: "Configuración", icon: Settings },
];

export function obtenerNavegacionVisible(tiene: (facultad: FacultadPlataforma) => boolean): ItemNavegacion[] {
  return navegacionPlataforma.filter((item) => !item.facultad || tiene(item.facultad));
}
