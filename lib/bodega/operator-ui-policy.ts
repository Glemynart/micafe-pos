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

/**
 * La frontera Bodega admite la transición canónica activa/inactiva de un
 * vendedor. La UI usa esta proyección para no dejar una desactivación sin una
 * ruta explícita de restauración.
 */
export function accionEstadoVendedor(activo: boolean) {
  return activo
    ? {
      estadoSolicitado: "inactiva" as const,
      etiqueta: "Desactivar operador",
      confirmacion: "Desactivar",
      resultado: "Usuario desactivado",
    }
    : {
      estadoSolicitado: "activa" as const,
      etiqueta: "Reactivar operador",
      confirmacion: "Reactivar",
      resultado: "Usuario reactivado",
    }
}
