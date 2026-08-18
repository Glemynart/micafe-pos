"use client"
import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'

export function BrandingRuntime() {
  const { branding, empresaId } = useConfiguracionEmpresa()
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    const root = document.documentElement
    const variables = new Set([...Object.keys(branding.variablesLight), ...Object.keys(branding.variablesDark)])
    const activas = resolvedTheme === 'dark' ? branding.variablesDark : branding.variablesLight
    for (const variable of variables) root.style.removeProperty(variable)
    for (const [variable, valor] of Object.entries(activas)) root.style.setProperty(variable, valor)
    document.title = branding.nombreVisible
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeColor) { themeColor = document.createElement('meta'); themeColor.name = 'theme-color'; document.head.appendChild(themeColor) }
    themeColor.content = activas['--background'] ?? '#f8fafc'
    let appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!appleTitle) { appleTitle = document.createElement('meta'); appleTitle.name = 'apple-mobile-web-app-title'; document.head.appendChild(appleTitle) }
    appleTitle.content = branding.nombreVisible
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const manifestOriginal = manifest?.getAttribute('href') ?? '/manifest.json'
    if (manifest) manifest.href = empresaId
      ? `/api/pwa/manifest?empresaId=${encodeURIComponent(empresaId)}`
      : '/manifest.json'
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (branding.favicon) { if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) } icon.href = branding.favicon } else icon?.remove()
    return () => {
      for (const variable of variables) root.style.removeProperty(variable)
      document.title = 'POS Empresarial'
      if (branding.favicon) icon?.remove()
      if (manifest) manifest.href = manifestOriginal
    }
  }, [branding, empresaId, resolvedTheme])
  return null
}
