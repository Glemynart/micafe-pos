import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { evaluarDisponibilidadVentaDemostracion, evaluarReadinessTotal, type EstadoReadinessTotal, type EstadoVentaDemostracion } from "../../../lib/onboarding/contrato";
import type { ConfiguracionEmpresa, OperacionConfiguracion } from "../../../lib/configuracion";
import type { Asignacion, Numeracion, ScopeFiscal } from "../../../lib/fiscal/contrato";
import type { PlanVersion, Suscripcion } from "../../../lib/suscripciones/contrato";
import {
  actualizarNumeracionBorrador,
  establecerAsignacion,
  transicionarNumeracion,
  type ContextoFiscal,
  type Envelope,
} from "../fiscal/service";
import { ejecutarComandoConfiguracion } from "../configuracion/service";
import { resolverModulosInicialesDelPlan } from "../configuracion/capacidades-plan";

const fail = (code: "invalid-argument" | "failed-precondition" | "not-found", msg: string): never => {
  throw new HttpsError(code, msg);
};

export interface EstadoOnboardingTenant {
  empresaId: string;
  nombreComercial: string;
  estadoEmpresa: string;
  readinessTotal: EstadoReadinessTotal;
  numeracionBorrador: Numeracion | null;
  ventaDemostracion: EstadoVentaDemostracion;
}

export async function obtenerEstadoOnboardingTenant(
  db: Firestore,
  empresaId: string,
  paisFiscal: string
): Promise<EstadoOnboardingTenant> {
  const [empresaSnap, configSnap, numeracionesSnap, asignacionesSnap, suscripcionSnap] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("configuraciones").doc(empresaId).get(),
    db.collection("numeraciones").where("empresaId", "==", empresaId).get(),
    db.collection("asignaciones_numeracion").where("empresaId", "==", empresaId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
  ]);

  if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
  if (!configSnap.exists) fail("not-found", "CONFIG_NOT_FOUND");

  const empresaData = empresaSnap.data()!;
  const configData = configSnap.data() as ConfiguracionEmpresa;
  const numeraciones = numeracionesSnap.docs.map((d) => d.data() as Numeracion);
  const asignaciones = asignacionesSnap.docs.map((d) => d.data() as Asignacion);

  const readinessTotal = evaluarReadinessTotal(configData, numeraciones, asignaciones, {
    empresaId,
    paisFiscalEmpresa: paisFiscal,
  });

  const borrador = numeraciones.find((n) => n.estado === "BORRADOR" && n.tipoDocumento === "pos") ?? null;
  const suscripcion = suscripcionSnap.exists ? suscripcionSnap.data() as Suscripcion : undefined;
  const planSnap = suscripcion
    ? await db.collection("planes").doc(suscripcion.planId).collection("versiones").doc(String(suscripcion.planVersion)).get()
    : null;
  const plan = planSnap?.exists ? planSnap.data() as PlanVersion : undefined;
  const ventaDemostracion = evaluarDisponibilidadVentaDemostracion(
    String(empresaData.estado ?? ""),
    suscripcion,
    plan,
    readinessTotal.detalles.configuracion.fiscal.lista &&
      readinessTotal.detalles.numeracion.lista,
  );

  return {
    empresaId,
    nombreComercial: String(empresaData.nombreComercial ?? ""),
    estadoEmpresa: String(empresaData.estado ?? ""),
    readinessTotal,
    numeracionBorrador: borrador,
    ventaDemostracion,
  };
}

export interface EntradaPasoFiscalOnboarding extends Envelope {
  identidadFiscal: {
    razonSocial: string;
    tipoPersona: string;
    tipoDocumento: string;
    numeroDocumento: string;
    digitoVerificacion: string;
    regimenTributario: string;
    actividadEconomicaPrincipal: string;
    responsabilidadFiscal?: string;
    contactoEmail?: string;
    contactoTelefono?: string;
  };
  direccionFiscal: {
    linea1: string;
    departamentoCodigo: string;
    departamentoNombre: string;
    municipioCodigo: string;
    municipioNombre: string;
  };
}

