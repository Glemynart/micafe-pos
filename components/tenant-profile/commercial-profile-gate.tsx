'use client'

import { useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { httpsCallable } from 'firebase/functions'
import { Building2, LoaderCircle, ShieldAlert } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { useSaaS } from '@/contexts/saas-context'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getFirebaseFunctions } from '@/lib/firebase'
import { perfilComercialCompleto, requierePasoPerfilComercialBodega } from '@/lib/configuracion'
import { mensajeSeguroErrorPerfilComercial } from '@/lib/configuracion/perfil-comercial-errores'
import { normalizarTexto } from '@/lib/configuracion/normalizacion'
import { puedeDiferirPerfilComercialDiana } from '@/lib/configuracion/perfil-comercial-gate'
import { departamentosDivipola, municipiosPorDepartamento, resolverDepartamentoDivipola, resolverMunicipioDivipola, validarUbicacionDivipola } from '@/lib/territory/divipola'

type FormularioPerfil = {
  nombreComercial: string
  razonSocial: string
  tipoPersona: 'NATURAL' | 'JURIDICA' | ''
  nit: string
  digitoVerificacion: string
  email: string
  telefono: string
  direccion: string
  departamentoCodigo: string
  departamentoNombre: string
  municipioCodigo: string
  municipioNombre: string
}

type SobreComandoPerfil = {
  fingerprint: string
  expectedRevision: number
  commandId: string
  idempotencyKey: string
  correlationId: string
}

const vacio: FormularioPerfil = {
  nombreComercial: '', razonSocial: '', tipoPersona: '', nit: '', digitoVerificacion: '', email: '', telefono: '',
  direccion: '', departamentoCodigo: '', departamentoNombre: '', municipioCodigo: '', municipioNombre: '',
}

function serializarPerfil(identidad: NonNullable<ReturnType<typeof useConfiguracionEmpresa>['proyecciones']>['identidad'], direccion: NonNullable<ReturnType<typeof useConfiguracionEmpresa>['proyecciones']>['localizacion']['direccion']): FormularioPerfil {
  return {
    nombreComercial: identidad.nombreComercial ?? '',
    razonSocial: identidad.razonSocial ?? '',
    tipoPersona: identidad.tipoPersona ?? '',
    nit: identidad.numeroDocumento ?? '',
    digitoVerificacion: identidad.digitoVerificacion ?? '',
    email: identidad.contacto.email ?? '',
    telefono: identidad.contacto.telefono ?? '',
    direccion: direccion.linea1 ?? '',
    departamentoCodigo: direccion.departamentoCodigo ?? '',
    departamentoNombre: direccion.departamentoNombre ?? '',
    municipioCodigo: direccion.municipioCodigo ?? '',
    municipioNombre: direccion.municipioNombre ?? '',
  }
}

