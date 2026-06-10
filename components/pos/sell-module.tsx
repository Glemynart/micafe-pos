'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEspacios } from '@/contexts/espacios-context'
import { useAuthContext } from '@/contexts/auth-context'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { suscribirRecetas, type Receta } from '@/lib/recetas-service'
import { registrarVenta, type CrearVentaParams } from '@/lib/ventas-service'
import { suscribirMesas, type Mesa } from '@/lib/mesas-service'
import { suscribirPedidosActivos, guardarPedido, eliminarPedido, enviarPedidoACocina, type PedidoActivo, type PedidoItem } from '@/lib/pedidos-service'
import { suscribirTurnoActivo, type Turno } from '@/lib/turnos-service'
import { DynamicIcon } from '@/components/ui/dynamic-icon'

import { toast } from 'sonner'
import { 
  Barcode, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingCart,
  User,
  Banknote,
  ClipboardList,
  Smartphone,
  Check,
  Printer,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  billDenominations, 
  formatCurrency,
  type CartItem
} from '@/lib/demo-data'

// Adapta un Producto de Firestore al tipo CartItem del carrito
function productoToCartItem(p: Producto): CartItem {
  return {
    id: p.id,
    name: p.nombre,
    code: p.id,
    price: p.precio,
    cost: p.costo,
    category: p.categoriaId,
    emoji: p.icono ?? '📦',
    stock: p.stock,
    iva: 19,
    impoconsumo: 0,
    hasRecipe: false,
    quantity: 1,
  }
}

