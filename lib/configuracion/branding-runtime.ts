import type { ConfiguracionEmpresa } from './contrato'
import { validarBranding } from './branding'
const MAPA = { primary: '--primary', onPrimary: '--primary-foreground', secondary: '--secondary', onSecondary: '--secondary-foreground', accent: '--accent', onAccent: '--accent-foreground', surface: '--card', onSurface: '--card-foreground', background: '--background', onBackground: '--foreground', success: '--success', onSuccess: '--success-foreground', warning: '--warning', onWarning: '--warning-foreground', danger: '--destructive', onDanger: '--destructive-foreground', info: '--info', onInfo: '--info-foreground' } as const
export interface BrandingRuntimeResuelto { valido: boolean; nombreVisible: string; modo: 'LIGHT' | 'DARK' | 'SYSTEM'; logo?: string; logoOscuro?: string; favicon?: string; variablesLight: Record<string, string>; variablesDark: Record<string, string> }
const NEUTRAL_LIGHT = { '--background': '#F8FAFC', '--foreground': '#0F172A', '--card': '#FFFFFF', '--card-foreground': '#0F172A', '--primary': '#334155', '--primary-foreground': '#FFFFFF', '--secondary': '#E2E8F0', '--secondary-foreground': '#0F172A', '--accent': '#CBD5E1', '--accent-foreground': '#0F172A', '--destructive': '#B91C1C', '--destructive-foreground': '#FFFFFF', '--success': '#15803D', '--success-foreground': '#FFFFFF', '--warning': '#A16207', '--warning-foreground': '#FFFFFF' }
const NEUTRAL_DARK = { '--background': '#0F172A', '--foreground': '#F8FAFC', '--card': '#1E293B', '--card-foreground': '#F8FAFC', '--primary': '#CBD5E1', '--primary-foreground': '#0F172A', '--secondary': '#334155', '--secondary-foreground': '#F8FAFC', '--accent': '#475569', '--accent-foreground': '#FFFFFF', '--destructive': '#DC2626', '--destructive-foreground': '#FFFFFF', '--success': '#22C55E', '--success-foreground': '#052E16', '--warning': '#F59E0B', '--warning-foreground': '#451A03' }
const neutral = (): BrandingRuntimeResuelto => ({ valido: false, nombreVisible: 'POS Empresarial', modo: 'SYSTEM', variablesLight: { ...NEUTRAL_LIGHT }, variablesDark: { ...NEUTRAL_DARK } })
export function resolverBrandingRuntime(c: ConfiguracionEmpresa | null): BrandingRuntimeResuelto {
  if (!c || !validarBranding(c.branding).valida) return neutral()
  const b = c.branding
  const variables = (p: typeof b.paletas.light, base: Record<string, string>, modo: 'light' | 'dark') => {
    const semanticas = {
      ...base,
      ...Object.fromEntries(Object.entries(p).map(([t, v]) => [MAPA[t as keyof typeof MAPA], v])),
    }
    // Compatibilidad para el POS legado: estas variables ya se consumen en
    // tarjetas, CTA y sidebar. Se derivan del branding semántico del tenant,
    // sin volver a introducir colores empresariales en el código del cliente.
    return {
      ...semanticas,
      '--navy': semanticas['--primary-foreground'],
      '--navy-soft': semanticas['--secondary-foreground'],
      '--gold': semanticas['--primary'],
      '--gold-strong': semanticas['--primary'],
      '--cream': semanticas['--background'],
      '--sidebar': semanticas['--primary-foreground'],
      '--sidebar-foreground': modo === 'dark' ? semanticas['--foreground'] : semanticas['--background'],
      '--sidebar-primary': semanticas['--primary'],
      '--sidebar-primary-foreground': semanticas['--primary-foreground'],
      '--sidebar-accent': semanticas['--secondary'],
      '--sidebar-accent-foreground': semanticas['--secondary-foreground'],
      '--sidebar-border': semanticas['--secondary'],
      '--sidebar-ring': semanticas['--primary'],
    }
  }
  return {
    valido: true,
    nombreVisible: b.nombreVisible ?? c.identidadFiscal.nombreComercial,
    modo: b.modoVisual,
    logo: b.assets.logoPrincipal?.ubicacion,
    logoOscuro: b.assets.logoModoOscuro?.ubicacion,
    favicon: b.assets.favicon?.ubicacion,
    variablesLight: variables(b.paletas.light, NEUTRAL_LIGHT, 'light'),
    variablesDark: variables(b.paletas.dark, NEUTRAL_DARK, 'dark'),
  }
}
