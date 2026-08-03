'use client'

import { useRef, useState } from 'react'
import { Check, Loader2, Building2, Receipt, Users, ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { EstadoReadinessTotal } from '@/lib/onboarding/contrato'

interface OnboardingWizardProps {
  empresaId: string
  readinessTotal: EstadoReadinessTotal
  numeracionBorradorId?: string
  onCompletado: () => void
  onCancelar?: () => void
}

function calcularDigitoVerificacionNIT(nit: string): string | null {
  if (!/^\d{6,15}$/.test(nit)) return null

  const pesos = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  const suma = [...nit].reduce((total, digito, indice) => (
    total + Number(digito) * pesos[pesos.length - nit.length + indice]
  ), 0)
  const residuo = suma % 11

  return String(residuo > 1 ? 11 - residuo : residuo)
}

export function OnboardingWizard({
  empresaId,
  readinessTotal,
  numeracionBorradorId = 'num_pos_1',
  onCompletado,
  onCancelar,
}: OnboardingWizardProps) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [guardando, setGuardando] = useState(false)

  // Paso 1: Configuración Fiscal
  const [razonSocial, setRazonSocial] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [digitoVerificacion, setDigitoVerificacion] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tipoPersona, setTipoPersona] = useState('')
  const [regimenTributario, setRegimenTributario] = useState('')
  const [actividadEconomicaPrincipal, setActividadEconomicaPrincipal] = useState('')
  const [responsabilidadFiscal, setResponsabilidadFiscal] = useState('')
  const [departamentoCodigo, setDepartamentoCodigo] = useState('')
  const [departamentoNombre, setDepartamentoNombre] = useState('')
  const [municipioCodigo, setMunicipioCodigo] = useState('')
  const [municipioNombre, setMunicipioNombre] = useState('')
  const [errorFiscal, setErrorFiscal] = useState<string | null>(null)
  const nitInputRef = useRef<HTMLInputElement>(null)

  // Paso 2: Numeración Fiscal POS
  const [prefijo, setPrefijo] = useState('')
  const [resolucion, setResolucion] = useState('')
  const [rangoInicio, setRangoInicio] = useState('')
  const [rangoFin, setRangoFin] = useState('')
  const [vigenciaDesde, setVigenciaDesde] = useState('')
  const [vigenciaHasta, setVigenciaHasta] = useState('')

  // Paso 3: Invitar Equipo (MT-U5B)
  const [emailEmpleado, setEmailEmpleado] = useState('')
  const [rolEmpleado, setRolEmpleado] = useState('cajero')

  const handlePasoFiscal = async () => {
    if (!razonSocial.trim() || !numeroDocumento.trim() || !direccion.trim() || !tipoPersona || !regimenTributario || !/^\d{4}$/.test(actividadEconomicaPrincipal) || !/^\d{2}$/.test(departamentoCodigo) || !departamentoNombre.trim() || !/^\d{5}$/.test(municipioCodigo) || !municipioNombre.trim()) {
      setErrorFiscal('Completa la razón social, el NIT y la dirección fiscal para continuar.')
      toast.error('Por favor completa todos los campos fiscales obligatorios.')
      return
    }
    const dvCalculado = calcularDigitoVerificacionNIT(numeroDocumento)
    if (!dvCalculado) {
      setErrorFiscal('El NIT debe contener entre 6 y 15 dígitos. El dígito de verificación se calcula automáticamente.')
      nitInputRef.current?.focus()
      return
    }
    setErrorFiscal(null)
    setGuardando(true)
    try {
      // Simular / Invocación de Callable para guardar paso fiscal (B1)
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const functions = getFunctions(undefined, 'us-central1')
      const fn = httpsCallable(functions, 'completarPasoFiscalOnboardingCallable')

      const cmdId = `cmd_paso1_${Date.now()}`
      await fn({
        commandId: cmdId,
        idempotencyKey: `idem_${cmdId}`,
        correlationId: `corr_${cmdId}`,
        causationId: `cause_${cmdId}`,
        expectedRevision: 1,
        identidadFiscal: {
          razonSocial: razonSocial.trim(),
          tipoPersona,
          tipoDocumento: 'NIT',
          numeroDocumento: numeroDocumento.trim(),
          digitoVerificacion: dvCalculado,
          regimenTributario,
          actividadEconomicaPrincipal: actividadEconomicaPrincipal.trim(),
          ...(responsabilidadFiscal.trim() ? { responsabilidadFiscal: responsabilidadFiscal.trim() } : {}),
        },
        direccionFiscal: {
          linea1: direccion.trim(),
          departamentoCodigo: departamentoCodigo.trim(),
          departamentoNombre: departamentoNombre.trim(),
          municipioCodigo: municipioCodigo.trim(),
          municipioNombre: municipioNombre.trim(),
        },
      })

      toast.success('Información fiscal guardada.')
      setPaso(2)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al guardar la información fiscal.')
    } finally {
      setGuardando(false)
    }
  }

  const handlePasoNumeracion = async () => {
    const inicio = Number(rangoInicio)
    const fin = Number(rangoFin)
    if (!prefijo.trim() || !resolucion.trim() || !Number.isInteger(inicio) || !Number.isInteger(fin) || inicio < 1 || fin < inicio || !vigenciaDesde || !vigenciaHasta || vigenciaDesde >= vigenciaHasta) {
      toast.error('Ingresa el prefijo y número de resolución.')
      return
    }
    setGuardando(true)
    try {
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const functions = getFunctions(undefined, 'us-central1')
      const fn = httpsCallable(functions, 'completarPasoNumeracionOnboardingCallable')

      const cmdId = `cmd_paso2_${Date.now()}`
      await fn({
        commandId: cmdId,
        idempotencyKey: `idem_${cmdId}`,
        correlationId: `corr_${cmdId}`,
        causationId: `cause_${cmdId}`,
        expectedRevision: 1,
        numeracionId: numeracionBorradorId,
        prefijo: prefijo.trim().toUpperCase(),
        resolucion: resolucion.trim(),
        rangoInicio: inicio,
        rangoFin: fin,
        vigenciaDesde,
        vigenciaHasta,
      })

      toast.success('Numeración habilitada y asignada correctamente.')
      setPaso(3)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al configurar la numeración fiscal.')
    } finally {
      setGuardando(false)
    }
  }

  const handleFinalizar = async () => {
    setGuardando(true)
    try {
      if (emailEmpleado.trim()) {
        const { httpsCallable, getFunctions } = await import('firebase/functions')
        const functions = getFunctions(undefined, 'us-central1')
        const fnInvitacion = httpsCallable(functions, 'crearIncorporacionEmail')
        await fnInvitacion({
          empresaId,
          email: emailEmpleado.trim(),
          rol: rolEmpleado,
        })
        toast.success(`Invitación enviada a ${emailEmpleado}`)
      }
      toast.success('¡Onboarding completado con éxito! Tu restaurante está listo para operar.')
      onCompletado()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al finalizar el onboarding.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 max-w-2xl mx-auto bg-background rounded-2xl shadow-xl border border-border/40">
      {onCancelar ? (
        <div className="w-full flex justify-end mb-3">
          <Button variant="ghost" size="sm" onClick={onCancelar} disabled={guardando}>Continuar más tarde</Button>
        </div>
      ) : null}
      {/* Pasos Header */}
      <div className="flex items-center justify-between w-full mb-8 px-4">
        <div className={`flex items-center gap-2 ${paso >= 1 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${paso >= 1 ? 'bg-primary text-primary-foreground' : ''}`}>
            1
          </div>
          <span className="hidden sm:inline">Datos Fiscales</span>
        </div>
        <div className="w-12 h-0.5 bg-border" />
        <div className={`flex items-center gap-2 ${paso >= 2 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${paso >= 2 ? 'bg-primary text-primary-foreground' : ''}`}>
            2
          </div>
          <span className="hidden sm:inline">Numeración POS</span>
        </div>
        <div className="w-12 h-0.5 bg-border" />
        <div className={`flex items-center gap-2 ${paso >= 3 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${paso >= 3 ? 'bg-primary text-primary-foreground' : ''}`}>
            3
          </div>
          <span className="hidden sm:inline">Equipo</span>
        </div>
      </div>

      {/* Contenido del Paso */}
      {paso === 1 && (
        <div className="w-full space-y-5 animate-fade-in">
          <div className="flex items-center gap-3 text-primary">
            <Building2 className="w-6 h-6" />
            <h2 className="text-xl font-bold text-foreground">Identidad y Dirección Fiscal</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Ingresa los datos de tu empresa para la emisión de tiquetes e impuestos (B1).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="razon-social">Razón Social *</Label>
              <Input
                id="razon-social"
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value)
                  setErrorFiscal(null)
                }}
                placeholder="Mi Negocio S.A.S."
              />
            </div>
            <div className="grid grid-cols-3 gap-2 space-y-1">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="nit">NIT *</Label>
                <Input
                  ref={nitInputRef}
                  id="nit"
                  value={numeroDocumento}
                  onChange={(e) => {
                    const nit = e.target.value.replace(/\D/g, '')
                    setNumeroDocumento(nit)
                    setDigitoVerificacion(calcularDigitoVerificacionNIT(nit) ?? '')
                    setErrorFiscal(null)
                  }}
                  placeholder="900123456"
                  inputMode="numeric"
                  maxLength={15}
                  aria-invalid={Boolean(errorFiscal)}
                  aria-describedby={errorFiscal ? 'nit-error' : 'nit-help'}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dv">DV</Label>
                <Input
                  id="dv"
                  value={digitoVerificacion}
                  readOnly
                  aria-readonly="true"
                  placeholder="—"
                />
              </div>
            </div>
          </div>
          <p id="nit-help" className="text-xs text-muted-foreground">
            El dígito de verificación se calcula automáticamente a partir del NIT.
          </p>
          {errorFiscal ? (
            <p id="nit-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorFiscal}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="direccion-fiscal">Dirección Comercial / Fiscal *</Label>
            <Input
              id="direccion-fiscal"
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value)
                setErrorFiscal(null)
              }}
              placeholder="Calle 100 # 15-20, Bogotá"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="tipo-persona">Tipo de persona *</Label>
              <select id="tipo-persona" value={tipoPersona} onChange={(e) => setTipoPersona(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Selecciona una opción</option>
                <option value="NATURAL">Natural</option>
                <option value="JURIDICA">Jurídica</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="regimen-tributario">Régimen tributario *</Label>
              <select id="regimen-tributario" value={regimenTributario} onChange={(e) => setRegimenTributario(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Selecciona una opción</option>
                <option value="no_responsable">No responsable</option>
                <option value="responsable_inc">Responsable de INC</option>
                <option value="responsable_iva">Responsable de IVA</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="actividad-economica">Actividad económica CIIU *</Label>
              <Input id="actividad-economica" value={actividadEconomicaPrincipal} onChange={(e) => setActividadEconomicaPrincipal(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Código real de 4 dígitos" inputMode="numeric" maxLength={4} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="responsabilidad-fiscal">Responsabilidad fiscal</Label>
              <Input id="responsabilidad-fiscal" value={responsabilidadFiscal} onChange={(e) => setResponsabilidadFiscal(e.target.value)} placeholder="Dato real, si aplica" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="departamento-codigo">Código departamento *</Label>
              <Input id="departamento-codigo" value={departamentoCodigo} onChange={(e) => setDepartamentoCodigo(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Código DIVIPOLA" inputMode="numeric" maxLength={2} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="departamento-nombre">Departamento *</Label>
              <Input id="departamento-nombre" value={departamentoNombre} onChange={(e) => setDepartamentoNombre(e.target.value)} placeholder="Nombre real" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="municipio-codigo">Código municipio *</Label>
              <Input id="municipio-codigo" value={municipioCodigo} onChange={(e) => setMunicipioCodigo(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Código DIVIPOLA" inputMode="numeric" maxLength={5} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="municipio-nombre">Municipio *</Label>
              <Input id="municipio-nombre" value={municipioNombre} onChange={(e) => setMunicipioNombre(e.target.value)} placeholder="Nombre real" />
            </div>
          </div>
          <Button
            onClick={handlePasoFiscal}
            disabled={guardando}
            className="w-full h-12 mt-4 font-bold"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Guardar y Continuar <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
        </div>
      )}

      {paso === 2 && (
        <div className="w-full space-y-5 animate-fade-in">
          <div className="flex items-center gap-3 text-primary">
            <Receipt className="w-6 h-6" />
            <h2 className="text-xl font-bold text-foreground">Numeración y Autorización POS</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Configura la resolución de tiquetes POS para autorizar las ventas comerciales (B2).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Prefijo *</Label>
              <Input
                value={prefijo}
                onChange={(e) => setPrefijo(e.target.value)}
                placeholder="POS"
              />
            </div>
            <div className="space-y-1">
              <Label>No. Resolución *</Label>
              <Input
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
                placeholder="18760000001"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Rango Desde</Label>
              <Input
                value={rangoInicio}
                onChange={(e) => setRangoInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Rango Hasta</Label>
              <Input
                value={rangoFin}
                onChange={(e) => setRangoFin(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Vigencia desde *</Label>
              <Input type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Vigencia hasta *</Label>
              <Input type="date" value={vigenciaHasta} onChange={(e) => setVigenciaHasta(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={handlePasoNumeracion}
            disabled={guardando}
            className="w-full h-12 mt-4 font-bold"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Habilitar Numeración <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
        </div>
      )}

      {paso === 3 && (
        <div className="w-full space-y-5 animate-fade-in">
          <div className="flex items-center gap-3 text-primary">
            <Users className="w-6 h-6" />
            <h2 className="text-xl font-bold text-foreground">Invitar Equipo (Opcional)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Puedes invitar a tus cajeros o administradores mediante correo (MT-U5B) o hacerlo más tarde.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <Label>Correo del empleado</Label>
              <Input
                type="email"
                value={emailEmpleado}
                onChange={(e) => setEmailEmpleado(e.target.value)}
                placeholder="cajero@restaurante.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Rol</Label>
              <select
                value={rolEmpleado}
                onChange={(e) => setRolEmpleado(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="cajero">Cajero</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <Button
            onClick={handleFinalizar}
            disabled={guardando}
            className="w-full h-12 mt-4 font-bold bg-green-600 hover:bg-green-700 text-white"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4 mr-2" /> Finalizar y Entrar al POS</>}
          </Button>
        </div>
      )}
    </div>
  )
}
