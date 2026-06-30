'use client'

import { useState } from 'react'
import {
  collection, query, where, getDocs,
  doc, updateDoc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthContext } from '@/contexts/auth-context'
import { reconciliarGlobal, type ReporteGlobalReconciliacion } from '@/lib/inventario-ledger'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle, Loader2, Search, Play, ShieldAlert, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const fmtDate = (ts: any) => {
  if (!ts) return '-'
  try { return ts.toDate().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return '-' }
}

interface TurnoInfo {
  id: string
  cajeroNombre: string
  fechaApertura: any
  ventasCount: number
  esCanónico: boolean
}

interface CasoInfo {
  cajeroId: string
  cajeroNombre: string
  turnos: TurnoInfo[]
  canonicoId: string
  teniaCandado: boolean
  candapoApuntabaCanonico: boolean
}

type EstadoMigracion = 'idle' | 'analizando' | 'listo' | 'ejecutando' | 'finalizado'

export default function UtilidadesPage() {
  const { usuario } = useAuthContext()
  const [estado, setEstado] = useState<EstadoMigracion>('idle')
  const [casos, setCasos] = useState<CasoInfo[]>([])
  const [resumen, setResumen] = useState<{ cerrados: number; omitidos: number; candados: number } | null>(null)

  // ── Reconciliación de inventario (I9) — IMP-3 ──
  const [estadoRecon, setEstadoRecon] = useState<EstadoMigracion>('idle')
  const [reporteRecon, setReporteRecon] = useState<ReporteGlobalReconciliacion | null>(null)

  if (usuario?.rol !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="font-semibold">Acceso restringido a administradores</p>
      </div>
    )
  }

  async function analizar() {
    setEstado('analizando')
    setCasos([])
    setResumen(null)
    try {
      const snap = await getDocs(
        query(collection(db, 'turnos'), where('estado', '==', 'abierto'))
      )

      // Agrupar por cajeroId
      const porCajero: Record<string, any[]> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        const cid = data.cajeroId
        if (!porCajero[cid]) porCajero[cid] = []
        porCajero[cid].push({ id: d.id, ...data })
      })

      const resultado: CasoInfo[] = []

      for (const [cajeroId, turnos] of Object.entries(porCajero)) {
        if (turnos.length <= 1) continue

        // Verificar candado existente — si apunta a un turno, ese es el canónico
        const lockSnap = await getDoc(doc(db, 'turnos_activos', cajeroId))
        const teniaCandado = lockSnap.exists()
        const candapoApuntabaCanonico = teniaCandado
          ? turnos.some(t => t.id === lockSnap.data()?.turnoId)
          : false

        const canonicoId = teniaCandado && candapoApuntabaCanonico
          ? lockSnap.data()!.turnoId
          : [...turnos].sort((a, b) => a.id < b.id ? -1 : 1)[0].id

        // Contar ventas por turno
        const turnosConInfo: TurnoInfo[] = []
        for (const t of turnos) {
          const ventasSnap = await getDocs(
            query(collection(db, 'ventas'), where('turnoId', '==', t.id))
          )
          turnosConInfo.push({
            id: t.id,
            cajeroNombre: t.cajeroNombre || cajeroId,
            fechaApertura: t.fechaApertura,
            ventasCount: ventasSnap.size,
            esCanónico: t.id === canonicoId,
          })
        }

        resultado.push({
          cajeroId,
          cajeroNombre: turnos[0].cajeroNombre || cajeroId,
          turnos: turnosConInfo,
          canonicoId,
          teniaCandado,
          candapoApuntabaCanonico,
        })
      }

      setCasos(resultado)
      setEstado('listo')

      if (resultado.length === 0) {
        toast.success('No se encontraron turnos duplicados. La base está limpia.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error al analizar Firestore')
      setEstado('idle')
    }
  }

  async function ejecutar() {
    setEstado('ejecutando')
    let cerrados = 0
    let omitidos = 0
    let candados = 0

    try {
      for (const caso of casos) {
        // Crear/asegurar candado apuntando al canónico
        if (!caso.teniaCandado || !caso.candapoApuntabaCanonico) {
          await setDoc(doc(db, 'turnos_activos', caso.cajeroId), {
            cajeroId: caso.cajeroId,
            turnoId: caso.canonicoId,
          })
          candados++
        }

        // Cerrar huérfanos
        for (const t of caso.turnos) {
          if (t.esCanónico) continue

          if (t.ventasCount > 0) {
            // Tiene ventas — no cerrar automáticamente
            omitidos++
            continue
          }

          await updateDoc(doc(db, 'turnos', t.id), {
            estado: 'cerrado',
            fechaCierre: serverTimestamp(),
            ventasEfectivo: 0,
            ventasOtrosMetodos: 0,
            totalEgresos: 0,
            totalEsperadoEfectivo: 0,
            totalReportadoEfectivo: 0,
            diferenciaEfectivo: 0,
            notasCierre: '[MIGRACIÓN TECH-DEBT-001] Turno huérfano cerrado — duplicado previo a H-TURNO-01',
            esCierreDefinitivo: true,
          })
          cerrados++
        }
      }

      setResumen({ cerrados, omitidos, candados })
      setEstado('finalizado')
      toast.success(`Migración completada: ${cerrados} huérfanos cerrados, ${candados} candados ajustados${omitidos > 0 ? `, ${omitidos} omitidos (tienen ventas)` : ''}`)

      // Re-analizar para confirmar limpieza
      await analizar()
    } catch (err) {
      console.error(err)
      toast.error('Error durante la migración')
      setEstado('listo')
    }
  }

  // ── Reconciliación de inventario (I9) — IMP-3 ──
  async function analizarInventario() {
    setEstadoRecon('analizando')
    try {
      const rep = await reconciliarGlobal({ aplicar: false })
      setReporteRecon(rep)
      setEstadoRecon('listo')
      if (rep.divergentesReparables === 0 && rep.corruptos === 0) {
        toast.success('Inventario consistente con el Ledger (I9 satisfecho). Nada que reparar.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error al analizar el inventario')
      setEstadoRecon('idle')
    }
  }

  async function repararInventario() {
    if (!reporteRecon) return
    setEstadoRecon('ejecutando')
    try {
      const rep = await reconciliarGlobal({ aplicar: true })
      toast.success(`Reconciliación completada: ${rep.divergentesReparables} artículo(s) reparado(s)`)
      // Re-analizar para confirmar convergencia
      await analizarInventario()
    } catch (err) {
      console.error(err)
      toast.error('Error al reparar el inventario')
      setEstadoRecon('listo')
    }
  }

  const ocupadoRecon = estadoRecon === 'analizando' || estadoRecon === 'ejecutando'

  const ocupado = estado === 'analizando' || estado === 'ejecutando'
  const totalHuerfanos = casos.reduce((sum, c) => sum + c.turnos.filter(t => !t.esCanónico).length, 0)
  const huerfanosConVentas = casos.reduce((sum, c) => sum + c.turnos.filter(t => !t.esCanónico && t.ventasCount > 0).length, 0)
  const huerfanosSinVentas = totalHuerfanos - huerfanosConVentas

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Utilidades de Base de Datos</h1>
        <p className="text-sm text-muted-foreground mt-1">Herramientas de mantenimiento — solo administradores</p>
      </div>

      {/* Tarjeta de migración */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-card flex items-start gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">TECH-DEBT-001 — Turnos duplicados preexistentes</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Detecta y cierra turnos en estado <code className="text-xs bg-muted px-1 rounded">abierto</code> que quedaron huérfanos antes del fix H-TURNO-01.
              Los que tengan ventas asociadas se omiten y se listan para revisión manual.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Botones */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={analizar}
              disabled={ocupado}
              variant="outline"
              className="gap-2"
            >
              {estado === 'analizando'
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />}
              {estado === 'analizando' ? 'Analizando...' : 'Analizar Firestore'}
            </Button>

            {estado === 'listo' && casos.length > 0 && huerfanosSinVentas > 0 && (
              <Button
                onClick={ejecutar}
                disabled={ocupado}
                variant="destructive"
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Ejecutar migración ({huerfanosSinVentas} huérfano{huerfanosSinVentas !== 1 ? 's' : ''})
              </Button>
            )}
          </div>

          {/* Resumen post-ejecución */}
          {resumen && (
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-success font-medium">
                <CheckCircle className="h-4 w-4" /> {resumen.cerrados} huérfanos cerrados
              </span>
              {resumen.candados > 0 && (
                <span className="text-muted-foreground">{resumen.candados} candados creados/corregidos</span>
              )}
              {resumen.omitidos > 0 && (
                <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                  <AlertTriangle className="h-4 w-4" /> {resumen.omitidos} omitidos (tienen ventas — ver abajo)
                </span>
              )}
            </div>
          )}

          {/* Lista de casos */}
          {(estado === 'listo' || estado === 'finalizado') && casos.length === 0 && (
            <div className="flex items-center gap-2 text-success text-sm font-medium py-2">
              <CheckCircle className="h-4 w-4" />
              No hay turnos duplicados. Base de datos limpia.
            </div>
          )}

          {casos.length > 0 && (
            <div className="space-y-4">
              {casos.map(caso => (
                <div key={caso.cajeroId} className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2 border-b border-border">
                    <span className="font-semibold text-sm">{caso.cajeroNombre}</span>
                    <span className="text-xs text-muted-foreground font-mono">{caso.cajeroId}</span>
                    {!caso.teniaCandado && (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px] ml-auto">
                        Sin candado
                      </Badge>
                    )}
                    {caso.teniaCandado && !caso.candapoApuntabaCanonico && (
                      <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px] ml-auto">
                        Candado apunta a turno no encontrado
                      </Badge>
                    )}
                  </div>

                  <div className="divide-y divide-border">
                    {caso.turnos.map(t => (
                      <div
                        key={t.id}
                        className={cn(
                          'px-4 py-2.5 flex items-center gap-3 text-sm',
                          t.esCanónico ? 'bg-success/5' : 'bg-background'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-xs text-muted-foreground truncate block">{t.id}</span>
                          <span className="text-xs text-muted-foreground">Apertura: {fmtDate(t.fechaApertura)}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {t.esCanónico ? (
                            <Badge className="bg-success/15 text-success border-success/20 text-[10px]">Canónico</Badge>
                          ) : t.ventasCount > 0 ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                              Huérfano · {t.ventasCount} venta{t.ventasCount !== 1 ? 's' : ''} — revisar
                            </Badge>
                          ) : (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                              Huérfano · sin ventas
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tarjeta de reconciliación de inventario (I9) — IMP-3 */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-card flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg mt-0.5">
            <Wrench className="h-5 w-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">IMP-3 — Reconciliación de inventario (I9)</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compara el caché de <code className="text-xs bg-muted px-1 rounded">stock</code> de productos e insumos
              contra el Ledger (<code className="text-xs bg-muted px-1 rounded">movimientos_inventario</code>) y repara
              las divergencias. Los artículos corruptos o no migrados nunca se modifican automáticamente.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Botones */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={analizarInventario}
              disabled={ocupadoRecon}
              variant="outline"
              className="gap-2"
            >
              {estadoRecon === 'analizando'
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />}
              {estadoRecon === 'analizando' ? 'Analizando...' : 'Analizar (dry-run)'}
            </Button>

            {reporteRecon && reporteRecon.divergentesReparables > 0 && (
              <Button
                onClick={repararInventario}
                disabled={ocupadoRecon}
                variant="destructive"
                className="gap-2"
              >
                {estadoRecon === 'ejecutando'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Play className="h-4 w-4" />}
                {estadoRecon === 'ejecutando'
                  ? 'Reparando...'
                  : `Reparar divergencias (${reporteRecon.divergentesReparables})`}
              </Button>
            )}
          </div>

          {/* Resumen del reporte */}
          {reporteRecon && (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{reporteRecon.totalArticulos}</span></span>
                <span className="flex items-center gap-1.5 text-success font-medium">
                  <CheckCircle className="h-4 w-4" /> {reporteRecon.consistentes} consistentes
                </span>
                {reporteRecon.divergentesReparables > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                    <AlertTriangle className="h-4 w-4" /> {reporteRecon.divergentesReparables} divergentes reparables
                  </span>
                )}
                {reporteRecon.corruptos > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive font-medium">
                    <ShieldAlert className="h-4 w-4" /> {reporteRecon.corruptos} corruptos (investigar manualmente)
                  </span>
                )}
                {reporteRecon.noMigrados > 0 && (
                  <span className="text-muted-foreground">{reporteRecon.noMigrados} no migrados (apertura pendiente)</span>
                )}
              </div>

              {reporteRecon.divergentesReparables === 0 && reporteRecon.corruptos === 0 && (
                <div className="flex items-center gap-2 text-success text-sm font-medium py-2">
                  <CheckCircle className="h-4 w-4" />
                  Inventario consistente con el Ledger (I9 satisfecho).
                </div>
              )}

              {/* Lista de artículos con problema */}
              {reporteRecon.articulosConProblema.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {reporteRecon.articulosConProblema.map((a) => (
                    <div
                      key={`${a.articuloTipo}-${a.articuloId}`}
                      className="px-4 py-2.5 flex items-center gap-3 text-sm bg-background"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground">[{a.articuloTipo}]</span>{' '}
                        <span className="font-mono text-xs text-muted-foreground truncate">{a.articuloId}</span>
                        {a.estado === 'divergente_reparable' && (
                          <span className="block text-xs text-muted-foreground">
                            caché={a.stockCache} · ledger={a.stockLedger} · Δ={a.divergencia}
                          </span>
                        )}
                        {a.estado === 'corrupto' && a.motivoCorrupcion && (
                          <span className="block text-xs text-destructive/80">{a.motivoCorrupcion}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.estado === 'divergente_reparable' ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                            Divergente reparable
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                            Corrupto
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
