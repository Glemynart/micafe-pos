'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Power, Search, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  actualizarProveedor,
  crearProveedor,
  desactivarProveedor,
  suscribirProveedores,
  type Proveedor,
  type ProveedorInput,
} from '@/lib/proveedores-service'

const FORMULARIO_VACIO: ProveedorInput = { nombre: '', nit: '', telefono: '', correo: '', direccion: '' }

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const details = (error as { details?: unknown }).details
  if (details && typeof details === 'object' && 'code' in details) return String((details as { code: unknown }).code)
  return undefined
}

export function ProveedoresModule() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [proveedorEditado, setProveedorEditado] = useState<Proveedor | null>(null)
  const [formulario, setFormulario] = useState<ProveedorInput>(FORMULARIO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [desactivandoId, setDesactivandoId] = useState<string | null>(null)

  useEffect(() => {
    return suscribirProveedores((data) => {
      setProveedores(data)
      setCargando(false)
    })
  }, [])

  const abrirNuevo = () => {
    setProveedorEditado(null)
    setFormulario({ ...FORMULARIO_VACIO })
    setDialogoAbierto(true)
  }

  const abrirEdicion = (proveedor: Proveedor) => {
    setProveedorEditado(proveedor)
    setFormulario({
      nombre: proveedor.nombre,
      nit: proveedor.nit ?? '',
      telefono: proveedor.telefono ?? '',
      correo: proveedor.correo ?? '',
      direccion: proveedor.direccion ?? '',
    })
    setDialogoAbierto(true)
  }

  const actualizarCampo = (campo: keyof ProveedorInput, valor: string) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  const guardar = async () => {
    if (!formulario.nombre.trim()) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }
    setGuardando(true)
    try {
      const input = Object.fromEntries(
        Object.entries(formulario).map(([clave, valor]) => [clave, valor.trim()]),
      ) as ProveedorInput
      if (proveedorEditado) {
        await actualizarProveedor(proveedorEditado.id, input)
        toast.success('Proveedor actualizado')
      } else {
        await crearProveedor(input)
        toast.success('Proveedor creado')
      }
      setDialogoAbierto(false)
    } catch (error) {
      console.error(error)
      toast.error('No fue posible guardar el proveedor')
    } finally {
      setGuardando(false)
    }
  }

  const desactivar = async (proveedor: Proveedor) => {
    setDesactivandoId(proveedor.id)
    try {
      await desactivarProveedor(proveedor.id)
      toast.success('Proveedor desactivado; las compras históricas no fueron modificadas')
    } catch (error) {
      console.error(error)
      toast.error(errorCode(error) === 'PROVEEDOR_CON_OPERACIONES_ABIERTAS'
        ? 'No se puede desactivar: existen operaciones abiertas'
        : 'No fue posible desactivar el proveedor')
    } finally {
      setDesactivandoId(null)
    }
  }

  const visibles = proveedores.filter((proveedor) => proveedor.nombre.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()))

  return (
    <div className="flex flex-col gap-4 h-full min-h-[420px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Proveedores
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Directorio reusable del tenant para nuevas compras</p>
        </div>
        <Button onClick={abrirNuevo} className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" /> Nuevo proveedor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar proveedor..." className="pl-9" />
      </div>

      <div className="flex-1 rounded-2xl border border-border/50 overflow-auto bg-card/40">
        {cargando ? (
          <div className="h-full min-h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Proveedor</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((proveedor) => (
                <TableRow key={proveedor.id} className="border-border/50">
                  <TableCell className="font-semibold">{proveedor.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{proveedor.nit || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{proveedor.telefono || proveedor.correo || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={proveedor.estado === 'ACTIVO' ? 'text-emerald-600 border-emerald-500/30' : 'text-muted-foreground'}>
                      {proveedor.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicion(proveedor)} aria-label={`Editar ${proveedor.nombre}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {proveedor.estado === 'ACTIVO' && (
                        <Button variant="ghost" size="sm" onClick={() => desactivar(proveedor)} disabled={desactivandoId === proveedor.id} aria-label={`Desactivar ${proveedor.nombre}`}>
                          {desactivandoId === proveedor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visibles.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No hay proveedores para mostrar</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{proveedorEditado ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
            <DialogDescription>Los datos son comerciales; no configuran obligaciones fiscales ni crédito.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['nombre', 'Nombre *'], ['nit', 'NIT (opcional)'], ['telefono', 'Teléfono'], ['correo', 'Correo'], ['direccion', 'Dirección'],
            ] as Array<[keyof ProveedorInput, string]>).map(([campo, etiqueta]) => (
              <div key={campo} className="grid gap-1.5">
                <Label htmlFor={`proveedor-${campo}`}>{etiqueta}</Label>
                <Input id={`proveedor-${campo}`} value={formulario[campo] ?? ''} onChange={(event) => actualizarCampo(campo, event.target.value)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
