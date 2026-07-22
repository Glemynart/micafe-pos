import { ASSETS_BRANDING, BRANDING_MODEL_VERSION_INICIAL, TOKENS_BRANDING } from "./catalogos";
import type { BrandingConfiguracion, ReferenciaAssetBranding } from "./contrato";
import { contrasteWcag, esColorHexCanonico, esTextoCanonico } from "./normalizacion";

export interface ErrorBranding { ruta: string; codigo: string; mensaje: string }
export interface ResultadoValidacionBranding { valida: boolean; errores: readonly ErrorBranding[] }

const PARES_CONTRASTE = [["primary", "onPrimary"], ["secondary", "onSecondary"], ["accent", "onAccent"], ["surface", "onSurface"], ["background", "onBackground"], ["success", "onSuccess"], ["warning", "onWarning"], ["danger", "onDanger"], ["info", "onInfo"]] as const;

function validarAsset(asset: ReferenciaAssetBranding, ruta: string, errores: ErrorBranding[]): void {
  if (!esTextoCanonico(asset.ubicacion) || !/^https:\/\//.test(asset.ubicacion) || /(?:token|secret|signature|credential)=/i.test(asset.ubicacion)) errores.push({ ruta: `${ruta}.ubicacion`, codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "El asset debe usar HTTPS y no contener secretos." });
  if (!esTextoCanonico(asset.versionContenido)) errores.push({ ruta: `${ruta}.versionContenido`, codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "La versión de contenido es obligatoria." });
  if (!esTextoCanonico(asset.tipo) || !/^image\/(png|jpeg|webp|svg\+xml)$/i.test(asset.tipo)) errores.push({ ruta: `${ruta}.tipo`, codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "El tipo de asset no está permitido." });
}

function esMapaPlano(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

export function validarBranding(branding: unknown): ResultadoValidacionBranding {
  const errores: ErrorBranding[] = [];
  if (!branding || typeof branding !== "object" || Array.isArray(branding)) return { valida: false, errores: [{ ruta: "branding", codigo: "CONFIG_BRANDING_INVALID", mensaje: "Branding debe ser un objeto." }] };
  const valor = branding as BrandingConfiguracion;
  if (valor.modelVersion !== BRANDING_MODEL_VERSION_INICIAL) errores.push({ ruta: "branding.modelVersion", codigo: "CONFIG_SCHEMA_UNSUPPORTED", mensaje: "La versión de branding no está soportada." });
  if (valor.modoVisual !== "LIGHT" && valor.modoVisual !== "DARK" && valor.modoVisual !== "SYSTEM") errores.push({ ruta: "branding.modoVisual", codigo: "CONFIG_BRANDING_INVALID", mensaje: "Modo visual inválido." });
  if (valor.nombreVisible !== undefined && !esTextoCanonico(valor.nombreVisible, 1, 120)) errores.push({ ruta: "branding.nombreVisible", codigo: "CONFIG_BRANDING_INVALID", mensaje: "Nombre visual inválido." });
  if (!esMapaPlano(valor.assets)) {
    errores.push({ ruta: "branding.assets", codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "Assets debe ser un mapa." });
  }
  for (const [id, asset] of Object.entries(esMapaPlano(valor.assets) ? valor.assets : {})) {
    if (!(ASSETS_BRANDING as readonly string[]).includes(id)) errores.push({ ruta: `branding.assets.${id}`, codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "Asset desconocido." });
    else if (!esMapaPlano(asset)) errores.push({ ruta: `branding.assets.${id}`, codigo: "CONFIG_BRANDING_ASSET_INVALID", mensaje: "El asset debe ser un objeto." });
    else validarAsset(asset as ReferenciaAssetBranding, `branding.assets.${id}`, errores);
  }
  for (const tema of ["light", "dark"] as const) {
    const paleta = valor.paletas?.[tema];
    if (!esMapaPlano(paleta)) { errores.push({ ruta: `branding.paletas.${tema}`, codigo: "CONFIG_BRANDING_INVALID", mensaje: "Paleta obligatoria." }); continue; }
    for (const [token, color] of Object.entries(paleta)) {
      if (!(TOKENS_BRANDING as readonly string[]).includes(token) || !esColorHexCanonico(color)) errores.push({ ruta: `branding.paletas.${tema}.${token}`, codigo: "CONFIG_BRANDING_TOKEN_INVALID", mensaje: "Token o color inválido." });
    }
    for (const [fondo, frente] of PARES_CONTRASTE) {
      const a = paleta[fondo]; const b = paleta[frente];
      if (a && b && esColorHexCanonico(a) && esColorHexCanonico(b) && contrasteWcag(a, b) < 4.5) errores.push({ ruta: `branding.paletas.${tema}`, codigo: "CONFIG_BRANDING_CONTRAST_INVALID", mensaje: "El contraste semántico mínimo es 4.5:1." });
    }
  }
  return { valida: errores.length === 0, errores };
}
