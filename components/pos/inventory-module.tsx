'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useEspacios } from '@/contexts/espacios-context'
import { suscribirProductos, crearProducto, editarProducto, desactivarProducto, type Producto } from '@/lib/productos-service'
import { suscribirInsumos, crearInsumo, editarInsumo, desactivarInsumo, type Insumo } from '@/lib/insumos-service'
import { suscribirConsignadores, type Consignador } from '@/lib/consignadores-service'
import { sugerirIconoBasadoEnNombre } from '@/lib/ai-icons'
import { storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
 Plus,
 Search,
 Edit2,
 Trash2,
 Package,
 Beaker,
 AlertTriangle,
 CheckCircle,
 AlertCircle,
 History,
 RotateCcw,
 Loader2,
 Upload,
 X,
 ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { 
 formatCurrency,
 calculateMargin
} from '@/lib/demo-data'
import { DynamicIcon } from '@/components/ui/dynamic-icon'
import { IconPicker } from '@/components/ui/icon-picker'
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
} from '@/components/ui/sheet'
import { KardexVista } from '@/components/pos/kardex-vista'
import { useKardex } from '@/hooks/use-kardex'
import { type ArticuloTipo } from '@/lib/inventario-ledger'

const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const PRODUCT_IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function getProductImageExtension(file: File) {
 const extensionFromName = file.name.split('.').pop()?.toLowerCase()
 if (extensionFromName && /^[a-z0-9]+$/.test(extensionFromName)) return extensionFromName
 return file.type.split('/')[1] || 'jpg'
}

