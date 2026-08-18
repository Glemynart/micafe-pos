import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase-admin"
import { validarBranding } from "@/lib/configuracion/branding"
import type { BrandingConfiguracion } from "@/lib/configuracion/contrato"

export const dynamic = "force-dynamic"

const ESTADOS_PUBLICABLES = new Set(["trial", "activa"])

function manifestNeutral() {
  return {
    name: "POS Empresarial",
    short_name: "POS Empresarial",
    description: "Panel de administración empresarial",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#334155",
    orientation: "portrait",
    icons: [],
  }
}

export async function GET(req: Request) {
  const empresaId = new URL(req.url).searchParams.get("empresaId")?.trim()
  if (!empresaId || !/^[A-Za-z0-9_-]{1,128}$/.test(empresaId)) {
    return NextResponse.json(manifestNeutral(), { headers: { "Cache-Control": "no-store" } })
  }

  try {
    const db = getAdminDb()
    const empresaSnapshot = await db.collection("empresas").doc(empresaId).get()
    if (!empresaSnapshot.exists || !ESTADOS_PUBLICABLES.has(empresaSnapshot.get("estado"))) {
      return NextResponse.json(manifestNeutral(), { headers: { "Cache-Control": "no-store" } })
    }

    const configuracionSnapshot = await db.collection("configuraciones").doc(empresaId).get()
    const configuracion = configuracionSnapshot.data()
    const branding = configuracion?.branding as BrandingConfiguracion | undefined
    if (!branding || !validarBranding(branding).valida) {
      return NextResponse.json(manifestNeutral(), { headers: { "Cache-Control": "no-store" } })
    }

    const nombre = branding.nombreVisible || configuracion?.identidadFiscal?.nombreComercial || "POS Empresarial"
    const icono = branding.assets?.iconoAplicacion?.ubicacion || branding.assets?.favicon?.ubicacion
    const lightPrimary = branding.paletas.light.primary || "#334155"
    const lightBackground = branding.paletas.light.background || "#f8fafc"
    return NextResponse.json({
      name: `${nombre} Admin`,
      short_name: nombre,
      description: `Panel de administración de ${nombre}`,
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      background_color: lightBackground,
      theme_color: lightPrimary,
      orientation: "portrait",
      icons: icono ? [{ src: icono, sizes: "192x192", type: branding.assets?.iconoAplicacion?.tipo || branding.assets?.favicon?.tipo || "image/png" }] : [],
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Error al resolver manifest tenant-aware:", error)
    return NextResponse.json(manifestNeutral(), { headers: { "Cache-Control": "no-store" } })
  }
}
