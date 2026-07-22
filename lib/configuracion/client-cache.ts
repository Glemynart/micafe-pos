import type { ConfiguracionEmpresa } from './contrato'
export class CacheConfiguracionEmpresa {
  private readonly datos = new Map<string, ConfiguracionEmpresa>()
  obtener(empresaId: string): ConfiguracionEmpresa | undefined { return this.datos.get(empresaId) }
  guardar(configuracion: ConfiguracionEmpresa): void { this.datos.set(configuracion.empresaId, configuracion) }
  invalidar(empresaId?: string, revisionConfirmada?: number): void { if (!empresaId) { this.datos.clear(); return } const actual = this.datos.get(empresaId); if (revisionConfirmada === undefined || actual?.revision !== revisionConfirmada) this.datos.delete(empresaId) }
}