export function InventoryModule() {
 const [activeTab, setActiveTab] = useState('products')
 const [searchTerm, setSearchTerm] = useState('')
 const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos')
 const [showProductDialog, setShowProductDialog] = useState(false)
 const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null)
 const [showIngredientDialog, setShowIngredientDialog] = useState(false)
 const [insumoAEditar, setInsumoAEditar] = useState<Insumo | null>(null)
 const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'producto' | 'insumo' } | null>(null)

 // Datos reales de Firestore
 const { espacioActivo, categorias, cargandoEspacios } = useEspacios()
 const [productos, setProductos] = useState<Producto[]>([])
 const [insumos, setInsumos] = useState<Insumo[]>([])
 const [cargandoProductos, setCargandoProductos] = useState(true)
 const [cargandoInsumos, setCargandoInsumos] = useState(true)
 const [consignadores, setConsignadores] = useState<Consignador[]>([])

 const esConsignacion = espacioActivo?.nombre.toLowerCase().includes('consign') ?? false
 const esAlquiler = espacioActivo?.nombre.toLowerCase().includes('alquiler') ?? false
 const esFotocopia = espacioActivo?.nombre.toLowerCase().includes('fotocopia') ?? false
 const esCafeteria = espacioActivo?.nombre.toLowerCase().includes('cafeter') ?? false
 const esAlquilerOFoto = esAlquiler || esFotocopia

 // ── Kardex Sheet ──────────────────────────────────────────────────────────
 const [kardexArticulo, setKardexArticulo] = useState<{
  tipo: ArticuloTipo
  id: string
  nombre: string
  stock: number
  unidad: string
 } | null>(null)
 const kardex = useKardex(kardexArticulo)

 // Form states Insumo
 const [nuevoInsumoNombre, setNuevoInsumoNombre] = useState('')
 const [nuevoInsumoUnidad, setNuevoInsumoUnidad] = useState('g')
 const [nuevoInsumoCosto, setNuevoInsumoCosto] = useState('')
 const [nuevoInsumoStock, setNuevoInsumoStock] = useState('')

 useEffect(() => {
 if (!espacioActivo) {
 setProductos([])
 setInsumos([])
 setCargandoProductos(false)
 setCargandoInsumos(false)
 return
 }
 setCargandoProductos(true)
 setCargandoInsumos(true)
 
 const unsubProd = suscribirProductos(espacioActivo.id, (nuevos) => {
 setProductos(nuevos)
 setCargandoProductos(false)
 })
 
 const unsubIns = suscribirInsumos(espacioActivo.id, (nuevos) => {
 setInsumos(nuevos)
 setCargandoInsumos(false)
 })
 
 return () => {
 unsubProd()
 unsubIns()
 }
 }, [espacioActivo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

 // Suscribir consignadores (solo se usa si el espacio es consignación)
 useEffect(() => {
 return suscribirConsignadores(setConsignadores)
 }, [])

 const filteredProducts = productos.filter(p => {
 const matchSearch =
 p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
 p.id.includes(searchTerm)
 const matchCategory =
 categoriaFiltro === 'todos' || p.categoriaId === categoriaFiltro
 return matchSearch && matchCategory
 })

 const filteredInsumos = insumos.filter(i => 
 i.nombre.toLowerCase().includes(searchTerm.toLowerCase())
 )

 const handleCrearInsumo = async () => {
 if (!espacioActivo || !nuevoInsumoNombre || !nuevoInsumoCosto) return
 
 const stock = parseFloat(nuevoInsumoStock) || 0;
 const costoTotal = parseFloat(nuevoInsumoCosto) || 0;
 const costoUnitario = stock > 0 ? costoTotal / stock : costoTotal;

 setShowIngredientDialog(false)

 const data = {
 nombre: nuevoInsumoNombre,
 unidadMedida: nuevoInsumoUnidad,
 costo: costoUnitario,
 stock: stock,
 stockMinimo: 5,
 espacioId: espacioActivo.id,
 activo: true
 }

 if (insumoAEditar) {
 await editarInsumo(insumoAEditar.id, data)
 toast.success('Insumo actualizado')
 } else {
 await crearInsumo(data)
 toast.success('Insumo creado')
 }
 }

 useEffect(() => {
 if (showIngredientDialog && insumoAEditar) {
 setNuevoInsumoNombre(insumoAEditar.nombre)
 setNuevoInsumoUnidad(insumoAEditar.unidadMedida)
 setNuevoInsumoCosto(String(insumoAEditar.costo * insumoAEditar.stock))
 setNuevoInsumoStock(String(insumoAEditar.stock))
 } else if (!showIngredientDialog) {
 setNuevoInsumoNombre('')
 setNuevoInsumoUnidad('g')
 setNuevoInsumoCosto('')
 setNuevoInsumoStock('')
 setTimeout(() => setInsumoAEditar(null), 200)
 }
 }, [showIngredientDialog, insumoAEditar])

 const handleDeleteProducto = (id: string) => {
 setItemToDelete({ id, type: 'producto' })
 }

 const handleDeleteInsumo = (id: string) => {
 setItemToDelete({ id, type: 'insumo' })
 }

 const confirmarEliminar = async () => {
 if (!itemToDelete) return
 if (itemToDelete.type === 'producto') {
 await desactivarProducto(itemToDelete.id)
 } else {
 await desactivarInsumo(itemToDelete.id)
 }
 setItemToDelete(null)
 }

 const getStockStatusIcon = (status: string) => {
 switch (status) {
 case 'ok':
 return <CheckCircle className="h-4 w-4 text-success" />
 case 'low':
 return <AlertTriangle className="h-4 w-4 text-warning" />
 case 'critical':
 return <AlertCircle className="h-4 w-4 text-destructive" />
 default:
 return null
 }
 }

 const getStockStatusBadge = (status: string) => {
 switch (status) {
 case 'ok':
 return <Badge className="bg-success/20 text-success border-success/30">OK</Badge>
 case 'low':
 return <Badge className="bg-warning/20 text-warning border-warning/30">Bajo</Badge>
 case 'critical':
 return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Crítico</Badge>
 default:
 return null
 }
 }

 return (
 <div className="flex flex-col h-full p-4 gap-4">
 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-[2rem] border border-border/50 shadow-sm">
 <div>
 <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
 Inventario 
 {espacioActivo && (
 <div className="flex items-center justify-center h-10 w-10 shadow-inner" style={{ backgroundColor: `${espacioActivo.color}20` }}>
 <span style={{ color: espacioActivo.color }}><DynamicIcon name={espacioActivo.icono} className="h-6 w-6" /></span>
 </div>
 )}
 </h1>
 <p className="text-muted-foreground font-medium mt-1">
 {espacioActivo ? `Gestionando productos de ${espacioActivo.nombre}` : 'Cargando espacio...'}
 </p>
 </div>
 <div className="flex items-center gap-3 w-full md:w-auto">
 {/* Filtro por categoría */}
 <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
 <SelectTrigger className="w-full md:w-48 bg-background border-border/50 h-12 shadow-sm focus:ring-primary/50 font-medium">
 <SelectValue placeholder="Categoría" />
 </SelectTrigger>
 <SelectContent className="border-border/50">
 <SelectItem value="todos" className="">Todas las categorías</SelectItem>
 {categorias.map(cat => (
 <SelectItem key={cat.id} value={cat.id} className="">
 <div className="flex items-center gap-2">
 <DynamicIcon name={cat.icono} className="h-4 w-4" /> 
 <span>{cat.nombre}</span>
 </div>
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="relative w-full md:w-auto">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Buscar..."
 className="pl-10 w-full md:w-72 bg-background border-border/50 h-12 shadow-sm focus:ring-primary/50 font-medium transition-all"
 />
 </div>
 </div>
 </div>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
 {esCafeteria && (
 <div className="px-1 mt-2">
 <TabsList className="bg-secondary/40 p-1.5 border border-border/30 inline-flex shadow-inner">
 <TabsTrigger value="products" className="px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 font-bold transition-all">
 <Package className="h-4 w-4" />
 Productos
 </TabsTrigger>
 <TabsTrigger value="ingredients" className="px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 font-bold transition-all">
 <Beaker className="h-4 w-4" />
 Insumos / Ingredientes
 </TabsTrigger>
 </TabsList>
 </div>
 )}

 {/* Products Tab */}
 <TabsContent value="products" className="flex-1 mt-6 animate-fade-in">
 <Card className="bg-card h-full flex flex-col border-border/50 rounded-[2rem] shadow-lg overflow-hidden">
 <div className="flex justify-between items-center p-5 border-b border-border/50">
 <h3 className="font-bold tracking-tight text-xl flex items-center gap-2 text-foreground">
 <Package className="h-6 w-6 text-primary" />
 {esConsignacion ? 'Productos en Consignación' : esAlquiler ? 'Tiempos de Alquiler' : esAlquilerOFoto ? 'Servicios de Fotografía' : 'Tus Productos'}
 </h3>
 <Button onClick={() => { setProductoAEditar(null); setShowProductDialog(true); }} className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 shadow-lg transition-all ">
 <Plus className="h-5 w-5 mr-2" />
 Nuevo Producto
 </Button>
 </div>
 <CardContent className="flex-1 p-0 overflow-auto">
 {(cargandoProductos || cargandoEspacios) ? (
 <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
 <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
 <p className="text-sm">Cargando productos...</p>
 </div>
 ) : filteredProducts.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
 <DynamicIcon name={espacioActivo?.icono ?? 'Package'} className="h-10 w-10 opacity-50" />
 <p className="text-sm">No hay productos en este espacio</p>
 </div>
 ) : (
 <Table>
 <TableHeader className="bg-secondary/20">
 <TableRow className="border-border/50 hover:bg-transparent">
 <TableHead className="text-muted-foreground font-bold h-12">Producto</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12">Categoría</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">{esAlquiler ? 'Precio/Hora' : 'Precio'}</TableHead>
 {!esAlquilerOFoto && (
 <>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Costo</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Margen</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Stock</TableHead>
 </>
 )}
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Acciones</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredProducts.map((product, idx) => {
 const margin = calculateMargin(product.precio, product.costo)
 const cat = categorias.find(c => c.id === product.categoriaId)
 return (
 <TableRow 
 key={product.id} 
 className="border-border/50 hover:bg-secondary/40 transition-colors group"
 >
 <TableCell className="py-4">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 bg-background border border-border/50 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
 {product.imagenUrl ? (
 <img src={product.imagenUrl} alt={product.nombre} className="h-full w-full object-cover" />
 ) : (
 <DynamicIcon name={product.icono ?? 'Package'} className="h-6 w-6 text-muted-foreground" />
 )}
 </div>
 <span className="font-bold text-foreground text-[15px]">{product.nombre}</span>
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="outline" className="text-xs bg-background rounded-lg border-border/50 flex items-center gap-1 w-fit py-1 px-2 font-semibold">
 <DynamicIcon name={cat?.icono} className="h-3.5 w-3.5 opacity-70" />
 {cat?.nombre ?? product.categoriaId}
 </Badge>
 </TableCell>
 <TableCell className="text-right font-black text-primary text-[15px]">
 {formatCurrency(product.precio)} {esAlquiler && <span className="text-xs text-muted-foreground font-normal">/hr</span>}
 </TableCell>
 {!esAlquilerOFoto && (
 <>
 <TableCell className="text-right text-muted-foreground font-medium">
 {formatCurrency(product.costo)}
 </TableCell>
 <TableCell className="text-right">
 <Badge className={cn(
 "font-bold rounded-lg px-2 py-0.5 shadow-sm",
 margin >= 50 ? "bg-success text-success-foreground hover:bg-success/90" : "bg-warning text-warning-foreground hover:bg-warning/90"
 )}>
 {margin}%
 </Badge>
 </TableCell>
 <TableCell className="text-right">
 <Badge className={cn(
 "rounded-lg px-2.5 py-0.5 font-bold shadow-sm",
 product.stock <= (product.stockMinimo || 5) 
 ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
 : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
 )}>
 {product.stock}
 </Badge>
 </TableCell>
 </>
 )}
 <TableCell className="text-right">
 <div className="flex items-center justify-end gap-2">
 <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" onClick={() => { setProductoAEditar(product); setShowProductDialog(true); }}>
 <Edit2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
 onClick={() => handleDeleteProducto(product.id)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
 title="Ver movimientos"
 onClick={() => setKardexArticulo({ tipo: 'producto', id: product.id, nombre: product.nombre, stock: product.stock, unidad: 'und' })}
 >
 <History className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 )
 })}
 </TableBody>
 </Table>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* Ingredients Tab */}
 <TabsContent value="ingredients" className="flex-1 mt-6 animate-fade-in">
 <Card className="bg-card h-full flex flex-col border-border/50 rounded-[2rem] shadow-lg overflow-hidden">
 <div className="flex justify-between items-center p-5 border-b border-border/50">
 <h3 className="font-bold tracking-tight text-xl flex items-center gap-2 text-foreground">
 <Beaker className="h-6 w-6 text-primary" />
 Ingredientes y Materia Prima
 </h3>
 <Button onClick={() => { setInsumoAEditar(null); setShowIngredientDialog(true); }} className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 shadow-lg transition-all ">
 <Plus className="h-5 w-5 mr-2" />
 Nuevo Insumo
 </Button>
 </div>
 <CardContent className="flex-1 p-0 overflow-auto">
 {(cargandoInsumos || cargandoEspacios) ? (
 <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
 <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
 <p className="text-sm">Cargando insumos...</p>
 </div>
 ) : filteredInsumos.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
 <Beaker className="h-12 w-12 text-muted-foreground" />
 <p className="text-sm">No hay insumos registrados en este espacio</p>
 </div>
 ) : (
 <Table>
 <TableHeader className="bg-secondary/20">
 <TableRow className="border-border/50 hover:bg-transparent">
 <TableHead className="text-muted-foreground font-bold h-12">Insumo</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Stock Actual</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12">Unidad</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Costo Unitario</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-center">Estado</TableHead>
 <TableHead className="text-muted-foreground font-bold h-12 text-right">Acciones</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredInsumos.map((insumo, idx) => {
 const status = insumo.stock > (insumo.stockMinimo || 5) ? 'ok' : insumo.stock > 0 ? 'low' : 'critical';
 return (
 <TableRow 
 key={insumo.id} 
 className="border-border/50 hover:bg-secondary/40 transition-colors group"
 >
 <TableCell className="py-4">
 <div className="flex items-center gap-3">
 <div className={cn(
 "w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-sm",
 status === 'ok' ? "bg-success/10 text-success" : status === 'low' ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
 )}>
 {getStockStatusIcon(status)}
 </div>
 <span className="font-bold text-foreground text-[15px]">{insumo.nombre}</span>
 </div>
 </TableCell>
 <TableCell className="text-right font-black text-primary text-[15px]">
 {insumo.stock.toLocaleString()}
 </TableCell>
 <TableCell className="text-muted-foreground font-medium">{insumo.unidadMedida}</TableCell>
 <TableCell className="text-right text-muted-foreground font-medium">
 {formatCurrency(insumo.costo)} <span className="text-[11px] opacity-60">/ {insumo.unidadMedida}</span>
 </TableCell>
 <TableCell className="text-center">
 {getStockStatusBadge(status)}
 </TableCell>
 <TableCell className="text-right">
 <div className="flex items-center justify-end gap-2">
 <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" onClick={() => { setInsumoAEditar(insumo); setShowIngredientDialog(true); }}>
 <Edit2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
 onClick={() => handleDeleteInsumo(insumo.id)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
 title="Ver movimientos"
 onClick={() => setKardexArticulo({ tipo: 'insumo', id: insumo.id, nombre: insumo.nombre, stock: insumo.stock, unidad: insumo.unidadMedida })}
 >
 <History className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 )
 })}
 </TableBody>
 </Table>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {/* New Product Dialog */}
 <NuevoProductoDialog
 open={showProductDialog}
 onOpenChange={setShowProductDialog}
 espacioActivo={espacioActivo}
 categorias={categorias}
 consignadores={consignadores}
 esConsignacion={esConsignacion}
 esAlquiler={esAlquiler}
 esAlquilerOFoto={esAlquilerOFoto}
 productoAEditar={productoAEditar}
 />

 {/* New Ingredient Dialog */}
 <Dialog open={showIngredientDialog} onOpenChange={setShowIngredientDialog}>
 <DialogContent className="theme-pos bg-background border-border max-w-lg p-0 gap-0 overflow-hidden sm:">
 <div className="p-6 border-b border-border/50">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold text-foreground">{insumoAEditar ? 'Editar Insumo' : 'Nuevo Insumo'}</DialogTitle>
 <DialogDescription className="text-muted-foreground mt-1">
 {insumoAEditar ? 'Modifica los datos del insumo' : 'Agrega un nuevo insumo o ingrediente'}
 </DialogDescription>
 </DialogHeader>
 </div>
 <div className="grid gap-5 px-6 py-5">
 <div className="grid grid-cols-4 items-center gap-4">
 <Label className="text-right text-sm font-medium">Nombre</Label>
 <Input 
 className="col-span-3 bg-background/50 focus:bg-background transition-colors" 
 placeholder="Nombre del insumo" 
 value={nuevoInsumoNombre}
 onChange={(e) => setNuevoInsumoNombre(e.target.value)}
 />
 </div>
 <div className="grid grid-cols-4 items-center gap-4">
 <Label className="text-right text-sm font-medium">Unidad</Label>
 <Select value={nuevoInsumoUnidad} onValueChange={setNuevoInsumoUnidad}>
 <SelectTrigger className="col-span-3 bg-background/50 focus:bg-background transition-colors">
 <SelectValue placeholder="Seleccionar unidad" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="g">Gramos (g)</SelectItem>
 <SelectItem value="kg">Kilogramos (kg)</SelectItem>
 <SelectItem value="ml">Mililitros (ml)</SelectItem>
 <SelectItem value="L">Litros (L)</SelectItem>
 <SelectItem value="und">Unidades (und)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="grid grid-cols-4 items-center gap-4">
 <Label className="text-right text-sm font-medium">Cantidad Inicial</Label>
 <div className="col-span-3 relative">
 <Input 
 type="number" 
 className="bg-background/50 focus:bg-background transition-colors pr-12" 
 placeholder="Ej: 1000" 
 value={nuevoInsumoStock}
 onChange={(e) => setNuevoInsumoStock(e.target.value)}
 />
 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
 {nuevoInsumoUnidad}
 </span>
 </div>
 </div>
 <div className="grid grid-cols-4 items-center gap-4">
 <Label className="text-right text-sm font-medium">Costo Total</Label>
 <div className="col-span-3 relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
 $
 </span>
 <Input 
 type="text"
 inputMode="numeric"
 className="bg-background/50 focus:bg-background transition-colors pl-7" 
 placeholder="Costo total de este stock" 
 value={nuevoInsumoCosto ? new Intl.NumberFormat('es-CO').format(parseInt(nuevoInsumoCosto, 10)) : ''}
 onChange={(e) => {
 const rawValue = e.target.value.replace(/\D/g, '')
 setNuevoInsumoCosto(rawValue)
 }}
 />
 </div>
 </div>
 </div>
 <div className="p-6 pt-4 border-t border-border/50 ">
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowIngredientDialog(false)} className="">
 Cancelar
 </Button>
 <Button onClick={handleCrearInsumo} className="bg-primary text-primary-foreground shadow-lg transition-all">
 {insumoAEditar ? 'Guardar Cambios' : 'Guardar Insumo'}
 </Button>
 </DialogFooter>
 </div>
 </DialogContent>
 </Dialog>

 <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
 <AlertDialogContent className="theme-pos bg-card text-card-foreground border-border">
 <AlertDialogHeader>
 <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
 <AlertDialogDescription>
 Esta acción no se puede deshacer. Se eliminará el {itemToDelete?.type} de la base de datos.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={confirmarEliminar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
 Eliminar
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* ── Kardex Sheet ── */}
 <Sheet open={kardexArticulo !== null} onOpenChange={(open) => { if (!open) setKardexArticulo(null) }}>
  <SheetContent side="right" className="sm:max-w-4xl p-0 flex flex-col">
   <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50 flex-shrink-0">
    <SheetTitle className="text-base font-bold truncate">
     Movimientos — {kardexArticulo?.nombre ?? ''}
    </SheetTitle>
   </SheetHeader>
   {kardexArticulo !== null && (
    <div className="flex-1 min-h-0 overflow-hidden">
     {kardex.error ? (
      <div className="flex flex-col items-center justify-center py-16 gap-3 px-6" role="alert">
       <AlertCircle className="h-8 w-8 text-destructive/60" aria-hidden="true" />
       <div className="text-center space-y-1">
        <p className="text-sm font-medium text-destructive">Error al cargar movimientos</p>
        <p className="text-xs text-muted-foreground">{kardex.error}</p>
       </div>
       <Button
        variant="outline"
        size="sm"
        className="gap-2 mt-1"
        onClick={kardex.recargar}
       >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Reintentar
       </Button>
      </div>
     ) : !kardex.pagina || !kardex.diagnostico ? (
      <div
       className="flex items-center justify-center py-16 text-muted-foreground text-sm"
       role="status"
       aria-label="Cargando movimientos"
      >
       <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mr-3" aria-hidden="true" />
       Cargando movimientos…
      </div>
     ) : (
      <KardexVista
       pagina={kardex.pagina}
       diagnostico={kardex.diagnostico}
       filtros={kardex.filtros}
       onFiltrosChange={kardex.setFiltros}
       orden={kardex.orden}
       onCambiarOrden={kardex.cambiarOrden}
       hasPrev={kardex.hasPrev}
       onSiguiente={kardex.irSiguiente}
       onAnterior={kardex.irAnterior}
       cargando={kardex.cargando}
       nombreFallback={kardexArticulo.nombre}
       numeroPagina={kardex.numeroPagina}
      />
     )}
    </div>
   )}
  </SheetContent>
 </Sheet>
 </div>
 )
}

function NuevoProductoDialog({
 open,
 onOpenChange,
 espacioActivo,
 categorias,
 consignadores,
 esConsignacion,
 esAlquiler,
 esAlquilerOFoto,
 productoAEditar
}: any) {
 const [nuevoProdNombre, setNuevoProdNombre] = useState('')
 const [nuevoProdCodigo, setNuevoProdCodigo] = useState('')
 const [nuevoProdPrecio, setNuevoProdPrecio] = useState('')
 const [nuevoProdPrecioMinuto, setNuevoProdPrecioMinuto] = useState('')
 const [nuevoProdCategoria, setNuevoProdCategoria] = useState('')
 const [nuevoProdIcono, setNuevoProdIcono] = useState('Package')
 const [nuevoProdIva, setNuevoProdIva] = useState('19')
 const [prodConsignadorId, setProdConsignadorId] = useState('')
 const [prodStockInicial, setProdStockInicial] = useState('')
 const [imagenArchivo, setImagenArchivo] = useState<File | null>(null)
 const [imagenPreviewUrl, setImagenPreviewUrl] = useState('')
 const [imagenRemovida, setImagenRemovida] = useState(false)
 const [guardandoProducto, setGuardandoProducto] = useState(false)
 const imagenInputRef = useRef<HTMLInputElement>(null)

 useEffect(() => {
 if (open && productoAEditar) {
 setNuevoProdNombre(productoAEditar.nombre)
 setNuevoProdCodigo(productoAEditar.codigo || '')
 setNuevoProdPrecio(String(productoAEditar.precio))
 setNuevoProdPrecioMinuto(productoAEditar.precioFraccion ? String(productoAEditar.precioFraccion) : '')
 setNuevoProdCategoria(productoAEditar.categoriaId)
 setNuevoProdIcono(productoAEditar.icono || 'Package')
 setNuevoProdIva(String(productoAEditar.iva || 19))
 if (productoAEditar.consignadorId) {
 setProdConsignadorId(productoAEditar.consignadorId)
 }
 setProdStockInicial(String(productoAEditar.stock))
 setImagenArchivo(null)
 setImagenPreviewUrl(productoAEditar.imagenUrl || '')
 setImagenRemovida(false)
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 } else if (open) {
 setImagenArchivo(null)
 setImagenPreviewUrl('')
 setImagenRemovida(false)
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 } else if (!open) {
 setTimeout(() => {
 setNuevoProdNombre('')
 setNuevoProdCodigo('')
 setNuevoProdPrecio('')
 setNuevoProdPrecioMinuto('')
 setNuevoProdCategoria('')
 setNuevoProdIcono('Package')
 setNuevoProdIva('19')
 setProdConsignadorId('')
 setProdStockInicial('')
 setImagenArchivo(null)
 setImagenPreviewUrl('')
 setImagenRemovida(false)
 setGuardandoProducto(false)
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 }, 200)
 }
 }, [open, productoAEditar])

 useEffect(() => {
 return () => {
 if (imagenPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagenPreviewUrl)
 }
 }, [imagenPreviewUrl])

 const handleSeleccionarImagen = (event: ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0]
 if (!file) return

 if (!PRODUCT_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
 toast.error('Selecciona una imagen JPG, PNG, WebP o GIF')
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 return
 }

 if (file.size <= 0) {
 toast.error('La imagen seleccionada está vacía')
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 return
 }

 if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
 toast.error('La imagen no puede superar 5MB')
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 return
 }

 setImagenArchivo(file)
 setImagenPreviewUrl(URL.createObjectURL(file))
 setImagenRemovida(false)
 }

 const handleQuitarImagen = () => {
 setImagenArchivo(null)
 setImagenPreviewUrl('')
 setImagenRemovida(true)
 if (imagenInputRef.current) imagenInputRef.current.value = ''
 }

 const subirImagenProducto = async (file: File, espacioId: string) => {
 const extension = getProductImageExtension(file)
 const fileRef = ref(storage, `productos/${espacioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`)
 await uploadBytes(fileRef, file, { contentType: file.type })
 return getDownloadURL(fileRef)
 }

 const handleCrearProducto = async () => {
 if (guardandoProducto) return
 if (!espacioActivo || !nuevoProdNombre || !nuevoProdPrecio || !nuevoProdCategoria) {
 toast.error('Completa nombre, precio y categoria')
 return
 }
 
 const precio = parseFloat(nuevoProdPrecio) || 0
 const precioMinuto = parseFloat(nuevoProdPrecioMinuto) || 0
 const stockInicialNum = parseFloat(prodStockInicial) || 0

 setGuardandoProducto(true)

 try {
 let imagenUrl: string | null = imagenRemovida ? null : (productoAEditar?.imagenUrl || null)
 if (imagenArchivo) {
 imagenUrl = await subirImagenProducto(imagenArchivo, espacioActivo.id)
 }

 const productData: any = {
 nombre: nuevoProdNombre,
 precio: precio,
 categoriaId: nuevoProdCategoria,
 espacioId: espacioActivo.id,
 icono: nuevoProdIcono,
 imagenUrl,
 ...(nuevoProdCodigo ? { codigo: nuevoProdCodigo } : {}),
 ...(nuevoProdIva ? { iva: parseFloat(nuevoProdIva) || 0 } : {}),
 ...(precioMinuto > 0 ? { precioFraccion: precioMinuto } : {})
 }

  if (productoAEditar) {
  if (esConsignacion) {
  productData.consignadorId = prodConsignadorId
  productData.stockInicial = stockInicialNum
  }
  productData.stock = stockInicialNum
  await editarProducto(productoAEditar.id, productData)
  toast.success('Producto actualizado')
  } else {
  productData.costo = 0
  productData.stock = stockInicialNum || 0
  productData.stockMinimo = 5
  productData.activo = true
  productData.descripcion = ''
  productData.unidad = 'und'
  if (esConsignacion) {
  productData.consignadorId = prodConsignadorId
  productData.stockInicial = stockInicialNum
  }
  await crearProducto(productData)
  toast.success('Producto creado')
  }
  onOpenChange(false)
 } catch (error: any) {
 toast.error(error?.message || 'No se pudo guardar el producto')
 } finally {
 setGuardandoProducto(false)
 }
 }

 return (
 <Dialog open={open} onOpenChange={(nextOpen) => { if (!guardandoProducto) onOpenChange(nextOpen) }}>
 <DialogContent className="theme-pos bg-background border-border max-w-lg p-0 gap-0 overflow-hidden sm:">
 <div className="p-6 border-b border-border/50">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold text-foreground">{productoAEditar ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
 <DialogDescription className="text-muted-foreground mt-1">
 {productoAEditar ? 'Modifica los datos del producto' : 'Agrega un nuevo producto al inventario'}
 </DialogDescription>
 </DialogHeader>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-6 py-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
 <div className="space-y-1.5 sm:col-span-2">
 <Label className="text-sm font-medium">Nombre</Label>
 <Input 
 className="bg-background/50 focus:bg-background transition-colors" 
 placeholder="Nombre del producto" 
 value={nuevoProdNombre} 
 onChange={e => {
 const val = e.target.value;
 setNuevoProdNombre(val);
 const sugerencia = sugerirIconoBasadoEnNombre(val);
 if (sugerencia) {
 setNuevoProdIcono(sugerencia);
 }
 }} 
 />
 </div>
 
 {!esAlquilerOFoto && (
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">Código (Opcional)</Label>
 <Input className="bg-background/50 focus:bg-background transition-colors" placeholder="Ej: CAFE-001 o Código de barras" value={nuevoProdCodigo} onChange={e => setNuevoProdCodigo(e.target.value)} />
 </div>
 )}
 
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">{esAlquiler ? 'Precio por Hora' : 'Precio'}</Label>
 <Input type="text" className="bg-background/50 focus:bg-background transition-colors" placeholder="0" value={nuevoProdPrecio ? new Intl.NumberFormat('es-CO').format(parseInt(nuevoProdPrecio, 10)) : ''} onChange={e => setNuevoProdPrecio(e.target.value.replace(/\D/g, ''))} />
 </div>

 {esAlquiler && (
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">Precio por Minuto (Opcional)</Label>
 <Input type="text" className="bg-background/50 focus:bg-background transition-colors" placeholder="Ej: 100" value={nuevoProdPrecioMinuto ? new Intl.NumberFormat('es-CO').format(parseInt(nuevoProdPrecioMinuto, 10)) : ''} onChange={e => setNuevoProdPrecioMinuto(e.target.value.replace(/\D/g, ''))} />
 </div>
 )}
 
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">Categoría</Label>
 <Select value={nuevoProdCategoria} onValueChange={setNuevoProdCategoria}>
 <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
 <SelectValue placeholder="Seleccionar" />
 </SelectTrigger>
 <SelectContent>
 {categorias.map((cat: any) => (
 <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-2 sm:col-span-2">
 <Label className="text-sm font-medium">Imagen (Opcional)</Label>
 <input
 ref={imagenInputRef}
 type="file"
 accept="image/jpeg,image/png,image/webp,image/gif"
 className="hidden"
 onChange={handleSeleccionarImagen}
 disabled={guardandoProducto}
 />
 {imagenPreviewUrl ? (
 <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
 <div className="h-20 w-20 overflow-hidden rounded-lg border border-border/50 bg-secondary/40 flex-shrink-0">
 <img src={imagenPreviewUrl} alt="Vista previa del producto" className="h-full w-full object-cover" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-foreground">
 {imagenArchivo?.name || 'Imagen actual'}
 </p>
 <p className="text-xs text-muted-foreground">JPG, PNG, WebP o GIF. Max 5MB.</p>
 <div className="mt-2 flex flex-wrap gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="gap-2"
 onClick={() => imagenInputRef.current?.click()}
 disabled={guardandoProducto}
 >
 <Upload className="h-3.5 w-3.5" />
 Cambiar
 </Button>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="gap-2 text-destructive hover:text-destructive"
 onClick={handleQuitarImagen}
 disabled={guardandoProducto}
 >
 <X className="h-3.5 w-3.5" />
 Quitar
 </Button>
 </div>
 </div>
 </div>
 ) : (
 <Button
 type="button"
 variant="outline"
 className="h-20 w-full border-dashed gap-2 text-muted-foreground"
 onClick={() => imagenInputRef.current?.click()}
 disabled={guardandoProducto}
 >
 <ImageIcon className="h-5 w-5" />
 Seleccionar imagen
 </Button>
 )}
 </div>

 {!esAlquilerOFoto && (
 <>
 <div className="grid gap-2 col-span-1">
 <Label className="text-sm font-medium">Ícono (Selecciona uno)</Label>
 <IconPicker 
 value={nuevoProdIcono} 
 onChange={setNuevoProdIcono} 
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">IVA %</Label>
 <Input type="number" className="bg-background/50 focus:bg-background transition-colors" value={nuevoProdIva} onChange={e => setNuevoProdIva(e.target.value)} />
 </div>
 </>
 )}

  {esConsignacion && (
  <div className="sm:col-span-2 mt-2 space-y-4">
  <div className="border-t border-border pt-4">
  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">🤝 Datos de Consignación</p>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div className="space-y-1.5">
  <Label className="text-sm font-medium">Consignador</Label>
  <Select value={prodConsignadorId} onValueChange={setProdConsignadorId}>
  <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
  <SelectValue placeholder="Seleccionar" />
  </SelectTrigger>
  <SelectContent>
  {consignadores.map((c: any) => (
  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
  ))}
  </SelectContent>
  </Select>
  </div>
  </div>
  </div>
  )}

  {!esAlquilerOFoto && (
  <div className="space-y-1.5">
  <Label className="text-sm font-medium">Stock {productoAEditar ? 'actual' : 'inicial'}</Label>
  <Input
  type="number"
  className="bg-background/50 focus:bg-background transition-colors"
  placeholder="Cantidad disponible"
  value={prodStockInicial}
  onChange={e => setProdStockInicial(e.target.value)}
  />
  </div>
  )}
 </div>
 <div className="p-6 pt-4 border-t border-border/50 ">
 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardandoProducto} className="">
 Cancelar
 </Button>
 <Button className="bg-primary text-primary-foreground shadow-lg transition-all" onClick={handleCrearProducto} disabled={guardandoProducto}>
 {guardandoProducto ? (
 <>
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 Guardando...
 </>
 ) : productoAEditar ? 'Guardar Cambios' : 'Guardar Producto'}
 </Button>
 </DialogFooter>
 </div>
 </DialogContent>
 </Dialog>
 )
}
