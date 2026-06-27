'use client'

import { useState, useEffect } from 'react'
import { 
  Coffee, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Loader2
} from 'lucide-react'
import * as Icons from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { modules } from '@/lib/demo-data'
import { useEspacios } from '@/contexts/espacios-context'
import type { Espacio } from '@/lib/espacios-service'
import type { Usuario } from '@/lib/auth-service'

interface SidebarProps {
  activeModule: string
  onModuleChange: (moduleId: string) => void
  onLogout: () => void
  usuario: Usuario
  modulosSet: Set<string>
  userPerms: Set<string>
}

export function Sidebar({ activeModule, onModuleChange, onLogout, usuario, modulosSet, userPerms }: SidebarProps) {
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const { espacios, espacioActivo, cargandoEspacios, seleccionarEspacio } = useEspacios()

  // Colapsar automáticamente en pantallas pequeñas (POS terminals, tablets)
  useEffect(() => {
    if (window.innerWidth < 1024) setCollapsed(true)
  }, [])
  
  const userModules = modules.filter(m => {
    // 1. El módulo debe estar habilitado a nivel global (configuración)
    if (!modulosSet.has(m.id)) return false
    // 2. El usuario debe tener permiso para usarlo
    if (!userPerms.has(m.id)) return false
    // 3. Si el espacio activo tiene módulos permitidos definidos, debe estar en esa lista
    //    Los módulos administrativos y globales siempre pasan este filtro.
    const modulosGlobales = ['permissions', 'settings', 'historial', 'salon', 'reservas']
    if (espacioActivo?.modulos_permitidos && espacioActivo.modulos_permitidos.length > 0) {
      if (!espacioActivo.modulos_permitidos.includes(m.id) && !modulosGlobales.includes(m.id)) return false
    }
    return true
  })

  const getIcon = (iconName: string, className = "h-5 w-5") => {
    const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
    return Icon ? <Icon className={className} /> : null
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside 
        className={cn(
          "h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
          collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center flex-shrink-0 shadow-[0_4px_12px_-3px_color-mix(in_oklch,var(--gold)_60%,transparent)]">
            <Coffee className="h-5 w-5 text-navy" strokeWidth={2.4} />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none animate-fade-in">
              <span className="font-bold text-base text-sidebar-foreground tracking-tight">
                Café Atrato
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                Punto de venta
              </span>
            </div>
          )}
        </div>

        {/* ── Selector de Espacio (Dropdown) ─────────────────────────────── */}
        <div className={cn(
          "border-b border-sidebar-border",
          collapsed ? "py-2 px-2" : "p-3"
        )}>
          {cargandoEspacios ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : espacioActivo ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left",
                    collapsed ? "w-10 h-10 justify-center p-0 mx-auto" : "w-full px-2 py-2"
                  )}
                >
                  <div 
                    className="w-8 h-8 rounded flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: espacioActivo.color }}
                  >
                    {getIcon(espacioActivo.icono, "h-5 w-5 text-white")}
                  </div>
                  {!collapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Espacio
                        </p>
                        <p className="text-sm font-medium text-sidebar-foreground truncate">
                          {espacioActivo.nombre}
                        </p>
                      </div>
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                side={collapsed ? "right" : "bottom"} 
                align={collapsed ? "start" : "center"}
                className="w-56"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Cambiar de espacio
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {espacios.map((espacio: Espacio) => {
                  const isActive = espacioActivo.id === espacio.id
                  return (
                    <DropdownMenuItem
                      key={espacio.id}
                      onClick={() => seleccionarEspacio(espacio)}
                      className="gap-2 cursor-pointer"
                    >
                      <div 
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ backgroundColor: espacio.color }}
                      >
                        {getIcon(espacio.icono, "h-4 w-4 text-white")}
                      </div>
                      <span className="flex-1 truncate font-medium">
                        {espacio.nombre}
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              Módulos
            </p>
          )}
          {userModules.map((module) => {
            const isActive = activeModule === module.id
            return (
              <Tooltip key={module.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onModuleChange(module.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      "relative w-full flex items-center gap-3 rounded-xl min-h-[52px] px-3 py-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-gold text-navy font-bold shadow-[0_6px_18px_-6px_color-mix(in_oklch,var(--gold)_70%,transparent)]"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    {isActive && collapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-gold" />
                    )}
                    <span className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-navy" : "text-sidebar-foreground/70"
                    )}>
                      {getIcon(module.icon)}
                    </span>
                    {!collapsed && (
                      <span className="text-sm transition-colors animate-fade-in">
                        {module.name}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="bg-popover text-popover-foreground">
                    {module.name}
                  </TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </nav>

        {/* Collapse button */}
        <div className="px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full h-9 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border">
          <div className={cn(
            "flex items-center gap-3",
            collapsed && "flex-col"
          )}>
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">
                {usuario?.nombre ? usuario.nombre.split(' ').map(n => n[0]).join('') : 'U'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0 animate-fade-in">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {usuario?.nombre || 'Usuario'}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {usuario?.rol === 'admin' ? 'Administrador' : usuario?.rol === 'cajero' ? 'Cajero' : usuario?.rol === 'marketing' ? 'Marketing' : usuario?.rol}
                </p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onLogout}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? "right" : "top"} className="bg-popover text-popover-foreground">
                {usuario?.rol === 'admin' || usuario?.rol === 'marketing' || usuario?.rol === 'cocinero' ? 'Cerrar Sesión' : 'Cerrar Turno'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-8 w-8 text-muted-foreground hover:bg-secondary/50 flex-shrink-0"
                >
                  {theme === 'dark' ? <Icons.Sun className="h-4 w-4 text-amber-500" /> : <Icons.Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? "right" : "top"} className="bg-popover text-popover-foreground">
                Cambiar Tema
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

