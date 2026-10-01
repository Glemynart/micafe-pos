import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { ConfiguracionEmpresa } from "../../../lib/configuracion/contrato";
import { evaluarReadinessConfiguracion, type ReadinessConfiguracion } from "../../../lib/configuracion/readiness";
import type { Suscripcion } from "../../../lib/suscripciones/contrato";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-query";
import { leerRelacionContractualVigente, proyectarSuscripcionDesdeRelacion } from "../suscripciones/relacion-vigente";

export type EstadoCredencialInicialProyectado = "SIN_PROVISIONAR" | "PENDIENTE_ACTIVACION" | "EXPIRADA" | "ACTIVA";
export type EstadoAccesoAdministradorInicial = "DISPONIBLE" | "ACTIVO" | "BLOQUEADO" | "CREDENCIAL_TEMPORAL_PENDIENTE" | "CREDENCIAL_EXPIRADA";

export interface DiagnosticoConfiguracionEmpresa {
  disponible: boolean;
  readiness: ReadinessConfiguracion | null;
  modulosHabilitados: string[];
}

export interface VersionPlanDiagnostica {
  planId: string;
  planVersion: number;
  codigo: string | null;
  estado: string | null;
}

function proyectarEstadoCredencial(data: FirebaseFirestore.DocumentData | undefined): EstadoCredencialInicialProyectado {
  if (!data) return "SIN_PROVISIONAR";
  if (data.estado === "ACTIVE") return "ACTIVA";
  if (data.estado === "EXPIRED") return "EXPIRADA";
  if (data.estado === "TEMP_CREDENTIAL") {
    const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
    return typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() <= Date.now()
      ? "EXPIRADA"
      : "PENDIENTE_ACTIVACION";
  }
  return "SIN_PROVISIONAR";
}

function proyectarDiagnosticoConfiguracion(
  data: FirebaseFirestore.DocumentData | undefined,
  empresaId: string,
  paisFiscalEmpresa: string | undefined,
): DiagnosticoConfiguracionEmpresa {
  if (!data) return { disponible: false, readiness: null, modulosHabilitados: [] };
  const modulosHabilitados = Array.isArray(data.modulos?.habilitados)
    ? data.modulos.habilitados.filter((modulo: unknown): modulo is string => typeof modulo === "string")
    : [];
  return {
    disponible: true,
    readiness: evaluarReadinessConfiguracion(data as ConfiguracionEmpresa, { empresaId, paisFiscalEmpresa }),
    modulosHabilitados,
  };
}

function proyectarEmpresaDetalle(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    nombre: typeof data.nombre === "string" ? data.nombre : null,
    nombreComercial: typeof data.nombreComercial === "string" ? data.nombreComercial : null,
    estado: typeof data.estado === "string" ? data.estado : null,
    paisFiscal: typeof data.paisFiscal === "string" ? data.paisFiscal : null,
    revision: Number.isInteger(data.revision) ? data.revision : null,
  };
}

function proyectarSuscripcionDetalle(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  return {
    empresaId: typeof data.empresaId === "string" ? data.empresaId : null,
    planId: typeof data.planId === "string" ? data.planId : null,
    planVersion: Number.isInteger(data.planVersion) ? data.planVersion : null,
    estado: typeof data.estado === "string" ? data.estado : null,
    trialInicio: typeof data.trialInicio === "string" ? data.trialInicio : null,
    trialFin: typeof data.trialFin === "string" ? data.trialFin : null,
    periodoInicio: typeof data.periodoInicio === "string" ? data.periodoInicio : null,
    periodoFin: typeof data.periodoFin === "string" ? data.periodoFin : null,
    graceFin: typeof data.graceFin === "string" ? data.graceFin : null,
    cancelacionProgramadaPara: typeof data.cancelacionProgramadaPara === "string" ? data.cancelacionProgramadaPara : null,
    snapshotContrato: data.snapshotContrato && typeof data.snapshotContrato === "object" ? data.snapshotContrato : null,
    ultimoPagoAnualId: typeof data.ultimoPagoAnualId === "string" ? data.ultimoPagoAnualId : null,
    revision: Number.isInteger(data.revision) ? data.revision : null,
  };
}

function proyectarProvisionamientoDetalle(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  return {
    provisionamientoId: typeof data.provisionamientoId === "string" ? data.provisionamientoId : null,
    estado: typeof data.estado === "string" ? data.estado : null,
    ultimoPasoConfirmado: typeof data.ultimoPasoConfirmado === "string" ? data.ultimoPasoConfirmado : null,
    requiereRecuperacion: typeof data.errorRecuperable === "string" && data.errorRecuperable.length > 0,
  };
}

function proyectarVersionPlan(data: FirebaseFirestore.DocumentData | undefined): VersionPlanDiagnostica | null {
  if (!data || typeof data.planId !== "string" || !Number.isInteger(data.planVersion)) return null;
  return {
    planId: data.planId,
    planVersion: data.planVersion,
    codigo: typeof data.codigo === "string" ? data.codigo : null,
    estado: typeof data.estado === "string" ? data.estado : null,
  };
}

