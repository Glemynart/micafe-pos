import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase-admin"
import type { EventoPublico } from "@/lib/eventos-service"

const ESTADOS_PUBLICABLES = new Set(["trial", "activa"])

function respuestaNoEncontrada() {
  // No diferencia slug inexistente, ambiguo o tenant no operativo para no
  // convertir el endpoint público en un enumerador de empresas.
  return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 })
}

function proyectarEventoPublico(id: string, data: FirebaseFirestore.DocumentData, empresaId: string): EventoPublico | null {
  if (data.empresaId !== empresaId || data.activo !== true) return null
  if (typeof data.titulo !== "string" || typeof data.descripcion !== "string") return null
  if (typeof data.fecha !== "string" || typeof data.hora !== "string") return null

  const evento: EventoPublico = {
    id,
    titulo: data.titulo,
    descripcion: data.descripcion,
    fecha: data.fecha,
    hora: data.hora,
    categoria: typeof data.categoria === "string" ? data.categoria : "Otro",
    activo: true,
  }
  if (typeof data.imagenUrl === "string") evento.imagenUrl = data.imagenUrl
  return evento
}

/**
 * Superficie pública única para eventos tenant-aware.
 *
 * El slug solo resuelve contexto público. La consulta de eventos se ejecuta
 * con Admin SDK en el servidor y siempre queda acotada al empresaId resuelto.
 */
export async function listarEventosPublicos(
  req: Request,
  db: FirebaseFirestore.Firestore = getAdminDb(),
) {
  try {
    const slug = new URL(req.url).searchParams.get("slug")?.trim()
    if (!slug) return NextResponse.json({ error: "slug es obligatorio" }, { status: 400 })

    const empresas = await db.collection("empresas").where("slug", "==", slug).limit(2).get()
    if (empresas.size !== 1) return respuestaNoEncontrada()

    const empresa = empresas.docs[0]
    const empresaData = empresa.data()
    if (typeof empresaData.estado !== "string" || !ESTADOS_PUBLICABLES.has(empresaData.estado)) {
      return respuestaNoEncontrada()
    }

    const empresaId = empresa.id
    const eventos = await db.collection("eventos")
      .where("empresaId", "==", empresaId)
      .where("activo", "==", true)
      .orderBy("fecha", "asc")
      .get()

    const payload = eventos.docs
      .map((doc) => proyectarEventoPublico(doc.id, doc.data(), empresaId))
      .filter((evento): evento is EventoPublico => evento !== null)

    return NextResponse.json({ eventos: payload })
  } catch (error) {
    console.error("Error en /api/public/eventos:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return listarEventosPublicos(req)
}
