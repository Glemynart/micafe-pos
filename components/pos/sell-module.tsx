'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useEspacios } from '@/contexts/espacios-context'
import { useAuthContext } from '@/contexts/auth-context'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { suscribirRecetas, type Receta } from '@/lib/recetas-service'
import { registrarVenta, cobrarPedido, type CrearVentaParams } from '@/lib/ventas-service'
import { suscribirClientes, filtrarClientes, crearCliente, type Cliente } from '@/lib/clientes-service'
import { suscribirMesas, type Mesa } from '@/lib/mesas-service'
import { suscribirPedidosActivos, guardarPedido, agregarItemPedido, enviarPedidoACocina, modificarItemPedido, suscribirComandasActivas, type PedidoActivo, type PedidoItem, type ComandaCocina } from '@/lib/pedidos-service'
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
  Search,
  ChefHat,
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
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string; documento: string; tipoDocumento: string } | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteSearch, setClienteSearch] = useState('')
  const [showCrearCliente, setShowCrearCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ tipoDocumento: 'CC', documento: '', nombre: '', telefono: '' })
  const [creandoCliente, setCreandoCliente] = useState(false)

  // Datos reales desde Firestore
  const { usuario } = useAuthContext()
  const { espacioActivo, categorias, categoriaActiva, seleccionarCategoria } = useEspacios()

  const [catScroll, setCatScroll] = useState({ canLeft: false, canRight: false })
  const categoriesScrollRef = useRef<HTMLDivElement>(null)

  const checkCatScroll = useCallback(() => {
    const el = categoriesScrollRef.current
    if (!el) return
    setCatScroll({
      canLeft: el.scrollLeft > 4,
      canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  // Adjuntar listeners al montar: scroll, resize, wheel y ResizeObserver
  useEffect(() => {
    const el = categoriesScrollRef.current
    if (!el) return
    // Tres intentos de detección: inmediato, próximo frame, y 300ms (contenido async)
    checkCatScroll()
    requestAnimationFrame(checkCatScroll)
    const timer = setTimeout(checkCatScroll, 300)
    el.addEventListener('scroll', checkCatScroll, { passive: true })
    window.addEventListener('resize', checkCatScroll)
    const ro = new ResizeObserver(checkCatScroll)
    ro.observe(el)
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX || 0) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', checkCatScroll)
      window.removeEventListener('resize', checkCatScroll)
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [checkCatScroll])

  // Re-detectar cuando lleguen categorías desde Firestore
  useEffect(() => {
    requestAnimationFrame(checkCatScroll)
    const timer = setTimeout(checkCatScroll, 300)
    return () => clearTimeout(timer)
  }, [categorias, checkCatScroll])

  const scrollCategories = useCallback((dir: 'left' | 'right') => {
    const el = categoriesScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.6 : el.clientWidth * 0.6, behavior: 'smooth' })
  }, [])
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

  const [comandasActivas, setComandasActivas] = useState<ComandaCocina[]>([])

  useEffect(() => {
    if (!espacioActivo) {
      setComandasActivas([])
      return
    }
    return suscribirComandasActivas(espacioActivo.id, setComandasActivas)
  }, [espacioActivo?.id])

  useEffect(() => suscribirClientes(setClientes), [])

  // Obtener el carrito actual basado en la mesa seleccionada
  const activePedido = pedidosActivos.find(p => p.mesaId === selectedMesaId)
  const cart: PedidoItem[] = activePedido?.items || []

  const estadoCocina = useMemo(() => {
    if (!activePedido) return null
    const comandasPedido = comandasActivas.filter(
      c => c.pedidoId === activePedido.id && c.tipo !== 'cancelacion'
    )
    if (comandasPedido.length === 0) return null
    const pendientes = comandasPedido.filter(c => c.estado !== 'listo')
    const listos = comandasPedido.filter(c => c.estado === 'listo')
    if (pendientes.length === 0 && listos.length > 0) return 'listo' as const
    if (listos.length > 0) return 'parcial' as const
    return 'en_cocina' as const
  }, [activePedido, comandasActivas])

  const prevCocinaRef = useRef<{ pedidoId?: string; estado: string | null }>({ estado: null })
  useEffect(() => {
    const prev = prevCocinaRef.current
    if (
      estadoCocina === 'listo' &&
      prev.estado !== 'listo' &&
      activePedido?.id === prev.pedidoId
    ) {
      toast.success('¡Pedido listo en cocina!', {
        description: activePedido?.nombreMesa,
        duration: 8000,
      })
    }
    prevCocinaRef.current = { pedidoId: activePedido?.id, estado: estadoCocina }
  }, [estadoCocina, activePedido?.id, activePedido?.nombreMesa])

  const crearPedidoConItem = useCallback(async (item: PedidoItem) => {
    if (!usuario || !espacioActivo) return
    const nombreMesa = selectedMesaId ? mesas.find(m => m.id === selectedMesaId)?.nombre || 'Mesa' : 'Mostrador / Para llevar'
    await guardarPedido({
      mesaId: selectedMesaId,
      nombreMesa,
      espacioId: espacioActivo.id,
      cajeroId: usuario.uid,
      items: [item],
      estado: 'abierto'
    })
  }, [selectedMesaId, mesas, usuario, espacioActivo])

  const addCustomPhotoCopyToCart = useCallback(async (nombre: string, copias: number) => {
    const precio = fotoTipo === 'bn' ? 200 : 800
    const item: PedidoItem = {
      id: `foto-${fotoTipo}`, uid: crypto.randomUUID(), name: nombre, code: `foto-${fotoTipo}`,
      price: precio, cost: 50, category: 'Fotocopias', emoji: 'Printer',
      stock: 999, iva: 0, impoconsumo: 0, hasRecipe: false, quantity: copias,
    }
    try {
      if (activePedido) {
        await agregarItemPedido(activePedido.id, item)
      } else {
        await crearPedidoConItem(item)
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al agregar fotocopia')
    }
  }, [activePedido, crearPedidoConItem, fotoTipo])

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

  const clientesFiltrados = useMemo(
    () => filtrarClientes(clientes, clienteSearch),
    [clientes, clienteSearch]
  )

  // Dialogs
  const [showMesasDialog, setShowMesasDialog] = useState(false)
  const [showQuickProduct, setShowQuickProduct] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>('efectivo')
  const [cashReceived, setCashReceived] = useState<number>(0)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const pendingRemoveUid = useRef<string | null>(null)
  
  // Quick product form
  const [quickProductName, setQuickProductName] = useState('')
  const [quickProductPrice, setQuickProductPrice] = useState('')
  
  // Calculadora Rápida para Fotocopias
  const [quickCopies, setQuickCopies] = useState<number>(1)

  const addToCart = useCallback(async (product: Producto) => {
    const cartItem = productoToCartItem(product)
    const item: PedidoItem = { ...cartItem, uid: crypto.randomUUID(), quantity: 1 }
    try {
      if (activePedido) {
        await agregarItemPedido(activePedido.id, item)
      } else {
        await crearPedidoConItem(item)
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al agregar producto')
    }
  }, [activePedido, crearPedidoConItem])

  const addToCartQuantity = useCallback(async (product: Producto, qty: number) => {
    const cartItem = productoToCartItem(product)
    const item: PedidoItem = { ...cartItem, uid: crypto.randomUUID(), quantity: qty }
    try {
      if (activePedido) {
        await agregarItemPedido(activePedido.id, item)
      } else {
        await crearPedidoConItem(item)
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al agregar producto')
    }
    setQuickCopies(1)
  }, [activePedido, crearPedidoConItem])

  const updateQuantity = useCallback(async (itemUid: string, delta: number) => {
    if (!activePedido) return
    const item = cart.find(i => (i.uid || i.id) === itemUid)
    if (!item) return
    const newQty = item.quantity + delta
    if (newQty <= 0) return
    try {
      await modificarItemPedido(activePedido.id, itemUid, newQty)
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar cantidad')
    }
  }, [activePedido, cart])

  const removeFromCart = useCallback(async (itemUid: string) => {
    if (!activePedido) return
    if (cart.length === 1) {
      pendingRemoveUid.current = itemUid
      setShowCancelConfirm(true)
      return
    }
    try {
      await modificarItemPedido(activePedido.id, itemUid, 0)
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar item')
    }
    setSelectedCartIndex(-1)
  }, [activePedido, cart.length])

  const confirmCancelPedido = useCallback(async () => {
    if (!activePedido || !pendingRemoveUid.current) return
    try {
      await modificarItemPedido(activePedido.id, pendingRemoveUid.current, 0)
    } catch (e: any) {
      toast.error(e.message || 'Error al cancelar pedido')
    }
    pendingRemoveUid.current = null
    setShowCancelConfirm(false)
    setSelectedCartIndex(-1)
  }, [activePedido])

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

  const handleQuickProductSubmit = useCallback(async () => {
    if (!quickProductName || !quickProductPrice) return

    const newProduct: PedidoItem = {
      id: `quick-${Date.now()}`,
      uid: crypto.randomUUID(),
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

    try {
      if (activePedido) {
        await agregarItemPedido(activePedido.id, newProduct)
      } else {
        await crearPedidoConItem(newProduct)
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al agregar producto rápido')
    }
    setShowQuickProduct(false)
    setQuickProductName('')
    setQuickProductPrice('')
    setSearchCode('')
  }, [quickProductName, quickProductPrice, searchCode, activePedido, crearPedidoConItem])

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
        removeFromCart(cart[selectedCartIndex].uid || cart[selectedCartIndex].id)
      } else if (e.key === 'Enter' && cart.length > 0 && document.activeElement?.tagName !== 'INPUT') {
        setShowPayment(true)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCartIndex, cart, showPayment, showQuickProduct, showReceipt, removeFromCart])

  const handleCrearCliente = useCallback(async () => {
    if (!nuevoCliente.nombre.trim() || !nuevoCliente.documento.trim()) return
    setCreandoCliente(true)
    try {
      const id = await crearCliente({
        nombre: nuevoCliente.nombre.trim(),
        cedula: nuevoCliente.documento.trim(),
        telefono: nuevoCliente.telefono.trim(),
        tipoDocumento: nuevoCliente.tipoDocumento,
      })
      setSelectedCliente({ id, nombre: nuevoCliente.nombre.trim(), documento: nuevoCliente.documento.trim(), tipoDocumento: nuevoCliente.tipoDocumento })
      setShowCrearCliente(false)
      setClienteSearch('')
      setNuevoCliente({ tipoDocumento: 'CC', documento: '', nombre: '', telefono: '' })
      toast.success('Cliente creado y seleccionado.')
    } catch (e: any) {
      toast.error('Error al crear el cliente: ' + e.message)
    } finally {
      setCreandoCliente(false)
    }
  }, [nuevoCliente])

  const handlePaymentComplete = useCallback(async () => {
    if (!usuario) {
      toast.error("Error: No hay un usuario activo en la sesión.")
      return
    }

    if (paymentMethod === 'cuenta_cobro' && !selectedCliente) {
      toast.error('Selecciona un cliente para registrar la venta a crédito.')
      return
    }

    setIsProcessingPayment(true)
    try {
      const items = cart.map(item => ({
        id: item.code,
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
        cajeroNombre: usuario.nombre,
        espacioId: espacioActivo?.id,
        clienteId: paymentMethod === 'cuenta_cobro'
          ? selectedCliente!.id
          : (selectedCustomer === 'generic' ? undefined : selectedCustomer || undefined),
        clienteNombre: paymentMethod === 'cuenta_cobro' ? selectedCliente!.nombre : undefined,
        clienteDocumento: paymentMethod === 'cuenta_cobro' ? selectedCliente!.documento : undefined,
        items,
        totales: { subtotal, iva: totalIva, impoconsumo: totalImpoconsumo, total },
        metodoPago: paymentMethod as 'efectivo' | 'transferencia' | 'cuenta_cobro',
        dineroRecibido: paymentMethod === 'efectivo' ? cashReceived : undefined,
        cambio: paymentMethod === 'efectivo' ? Math.max(0, change) : undefined,
        estado: paymentMethod === 'cuenta_cobro' ? 'pendiente' : 'pagada'
      }

      let incidenciasInventario: { itemNombre: string }[] = []

      if (activePedido) {
        const result = await cobrarPedido(params, activePedido.id)
        if (result.status === 'already_paid') {
          toast.info('Este pedido ya fue cobrado.', { duration: 4000 })
          setShowPayment(false)
          setIsProcessingPayment(false)
          return
        }
        incidenciasInventario = result.incidenciasInventario
      } else {
        const result = await registrarVenta(params)
        incidenciasInventario = result.incidenciasInventario
      }

      if (incidenciasInventario.length > 0) {
        const nombres = incidenciasInventario.map(i => i.itemNombre).join(', ')
        toast.warning('Venta registrada con faltante de inventario', {
          description: `Stock insuficiente en: ${nombres}. El inventario fue ajustado a 0.`,
          duration: 6000,
        })
      }

      setShowPayment(false)
      setShowReceipt(true)
      setIsProcessingPayment(false)
    } catch (error: any) {
      console.error("Error al registrar la venta:", error)
      toast.error(error?.message || "Error al registrar la venta. Inténtalo de nuevo.")
      setIsProcessingPayment(false)
    }
  }, [usuario, cart, selectedCustomer, selectedCliente, subtotal, totalIva, totalImpoconsumo, total, paymentMethod, cashReceived, change, activePedido, espacioActivo, turnoActivo])

  const handleReceiptClose = useCallback((print: boolean) => {
    if (print) {
      console.log('[v0] Imprimiendo ticket...')
    }
    setShowReceipt(false)
    setCashReceived(0)
    setPaymentMethod('efectivo')
    setSelectedCustomer('')
    setSelectedCliente(null)
    setClienteSearch('')
    setShowCrearCliente(false)
    setNuevoCliente({ tipoDocumento: 'CC', documento: '', nombre: '', telefono: '' })
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


        {/* Category Tabs — swipeables horizontalmente */}
        <Tabs
          value={categoriaActiva?.id ?? 'todos'}
          onValueChange={(val) => {
            if (val === 'todos') seleccionarCategoria(null)
            else seleccionarCategoria(categorias.find(c => c.id === val) ?? null)
          }}
        >
          <div className="relative">
            {/* Botón izquierda */}
            <button
              type="button"
              onClick={() => scrollCategories('left')}
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center bg-card border border-border/60 rounded-full shadow-md text-foreground/70 hover:text-foreground hover:border-primary/40 active:scale-95 transition-all",
                !catScroll.canLeft && "opacity-0 pointer-events-none"
              )}
              aria-label="Categorías anteriores"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* Botón derecha */}
            <button
              type="button"
              onClick={() => scrollCategories('right')}
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center bg-card border border-border/60 rounded-full shadow-md text-foreground/70 hover:text-foreground hover:border-primary/40 active:scale-95 transition-all",
                !catScroll.canRight && "opacity-0 pointer-events-none"
              )}
              aria-label="Categorías siguientes"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Gradientes de fade */}
            {catScroll.canLeft && <div className="pointer-events-none absolute left-10 top-0 bottom-0 w-6 bg-gradient-to-r from-background/80 to-transparent z-10" />}
            {catScroll.canRight && <div className="pointer-events-none absolute right-10 top-0 bottom-0 w-6 bg-gradient-to-l from-background/80 to-transparent z-10" />}
            {/* Wrapper con ref — el div maneja el scroll, TabsList solo organiza los triggers */}
            <div
              ref={categoriesScrollRef}
              className="overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2"
              style={{
                WebkitOverflowScrolling: 'touch',
                paddingLeft: catScroll.canLeft ? '2.75rem' : undefined,
                paddingRight: catScroll.canRight ? '2.75rem' : undefined,
              }}
            >
              <TabsList className="flex gap-2 bg-transparent border-none h-auto w-max">
                <TabsTrigger
                  value="todos"
                  className="px-6 py-3 bg-card text-foreground/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-gold data-[state=active]:ring-offset-1 data-[state=active]:ring-offset-background rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm border border-border flex items-center gap-2 min-h-[52px] transition-all duration-200 snap-start shrink-0 active:scale-[0.97]"
                >
                  Todos
                </TabsTrigger>
                {categorias.map(cat => (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className="px-6 py-3 bg-card text-foreground/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-gold data-[state=active]:ring-offset-1 data-[state=active]:ring-offset-background rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm border border-border flex items-center gap-2 min-h-[52px] transition-all duration-200 snap-start shrink-0 active:scale-[0.97]"
                  >
                    <DynamicIcon name={cat.icono} className="w-5 h-5" /> {cat.nombre}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
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
                {filteredProducts.map((product, idx) => {
                  const stockBajo = product.stock <= (product.stockMinimo || 5)
                  const sinStock = product.stock <= 0
                  return (
                  <Card
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:-translate-y-1 hover:border-gold hover:shadow-[0_12px_28px_-12px_color-mix(in_oklch,var(--navy)_45%,transparent)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group flex flex-col active:scale-[0.97] shadow-[0_2px_10px_-6px_color-mix(in_oklch,var(--navy)_40%,transparent)] relative h-52 animate-fade-up",
                      stockBajo && "border-destructive/40 hover:border-destructive"
                    )}
                    style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
                  >
                    {stockBajo && (
                      <Badge className={cn(
                        "absolute top-2 right-2 z-20 font-bold text-[10px] uppercase tracking-wide border-none shadow-md px-2 py-0.5",
                        sinStock ? "bg-destructive text-destructive-foreground" : "bg-gold text-navy"
                      )}>
                        {sinStock ? 'Agotado' : 'Stock bajo'}
                      </Badge>
                    )}
                    <div className="h-28 bg-secondary/40 w-full relative overflow-hidden border-b border-border/60">
                      {product.imagenUrl ? (
                        <img
                          src={product.imagenUrl}
                          alt={product.nombre}
                          className="object-cover w-full h-full opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                          <DynamicIcon name={product.icono} className="w-14 h-14" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 flex flex-col flex-1 justify-between bg-card z-10">
                      <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2 text-balance">{product.nombre}</h3>
                      <div className="mt-auto pt-1 flex flex-col gap-1">
                        <p className="font-black text-primary text-base leading-none">{formatCurrency(product.precio)}</p>
                        <span className={cn(
                          "text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full w-fit",
                          stockBajo ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"
                        )}>
                          {product.stock} und
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })}
              </div>
            )}
            </ScrollArea>
          </div>
        </div>

      {/* Right Column - Cart */}
      <Card className="w-[300px] lg:w-[380px] grid grid-rows-[auto_auto_1fr_auto] bg-card border-l border-border shadow-[-4px_0_15px_rgba(0,0,0,0.1)] overflow-hidden relative z-20 rounded-none border-y-0 border-r-0 shrink-0">
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

          <div className="overflow-y-auto min-h-0">
            <div className="p-4 pt-0 space-y-3">
              {cart.map((item, idx) => (
                  <div key={item.uid || `${item.id}-${idx}`} className="flex flex-col p-4 rounded-xl border border-border bg-card shadow-sm group">
                      <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                  <DynamicIcon name={item.emoji} className="w-5 h-5" />
                              </div>
                              <div>
                                  <p className="font-semibold text-foreground text-sm leading-tight flex items-center flex-wrap gap-2">
                                      {item.name}
                                      {(item.cantidadEnviada || 0) > 0 && (
                                        <Badge variant="outline" className="text-[10px] h-5 bg-orange-500/10 text-orange-600 border-orange-500/20 px-1.5 font-bold">
                                          {(item.cantidadEnviada || 0) === item.quantity
                                            ? 'En Cocina'
                                            : `${item.cantidadEnviada} en Cocina`
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
                              <button onClick={() => updateQuantity(item.uid || item.id, -1)} className="w-12 h-12 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 touch-target"><Minus className="h-5 w-5"/></button>
                              <span className="w-10 text-center font-bold text-foreground text-lg">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.uid || item.id, 1)} className="w-12 h-12 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 touch-target"><Plus className="h-5 w-5"/></button>
                          </div>
                          <div className="flex items-center gap-4">
                              <p className="font-black text-primary text-lg">{formatCurrency(item.price * item.quantity)}</p>
                              <button onClick={() => removeFromCart(item.uid || item.id)} className="text-muted-foreground hover:text-destructive transition-colors active:scale-95 p-2"><Trash2 className="h-5 w-5"/></button>
                          </div>
                      </div>
                  </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-muted/20 border-t border-border">
              {estadoCocina === 'listo' && (
                <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/30 flex items-center gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                    <ChefHat className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="font-bold text-success text-sm">Pedido listo en cocina</p>
                    <p className="text-[11px] text-muted-foreground">Listo para entregar al cliente</p>
                  </div>
                </div>
              )}
              {estadoCocina === 'parcial' && (
                <div className="mb-4 p-3 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                    <ChefHat className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="font-bold text-warning text-sm">Parcialmente listo</p>
                    <p className="text-[11px] text-muted-foreground">Algunos items siguen en preparación</p>
                  </div>
                </div>
              )}
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
                      try {
                        await enviarPedidoACocina(activePedido.id)
                        toast.success('Pedido enviado a cocina')
                      } catch (e: any) {
                        toast.error(e.message || 'Error al enviar a cocina')
                      }
                    }
                  }} className="h-16 flex-[1] rounded-xl border-input font-bold text-muted-foreground hover:bg-muted hover:text-foreground bg-card shadow-sm active:scale-95">
                      Cocina
                  </Button>
                  <Button
                    onClick={() => setShowPayment(true)}
                    disabled={cart.length === 0}
                    className="gold-cta gold-sheen h-16 flex-[2] rounded-xl bg-gold hover:bg-gold-strong text-navy font-black text-xl tracking-wide transition-all active:scale-95 border-none relative overflow-hidden disabled:opacity-50 disabled:saturate-50 disabled:animate-none"
                  >
                      <Banknote className="mr-2 h-6 w-6 relative z-10" strokeWidth={2.5} /> <span className="relative z-10">COBRAR</span>
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
                const mesaComandasNoCancelacion = pedidoMesa
                  ? comandasActivas.filter(c => c.pedidoId === pedidoMesa.id && c.tipo !== 'cancelacion')
                  : []
                const mesaListaEnCocina = mesaComandasNoCancelacion.length > 0 && mesaComandasNoCancelacion.every(c => c.estado === 'listo')

                return (
                  <button
                    key={mesa.id}
                    onClick={() => { setSelectedMesaId(mesa.id); setShowMesasDialog(false) }}
                    className={cn(
                      "relative flex items-center gap-4 p-4 rounded-2xl border transition-all text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
                      isActive ? "ring-4 ring-primary/20" : "",
                      mesaListaEnCocina
                        ? "bg-success/10 border-success/50 hover:border-success shadow-sm hover:shadow-md hover:-translate-y-1"
                        : mesaTienePedido
                          ? "bg-primary/10 border-primary/50 hover:border-primary shadow-sm hover:shadow-md hover:-translate-y-1"
                          : "bg-card border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-1",
                      mesaTienePedido && isActive && !mesaListaEnCocina && "bg-primary/20 border-primary",
                      mesaListaEnCocina && isActive && "bg-success/20 border-success"
                    )}
                  >
                    {/* Left Icon */}
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner shrink-0",
                        mesaListaEnCocina ? "bg-gradient-to-br from-success/80 to-success text-success-foreground" : mesaTienePedido ? "bg-gradient-to-br from-secondary to-primary text-primary-foreground" : "bg-muted text-muted-foreground/50"
                    )}>
                      {mesaListaEnCocina ? '✓' : mesaTienePedido ? 'M' : '+'}
                    </div>

                    {/* Right Content */}
                    <div className="flex flex-col flex-1 h-full justify-center">
                      <div className="flex items-center justify-between w-full mb-1 gap-2">
                        <p className="font-black text-foreground text-base truncate">{mesa.nombre}</p>
                        <Badge variant="secondary" className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider shrink-0",
                            mesaListaEnCocina
                              ? "bg-success text-success-foreground shadow-sm"
                              : mesaTienePedido ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                        )}>
                          {mesaListaEnCocina ? 'LISTO ✓' : mesaTienePedido ? 'OCUPADA' : 'LIBRE'}
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
                  onClick={() => {
                    setPaymentMethod(method.id)
                    if (method.id !== 'cuenta_cobro') {
                      setSelectedCliente(null)
                      setClienteSearch('')
                      setShowCrearCliente(false)
                    }
                  }}
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

            {/* Client Selector — obligatorio para cuenta_cobro */}
            {paymentMethod === 'cuenta_cobro' && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Cliente <span className="text-destructive">*</span>
                </Label>
                {selectedCliente ? (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-primary bg-primary/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{selectedCliente.nombre}</p>
                        <p className="text-xs text-muted-foreground">{selectedCliente.tipoDocumento} {selectedCliente.documento}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedCliente(null)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={clienteSearch}
                        onChange={(e) => { setClienteSearch(e.target.value); setShowCrearCliente(false) }}
                        placeholder="Buscar por nombre, documento o teléfono..."
                        className="pl-9 bg-input"
                        autoFocus
                      />
                    </div>
                    {clienteSearch.length > 0 && !showCrearCliente && (
                      <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border max-h-44 overflow-y-auto">
                        {clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedCliente({ id: c.id, nombre: c.nombre, documento: c.cedula, tipoDocumento: c.tipoDocumento || 'CC' }); setClienteSearch('') }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left transition-colors"
                          >
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-foreground text-sm">{c.nombre}</p>
                              <p className="text-xs text-muted-foreground">{c.tipoDocumento || 'CC'} {c.cedula}</p>
                            </div>
                          </button>
                        ))}
                        <button
                          onClick={() => { setShowCrearCliente(true); setNuevoCliente(prev => ({ ...prev, documento: /^\d+$/.test(clienteSearch.trim()) ? clienteSearch.trim() : '', nombre: /^\d+$/.test(clienteSearch.trim()) ? '' : clienteSearch.trim() })) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted text-primary text-sm text-left transition-colors"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          {clientesFiltrados.length === 0 ? `No encontrado — Crear "${clienteSearch}"` : 'Crear nuevo cliente'}
                        </button>
                      </div>
                    )}
                    {showCrearCliente && (
                      <div className="border border-border rounded-xl p-3 bg-card space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nuevo cliente</p>
                        <div className="grid grid-cols-5 gap-2">
                          <Select value={nuevoCliente.tipoDocumento} onValueChange={(v) => setNuevoCliente(prev => ({ ...prev, tipoDocumento: v }))}>
                            <SelectTrigger className="col-span-2 bg-input text-sm h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CC">CC</SelectItem>
                              <SelectItem value="NIT">NIT</SelectItem>
                              <SelectItem value="CE">CE</SelectItem>
                              <SelectItem value="PP">Pasaporte</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={nuevoCliente.documento}
                            onChange={(e) => setNuevoCliente(prev => ({ ...prev, documento: e.target.value }))}
                            placeholder="Número *"
                            className="col-span-3 bg-input text-sm h-9"
                          />
                        </div>
                        <Input
                          value={nuevoCliente.nombre}
                          onChange={(e) => setNuevoCliente(prev => ({ ...prev, nombre: e.target.value }))}
                          placeholder="Nombre o razón social *"
                          className="bg-input text-sm h-9"
                        />
                        <Input
                          value={nuevoCliente.telefono}
                          onChange={(e) => setNuevoCliente(prev => ({ ...prev, telefono: e.target.value }))}
                          placeholder="Teléfono"
                          className="bg-input text-sm h-9"
                        />
                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setShowCrearCliente(false)}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            disabled={!nuevoCliente.nombre.trim() || !nuevoCliente.documento.trim() || creandoCliente}
                            onClick={handleCrearCliente}
                          >
                            {creandoCliente ? 'Guardando...' : 'Guardar cliente'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
            <Button variant="outline" onClick={() => { setShowPayment(false); setSelectedCliente(null); setClienteSearch(''); setShowCrearCliente(false) }} disabled={isProcessingPayment}>
              Cancelar
            </Button>
            <Button
              onClick={handlePaymentComplete}
              disabled={(paymentMethod === 'efectivo' && change < 0) || (paymentMethod === 'cuenta_cobro' && !selectedCliente) || isProcessingPayment}
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

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={(open) => { if (!open) { pendingRemoveUid.current = null; setShowCancelConfirm(false) } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Cancelar pedido completo</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Este es el último producto del pedido. Al eliminarlo se cancelará la cuenta completa de <strong>{activePedido?.nombreMesa}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { pendingRemoveUid.current = null; setShowCancelConfirm(false) }}>
              Volver
            </Button>
            <Button variant="destructive" onClick={confirmCancelPedido}>
              Cancelar pedido
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
          <input
            type="number"
            min="1"
            value={fotoCopias}
            onChange={(e) => setFotoCopias(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 text-3xl font-black text-foreground text-center bg-transparent border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
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
