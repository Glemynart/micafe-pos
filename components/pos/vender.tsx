"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Barcode, Plus, Minus, Trash2, CreditCard, Banknote,
  Smartphone, Receipt, ShoppingCart, Package, CheckCircle2,
  X, AlertCircle, HelpCircle, Search, Users, Loader2
} from "lucide-react"

interface CartItem {
  id: string
  nombre: string
  precio: number
  cantidad: number
  codigo: string
  categoria: string
}

const categorias = ["Todos", "Bebidas", "Panaderia", "Granos", "Lacteos", "Aceites", "Aseo", "Snacks", "Enlatados"]
const categoriaBadgeColors: Record<string, { bg: string; text: string }> = {
  Bebidas: { bg: "bg-blue-50", text: "text-blue-700" },
  Panaderia: { bg: "bg-amber-50", text: "text-amber-700" },
  Granos: { bg: "bg-yellow-50", text: "text-yellow-700" },
  Lacteos: { bg: "bg-sky-50", text: "text-sky-700" },
  Aceites: { bg: "bg-orange-50", text: "text-orange-700" },
  Aseo: { bg: "bg-teal-50", text: "text-teal-700" },
  Snacks: { bg: "bg-pink-50", text: "text-pink-700" },
  Enlatados: { bg: "bg-slate-100", text: "text-slate-700" },
}
const billetesRapidos = [50000, 20000, 10000, 5000, 2000, 1000]

const productosDemo = [
  { id: "1", nombre: "Coca-Cola 350ml", precio: 3500, codigo: "7702001010101", categoria: "Bebidas", emoji: "\ud83e\udd64", stock: 50 },
  { id: "2", nombre: "Pan Tajado Bimbo", precio: 8900, codigo: "7702001010102", categoria: "Panaderia", emoji: "\ud83c\udf5e", stock: 30 },
  { id: "3", nombre: "Arroz Diana 1kg", precio: 5200, codigo: "7702001010103", categoria: "Granos", emoji: "\ud83c\udf5a", stock: 40 },
  { id: "4", nombre: "Leche Alpina 1L", precio: 4800, codigo: "7702001010104", categoria: "Lacteos", emoji: "\ud83e\udd5b", stock: 25 },
  { id: "5", nombre: "Aceite Girasol 500ml", precio: 12500, codigo: "7702001010105", categoria: "Aceites", emoji: "\ud83e\uded2", stock: 15 },
  { id: "6", nombre: "Jabon Rey 235g", precio: 2800, codigo: "7702001010106", categoria: "Aseo", emoji: "\ud83e\uddfc", stock: 60 },
  { id: "7", nombre: "Gaseosa Pepsi 2L", precio: 6500, codigo: "7702001010107", categoria: "Bebidas", emoji: "\ud83e\udd64", stock: 35 },
  { id: "8", nombre: "Galletas Festival", precio: 2200, codigo: "7702001010108", categoria: "Snacks", emoji: "\ud83c\udf6a", stock: 80 },
  { id: "9", nombre: "Atun Van Camps", precio: 7800, codigo: "7702001010109", categoria: "Enlatados", emoji: "\ud83d\udc1f", stock: 20 },
  { id: "10", nombre: "Huevos x12", precio: 9500, codigo: "7702001010110", categoria: "Lacteos", emoji: "\ud83e\udd5a", stock: 18 },
]

