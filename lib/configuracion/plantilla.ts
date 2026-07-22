import {
  BRANDING_MODEL_VERSION_INICIAL,
  CONFIGURACION_REVISION_INICIAL,
  CONFIGURACION_SCHEMA_VERSION_INICIAL,
  IMPUESTO_TIPO_CONFIGURACION_POR_DEFECTO,
  PERFIL_FISCAL_COLOMBIA,
  ROLES_TURNO_CONFIGURACION,
} from "./catalogos";
import type {
  ConfiguracionEmpresa,
  UltimaMutacionConfiguracion,
} from "./contrato";

export interface DatosPlantillaConfiguracionRevision1 {
  empresaId: string;
  nombreComercial: string;
  creadaEn: unknown;
  actualizadaEn: unknown;
  ultimaMutacion: UltimaMutacionConfiguracion;
}

/**
 * Materializa la plantilla CO v1 completamente en memoria. No valida, no
 * persiste y no inicializa Bootstrap: esas responsabilidades son posteriores.
 */
export function crearPlantillaConfiguracionRevision1(
  datos: DatosPlantillaConfiguracionRevision1,
): ConfiguracionEmpresa {
  return {
    empresaId: datos.empresaId,
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
      metodosPagoHabilitados: ["efectivo", "transferencia", "cuenta_cobro", "mixto"],
      metodoPagoPredeterminado: "efectivo",
      permitirPagoMixto: true,
      permitirVentaSinExistencias: false,
      requerirClienteEnCuentaCobro: true,
    },
    caja: {
      baseAperturaSugerida: 200000,
      umbralAlertaFaltante: 20000,
      rolesConTurnoObligatorio: [...ROLES_TURNO_CONFIGURACION],
      permitirRelevo: true,
    },
    modulos: { habilitados: [] },
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
