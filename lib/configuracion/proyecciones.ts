import type { ConfiguracionEmpresa } from "./contrato";

export function proyectarIdentidadConfiguracion(c: ConfiguracionEmpresa) { const i = c.identidadFiscal; return { nombreComercial: i.nombreComercial, razonSocial: i.razonSocial, tipoPersona: i.tipoPersona, tipoDocumento: i.tipoDocumento, numeroDocumento: i.numeroDocumento, digitoVerificacion: i.digitoVerificacion, regimenTributario: i.regimenTributario, responsabilidadesFiscales: i.responsabilidadesFiscales ? [...i.responsabilidadesFiscales] : undefined, actividadEconomicaPrincipal: i.actividadEconomicaPrincipal, contacto: { ...i.contacto } }; }
export function proyectarLocalizacionConfiguracion(c: ConfiguracionEmpresa) { const l = c.localizacion; return { paisFiscal: l.paisFiscal, moneda: l.moneda, idioma: l.idioma, zonaHoraria: l.zonaHoraria, direccion: { ...l.direccion } }; }
export function proyectarTicketConfiguracion(c: ConfiguracionEmpresa) { return { ...c.ticket }; }
export function proyectarImpresionConfiguracion(c: ConfiguracionEmpresa) { return { ...c.impresion }; }
export function proyectarPosConfiguracion(c: ConfiguracionEmpresa) { return { ...c.pos, metodosPagoHabilitados: [...c.pos.metodosPagoHabilitados] }; }
export function proyectarModulosConfiguracion(c: ConfiguracionEmpresa) { return { habilitados: [...c.modulos.habilitados] }; }
export function proyectarCajaConfiguracion(c: ConfiguracionEmpresa) { return { ...c.caja, rolesConTurnoObligatorio: [...c.caja.rolesConTurnoObligatorio] }; }
export function proyectarBrandingConfiguracion(c: ConfiguracionEmpresa) { const b = c.branding; return { modelVersion: b.modelVersion, nombreVisible: b.nombreVisible ?? c.identidadFiscal.nombreComercial, modoVisual: b.modoVisual, assets: { ...b.assets }, paletas: { light: { ...b.paletas.light }, dark: { ...b.paletas.dark } } }; }