export function Vender() {
  const [productos, setProductos] = useState<any[]>([])
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [codigoBarra, setCodigoBarra] = useState("")
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo")
  const [efectivoRecibido, setEfectivoRecibido] = useState<number>(0)
  const [ventaCompletada, setVentaCompletada] = useState(false)
  const [categoriaActiva, setCategoriaActiva] = useState("Todos")
  const [showCatalogo, setShowCatalogo] = useState(false)
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("")
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [ticketToPrint, setTicketToPrint] = useState<any>(null)
  const [stockWarning, setStockWarning] = useState<string | null>(null)
  const [showUnknownProduct, setShowUnknownProduct] = useState(false)
  const [unknownBarcode, setUnknownBarcode] = useState("")
  const [unknownPrice, setUnknownPrice] = useState("")
  const [unknownName, setUnknownName] = useState("")
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPriceLookupDialog, setShowPriceLookupDialog] = useState(false)
  const [priceLookupSearch, setPriceLookupSearch] = useState("")
  const [selectedLookupProduct, setSelectedLookupProduct] = useState<any>(null)
  const [showPaymentMethod, setShowPaymentMethod] = useState(false)
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0)
  const [showEfectivoStep, setShowEfectivoStep] = useState(false)
  const [efectivoInput, setEfectivoInput] = useState("")
  const [billeteIdx, setBilleteIdx] = useState(-1)
  const billeteRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [ticketOptIdx, setTicketOptIdx] = useState(0)
  const ticketOptRefs = useRef<(HTMLButtonElement | null)[]>([])
  const paymentMethods = ["efectivo", "transferencia", "tarjeta"] as const
  const inputRef = useRef<HTMLInputElement>(null)
  const lastScanTimeRef = useRef<number>(0)
  const keysBuffer = useRef<{key: string, time: number}[]>([]);
  const handleGlobalBarcodeScanRef = useRef<any>(null);

  const [selectedCliente, setSelectedCliente] = useState<any | null>(null)
  const [selectedClienteId, setSelectedClienteId] = useState<string>("default")
  const [clientes, setClientes] = useState<any[]>([])
  const [showNuevoClienteDialog, setShowNuevoClienteDialog] = useState(false)
  const [nuevoClienteRapido, setNuevoClienteRapido] = useState({
    nombre: "",
    identificacion: "",
    tipo_documento: "CC",
    email: "",
    telefono: "",
    direccion: ""
  })
  const [buscandoNit, setBuscandoNit] = useState(false)
  const [buscarClienteDoc, setBuscarClienteDoc] = useState("")
  const [buscarClienteTipo, setBuscarClienteTipo] = useState("3") // 3 = CC, 6 = NIT
  const [buscandoClienteInteligente, setBuscandoClienteInteligente] = useState(false)

  const buscarClienteInteligente = async () => {
    const doc = buscarClienteDoc.trim()
    if (!doc) {
      toast.error("Digita un documento para buscar")
      return
    }

    setBuscandoClienteInteligente(true)
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        // 1. Buscar localmente primero
        const localCli = await (window as any).api.clientes.getByIdentificacion(doc)
        let localFound = !!localCli
        
        if (localFound) {
          setSelectedClienteId(String(localCli.id))
          setSelectedCliente(localCli)
          toast.success("Cliente seleccionado de base local")
          
          if (localCli.email && localCli.email.includes("@")) {
            setBuscandoClienteInteligente(false)
            setBuscarClienteDoc("")
            return
          }
        }

        // 2. Buscar en Factus DIAN Acquirer si falta el correo o no existe
        if ((window as any).api.factus?.consultarAdquiriente) {
          toast.loading("Consultando en la DIAN...", { id: "dian-search" })
          const res = await (window as any).api.factus.consultarAdquiriente(buscarClienteTipo, doc)
          toast.dismiss("dian-search")
          
          if (res.ok && res.data && res.data.name) {
            const dianData = res.data
            toast.success("Datos obtenidos de la DIAN")

            if (localFound) {
              const updatedCli = { ...localCli, email: dianData.email || localCli.email, nombre: dianData.name || localCli.nombre }
              await (window as any).api.clientes.save(updatedCli)
              setSelectedCliente(updatedCli)
              const updatedList = await (window as any).api.clientes.getAll()
              setClientes(updatedList)
              setBuscandoClienteInteligente(false)
              setBuscarClienteDoc("")
              return
            }

            let tipoDocString = "CC";
            if (buscarClienteTipo === "6") tipoDocString = "NIT";
            if (buscarClienteTipo === "5") tipoDocString = "CE";
            
            setNuevoClienteRapido({
              ...nuevoClienteRapido,
              nombre: dianData.name || "",
              identificacion: doc,
              tipo_documento: tipoDocString,
              email: dianData.email || "",
            })
            setShowNuevoClienteDialog(true)
            setBuscandoClienteInteligente(false)
            setBuscarClienteDoc("")
            return
          }
        }
        
        if (!localFound) {
          toast.error("No encontrado en la DIAN. Llena los datos manual.")
          setNuevoClienteRapido({ ...nuevoClienteRapido, identificacion: doc })
          setShowNuevoClienteDialog(true)
        }
      }
    } catch (err: any) {
      toast.dismiss("dian-search")
      console.error(err)
      if (!selectedCliente) {
        toast.error("Error al buscar en DIAN. Llénalo manual.")
        setNuevoClienteRapido({ ...nuevoClienteRapido, identificacion: doc })
        setShowNuevoClienteDialog(true)
      }
    } finally {
      setBuscandoClienteInteligente(false)
    }
  }

  const buscarPorNitRapido = async () => {
    const nit = nuevoClienteRapido.identificacion.trim()
    if (!nit) {
      toast.error("Digita un número de identificación para buscar")
      return
    }

    setBuscandoNit(true)
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        // 1. Buscar localmente primero
        const localCli = await (window as any).api.clientes.getByIdentificacion(nit)
        if (localCli) {
          setNuevoClienteRapido({
            nombre: localCli.nombre || "",
            identificacion: localCli.identificacion || "",
            tipo_documento: localCli.tipo_documento || "CC",
            email: localCli.email || "",
            telefono: localCli.telefono || "",
            direccion: localCli.direccion || "",
          })
          toast.success("Cliente encontrado en la base de datos local")
          setBuscandoNit(false)
          return
        }

        // 2. Si no está local, buscar en Factus API
        if ((window as any).api.factus?.buscarCliente) {
          const res = await (window as any).api.factus.buscarCliente(nit)
          if (res.ok && res.cliente) {
            const fc = res.cliente
            setNuevoClienteRapido({
              ...nuevoClienteRapido,
              nombre: fc.names || fc.company || fc.nombre || "",
              email: fc.email || "",
              telefono: fc.phone || fc.telefono || "",
              direccion: fc.address || fc.direccion || "",
            })
            toast.success("Cliente encontrado en Factus y campos autocompletados")
          } else {
            toast.info("No se encontró el NIT en Factus. Completa los datos manualmente.")
          }
        } else {
          toast.info("NIT no registrado localmente. Completa los datos manualmente.")
        }
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Error al buscar el NIT: " + err.message)
    } finally {
      setBuscandoNit(false)
    }
  }

  const loadClientes = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api?.clientes) {
        const list = await (window as any).api.clientes.getAll()
        setClientes(list || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const registrarClienteRapido = async () => {
    if (!nuevoClienteRapido.nombre.trim()) {
      toast.error("El nombre es requerido")
      return
    }
    if (!nuevoClienteRapido.identificacion.trim()) {
      toast.error("El número de identificación es requerido")
      return
    }
    if (!nuevoClienteRapido.email.trim()) {
      toast.error("El correo electrónico es requerido")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(nuevoClienteRapido.email.trim())) {
      toast.error("Por favor ingresa un correo electrónico válido")
      return
    }

    try {
      if (typeof window !== "undefined" && (window as any).api?.clientes) {
        const cliToSave = {
          ...nuevoClienteRapido,
          nombre: nuevoClienteRapido.nombre.trim(),
          identificacion: nuevoClienteRapido.identificacion.trim(),
          email: nuevoClienteRapido.email.trim(),
          estado: 1
        }
        const res = await (window as any).api.clientes.save(cliToSave)
        toast.success("Cliente registrado con éxito")
        
        // Reload list
        const list = await (window as any).api.clientes.getAll()
        setClientes(list || [])
        
        // Set as selected client
        // Wait, database returns the new client id in res or we can find it
        const savedCli = list.find((c: any) => c.identificacion === cliToSave.identificacion)
        if (savedCli) {
          setSelectedCliente(savedCli)
          setSelectedClienteId(String(savedCli.id))
        }
        
        // Reset and close dialog
        setNuevoClienteRapido({
          nombre: "",
          identificacion: "",
          tipo_documento: "CC",
          email: "",
          telefono: "",
          direccion: ""
        })
        setShowNuevoClienteDialog(false)
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al registrar cliente (identificación duplicada)")
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        if (typeof window !== "undefined" && (window as any).api) {
          setProductos(await (window as any).api.productos.getAll() || [])
        } else {
          setProductos(productosDemo)
        }
      } catch {
        setProductos(productosDemo)
      }
    };
    load()
    loadClientes()
  }, [])
  
  useEffect(() => { try { if (typeof window !== "undefined") { const saved = localStorage.getItem("pos_carrito"); if (saved) setCarrito(JSON.parse(saved)) } } catch {} }, [])
  useEffect(() => { try { localStorage.setItem("pos_carrito", JSON.stringify(carrito)) } catch {} }, [carrito])

  const productosFiltrados = productos.filter((p) => {
    const matchesCategory = categoriaActiva === "Todos" || p.categoria === categoriaActiva;
    const matchesSearch = busquedaCatalogo === "" || 
      (p.nombre || "").toLowerCase().includes(busquedaCatalogo.toLowerCase()) ||
      (p.codigo || "").includes(busquedaCatalogo) ||
      (p.barcode || "").includes(busquedaCatalogo);
    return matchesCategory && matchesSearch;
  });
  const agregarAlCarrito = (producto: any) => { setCarrito((prev) => { const exist = prev.find((i) => i.id === producto.id); if (exist) { if (exist.cantidad < (producto.stock || 999)) return prev.map((i) => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i); else { setStockWarning(`Stock maximo: "${producto.nombre}"`); setTimeout(() => setStockWarning(null), 4000); return prev } } return [...prev, { id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1, codigo: producto.codigo || producto.barcode || "", categoria: producto.categoria || "General" }] }) }
  const actualizarCantidad = (id: string, delta: number) => { setCarrito((prev) => prev.map((item) => { if (item.id !== id) return item; const newCantidad = item.cantidad + delta; if (newCantidad <= 0) return { ...item, cantidad: 0 }; const prod = productos.find((p) => p.id === id); if (prod && newCantidad > prod.stock) { setStockWarning(`Sin stock: "${prod.nombre}"`); setTimeout(() => setStockWarning(null), 4000) } return { ...item, cantidad: newCantidad } }).filter((item) => item.cantidad > 0)) }
  const eliminarDelCarrito = (id: string) => { setCarrito((prev) => prev.filter((item) => item.id !== id)) }

  const buscarPorCodigo = () => {
    const trimmed = codigoBarra.trim();
    if (trimmed === "") {
      // Evitar que el doble Enter del lector (CR/LF) abra la ventana de pago
      if (Date.now() - lastScanTimeRef.current < 800) {
        return;
      }
      if (carrito.length > 0) {
        setPaymentMethodIndex(0);
        setShowPaymentMethod(true);
      }
      return;
    }

    // Registrar marca de tiempo del escaneo actual
    lastScanTimeRef.current = Date.now();

    const esCodigoGenerico = trimmed === "1000" || trimmed === "0000000001000";
    const producto = productos.find((p) => p.barcode === trimmed || p.codigo === trimmed);
    
    if (producto && !esCodigoGenerico) {
      agregarAlCarrito(producto);
      setCodigoBarra("");
    } else {
      setUnknownBarcode(trimmed);
      setUnknownPrice("");
      setUnknownName("");
      setShowUnknownProduct(true);
      setCodigoBarra("");
    }
  }
  const agregarProductoDesconocido = async () => {
    const precio = parseInt(unknownPrice) || 0;
    if (precio <= 0) {
      toast.error("Ingrese un precio valido");
      return;
    }
    if (!unknownName.trim()) {
      toast.error("Ingrese un nombre para el producto");
      return;
    }
    const barcodeVal = unknownBarcode;
    const esCodigoGenerico = barcodeVal === "1000" || barcodeVal === "0000000001000";

    const prodCreado: any = {
      nombre: unknownName.trim(),
      precio,
      codigo: barcodeVal,
      barcode: barcodeVal,
      categoria: "General",
      stock: 0,
      iva: 19,
      impoconsumo: 0,
      emoji: "📦"
    };

    if (!esCodigoGenerico) {
      try {
        if (typeof window !== "undefined" && (window as any).api?.productos?.save) {
          const res = await (window as any).api.productos.save(prodCreado);
          if (res && res.id) {
            prodCreado.id = res.id;
            toast.success("Producto registrado permanentemente en el inventario");
          } else {
            prodCreado.id = "tmp_" + Date.now();
            toast.warning("Se agregó de forma temporal (error al registrar en inventario)");
          }
        } else {
          prodCreado.id = "tmp_" + Date.now();
        }
      } catch (err: any) {
        console.error(err);
        prodCreado.id = "tmp_" + Date.now();
        toast.warning("Se agregó de forma temporal (error de comunicación con el sistema)");
      }
    } else {
      prodCreado.id = "tmp_" + Date.now();
      toast.success("Producto genérico agregado correctamente");
    }

    setProductos((prev) => [...prev, prodCreado]);
    agregarAlCarrito(prodCreado);
    setShowUnknownProduct(false);
  }

  let total = 0, subtotal = 0, iva = 0, impoconsumo = 0
  carrito.forEach(item => { total += item.precio * item.cantidad; const prodRef = productos.find(p => p.id === item.id) || {}; const pIva = parseFloat(prodRef.iva || 0); const pImpo = parseFloat(prodRef.impoconsumo || 0); const factorImpuesto = 1 + (pIva / 100) + (pImpo / 100); const precioBase = item.precio / factorImpuesto; subtotal += precioBase * item.cantidad; iva += precioBase * (pIva / 100) * item.cantidad; impoconsumo += precioBase * (pImpo / 100) * item.cantidad })
  const cambio = efectivoRecibido - total

  const confirmarEliminarItem = () => { if (selectedCartIndex >= 0 && selectedCartIndex < carrito.length) { eliminarDelCarrito(carrito[selectedCartIndex].id); setSelectedCartIndex(-1) }; setShowDeleteConfirm(false) }

  handleGlobalBarcodeScanRef.current = (barcode: string) => {
    setShowPaymentMethod(false);
    setShowEfectivoStep(false);
    setShowUnknownProduct(false);
    setShowPrintDialog(false);
    setShowDeleteConfirm(false);
    setShowNuevoClienteDialog(false);
    
    setEfectivoInput("");
    setUnknownPrice("");
    setUnknownName("");
    setCodigoBarra("");
    
    lastScanTimeRef.current = Date.now();

    const esCodigoGenerico = barcode === "1000" || barcode === "0000000001000";
    const producto = productos.find((p) => p.barcode === barcode || p.codigo === barcode);
    
    if (producto && !esCodigoGenerico) {
      agregarAlCarrito(producto);
    } else {
      setUnknownBarcode(barcode);
      setUnknownPrice("");
      setUnknownName("");
      setShowUnknownProduct(true);
    }
  };

  useEffect(() => {
    const handleScanner = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.key.length === 1) {
        keysBuffer.current.push({key: e.key, time: now});
      }

      if (e.key === "Enter") {
        const recentKeys = keysBuffer.current.filter(k => now - k.time < 1000);
        if (recentKeys.length >= 4) {
          const timeDiff = recentKeys[recentKeys.length - 1].time - recentKeys[0].time;
          if (timeDiff < recentKeys.length * 60) {
            const barcode = recentKeys.map(k => k.key).join("");
            e.preventDefault();
            e.stopPropagation();
            if (handleGlobalBarcodeScanRef.current) {
              handleGlobalBarcodeScanRef.current(barcode);
            }
            keysBuffer.current = [];
            return;
          }
        }
        keysBuffer.current = [];
      }
    };
    window.addEventListener("keydown", handleScanner, true);
    return () => window.removeEventListener("keydown", handleScanner, true);
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

      if (showDeleteConfirm) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmarEliminarItem();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDeleteConfirm(false);
          return;
        }
      }

      if (showPaymentMethod && !showEfectivoStep) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setPaymentMethodIndex(prev => (prev + 1) % paymentMethods.length);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setPaymentMethodIndex(prev => prev <= 0 ? paymentMethods.length - 1 : prev - 1);
          return;
        }
        if (e.key === "Enter" || e.key === "F9") {
          e.preventDefault();
          confirmarMetodoPago();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowPaymentMethod(false);
          return;
        }
      }

      // Check if we want to open the payment method dialog
      if ((e.key === "Enter" || e.key === "F9") && !showPaymentMethod && !showPrintDialog && !showUnknownProduct && !showDeleteConfirm && !showNuevoClienteDialog && !showPriceLookupDialog) {
        const isBarcodeFocused = activeEl === inputRef.current;
        const isBarcodeEmpty = !codigoBarra || codigoBarra.trim() === "";
        if (!isInput || (isBarcodeFocused && isBarcodeEmpty)) {
          e.preventDefault();
          
          // Evitar que el doble Enter del lector (CR/LF) abra la ventana de pago
          if (e.key === "Enter" && Date.now() - lastScanTimeRef.current < 800) {
            return;
          }
          
          if (carrito.length > 0) {
            setPaymentMethodIndex(0);
            setShowPaymentMethod(true);
          }
          return;
        }
      }

      if (e.key === "F12") {
        e.preventDefault();
        setShowPriceLookupDialog(true);
        return;
      }

      if (e.key === "ArrowDown" && carrito.length > 0 && !isInput) {
        e.preventDefault();
        setSelectedCartIndex(prev => (prev + 1) % carrito.length);
        return;
      }
      if (e.key === "ArrowUp" && carrito.length > 0 && !isInput) {
        e.preventDefault();
        setSelectedCartIndex(prev => prev <= 0 ? carrito.length - 1 : prev - 1);
        return;
      }
      if (e.key === "F5" && selectedCartIndex >= 0 && selectedCartIndex < carrito.length) {
        e.preventDefault();
        setShowDeleteConfirm(true);
        return;
      }
      if (e.key === "Escape" && selectedCartIndex >= 0) {
        e.preventDefault();
        setSelectedCartIndex(-1);
        return;
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [
    carrito,
    metodoPago,
    efectivoRecibido,
    total,
    selectedCartIndex,
    showPaymentMethod,
    showEfectivoStep,
    paymentMethodIndex,
    showPriceLookupDialog,
    showPrintDialog,
    showUnknownProduct,
    showDeleteConfirm,
    showNuevoClienteDialog,
    codigoBarra,
    lastScanTimeRef,
    confirmarEliminarItem
  ])

  useEffect(() => { const handle = (e: KeyboardEvent) => { const el = document.activeElement; if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true")) return; if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return; if (inputRef.current) inputRef.current.focus() }; window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle) }, [])

  const agregarBillete = (valor: number) => { setEfectivoRecibido(valor) }
  const confirmarMetodoPago = (metodoOpcional?: string) => {
    const metodo = metodoOpcional || paymentMethods[paymentMethodIndex];
    setMetodoPago(metodo as any);
    if (metodo === "efectivo") {
      setEfectivoInput("");
      setShowEfectivoStep(true);
    } else {
      setShowPaymentMethod(false);
      completarVentaConMetodo(metodo, total);
    }
  }
  const completarVentaEfectivo = () => {
    const monto = efectivoInput ? parseInt(efectivoInput.replace(/\D/g, ""), 10) || total : total;
    if (monto < total) {
      toast.error("El efectivo recibido es menor al total a pagar");
      return;
    }
    setEfectivoRecibido(monto);
    setShowEfectivoStep(false);
    setShowPaymentMethod(false);
    completarVentaConMetodo("efectivo", monto);
  }
  const realizarBusquedaPrecio = async (val: string) => {
    setPriceLookupSearch(val);
    const query = val.trim();
    if (!query) {
      setSelectedLookupProduct(null);
      return;
    }
    const match = productos.find(p => p.barcode === query || p.codigo === query);
    if (match) {
      setSelectedLookupProduct(match);
      return;
    }
    if (query.length >= 3 && typeof window !== "undefined" && (window as any).api?.productos?.getByBarcode) {
      try {
        const fromDb = await (window as any).api.productos.getByBarcode(query);
        if (fromDb) {
          setSelectedLookupProduct({
            id: fromDb.id,
            nombre: fromDb.nombre,
            precio: fromDb.precio,
            stock: fromDb.stock,
            codigo: fromDb.codigo,
            barcode: fromDb.barcode,
            categoria: fromDb.categoria
          });
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedLookupProduct(null);
  }

  const completarVenta = (metodoExplicito?: string) => {
    const metodo = metodoExplicito || metodoPago;
    let pago = efectivoRecibido;
    if (pago === 0) {
      pago = total;
    }
    if (metodo === "efectivo" && efectivoRecibido > 0 && efectivoRecibido < total) {
      toast.error("El efectivo recibido es menor al total");
      return;
    }
    completarVentaConMetodo(metodo, pago);
  }
  const completarVentaConMetodo = async (metodo: string, pagoRecibido: number) => {
    if (carrito.length === 0) return;
    try {
      const hasApi = typeof window !== "undefined" && (window as any).api;
      
      let numFactura = hasApi 
        ? await (window as any).api.config.nextNumFacturaFisica() 
        : Math.floor(Math.random() * 900000) + 100000;

      const itemsConImpuestos = carrito.map(item => {
        const prodRef = productos.find(p => p.id === item.id) || {} as any;
        const iva = parseFloat(prodRef.iva || 0);
        const impoconsumo = parseFloat(prodRef.impoconsumo || 0);
        const factorImpuesto = 1 + (iva / 100) + (impoconsumo / 100);
        const precioBase = item.precio / factorImpuesto;
        // Only include serializable primitives to avoid IPC clone errors
        return {
          id: String(item.id),
          nombre: String(item.nombre),
          precio: Number(item.precio),
          cantidad: Number(item.cantidad),
          codigo: String(item.codigo || ""),
          categoria: String(item.categoria || ""),
          iva: Number(iva),
          impoconsumo: Number(impoconsumo),
          iva_monto: Number(precioBase * (iva / 100) * item.cantidad),
          impoconsumo_monto: Number(precioBase * (impoconsumo / 100) * item.cantidad),
          subtotal_sin_impuestos: Number(precioBase * item.cantidad),
          subtotal: Number(item.precio * item.cantidad)
        };
      });
      const subtotal_ventas = itemsConImpuestos.reduce((s: number, i: any) => s + i.subtotal_sin_impuestos, 0);
      const iva_total = itemsConImpuestos.reduce((s: number, i: any) => s + i.iva_monto, 0);
      const impoconsumo_total = itemsConImpuestos.reduce((s: number, i: any) => s + i.impoconsumo_monto, 0);
      
      const venta = {
        items: itemsConImpuestos,
        total,
        pago: pagoRecibido,
        cambio: Math.max(0, pagoRecibido - total),
        metodoPago: metodo,
        subtotal_ventas,
        iva_total,
        impoconsumo_total,
        cliente_id: selectedCliente ? selectedCliente.id : null
      };

      let res = { ok: true, ventaId: Math.floor(Math.random() * 100000) };
      if (hasApi) {
        res = await (window as any).api.ventas.registrar(venta);
      }
      
      setProductos(prev => prev.map(p => {
        const cItem = carrito.find(c => c.id === p.id);
        if (cItem) return { ...p, stock: Math.max(0, p.stock - cItem.cantidad) };
        return p
      }));
      setVentaCompletada(true);

      const config = hasApi 
        ? await (window as any).api.config.get() 
        : {
            nombre_tienda: "Autoservicio J Y S",
            nombre_propietario: "Jesus Zapata",
            ciudad: "Apartado",
            telefono: "3233446844",
            nit_tienda: "71800393",
            direccion_tienda: "Calle 92 #95A-119",
            tipo_contribuyente: "No Responsable de IVA",
            responsable_iva: "1",
            impresora_autoPrint: "false",
            impresora_habilitada: "false",
          };

      let cufeReal = '';
      let qrReal = '';
      const isFactusActivo = !!config.factus_client_id && config.factus_client_id.length > 10;

      if (hasApi && (window as any).api.factus && isFactusActivo) {
        const clientPayload = selectedCliente ? {
          tipo: selectedCliente.tipo_documento,
          identificacion: selectedCliente.identificacion,
          nombre: selectedCliente.nombre,
          email: selectedCliente.email,
          telefono: selectedCliente.telefono || "3000000000",
          direccion: selectedCliente.direccion || "Colombia"
        } : {
          tipo: "CC",
          identificacion: "222222222222",
          nombre: "Consumidor Final",
          email: "consumidor@final.com",
          telefono: "3000000000",
          direccion: "Colombia"
        };

        try {
          // Esperar máximo 15 segundos por la respuesta de la DIAN/Factus
          const emitPromise = (window as any).api.factus.emitir({
            ventaId: res.ventaId,
            items: itemsConImpuestos,
            total,
            metodoPago: metodo === "efectivo" ? "Efectivo" : metodo === "tarjeta" ? "Tarjeta" : "Transferencia",
            fecha: new Date().toISOString().split("T")[0],
            cliente: clientPayload
          });

          const fr = await Promise.race([
            emitPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de espera agotado")), 15000))
          ]) as any;

          if (fr?.ok) {
            toast.success("Factura electrónica emitida al correo: " + clientPayload.email);
            cufeReal = fr.cufe || '';
            qrReal = fr.qr || '';
            if (fr.numero) {
              numFactura = fr.numero;
            }
          } else {
            const errMsg = fr?.error || fr?.message || "Error al validar la factura";
            toast.error("DIAN: " + errMsg);
          }
        } catch (err: any) {
          console.error("Error al emitir factura:", err);
          toast.error("Factura DIAN pendiente (sin internet o respuesta lenta). La venta se registró localmente.");
        }
      }

      const ticketBase = {
        ...venta,
        ventaId: res.ventaId,
        fecha: new Date(),
        numFactura,
        config,
        cufe: cufeReal,
        qr: qrReal,
        cliente: selectedCliente ? {
          nombre: selectedCliente.nombre,
          identificacion: selectedCliente.identificacion,
          email: selectedCliente.email,
          telefono: selectedCliente.telefono,
          direccion: selectedCliente.direccion
        } : null
      };

      setTicketToPrint(ticketBase);

      const isAutoPrint = config.impresora_autoPrint === "true" || config.impresora_autoPrint === true;
      const isPrinterEnabled = config.impresora_habilitada !== "false" && config.impresora_habilitada !== false;

      if (isAutoPrint && isPrinterEnabled && hasApi) {
        const html = await generarTicketHTML(ticketBase, config);
        await (window as any).api.print.toPrinter(html);
        setCarrito([]);
        setEfectivoRecibido(0);
        setEfectivoInput("");
        setVentaCompletada(false);
        setTicketToPrint(null);
        setShowPrintDialog(false);
        setMetodoPago("efectivo");
        setSelectedCliente(null);
        setSelectedClienteId("default");
        setShowPaymentMethod(false);
        setShowEfectivoStep(false);
        setBilleteIdx(-1);
        setTicketOptIdx(0);
        toast.success("Venta registrada. Ticket enviado a impresora.");
      } else {
        setShowPrintDialog(true);
      }

      try {
        localStorage.removeItem("pos_carrito");
        localStorage.removeItem("pos_metodoPago");
      } catch {}

      setTimeout(() => {
        setCarrito([]);
        setMetodoPago("efectivo");
        setEfectivoRecibido(0);
        setEfectivoInput("");
        setVentaCompletada(false);
        setSelectedCliente(null);
        setSelectedClienteId("default");
        setShowPaymentMethod(false);
        setShowEfectivoStep(false);
        setBilleteIdx(-1);
        setTicketOptIdx(0);
        if (inputRef.current) inputRef.current.focus();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      toast.error("Error al registrar la venta: " + (err?.message || String(err)));
    }
  }

  const generarTicketHTML = async (data: any, config: any) => {
    const { items, total, pago, cambio, metodoPago: mp, fecha, numFactura } = data;
    
    const fechaStr    = new Date(fecha || new Date()).toLocaleString('es-CO');
    const storeName   = config.nombre_tienda        || 'MiTienda';
    const propietario = config.nombre_propietario   || '';
    const nit         = config.nit_tienda           || '';
    const direccion   = config.direccion_tienda     || '';
    const ciudad      = config.ciudad               || '';
    const tel         = config.telefono             || '';
    const resolucion  = config.resolucion_dian      || '';
    const respIva     = config.responsable_iva === '1';
    const tipoContr   = config.tipo_contribuyente   || '';

    const prefijo = config.prefijo_dian || config.prefijo_factura || 'SETT';
    let cleanNum = numFactura;
    if (typeof cleanNum === 'string') {
      const cleanPref = prefijo.trim().toUpperCase();
      const cleanVal = cleanNum.trim().toUpperCase();
      if (cleanVal.startsWith(cleanPref)) {
        cleanNum = cleanNum.trim().substring(cleanPref.length).trim();
      }
    }
    const numStr = cleanNum ? String(cleanNum).padStart(6, '0') : '';
    
    // Si es Factura Electrónica (DIAN habilitada, Factus configurado, o CUFE/QR presentes)
    const isDian = !!data.cufe || !!data.qr
               || config.facturacion_dian === 'true' || config.facturacion_dian === true
               || (!!config.factus_client_id && config.factus_client_id.length > 10);
    
    let cufe = '';
    let qrData = '';
    
    if (isDian) {
      cufe = data.cufe || 
             Array.from(`${prefijo}${numStr}${fechaStr}${total}${nit}`)
                  .reduce((a,b)=>(((a<<5)-a)+b.charCodeAt(0))|0,0)
                  .toString(16).padStart(40, '0');
      qrData = data.qr || `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentKey=${cufe}`;
    }

    const compradorNombre = data.cliente?.nombre || "CONSUMIDOR FINAL";
    const compradorDoc = data.cliente?.identificacion || "222222222222";

    const subtotalVal = data.subtotal_ventas || total;
    const ivaVal = data.iva_total || 0;
    const impoVal = data.impoconsumo_total || 0;

    const itemsHtml = items.map((i: any) => {
      const nombre = (i.nombre || i.descripcion || '').toUpperCase();
      const cant = i.cantidad || 1;
      const precioVal = Math.round(i.precio || i.precio_unitario || 0);
      const subtotalVal = Math.round(i.subtotal || (cant * precioVal));
      const cod = i.codigo || i.barcode || i.producto_id || i.id || '';
      return `
        <div class="row3">
          <span class="desc">${nombre}<br>
            <span style="font-size: 11.5px; font-weight: bold; color: #000;">Cod: ${cod} | CANT: ${cant}</span>
          </span>
          <span class="unit">$${precioVal.toLocaleString('es-CO')}</span>
          <span class="sub">$${subtotalVal.toLocaleString('es-CO')}</span>
        </div>
      `;
    }).join('');

    let taxesHtml = '';
    if (isDian) {
      if (ivaVal > 0) {
        taxesHtml += `<tr><td>IVA</td><td>19%</td><td>$${Math.round(subtotalVal).toLocaleString('es-CO')}</td><td>$${Math.round(ivaVal).toLocaleString('es-CO')}</td></tr>`;
      }
      if (impoVal > 0) {
        taxesHtml += `<tr><td>INC</td><td>8%</td><td>$${Math.round(subtotalVal).toLocaleString('es-CO')}</td><td>$${Math.round(impoVal).toLocaleString('es-CO')}</td></tr>`;
      }
      if (ivaVal === 0 && impoVal === 0) {
        taxesHtml += `<tr><td>EXENTO</td><td>0%</td><td>$${Math.round(total).toLocaleString('es-CO')}</td><td>$0</td></tr>`;
      }
    }

    return `<html><head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          line-height: 1.35;
          width: 280px;
          margin: 0;
          padding: 0 4px;
          color: #000;
        }
        .center  { text-align: center; }
        .bold    { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
        .titulo  {
          text-align: center;
          font-size: 13px;
          font-weight: bold;
          margin: 8px 0;
          border-top: 1.5px dashed #000;
          border-bottom: 1.5px dashed #000;
          padding: 6px 0;
        }
        .store   { text-align: center; font-size: 15px; font-weight: bold; margin: 6px 0 2px 0; }
        .sub     { text-align: center; font-size: 11px; margin: 2px 0; line-height: 1.25; }
        .sep     { text-align: center; margin: 8px 0; border-top: 1.5px dashed #000; }
        .row2    { display: flex; justify-content: space-between; margin: 3px 0; }
        .row3    { display: flex; margin: 6px 0; border-bottom: 0.5px solid #ddd; padding-bottom: 4px; }
        .row3 .desc { flex: 1; padding-right: 4px; }
        .row3 .unit { width: 70px; text-align: right; font-size: 12px; }
        .row3 .sub  { width: 75px; text-align: right; font-size: 12px; font-weight: bold; }
        .hdr3    { display: flex; font-weight: bold; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; font-size: 12px; }
        .hdr3 .desc { flex: 1; }
        .hdr3 .unit, .hdr3 .sub { width: 75px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
        .total-main{ font-weight: bold; font-size: 15px; border-top: 1.5px dashed #000; padding-top: 6px; margin-top: 6px; }
        .tax-table { width: 100%; font-size: 11px; margin-top: 8px; border-collapse: collapse; }
        .tax-table th { border-bottom: 1.5px dashed #000; text-align: left; font-weight: bold; padding-bottom: 4px; }
        .tax-table td { padding: 4px 0; }
        .cufe    { font-size: 10px; word-break: break-all; text-align: justify; margin: 6px 0; line-height: 1.2; font-family: monospace; }
        .qr-container { text-align: center; margin: 12px 0; }
        .qr-image { display: inline-block; width: 140px; height: 140px; }
        .res     { font-size: 10px; line-height: 1.4; margin-top: 8px; border-top: 1.5px dashed #000; padding-top: 6px; }
        .footer  { text-align: center; margin-top: 15px; font-size: 11px; line-height: 1.4; }
      </style></head><body>
      
      <div class="store uppercase">${storeName}</div>
      ${propietario ? `<div class="sub uppercase">${propietario}</div>` : ''}
      ${nit ? `<div class="sub">NIT: ${nit}</div>` : ''}
      ${direccion ? `<div class="sub uppercase">${direccion}</div>` : ''}
      ${ciudad ? `<div class="sub uppercase">${ciudad} - COLOMBIA</div>` : ''}
      ${tel ? `<div class="sub">TEL: ${tel}</div>` : ''}
      <div class="sub">${tipoContr ? tipoContr : (respIva ? 'Responsable de IVA' : 'No Responsable de IVA')}</div>
      
      <div class="titulo">${isDian ? 'FACTURA ELECTRÓNICA DE VENTA' : 'TICKET DE VENTA'}</div>
      
      <div class="row2"><span class="bold">N° ${isDian ? 'FACTURA' : 'TICKET'}:</span><span class="bold">${isDian ? prefijo + ' ' : ''}${numStr}</span></div>
      <div class="row2"><span>FECHA:</span><span>${fechaStr.split(',')[0]}</span></div>
      <div class="row2"><span>HORA:</span><span>${fechaStr.split(',')[1] || ''}</span></div>
      
      ${isDian ? `
        <div class="sep"></div>
        <div class="sub" style="text-align:left"><span class="bold">ADQUIRIENTE:</span> ${compradorNombre.toUpperCase()}</div>
        <div class="sub" style="text-align:left"><span class="bold">NIT/CC:</span> ${compradorDoc}</div>
      ` : ''}
      
      <div class="sep"></div>
      <div class="hdr3">
        <span class="desc">DESCRIPCIÓN</span>
        <span class="unit">UNIT.</span>
        <span class="sub">TOTAL</span>
      </div>
      
      ${itemsHtml}
      
      <div class="sep"></div>
      <div class="total-row"><span>SUBTOTAL:</span><span>$${Math.round(subtotalVal).toLocaleString('es-CO')}</span></div>
      ${ivaVal > 0 ? `<div class="total-row"><span>IVA:</span><span>$${Math.round(ivaVal).toLocaleString('es-CO')}</span></div>` : ''}
      ${impoVal > 0 ? `<div class="total-row"><span>IMPOCONSUMO:</span><span>$${Math.round(impoVal).toLocaleString('es-CO')}</span></div>` : ''}
      <div class="total-row total-main"><span>TOTAL A PAGAR:</span><span>$${Math.round(total).toLocaleString('es-CO')}</span></div>
      
      <div class="row2" style="margin-top: 6px;"><span class="bold">FORMA PAGO:</span><span class="bold uppercase">${mp}</span></div>
      ${pago > 0 && cambio >= 0 ? `
        <div class="row2"><span>RECIBIDO:</span><span>$${Math.round(pago).toLocaleString('es-CO')}</span></div>
        <div class="row2"><span class="bold">CAMBIO:</span><span class="bold">$${Math.round(cambio).toLocaleString('es-CO')}</span></div>
      ` : ''}
      
      ${isDian ? `
        <div class="sep"></div>
        <div class="bold center" style="font-size:11px;">DETALLE DE IMPUESTOS</div>
        <table class="tax-table">
          <thead>
            <tr><th>TIPO</th><th>TASA</th><th>BASE</th><th>VALOR</th></tr>
          </thead>
          <tbody>
            ${taxesHtml}
          </tbody>
        </table>
        
        <div class="sep"></div>
        <div class="bold">CUFE:</div>
        <div class="cufe">${cufe}</div>
        
        <div class="qr-container">
          <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}" />
        </div>
        
        <div class="res">
          <div>Resolución DIAN N° ${config.resolucion_dian || '187640000001'} Prefijo: ${prefijo} Habilitada del ${config.rango_inicio || '1'} al ${config.rango_fin || '10000'}</div>
          ${config.resolucion_vigencia ? `<div>Vigencia: ${config.resolucion_vigencia}</div>` : ''}
          <div class="bold" style="margin-top:4px">Proveedor Tecnológico: FACTUS S.A.S. NIT: 901724254-1</div>
        </div>
      ` : ''}
      
      <div class="footer">
        <p class="bold">MiTienda POS</p>
        <p>Desarrollado por Sebastian Agudelo Muñoz - NIT: 1000292576-3</p>
        <p style="margin-top:6px; font-weight: bold;">¡GRACIAS POR SU COMPRA!</p>
      </div>
      <div style="height:35px"></div>
    </body></html>`;
  };
  const imprimirTicketHTML = async (data: any, config: any) => {
    const html = await generarTicketHTML(data, config);
    try {
      if (typeof window !== "undefined" && (window as any).api?.print?.ticket) {
        return await (window as any).api.print.ticket(html);
      } else {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.print();
          return { success: true };
        }
        return { success: false };
      }
    } catch (err) {
      console.error(err);
      return { success: false };
    }
  }

  const cancelarVenta = () => { setCarrito([]); setEfectivoRecibido(0); setMetodoPago("efectivo") }
  const formatCOP = (value: number) => { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(value) }

  const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0)

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 lg:gap-6">
      <div className="flex-1 flex flex-col min-w-0 gap-4 lg:gap-6 lg:h-[calc(100vh-120px)]">
        <Card className="shadow-lg shadow-black/[0.03] border-0">
          <CardContent className="p-2">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Barcode className="h-5 w-5" />
                </div>
                <Input ref={inputRef} placeholder="Escanear / F12=Consultar / F9=Cobrar / Flechas=Seleccionar / F5=Eliminar"
                  value={codigoBarra} onChange={(e) => { setCodigoBarra(e.target.value) }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarPorCodigo() } }}
                  className="pl-12 h-10 text-base border-2 focus:border-primary bg-secondary/30" />
              </div>
              <Button variant={showCatalogo ? "default" : "secondary"} className="h-10 px-4 gap-2" onClick={() => setShowCatalogo(!showCatalogo)}>
                <Package className="h-5 w-5" />Catalogo
              </Button>
            </div>
          </CardContent>
        </Card>

        {showCatalogo && (
          <Card className="flex-1 shadow-lg shadow-black/[0.03] border-0 overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/50">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg shrink-0">Seleccionar Producto</CardTitle>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar en catálogo..."
                    value={busquedaCatalogo}
                    onChange={(e) => setBusquedaCatalogo(e.target.value)}
                    className="pl-9 h-8 text-xs bg-card"
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setShowCatalogo(false); setBusquedaCatalogo("") }}><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex gap-2 pt-4 flex-wrap">
                {categorias.map((cat) => (
                  <Button key={cat} variant={categoriaActiva === cat ? "default" : "outline"} size="sm" onClick={() => setCategoriaActiva(cat)} className="rounded-full">{cat}</Button>
                ))}
              </div>
            </CardHeader>
            <ScrollArea className="flex-1 h-[calc(100%-120px)]">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {productosFiltrados.slice(0, 80).map((producto) => (
                    <Card key={producto.id} className="cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5" onClick={() => { agregarAlCarrito(producto); setShowCatalogo(false); setBusquedaCatalogo("") }}>
                      <CardContent className="p-4 text-center space-y-2">
                        <div className="text-4xl">{producto.emoji || "\ud83d\udecd\ufe0f"}</div>
                        <Badge className={`${(categoriaBadgeColors[producto.categoria] || {}).bg || "bg-gray-100"} ${(categoriaBadgeColors[producto.categoria] || {}).text || "text-gray-700"} text-[10px]`}>{producto.categoria}</Badge>
                        <h3 className="font-semibold text-foreground line-clamp-2 mb-1">{producto.nombre}</h3>
                        <p className="text-xs text-muted-foreground font-mono mb-2">{producto.codigo}</p>
                        <p className="text-xl font-bold text-primary">{formatCOP(producto.precio)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {productosFiltrados.length > 80 && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Mostrando primeros 80 productos de {productosFiltrados.length}. Escribe en el buscador para filtrar más.
                  </p>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        )}

        {!showCatalogo && (
          <Card className="flex-1 shadow-lg shadow-black/[0.03] border-0 overflow-hidden">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />Productos en Caja
                {totalItems > 0 && (<Badge className="bg-primary text-primary-foreground ml-auto text-sm px-3">{totalItems} {totalItems === 1 ? "item" : "items"}</Badge>)}
              </CardTitle>
            </CardHeader>
            {stockWarning && (
              <div className="bg-warning/10 border-b border-warning/20 p-3 px-6 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                <AlertCircle className="h-5 w-5 text-warning shrink-0" /><p className="text-sm font-medium text-warning-foreground">{stockWarning}</p>
              </div>
            )}
            <ScrollArea className="flex-1 h-0 min-h-[350px] lg:min-h-0">
              <CardContent className="p-3 lg:p-4">
                {carrito.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 lg:py-24 text-muted-foreground">
                    <div className="relative mb-6 p-4">
                      <Barcode className="h-16 w-16 lg:h-24 lg:w-24 text-slate-300" strokeWidth={1.5} />
                      <div className="absolute inset-x-4 top-4 bottom-4 overflow-hidden rounded-lg">
                        <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-line shadow-lg shadow-emerald-400/50" />
                      </div>
                    </div>
                    <p className="text-lg lg:text-xl font-semibold tracking-tight text-slate-600">Escanea un producto para comenzar</p>
                    <p className="text-xs lg:text-sm mt-2 text-slate-400 font-medium">O abre el catalogo para buscar manualmente</p>
                  </div>
                ) : (
                  <div className="space-y-2 lg:space-y-3">
                    {carrito.map((item, index) => (
                      <div key={item.id} className={`flex items-center gap-3 p-3 lg:p-4 rounded-xl transition-all cursor-pointer ${index === selectedCartIndex ? "bg-primary/10 border-2 border-primary shadow-md shadow-primary/10" : "bg-secondary/30 hover:bg-secondary/50 border-2 border-transparent"}`} onClick={() => setSelectedCartIndex(index)}>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm lg:text-base text-foreground truncate">
                            {item.cantidad > 1 && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold mr-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded text-xs lg:text-sm">
                                {item.cantidad}x
                              </span>
                            )}
                            {item.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">{item.codigo}</p>
                        </div>
                        <div className="text-right mr-2 lg:mr-4">
                          <p className="text-base lg:text-xl font-bold text-primary">{formatCOP(item.precio * item.cantidad)}</p>
                          <p className="text-[10px] lg:text-xs text-muted-foreground">{formatCOP(item.precio)} c/u</p>
                        </div>
                        <div className="flex items-center gap-1 lg:gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => actualizarCantidad(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                          <input type="text" inputMode="numeric" value={item.cantidad} onFocus={(e) => e.target.select()} onChange={(e) => { const val = e.target.value.replace(/\D/g, ""); if (val === "") { actualizarCantidad(item.id, 1 - item.cantidad); } else { const parsed = parseInt(val, 10); if (parsed > 0) actualizarCantidad(item.id, parsed - item.cantidad); } }} className="w-10 lg:w-14 h-8 text-center text-sm lg:text-lg font-semibold text-foreground bg-secondary/30 hover:bg-secondary/60 border border-transparent focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded outline-none transition-all" />
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => actualizarCantidad(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => eliminarDelCarrito(item.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        )}
      </div>

      <Card className="w-full lg:w-[380px] flex flex-col shadow-xl shadow-black/[0.04] border-0 lg:sticky lg:top-6 lg:h-[calc(100vh-120px)]">
        <CardHeader className="p-3 lg:p-4 border-b border-border/50 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base lg:text-lg"><Receipt className="h-4 lg:h-5 w-4 lg:w-5 text-primary" />Resumen y Pago</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-3 lg:p-4 gap-3 lg:gap-3.5 overflow-auto">
          <div className="space-y-1">
            <div className="flex justify-between text-muted-foreground text-[11px]"><span>Subtotal Base</span><span className="font-medium">{formatCOP(subtotal)}</span></div>
            <div className="flex justify-between items-baseline pt-1 border-t border-border/40">
              <span className="text-sm font-bold text-foreground">Total a Pagar</span>
              <span className="text-3xl font-black text-primary">{formatCOP(total)}</span>
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente Facturación</label>
              <div className="space-x-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" onClick={() => { setSelectedClienteId("default"); setSelectedCliente(null); }}>
                  Consumidor Final
                </Button>
              </div>
            </div>
            
            {!selectedCliente && selectedClienteId === "default" && (
              <div className="flex space-x-1">
                <Select value={buscarClienteTipo} onValueChange={setBuscarClienteTipo}>
                  <SelectTrigger className="w-[80px] bg-secondary/30 h-10 border border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">CC</SelectItem>
                    <SelectItem value="6">NIT</SelectItem>
                    <SelectItem value="5">CE</SelectItem>
                    <SelectItem value="1">RC</SelectItem>
                    <SelectItem value="2">TI</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Número de documento..."
                  className="h-10 border-border bg-secondary/30"
                  value={buscarClienteDoc}
                  onChange={(e) => setBuscarClienteDoc(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter') buscarClienteInteligente() }}
                />
                <Button 
                  className="h-10 w-10 shrink-0" 
                  disabled={buscandoClienteInteligente || !buscarClienteDoc.trim()} 
                  onClick={buscarClienteInteligente}
                >
                  {buscandoClienteInteligente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            )}

            {(!selectedCliente && selectedClienteId === "default") && (
              <div className="bg-secondary/40 border border-border p-2.5 rounded-lg text-xs space-y-1 mt-1">
                <div className="font-semibold text-foreground truncate">Consumidor Final</div>
                <div className="text-muted-foreground font-mono truncate">222222222222</div>
              </div>
            )}

            {selectedCliente && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs space-y-1 mt-1 relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-1 right-1 h-6 w-6 text-emerald-600 hover:text-destructive hover:bg-destructive/10"
                  onClick={() => { setSelectedClienteId("default"); setSelectedCliente(null); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 truncate pr-6">{selectedCliente.nombre}</div>
                <div className="text-emerald-700/80 font-mono truncate">{selectedCliente.identificacion}</div>
                {selectedCliente.email && <div className="text-emerald-700/80 truncate">{selectedCliente.email}</div>}
              </div>
            )}
          </div>

          <p className="text-[10px] font-medium text-muted-foreground text-center bg-secondary/20 py-1.5 rounded-lg border border-border/30">
            F9 o Enter (vacío) para cobrar
          </p>


        </CardContent>
        <div className="p-3.5 border-t border-border/40 space-y-2 shrink-0 bg-card">
          <Button className="w-full h-11 text-base font-bold shadow-md shadow-primary/10 hover:shadow-lg transition-all" disabled={carrito.length === 0}
            onClick={() => { if (carrito.length === 0) return; setPaymentMethodIndex(0); setShowPaymentMethod(true) }}>
            <Banknote className="mr-2 h-4 w-4" />Cobrar (F9)
          </Button>
          {carrito.length > 0 && (
            <Button variant="outline" size="sm" className="w-full h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/5 hover:border-destructive/30" onClick={cancelarVenta}>
              Cancelar Venta
            </Button>
          )}
        </div>
      </Card>

      <Dialog open={showPrintDialog} onOpenChange={(open) => { if (!open) { setShowPrintDialog(false); setTicketToPrint(null); setTicketOptIdx(0); } }}>
        <DialogContent
          className="sm:max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl"
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => ticketOptRefs.current[0]?.focus(), 50); }}
          onKeyDown={(e) => {
            const opts = 3;
            if (e.key === "ArrowRight") { e.preventDefault(); const n = (ticketOptIdx + 1) % opts; setTicketOptIdx(n); ticketOptRefs.current[n]?.focus(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); const n = (ticketOptIdx - 1 + opts) % opts; setTicketOptIdx(n); ticketOptRefs.current[n]?.focus(); }
          }}
        >
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2 justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Venta Registrada!
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-muted-foreground mt-1">
              La venta se guardó correctamente. ¿Cómo deseas el ticket?
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3 py-2">
            {([
              { label: "Sin ticket", icon: <X className="h-7 w-7" />, action: () => { setShowPrintDialog(false); setTicketToPrint(null); setTicketOptIdx(0); } },
              { label: "Impresora Física", icon: <Receipt className="h-7 w-7" />, action: async () => { if (ticketToPrint) { const html = await generarTicketHTML(ticketToPrint, ticketToPrint.config); setShowPrintDialog(false); setTicketToPrint(null); setTicketOptIdx(0); if (typeof window !== "undefined" && (window as any).api) { await (window as any).api.print.toPrinter(html); } } } },
              { label: "Guardar PDF", icon: <CheckCircle2 className="h-7 w-7" />, action: async () => { if (ticketToPrint) { const res = await imprimirTicketHTML(ticketToPrint, ticketToPrint.config); if ((res as any)?.success) { setShowPrintDialog(false); setTicketToPrint(null); setTicketOptIdx(0); } } } },
            ] as const).map((opt, i) => (
              <button
                key={opt.label}
                ref={(el) => { ticketOptRefs.current[i] = el; }}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all focus:outline-none ${
                  ticketOptIdx === i
                    ? "bg-primary/10 border-primary text-foreground shadow-lg scale-105"
                    : "bg-card border-border/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
                onClick={opt.action}
                onFocus={() => setTicketOptIdx(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); opt.action(); }
                  else if (e.key === "ArrowRight") { e.preventDefault(); const n = (i + 1) % 3; setTicketOptIdx(n); ticketOptRefs.current[n]?.focus(); }
                  else if (e.key === "ArrowLeft") { e.preventDefault(); const n = (i - 1 + 3) % 3; setTicketOptIdx(n); ticketOptRefs.current[n]?.focus(); }
                }}
              >
                <span className={ticketOptIdx === i ? "text-primary" : "text-muted-foreground"}>{opt.icon}</span>
                <span className="text-xs font-bold text-center leading-tight">{opt.label}</span>
              </button>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground text-center mt-3">
            Usa ← → para navegar · Enter para confirmar · Esc para cerrar sin ticket
          </p>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnknownProduct} onOpenChange={setShowUnknownProduct}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-warning" />Producto desconocido</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs space-y-3 text-left text-muted-foreground">
                <p>El código <span className="font-mono font-bold">{unknownBarcode}</span> no está en el inventario.</p>
                <div className="space-y-2 pt-2">
                  <Label>Nombre del producto</Label>
                  <Input type="text" placeholder="Ej: Gaseosa 1L" value={unknownName} onChange={(e) => setUnknownName(e.target.value)} autoFocus className="text-sm font-bold" />
                </div>
                <div className="space-y-2 pt-2">
                  <Label>Precio de venta (IVA 19% incluido)</Label>
                  <Input type="number" placeholder="Ej: 5000" value={unknownPrice} onChange={(e) => setUnknownPrice(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); agregarProductoDesconocido(); } }} className="text-lg font-bold" />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnknownProduct(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={agregarProductoDesconocido} className="bg-primary hover:bg-primary/90">Agregar a la Venta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto del carrito</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {selectedCartIndex >= 0 && carrito[selectedCartIndex] && (
                <>Eliminar <strong>{carrito[selectedCartIndex].nombre}</strong> ({carrito[selectedCartIndex].cantidad} unidad(es)) de la venta actual?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={confirmarEliminarItem} className="bg-destructive hover:bg-destructive/90" autoFocus>Eliminar (Enter)</AlertDialogAction>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNuevoClienteDialog} onOpenChange={setShowNuevoClienteDialog}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Registrar Nuevo Cliente</DialogTitle>
            <DialogDescription className="sr-only">Formulario para registrar un nuevo cliente de forma rápida.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-3 text-xs">
            <div className="space-y-1">
              <Label>Nombre / Razón Social <span className="text-rose-500">*</span></Label>
              <Input
                value={nuevoClienteRapido.nombre}
                onChange={(e) => setNuevoClienteRapido({ ...nuevoClienteRapido, nombre: e.target.value })}
                placeholder="Nombre o Razón Social"
                className="bg-secondary h-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Tipo <span className="text-rose-500">*</span></Label>
                <Select
                  value={nuevoClienteRapido.tipo_documento}
                  onValueChange={(val) => setNuevoClienteRapido({ ...nuevoClienteRapido, tipo_documento: val })}
                >
                  <SelectTrigger className="bg-secondary h-9">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">CC</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                    <SelectItem value="CE">CE</SelectItem>
                    <SelectItem value="PP">PP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Número Identificación <span className="text-rose-500">*</span></Label>
                <div className="flex gap-1.5">
                  <Input
                    value={nuevoClienteRapido.identificacion}
                    onChange={(e) => setNuevoClienteRapido({ ...nuevoClienteRapido, identificacion: e.target.value })}
                    placeholder="Sin puntos ni guiones"
                    className="bg-secondary h-9"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 px-3"
                    onClick={buscarPorNitRapido}
                    disabled={buscandoNit}
                  >
                    {buscandoNit ? "..." : "Buscar"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Email (Para Factura Electrónica) <span className="text-rose-500">*</span></Label>
              <Input
                type="email"
                value={nuevoClienteRapido.email}
                onChange={(e) => setNuevoClienteRapido({ ...nuevoClienteRapido, email: e.target.value })}
                placeholder="correo@ejemplo.com"
                className="bg-secondary h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input
                  value={nuevoClienteRapido.telefono}
                  onChange={(e) => setNuevoClienteRapido({ ...nuevoClienteRapido, telefono: e.target.value })}
                  placeholder="Teléfono"
                  className="bg-secondary h-9"
                />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input
                  value={nuevoClienteRapido.direccion}
                  onChange={(e) => setNuevoClienteRapido({ ...nuevoClienteRapido, direccion: e.target.value })}
                  placeholder="Dirección"
                  className="bg-secondary h-9"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowNuevoClienteDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={registrarClienteRapido}>Guardar y Seleccionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPriceLookupDialog} onOpenChange={(open) => {
        setShowPriceLookupDialog(open);
        if (!open) {
          setPriceLookupSearch("");
          setSelectedLookupProduct(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Consulta de Precios (F12)
            </DialogTitle>
            <DialogDescription className="sr-only">Busca productos por código o nombre para ver su precio y stock.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="lookup-search-input">Código o Nombre del Producto</Label>
              <Input
                id="lookup-search-input"
                autoFocus
                placeholder="Escribe el nombre, código o escanea código de barras..."
                value={priceLookupSearch}
                onChange={(e) => realizarBusquedaPrecio(e.target.value)}
                className="bg-secondary text-foreground border-border h-11 text-base placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>

            {/* Resultados de búsqueda */}
            <div className="min-h-[200px] max-h-[300px] overflow-y-auto border border-border/40 rounded-xl bg-muted/20 p-2 space-y-2">
              {priceLookupSearch.trim() === "" ? (
                <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground gap-2">
                  <Barcode className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
                  <p className="text-xs font-medium">Escanea un código de barras o escribe para buscar</p>
                </div>
              ) : (
                (() => {
                  const query = priceLookupSearch.toLowerCase().trim();
                  const matches = productos.filter(p => 
                    (p.nombre || "").toLowerCase().includes(query) ||
                    (p.codigo || "").toLowerCase().includes(query) ||
                    (p.barcode || "").toLowerCase().includes(query)
                  ).slice(0, 10);

                  if (matches.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-[180px] text-destructive gap-2">
                        <AlertCircle className="h-8 w-8 opacity-75" />
                        <p className="text-xs font-medium">No se encontraron productos coincidentes</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1">
                      {matches.map((p) => {
                        const isSelected = selectedLookupProduct?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedLookupProduct(p)}
                            className={`p-2.5 rounded-lg cursor-pointer transition-all border flex items-center justify-between gap-4 ${
                              isSelected
                                ? "bg-primary/10 border-primary text-foreground shadow-sm"
                                : "bg-card hover:bg-muted/50 border-border/50 text-foreground"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{p.nombre}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span>Cod: {p.codigo || p.barcode || "N/A"}</span>
                                <span>•</span>
                                <span className={`font-medium ${p.stock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                  Stock: {p.stock}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-base font-bold text-primary">
                                {formatCOP(p.precio)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Vista de Detalle Grande si hay un producto seleccionado */}
            {selectedLookupProduct && (
              <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="text-[10px] text-primary font-bold tracking-wider uppercase">Información General</div>
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground truncate">{selectedLookupProduct.nombre}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Categoría: {selectedLookupProduct.categoria || 'General'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xl font-black text-primary block leading-none">
                      {formatCOP(selectedLookupProduct.precio)}
                    </span>
                    <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      selectedLookupProduct.stock > 5 
                        ? "bg-emerald-500/10 text-emerald-600" 
                        : selectedLookupProduct.stock > 0 
                          ? "bg-amber-500/10 text-amber-600" 
                          : "bg-rose-500/10 text-rose-600"
                    }`}>
                      {selectedLookupProduct.stock > 0 ? `${selectedLookupProduct.stock} unidades` : 'Sin Stock'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              className="w-full h-10 text-sm font-semibold"
              onClick={() => {
                setShowPriceLookupDialog(false);
                setPriceLookupSearch("");
                setSelectedLookupProduct(null);
              }}
            >
              Cerrar (Esc)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentMethod} onOpenChange={(open) => {
        if (!open) {
          setShowPaymentMethod(false);
          setShowEfectivoStep(false);
          setEfectivoInput("");
        }
      }}>
        <DialogContent className="sm:max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          {!showEfectivoStep ? (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2 justify-center">
                  <Banknote className="h-5 w-5 text-primary" />
                  Seleccionar Método de Pago
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-center mt-1">
                  Usa las flechas izquierda/derecha para desplazarte y presiona Enter para confirmar.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 py-4">
                {paymentMethods.map((m, i) => {
                  const isSelected = i === paymentMethodIndex;
                  return (
                    <button
                      key={m}
                      onClick={() => {
                        setPaymentMethodIndex(i);
                        confirmarMetodoPago(m);
                      }}
                      className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? "bg-primary/10 border-primary text-foreground shadow-lg shadow-primary/5 scale-105"
                          : "bg-card border-border/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "efectivo" ? (
                        <Banknote className={`h-8 w-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      ) : m === "transferencia" ? (
                        <Smartphone className={`h-8 w-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      ) : (
                        <CreditCard className={`h-8 w-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      )}
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {m === "efectivo" ? "Efectivo" : m === "transferencia" ? "Transferencia" : "Tarjeta"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <DialogFooter className="mt-4 flex sm:justify-between items-center gap-2">
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded border border-border/40">
                  Esc para Cancelar
                </span>
                <Button
                  className="w-full sm:w-auto h-10 text-sm font-semibold px-6"
                  onClick={() => confirmarMetodoPago()}
                >
                  Confirmar (Enter)
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader className="mb-2">
                <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2 justify-center">
                  <Banknote className="h-5 w-5 text-primary" />
                  Pago en Efectivo
                </DialogTitle>
                <DialogDescription className="text-center text-sm text-muted-foreground mt-1">
                  Total a pagar: <span className="font-black text-foreground text-base">{formatCOP(total)}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Efectivo Recibido</label>
                  <Input
                    id="efectivo-modal-input"
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    placeholder={new Intl.NumberFormat("es-CO").format(total)}
                    value={efectivoInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setEfectivoInput(raw ? new Intl.NumberFormat("es-CO").format(parseInt(raw, 10)) : "");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); completarVentaEfectivo(); }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setBilleteIdx(0);
                        billeteRefs.current[0]?.focus();
                      }
                    }}
                    className="h-14 text-3xl text-right font-black bg-card border-border"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {billetesRapidos.map((billete, i) => (
                    <button
                      key={billete}
                      ref={(el) => { billeteRefs.current[i] = el; }}
                      className={`h-10 rounded-lg border-2 text-sm font-bold transition-all focus:outline-none ${
                        billeteIdx === i
                          ? "bg-primary border-primary text-primary-foreground scale-105 shadow-md"
                          : "bg-card border-border text-foreground hover:bg-muted"
                      }`}
                      onClick={() => {
                        setEfectivoInput(new Intl.NumberFormat("es-CO").format(billete));
                        setBilleteIdx(-1);
                        document.getElementById("efectivo-modal-input")?.focus();
                      }}
                      onFocus={() => setBilleteIdx(i)}
                      onBlur={() => setBilleteIdx(-1)}
                      onKeyDown={(e) => {
                        const cols = 3;
                        const total = billetesRapidos.length;
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setEfectivoInput(new Intl.NumberFormat("es-CO").format(billete));
                          setBilleteIdx(-1);
                          document.getElementById("efectivo-modal-input")?.focus();
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          const next = (i + 1) % total;
                          setBilleteIdx(next);
                          billeteRefs.current[next]?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          const prev = (i - 1 + total) % total;
                          setBilleteIdx(prev);
                          billeteRefs.current[prev]?.focus();
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          const next = i + cols;
                          if (next < total) {
                            setBilleteIdx(next);
                            billeteRefs.current[next]?.focus();
                          }
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const prev = i - cols;
                          if (prev >= 0) {
                            setBilleteIdx(prev);
                            billeteRefs.current[prev]?.focus();
                          } else {
                            setBilleteIdx(-1);
                            document.getElementById("efectivo-modal-input")?.focus();
                          }
                        }
                      }}
                    >
                      {formatCOP(billete).replace("$ ", "$")}
                    </button>
                  ))}
                </div>

                {(() => {
                  const montoNum = efectivoInput ? parseInt(efectivoInput.replace(/\D/g, ""), 10) || 0 : 0;
                  const cambioCalc = montoNum - total;
                  if (montoNum === 0) return null;
                  return (
                    <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                      cambioCalc >= 0
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
                    }`}>
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-wider opacity-85">
                          {cambioCalc >= 0 ? "Cambio" : "Falta"}
                        </span>
                      </div>
                      <span className={`text-3xl font-black ${cambioCalc >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {formatCOP(Math.abs(cambioCalc))}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <DialogFooter className="mt-4 flex sm:justify-between items-center gap-2">
                <Button variant="outline" className="sm:w-auto"
                  onClick={() => { setShowEfectivoStep(false); setEfectivoInput(""); }}>
                  ← Volver
                </Button>
                <Button
                  className="w-full sm:w-auto h-10 text-sm font-semibold px-6"
                  onClick={completarVentaEfectivo}
                >
                  Cobrar (Enter)
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
