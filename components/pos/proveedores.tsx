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
import { Textarea } from "@/components/ui/textarea"
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
  Upload,
  Truck,
  Phone,
  Mail,
  FileText,
  ScanBarcode,
} from "lucide-react"

export function Proveedores() {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [showFacturaModal, setShowFacturaModal] = useState(false)
  const [proveedorEditar, setProveedorEditar] = useState<any | null>(null)
  
  const [scanData, setScanData] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  const estadoInicial = {
    nombre: "",
    nit: "",
    telefono: "",
    email: "",
    direccion: "",
    contacto: "",
    pais: "Colombia",
    departamento: "",
    ciudad: "",
    estado: 1,
    notas: "",
  }
  
  const [nuevoProveedor, setNuevoProveedor] = useState(estadoInicial)

  useEffect(() => {
    loadProveedores()
  }, [])

  const loadProveedores = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const data = await (window as any).api.proveedores.getAll()
        setProveedores(data || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const proveedoresFiltrados = proveedores.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.nit || "").includes(busqueda)
  )

  const guardarProveedor = async () => {
    const prov = {
      id: proveedorEditar?.id,
      ...nuevoProveedor,
    }

    try {
      if (typeof window !== "undefined" && (window as any).api) {
        await (window as any).api.proveedores.save(prov)
        toast.success(proveedorEditar ? "Proveedor actualizado correctamente" : "Proveedor creado correctamente")
        loadProveedores()
        cerrarModal()
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al guardar el proveedor")
    }
  }

  const editarProveedor = (proveedor: any) => {
    setProveedorEditar(proveedor)
    setNuevoProveedor({
      nombre: proveedor.nombre || "",
      nit: proveedor.nit || "",
      telefono: proveedor.telefono || "",
      email: proveedor.email || "",
      direccion: proveedor.direccion || "",
      contacto: proveedor.contacto || "",
      pais: proveedor.pais || "Colombia",
      departamento: proveedor.departamento || "",
      ciudad: proveedor.ciudad || "",
      estado: proveedor.estado !== undefined ? proveedor.estado : 1,
      notas: proveedor.notas || "",
    })
    setShowModal(true)
  }

  const eliminarProveedor = async () => {
    if (!idToDelete) return;
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        await (window as any).api.proveedores.delete(idToDelete)
        toast.success("Proveedor eliminado correctamente")
        loadProveedores()
        setIsDeleteDialogOpen(false)
        setIdToDelete(null)
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al eliminar el proveedor")
    }
  }

  const confirmarEliminar = (id: string) => {
    setIdToDelete(id)
    setIsDeleteDialogOpen(true)
  }

  const procesarEscaneo = () => {
    if (!scanData) return;
    
    const matchNit = scanData.match(/NitFac[:\s]*([0-9]+)/i);
    const nitExtraido = matchNit ? matchNit[1] : "";
    
    setNuevoProveedor({
      ...estadoInicial,
      nit: nitExtraido,
      notas: "Datos extraídos de escaneo: " + scanData.substring(0, 50) + "..."
    })
    
    setShowFacturaModal(false)
    setShowModal(true)
    setScanData("")
  }

  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let text = "";
      let pdfItems: { referencia: string; nombre: string; cantidad: number }[] = [];

      // ── Paso 1: Extraer XML y PDF del ZIP ──────────────────────────────────
      if (file.name.toLowerCase().endsWith(".zip")) {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // Extraer XML
        const xmlFile = Object.values(zipContent.files).find(f => f.name.toLowerCase().endsWith(".xml"));
        if (!xmlFile) {
          alert("El archivo ZIP no contiene ningún archivo XML de factura.");
          e.target.value = "";
          return;
        }
        text = await xmlFile.async("string");

        // Extraer PDF si existe
        const pdfFile = Object.values(zipContent.files).find(f => f.name.toLowerCase().endsWith(".pdf"));
        if (pdfFile) {
          try {
            const pdfArrayBuffer = await pdfFile.async("arraybuffer");
            const result = await (window as any).api.facturas.parsePdf(pdfArrayBuffer);
            if (result?.ok && result.items?.length > 0) {
              pdfItems = result.items;
              console.log(`[Factura] PDF encontrado: ${pdfItems.length} productos extraídos.`);
            } else {
              console.log("[Factura] PDF sin texto parseable, se usará el XML.");
            }
          } catch (pdfErr) {
            console.warn("[Factura] Error leyendo PDF, se usará XML:", pdfErr);
          }
        }
      } else {
        text = await file.text();
      }

      // ── Paso 2: Parsear datos del proveedor desde XML ──────────────────────
      const base64Match = text.match(/<[^:]*:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/[^:]*:EmbeddedDocumentBinaryObject>/);
      let rawXml = text;
      if (base64Match && base64Match[1]) {
        try { rawXml = atob(base64Match[1]); } catch(e) {}
      }

      const supplierMatch = rawXml.match(/<[^:]*:AccountingSupplierParty>([\s\S]*?)<\/[^:]*:AccountingSupplierParty>/);
      const searchArea = supplierMatch ? supplierMatch[1] : rawXml;

      const extract = (tagName: string) => {
        const regex = new RegExp(`<[^:]*:${tagName}[^>]*>([^<]+)<\/[^:]*:${tagName}>`);
        const match = searchArea.match(regex);
        return match ? match[1].trim() : "";
      };

      const name = extract("RegistrationName") || extract("Name") || "";
      const nit = extract("CompanyID") || "";
      const city = extract("CityName") || "";
      const dept = extract("CountrySubentity") || extract("Department") || "";
      const address = extract("Line") || "";
      const phone = extract("Telephone") || "";
      const email = extract("ElectronicMail") || "";

      // ── Paso 3: Procesar productos contra el inventario ─────────────────────
      const productos = await (window as any).api.productos.getAll();
      let productosNoEncontrados: string[] = [];
      let stockActualizado = 0;

      if (pdfItems.length > 0) {
        // ── Modo PDF: matching por referencia en dígitos 8-12 del barcode ────
        for (const item of pdfItems) {
          if (!item.referencia || item.cantidad <= 0) continue;

          // Buscar producto cuyo barcode contenga la referencia en posición 7-11 (base 0)
          let match = productos.find((p: any) => {
            const bc = (p.barcode || p.codigo || "").toString().replace(/\s/g, "");
            if (bc.length >= 12) {
              // Dígitos 8-12 (base 1) = índice 7 a 11 (base 0), 5 caracteres
              return bc.substring(7, 12) === item.referencia ||
                     bc.substring(7, 13) === item.referencia ||
                     bc.includes(item.referencia);
            }
            // Barcode corto: comparar directamente
            return bc === item.referencia || bc.endsWith(item.referencia);
          });

          // Fallback: Si no coincide por referencia, algoritmo de coincidencia difusa (Fuzzy Match) inteligente
          if (!match) {
            const tokenize = (name: string) => {
              // 1. Limpiar unidades de medida pegadas a los números
              let clean = name.toLowerCase().replace(/(\d+)\s*(cc|ml|g|gr|kg|oz|l|lt|x)/g, '$1');
              // 2. Remover caracteres especiales y dejar solo letras/números
              clean = clean.replace(/[^a-z0-9\s]/g, ' ');
              return clean.split(/\s+/).filter(w => w.length > 0);
            };

            const tItem = tokenize(item.nombre);
            const numsItem = tItem.filter(w => !isNaN(Number(w)));
            const wordsItem = tItem.filter(w => isNaN(Number(w)) && w.length >= 3);

            match = productos.find((p: any) => {
              const tProd = tokenize(p.nombre);
              const numsProd = tProd.filter(w => !isNaN(Number(w)));
              const wordsProd = tProd.filter(w => isNaN(Number(w)) && w.length >= 3);

              // REGLA 1: Debe coincidir al menos una palabra importante (>= 3 letras)
              const commonWords = wordsItem.filter(w => wordsProd.includes(w));
              if (commonWords.length === 0) return false;

              // REGLA 2: Si hay números en AMBOS nombres, DEBEN coincidir para no mezclar presentaciones
              if (numsItem.length > 0 && numsProd.length > 0) {
                const allNumsItemInProd = numsItem.every(n => numsProd.includes(n));
                const allNumsProdInItem = numsProd.every(n => numsItem.includes(n));
                // Si ninguno contiene todos los números del otro, no es coincidencia segura
                if (!allNumsItemInProd && !allNumsProdInItem) return false;
              }

              return true;
            });
          }

          if (match) {
            await (window as any).api.productos.updateStock(match.id, Math.round(item.cantidad));
            stockActualizado++;
          } else {
            // Producto no encontrado, guardarlo en la lista para avisar al usuario
            productosNoEncontrados.push(item.nombre);
          }
        }
      } else {
        // ── Modo XML: matching por nombre (comportamiento original) ────────────
        const invoiceLineRegex = /<[^:]*:InvoiceLine>([\s\S]*?)<\/[^:]*:InvoiceLine>/g;
        const invoiceLines: { nombre: string; cantidad: number; precio: number }[] = [];
        let lineMatch;
        while ((lineMatch = invoiceLineRegex.exec(rawXml)) !== null) {
          const lineXml = lineMatch[1];
          const extractItem = (t: string) => {
            const r = new RegExp(`<[^:]*:${t}[^>]*>([^<]+)<\/[^:]*:${t}>`);
            const m = lineXml.match(r);
            return m ? m[1].trim() : "";
          };
          const itemName = extractItem("Description") || extractItem("Name") || "Producto sin nombre";
          const qty = parseFloat(extractItem("InvoicedQuantity")) || 1;
          const unitPrice = parseFloat(extractItem("PriceAmount")) || 0;
          invoiceLines.push({ nombre: itemName, cantidad: qty, precio: unitPrice });
        }

        for (const line of invoiceLines) {
          if (!line.nombre || line.cantidad <= 0) continue;
          const match = productos.find((p: any) =>
            p.nombre.toLowerCase().includes(line.nombre.toLowerCase()) ||
            line.nombre.toLowerCase().includes(p.nombre.toLowerCase())
          );
          if (match) {
            await (window as any).api.productos.updateStock(match.id, line.cantidad);
            stockActualizado++;
          } else {
            productosNoEncontrados.push(line.nombre);
          }
        }
      }

      const modoStr = pdfItems.length > 0 ? "📄 PDF" : "📋 XML";

      const showResultadoToast = (proveedorStatus: string) => {
        let msg = `${modoStr} procesado. ${stockActualizado} productos actualizados. ${proveedorStatus}`;
        
        if (productosNoEncontrados.length > 0) {
          const limitList = productosNoEncontrados.slice(0, 3).join(", ");
          const andMore = productosNoEncontrados.length > 3 ? ` y ${productosNoEncontrados.length - 3} más` : "";
          msg += `\n⚠️ ATENCIÓN: ${productosNoEncontrados.length} productos no existen en el inventario y no se sumaron (${limitList}${andMore}).`;
          toast.error(msg, { duration: 10000 });
        } else {
          toast.success(msg, { duration: 7000 });
        }
      };

      // ── Paso 4: Gestionar proveedor ─────────────────────────────────────────
      const proveedorExistente = nit ? await (window as any).api.proveedores.getByNit(nit) : null;

      if (proveedorExistente) {
        showResultadoToast(`Proveedor "${proveedorExistente.nombre}" ya existe.`);
        setShowFacturaModal(false);
        loadProveedores();
      } else if (name || nit) {
        try {
          await (window as any).api.proveedores.save({
            nombre: name,
            nit: nit,
            ciudad: city,
            pais: "Colombia",
            departamento: dept,
            direccion: address,
            telefono: phone,
            email: email,
            contacto: "",
            notas: `Importado desde ${file.name}. Inventario: ${stockActualizado} actualizados.`,
            estado: 1,
          });
          showResultadoToast(`Proveedor "${name}" creado automáticamente.`);
        } catch (err) {
          console.error("Error guardando proveedor:", err);
          toast.error("Error al guardar proveedor");
        }
        setShowFacturaModal(false);
        loadProveedores();
      } else {
        showResultadoToast("Sin datos de proveedor.");
        setShowFacturaModal(false);
      }
    } catch (err) {
      console.error("Error procesando archivo:", err);
      alert("El archivo no pudo ser procesado o está dañado.");
    }
    e.target.value = "";

  };

  const cerrarModal = () => {
    setShowModal(false)
    setProveedorEditar(null)
    setNuevoProveedor(estadoInicial)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Proveedores</p>
              <p className="text-2xl font-bold text-foreground">{proveedores.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Activos</p>
              <p className="text-2xl font-bold text-foreground">
                {proveedores.filter((p) => p.estado === 1).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-muted/50 flex items-center justify-center">
              <Truck className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inactivos</p>
              <p className="text-2xl font-bold text-foreground">
                {proveedores.filter((p) => p.estado === 0).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar proveedor por nombre o NIT..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowFacturaModal(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Escanear Factura
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Proveedor
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Directorio de Proveedores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Proveedor</TableHead>
                <TableHead className="text-muted-foreground">NIT</TableHead>
                <TableHead className="text-muted-foreground">Contacto</TableHead>
                <TableHead className="text-muted-foreground">Teléfono</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedoresFiltrados.map((proveedor) => (
                <TableRow key={proveedor.id} className="border-border">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{proveedor.nombre}</p>
                      <p className="text-sm text-muted-foreground">{proveedor.direccion}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-foreground">
                    {proveedor.nit}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-foreground">{proveedor.contacto}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {proveedor.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-foreground">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {proveedor.telefono}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={proveedor.estado === 1 ? "default" : "secondary"}
                      className={proveedor.estado === 1 ? "bg-emerald-500 hover:bg-emerald-600" : "bg-muted text-muted-foreground"}
                    >
                      {proveedor.estado === 1 ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => editarProveedor(proveedor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => confirmarEliminar(proveedor.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmar Eliminar */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El proveedor será eliminado permanentemente del directorio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setIdToDelete(null) }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminarProveedor}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Nuevo/Editar Proveedor */}
      <Dialog open={showModal} onOpenChange={cerrarModal}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {proveedorEditar ? "Editar Proveedor" : "Nuevo Proveedor"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-foreground">Razón Social</Label>
              <Input
                value={nuevoProveedor.nombre}
                onChange={(e) =>
                  setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })
                }
                placeholder="Nombre de la empresa"
                className="bg-secondary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">NIT</Label>
                <Input
                  value={nuevoProveedor.nit}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, nit: e.target.value })
                  }
                  placeholder="900.000.000-0"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Teléfono</Label>
                <Input
                  value={nuevoProveedor.telefono}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, telefono: e.target.value })
                  }
                  placeholder="601 000 0000"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Email</Label>
                <Input
                  type="email"
                  value={nuevoProveedor.email}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, email: e.target.value })
                  }
                  placeholder="contacto@empresa.com"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Persona de Contacto</Label>
                <Input
                  value={nuevoProveedor.contacto}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, contacto: e.target.value })
                  }
                  placeholder="Nombre del contacto"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">País</Label>
                <Input
                  value={nuevoProveedor.pais}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, pais: e.target.value })
                  }
                  placeholder="Colombia"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Departamento</Label>
                <Input
                  value={nuevoProveedor.departamento}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, departamento: e.target.value })
                  }
                  placeholder="Antioquia"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Ciudad</Label>
                <Input
                  value={nuevoProveedor.ciudad}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, ciudad: e.target.value })
                  }
                  placeholder="Medellín"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Dirección</Label>
                <Textarea
                  value={nuevoProveedor.direccion}
                  onChange={(e) =>
                    setNuevoProveedor({ ...nuevoProveedor, direccion: e.target.value })
                  }
                  placeholder="Dirección completa"
                  className="bg-secondary resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Estado</Label>
                <Select
                  value={nuevoProveedor.estado?.toString()}
                  onValueChange={(val) =>
                    setNuevoProveedor({ ...nuevoProveedor, estado: parseInt(val, 10) })
                  }
                >
                  <SelectTrigger className="bg-secondary h-10 mt-1">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Activo</SelectItem>
                    <SelectItem value="0">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={guardarProveedor}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Escanear/Subir Factura */}
      <Dialog open={showFacturaModal} onOpenChange={setShowFacturaModal}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Importar Datos de Factura</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {/* Opcion 1: Subir XML o ZIP */}
            <div className="border-2 border-dashed border-primary/50 rounded-xl p-6 text-center bg-primary/5 transition-colors hover:bg-primary/10 relative">
              <input 
                type="file" 
                accept=".xml,.zip" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleXmlUpload}
              />
              <FileText className="h-10 w-10 mx-auto text-primary mb-3" />
              <p className="text-foreground font-semibold mb-1">
                Subir Factura Electrónica (XML o ZIP)
              </p>
              <p className="text-xs text-muted-foreground">
                Sube el ZIP que te envió el proveedor o el XML directamente. Extrae el 100% de los datos.
              </p>
            </div>


          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFacturaModal(false)} className="w-full">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
