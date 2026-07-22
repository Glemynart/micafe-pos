import type { ImpuestoTipo, RegimenTributario } from "../impuestos-service";
import type { RolTenant } from "../tenant-roles";
import type {
  AssetBrandingId,
  MetodoPagoConfiguracionId,
  ModuloConfiguracionId,
  TokenBranding,
} from "./catalogos";

export type ActorTipoConfiguracion = "USER" | "SYSTEM" | "PLATFORM";
export type OrigenConfiguracion =
  | "BOOTSTRAP"
  | "BACKFILL"
  | "ADMIN"
  | "ONBOARDING"
  | "PLATFORM"
  | "RECOVERY";

export type TipoPersona = "NATURAL" | "JURIDICA";
export type PoliticaRedondeo = "POR_LINEA_ENTERA";
export type ModoVisual = "LIGHT" | "DARK" | "SYSTEM";
export type FormatoPapel = "MM_58" | "MM_80" | "CARTA";
export type OrdenComandas = "ANTIGUEDAD_ASC";
export type MetodoAutenticacionOperativa = "CODIGO_PIN";
export type FormatoHora = "H12" | "H24";
export type PrimerDiaSemana = "DOMINGO" | "LUNES";

/** Referencia persistible a un asset externo; nunca contiene binarios ni secretos. */
export interface ReferenciaAssetBranding {
  ubicacion: string;
  versionContenido: string;
  tipo: string;
}

export interface UltimaMutacionConfiguracion {
  actorTipo: ActorTipoConfiguracion;
  actorId: string;
  origen: OrigenConfiguracion;
  commandId: string;
  correlationId: string;
  motivo?: string;
}

export interface IdentidadFiscalConfiguracion {
  nombreComercial: string;
  razonSocial?: string;
  tipoPersona?: TipoPersona;
  tipoDocumento?: string;
  numeroDocumento?: string;
  digitoVerificacion?: string;
  regimenTributario?: RegimenTributario;
  responsabilidadesFiscales?: string[];
  actividadEconomicaPrincipal?: string;
  contacto: {
    email?: string;
    telefono?: string;
  };
}

export interface LocalizacionConfiguracion {
  paisFiscal: string;
  moneda: string;
  idioma: string;
  zonaHoraria: string;
  direccion: {
    linea1?: string;
    linea2?: string;
    departamentoCodigo?: string;
    departamentoNombre?: string;
    municipioCodigo?: string;
    municipioNombre?: string;
    codigoPostal?: string;
  };
}

export interface ImpuestosConfiguracion {
  preciosIncluyenImpuestos: boolean;
  impuestoTipoPredeterminado: ImpuestoTipo;
  politicaRedondeo: PoliticaRedondeo;
}

export interface BrandingConfiguracion {
  modelVersion: number;
  nombreVisible?: string;
  assets: Partial<Record<AssetBrandingId, ReferenciaAssetBranding>>;
  modoVisual: ModoVisual;
  paletas: {
    light: Partial<Record<TokenBranding, string>>;
    dark: Partial<Record<TokenBranding, string>>;
  };
}

export interface TicketConfiguracion {
  logoDocumentoUrl?: string;
  mensajePie: string;
  mostrarLogoDocumento: boolean;
  mostrarRazonSocial: boolean;
  mostrarDireccion: boolean;
  mostrarTelefono: boolean;
  mostrarDesgloseImpuestos: boolean;
}

export interface ImpresionConfiguracion {
  formatoPapel: FormatoPapel;
  copiasVenta: number;
  copiasCierre: number;
  autoImprimirVenta: boolean;
  autoAbrirCajon: boolean;
}

export interface PosConfiguracion {
  metodosPagoHabilitados: MetodoPagoConfiguracionId[];
  metodoPagoPredeterminado: MetodoPagoConfiguracionId;
  permitirPagoMixto: boolean;
  permitirVentaSinExistencias: boolean;
  requerirClienteEnCuentaCobro: boolean;
}

export interface CajaConfiguracion {
  baseAperturaSugerida: number;
  umbralAlertaFaltante: number;
  rolesConTurnoObligatorio: RolTenant[];
  permitirRelevo: boolean;
}

export interface ModulosConfiguracion {
  habilitados: ModuloConfiguracionId[];
}

export interface KdsConfiguracion {
  ordenComandas: OrdenComandas;
  minutosAlerta: number;
  minutosCritico: number;
  agruparPorPedido: boolean;
}

export interface AutenticacionOperativaConfiguracion {
  metodoPrincipal: MetodoAutenticacionOperativa;
  longitudPin: number;
  maxFallosConsecutivos: number;
  bloqueoMinutos: number;
  exigirCambioCredencialTemporal: boolean;
}

export interface PreferenciasConfiguracion {
  formatoFecha: string;
  formatoHora: FormatoHora;
  primerDiaSemana: PrimerDiaSemana;
  mostrarCentavos: boolean;
}

/** Forma persistible completa de `configuraciones/{empresaId}`. */
export interface ConfiguracionEmpresa {
  empresaId: string;
  schemaVersion: number;
  revision: number;
  identidadFiscal: IdentidadFiscalConfiguracion;
  localizacion: LocalizacionConfiguracion;
  impuestos: ImpuestosConfiguracion;
  branding: BrandingConfiguracion;
  ticket: TicketConfiguracion;
  impresion: ImpresionConfiguracion;
  pos: PosConfiguracion;
  caja: CajaConfiguracion;
  modulos: ModulosConfiguracion;
  kds: KdsConfiguracion;
  autenticacionOperativa: AutenticacionOperativaConfiguracion;
  preferencias: PreferenciasConfiguracion;
  creadaEn: unknown;
  actualizadaEn: unknown;
  ultimaMutacion: UltimaMutacionConfiguracion;
}
