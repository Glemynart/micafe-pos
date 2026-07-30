'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LoaderCircle, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { envelope, mensajeError, solicitarBootstrap } from '@/lib/platform/client'
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
  const planes = usePlatformList('planes')
  const router = useRouter()
  const planesPublicados = planes.items.filter((plan) => plan.estado === 'PUBLICADA')
  const planSeleccionado = planesPublicados.find((plan) => plan.id === planId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!planSeleccionado) {
      setError('Selecciona un plan publicado para continuar.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const empresaId = String(form.get('empresaId'))
      const identidad = ownerConocido
        ? { ownerUid: String(form.get('ownerUid')) }
        : { nombreAdministrador: String(form.get('nombreAdministrador')) }
      const result = await solicitarBootstrap({
        ...envelope('BACKOFFICE_BOOTSTRAP_EMPRESARIAL'),
        ...identidad,
        empresaId,
        nombreComercial: String(form.get('nombreComercial')),
        paisFiscal: String(form.get('paisFiscal')).toUpperCase(),
        planId: planSeleccionado.id,
        planVersion: Number(planSeleccionado.planVersion ?? planSeleccionado.versionActual),
        trialDias: Number(form.get('trialDias')),
      })
      toast.success(result.estado === 'COMPLETED' ? 'Bootstrap empresarial completado' : 'Solicitud registrada para recuperación')
      setEmpresaCreada(empresaId)
      if (result.credencialInicial?.pinTemporal) {
        setCredencial({ codigo: result.credencialInicial.codigo, pinTemporal: result.credencialInicial.pinTemporal })
      } else {
        router.push(`/backoffice/empresas/${empresaId}`)
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
            <Field name="empresaId" label="ID opaco de Empresa" placeholder="empresa_acme_01" required />
            <div className="sm:col-span-2"><Field name="nombreComercial" label="Nombre comercial" placeholder="Café Central" required /></div>

            <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="ownerConocido" className="text-sm font-medium">El administrador ya tiene una cuenta de Firebase Auth</Label>
                <input id="ownerConocido" type="checkbox" checked={ownerConocido} onChange={(event) => setOwnerConocido(event.target.checked)} className="size-4" />
              </div>
              {ownerConocido ? (
                <Field name="ownerUid" label="UID del administrador inicial" placeholder="UID de Firebase Auth" required />
              ) : (
                <>
                  <Field name="nombreAdministrador" label="Nombre del administrador" placeholder="Ana Pérez" required />
                  <p className="text-xs leading-relaxed text-slate-400">Bootstrap crea la identidad ancla automáticamente (sin email ni contraseña); el administrador entra siempre por código + PIN, nunca por esta cuenta directamente.</p>
                </>
              )}
            </div>

            <Field name="paisFiscal" label="País fiscal" defaultValue="CO" required />
            <div className="space-y-2">
              <Label htmlFor="planId">Plan publicado</Label>
              <Select value={planId} onValueChange={setPlanId} disabled={planes.loading || planesPublicados.length === 0}>
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
            <Field name="trialDias" label="Días de trial" type="number" defaultValue="14" min="1" required />
            {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <div className="sm:col-span-2 flex justify-end"><Button disabled={loading || planes.loading || !planSeleccionado}>{loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Rocket className="mr-2 size-4" />}Solicitar Bootstrap canónico</Button></div>
          </form>
        </CardContent>
      </Card>
      <CredentialRevealDialog credencial={credencial} onClose={() => { setCredencial(null); if (empresaCreada) router.push(`/backoffice/empresas/${empresaCreada}`) }} />
    </>
  )
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, ...input } = props
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...input} /></div>
}