export async function completarPasoConfiguracionFiscalOnboarding(
  db: Firestore,
  entrada: EntradaPasoFiscalOnboarding,
  contexto: { empresaId: string; actorId: string; paisFiscal: string }
) {
  const configSnap = await db.collection("configuraciones").doc(contexto.empresaId).get();
  if (!configSnap.exists) fail("not-found", "CONFIG_NOT_FOUND");
  const actual = configSnap.data() as ConfiguracionEmpresa;
  const modulosIniciales = await resolverModulosInicialesDelPlan(db, contexto.empresaId);

  // Aplicar actualización de datos fiscales y dirección mediante comando B1 (ActualizarParametrosFiscales)
  const operaciones: OperacionConfiguracion[] = [
    { tipo: "SET", ruta: "identidadFiscal.razonSocial", valor: entrada.identidadFiscal.razonSocial },
    { tipo: "SET", ruta: "identidadFiscal.tipoPersona", valor: entrada.identidadFiscal.tipoPersona },
    { tipo: "SET", ruta: "identidadFiscal.tipoDocumento", valor: entrada.identidadFiscal.tipoDocumento },
    { tipo: "SET", ruta: "identidadFiscal.numeroDocumento", valor: entrada.identidadFiscal.numeroDocumento },
    { tipo: "SET", ruta: "identidadFiscal.digitoVerificacion", valor: entrada.identidadFiscal.digitoVerificacion },
    { tipo: "SET", ruta: "identidadFiscal.regimenTributario", valor: entrada.identidadFiscal.regimenTributario },
    { tipo: "SET", ruta: "identidadFiscal.actividadEconomicaPrincipal", valor: entrada.identidadFiscal.actividadEconomicaPrincipal },
    { tipo: "SET", ruta: "identidadFiscal.responsabilidadesFiscales", valor: entrada.identidadFiscal.responsabilidadFiscal ? [entrada.identidadFiscal.responsabilidadFiscal] : [] },
    { tipo: "SET", ruta: "localizacion.direccion.linea1", valor: entrada.direccionFiscal.linea1 },
    { tipo: "SET", ruta: "localizacion.direccion.departamentoCodigo", valor: entrada.direccionFiscal.departamentoCodigo },
    { tipo: "SET", ruta: "localizacion.direccion.departamentoNombre", valor: entrada.direccionFiscal.departamentoNombre },
    { tipo: "SET", ruta: "localizacion.direccion.municipioCodigo", valor: entrada.direccionFiscal.municipioCodigo },
    { tipo: "SET", ruta: "localizacion.direccion.municipioNombre", valor: entrada.direccionFiscal.municipioNombre },
    { tipo: "SET", ruta: "modulos.habilitados", valor: modulosIniciales },
  ];

  if (entrada.identidadFiscal.contactoEmail) {
    operaciones.push({ tipo: "SET", ruta: "identidadFiscal.contacto.email", valor: entrada.identidadFiscal.contactoEmail });
  }
  if (entrada.identidadFiscal.contactoTelefono) {
    operaciones.push({ tipo: "SET", ruta: "identidadFiscal.contacto.telefono", valor: entrada.identidadFiscal.contactoTelefono });
  }

  return ejecutarComandoConfiguracion(
    db,
    {
      comando: "ActualizarConfiguracionEmpresa",
      expectedRevision: actual.revision,
      idempotencyKey: entrada.idempotencyKey,
      commandId: entrada.commandId,
      correlationId: entrada.correlationId,
      motivo: entrada.motivo ?? "ONBOARDING_PASO_FISCAL",
      operaciones,
    },
    { empresaId: contexto.empresaId, actorId: contexto.actorId, origen: "ADMIN", paisFiscal: contexto.paisFiscal, modulosPermitidos: modulosIniciales, metodosPagoPermitidos: ["efectivo", "transferencia", "cuenta_cobro", "mixto"] }
  );
}

export interface EntradaPasoNumeracionOnboarding extends Envelope {
  numeracionId: string;
  prefijo: string;
  resolucion: string;
  rangoInicio: number;
  rangoFin: number;
  vigenciaDesde: string;
  vigenciaHasta: string;
  scope?: ScopeFiscal;
}

export async function completarPasoNumeracionOnboarding(
  db: Firestore,
  entrada: EntradaPasoNumeracionOnboarding,
  contexto: ContextoFiscal
) {
  const numeracionRef = db.collection("numeraciones").doc(`${contexto.empresaId}_${entrada.numeracionId}`);
  const snap = await numeracionRef.get();
  if (!snap.exists) fail("not-found", "NUMERACION_NOT_FOUND");
  const actual = snap.data() as Numeracion;

  const scopeFinal = entrada.scope ?? "EMPRESA";

  // 1. Actualizar el Borrador (B2)
  const actualizacion = await actualizarNumeracionBorrador(
    db,
    {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      correlationId: entrada.correlationId,
      causationId: entrada.causationId,
      expectedRevision: actual.revision,
      motivo: "ONBOARDING_ACTUALIZAR_NUMERACION",
      numeracionId: entrada.numeracionId,
      tipoDocumento: "pos",
      scope: scopeFinal,
      prefijo: entrada.prefijo.trim().toUpperCase(),
      resolucion: entrada.resolucion.trim(),
      rangoInicio: entrada.rangoInicio,
      rangoFin: entrada.rangoFin,
      vigenciaDesde: entrada.vigenciaDesde,
      vigenciaHasta: entrada.vigenciaHasta,
    },
    contexto
  );

  // 2. Habilitar Numeración (B2)
  const habilitacion = await transicionarNumeracion(
    db,
    {
      commandId: `cmd_hab_${entrada.commandId}`,
      idempotencyKey: `idem_hab_${entrada.idempotencyKey}`,
      correlationId: entrada.correlationId,
      causationId: entrada.causationId,
      expectedRevision: actualizacion.revision,
      motivo: "ONBOARDING_HABILITAR_NUMERACION",
      numeracionId: entrada.numeracionId,
      accion: "HABILITAR",
    },
    contexto
  );

  // 3. Establecer Asignación VIGENTE (B2)
  const asignacionDocRef = db
    .collection("asignaciones_numeracion")
    .doc(`${contexto.empresaId}_${scopeFinal}_pos`);
  const asigSnap = await asignacionDocRef.get();
  const revisionAsignacion = asigSnap.exists ? asigSnap.data()!.revision : 1;

  const asignacion = await establecerAsignacion(
    db,
    {
      commandId: `cmd_asig_${entrada.commandId}`,
      idempotencyKey: `idem_asig_${entrada.idempotencyKey}`,
      correlationId: entrada.correlationId,
      causationId: entrada.causationId,
      expectedRevision: revisionAsignacion,
      motivo: "ONBOARDING_ASIGNAR_NUMERACION",
      scope: scopeFinal,
      tipoDocumento: "pos",
      numeracionId: entrada.numeracionId,
    },
    contexto
  );

  return {
    numeracionRevision: habilitacion.revision,
    asignacionRevision: asignacion.revision,
    idempotente: actualizacion.idempotente && habilitacion.idempotente && asignacion.idempotente,
  };
}