export function CommercialProfileGate({ children }: { children: ReactNode }) {
  const { usuario } = useAuthContext()
  const { empresaId, membresia, loading: saasLoading, errorVerificacionTenant, refresh } = useSaaS()
  const { empresaId: empresaConfigId, vertical, estado, revision, error: errorConfiguracion, proyecciones, refrescar } = useConfiguracionEmpresa()
  const [form, setForm] = useState<FormularioPerfil>(vacio)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [formTenantId, setFormTenantId] = useState<string | null>(null)
  const [perfilDiferidoEstaSesion, setPerfilDiferidoEstaSesion] = useState(false)
  const borradorModificado = useRef(false)
  const formularioRef = useRef<HTMLFormElement>(null)
  const sobreComandoPendiente = useRef<SobreComandoPerfil | null>(null)

  const tenantCoincide = !!empresaId && empresaConfigId === empresaId && membresia?.empresaId === empresaId && membresia.uid === usuario?.uid
  const adminActivo = !!membresia && membresia.rol === 'admin' && membresia.estado === 'activa' && membresia.activo
  const puedeDiferirPerfil = puedeDiferirPerfilComercialDiana({
    empresaId,
    vertical,
    rolMembresia: membresia?.rol,
    membresiaActiva: adminActivo,
    tenantCoincide,
    estadoConfiguracion: estado,
  })
  const perfil = proyecciones ? { identidadFiscal: proyecciones.identidad, localizacion: proyecciones.localizacion } : null
  const requierePerfil = !!perfil && requierePasoPerfilComercialBodega({
    vertical,
    usuarioRol: usuario?.rol,
    membresiaRol: membresia?.rol,
    membresiaActiva: adminActivo,
    empresaCoincide: tenantCoincide,
    configuracion: perfil,
  })
  const municipiosDisponibles = useMemo(() => municipiosPorDepartamento(form.departamentoCodigo), [form.departamentoCodigo])

  useEffect(() => {
    setPerfilDiferidoEstaSesion(false)
  }, [empresaId, usuario?.uid])

  useEffect(() => {
    if (!empresaId || !proyecciones || empresaConfigId !== empresaId) return
    const formularioPersistido = serializarPerfil(proyecciones.identidad, proyecciones.localizacion.direccion)
    if (formTenantId !== empresaId) {
      sobreComandoPendiente.current = null
      borradorModificado.current = false
      setForm(formularioPersistido)
      setFormTenantId(empresaId)
      return
    }
    if (perfilComercialCompleto({ identidadFiscal: proyecciones.identidad, localizacion: proyecciones.localizacion })) {
      borradorModificado.current = false
      setForm(formularioPersistido)
      return
    }
    if (!borradorModificado.current) setForm(formularioPersistido)
  }, [empresaConfigId, empresaId, formTenantId, revision, proyecciones])

  if (usuario?.rol !== 'admin' || !empresaId || vertical !== 'BODEGA_MVP1') return <>{children}</>

  if (saasLoading || estado === 'CARGANDO') {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" /> Verificando el perfil del negocio…</span></div>
  }

  if (errorVerificacionTenant || estado !== 'LISTA' || !proyecciones || empresaConfigId !== empresaId || !tenantCoincide || !membresia || membresia.rol !== usuario.rol) {
    return <div className="mx-auto my-8 max-w-md rounded-2xl border border-amber-400/30 bg-card p-6 text-center">
      <ShieldAlert className="mx-auto mb-3 size-8 text-amber-500" />
      <h1 className="text-lg font-semibold">No se pudo verificar el negocio</h1>
      <p className="mt-2 text-sm text-muted-foreground">No mostraremos la administración hasta verificar tenant y configuración.</p>
      {(errorConfiguracion || errorVerificacionTenant) && <p className="mt-2 text-xs text-muted-foreground">Revisa la conexión e inténtalo de nuevo.</p>}
      <Button className="mt-5" variant="outline" onClick={() => { void Promise.all([refresh(), refrescar()]) }}>Reintentar</Button>
    </div>
  }

  if (!requierePerfil || perfilComercialCompleto(perfil!) || (puedeDiferirPerfil && perfilDiferidoEstaSesion)) return <>{children}</>

  if (formTenantId !== empresaId) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" /> Preparando el perfil del negocio…</span></div>
  }

  function update<K extends keyof FormularioPerfil>(field: K, value: FormularioPerfil[K]) {
    borradorModificado.current = true
    sobreComandoPendiente.current = null
    setMensajeExito(null)
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateDepartamento(nombre: string) {
    borradorModificado.current = true
    sobreComandoPendiente.current = null
    setMensajeExito(null)
    const departamento = resolverDepartamentoDivipola(nombre)
    setForm(current => ({
      ...current,
      departamentoNombre: departamento?.nombre ?? nombre,
      departamentoCodigo: departamento?.codigo ?? '',
      municipioNombre: '',
      municipioCodigo: '',
    }))
  }

  function updateMunicipio(nombre: string) {
    borradorModificado.current = true
    sobreComandoPendiente.current = null
    setMensajeExito(null)
    const municipio = resolverMunicipioDivipola(form.departamentoCodigo, nombre)
    setForm(current => ({
      ...current,
      municipioNombre: municipio?.municipio ?? nombre,
      municipioCodigo: municipio?.municipioCodigo ?? '',
    }))
  }

  async function guardar(avanceParcial: boolean) {
    if (!Number.isInteger(revision) || revision === null) return
    const departamentoIngresado = !!(form.departamentoNombre.trim() || form.departamentoCodigo.trim())
    const municipioIngresado = !!(form.municipioNombre.trim() || form.municipioCodigo.trim())
    const departamentoValido = !!resolverDepartamentoDivipola(form.departamentoNombre)
      && departamentosDivipola.some(item => item.codigo === form.departamentoCodigo
        && item.nombre === resolverDepartamentoDivipola(form.departamentoNombre)?.nombre)
    const municipioValido = validarUbicacionDivipola(form)
    if ((!avanceParcial && !municipioValido)
      || (avanceParcial && ((departamentoIngresado && !departamentoValido) || (municipioIngresado && !municipioValido)))) {
      setError('Selecciona el departamento y el municipio desde las opciones de búsqueda para guardar sus códigos oficiales.')
      return
    }
    if (avanceParcial) {
      const campos = Array.from(formularioRef.current?.elements ?? [])
      for (const elemento of campos) {
        if (!(elemento instanceof HTMLInputElement) && !(elemento instanceof HTMLSelectElement)) continue
        if (!elemento.value.trim()) continue
        if (!elemento.checkValidity()) {
          elemento.reportValidity()
          setError('Revisa los campos resaltados antes de guardar el avance.')
          return
        }
      }
    }
    setGuardando(true)
    setError(null)
    setMensajeExito(null)
    const perfilNormalizado: FormularioPerfil = {
      ...form,
      nombreComercial: normalizarTexto(form.nombreComercial),
      razonSocial: normalizarTexto(form.razonSocial),
      nit: normalizarTexto(form.nit),
      digitoVerificacion: normalizarTexto(form.digitoVerificacion),
      email: normalizarTexto(form.email).toLowerCase(),
      telefono: normalizarTexto(form.telefono),
      direccion: normalizarTexto(form.direccion),
      departamentoCodigo: normalizarTexto(form.departamentoCodigo),
      departamentoNombre: normalizarTexto(form.departamentoNombre),
      municipioCodigo: normalizarTexto(form.municipioCodigo),
      municipioNombre: normalizarTexto(form.municipioNombre),
    }
    setForm(perfilNormalizado)
    const datosPerfil = Object.fromEntries(Object.entries(perfilNormalizado).filter(([, valor]) => valor !== ''))
    if (avanceParcial && Object.keys(datosPerfil).length === 0) {
      setError('Ingresa al menos un dato antes de guardar el avance.')
      setGuardando(false)
      return
    }
    if (avanceParcial && ((datosPerfil.nit === undefined) !== (datosPerfil.digitoVerificacion === undefined))) {
      setError('Para guardar el NIT, completa también el dígito de verificación.')
      setGuardando(false)
      return
    }
    const datosAEnviar = avanceParcial ? datosPerfil : perfilNormalizado
    const fingerprint = JSON.stringify([avanceParcial, datosAEnviar])
    if (sobreComandoPendiente.current?.fingerprint !== fingerprint) {
      sobreComandoPendiente.current = {
        fingerprint,
        expectedRevision: revision,
        commandId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
      }
    }
    const sobre = sobreComandoPendiente.current
    try {
      const enviar = httpsCallable(getFirebaseFunctions('us-central1'), 'registrarPerfilComercialBodegaV1')
      await enviar({
        ...datosAEnviar,
        expectedRevision: sobre.expectedRevision,
        commandId: sobre.commandId,
        idempotencyKey: sobre.idempotencyKey,
        correlationId: sobre.correlationId,
      })
      sobreComandoPendiente.current = null
      borradorModificado.current = false
      try {
        await refrescar()
      } catch {
        setError('El perfil se guardó, pero no pudimos actualizar la pantalla. Recarga para continuar.')
        return
      }
      if (avanceParcial) setMensajeExito('Avance guardado. Puedes volver después; los campos pendientes seguirán aquí.')
    } catch (cause) {
      // Un timeout puede ocurrir después del commit. Releer primero hace el
      // replay seguro desde la perspectiva del usuario y evita exponer PII.
      try {
        await refrescar()
      } catch {
        // La pantalla seguirá cerrada por el estado de error del contexto.
      }
      setError(mensajeSeguroErrorPerfilComercial(cause) ?? 'No pudimos confirmar el guardado. Revisa los datos y vuelve a intentar; si ya se guardaron, continuarás al panel.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (key: keyof FormularioPerfil, etiqueta: string, type = 'text', props: ComponentProps<typeof Input> = {}) => (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={`perfil-${key}`}>
      {etiqueta}
      <Input id={`perfil-${key}`} name={key} type={type} required value={form[key]} onChange={(event) => update(key, event.target.value as never)} {...props} disabled={guardando} />
    </label>
  )

  return <section className="mx-auto my-6 max-w-xl rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="perfil-comercial-titulo">
    <div className="mb-5 flex items-start gap-3">
      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Building2 className="size-5" /></div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Primer acceso · Bodega</p>
        <h1 id="perfil-comercial-titulo" className="mt-1 text-2xl font-bold">Datos del negocio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Completa el perfil comercial para continuar. Estos datos los declara la administración; no se verifican ante DIAN.</p>
      </div>
    </div>

    <form ref={formularioRef} className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void guardar(false) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('nombreComercial', 'Nombre comercial', 'text', { maxLength: 120 })}
        {campo('razonSocial', 'Razón social', 'text', { maxLength: 240 })}
      </div>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="perfil-tipoPersona">Tipo de persona
        <select id="perfil-tipoPersona" required disabled={guardando} value={form.tipoPersona} onChange={(event) => update('tipoPersona', event.target.value as FormularioPerfil['tipoPersona'])} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Selecciona una opción</option><option value="NATURAL">Natural</option><option value="JURIDICA">Jurídica</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        {campo('nit', 'NIT', 'text', { inputMode: 'numeric', maxLength: 15, pattern: '[0-9]{6,15}', autoComplete: 'off' })}
        {campo('digitoVerificacion', 'Dígito de verificación', 'text', { inputMode: 'numeric', maxLength: 1, pattern: '[0-9]', autoComplete: 'off' })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('email', 'Correo de contacto', 'email', { maxLength: 254, autoComplete: 'email' })}
        {campo('telefono', 'Teléfono de contacto', 'tel', { maxLength: 20, inputMode: 'tel', placeholder: '+573001234567', autoComplete: 'tel', pattern: '\\+[1-9][0-9]{6,14}' })}
      </div>
      {campo('direccion', 'Dirección del negocio', 'text', { maxLength: 120, autoComplete: 'street-address' })}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="perfil-departamentoNombre">Departamento
          <Input id="perfil-departamentoNombre" name="departamentoNombre" type="text" list="perfil-divipola-departamentos" autoComplete="address-level1" required maxLength={100} value={form.departamentoNombre} onChange={event => updateDepartamento(event.target.value)} disabled={guardando} />
          <datalist id="perfil-divipola-departamentos">{departamentosDivipola.map(item => <option key={item.codigo} value={item.nombre} />)}</datalist>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="perfil-municipioNombre">Ciudad o municipio
          <Input id="perfil-municipioNombre" name="municipioNombre" type="text" list="perfil-divipola-municipios" autoComplete="address-level2" required maxLength={100} value={form.municipioNombre} onChange={event => updateMunicipio(event.target.value)} disabled={guardando || !form.departamentoCodigo} />
          <datalist id="perfil-divipola-municipios">{municipiosDisponibles.map(item => <option key={item.municipioCodigo} value={item.municipio} />)}</datalist>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">El código territorial se asigna automáticamente al elegir una opción válida; no necesitas conocerlo ni escribirlo.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">Podrás continuar en modo DEMO sin facturación electrónica. Régimen, actividad económica y numeración se configuran después, si el negocio decide activar la facturación.</p>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {mensajeExito && <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{mensajeExito}</p>}
      <p className="text-xs text-muted-foreground">Guardar avance conserva los datos válidos en la configuración del negocio. Para continuar en DEMO, completa todos los campos obligatorios.</p>
      <Button type="button" variant="outline" disabled={guardando} onClick={() => void guardar(true)}>
        {guardando ? <><LoaderCircle className="size-4 animate-spin" /> Guardando avance…</> : 'Guardar avance'}
      </Button>
      <Button type="submit" disabled={guardando} className="w-full">
        {guardando ? <><LoaderCircle className="size-4 animate-spin" /> Guardando perfil…</> : 'Guardar y continuar en DEMO'}
      </Button>
    </form>
    {puedeDiferirPerfil && <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm">Para este tenant puedes entrar a DEMO y completar los datos del negocio después. El perfil seguirá pendiente y no se activa facturación.</p>
      <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setPerfilDiferidoEstaSesion(true)}>
        Continuar en DEMO y completar después
      </Button>
    </div>}
  </section>
}
