"use client"
import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'

export function BrandingRuntime() {
  const { branding } = useConfiguracionEmpresa()
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    const root = document.documentElement
    const variables = new Set([...Object.keys(branding.variablesLight), ...Object.keys(branding.variablesDark)])
    const activas = resolvedTheme === 'dark' ? branding.variablesDark : branding.variablesLight
    for (const variable of variables) root.style.removeProperty(variable)
    for (const [variable, valor] of Object.entries(activas)) root.style.setProperty(variable, valor)
    document.title = branding.nombreVisible
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (branding.favicon) { if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) } icon.href = branding.favicon } else icon?.remove()
    return () => { for (const variable of variables) root.style.removeProperty(variable); document.title = 'POS Empresarial'; if (branding.favicon) icon?.remove() }
  }, [branding, resolvedTheme])
  return null
}
