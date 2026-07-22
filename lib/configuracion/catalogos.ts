import {
  IMPUESTO_TIPO_DEFAULT,
  REGIMEN_TRIBUTARIO_DEFAULT,
  type ImpuestoTipo,
  type RegimenTributario,
} from "../impuestos-service";
import type { RolTenant } from "../tenant-roles";

export const CONFIGURACIONES_COLLECTION = "configuraciones" as const;
export const CONFIGURACION_SCHEMA_VERSION_INICIAL = 1 as const;
export const CONFIGURACION_REVISION_INICIAL = 1 as const;
export const BRANDING_MODEL_VERSION_INICIAL = 1 as const;

/**
 * Rutas hoja de negocio reconocidas por el esquema v1. Esta lista no concede
 * permiso de edición: B1.2 definirá la allowlist por comando, actor y origen.
 */
export const RUTAS_HOJA_EDITABLES_CONFIGURACION = [
  "identidadFiscal.nombreComercial",
  "identidadFiscal.razonSocial",
  "identidadFiscal.tipoPersona",
  "identidadFiscal.tipoDocumento",
  "identidadFiscal.numeroDocumento",
  "identidadFiscal.digitoVerificacion",
  "identidadFiscal.regimenTributario",
  "identidadFiscal.responsabilidadesFiscales",
  "identidadFiscal.actividadEconomicaPrincipal",
  "identidadFiscal.contacto.email",
  "identidadFiscal.contacto.telefono",
  "localizacion.moneda",
  "localizacion.idioma",
  "localizacion.zonaHoraria",
  "localizacion.direccion.linea1",
  "localizacion.direccion.linea2",
  "localizacion.direccion.departamentoCodigo",
  "localizacion.direccion.departamentoNombre",
  "localizacion.direccion.municipioCodigo",
  "localizacion.direccion.municipioNombre",
  "localizacion.direccion.codigoPostal",
  "impuestos.preciosIncluyenImpuestos",
  "impuestos.impuestoTipoPredeterminado",
  "impuestos.politicaRedondeo",
  "branding.nombreVisible",
  "branding.assets.logoPrincipal",
  "branding.assets.logoModoOscuro",
  "branding.assets.favicon",
  "branding.assets.iconoAplicacion",
  "branding.modoVisual",
  "branding.paletas.light",
  "branding.paletas.dark",
  "ticket.logoDocumentoUrl",
  "ticket.mensajePie",
  "ticket.mostrarLogoDocumento",
  "ticket.mostrarRazonSocial",
  "ticket.mostrarDireccion",
  "ticket.mostrarTelefono",
  "ticket.mostrarDesgloseImpuestos",
  "impresion.formatoPapel",
  "impresion.copiasVenta",
  "impresion.copiasCierre",
  "impresion.autoImprimirVenta",
  "impresion.autoAbrirCajon",
  "pos.metodosPagoHabilitados",
  "pos.metodoPagoPredeterminado",
  "pos.permitirPagoMixto",
  "pos.permitirVentaSinExistencias",
  "pos.requerirClienteEnCuentaCobro",
  "caja.baseAperturaSugerida",
  "caja.umbralAlertaFaltante",
  "caja.rolesConTurnoObligatorio",
  "caja.permitirRelevo",
  "modulos.habilitados",
  "kds.ordenComandas",
  "kds.minutosAlerta",
  "kds.minutosCritico",
  "kds.agruparPorPedido",
  "preferencias.formatoFecha",
  "preferencias.formatoHora",
  "preferencias.primerDiaSemana",
  "preferencias.mostrarCentavos",
] as const;

export type RutaHojaEditableConfiguracion =
  (typeof RUTAS_HOJA_EDITABLES_CONFIGURACION)[number];

export const MODULOS_CONFIGURACION = [
  "sell", "salon", "kitchen", "inventory", "recipes", "purchases",
  "reports", "shifts", "waste", "permissions", "settings",
  "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard",
  "gastos", "historial", "reservas", "finanzas",
] as const;

export type ModuloConfiguracionId = (typeof MODULOS_CONFIGURACION)[number];

/**
 * B1 no declara todavía dependencias concretas entre módulos. El mapa queda
 * completo y vacío para no inferir relaciones funcionales no aprobadas.
 */
export const DEPENDENCIAS_MODULOS_CONFIGURACION: Readonly<
  Record<ModuloConfiguracionId, readonly ModuloConfiguracionId[]>
> = {
  sell: [],
  salon: [],
  kitchen: [],
  inventory: [],
  recipes: [],
  purchases: [],
  reports: [],
  shifts: [],
  waste: [],
  permissions: [],
  settings: [],
  cuentas_cobro: [],
  clientes: [],
  consignaciones: [],
  alquiler_dashboard: [],
  gastos: [],
  historial: [],
  reservas: [],
  finanzas: [],
};

export const METODOS_PAGO_CONFIGURACION = [
  "efectivo",
  "transferencia",
  "cuenta_cobro",
  "mixto",
] as const;

export type MetodoPagoConfiguracionId = (typeof METODOS_PAGO_CONFIGURACION)[number];

export const ROLES_TURNO_CONFIGURACION: readonly RolTenant[] = ["cajero"];

export const TOKENS_BRANDING = [
  "primary", "onPrimary", "secondary", "onSecondary", "accent", "onAccent",
  "surface", "onSurface", "background", "onBackground", "success", "onSuccess",
  "warning", "onWarning", "danger", "onDanger", "info", "onInfo",
] as const;

export type TokenBranding = (typeof TOKENS_BRANDING)[number];

export const ASSETS_BRANDING = [
  "logoPrincipal",
  "logoModoOscuro",
  "favicon",
  "iconoAplicacion",
] as const;

export type AssetBrandingId = (typeof ASSETS_BRANDING)[number];

export const PAISES_FISCALES_SOPORTADOS = ["CO"] as const;
export type PaisFiscalSoportado = (typeof PAISES_FISCALES_SOPORTADOS)[number];

export const PERFIL_FISCAL_COLOMBIA = {
  paisFiscal: "CO",
  moneda: "COP",
  idioma: "es-CO",
  zonaHoraria: "America/Bogota",
  tiposDocumento: ["NIT"] as const,
  regimenesTributarios: [
    "no_responsable",
    "responsable_inc",
    "responsable_iva",
  ] as const satisfies readonly RegimenTributario[],
} as const;

export const IMPUESTO_TIPO_CONFIGURACION_POR_DEFECTO: ImpuestoTipo = IMPUESTO_TIPO_DEFAULT;
export const REGIMEN_TRIBUTARIO_CONFIGURACION_POR_DEFECTO: RegimenTributario =
  REGIMEN_TRIBUTARIO_DEFAULT;