export function SellModule() {
  const [searchCode, setSearchCode] = useState('')
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1)
  const [selectedCustomer, setSelectedCustomer] = useState<string>('Consumidor Final')
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null)

  // Datos reales desde Firestore
  const { usuario } = useAuthContext()
  const { espacioActivo, categorias, categoriaActiva, seleccionarCategoria } = useEspacios()

  const [catScroll, setCatScroll] = useState({ canLeft: false, canRight: false })

  // Callback ref: se ejecuta inmediatamente cuando el DOM esta listo
  const categoriesRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const check = () => {
      setCatScroll({
        canLeft: el.scrollLeft > 4,
        canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    }
    // Esperar al siguiente frame para que el contenido este renderizado
    requestAnimationFrame(check)
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // Mouse wheel -> scroll horizontal
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX || 0) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    // Cleanup
    const cleanup = () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
    ;(el as any).__catCleanup = cleanup
  }, [])

  // Re-evaluar scroll cuando cambien las categorias (puede haber overflow nuevo)
  useEffect(() => {
    const el = document.querySelector('[data-categories-scroller]') as HTMLDivElement | null
    if (!el) return
    requestAnimationFrame(() => {
      setCatScroll({
        canLeft: el.scrollLeft > 4,
        canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    })
  }, [categorias])

  const scrollCategories = (dir: 'left' | 'right') => {
    const el = document.querySelector('[data-categories-scroller]') as HTMLDivElement | null
    if (!el) return
    const amount = el.clientWidth * 0.6
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }
  const [productos, setProductos] = useState<Producto[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [pedidosActivos, setPedidosActivos] = useState<PedidoActivo[]>([])
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null)
  const [cargandoTurno, setCargandoTurno] = useState(true)
  const [cargandoProductos, setCargandoProductos] = useState(true)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [fotoTipo, setFotoTipo] = useState<'bn' | 'color'>('bn')
  const [fotoCopias, setFotoCopias] = useState(1)
  const esFotocopias = espacioActivo?.nombre?.toLowerCase().includes('fotocop') ?? false

  // Suscribir al turno del usuario (Global)
  useEffect(() => {
    if (!usuario) {
      setTurnoActivo(null)
      setCargandoTurno(false)
      return
    }
    setCargandoTurno(true)
    return suscribirTurnoActivo(usuario.uid, (turno) => {
      setTurnoActivo(turno)
      setCargandoTurno(false)
    })
  }, [usuario?.uid])

  // Suscribir a mesas y pedidos del espacio activo
  useEffect(() => {
    if (!espacioActivo) {
      setMesas([])
      setPedidosActivos([])
      return
    }
    const unsubMesas = suscribirMesas(espacioActivo.id, setMesas)
    const unsubPedidos = suscribirPedidosActivos(espacioActivo.id, setPedidosActivos)
    return () => { unsubMesas(); unsubPedidos() }
  }, [espacioActivo?.id])

  // Obtener el carrito actual basado en la mesa seleccionada
  const activePedido = pedidosActivos.find(p => p.mesaId === selectedMesaId)
  const cart: PedidoItem[] = activePedido?.items || []

  const syncCartWithFirebase = useCallback(async (newItems: PedidoItem[]) => {
    if (newItems.length === 0) {
      if (activePedido) await eliminarPedido(activePedido.id)
      return
    }
    
    if (activePedido) {
      await guardarPedido({ ...activePedido, items: newItems })
    } else {
      if (!usuario || !espacioActivo) return
      const nombreMesa = selectedMesaId ? mesas.find(m => m.id === selectedMesaId)?.nombre || 'Mesa' : 'Mostrador / Para llevar'
      await guardarPedido({
        mesaId: selectedMesaId,
        nombreMesa,
        espacioId: espacioActivo.id,
        cajeroId: usuario.uid,
        items: newItems,
        estado: 'abierto'
      })
    }
  }, [activePedido, selectedMesaId, mesas, usuario, espacioActivo])

  const addCustomPhotoCopyToCart = useCallback((nombre: string, copias: number) => {
    const precio = fotoTipo === 'bn' ? 200 : 800
    const existing = cart.find(item => item.id === `foto-${fotoTipo}`)
    let newItems: PedidoItem[]
    if (existing) {
      newItems = cart.map(item => item.id === `foto-${fotoTipo}` ? { ...item, quantity: item.quantity + copias, price: precio } : item)
    } else {
      newItems = [...cart, { id: `foto-${fotoTipo}`, name: nombre, code: `foto-${fotoTipo}`, price: precio, cost: 50, category: 'Fotocopias', emoji: 'Printer', stock: 999, iva: 0, impoconsumo: 0, hasRecipe: false, quantity: copias } as PedidoItem]
    }
    syncCartWithFirebase(newItems)
  }, [cart, syncCartWithFirebase, fotoTipo])

  // Suscribir a recetas (todas)
  useEffect(() => {
    return suscribirRecetas(setRecetas)
  }, [])

  // Suscribir a productos e insumos del espacio activo en tiempo real
  useEffect(() => {
    if (!espacioActivo) {
      setProductos([])
      setInsumos([])
      setCargandoProductos(false)
      return
    }
    setCargandoProductos(true)
    
    const unsubProductos = suscribirProductos(espacioActivo.id, (nuevos) => {
      setProductos(nuevos)
      setCargandoProductos(false)
    })
    
    const unsubInsumos = suscribirInsumos(espacioActivo.id, setInsumos)

    return () => {
      unsubProductos()
      unsubInsumos()
    }
  }, [espacioActivo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calcular el stock dinámico si tiene receta
  const productosConStock = useMemo(() => {
    return productos.map(p => {
      const receta = recetas.find(r => r.productoId === p.id)
      if (!receta || receta.ingredientes.length === 0) {
        return p // Retorna el producto con su propio stock
      }
      
      let stockMinimoPosible = Infinity
      for (const ing of receta.ingredientes) {
        const insumo = insumos.find(i => i.id === ing.insumoId)
        if (!insumo) return { ...p, stock: 0 } // Falta insumo = no hay stock
        
        const posible = Math.floor(insumo.stock / ing.cantidad)
        if (posible < stockMinimoPosible) stockMinimoPosible = posible
      }
      
      return {
        ...p,
        stock: stockMinimoPosible === Infinity ? 0 : stockMinimoPosible
      }
    })
  }, [productos, recetas, insumos])

  // Filtrar por categoría activa
  const filteredProducts = categoriaActiva
    ? productosConStock.filter(p => p.categoriaId === categoriaActiva.id)
    : productosConStock

  // Dialogs
  const [showMesasDialog, setShowMesasDialog] = useState(false)
  const [showQuickProduct, setShowQuickProduct] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>('efectivo')
  const [cashReceived, setCashReceived] = useState<number>(0)
  const [showReceipt, setShowReceipt] = useState(false)
  
  // Quick product form
  const [quickProductName, setQuickProductName] = useState('')
  const [quickProductPrice, setQuickProductPrice] = useState('')
  
  // Calculadora Rápida para Fotocopias
  const [quickCopies, setQuickCopies] = useState<number>(1)

  const addToCart = useCallback((product: Producto) => {
    const cartItem = productoToCartItem(product)
    const existing = cart.find(item => item.id === cartItem.id)
    let newItems = []
    if (existing) {
      newItems = cart.map(item => item.id === cartItem.id ? { ...item, quantity: item.quantity + 1 } : item)
    } else {
      newItems = [...cart, { ...cartItem, quantity: 1 }]
    }
    syncCartWithFirebase(newItems)
  }, [cart, syncCartWithFirebase])

  const addToCartQuantity = useCallback((product: Producto, qty: number) => {
    const cartItem = productoToCartItem(product)
    const existing = cart.find(item => item.id === cartItem.id)
    let newItems = []
    if (existing) {
      newItems = cart.map(item => item.id === cartItem.id ? { ...item, quantity: item.quantity + qty } : item)
    } else {
      newItems = [...cart, { ...cartItem, quantity: qty }]
    }
    syncCartWithFirebase(newItems)
    setQuickCopies(1) // reset after add
  }, [cart, syncCartWithFirebase])

  const updateQuantity = useCallback((productId: string, delta: number) => {
    const newItems = cart.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta
        if (newQty <= 0) return item
        return { ...item, quantity: newQty }
      }
      return item
    }).filter(item => item.quantity > 0)
    syncCartWithFirebase(newItems)
  }, [cart, syncCartWithFirebase])

  const removeFromCart = useCallback((productId: string) => {
    const newItems = cart.filter(item => item.id !== productId)
    syncCartWithFirebase(newItems)
    setSelectedCartIndex(-1)
  }, [cart, syncCartWithFirebase])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!searchCode.trim()) return
    
    // Código comodín 1000
    if (searchCode === '1000') {
      setShowQuickProduct(true)
      setSearchCode('')
      return
    }
    
    // Buscar por nombre o id entre los productos del espacio activo
    const product = productosConStock.find(p =>
      p.id === searchCode ||
      p.nombre.toLowerCase().includes(searchCode.toLowerCase())
    )
    if (product) {
      addToCart(product)
      setSearchCode('')
    } else {
      setShowQuickProduct(true)
    }
  }, [searchCode, addToCart, productosConStock])

  const handleQuickProductSubmit = useCallback(() => {
    if (!quickProductName || !quickProductPrice) return
    
    const newProduct: PedidoItem = {
      id: `quick-${Date.now()}`,
      name: quickProductName,
      code: searchCode || '1000',
      price: parseInt(quickProductPrice),
      cost: 0,
      category: 'Otros',
      emoji: '📦',
      stock: 999,
      iva: 19,
      impoconsumo: 0,
      hasRecipe: false,
      quantity: 1
    }
    
    syncCartWithFirebase([...cart, newProduct])
    setShowQuickProduct(false)
    setQuickProductName('')
    setQuickProductPrice('')
    setSearchCode('')
  }, [quickProductName, quickProductPrice, searchCode])

  // Calculations
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
  const totalIva = cart.reduce((acc, item) => acc + (item.price * item.quantity * item.iva / 100), 0)
  const totalImpoconsumo = cart.reduce((acc, item) => acc + (item.price * item.quantity * item.impoconsumo / 100), 0)
  const total = subtotal + totalIva + totalImpoconsumo
  const change = cashReceived - total

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showPayment || showQuickProduct || showReceipt) return
      
      if (e.key === 'ArrowUp' && selectedCartIndex > 0) {
        setSelectedCartIndex(prev => prev - 1)
      } else if (e.key === 'ArrowDown' && selectedCartIndex < cart.length - 1) {
        setSelectedCartIndex(prev => prev + 1)
      } else if (e.key === 'Delete' && selectedCartIndex >= 0) {
        removeFromCart(cart[selectedCartIndex].id)
      } else if (e.key === 'Enter' && cart.length > 0 && document.activeElement?.tagName !== 'INPUT') {
        setShowPayment(true)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCartIndex, cart, showPayment, showQuickProduct, showReceipt, removeFromCart])

  const handlePaymentComplete = useCallback(async () => {
    if (!usuario) {
      toast.error("Error: No hay un usuario activo en la sesión.")
      return
    }

    setIsProcessingPayment(true)
    try {
      const items = cart.map(item => ({
        id: item.code, // Usamos el código o ID real del producto
        nombre: item.name,
        cantidad: item.quantity,
        precioUnitario: item.price,
        costoUnitario: item.cost,
        subtotal: item.price * item.quantity
      }))

      if (!turnoActivo) {
        toast.error("Error: No tienes un turno abierto para registrar ventas.")
        setIsProcessingPayment(false)
        return
      }

      const params: CrearVentaParams = {
        turnoId: turnoActivo.id,
        cajeroId: usuario.uid,
        clienteId: selectedCustomer === 'generic' ? undefined : selectedCustomer,
        items,
        totales: { subtotal, iva: totalIva, impoconsumo: totalImpoconsumo, total },
        metodoPago: paymentMethod as 'efectivo' | 'transferencia' | 'cuenta_cobro',
        dineroRecibido: paymentMethod === 'efectivo' ? cashReceived : undefined,
        cambio: paymentMethod === 'efectivo' ? Math.max(0, change) : undefined,
        estado: paymentMethod === 'cuenta_cobro' ? 'pendiente' : 'pagada'
      }

      // Optimistic UI: Mostrar recibo instantáneamente
      setShowPayment(false)
      setShowReceipt(true)
      setIsProcessingPayment(false)

      registrarVenta(params).then(async () => {
        if (activePedido) {
          await eliminarPedido(activePedido.id)
        }
      }).catch(error => {
        console.error("Error al registrar la venta:", error)
        toast.warning("Hubo un error de conexión al guardar la venta en la nube, pero puedes seguir operando.")
      })
    } catch (error) {
      console.error("Error:", error)
      setIsProcessingPayment(false)
    }
  }, [usuario, cart, selectedCustomer, subtotal, totalIva, totalImpoconsumo, total, paymentMethod, cashReceived, change, activePedido])

  const handleReceiptClose = useCallback((print: boolean) => {
    if (print) {
      console.log('[v0] Imprimiendo ticket...')
    }
    setShowReceipt(false)
    setCashReceived(0)
    setPaymentMethod('efectivo')
    setSelectedCustomer('')
  }, [])

  if (!cargandoTurno && !turnoActivo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-secondary/10">
        <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center text-warning mb-2">
          <Clock className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Turno Cerrado</h2>
        <p className="text-muted-foreground max-w-md">
          Debes abrir un turno para poder acceder a la caja y registrar ventas. Dirígete al módulo de <strong>Turnos</strong> para iniciar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-0 p-0 bg-background min-h-0 overflow-hidden">
      {/* Left Column - Products */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 p-3 md:p-4 min-w-0">
        {/* Search Bar */}
        <form onSubmit={handleSearch}>
          <div className="relative">
            <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="Escanear código de barras o buscar producto..."
              className="pl-12 h-14 text-lg bg-card border-input focus:border-primary shadow-sm rounded-xl"
              autoFocus
            />
          </div>
        </form>

        {/* Calculadora Rápida - Solo para Fotocopias */}
        {espacioActivo?.id === 'fotocopias' && productos.length > 0 && (
          <div className="bg-card border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 pointer-events-none" />
            <div className="flex-shrink-0">
              <label className="text-xs font-bold uppercase tracking-wider text-primary mb-2 block">
                Calculadora de Copias
              </label>
              <div className="flex items-center gap-1 bg-input/50 rounded-lg p-1 border border-border">
                <button 
                  onClick={() => setQuickCopies(Math.max(1, quickCopies - 1))} 
                  type="button" 
                  className="w-10 h-10 flex items-center justify-center rounded-md bg-background hover:bg-muted text-foreground shadow-sm transition-all active:scale-95"
                >
                  <Minus className="h-5 w-5"/>
                </button>
                <input 
                   type="number" 
                   value={quickCopies}
                   onChange={(e) => setQuickCopies(Math.max(1, parseInt(e.target.value) || 1))}
                   className="w-16 h-10 bg-transparent text-center font-black text-primary text-xl focus:outline-none"
                   min="1"
                />
                <button 
                  onClick={() => setQuickCopies(quickCopies + 1)} 
                  type="button" 
                  className="w-10 h-10 flex items-center justify-center rounded-md bg-background hover:bg-muted text-foreground shadow-sm transition-all active:scale-95"
                >
                  <Plus className="h-5 w-5"/>
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex gap-2 overflow-x-auto pb-1 custom-scrollbar items-center">
              {productos.slice(0, 6).map(prod => (
                <button 
                   key={`calc-${prod.id}`}
                   onClick={() => addToCartQuantity(prod, quickCopies)}
                   type="button"
                   className="flex flex-col items-center justify-center p-3 h-[72px] bg-secondary/40 hover:bg-primary hover:text-primary-foreground border border-transparent rounded-lg transition-all active:scale-95 whitespace-nowrap min-w-[110px] group"
                >
                   <span className="text-xs font-semibold truncate w-full text-center mb-1 group-hover:text-primary-foreground">
                     {prod.nombre}
                   </span>
                   <span className="text-sm font-black text-primary group-hover:text-primary-foreground/90">
                     + {formatCurrency(prod.precio * quickCopies)}
                   </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs — swipeables horizontalmente */}
        <Tabs
          value={categoriaActiva?.id ?? 'todos'}
          onValueChange={(val) => {
            if (val === 'todos') seleccionarCategoria(null)
            else seleccionarCategoria(categorias.find(c => c.id === val) ?? null)
          }}
        >
          <div className="relative">
            {catScroll.canLeft && (
              <button
                type="button"
                onClick={() => scrollCategories('left')}
                className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-r from-background to-transparent text-foreground/60 hover:text-foreground"
                aria-label="Categorias anteriores"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {catScroll.canRight && (
              <button
                type="button"
                onClick={() => scrollCategories('right')}
                className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-l from-background to-transparent text-foreground/60 hover:text-foreground"
                aria-label="Categorias siguientes"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
            {catScroll.canRight && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background/90 to-transparent" />
            )}
            {catScroll.canLeft && (
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background/90 to-transparent" />
            )}
            <TabsList
              ref={categoriesRef}
              data-categories-scroller="true"
              className="flex gap-2 overflow-x-auto pb-2 bg-transparent border-none h-auto scrollbar-none snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: 'touch', display: 'flex', flexWrap: 'nowrap' }}
            >
              <TabsTrigger
                value="todos"
                className="px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl font-medium text-sm whitespace-nowrap shadow-sm border border-border data-[state=active]:border-primary flex items-center gap-2 h-[48px] transition-colors snap-start shrink-0"
              >
                Todos
              </TabsTrigger>
              {categorias.map(cat => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                className="px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl font-medium text-sm whitespace-nowrap shadow-sm border border-border data-[state=active]:border-primary flex items-center gap-2 h-[48px] transition-colors shrink-0"
                >
                  <DynamicIcon name={cat.icono} className="w-5 h-5" /> {cat.nombre}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {/* Products Grid — datos reales de Firestore */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
          {esFotocopias ? (
            <FotocopiasCalculator
              fotoTipo={fotoTipo}
              setFotoTipo={setFotoTipo}
              fotoCopias={fotoCopias}
              setFotoCopias={setFotoCopias}
              onAgregarAlCarrito={addCustomPhotoCopyToCart}
            />
          ) : cargandoProductos ? (
            // Estado de carga
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm">Cargando productos...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <span className="text-4xl">{espacioActivo?.icono ?? '📦'}</span>
              <p className="text-sm">Sin productos en este espacio</p>
            </div>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pr-4 pb-8">
                {filteredProducts.map((product, idx) => (
                  <Card 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all group flex flex-col active:scale-[0.97] shadow-md relative h-52 tap-active",
                      product.stock <= (product.stockMinimo || 5) && "border-destructive/50 hover:border-destructive"
                    )}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-10"></div>
                    <div className="h-28 bg-muted/20 w-full relative overflow-hidden border-b border-border/50">
                      {product.imagenUrl ? (
                        <img
                          src={product.imagenUrl}
                          alt={product.nombre}
                          className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                          <DynamicIcon name={product.icono} className="w-14 h-14" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 flex flex-col flex-1 justify-between bg-card z-10">
                      <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{product.nombre}</h3>
                      <div className="mt-auto pt-2 space-y-1">
                        <p className="font-black text-primary text-base">{formatCurrency(product.precio)}</p>
                        <Badge variant="secondary" className="bg-secondary/20 text-secondary-foreground font-bold text-[11px] border-none shadow-none">
                          Stock: {product.stock}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            </ScrollArea>
          </div>
        </div>

      {/* Right Column - Cart */}
      <Card className="w-[300px] lg:w-[380px] flex flex-col bg-card border-l border-border shadow-[-4px_0_15px_rgba(0,0,0,0.1)] overflow-hidden relative z-20 rounded-none border-y-0 border-r-0 min-h-0 shrink-0">
          {/* Selector de Mesas / Cuentas Arriba del Carrito */}
          <div className="p-4 bg-muted/30 border-b border-border">
            <button
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 transition-colors bg-card shadow-sm group active:scale-[0.98]"
                onClick={() => setShowMesasDialog(true)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-foreground text-sm">
                            {selectedMesaId ? mesas.find(m => m.id === selectedMesaId)?.nombre : 'Mostrador'}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cambiar Mesa</p>
                    </div>
                </div>
                <div className="bg-primary/10 px-3 py-1 rounded-full border border-primary/20 text-primary font-bold text-sm">
                    {formatCurrency(subtotal)}
                </div>
            </button>
          </div>

          <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" /> Tu Orden
              </h2>
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full font-bold px-3">{cart.length} ITEMS</Badge>
          </div>

          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
            <div className="p-4 pt-0 space-y-3">
              {cart.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="flex flex-col p-4 rounded-xl border border-border bg-card shadow-sm group">
                      <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                  <DynamicIcon name={item.emoji} className="w-5 h-5" />
                              </div>
                              <div>
                                  <p className="font-semibold text-foreground text-sm leading-tight flex items-center flex-wrap gap-2">
                                      {item.name}
                                      {((item as any).cantidadEnviada || 0) > 0 && (
                                        <Badge variant="outline" className="text-[10px] h-5 bg-orange-500/10 text-orange-600 border-orange-500/20 px-1.5 font-bold">
                                          {((item as any).cantidadEnviada || 0) === item.quantity 
                                            ? 'En Cocina' 
                                            : `${(item as any).cantidadEnviada} en Cocina`
                                          }
                                        </Badge>
                                      )}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{item.id.substring(0, 15)}</p>
                              </div>
                          </div>
                      </div>
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-12 h-12 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 touch-target"><Minus className="h-5 w-5"/></button>
                              <span className="w-10 text-center font-bold text-foreground text-lg">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-12 h-12 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 touch-target"><Plus className="h-5 w-5"/></button>
                          </div>
                          <div className="flex items-center gap-4">
                              <p className="font-black text-primary text-lg">{formatCurrency(item.price * item.quantity)}</p>
                              <button onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-destructive transition-colors active:scale-95 p-2"><Trash2 className="h-5 w-5"/></button>
                          </div>
                      </div>
                  </div>
              ))}
            </div>
              </ScrollArea>
          </div>

          {/* Footer */}
          <div className="mt-auto p-6 bg-muted/20 border-t border-border">
              <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-bold text-foreground">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                      <span>IVA (19%)</span>
                      <span className="font-bold text-foreground">{formatCurrency(totalIva)}</span>
                  </div>
              </div>
              <div className="flex justify-between items-center mb-6">
                  <span className="text-xl font-bold text-foreground tracking-wide">TOTAL</span>
                  <span className="text-4xl font-black text-primary">{formatCurrency(total)}</span>
              </div>

              <div className="relative mb-4 group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input 
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    placeholder="C.C. o NIT (Consumidor Final)..." 
                    className="pl-12 bg-card border-input focus:border-primary focus-visible:ring-primary h-14 rounded-xl text-foreground font-medium" 
                  />
              </div>

              <div className="flex gap-3">
                  <Button variant="outline" onClick={async () => {
                    if (activePedido) {
                      await enviarPedidoACocina(activePedido.id)
                      toast.success('Pedido enviado a cocina')
                    }
                  }} className="h-16 flex-[1] rounded-xl border-input font-bold text-muted-foreground hover:bg-muted hover:text-foreground bg-card shadow-sm active:scale-95">
                      Cocina
                  </Button>
                  <Button onClick={() => setShowPayment(true)} className="h-16 flex-[2] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xl shadow-[0_4px_14px_rgba(var(--primary),0.3)] transition-all active:scale-95 border-none relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      <Banknote className="mr-2 h-6 w-6 relative z-10" /> <span className="relative z-10">COBRAR</span>
                  </Button>
              </div>
          </div>
        </Card>

      <Dialog open={showMesasDialog} onOpenChange={setShowMesasDialog}>
        <DialogContent className="sm:max-w-5xl w-[95vw] bg-card border-none h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-3xl">
          <DialogHeader className="px-6 py-5 border-b border-border bg-card shrink-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-3 text-foreground">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shadow-inner">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              Gestión de Mesas y Cuentas
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2 font-medium text-base">
              Selecciona una mesa para ver su pedido activo o crear uno nuevo.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 bg-background/50">
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 pb-8">
                {/* Mostrador option */}
              <button 
                className={cn(
                  "relative flex items-center gap-4 p-5 rounded-2xl border-2 border-dashed transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
                  selectedMesaId === null 
                    ? "bg-primary/10 border-primary ring-4 ring-primary/20" 
                    : "bg-card border-border hover:border-primary/50 hover:bg-muted hover:-translate-y-1 hover:shadow-lg"
                )}
                onClick={() => { setSelectedMesaId(null); setShowMesasDialog(false) }}
              >
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-sm">
                    <ShoppingCart className="h-6 w-6" />
                </div>
                <div className="text-left">
                    <p className="font-black text-foreground text-base leading-tight">Venta</p>
                    <p className="font-black text-foreground text-base leading-tight">Mostrador</p>
                </div>
              </button>

              {/* Mesas List */}
              {mesas.map(mesa => {
                const mesaTienePedido = pedidosActivos.some(p => p.mesaId === mesa.id)
                const pedidoMesa = pedidosActivos.find(p => p.mesaId === mesa.id)
                const isActive = selectedMesaId === mesa.id
                
                return (
                  <button
                    key={mesa.id}
                    onClick={() => { setSelectedMesaId(mesa.id); setShowMesasDialog(false) }}
                    className={cn(
                      "relative flex items-center gap-4 p-4 rounded-2xl border transition-all text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
                      isActive ? "ring-4 ring-primary/20" : "",
                      mesaTienePedido 
                        ? "bg-primary/10 border-primary/50 hover:border-primary shadow-sm hover:shadow-md hover:-translate-y-1" 
                        : "bg-card border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-1",
                      mesaTienePedido && isActive && "bg-primary/20 border-primary"
                    )}
                  >
                    {/* Left Icon */}
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner shrink-0",
                        mesaTienePedido ? "bg-gradient-to-br from-secondary to-primary text-primary-foreground" : "bg-muted text-muted-foreground/50"
                    )}>
                      {mesaTienePedido ? 'M' : '+'}
                    </div>
                    
                    {/* Right Content */}
                    <div className="flex flex-col flex-1 h-full justify-center">
                      <div className="flex items-center justify-between w-full mb-1 gap-2">
                        <p className="font-black text-foreground text-base truncate">{mesa.nombre}</p>
                        <Badge variant="secondary" className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider shrink-0",
                            mesaTienePedido ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                        )}>
                          {mesaTienePedido ? 'OCUPADA' : 'LIBRE'}
                        </Badge>
                      </div>
                      
                      {mesaTienePedido ? (
                        <div className="flex items-center w-full mt-1">
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {pedidoMesa?.items.length || 0} ITEMS 🍽️
                          </span>
                          <span className="font-black text-primary text-sm ml-auto">
                            {formatCurrency(pedidoMesa?.items.reduce((acc, i) => acc + (i.price * i.quantity), 0) || 0)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Toca para abrir</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Quick Product Dialog */}
      <Dialog open={showQuickProduct} onOpenChange={setShowQuickProduct}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Crear Producto Rápido</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Código: {searchCode || '1000'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del producto</Label>
              <Input
                id="name"
                value={quickProductName}
                onChange={(e) => setQuickProductName(e.target.value)}
                placeholder="Ej: Producto especial"
                className="bg-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Precio</Label>
              <Input
                id="price"
                type="number"
                value={quickProductPrice}
                onChange={(e) => setQuickProductPrice(e.target.value)}
                placeholder="0"
                className="bg-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickProduct(false)}>
              Cancelar
            </Button>
            <Button onClick={handleQuickProductSubmit} className="bg-primary text-primary-foreground">
              Agregar al carrito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground text-xl">Método de Pago</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Total a pagar: <span className="text-primary font-bold text-lg">{formatCurrency(total)}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            {/* Payment Method Selection */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'efectivo', name: 'Efectivo', icon: Banknote },
                { id: 'cuenta_cobro', name: 'Fiado / C. Cobro', icon: ClipboardList },
                { id: 'transferencia', name: 'Transferencia', icon: Smartphone },
              ].map(method => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                    paymentMethod === method.id 
                      ? "border-primary bg-primary/10" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <method.icon className={cn(
                    "h-8 w-8",
                    paymentMethod === method.id ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    paymentMethod === method.id ? "text-primary" : "text-foreground"
                  )}>
                    {method.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Cash Input */}
            {paymentMethod === 'efectivo' && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <Label>Monto recibido</Label>
                  <Input
                    type="number"
                    value={cashReceived || ''}
                    onChange={(e) => setCashReceived(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="h-14 text-2xl text-center font-bold bg-input"
                  />
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  {billDenominations.map(bill => (
                    <Button
                      key={bill.value}
                      variant="outline"
                      onClick={() => setCashReceived(prev => prev + bill.value)}
                      className="h-10 text-xs hover:border-primary hover:text-primary"
                    >
                      {bill.label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => setCashReceived(total)}
                    className="h-10 text-xs bg-primary/10 border-primary text-primary"
                  >
                    Exacto
                  </Button>
                </div>

                {cashReceived > 0 && (
                  <div className={cn(
                    "p-4 rounded-lg text-center",
                    change >= 0 ? "bg-success/10" : "bg-destructive/10"
                  )}>
                    <p className="text-sm text-muted-foreground mb-1">Cambio</p>
                    <p className={cn(
                      "text-3xl font-bold",
                      change >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(Math.abs(change))}
                    </p>
                    {change < 0 && (
                      <p className="text-sm text-destructive mt-1">Falta dinero</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)} disabled={isProcessingPayment}>
              Cancelar
            </Button>
            <Button 
              onClick={handlePaymentComplete}
              disabled={(paymentMethod === 'efectivo' && change < 0) || isProcessingPayment}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              {isProcessingPayment ? (
                <>
                  <div className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Pago
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              Venta Completada
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="text-2xl font-bold text-primary mb-2">{formatCurrency(total)}</p>
            {paymentMethod === 'efectivo' && change > 0 && (
              <p className="text-muted-foreground">Cambio: {formatCurrency(change)}</p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => handleReceiptClose(false)}
            >
              <X className="h-4 w-4 mr-2" />
              No imprimir
            </Button>
            <Button 
              className="flex-1 bg-primary text-primary-foreground"
              onClick={() => handleReceiptClose(true)}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FotocopiasCalculator({
  fotoTipo, setFotoTipo, fotoCopias, setFotoCopias, onAgregarAlCarrito
}: {
  fotoTipo: 'bn' | 'color'
  setFotoTipo: (t: 'bn' | 'color') => void
  fotoCopias: number
  setFotoCopias: (n: number) => void
  onAgregarAlCarrito: (tipo: string, copias: number) => void
}) {
  const PRECIO_BN = 200
  const PRECIO_COLOR = 800
  const precio = fotoTipo === 'bn' ? PRECIO_BN : PRECIO_COLOR

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Calculadora de Fotocopias</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFotoTipo('bn')}
          className={`p-4 rounded-xl border-2 text-center transition-all active:scale-95 ${fotoTipo === 'bn' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-card text-muted-foreground'}`}
        >
          <p className="text-2xl mb-1">📄</p>
          <p className="text-sm font-medium">Blanco y Negro</p>
          <p className="text-xs text-muted-foreground">$200 c/u</p>
        </button>
        <button
          onClick={() => setFotoTipo('color')}
          className={`p-4 rounded-xl border-2 text-center transition-all active:scale-95 ${fotoTipo === 'color' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-card text-muted-foreground'}`}
        >
          <p className="text-2xl mb-1">🎨</p>
          <p className="text-sm font-medium">Color</p>
          <p className="text-xs text-muted-foreground">$800 c/u</p>
        </button>
      </div>

      <div className="flex items-center justify-center gap-4 p-4 bg-card rounded-xl border border-border">
        <button
          onClick={() => setFotoCopias(Math.max(1, fotoCopias - 1))}
          className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-foreground font-bold text-xl active:scale-90 touch-target"
        >-</button>
        <div className="text-center min-w-[80px]">
          <p className="text-3xl font-black text-foreground">{fotoCopias}</p>
          <p className="text-xs text-muted-foreground">copias</p>
        </div>
        <button
          onClick={() => setFotoCopias(fotoCopias + 1)}
          className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-foreground font-bold text-xl active:scale-90 touch-target"
        >+</button>
      </div>

      <div className="p-4 bg-primary/10 rounded-xl text-center">
        <p className="text-sm text-muted-foreground">Total</p>
        <p className="text-3xl font-black text-primary">{formatCurrency(precio * fotoCopias)}</p>
      </div>

      <Button
        className="w-full h-14 text-lg font-bold rounded-xl"
        onClick={() => onAgregarAlCarrito(fotoTipo === 'bn' ? 'Fotocopia B/N' : 'Fotocopia Color', fotoCopias)}
      >
        Agregar al carrito
      </Button>
    </div>
  )
}
