"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Package,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  CheckCircle2,
} from "lucide-react"

interface Producto {
  id: string
  codigo: string
  nombre: string
  categoria: string
  precioCompra: number
  iva: number
  impoconsumo: number
  margen: number
  precioVenta: number
  stock: number
  stockMinimo: number
}

const productosIniciales: Producto[] = [
  {
    id: "1",
    codigo: "7702001010101",
    nombre: "Coca-Cola 350ml",
    categoria: "Bebidas",
    precioCompra: 2500,
    iva: 19,
    impoconsumo: 0,
    margen: 25,
    precioVenta: 3500,
    stock: 48,
    stockMinimo: 12,
  },
  {
    id: "2",
    codigo: "7702001010102",
    nombre: "Pan Tajado Bimbo",
    categoria: "Panadería",
    precioCompra: 6500,
    iva: 0,
    impoconsumo: 0,
    margen: 20,
    precioVenta: 8900,
    stock: 15,
    stockMinimo: 10,
  },
  {
    id: "3",
    codigo: "7702001010103",
    nombre: "Arroz Diana 1kg",
    categoria: "Granos",
    precioCompra: 4000,
    iva: 0,
    impoconsumo: 0,
    margen: 30,
    precioVenta: 5200,
    stock: 35,
    stockMinimo: 20,
  },
  {
    id: "4",
    codigo: "7702001010104",
    nombre: "Leche Alpina 1L",
    categoria: "Lácteos",
    precioCompra: 3800,
    iva: 5,
    impoconsumo: 0,
    margen: 22,
    precioVenta: 4800,
    stock: 8,
    stockMinimo: 15,
  },
  {
    id: "5",
    codigo: "7702001010105",
    nombre: "Aceite Girasol 500ml",
    categoria: "Aceites",
    precioCompra: 9500,
    iva: 19,
    impoconsumo: 0,
    margen: 25,
    precioVenta: 12500,
    stock: 22,
    stockMinimo: 10,
  },
  {
    id: "6",
    codigo: "7702001010106",
    nombre: "Jabón Rey 235g",
    categoria: "Aseo",
    precioCompra: 2000,
    iva: 19,
    impoconsumo: 0,
    margen: 28,
    precioVenta: 2800,
    stock: 5,
    stockMinimo: 15,
  },
]

const categorias = ["Bebidas", "Panaderia", "Granos", "Lacteos", "Aceites", "Aseo", "Snacks", "Enlatados", "Otros"]

