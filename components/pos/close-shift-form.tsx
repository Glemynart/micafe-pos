import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Square, CheckCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { billDenominations } from '@/lib/demo-data'
import { formatCurrency } from '@/lib/format-utils'

interface CloseShiftFormProps {
  variant: 'compact' | 'standalone'
  cashCount: Record<string, string>
  setCashCount: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  totalCashCount: number
  expectedCash: number
  cashDifference: number
  closeNotes: string
  setCloseNotes: (v: string) => void
  handoverTo: string
  setHandoverTo: (v: string) => void
  cajeros: { uid: string; nombre: string }[]
  permitirRelevo?: boolean
  usuario: any
  puedeCerrar: boolean
  isLoadingTotals?: boolean
  onSubmit: () => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function CloseShiftForm({
  variant,
  cashCount,
  setCashCount,
  totalCashCount,
  expectedCash,
  cashDifference,
  closeNotes,
  setCloseNotes,
  handoverTo,
  setHandoverTo,
  cajeros,
  permitirRelevo = true,
  usuario,
  puedeCerrar,
  isLoadingTotals,
  onSubmit,
  onCancel,
  isSubmitting,
}: CloseShiftFormProps) {
  const esAdmin = usuario?.rol === 'admin'
  const isCompact = variant === 'compact'

  return (
    <>
      {/* Bills */}
      {isCompact ? (
        <div className="space-y-2">
          <Label>Conteo de billetes</Label>
          <div className="space-y-1.5">
            {billDenominations.map(bill => {
              const qty = parseInt(cashCount[bill.value], 10) || 0
              return (
                <div key={bill.value} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <span className="text-sm font-bold text-foreground w-[4.5rem] shrink-0">{bill.label}</span>
                  <span className="text-muted-foreground/40 text-sm select-none">×</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cashCount[bill.value] ?? ''}
                    onChange={(e) => {
                      setCashCount(prev => ({ ...prev, [bill.value]: e.target.value.replace(/\D/g, '') }))
                    }}
                    placeholder="0"
                    className="w-20 h-10 text-center font-mono font-bold text-base bg-input"
                  />
                  <span className="text-xs text-muted-foreground ml-auto shrink-0 min-w-[5rem] text-right tabular-nums">
                    {qty > 0 ? formatCurrency(qty * bill.value) : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-border/50">
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/50 shrink-0" />
            <Label className="text-sm font-semibold">Conteo de Efectivo</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {billDenominations.map(bill => {
              const qty = parseInt(cashCount[bill.value], 10) || 0
              return (
                <div key={bill.value} className="flex flex-col px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground w-[4.2rem] shrink-0">{bill.label}</span>
                    <span className="text-muted-foreground/50 text-xs select-none">×</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={cashCount[bill.value] ?? ''}
                      onChange={(e) => {
                        setCashCount(prev => ({ ...prev, [bill.value]: e.target.value.replace(/\D/g, '') }))
                      }}
                      placeholder="0"
                      className="w-20 shrink-0 h-9 text-center font-mono font-bold text-sm text-foreground bg-background border-border rounded focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                  {qty > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums text-right mt-1">
                      {formatCurrency(qty * bill.value)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coins */}
      {isCompact ? (
        <div className="space-y-2">
          <Label>Monedas</Label>
          <p className="text-xs text-muted-foreground">Total en monedas sin contar por denominación</p>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={cashCount['monedas'] ? Number(cashCount['monedas']).toLocaleString('es-CO') : ''}
              onChange={(e) => {
                setCashCount(prev => ({ ...prev, monedas: e.target.value.replace(/\D/g, '') }))
              }}
              placeholder="Ej: 20.000"
              className="flex-1 h-11 font-mono text-base bg-input"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/50 shrink-0" />
          <span className="text-sm font-semibold text-foreground w-[4.2rem] shrink-0">Monedas</span>
          <Input
            type="text"
            inputMode="numeric"
            value={cashCount['monedas'] ? Number(cashCount['monedas']).toLocaleString('es-CO') : ''}
            onChange={(e) => {
              setCashCount(prev => ({ ...prev, monedas: e.target.value.replace(/\D/g, '') }))
            }}
            placeholder="Total en monedas"
            className="flex-1 h-9 font-mono text-sm text-foreground bg-background border-border rounded focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      )}

      {/* Totals */}
      {isCompact ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-secondary/30 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">Total contado</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totalCashCount)}</p>
          </div>
          <div className="p-4 bg-secondary/30 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">Esperado</p>
            <p className="text-xl font-bold text-foreground">
              {esAdmin ? formatCurrency(expectedCash) : '***'}
            </p>
          </div>
          <div className={cn(
            "p-4 rounded-lg text-center",
            !esAdmin
              ? "bg-secondary/30"
              : cashDifference === 0
                ? "bg-success/20"
                : cashDifference > 0
                  ? "bg-success/20"
                  : "bg-destructive/20"
          )}>
            <p className="text-sm text-muted-foreground">Diferencia</p>
            <p className={cn(
              "text-xl font-bold flex items-center justify-center gap-1",
              !esAdmin
                ? "text-foreground"
                : cashDifference === 0
                  ? "text-success"
                  : cashDifference > 0
                    ? "text-success"
                    : "text-destructive"
            )}>
              {!esAdmin ? '***' : cashDifference === 0 ? (
                <><CheckCircle className="h-5 w-5" /> Cuadrado</>
              ) : cashDifference > 0 ? (
                <>+{formatCurrency(cashDifference)} Sobrante</>
              ) : (
                <><AlertTriangle className="h-5 w-5" /> {formatCurrency(Math.abs(cashDifference))} Faltante</>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-muted/20">
            <span className="text-sm font-medium text-muted-foreground">Total Contado en Caja</span>
            <span className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(totalCashCount)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t border-border/50 bg-muted/20">
            <span className="text-sm font-medium text-muted-foreground">Efectivo Esperado</span>
            <span className="text-xl font-bold text-foreground tabular-nums">
              {isLoadingTotals ? <span className="text-sm animate-pulse">...</span> : (esAdmin ? formatCurrency(expectedCash) : '***')}
            </span>
          </div>
          <div className={cn(
            "flex justify-between items-center px-4 py-3 border-t",
            isLoadingTotals || !esAdmin
              ? "bg-muted/30 border-border/50"
              : cashDifference >= 0
                ? "bg-success/10 border-success/20"
                : "bg-destructive/10 border-destructive/20"
          )}>
            <span className="text-sm font-semibold text-foreground">Diferencia Final</span>
            <span className={cn(
              "text-xl font-black flex items-center gap-2 tabular-nums",
              isLoadingTotals || !esAdmin
                ? "text-muted-foreground"
                : cashDifference >= 0 ? "text-success" : "text-destructive"
            )}>
              {isLoadingTotals
                ? <span className="text-sm font-medium animate-pulse">Calculando...</span>
                : esAdmin
                  ? cashDifference === 0
                    ? <><CheckCircle className="h-5 w-5" /> Cuadrado</>
                    : cashDifference > 0
                      ? <>+{formatCurrency(cashDifference)} <span className="text-xs uppercase tracking-wider font-bold">Sobrante</span></>
                      : <><AlertTriangle className="h-5 w-5" /> {formatCurrency(Math.abs(cashDifference))} <span className="text-xs uppercase tracking-wider font-bold">Faltante</span></>
                  : '***'
              }
            </span>
          </div>
        </div>
      )}

      {/* Observations and handover */}
      <div className={permitirRelevo ? (isCompact ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4") : "grid grid-cols-1 gap-4"}>
        <div className="space-y-2">
          <Label className={isCompact ? "" : "text-sm font-semibold"}>
            {isCompact ? "Observaciones" : "Observaciones de Cierre"}
          </Label>
          <Textarea
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder={isCompact ? "Notas sobre el turno..." : "Inconvenientes, gastos extra o notas importantes..."}
            className={isCompact
              ? "bg-input resize-none h-10 min-h-[40px]"
              : "bg-background border-border resize-none h-[6rem] text-sm focus-visible:ring-1 focus-visible:ring-primary"
            }
          />
        </div>
        {permitirRelevo && <div className="space-y-2">
          <Label className={isCompact ? "" : "text-sm font-semibold"}>Entregar turno a</Label>
          <Select value={handoverTo} onValueChange={setHandoverTo}>
            <SelectTrigger className={isCompact ? "bg-input h-10" : "bg-background border-border h-10"}>
              <SelectValue placeholder={isCompact ? "Seleccionar cajero" : "Seleccionar cajero de relevo"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className={isCompact ? "" : "font-medium"}>
                {isCompact ? "Sin entrega (cierre de día)" : "Cierre definitivo (Fin de día)"}
              </SelectItem>
              {cajeros.map(c => (
                <SelectItem key={c.uid} value={c.uid}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}
      </div>

      {/* Footer */}
      {isCompact ? (
        <div className="p-6 pt-4 border-t border-border mt-auto">
          <div className="flex sm:flex-row gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              onClick={onSubmit}
              variant="destructive"
              disabled={!puedeCerrar}
              title={!puedeCerrar ? 'Cuenta el efectivo de la caja antes de cerrar' : undefined}
            >
              <Square className="h-4 w-4 mr-2" />
              Cerrar Turno
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 px-6 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
          <Button variant="ghost" className="hover:bg-muted font-medium" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            variant="destructive"
            disabled={isSubmitting || !puedeCerrar}
            title={!puedeCerrar ? 'Cuenta el efectivo de la caja antes de cerrar' : undefined}
            className="px-6 font-bold shadow-md hover:shadow-lg transition-all"
          >
            <Square className="h-4 w-4 mr-2" fill="currentColor" />
            {isSubmitting ? 'Cerrando...' : 'Confirmar Cierre'}
          </Button>
        </div>
      )}
    </>
  )
}
