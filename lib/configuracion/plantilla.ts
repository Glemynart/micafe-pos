import {
  BRANDING_MODEL_VERSION_INICIAL,
  CONFIGURACION_REVISION_INICIAL,
  CONFIGURACION_SCHEMA_VERSION_INICIAL,
  IMPUESTO_TIPO_CONFIGURACION_POR_DEFECTO,
  PERFIL_FISCAL_COLOMBIA,
  MODULOS_PERMITIDOS_BODEGA_MVP1,
  ROLES_TURNO_CONFIGURACION,
} from "./catalogos";
import type {
  ConfiguracionEmpresa,
  VerticalTenant,
  UltimaMutacionConfiguracion,
} from "./contrato";
import { resolverModulosHabilitados } from "./modulos-plan";

export interface DatosPlantillaConfiguracionRevision1 {
  empresaId: string;
  nombreComercial: string;
  creadaEn: unknown;
  actualizadaEn: unknown;
  ultimaMutacion: UltimaMutacionConfiguracion;
  /** Capacidades iniciales derivadas del Plan contratado. */
  modulosIniciales?: readonly string[];
  vertical?: VerticalTenant;
}

/**
 * Materializa la plantilla CO v1 completamente en memoria. No valida, no
 * persiste y no inicializa Bootstrap: esas responsabilidades son posteriores.
 */
export function crearPlantillaConfiguracionRevision1(
  datos: DatosPlantillaConfiguracionRevision1,
): ConfiguracionEmpresa {
  const vertical = datos.vertical ?? "GENERAL";
  const modulosIniciales = resolverModulosHabilitados(
    datos.modulosIniciales ?? [],
    vertical === "BODEGA_MVP1" ? MODULOS_PERMITIDOS_BODEGA_MVP1 : datos.modulosIniciales ?? [],
  );

  return {
    empresaId: datos.empresaId,
    vertical,
    schemaVersion: CONFIGURACION_SCHEMA_VERSION_INICIAL,
    revision: CONFIGURACION_REVISION_INICIAL,
    identidadFiscal: {
      nombreComercial: datos.nombreComercial,
      contacto: {},
    },
    localizacion: {
      paisFiscal: PERFIL_FISCAL_COLOMBIA.paisFiscal,
      moneda: PERFIL_FISCAL_COLOMBIA.moneda,
      idioma: PERFIL_FISCAL_COLOMBIA.idioma,
      zonaHoraria: PERFIL_FISCAL_COLOMBIA.zonaHoraria,
      direccion: {},
    },
    impuestos: {
      preciosIncluyenImpuestos: true,
      impuestoTipoPredeterminado: IMPUESTO_TIPO_CONFIGURACION_POR_DEFECTO,
      politicaRedondeo: "POR_LINEA_ENTERA",
    },
    branding: {
      modelVersion: BRANDING_MODEL_VERSION_INICIAL,
      assets: {},
      modoVisual: "SYSTEM",
      paletas: { light: {}, dark: {} },
    },
    ticket: {
      mensajePie: "Gracias por su compra.",
      mostrarLogoDocumento: false,
      mostrarRazonSocial: true,
      mostrarDireccion: true,
      mostrarTelefono: true,
      mostrarDesgloseImpuestos: true,
    },
    impresion: {
      formatoPapel: "MM_80",
      copiasVenta: 1,
      copiasCierre: 1,
      autoImprimirVenta: false,
      autoAbrirCajon: false,
    },
    pos: {
      metodosPagoHabilitados: vertical === "BODEGA_MVP1" ? ["efectivo", "transferencia"] : ["efectivo", "transferencia", "cuenta_cobro", "mixto"],
      metodoPagoPredeterminado: "efectivo",
      permitirPagoMixto: vertical !== "BODEGA_MVP1",
      permitirVentaSinExistencias: false,
      requerirClienteEnCuentaCobro: true,
    },
    caja: {
      baseAperturaSugerida: 200000,
      umbralAlertaFaltante: 20000,
      rolesConTurnoObligatorio: vertical === "BODEGA_MVP1" ? ["vendedor"] : [...ROLES_TURNO_CONFIGURACION],
      permitirRelevo: vertical !== "BODEGA_MVP1",
    },
    modulos: { habilitados: modulosIniciales },
    kds: {
      ordenComandas: "ANTIGUEDAD_ASC",
      minutosAlerta: 10,
      minutosCritico: 20,
      agruparPorPedido: true,
    },
    autenticacionOperativa: {
      metodoPrincipal: "CODIGO_PIN",
      longitudPin: 6,
      maxFallosConsecutivos: 5,
      bloqueoMinutos: 15,
      exigirCambioCredencialTemporal: true,
    },
    preferencias: {
      formatoFecha: "DD/MM/YYYY",
      formatoHora: "H12",
      primerDiaSemana: "LUNES",
      mostrarCentavos: false,
    },
    creadaEn: datos.creadaEn,
    actualizadaEn: datos.actualizadaEn,
    ultimaMutacion: { ...datos.ultimaMutacion },
  };
}
