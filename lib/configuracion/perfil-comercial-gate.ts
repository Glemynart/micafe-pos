export interface ContextoDiferirPerfilComercial {
  empresaId?: string | null
  vertical?: string | null
  rolMembresia?: string | null
  membresiaActiva: boolean
  tenantCoincide: boolean
  estadoConfiguracion: string
}

/** Excepción temporal aprobada únicamente para el tenant de Diana. */
export function puedeDiferirPerfilComercialDiana(contexto: ContextoDiferirPerfilComercial): boolean {
  return contexto.empresaId === "distribuidora-las-jimenez"
    && contexto.vertical === "BODEGA_MVP1"
    && contexto.rolMembresia === "admin"
    && contexto.membresiaActiva
    && contexto.tenantCoincide
    && contexto.estadoConfiguracion === "LISTA"
}
