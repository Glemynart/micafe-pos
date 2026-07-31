'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LoaderCircle, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { envelope, mensajeError, solicitarBootstrap, type ResultadoBootstrapEmpresarial, type SolicitudBootstrap } from '@/lib/platform/client'
import { PageIntro } from './ui'
import { usePlatformList } from './use-platform-list'
import { CredentialRevealDialog, type CredencialEntrega } from './credential-reveal-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function BootstrapForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ownerConocido, setOwnerConocido] = useState(false)
  const [credencial, setCredencial] = useState<CredencialEntrega | null>(null)
  const [empresaCreada, setEmpresaCreada] = useState<string | null>(null)
  const [planId, setPlanId] = useState('')
  const [solicitud, setSolicitud] = useState<ReturnType<typeof envelope> | null>(null)
  const [entradaBootstrap, setEntradaBootstrap] = useState<SolicitudBootstrap | null>(null)
  const [resultado, setResultado] = useState<ResultadoBootstrapEmpresarial | null>(null)
  const planes = usePlatformList('planes')
  const router = useRouter()
  const planesPublicados = planes.items.filter((plan) => plan.estado === 'PUBLICADA')
  const planSeleccionado = planesPublicados.find((plan) => plan.id === planId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!entradaBootstrap && !planSeleccionado) {
      setError('Selecciona un plan publicado para continuar.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const solicitudActual = solicitud ?? envelope('BACKOFFICE_BOOTSTRAP_EMPRESARIAL')
      const entrada = entradaBootstrap ?? {
        ...solicitudActual,
        ...(ownerConocido
          ? { ownerUid: String(form.get('ownerUid')) }
          : { nombreAdministrador: String(form.get('nombreAdministrador')) }),
        empresaId: String(form.get('empresaId')),
        nombreComercial: String(form.get('nombreComercial')),
        paisFiscal: String(form.get('paisFiscal')).toUpperCase(),
        planId: planSeleccionado!.id,
        planVersion: Number(planSeleccionado!.planVersion ?? planSeleccionado!.versionActual),
        trialDias: Number(form.get('trialDias')),
      }
      if (!solicitud) setSolicitud(solicitudActual)
      if (!entradaBootstrap) setEntradaBootstrap(entrada)

      const result = await solicitarBootstrap(entrada)
      const empresaId = String(entrada.empresaId)
      const pinTemporal = result.credencialInicial?.pinTemporal ?? null
      if (pinTemporal) {
        setCredencial({ codigo: result.credencialInicial!.codigo, pinTemporal })
      }
      // El PIN vive únicamente en `credencial` (memoria; se limpia al cerrar el
      // diálogo). `resultado` no lo retiene ni siquiera mientras el diálogo
      // sigue abierto — nada más lo necesita: el estado se decide con `.estado`.
      setResultado(pinTemporal ? { ...result, credencialInicial: { ...result.credencialInicial!, pinTemporal: null } } : result)
      setEmpresaCreada(empresaId)
      if (result.estado === 'COMPLETED') {
        toast.success('Bootstrap empresarial completado')
        if (!pinTemporal) router.push(`/backoffice/empresas/${empresaId}`)
      } else if (result.estado === 'RETRYABLE_FAILURE') {
        toast.warning('El Bootstrap quedó pendiente de recuperación. Reintenta esta misma solicitud.')
      } else {
        toast.message('El Bootstrap sigue en proceso.')
      }
    } catch (cause) {
      setError(mensajeError(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageIntro eyebrow="Provisionamiento" title="Solicitar Bootstrap empresarial" description="El Backoffice solo solicita el comando. ADR-SAAS-007 crea el núcleo empresarial, la membresía inicial y los claims tenant." action={<Button variant="outline" asChild><Link href="/backoffice/empresas"><ArrowLeft className="mr-2 size-4" />Volver</Link></Button>} />
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Datos de la solicitud</CardTitle>
          <CardDescription>Selecciona un plan publicado. La versión se asigna automáticamente para conservar el contrato comercial del tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
            <Field name="empresaId" label="ID opaco de Empresa" placeholder="empresa_acme_01" required disabled={Boolean(entradaBootstrap)} />
            <div className="sm:col-span-2"><Field name="nombreComercial" label="Nombre comercial" placeholder="Café Central" required disabled={Boolean(entradaBootstrap)} /></div>

            <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="ownerConocido" className="text-sm font-medium">El administrador ya tiene una cuenta de Firebase Auth</Label>
                <input id="ownerConocido" type="checkbox" checked={ownerConocido} onChange={(event) => setOwnerConocido(event.target.checked)} className="size-4" disabled={Boolean(entradaBootstrap)} />
              </div>
              {ownerConocido ? (
                <Field name="ownerUid" label="UID del administrador inicial" placeholder="UID de Firebase Auth" required disabled={Boolean(entradaBootstrap)} />
              ) : (
                <>
                  <Field name="nombreAdministrador" label="Nombre del administrador" placeholder="Ana Pérez" required disabled={Boolean(entradaBootstrap)} />
                  <p className="text-xs leading-relaxed text-slate-400">Bootstrap crea la identidad ancla automáticamente (sin email ni contraseña); el administrador entra siempre por código + PIN, nunca por esta cuenta directamente.</p>
                </>
              )}
            </div>

            <Field name="paisFiscal" label="País fiscal" defaultValue="CO" required disabled={Boolean(entradaBootstrap)} />
            <div className="space-y-2">
              <Label htmlFor="planId">Plan publicado</Label>
              <Select value={planId} onValueChange={setPlanId} disabled={Boolean(entradaBootstrap) || planes.loading || planesPublicados.length === 0}>
                <SelectTrigger id="planId" className="w-full">
                  <SelectValue placeholder={planes.loading ? 'Cargando planes publicados...' : 'Selecciona un plan'} />
                </SelectTrigger>
                <SelectContent>
                  {planesPublicados.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.codigo ?? plan.id} · versión {plan.planVersion ?? plan.versionActual}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {planes.error ? <p role="alert" className="text-xs text-rose-700">No fue posible cargar los planes: {planes.error}</p> : null}
              {!planes.loading && !planes.error && planesPublicados.length === 0 ? <p className="text-xs text-slate-500">No hay planes publicados. Crea y publica uno antes de provisionar una empresa.</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Versión asignada</Label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700" aria-live="polite">
                {planSeleccionado ? `Versión ${planSeleccionado.planVersion ?? planSeleccionado.versionActual}` : 'Se asigna al seleccionar un plan'}
              </div>
            </div>
            <Field name="trialDias" label="Días de trial" type="number" defaultValue="14" min="1" required disabled={Boolean(entradaBootstrap)} />
            <BootstrapStatus loading={loading} resultado={resultado} />
            {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <div className="sm:col-span-2 flex justify-end"><Button disabled={loading || (!entradaBootstrap && (planes.loading || !planSeleccionado))}>{loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Rocket className="mr-2 size-4" />}{resultado?.estado === 'RETRYABLE_FAILURE' ? 'Reintentar Bootstrap canónico' : 'Solicitar Bootstrap canónico'}</Button></div>
          </form>
        </CardContent>
      </Card>
      <CredentialRevealDialog credencial={credencial} onClose={() => { setCredencial(null); if (empresaCreada && resultado?.estado === 'COMPLETED') router.push(`/backoffice/empresas/${empresaCreada}`) }} />
    </>
  )
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, ...input } = props
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...input} /></div>
}

function BootstrapStatus({ loading, resultado }: { loading: boolean; resultado: ResultadoBootstrapEmpresarial | null }) {
  if (loading) return <p role="status" className="sm:col-span-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">Procesando el Bootstrap canónico…</p>
  if (!resultado) return null
  if (resultado.estado === 'COMPLETED') return <p role="status" className="sm:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Bootstrap completado.</p>
  if (resultado.estado === 'RETRYABLE_FAILURE') return <p role="status" className="sm:col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">El Bootstrap requiere recuperación. Reintenta sin modificar la solicitud.</p>
  return <p role="status" className="sm:col-span-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">Estado actual del Bootstrap: {resultado.estado}.</p>
}
