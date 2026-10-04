import type { RolUsuario } from "@/lib/auth-service"

/**
 * Política de presentación del Backoffice para Bodega MVP-1.
 * No sustituye la autoridad de las callables: evita exponer controles de
 * restaurante que la vertical no admite.
 */
export function esBodegaMvp1(vertical: string | null | undefined): boolean {
  return vertical === "BODEGA_MVP1"
}

export function rolInicialOperador(vertical: string | null | undefined): RolUsuario {
  return esBodegaMvp1(vertical) ? "vendedor" : "cajero"
}

export function mostrarOperacionesGenericas(vertical: string | null | undefined): boolean {
  return !esBodegaMvp1(vertical)
}