export function Inventario() {
  const [productos, setProductos] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas")
  const [showModal, setShowModal] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [nuevoProducto, setNuevoProducto] = useState({
    codigo: "",
    nombre: "",
    categoria: "",
    precioCompra: "",
    iva: "19",
    impoconsumo: "0",
    margen: "25",
    stock: "",
    stockMinimo: "",
    precioManual: "",
  })

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  // Estados para Ingreso Rápido de Mercancía
  const [showIngresoModal, setShowIngresoModal] = useState(false)
  const [busquedaIngreso, setBusquedaIngreso] = useState("")
  const [productoIngresoId, setProductoIngresoId] = useState<string>("")
  const [cantidadIngreso, setCantidadIngreso] = useState("")
  const [multiplicadorIngreso, setMultiplicadorIngreso] = useState("1")

  const resetIngresoModal = () => {
    setBusquedaIngreso("")
    setProductoIngresoId("")
    setCantidadIngreso("")
    setMultiplicadorIngreso("1")
  }

  const handleRecibirMercancia = async () => {
    if (!productoIngresoId) {
      toast.error("Seleccione un producto primero")
      return
    }
    const cant = parseFloat(cantidadIngreso)
    const mult = parseFloat(multiplicadorIngreso) || 1

    if (isNaN(cant) || cant <= 0) {
      toast.error("La cantidad debe ser mayor a 0")
      return
    }

    const totalIngresar = Math.round(cant * mult)
    
    try {
      await (window as any).api.productos.updateStock(productoIngresoId, totalIngresar)
      toast.success(`Se agregaron ${totalIngresar} unidades al inventario`)
      loadProductos()
      resetIngresoModal()
      // Mantener modal abierto por diseño de la solicitud (agilidad)
    } catch (err) {
      console.error(err)
      toast.error("Error al actualizar el inventario")
    }
  }

  useEffect(() => {
    loadProductos()
  }, [])

  const loadProductos = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const data = await (window as any).api.productos.getAll()
        setProductos(data || [])
      } else {
        console.warn("API de Electron no detectada. ¿Estás ejecutando desde el navegador en vez de la app?")
      }
    } catch (err) {
      console.error(err)
    }
  }

  const [isCategorizing, setIsCategorizing] = useState(false)

  const handleAutoCategorize = async () => {
    setIsCategorizing(true)
    const toastId = toast.loading("Analizando y organizando productos con IA...")
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const res = await (window as any).api.productos.autoCategorize()
        if (res.ok) {
          if (res.count > 0) {
            toast.success(`✨ ¡Inventario organizado! Se clasificaron ${res.count} productos.`, {
              id: toastId,
            })
          } else {
            toast.success("✨ El inventario ya está completamente organizado por categorías.", {
              id: toastId,
            })
          }
          loadProductos()
        } else {
          toast.error("Ocurrió un error al organizar el inventario.", {
            id: toastId,
          })
        }
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al comunicarse con la base de datos.", {
        id: toastId,
      })
    } finally {
      setIsCategorizing(false)
    }
  }

  const productosFiltrados = productos.filter((p) => {
    const matchBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.barcode || "").includes(busqueda)
    const matchCategoria = categoriaFiltro === "todas" || p.categoria === categoriaFiltro
    return matchBusqueda && matchCategoria
  })
  const [pagina, setPagina] = useState(1)
  const itemsPorPagina = 50

  useEffect(() => {
    setPagina(1)
  }, [busqueda, categoriaFiltro])

  const totalPaginas = Math.ceil(productosFiltrados.length / itemsPorPagina) || 1
  const productosPaginados = productosFiltrados.slice(
    (pagina - 1) * itemsPorPagina,
    pagina * itemsPorPagina
  )
  const productosStockBajo = productos.filter((p) => p.stock <= 5)

  const calcularPrecioVenta = () => {
    const compra = parseFloat(nuevoProducto.precioCompra) || 0
    const iva = parseFloat(nuevoProducto.iva) || 0
    const impo = parseFloat(nuevoProducto.impoconsumo) || 0
    const margen = parseFloat(nuevoProducto.margen) || 0
    return compra * (1 + iva / 100 + impo / 100) * (1 + margen / 100)
  }

  const analizarProducto = (nombre: string) => {
    if (!nombre || nombre.length < 3) return;
    const text = nombre.toLowerCase();
    let nuevaCategoria = "";
    let nuevoIva = "19";
    let nuevoImpo = "0";

    // IA Heurística para productos colombianos
    if (text.match(/coca cola|pepsi|gaseosa|jugo|hit|postobon|pony malta|mr tea|sprite|7up/)) {
      nuevaCategoria = "Bebidas";
    } else if (text.match(/cerveza|aguardiente|ron|club colombia|poker|aguila|corona|heineken|buchanans|old parr/)) {
      nuevaCategoria = "Bebidas";
      nuevoImpo = "8";
    } else if (text.match(/arroz|frijol|lenteja|garbanzo|pasta|spagueti|harina|panela|diana|roa|sal|azucar|lentejas|frijoles|arveja/)) {
      nuevaCategoria = "Granos";
      nuevoIva = "0";
    } else if (text.match(/leche|queso|yogurt|mantequilla|alpina|colanta|alqueria|kummis/)) {
      nuevaCategoria = "Lacteos";
      nuevoIva = "0";
    } else if (text.match(/\bpan\b|bimbo|tostada|galleta|saltin|festival|ducales|ponque|ramo|chocoramo/)) {
      nuevaCategoria = "Panaderia";
      if (text.includes("chocoramo")) nuevoImpo = "8"; // Impuesto saludable
    } else if (text.match(/aceite|gourmet|premier|rama/)) {
      nuevaCategoria = "Aceites";
    } else if (text.match(/\bfab\b|fabuloso|limpido|jabon|detergente|blanqueador|ariel|blancox|clorox|suavitel|shampoo|crema dental|colgate|papel higienico|familia/)) {
      nuevaCategoria = "Aseo";
    } else if (text.match(/papas|margarita|todito|gansito|chocolatina|jumbo|jet|doritos|cheetos|mani|de todito/)) {
      nuevaCategoria = "Snacks";
      nuevoImpo = "8"; // Comida chatarra
    }

    if (nuevaCategoria) {
      const isChanged = nuevoProducto.categoria !== nuevaCategoria || nuevoProducto.iva !== nuevoIva || nuevoProducto.impoconsumo !== nuevoImpo;
      if (isChanged) {
        toast.success(`✨ IA: Producto detectado como ${nuevaCategoria}`);
        setNuevoProducto((prev) => ({
          ...prev,
          categoria: nuevaCategoria,
          iva: nuevoIva,
          impoconsumo: nuevoImpo
        }));
      }
    }
  }

  const guardarProducto = async () => {
    const precioVenta = nuevoProducto.precioManual
      ? Math.round(parseFloat(nuevoProducto.precioManual))
      : Math.round(calcularPrecioVenta())
    const prod = {
      id: productoEditar?.id,
      nombre: nuevoProducto.nombre,
      precio: Math.round(precioVenta),
      stock: parseInt(nuevoProducto.stock) || 0,
      categoria: nuevoProducto.categoria || "General",
      barcode: nuevoProducto.codigo || null,
      costo: parseFloat(nuevoProducto.precioCompra) || 0,
      iva: parseFloat(nuevoProducto.iva) || 0,
      impoconsumo: parseFloat(nuevoProducto.impoconsumo) || 0,
    }

    try {
      await (window as any).api.productos.save(prod)
      toast.success(productoEditar ? "Producto actualizado correctamente" : "Producto creado correctamente")
      loadProductos()
      cerrarModal()
    } catch (error) {
      console.error(error)
      toast.error("Error al guardar el producto")
    }
  }

  const editarProducto = (producto: any) => {
    setProductoEditar(producto)
    // Calculate reverse margin if we want, or just assume 25 for UI
    const costoImpo = producto.costo * (1 + producto.iva / 100 + producto.impoconsumo / 100)
    let margen = 25
    if (costoImpo > 0) {
      margen = ((producto.precio / costoImpo) - 1) * 100
    }
    
    setNuevoProducto({
      codigo: producto.barcode || "",
      nombre: producto.nombre,
      categoria: producto.categoria || "General",
      precioCompra: (producto.costo || 0).toString(),
      iva: (producto.iva || 0).toString(),
      impoconsumo: (producto.impoconsumo || 0).toString(),
      margen: Math.round(margen).toString(),
      stock: producto.stock.toString(),
      stockMinimo: "5",
      precioManual: producto.precio ? Math.round(producto.precio).toString() : "",
    })
    setShowModal(true)
  }

  const eliminarProducto = async () => {
    if (!idToDelete) return;
    try {
      await (window as any).api.productos.delete(idToDelete)
      toast.success("Producto eliminado correctamente")
      loadProductos()
      setIsDeleteDialogOpen(false)
      setIdToDelete(null)
    } catch (error) {
      console.error(error)
      toast.error("Error al eliminar el producto")
    }
  }

  const confirmarEliminar = (id: string) => {
    setIdToDelete(id)
    setIsDeleteDialogOpen(true)
  }

  const cerrarModal = () => {
    setShowModal(false)
    setProductoEditar(null)
    setNuevoProducto({
      codigo: "",
      nombre: "",
      categoria: "",
      precioCompra: "",
      iva: "19",
      impoconsumo: "0",
      margen: "25",
      stock: "",
      stockMinimo: "",
      precioManual: "",
    })
  }

  const formatCOP = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Productos</p>
              <p className="text-2xl font-bold text-foreground">{productos.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Bajo</p>
              <p className="text-2xl font-bold text-foreground">{productosStockBajo.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor Inventario</p>
              <p className="text-2xl font-bold text-foreground">
                {formatCOP(productos.reduce((acc, p) => acc + (p.costo || 0) * (p.stock || 0), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 bg-card"
            />
          </div>
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary gap-2"
            onClick={handleAutoCategorize}
            disabled={isCategorizing}
          >
            <Sparkles className={`h-4 w-4 ${isCategorizing ? 'animate-pulse' : ''}`} />
            Organizar Categorías (IA)
          </Button>
          <Button 
            variant="secondary"
            className="gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/50"
            onClick={() => {
              resetIngresoModal();
              setShowIngresoModal(true);
            }}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Recibir Mercancía
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Listado de Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12">Código</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12">Producto</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12">Categoría</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12 text-right">Costo</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12 text-right">Precio Público</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12 text-center">Stock</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground h-12 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productosPaginados.map((producto) => (
                <TableRow key={producto.id} className="border-border hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group">
                  <TableCell className="font-mono text-xs text-slate-500 font-medium">
                    {producto.barcode || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-100/50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{producto.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-white dark:bg-slate-950 font-medium text-slate-600 border-slate-200">
                      {producto.categoria || "General"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-slate-500 font-medium">
                    {formatCOP(producto.costo || 0)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 text-base">
                    {formatCOP(producto.precio || 0)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <Badge variant="secondary" className={`font-bold px-2.5 py-1 ${producto.stock <= 5 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {producto.stock}
                        {producto.stock <= 5 && <AlertTriangle className="ml-1.5 h-3.5 w-3.5" />}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30"
                        onClick={() => editarProducto(producto)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                        onClick={() => confirmarEliminar(producto.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-4">
              <span className="text-xs text-muted-foreground">
                Mostrando {((pagina - 1) * itemsPorPagina) + 1} a {Math.min(pagina * itemsPorPagina, productosFiltrados.length)} de {productosFiltrados.length} productos
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((prev) => Math.max(prev - 1, 1))}
                  disabled={pagina === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-semibold px-3 flex items-center bg-secondary/50 rounded-md border border-border/55">
                  Página {pagina} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((prev) => Math.min(prev + 1, totalPaginas))}
                  disabled={pagina === totalPaginas}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmar Eliminar */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El producto será eliminado permanentemente del inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setIdToDelete(null) }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminarProducto}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Nuevo/Editar Producto */}
      <Dialog open={showModal} onOpenChange={cerrarModal}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {productoEditar ? "Editar Producto" : "Nuevo Producto"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Código de Barras</Label>
                <Input
                  value={nuevoProducto.codigo}
                  onChange={(e) =>
                    setNuevoProducto({ ...nuevoProducto, codigo: e.target.value })
                  }
                  placeholder="7702001010101"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Categoría</Label>
                <Select
                  value={nuevoProducto.categoria}
                  onValueChange={(v) => setNuevoProducto({ ...nuevoProducto, categoria: v })}
                >
                  <SelectTrigger className="bg-secondary">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Nombre del Producto</Label>
                <div className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-500 animate-pulse" />
                  IA Auto-Categorización
                </div>
              </div>
              <Input
                value={nuevoProducto.nombre}
                onChange={(e) =>
                  setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })
                }
                onBlur={() => analizarProducto(nuevoProducto.nombre)}
                placeholder="Ej. Coca Cola 1.5L"
                className="bg-secondary focus-visible:ring-amber-500 transition-shadow text-base h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Precio de Compra</Label>
                <Input
                  type="number"
                  value={nuevoProducto.precioCompra}
                  onChange={(e) =>
                    setNuevoProducto({ ...nuevoProducto, precioCompra: e.target.value })
                  }
                  placeholder="0"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Margen de Utilidad (%)</Label>
                <Input
                  type="number"
                  value={nuevoProducto.margen}
                  onChange={(e) =>
                    setNuevoProducto({ ...nuevoProducto, margen: e.target.value })
                  }
                  placeholder="25"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">IVA (%)</Label>
                <Select
                  value={nuevoProducto.iva}
                  onValueChange={(v) => setNuevoProducto({ ...nuevoProducto, iva: v })}
                >
                  <SelectTrigger className="bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exento)</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="19">19%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Impoconsumo (%)</Label>
                <Select
                  value={nuevoProducto.impoconsumo}
                  onValueChange={(v) =>
                    setNuevoProducto({ ...nuevoProducto, impoconsumo: v })
                  }
                >
                  <SelectTrigger className="bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="8">8%</SelectItem>
                    <SelectItem value="16">16%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Stock Actual</Label>
                <Input
                  type="number"
                  value={nuevoProducto.stock}
                  onChange={(e) =>
                    setNuevoProducto({ ...nuevoProducto, stock: e.target.value })
                  }
                  placeholder="0"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Stock Mínimo</Label>
                <Input
                  type="number"
                  value={nuevoProducto.stockMinimo}
                  onChange={(e) =>
                    setNuevoProducto({ ...nuevoProducto, stockMinimo: e.target.value })
                  }
                  placeholder="10"
                  className="bg-secondary"
                />
              </div>
            </div>

            {/* Precio de Venta */}
            <div className="space-y-2">
              <Label className="text-foreground">Precio de Venta</Label>
              <Input
                type="number"
                value={nuevoProducto.precioManual}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, precioManual: e.target.value })}
                placeholder={"" + Math.round(calcularPrecioVenta())}
                className="bg-secondary text-lg font-bold"
              />
              <p className="text-[10px] text-muted-foreground">
                Precio sugerido: {formatCOP(calcularPrecioVenta())} (costo + IVA + margen). Si no ingresa un precio, se usa el sugerido.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={guardarProducto}>Guardar Producto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Recibir Mercancía */}
      <Dialog open={showIngresoModal} onOpenChange={setShowIngresoModal}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
              Ingreso Rápido de Mercancía
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4 relative">
            <div className="space-y-2">
              <Label className="text-foreground">Buscar Producto</Label>
              <Input
                value={busquedaIngreso}
                onChange={(e) => {
                  setBusquedaIngreso(e.target.value)
                  setProductoIngresoId("") // Reset selection if searching again
                }}
                placeholder="Escanea el código o escribe el nombre..."
                className="bg-secondary"
                autoFocus
              />
              {/* Dropdown de resultados */}
              {busquedaIngreso.length > 2 && !productoIngresoId && (
                <div className="border border-border bg-card rounded-md shadow-lg max-h-40 overflow-y-auto absolute z-50 w-full mt-1">
                  {productos
                    .filter((p) => p.nombre.toLowerCase().includes(busquedaIngreso.toLowerCase()) || (p.barcode || "").includes(busquedaIngreso))
                    .slice(0, 10)
                    .map((p) => (
                      <div
                        key={p.id}
                        className="p-3 text-sm text-foreground hover:bg-secondary cursor-pointer flex justify-between border-b border-border/50 last:border-0"
                        onClick={() => {
                          setProductoIngresoId(p.id)
                          setBusquedaIngreso(p.nombre)
                        }}
                      >
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground font-mono text-xs">{p.barcode}</span>
                      </div>
                    ))}
                  {productos.filter((p) => p.nombre.toLowerCase().includes(busquedaIngreso.toLowerCase()) || (p.barcode || "").includes(busquedaIngreso)).length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      No se encontraron productos
                    </div>
                  )}
                </div>
              )}
            </div>

            {productoIngresoId && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Cantidad (Cajas/Unid)</Label>
                  <Input
                    type="number"
                    value={cantidadIngreso}
                    onChange={(e) => setCantidadIngreso(e.target.value)}
                    placeholder="Ej: 5"
                    className="bg-secondary font-bold text-lg"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground text-xs text-muted-foreground">Unidades por Caja (Opcional)</Label>
                  <Input
                    type="number"
                    value={multiplicadorIngreso}
                    onChange={(e) => setMultiplicadorIngreso(e.target.value)}
                    placeholder="1"
                    className="bg-secondary"
                  />
                </div>
                
                <div className="col-span-2 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg flex justify-between items-center border border-emerald-100 dark:border-emerald-800/30">
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Total a sumar al inventario:</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-500">
                    {Math.round((parseFloat(cantidadIngreso) || 0) * (parseFloat(multiplicadorIngreso) || 1))} und
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIngresoModal(false)}>
              Cerrar
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleRecibirMercancia}
              disabled={!productoIngresoId || !parseFloat(cantidadIngreso)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Ingresar al Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
