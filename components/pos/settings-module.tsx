'use client'

import { useState } from 'react'
import { 
  Settings,
  Store,
  Printer,
  FileText,
  Users,
  Database,
  Save,
  Upload,
  Check,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useEspacios } from '@/contexts/espacios-context'
import { suscribirMesas, guardarMesa, eliminarMesa, type Mesa } from '@/lib/mesas-service'
import { suscribirConfiguracion, guardarConfiguracion, type ConfiguracionGlobal } from '@/lib/configuracion-service'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function SettingsModule() {
  const [activeTab, setActiveTab] = useState('business')
  const { espacioActivo } = useEspacios()
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [nuevaMesa, setNuevaMesa] = useState('')
  const [mesaToDelete, setMesaToDelete] = useState<Mesa | null>(null)
  
  // Configuración
  const [config, setConfig] = useState<ConfiguracionGlobal | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    const unsubMesas = espacioActivo ? suscribirMesas(espacioActivo.id, setMesas) : () => setMesas([])
    const unsubConfig = suscribirConfiguracion(setConfig)
    
    return () => {
      unsubMesas()
      unsubConfig()
    }
  }, [espacioActivo?.id])

  const handleConfigChange = (field: keyof ConfiguracionGlobal, value: string | number | boolean) => {
    if (config) {
      setConfig({ ...config, [field]: value } as ConfiguracionGlobal)
    }
  }

  const handleSaveConfig = async () => {
    if (!config) return
    setSavingConfig(true)
    try {
      await guardarConfiguracion(config)
      toast.success("Configuración guardada correctamente")
    } catch (e) {
      toast.error("Error al guardar la configuración")
    } finally {
      setSavingConfig(false)
    }
  }

  const handleCrearMesa = async () => {
    if (!nuevaMesa.trim() || !espacioActivo) return
    await guardarMesa({
      nombre: nuevaMesa.trim(),
      espacioId: espacioActivo.id,
      activa: true,
      orden: mesas.length + 1
    })
    setNuevaMesa('')
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Configuración
          </h1>
          <p className="text-muted-foreground">Ajustes generales del sistema</p>
        </div>
      </div>

      <AlertDialog open={!!mesaToDelete} onOpenChange={(open) => !open && setMesaToDelete(null)}>
        <AlertDialogContent className="bg-card text-card-foreground border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar mesa?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la {mesaToDelete?.nombre}? Si tiene pedidos activos se podrían perder las referencias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (mesaToDelete) {
                  await eliminarMesa(mesaToDelete.id)
                  setMesaToDelete(null)
                }
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="bg-card border border-border w-fit">
          <TabsTrigger value="business" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Store className="h-4 w-4" />
            Negocio
          </TabsTrigger>
          <TabsTrigger value="printer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Printer className="h-4 w-4" />
            Impresora
          </TabsTrigger>
          <TabsTrigger value="tables" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Store className="h-4 w-4" />
            Mesas y Zonas
          </TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <FileText className="h-4 w-4" />
            Facturación
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Users className="h-4 w-4" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="backup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Database className="h-4 w-4" />
            Backup
          </TabsTrigger>
        </TabsList>

        {/* Business Tab */}
        <TabsContent value="business" className="flex-1 mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-foreground">Información del Negocio</CardTitle>
              <CardDescription className="text-muted-foreground">
                Datos de tu cafetería que aparecerán en los tickets y facturas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-3xl">
                  <Store className="h-10 w-10 text-primary-foreground" />
                </div>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Cambiar Logo
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre de la cafetería</Label>
                  <Input className="bg-input" value={config?.nombre_tienda || ''} onChange={(e) => handleConfigChange('nombre_tienda', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>NIT</Label>
                  <Input className="bg-input" value={config?.nit_tienda || ''} onChange={(e) => handleConfigChange('nit_tienda', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input className="bg-input" value={config?.direccion_tienda || ''} onChange={(e) => handleConfigChange('direccion_tienda', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input className="bg-input" value={config?.telefono || ''} onChange={(e) => handleConfigChange('telefono', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" className="bg-input" value={config?.email || ''} onChange={(e) => handleConfigChange('email', e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig || !config} className="bg-primary text-primary-foreground">
                <Save className="h-4 w-4 mr-2" />
                {savingConfig ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Printer Tab */}
        <TabsContent value="printer" className="flex-1 mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-foreground">Configuración de Impresora</CardTitle>
              <CardDescription className="text-muted-foreground">
                Configura la impresora térmica para tickets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Impresora térmica</Label>
                <Select defaultValue="epson">
                  <SelectTrigger className="bg-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="epson">EPSON TM-T20III</SelectItem>
                    <SelectItem value="star">Star TSP100</SelectItem>
                    <SelectItem value="bixolon">Bixolon SRP-330II</SelectItem>
                    <SelectItem value="none">Sin impresora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ancho del papel</Label>
                <Select defaultValue="80">
                  <SelectTrigger className="bg-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Auto-imprimir al vender</p>
                  <p className="text-sm text-muted-foreground">Imprime automáticamente el ticket al completar una venta</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Imprimir copia para cocina</p>
                  <p className="text-sm text-muted-foreground">Genera una copia adicional para preparación</p>
                </div>
                <Switch />
              </div>
              <Button variant="outline" className="w-full">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir prueba
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tables Tab */}
        <TabsContent value="tables" className="flex-1 mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-foreground">Mesas y Zonas ({espacioActivo?.nombre})</CardTitle>
              <CardDescription className="text-muted-foreground">
                Configura las mesas para el módulo de atención en sitio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Input 
                  className="bg-input flex-1" 
                  placeholder="Nombre de la nueva mesa (Ej: Terraza 3)" 
                  value={nuevaMesa}
                  onChange={(e) => setNuevaMesa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCrearMesa()}
                />
                <Button onClick={handleCrearMesa} className="bg-primary text-primary-foreground">
                  Crear
                </Button>
              </div>

              <div className="space-y-2">
                {mesas.map(mesa => (
                  <div key={mesa.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <span className="font-medium">{mesa.nombre}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                      onClick={() => setMesaToDelete(mesa)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {mesas.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay mesas configuradas en este espacio.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="flex-1 mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-foreground">Facturación Electrónica</CardTitle>
              <CardDescription className="text-muted-foreground">
                Integración con Factus para facturación electrónica DIAN
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Estado de conexión</p>
                    <p className="text-sm text-muted-foreground">Factus API</p>
                  </div>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">
                  <Check className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prefijo (Ej: POS)</Label>
                  <Input className="bg-input" value={config?.prefijo_factura || ''} onChange={(e) => handleConfigChange('prefijo_factura', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Consecutivo Actual</Label>
                  <Input className="bg-input" type="number" value={config?.consecutivo_actual || 0} onChange={(e) => handleConfigChange('consecutivo_actual', parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Resolución DIAN (Mensaje en el ticket)</Label>
                <Input className="bg-input" placeholder="Ej: Autorización N° 187640..." value={config?.resolucion_dian || ''} onChange={(e) => handleConfigChange('resolucion_dian', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Contribuyente</Label>
                  <Select value={config?.tipo_contribuyente || "Régimen Simplificado"} onValueChange={(val) => handleConfigChange('tipo_contribuyente', val)}>
                    <SelectTrigger className="bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Régimen Simplificado">Régimen Simplificado</SelectItem>
                      <SelectItem value="Régimen Común">Régimen Común</SelectItem>
                      <SelectItem value="Gran Contribuyente">Gran Contribuyente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsable de IVA</Label>
                  <Select value={config?.responsable_iva || "0"} onValueChange={(val) => handleConfigChange('responsable_iva', val)}>
                    <SelectTrigger className="bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Sí (Responsable)</SelectItem>
                      <SelectItem value="0">No (No Responsable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mensaje de despedida del Ticket</Label>
                <Input className="bg-input" value={config?.mensaje_ticket || ''} onChange={(e) => handleConfigChange('mensaje_ticket', e.target.value)} />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Modo de pruebas</p>
                  <p className="text-sm text-muted-foreground">Usa el ambiente sandbox de Factus</p>
                </div>
                <Switch />
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig || !config} className="bg-primary text-primary-foreground">
                <Save className="h-4 w-4 mr-2" />
                {savingConfig ? 'Guardando...' : 'Guardar Parámetros'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="flex-1 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Usuarios del Sistema</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Gestiona los usuarios que pueden acceder al POS
                </CardDescription>
              </div>
              <Button className="bg-primary text-primary-foreground">
                <Users className="h-4 w-4 mr-2" />
                Nuevo Usuario
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Administrador Demo', email: 'demo@example.com', role: 'Admin', status: 'active' },
                  { name: 'Operador Demo 01', email: 'demo@example.com', role: 'Cajero', status: 'active' },
                  { name: 'Operador Demo 02', email: 'demo@example.com', role: 'Cajero', status: 'active' },
                  { name: 'Operador Demo 02', email: 'demo@example.com', role: 'Supervisor', status: 'inactive' },
                ].map((user, idx) => (
                  <div 
                    key={user.email}
                    className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg animate-fade-in"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{user.role}</Badge>
                      <Badge className={cn(
                        user.status === 'active' 
                          ? "bg-success/20 text-success border-success/30"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {user.status === 'active' ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button variant="ghost" size="sm" className="text-muted-foreground">
                        Editar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Tab */}
        <TabsContent value="backup" className="flex-1 mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="text-foreground">Respaldo de Datos</CardTitle>
              <CardDescription className="text-muted-foreground">
                Configura copias de seguridad automáticas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Google Drive</p>
                    <p className="text-sm text-muted-foreground">demo@example.com</p>
                  </div>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">
                  Conectado
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Backup automático diario</p>
                  <p className="text-sm text-muted-foreground">Se ejecuta todos los días a las 3:00 AM</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label>Retención de backups</Label>
                <Select defaultValue="30">
                  <SelectTrigger className="bg-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 días</SelectItem>
                    <SelectItem value="15">15 días</SelectItem>
                    <SelectItem value="30">30 días</SelectItem>
                    <SelectItem value="90">90 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Último backup</p>
                <p className="text-lg font-bold text-foreground">Hoy, 3:00 AM</p>
                <p className="text-xs text-muted-foreground mt-1">Tamaño: 45.2 MB</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1">
                  <Database className="h-4 w-4 mr-2" />
                  Backup Manual
                </Button>
                <Button variant="outline" className="flex-1">
                  <Upload className="h-4 w-4 mr-2" />
                  Restaurar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
