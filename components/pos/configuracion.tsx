"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Building2,
  FileText,
  Key,
  Printer,
  Save,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  RotateCcw,
  HardDrive,
  Cloud,
  Upload,
  Wifi,
} from "lucide-react"

export function Configuracion() {
  const [empresa, setEmpresa] = useState({
    nombre_tienda: "",
    nombre_propietario: "",
    nit_tienda: "",
    direccion_tienda: "",
    telefono: "",
    email: "",
    tipo_contribuyente: "Persona Natural",
    prefijo_factura: "FE",
    resolucion_dian: "",
    rango_inicio: "1",
    rango_fin: "10000",
    resolucion_vigencia: "",
  })

  const [apiConfig, setApiConfig] = useState({
    factus_base_url:      'https://api-sandbox.factus.com.co',
    factus_client_id:     '',
    factus_client_secret: '',
    factus_username:      '',
    factus_password:      '',
    factus_rango_id:      '',
  })

  const [impresora, setImpresora] = useState({
    impresora_habilitada: true,
    impresora_tipo: "termica",
    impresora_ancho: "80mm",
    impresora_autoPrint: true,
  })

  const [conexionStatus, setConexionStatus] = useState<"conectado" | "desconectado" | "verificando">("conectado")

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const cfg = await (window as any).api.config.get()
        if (cfg) {
          setEmpresa((prev) => ({
            ...prev,
            nombre_tienda: cfg.nombre_tienda || "",
            nombre_propietario: cfg.nombre_propietario || "",
            nit_tienda: cfg.nit_tienda || "",
            direccion_tienda: cfg.direccion_tienda || "",
            telefono: cfg.telefono || "",
            email: cfg.email || "",
            tipo_contribuyente: cfg.tipo_contribuyente || "Persona Natural",
            prefijo_factura: cfg.prefijo_factura || "FE",
            resolucion_dian: cfg.resolucion_dian || "",
            rango_inicio: cfg.rango_inicio || "1",
            rango_fin: cfg.rango_fin || "10000",
            resolucion_vigencia: cfg.resolucion_vigencia || "",
          }))
          
          setApiConfig({
            factus_base_url:      cfg.factus_base_url      || 'https://api-sandbox.factus.com.co',
            factus_client_id:     cfg.factus_client_id     || '',
            factus_client_secret: cfg.factus_client_secret || '',
            factus_username:      cfg.factus_username      || '',
            factus_password:      cfg.factus_password      || '',
            factus_rango_id:      cfg.factus_rango_id      || '',
          })
          
          setImpresora({
            impresora_habilitada: cfg.impresora_habilitada === "true" || cfg.impresora_habilitada === true || (cfg.impresora_habilitada === undefined ? true : false),
            impresora_tipo: cfg.impresora_tipo || "termica",
            impresora_ancho: cfg.impresora_ancho || "80mm",
            impresora_autoPrint: cfg.impresora_autoPrint === "true" || cfg.impresora_autoPrint === true || (cfg.impresora_autoPrint === undefined ? true : false),
          })
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async (data: any) => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        for (const [key, value] of Object.entries(data)) {
          await (window as any).api.config.set(key, String(value))
        }
        toast.success("Configuración guardada exitosamente.")
        loadConfig()
        window.dispatchEvent(new Event('config-updated'))
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al guardar la configuración.")
    }
  }

  const verificarConexion = async () => {
    setConexionStatus("verificando")
    try {
      if (typeof window !== 'undefined' && (window as any).api) {
        const res = await (window as any).api.factus.verificar()
        setConexionStatus(res.ok ? 'conectado' : 'desconectado')
        if (!res.ok) toast.error('Error Factus: ' + res.error)
        else toast.success('Conexión con Factus exitosa ✅')
      } else {
        setConexionStatus('desconectado')
      }
    } catch (err: any) {
      setConexionStatus('desconectado')
      toast.error('Error: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="empresa" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="h-4 w-4 mr-2" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="dian" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4 mr-2" />
            Facturación DIAN
          </TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Key className="h-4 w-4 mr-2" />
            Factus API
          </TabsTrigger>
          <TabsTrigger value="impresora" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Printer className="h-4 w-4 mr-2" />
            Impresora
          </TabsTrigger>
          <TabsTrigger value="seguridad" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Shield className="h-4 w-4 mr-2" />
            Seguridad
          </TabsTrigger>
        </TabsList>

        {/* Tab Empresa */}
        <TabsContent value="empresa">
          <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Información de la Empresa
              </CardTitle>
              <CardDescription>
                Configura los datos legales y de contacto de tu negocio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Razón Social</Label>
                  <Input
                    value={empresa.nombre_tienda}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, nombre_tienda: e.target.value })
                    }
                    className="bg-white border border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">NIT</Label>
                  <Input
                    value={empresa.nit_tienda}
                    onChange={(e) => setEmpresa({ ...empresa, nit_tienda: e.target.value })}
                    className="bg-white border border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Nombre del Propietario</Label>
                  <Input
                    value={empresa.nombre_propietario}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, nombre_propietario: e.target.value })
                    }
                    placeholder="Ej: Juan Diaz"
                    className="bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Dirección</Label>
                <Input
                  value={empresa.direccion_tienda}
                  onChange={(e) =>
                    setEmpresa({ ...empresa, direccion_tienda: e.target.value })
                  }
                  className="bg-white border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Teléfono</Label>
                  <Input
                    value={empresa.telefono}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, telefono: e.target.value })
                    }
                    className="bg-white border border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Email</Label>
                  <Input
                    type="email"
                    value={empresa.email}
                    onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })}
                    className="bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Régimen Tributario</Label>
                <Select
                  value={empresa.tipo_contribuyente}
                  onValueChange={(v) => setEmpresa({ ...empresa, tipo_contribuyente: v })}
                >
                  <SelectTrigger className="bg-white border border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Persona Natural">Persona Natural</SelectItem>
                    <SelectItem value="Persona Jurídica">Persona Jurídica</SelectItem>
                    <SelectItem value="Responsable de IVA">Responsable de IVA</SelectItem>
                    <SelectItem value="No Responsable de IVA">No Responsable de IVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              </CardContent>
          
          {/* Footer Fijo */}
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <div className="flex justify-end">
              <Button 
                onClick={() => handleSave(empresa)}
                className="shadow-lg shadow-primary/20"
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar Cambios
              </Button>
            </div>
          </div>
        </Card>
        </TabsContent>

        {/* Tab DIAN */}
        <TabsContent value="dian">
          <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Configuración de Facturación Electrónica
              </CardTitle>
              <CardDescription>
                Parámetros de resolución DIAN para facturación electrónica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Habilitado para Facturación Electrónica
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tu negocio está autorizado por la DIAN
                    </p>
                  </div>
                  <Badge className="ml-auto bg-primary/20 text-primary border-0">
                    Activo
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Prefijo de Facturación</Label>
                  <Input
                    value={empresa.prefijo_factura}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, prefijo_factura: e.target.value })
                    }
                    className="bg-white border border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Número de Resolución</Label>
                  <Input
                    value={empresa.resolucion_dian}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, resolucion_dian: e.target.value })
                    }
                    className="bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Rango Inicio</Label>
                  <Input
                    value={empresa.rango_inicio}
                    onChange={(e) =>
                      setEmpresa({ ...empresa, rango_inicio: e.target.value })
                    }
                    className="bg-white border border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Rango Fin</Label>
                  <Input
                    value={empresa.rango_fin}
                    onChange={(e) => setEmpresa({ ...empresa, rango_fin: e.target.value })}
                    className="bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Vigencia de la Resolución</Label>
                <Input
                  value={empresa.resolucion_vigencia}
                  onChange={(e) =>
                    setEmpresa({ ...empresa, resolucion_vigencia: e.target.value })
                  }
                  placeholder="Ej: 2024-01-01 hasta 2030-01-01"
                  className="bg-white border border-slate-200"
                />
                <p className="text-xs text-muted-foreground">
                  Aparecerá en el ticket físico como exige la DIAN.
                </p>
              </div>

              </CardContent>
          
          {/* Footer Fijo */}
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <div className="flex justify-end">
              <Button 
                onClick={() => handleSave(empresa)}
                className="shadow-lg shadow-primary/20"
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar Configuracion
              </Button>
            </div>
          </div>
        </Card>
        </TabsContent>

        {/* Tab Factus API */}
        <TabsContent value="api">
          <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                Conexión con Factus API
              </CardTitle>
              <CardDescription>
                Configura tus credenciales OAuth2 de Factus para emitir facturas electrónicas DIAN
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status de Conexión */}
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {conexionStatus === "conectado" && (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <div>
                          <p className="font-medium text-foreground">Conexión Activa</p>
                          <p className="text-sm text-muted-foreground">Factus respondió correctamente</p>
                        </div>
                      </>
                    )}
                    {conexionStatus === "desconectado" && (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium text-foreground">Sin Conexión</p>
                          <p className="text-sm text-muted-foreground">Verifica tus credenciales y guárdalas primero</p>
                        </div>
                      </>
                    )}
                    {conexionStatus === "verificando" && (
                      <>
                        <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                        <div>
                          <p className="font-medium text-foreground">Verificando...</p>
                          <p className="text-sm text-muted-foreground">Conectando con Factus API</p>
                        </div>
                      </>
                    )}
                  </div>
                  <Button variant="outline" onClick={verificarConexion}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Verificar
                  </Button>
                </div>
              </div>

              {/* Ambiente */}
              <div className="space-y-2">
                <Label className="text-foreground">Ambiente</Label>
                <Select
                  value={apiConfig.factus_base_url.includes('sandbox') ? 'sandbox' : 'produccion'}
                  onValueChange={(v) => setApiConfig({
                    ...apiConfig,
                    factus_base_url: v === 'sandbox'
                      ? 'https://api-sandbox.factus.com.co'
                      : 'https://api.factus.com.co'
                  })}
                >
                  <SelectTrigger className="bg-white border border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">🧪 Sandbox (Pruebas)</SelectItem>
                    <SelectItem value="produccion">🚀 Producción</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{apiConfig.factus_base_url}</p>
              </div>

              {/* Client ID y Client Secret */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Client ID</Label>
                  <Input
                    value={apiConfig.factus_client_id}
                    onChange={(e) => setApiConfig({ ...apiConfig, factus_client_id: e.target.value })}
                    placeholder="a1c1b571-4f48-..."
                    className="bg-secondary font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Client Secret</Label>
                  <Input
                    type="password"
                    value={apiConfig.factus_client_secret}
                    onChange={(e) => setApiConfig({ ...apiConfig, factus_client_secret: e.target.value })}
                    placeholder="HmXGGDo1Bj..."
                    className="bg-secondary font-mono text-sm"
                  />
                </div>
              </div>

              {/* Usuario y Contraseña */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Correo / Usuario</Label>
                  <Input
                    value={apiConfig.factus_username}
                    onChange={(e) => setApiConfig({ ...apiConfig, factus_username: e.target.value })}
                    placeholder="sandboxv2@factus.com.co"
                    className="bg-secondary"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Contraseña</Label>
                  <Input
                    type="password"
                    value={apiConfig.factus_password}
                    onChange={(e) => setApiConfig({ ...apiConfig, factus_password: e.target.value })}
                    placeholder="••••••••"
                    className="bg-secondary"
                  />
                </div>
              </div>

              {/* ID del Rango de Numeración (opcional) */}
              <div className="space-y-2">
                <Label className="text-foreground">ID Rango de Numeración (opcional)</Label>
                <Input
                  value={apiConfig.factus_rango_id}
                  onChange={(e) => setApiConfig({ ...apiConfig, factus_rango_id: e.target.value })}
                  placeholder="Déjalo vacío para usar el primer rango disponible"
                  className="bg-secondary font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Puedes obtener los rangos disponibles verificando la conexión y consultando la sección DIAN de Factus.
                </p>
              </div>

              </CardContent>
          
          {/* Footer Fijo */}
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <div className="flex justify-end">
              <Button 
                onClick={() => handleSave(apiConfig)}
                className="shadow-lg shadow-primary/20"
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar Credenciales
              </Button>
            </div>
          </div>
        </Card>
        </TabsContent>

        {/* Tab Impresora */}
        <TabsContent value="impresora">
          <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                Configuración de Impresora
              </CardTitle>
              <CardDescription>
                Ajusta los parámetros de impresión de tickets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-3">
                  <Printer className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Impresora Habilitada</p>
                    <p className="text-sm text-muted-foreground">
                      Activa la impresión automática de tickets
                    </p>
                  </div>
                </div>
                <Switch
                  checked={impresora.impresora_habilitada}
                  onCheckedChange={(v) => setImpresora({ ...impresora, impresora_habilitada: v })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-foreground">Tipo de Impresora</Label>
                  <Select
                    value={impresora.impresora_tipo}
                    onValueChange={(v) => setImpresora({ ...impresora, impresora_tipo: v })}
                  >
                    <SelectTrigger className="bg-white border border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="termica">Térmica (POS)</SelectItem>
                      <SelectItem value="matricial">Matricial</SelectItem>
                      <SelectItem value="laser">Láser / Inyección</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Ancho del Papel</Label>
                  <Select
                    value={impresora.impresora_ancho}
                    onValueChange={(v) => setImpresora({ ...impresora, impresora_ancho: v })}
                  >
                    <SelectTrigger className="bg-white border border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm</SelectItem>
                      <SelectItem value="80mm">80mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                <div>
                  <p className="font-medium text-foreground">Impresión Automática</p>
                  <p className="text-sm text-muted-foreground">
                    Imprimir ticket al completar cada venta
                  </p>
                </div>
                <Switch
                  checked={impresora.impresora_autoPrint}
                  onCheckedChange={(v) => setImpresora({ ...impresora, impresora_autoPrint: v })}
                />
              </div>

              </CardContent>
          
          {/* Footer Fijo */}
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <div className="flex justify-end gap-3">
              <Button variant="outline">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Prueba
              </Button>
              <Button 
                onClick={() => handleSave(impresora)}
                className="shadow-lg shadow-primary/20"
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar Configuracion
              </Button>
            </div>
          </div>
        </Card>
        </TabsContent>
        {/* Tab Seguridad */}
        <TabsContent value="seguridad">
          <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Seguridad y Acceso
              </CardTitle>
              <CardDescription>
                Gestiona las credenciales de acceso y respaldos de informacion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b pb-6 border-border/50">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Cambiar Contrasena</h3>
                  <p className="text-xs text-muted-foreground">La contrasena se almacenara con cifrado bcrypt.</p>
                  <div className="space-y-2">
                    <Label>Nueva Contrasena</Label>
                    <Input id="sec-pass1" type="password" placeholder="Minimo 8 caracteres" className="bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirmar Contrasena</Label>
                    <Input id="sec-pass2" type="password" placeholder="********" className="bg-white" />
                  </div>
                  <Button onClick={async () => {
                    const p1 = (document.getElementById('sec-pass1') as HTMLInputElement).value;
                    const p2 = (document.getElementById('sec-pass2') as HTMLInputElement).value;
                    
                    if (p1 !== p2) { toast.error("Las contrasenas no coinciden"); return; }
                    if (p1.length < 8) { toast.error("La contrasena debe tener al menos 8 caracteres"); return; }

                    const res = await (window as any).api.auth.changePassword(p1);
                    if (res.ok) {
                      toast.success("Credenciales actualizadas correctamente");
                      (document.getElementById('sec-pass1') as HTMLInputElement).value = '';
                      (document.getElementById('sec-pass2') as HTMLInputElement).value = '';
                    } else {
                      toast.error(res.error || "Error al cambiar la contrasena");
                    }
                  }}>
                    Actualizar Credenciales
                  </Button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Respaldos y Restauracion</h3>
                  <p className="text-sm text-muted-foreground">
                    Crea copias de seguridad y restaura desde backups locales o Google Drive.
                  </p>
                  <div className="p-4 rounded-lg bg-secondary/30 border border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Crear Backup Manual</p>
                      <p className="text-[10px] text-muted-foreground">Cifrado AES-256-GCM + subida a Drive</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={async () => {
                      const res = await (window as any).api.auditoria.backup();
                      if (res.ok) toast.success("Respaldo creado");
                      else toast.error("Error: " + res.error);
                    }}>
                      <RefreshCw className="h-3 w-3 mr-2" />
                      Crear Copia ahora
                    </Button>
                  </div>

                  <BackupList
                    title="Respaldos Locales"
                    desc="Archivos cifrados en disco"
                    api={(window as any).api}
                    toast={toast}
                  />
                  <DriveBackupList
                    title="Google Drive"
                    desc="Respaldos en la nube"
                    api={(window as any).api}
                    toast={toast}
                  />
                  <UpdateSection />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>
    </div>
  )
}

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function BackupList({ title, desc, api, toast }: {
  title: string
  desc: string
  api: any
  toast: any
}) {
  const [backups, setBackups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<any>(null)
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    try {
      const list = await api.backup.list()
      setBackups(list || [])
    } catch { setBackups([]) }
  }

  useEffect(() => { load() }, [])

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const res = await api.backup.restoreLocal(restoreTarget.path)
      if (res.ok) {
        toast.success("Base de datos restaurada. Reinicie la aplicacion.")
        setRestoreTarget(null)
      } else {
        toast.error(res.error || "Error al restaurar")
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">{desc}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {backups.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">Sin respaldos locales</p>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {backups.slice(0, 10).map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] truncate block">{b.name}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(b.created).toLocaleString('es-CO')} · {(b.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={() => setRestoreTarget(b)} title="Restaurar">
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar desde Backup</AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2">
              <p>Esta accion reemplazara TODA la base de datos actual con el respaldo:</p>
              <p className="font-mono text-[11px] bg-muted p-2 rounded">{restoreTarget?.name}</p>
              <p className="text-destructive font-semibold">Se recomienda reiniciar la aplicacion despues de restaurar.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}
              className="bg-primary hover:bg-primary/90">
              {restoring ? "Restaurando..." : "Restaurar y Reiniciar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DriveBackupList({ title, desc, api, toast }: {
  title: string
  desc: string
  api: any
  toast: any
}) {
  const [driveBackups, setDriveBackups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<any>(null)
  const [restoring, setRestoring] = useState(false)
  const [driveStatus, setDriveStatus] = useState<string>("Cargando...")

  const load = async () => {
    try {
      const res = await api.drive.status()
      if (res.ok && res.recentBackups) {
        setDriveBackups(res.recentBackups)
        setDriveStatus("")
      } else {
        setDriveBackups([])
        setDriveStatus(res.message || "Drive no configurado")
      }
    } catch {
      setDriveBackups([])
      setDriveStatus("Error de conexion")
    }
  }

  useEffect(() => { load() }, [])

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const res = await api.backup.restoreDrive(restoreTarget.id)
      if (res.ok) {
        toast.success("Base de datos restaurada desde Drive. Reinicie la aplicacion.")
        setRestoreTarget(null)
      } else {
        toast.error(res.error || "Error al restaurar")
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">{desc}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {driveStatus ? (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3" />{driveStatus}
          </div>
        ) : driveBackups.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">Sin respaldos en Drive</p>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {driveBackups.slice(0, 10).map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] truncate block">{b.name}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {b.created ? new Date(b.created).toLocaleString('es-CO') : ''} · {(b.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={() => setRestoreTarget(b)} title="Restaurar desde Drive">
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar desde Google Drive</AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2">
              <p>Se descargara el backup de Drive y se restaurara la base de datos:</p>
              <p className="font-mono text-[11px] bg-muted p-2 rounded">{restoreTarget?.name}</p>
              <p className="text-destructive font-semibold">La base de datos actual sera reemplazada. Reinicie la app despues.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}
              className="bg-primary hover:bg-primary/90">
              {restoring ? "Descargando..." : "Descargar y Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function UpdateSection() {
  const [status, setStatus] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const hasApi = typeof window !== "undefined" && (window as any).api

  useEffect(() => {
    if (!hasApi) return
    // Carga estado inicial
    ;(window as any).api.update.status().then((s: any) => setStatus(s)).catch(() => {})
    // Escucha eventos en tiempo real del proceso principal
    const unsub = (window as any).api.update.onStatus?.((data: any) => {
      setStatus((prev: any) => ({ ...prev, ...mapEvent(data) }))
    })
    return () => { try { unsub?.() } catch {} }
  }, [])

  const mapEvent = (data: any) => {
    if (data.event === 'checking') return { message: 'Verificando actualizaciones...' }
    if (data.event === 'not-available') return { ok: true, message: 'Ya tienes la última versión', updateAvailable: false, downloadProgress: null }
    if (data.event === 'available') return { ok: true, message: `Nueva versión ${data.version} disponible. Descargando...`, updateAvailable: true, updateInfo: data }
    if (data.event === 'downloading') return { downloadProgress: data, message: `Descargando... ${Math.round(data.percent || 0)}%` }
    if (data.event === 'downloaded') return { ok: true, updateDownloaded: true, downloadProgress: null, message: 'Actualización lista para instalar' }
    if (data.event === 'error') {
      // Si ya había una actualización detectada, no sobreescribir ese estado
      if (data.hadUpdate) {
        return { ok: true, updateAvailable: true, downloadProgress: null, message: `Versión ${data.version || 'nueva'} disponible. Descarga manual requerida.` }
      }
      return { ok: false, message: 'No se pudo verificar actualizaciones', downloadProgress: null }
    }
    return {}
  }

  const handleCheck = async () => {
    if (!hasApi) return
    setChecking(true)
    try {
      const s = await (window as any).api.update.check()
      setStatus(s)
    } catch {
      setStatus({ ok: false, message: 'Solo disponible en la aplicación Electron' })
    }
    setChecking(false)
  }

  const handleInstall = async () => {
    if (!hasApi) return
    setInstalling(true)
    toast.info('Cerrando la aplicación para instalar la actualización...')
    setTimeout(async () => {
      await (window as any).api.update.install()
    }, 1500)
  }

  const isDownloading = status?.downloadProgress && status.downloadProgress.percent < 100
  const isReady = status?.updateDownloaded
  const isAvailable = status?.updateAvailable && !isReady

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Actualizaciones</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
          isReady ? 'bg-emerald-500/15 text-emerald-600' :
          isAvailable ? 'bg-amber-500/15 text-amber-600' :
          isDownloading ? 'bg-blue-500/15 text-blue-600' :
          'bg-muted text-muted-foreground'
        }`}>
          {isReady ? '✓ Lista para instalar' : isAvailable ? '↓ Disponible' : isDownloading ? '⬇ Descargando' : 'Al día'}
        </span>
      </div>

      {/* Barra de progreso de descarga */}
      {isDownloading && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${status.downloadProgress.percent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(status.downloadProgress.percent || 0)}%</span>
            {status.downloadProgress.bytesPerSecond > 0 && (
              <span>{(status.downloadProgress.bytesPerSecond / 1024).toFixed(0)} KB/s</span>
            )}
          </div>
        </div>
      )}

      {/* Mensaje de estado */}
      {status?.message && (
        <p className={`text-xs px-3 py-2 rounded-lg ${
          isReady ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
          status.ok ? 'bg-primary/10 text-primary' :
          'bg-muted text-muted-foreground'
        }`}>
          {status.message}
        </p>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        {isReady ? (
          <Button
            className="w-full h-9 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? 'Cerrando...' : '⟳ Instalar y Reiniciar ahora'}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full h-9 text-sm"
            onClick={handleCheck}
            disabled={checking || isDownloading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando...' : isDownloading ? 'Descargando...' : 'Buscar actualización'}
          </Button>
        )}
      </div>

      <p className="text-[9px] text-muted-foreground leading-relaxed">
        El sistema verifica actualizaciones automáticamente al iniciar. Si hay una nueva versión, se descarga en segundo plano y puedes instalarla sin cerrar la app manualmente.
      </p>
    </div>
  )
}