/** Proyeccion read-only de tenant para el Backoffice, sin PIN ni pinHash. */
export async function obtenerDetalleEmpresaPlataforma(db: Firestore, empresaId: string) {
  const [empresaSnap, suscripcionSnap, configuracionSnap, provisionamientos] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
    db.collection("configuraciones").doc(empresaId).get(),
    db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).limit(1).get(),
  ]);
  if (!empresaSnap.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");
  const empresaData = empresaSnap.data()!;
  const ownerUid = typeof empresaData.ownerUid === "string" ? empresaData.ownerUid : null;
  const relacionVigente = await leerRelacionContractualVigente(db, empresaId);
  const suscripcionData = suscripcionSnap.data();
  const suscripcion = proyectarSuscripcionDetalle(
    suscripcionData && relacionVigente
      ? proyectarSuscripcionDesdeRelacion(suscripcionData as Suscripcion, relacionVigente)
      : suscripcionData,
  );
  const diagnosticoConfiguracion = proyectarDiagnosticoConfiguracion(
    configuracionSnap.data(), empresaId,
    typeof empresaData.paisFiscal === "string" ? empresaData.paisFiscal : undefined,
  );
  const planVersionSnap = suscripcion?.planId && suscripcion.planVersion !== null
    ? await db.collection("planes").doc(suscripcion.planId).collection("versiones").doc(String(suscripcion.planVersion)).get()
    : null;
  let adminInicial: { rol: string | null; estado: string | null; activo: boolean | null } | null = null;
  let credencialInicial = {
    estado: "SIN_PROVISIONAR" as EstadoCredencialInicialProyectado,
    incorporacionId: null as string | null,
    puedeReemitir: false,
    restablecimientoPendiente: false,
    puedeReemitirRestablecimiento: false,
  };
  if (ownerUid) {
    const [membresiaSnap, incorporacionesSnap, credencialesSnap] = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get(),
      consultarIncorporacionDirectaMasReciente(db, empresaId, ownerUid).get(),
      db.collection("credenciales_operativas").where("empresaId", "==", empresaId).where("uid", "==", ownerUid).limit(3).get(),
    ]);
    const membresiaData = membresiaSnap.data();
    adminInicial = {
      rol: typeof membresiaData?.rol === "string" ? membresiaData.rol : null,
      estado: typeof membresiaData?.estado === "string" ? membresiaData.estado : null,
      activo: typeof membresiaData?.activo === "boolean" ? membresiaData.activo : null,
    };
    const incorporacionData = incorporacionesSnap.empty ? undefined : incorporacionesSnap.docs[0].data();
    const estado = proyectarEstadoCredencial(incorporacionData);
    const expiraEn = incorporacionData?.expiraEn as { toMillis?: () => number } | undefined;
    const puedeReemitir = estado === "PENDIENTE_ACTIVACION" && incorporacionData?.origen === "PLATAFORMA"
      && typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() > Date.now();
    const credencialActiva = credencialesSnap.docs.filter((doc) => doc.get("activo") === true);
    const activa = credencialActiva.length === 1 ? credencialActiva[0] : null;
    const restablecimientoPendiente = activa?.get("requiereCambio") === true
      && typeof activa.get("restablecimientoId") === "string" && activa.get("restablecimientoId").trim().length > 0;
    credencialInicial = {
      estado,
      incorporacionId: incorporacionesSnap.empty ? null : incorporacionesSnap.docs[0].id,
      puedeReemitir,
      restablecimientoPendiente,
      puedeReemitirRestablecimiento: restablecimientoPendiente,
    };
  }
  let estadoAccesoInicial: EstadoAccesoAdministradorInicial = credencialInicial.restablecimientoPendiente
    ? "CREDENCIAL_TEMPORAL_PENDIENTE" : credencialInicial.estado === "EXPIRADA"
      ? "CREDENCIAL_EXPIRADA" : credencialInicial.estado === "PENDIENTE_ACTIVACION"
        ? "CREDENCIAL_TEMPORAL_PENDIENTE" : credencialInicial.estado === "ACTIVA" ? "ACTIVO" : "DISPONIBLE";
  if (ownerUid && credencialInicial.incorporacionId) {
    const incorporacion = await db.collection("incorporaciones").doc(credencialInicial.incorporacionId).get();
    const codigo = incorporacion.data()?.codigo;
    if (typeof codigo === "string") {
      const credencial = await db.collection("credenciales_operativas").doc(`${empresaId}_${codigo}`).get();
      const bloqueadoHasta = credencial.data()?.bloqueadoHasta as { toMillis?: () => number } | undefined;
      if (typeof bloqueadoHasta?.toMillis === "function" && bloqueadoHasta.toMillis() > Date.now()) estadoAccesoInicial = "BLOQUEADO";
    }
  }
  return {
    empresa: proyectarEmpresaDetalle(empresaSnap.id, empresaData),
    suscripcion,
    versionPlan: planVersionSnap?.exists ? proyectarVersionPlan(planVersionSnap.data()) : null,
    diagnosticoConfiguracion,
    provisionamiento: provisionamientos.empty ? null : proyectarProvisionamientoDetalle(provisionamientos.docs[0].data()),
    adminInicial,
    credencialInicial,
    estadoAccesoInicial,
  };
}
