import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Receipt,
  ArrowUp,
  ArrowDown,
} from "lucide-react"

const COLORS = [
  "oklch(0.72 0.19 160)",
  "oklch(0.65 0.15 200)",
  "oklch(0.75 0.15 80)",
  "oklch(0.6 0.2 300)",
  "oklch(0.7 0.18 40)",
  "#34d399",
  "#3b82f6"
]

export function Dashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      if (typeof window !== "undefined" && (window as any).api) {
        try {
          const res = await (window as any).api.ventas.getDashboard();
          setData(res);
        } catch (err) {
          console.error(err);
        }
      }
    };
    loadData();
  }, []);
  const formatCOP = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatShort = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value}`
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">Cargando dashboard...</div>;
  }

  // Preprocesar datos para gráficos
  const ventasMesChart = (data.ventasMes || []).map((v: any) => ({
    dia: v.dia.split("-")[2] + "/" + v.dia.split("-")[1],
    ventas: v.total_dia,
  }));

  const pieData = (data.porMetodo || []).map((m: any) => ({
    nombre: m.metodo_pago,
    valor: m.total,
  }));
  
  if (pieData.length === 0) {
    pieData.push({ nombre: "Sin ventas", valor: 1 });
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ventas Hoy</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCOP(data.ventas_total || 0)}
                </p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <DollarSign className="h-7 w-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ventas Mes</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCOP(data.ventas_mes || 0)}
                </p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Transacciones Hoy</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.transacciones || 0}</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <ShoppingCart className="h-7 w-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Promedio</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCOP(data.ticket_promedio || 0)}
                </p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <Receipt className="h-7 w-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas Semanales */}
        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardHeader>
            <CardTitle className="text-foreground">Ventas de la Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ventasMesChart}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="dia"
                    stroke="#94a3b8"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={formatShort}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCOP(value), "Ventas"]}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      color: "#1e293b",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Bar
                    dataKey="ventas"
                    fill="url(#barGradient)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tendencia Mensual */}
        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardHeader>
            <CardTitle className="text-foreground">Evolución de Ventas (Este Mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ventasMesChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 260)" />
                  <XAxis
                    dataKey="dia"
                    stroke="oklch(0.65 0.01 260)"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="oklch(0.65 0.01 260)"
                    fontSize={12}
                    tickFormatter={formatShort}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCOP(value), "Ventas"]}
                    contentStyle={{
                      backgroundColor: "oklch(0.18 0.01 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0.01 260)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ventas"
                    stroke="oklch(0.72 0.19 160)"
                    strokeWidth={3}
                    dot={{ fill: "oklch(0.72 0.19 160)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ventas por Categoria */}
        <Card className="bg-card shadow-lg shadow-black/[0.03] border-0">
          <CardHeader>
            <CardTitle className="text-foreground">Ventas por Método de Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="valor"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatCOP(value), "Total"]}
                    contentStyle={{
                      backgroundColor: "oklch(0.18 0.01 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0.01 260)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {pieData.map((cat: any, index: number) => (
                <div key={cat.nombre} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm text-muted-foreground">{cat.nombre}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Productos */}
        <Card className="bg-card lg:col-span-2 shadow-lg shadow-black/[0.03] border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-foreground">Productos Mas Vendidos</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="space-y-3">
              {(data.topProductos || []).length === 0 ? (
                <div className="text-muted-foreground text-center py-4">No hay ventas registradas hoy</div>
              ) : (data.topProductos || []).map((producto: any, index: number) => (
                <div
                  key={producto.nombre}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{producto.nombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {producto.qty} unidades vendidas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">{formatCOP(producto.total_vendido)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
