'use client'

import { useState, useEffect } from 'react'
import { 
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Calendar,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/demo-data'
import { DynamicIcon } from '@/components/ui/dynamic-icon'
import { generarReporteVentas, type ReporteVentas } from '@/lib/reportes-service'

export function ReportsModule() {
  const [activeTab, setActiveTab] = useState('vendors')
  const [period, setPeriod] = useState('month')
  
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let mounted = true
    setCargando(true)
    generarReporteVentas(period).then(data => {
      if (mounted) {
        setReporte(data)
        setCargando(false)
      }
    }).catch(err => {
      console.error(err)
      if (mounted) setCargando(false)
    })
    
    return () => { mounted = false }
  }, [period])

  const totalSales = reporte?.ventasTotales || 0
  const totalCost = reporte?.costoTotal || 0
  const grossProfit = reporte?.gananciaBruta || 0
  const grossMargin = reporte?.margenBruto?.toFixed(1) || '0.0'
  
  const salesByVendor = reporte?.ventasPorVendedor || []
  const weeklySales = reporte?.ventasEnElTiempo || []
  const topProducts = reporte?.topProductos || []
  const productProfitability = reporte?.rentabilidadProductos || []
  
  const totalVentasCount = salesByVendor.reduce((acc, v) => acc + v.ventas, 0)
  const ticketPromedio = totalVentasCount > 0 ? totalSales / totalVentasCount : 0

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/80 backdrop-blur-xl p-6 rounded-[2rem] border border-border/50 shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shadow-inner">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            Reportes
            {cargando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </h1>
          <p className="text-muted-foreground font-medium mt-1">Análisis de ventas y rentabilidad (Costo Histórico)</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full md:w-48 bg-background border-border/50 rounded-2xl h-12 shadow-sm focus:ring-primary/50 font-medium">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-border/50">
            <SelectItem value="today" className="rounded-xl">Hoy</SelectItem>
            <SelectItem value="week" className="rounded-xl">Esta semana</SelectItem>
            <SelectItem value="month" className="rounded-xl">Este mes</SelectItem>
            <SelectItem value="custom" className="rounded-xl">Personalizado (7d)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col mt-2">
        <div className="px-1">
          <TabsList className="bg-secondary/40 p-1.5 rounded-2xl border border-border/30 inline-flex shadow-inner">
            <TabsTrigger value="vendors" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 font-bold transition-all">
              <Users className="h-4 w-4" />
              Por Vendedor
            </TabsTrigger>
            <TabsTrigger value="global" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 font-bold transition-all">
              <BarChart3 className="h-4 w-4" />
              Globales
            </TabsTrigger>
            <TabsTrigger value="profitability" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 font-bold transition-all">
              <TrendingUp className="h-4 w-4" />
              Rentabilidad
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="flex-1 mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!cargando && salesByVendor.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                No hay ventas registradas en este periodo.
              </div>
            )}
            {salesByVendor.map((vendor, idx) => (
              <Card 
                key={vendor.id}
                className="bg-card border-border animate-fade-in"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
                      idx === 0 ? "bg-primary" : idx === 1 ? "bg-accent" : "bg-muted-foreground"
                    )}>
                      {vendor.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <CardTitle className="text-foreground text-base">{vendor.nombre}</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {vendor.ventas} ventas
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total vendido</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(vendor.total)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Promedio por venta</p>
                    <p className="font-medium text-foreground">{formatCurrency(vendor.average)}</p>
                  </div>
                  <div className="pt-3 border-t border-border space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Efectivo</span>
                      <span className="text-foreground">{formatCurrency(vendor.cash)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tarjeta</span>
                      <span className="text-foreground">{formatCurrency(vendor.card)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Transferencia</span>
                      <span className="text-foreground">{formatCurrency(vendor.transfer)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Team totals */}
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total del equipo</p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(totalSales)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total ventas</p>
                  <p className="text-2xl font-bold text-foreground">
                    {totalVentasCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Global Tab */}
        <TabsContent value="global" className="flex-1 mt-6 space-y-6 animate-fade-in">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card/60 backdrop-blur-md border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-[2rem]">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-primary/10 shadow-inner">
                    <DollarSign className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ventas Totales</p>
                    <p className="text-3xl font-black text-foreground tracking-tight">{formatCurrency(totalSales)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-md border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-[2rem]">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-destructive/10 shadow-inner">
                    <ShoppingCart className="h-7 w-7 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Costo Insumos</p>
                    <p className="text-3xl font-black text-foreground tracking-tight">{formatCurrency(totalCost)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-md border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-[2rem]">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-success/10 shadow-inner">
                    <TrendingUp className="h-7 w-7 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ganancia Bruta</p>
                    <p className="text-3xl font-black text-success tracking-tight">{formatCurrency(grossProfit)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-md border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-[2rem]">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-accent/10 shadow-inner">
                    <BarChart3 className="h-7 w-7 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Margen Bruto</p>
                    <p className="text-3xl font-black text-foreground tracking-tight">{grossMargin}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly/Daily sales chart */}
            <Card className="bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-foreground text-xl">Ventas en el Tiempo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mt-2">
                  {weeklySales.length === 0 && !cargando && (
                    <div className="text-center py-10 text-muted-foreground font-medium">Sin datos en el periodo</div>
                  )}
                  {weeklySales.map((week, idx) => {
                    const maxSales = Math.max(...weeklySales.map(w => w.sales), 1)
                    return (
                      <div key={week.fecha} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground font-medium">{week.fecha}</span>
                          <span className="text-foreground font-bold">{formatCurrency(week.sales)}</span>
                        </div>
                        <div className="h-4 bg-secondary/50 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-1000 ease-out relative"
                            style={{ 
                              width: `${(week.sales / maxSales) * 100}%`,
                              animationDelay: `${idx * 100}ms`
                            }}
                          >
                            <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top products */}
            <Card className="bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-foreground text-xl">Top 5 Productos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mt-2">
                  {topProducts.length === 0 && !cargando && (
                    <div className="text-center py-10 text-muted-foreground font-medium">Sin datos en el periodo</div>
                  )}
                  {topProducts.map((product, idx) => (
                    <div key={product.name} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/20 hover:bg-secondary/40 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-background border border-border/50 flex items-center justify-center font-black text-muted-foreground shadow-sm">
                          {idx + 1}
                        </div>
                        <span className="text-foreground font-bold">{product.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-primary text-[15px]">{formatCurrency(product.revenue)}</p>
                        <p className="text-xs font-semibold text-muted-foreground bg-background px-2 py-0.5 rounded-md inline-block mt-1 border border-border/50">{product.sold} vendidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Insights */}
          <Card className="bg-gradient-to-r from-primary/10 via-background to-secondary/20 border-border/50 rounded-[2rem] shadow-sm">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-12 bg-border hidden md:block"></div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Productos Diferentes</p>
                  <p className="text-4xl font-black text-primary">{productProfitability.length}</p>
                </div>
                <div className="text-center relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-12 bg-border hidden md:block"></div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Items Vendidos</p>
                  <p className="text-4xl font-black text-foreground">
                    {productProfitability.reduce((a, p) => a + p.unitsSold, 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ticket promedio</p>
                  <p className="text-4xl font-black text-foreground">{formatCurrency(ticketPromedio)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profitability Tab */}
        <TabsContent value="profitability" className="flex-1 mt-4">
          <Card className="h-full flex flex-col bg-card border-border">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-foreground">Rentabilidad por Producto</CardTitle>
              <CardDescription className="text-muted-foreground">
                El costo se calcula basado en el costo histórico registrado al momento de la venta.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Producto</TableHead>
                    <TableHead className="text-muted-foreground text-right">Vendidos</TableHead>
                    <TableHead className="text-muted-foreground text-right">Ingresos</TableHead>
                    <TableHead className="text-muted-foreground text-right">Costo</TableHead>
                    <TableHead className="text-muted-foreground text-right">Ganancia</TableHead>
                    <TableHead className="text-muted-foreground text-right">Margen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productProfitability.length === 0 && !cargando && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay datos de productos vendidos en este periodo.
                      </TableCell>
                    </TableRow>
                  )}
                  {productProfitability.map((product, idx) => (
                    <TableRow 
                      key={product.id}
                      className="border-border hover:bg-secondary/30 animate-fade-in"
                      style={{ animationDelay: `${idx * 20}ms` }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product.marginPercent < 50 && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                          <DynamicIcon name={product.emoji} className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium text-foreground">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{product.unitsSold}</TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(product.revenue)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(product.totalCost)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-success">
                        {formatCurrency(product.profit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn(
                          "font-mono",
                          product.marginPercent >= 50 
                            ? "bg-success/20 text-success" 
                            : "bg-warning/20 text-warning"
                        )}>
                          {product.marginPercent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
