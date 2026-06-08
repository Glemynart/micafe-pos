'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
 Plus, Search, Edit2, Trash2, ChefHat, AlertTriangle, Package, Beaker
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'

import { useEspacios } from '@/contexts/espacios-context'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { suscribirRecetas, guardarReceta, eliminarReceta, type Receta, type Ingrediente } from '@/lib/recetas-service'

const formatCurrency = (val: number) => 
 new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val)

export function RecipesModule() {
 const [searchTerm, setSearchTerm] = useState('')
 const [showRecipeDialog, setShowRecipeDialog] = useState(false)
 const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null)
 const [showProductionDialog, setShowProductionDialog] = useState(false)
 
 // Data from Firestore
 const { espacioActivo } = useEspacios()
 const [productos, setProductos] = useState<Producto[]>([])
 const [insumos, setInsumos] = useState<Insumo[]>([])
 const [recetas, setRecetas] = useState<Receta[]>([])
 const [selectedRecipe, setSelectedRecipe] = useState<Receta | null>(null)

 // Form state
 const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
 const [formProductoId, setFormProductoId] = useState('')
 const [formIngredientes, setFormIngredientes] = useState<Ingrediente[]>([])

 useEffect(() => {
 return suscribirRecetas(setRecetas)
 }, [])

 useEffect(() => {
 if (!espacioActivo) return
 const unsubProd = suscribirProductos(espacioActivo.id, setProductos)
 const unsubIns = suscribirInsumos(espacioActivo.id, setInsumos)
 return () => { unsubProd(); unsubIns() }
 }, [espacioActivo?.id])

 // Map recipes to include product and ingredient names for the UI
 const recetasMapeadas = useMemo(() => {
 return recetas.map(receta => {
 const producto = productos.find(p => p.id === receta.productoId)
 const ingredientes = receta.ingredientes.map(ing => {
 const insumo = insumos.find(i => i.id === ing.insumoId)
 return {
 ...ing,
 insumoNombre: insumo?.nombre || 'Desconocido',
 unidad: insumo?.unidadMedida || '',
 costoUnitario: insumo?.costo || 0,
 stock: insumo?.stock || 0
 }
 })
 
 const costoTotal = ingredientes.reduce((acc, ing) => acc + (ing.costoUnitario * ing.cantidad), 0)

 return {
 ...receta,
 productoNombre: producto?.nombre || 'Producto eliminado',
 precioSugerido: producto?.precio || 0,
 ingredientes,
 costoTotal
 }
 }).filter(r => r.productoNombre.toLowerCase().includes(searchTerm.toLowerCase()))
 }, [recetas, productos, insumos, searchTerm])

 const getMinProduction = (recetaExt: typeof recetasMapeadas[0]) => {
 let minProduction = Infinity
 for (const ing of recetaExt.ingredientes) {
 if (ing.cantidad <= 0) continue
 const canProduce = Math.floor(ing.stock / ing.cantidad)
 if (canProduce < minProduction) minProduction = canProduce
 }
 return minProduction === Infinity ? 0 : minProduction
 }

 const handleOpenNewRecipe = () => {
 setEditingRecipeId(null)
 setFormProductoId('')
 setFormIngredientes([])
 setShowRecipeDialog(true)
 }

 const handleEditRecipe = (recetaExt: typeof recetasMapeadas[0]) => {
 setEditingRecipeId(recetaExt.id)
 setFormProductoId(recetaExt.productoId)
 setFormIngredientes(recetaExt.ingredientes.map(i => ({ insumoId: i.insumoId, cantidad: i.cantidad })))
 setShowRecipeDialog(true)
 }

 const handleDeleteRecipe = (id: string) => {
 setRecipeToDelete(id)
 }

 const confirmarEliminar = async () => {
 if (recipeToDelete) {
 await eliminarReceta(recipeToDelete)
 setRecipeToDelete(null)
 }
 }

 const handleSaveRecipe = async () => {
 if (!formProductoId) return alert('Selecciona un producto')
 if (formIngredientes.length === 0) return alert('Añade al menos un ingrediente')
 
 // Validar ingredientes
 if (formIngredientes.some(i => !i.insumoId || i.cantidad <= 0)) {
 return alert('Todos los ingredientes deben tener un insumo y cantidad mayor a 0')
 }

 // Optimistic UI: cerramos instantáneamente
 setShowRecipeDialog(false)
 
 // Guardamos en segundo plano
 guardarReceta(formProductoId, formIngredientes).catch(console.error)
 }

 // Costo en vivo del formulario
 const costoFormulario = formIngredientes.reduce((acc, ing) => {
 const ins = insumos.find(i => i.id === ing.insumoId)
 return acc + ((ins?.costo || 0) * ing.cantidad)
 }, 0)

 // Productos sin receta (para el dropdown de nueva receta)
 const productosSinReceta = productos.filter(p => !recetas.some(r => r.productoId === p.id))

 return (
 <div className="flex flex-col h-full p-4 gap-4">
 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-[2rem] border border-border/50 shadow-sm">
 <div>
 <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
 <div className="flex items-center justify-center h-10 w-10 bg-primary/10 shadow-inner">
 <ChefHat className="h-6 w-6 text-primary" />
 </div>
 Recetas
 </h1>
 <p className="text-muted-foreground font-medium mt-1">Gestiona las recetas y calcula costos automáticamente</p>
 </div>
 <div className="flex items-center gap-3 w-full md:w-auto">
 <div className="relative w-full md:w-auto">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Buscar recetas..."
 className="pl-10 w-full md:w-72 bg-background border-border/50 h-12 shadow-sm focus:ring-primary/50 font-medium transition-all"
 />
 </div>
 <Button onClick={handleOpenNewRecipe} className="h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 shadow-lg transition-all ">
 <Plus className="h-5 w-5 mr-2" />
 Nueva Receta
 </Button>
 </div>
 </div>

 {/* Recipes Grid */}
 <ScrollArea className="flex-1">
 {recetasMapeadas.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground bg-card/30 rounded-[2rem] border border-border/50 border-dashed mt-4">
 <div className="p-4 rounded-full bg-secondary/30">
 <ChefHat className="h-12 w-12 text-muted-foreground opacity-50" />
 </div>
 <p className="font-medium">No hay recetas configuradas en este espacio</p>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pr-4 mt-4 pb-10">
 {recetasMapeadas.map((recipe, idx) => {
 const production = getMinProduction(recipe)
 return (
 <Card 
 key={recipe.id}
 className="backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 rounded-[2rem] overflow-hidden group animate-fade-in flex flex-col"
 style={{ animationDelay: `${idx * 50}ms` }}
 >
 <CardHeader className="pb-4 bg-gradient-to-b from-secondary/20 ">
 <div className="flex items-start justify-between">
 <div>
 <CardTitle className="text-xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{recipe.productoNombre}</CardTitle>
 <CardDescription className="text-muted-foreground font-medium flex items-center gap-1.5">
 <Beaker className="h-3.5 w-3.5" />
 {recipe.ingredientes.length} ingredientes
 </CardDescription>
 </div>
  <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm p-1.5 shadow-sm border border-border/50 rounded-xl">
  <Button variant="ghost" size="icon" onClick={() => handleEditRecipe(recipe)} className="h-11 w-11 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 touch-target">
  <Edit2 className="h-5 w-5" />
  </Button>
  <Button variant="ghost" size="icon" onClick={() => handleDeleteRecipe(recipe.id)} className="h-11 w-11 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 touch-target">
  <Trash2 className="h-5 w-5" />
  </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-5 flex-1 flex flex-col">
  <div className="space-y-2.5 flex-1">
  {recipe.ingredientes.slice(0, 3).map((ing, i) => (
  <div key={i} className="flex items-center justify-between text-sm bg-secondary/20 px-3 py-2.5 rounded-lg">
  <span className="text-muted-foreground font-medium truncate pr-2">{ing.insumoNombre}</span>
  <span className="text-foreground font-bold shrink-0">{ing.cantidad} {ing.unidad}</span>
 </div>
 ))}
 {recipe.ingredientes.length > 3 && (
 <p className="text-xs text-muted-foreground text-center font-medium pt-1">+{recipe.ingredientes.length - 3} ingredientes más...</p>
 )}
 </div>

 <div className="pt-4 border-t border-border/50 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground font-medium">Costo Insumos</span>
 <span className="font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">{formatCurrency(recipe.costoTotal)}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground font-medium">Precio Venta</span>
 <span className="font-bold text-success bg-success/10 px-2 py-0.5 rounded-md">{formatCurrency(recipe.precioSugerido)}</span>
 </div>
 <div className="flex items-center justify-between pt-1">
 <span className="text-sm text-muted-foreground font-medium">Producción max.</span>
 <Badge 
 className={cn(
 "px-2.5 py-1 rounded-lg font-bold shadow-sm",
 production < 5 
 ? "bg-destructive text-destructive-foreground" 
 : production < 15 
 ? "bg-warning text-warning-foreground"
 : "bg-success text-success-foreground"
 )}
 >
 <Package className="h-3.5 w-3.5 mr-1.5" />
 {production} unids
 </Badge>
 </div>
 </div>

  <Button 
  variant="outline" 
  className="w-full h-12 mt-auto border-border/50 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors font-semibold rounded-xl active:scale-[0.98]"
  onClick={() => {
 setSelectedRecipe(recipe)
 setShowProductionDialog(true)
 }}
 >
 Ver Análisis de Producción
 </Button>
 </CardContent>
 </Card>
 )
 })}
 </div>
 )}
 </ScrollArea>

 {/* New/Edit Recipe Dialog */}
 <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
 <DialogContent className="theme-pos bg-background border-border max-w-2xl p-0 gap-0 overflow-hidden sm:">
 <div className="p-6 border-b border-border/50">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold text-foreground">{editingRecipeId ? 'Editar Receta' : 'Nueva Receta'}</DialogTitle>
 <DialogDescription className="text-muted-foreground mt-1">
 Asocia insumos a un producto final
 </DialogDescription>
 </DialogHeader>
 </div>
 <div className="space-y-5 px-6 py-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
 <div className="space-y-1.5">
 <Label className="text-sm font-medium">Producto Final</Label>
 <Select value={formProductoId} onValueChange={setFormProductoId} disabled={!!editingRecipeId}>
 <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
 <SelectValue placeholder="Seleccionar producto" />
 </SelectTrigger>
 <SelectContent>
 {editingRecipeId ? (
 // Si editamos, mostrar el producto actual aunque ya tenga receta
 <SelectItem value={formProductoId}>
 {productos.find(p => p.id === formProductoId)?.nombre || 'Producto'}
 </SelectItem>
 ) : (
 productosSinReceta.map(p => (
 <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 </div>
 
 <div className="space-y-2">
 <Label className="text-sm font-medium">Ingredientes</Label>
 <Card className="bg-background/40 border-border/50 shadow-sm overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="border-border">
 <TableHead className="text-muted-foreground">Insumo</TableHead>
 <TableHead className="text-muted-foreground">Cantidad</TableHead>
 <TableHead className="text-muted-foreground text-right">Costo</TableHead>
 <TableHead></TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {formIngredientes.map((ing, idx) => {
 const insumo = insumos.find(i => i.id === ing.insumoId)
 return (
 <TableRow key={idx} className="border-border">
 <TableCell>
 <Select 
 value={ing.insumoId} 
 onValueChange={(val) => {
 const newIngs = [...formIngredientes]
 newIngs[idx].insumoId = val
 setFormIngredientes(newIngs)
 }}
 >
 <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
 <SelectValue placeholder="Seleccionar insumo" />
 </SelectTrigger>
 <SelectContent>
 {insumos.map(i => (
 <SelectItem key={i.id} value={i.id}>{i.nombre}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-2">
 <Input 
 type="number" 
 className="bg-background/50 focus:bg-background transition-colors w-24" 
 placeholder="0"
 value={ing.cantidad || ''}
 onChange={(e) => {
 const newIngs = [...formIngredientes]
 newIngs[idx].cantidad = parseFloat(e.target.value) || 0
 setFormIngredientes(newIngs)
 }}
 />
 <span className="text-sm text-muted-foreground font-medium">{insumo?.unidadMedida}</span>
 </div>
 </TableCell>
 <TableCell className="text-right text-primary">
 {formatCurrency((insumo?.costo || 0) * ing.cantidad)}
 </TableCell>
 <TableCell>
 <Button 
 variant="ghost" 
 size="icon" 
 onClick={() => {
 setFormIngredientes(formIngredientes.filter((_, i) => i !== idx))
 }}
 className="h-8 w-8 text-muted-foreground hover:text-destructive"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </TableCell>
 </TableRow>
 )
 })}
 </TableBody>
 </Table>
 </Card>
 <Button 
 variant="outline" 
 className="w-full mt-2"
 onClick={() => setFormIngredientes([...formIngredientes, { insumoId: '', cantidad: 0 }])}
 >
 <Plus className="h-4 w-4 mr-2" />
 Agregar ingrediente
 </Button>
 </div>

 {/* Summary */}
 <div className="flex items-center justify-between p-4 bg-primary/10 mt-4 border border-primary/20">
 <div>
 <p className="text-sm text-primary font-medium">Costo de Insumos</p>
 <p className="text-2xl font-black text-primary">{formatCurrency(costoFormulario)}</p>
 </div>
 </div>
 </div>
 <div className="p-6 pt-4 border-t border-border/50 ">
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowRecipeDialog(false)} className="">
 Cancelar
 </Button>
 <Button onClick={handleSaveRecipe} className="bg-primary text-primary-foreground shadow-lg transition-all">
 {editingRecipeId ? 'Actualizar Receta' : 'Crear Receta'}
 </Button>
 </DialogFooter>
 </div>
 </DialogContent>
 </Dialog>

 {/* Production Dialog */}
 <Dialog open={showProductionDialog} onOpenChange={setShowProductionDialog}>
 <DialogContent className="theme-pos bg-background border-border max-w-2xl p-0 gap-0 overflow-hidden sm:">
 <div className="p-6 border-b border-border/50">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold text-foreground">
 Producción Estimada
 </DialogTitle>
 <DialogDescription className="text-muted-foreground mt-1">
 Análisis según inventario actual
 </DialogDescription>
 </DialogHeader>
 </div>
 
 {selectedRecipe && (() => {
 const recetaObj = recetasMapeadas.find(r => r.id === selectedRecipe.id)
 if (!recetaObj) return null

 return (
 <div className="px-6 py-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
 <Table>
 <TableHeader>
 <TableRow className="border-border">
 <TableHead className="text-muted-foreground">Ingrediente</TableHead>
 <TableHead className="text-muted-foreground text-right">Stock</TableHead>
 <TableHead className="text-muted-foreground text-right">Necesita</TableHead>
 <TableHead className="text-muted-foreground text-right">Alcanza para</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {recetaObj.ingredientes.map(ing => {
 const canProduce = Math.floor(ing.stock / (ing.cantidad || 1))
 const isLimiting = canProduce === getMinProduction(recetaObj)
 
 return (
 <TableRow 
 key={ing.insumoId} 
 className={cn(
 "border-border",
 isLimiting && "bg-destructive/10"
 )}
 >
 <TableCell>
 <div className="flex items-center gap-2">
 {isLimiting && <AlertTriangle className="h-4 w-4 text-destructive" />}
 <span className="text-foreground">{ing.insumoNombre}</span>
 </div>
 </TableCell>
 <TableCell className="text-right font-mono">
 {ing.stock} {ing.unidad}
 </TableCell>
 <TableCell className="text-right font-mono text-muted-foreground">
 {ing.cantidad} {ing.unidad}
 </TableCell>
 <TableCell className="text-right">
 <Badge className={cn(
 isLimiting 
 ? "bg-destructive/20 text-destructive" 
 : "bg-success/20 text-success"
 )}>
 {canProduce} unidades
 </Badge>
 </TableCell>
 </TableRow>
 )
 })}
 </TableBody>
 </Table>

 <div className="mt-5 p-5 bg-primary/10 text-center border border-primary/20">
 <p className="text-sm text-primary font-medium mb-1">Producción máxima posible</p>
 <p className="text-3xl font-black text-primary">
 {getMinProduction(recetaObj)} unidades
 </p>
 </div>
 </div>
 )
 })()}
 
 <div className="p-6 pt-4 border-t border-border/50 ">
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowProductionDialog(false)} className="">
 Cerrar
 </Button>
 </DialogFooter>
 </div>
 </DialogContent>
 </Dialog>

 <AlertDialog open={!!recipeToDelete} onOpenChange={(open) => !open && setRecipeToDelete(null)}>
 <AlertDialogContent className="theme-pos bg-card text-card-foreground border-border">
 <AlertDialogHeader>
 <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
 <AlertDialogDescription>
 ¿Eliminar esta receta? El producto pasará a usar su stock directo en lugar de descontar insumos de cocina.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={confirmarEliminar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
 Eliminar Receta
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 )
}
