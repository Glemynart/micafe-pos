import { Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  evaluarReadinessConfiguracion,
  type ConfiguracionEmpresa,
  type ReadinessConfiguracion,
} from "../../../lib/configuracion";
import { fechaComercialUtc, type Suscripcion } from "../../../lib/suscripciones/contrato";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-service";
import { obtenerEstadoOnboardingTenant } from "../onboarding/service";
import { leerRelacionContractualVigente, proyectarSuscripcionDesdeRelacion } from "../suscripciones/relacion-vigente";

// ADR-SAAS-012 §3.1: familias Seguridad y Soporte B4. Consultarlas por `tipo` sin acotar
// a una Empresa o actor específico exige la ventana temporal obligatoria de §7.
const TIPOS_SEGURIDAD_O_SOPORTE = new Set([
  "AUTORIZACION_DENEGADA", "FACULTAD_AUSENTE", "OPERADOR_INACTIVO", "AUTOESCALAMIENTO_DENEGADO",
  "ALCANCE_DENEGADO", "CONTEXTO_PLATAFORMA_OBSOLETO", "CONFLICTO_IDEMPOTENCIA", "CONFLICTO_REVISION",
  "SOPORTE_SOLICITADO", "SOPORTE_RECHAZADO", "SOPORTE_AUTORIZADO", "SOPORTE_REVOCADO", "SOPORTE_EXPIRADO",
  "SOPORTE_INICIADO", "SOPORTE_FINALIZADO", "SOPORTE_ALCANCE_RECHAZADO",
  "SOPORTE_ACCESO_FUERA_DE_ALCANCE_DENEGADO", "SOPORTE_DIAGNOSTICO_ALTO_RIESGO",
  "CREDENCIAL_RESTABLECIMIENTO_SOLICITADO", "CREDENCIAL_RESTABLECIMIENTO_ACTIVADO", "CREDENCIAL_RESTABLECIMIENTO_CANCELADO",
]);

// ADR-SAAS-012 §7: límite máximo por patrón de consulta.
const LIMITE_MAXIMO_POR_FILTRO: Record<FiltroAuditoria["por"], number> = {
  comando: 20,
  agregado: 100,
  empresa: 100,
  actor: 100,
  tipo: 100,
  correlacion: 100,
};

export type RecursoPlataforma =
  | "empresas"
  | "planes"
  | "suscripciones"
  | "operadores"
  | "soporte"
  | "provisionamientos";

const COLECCIONES: Record<RecursoPlataforma, string> = {
  empresas: "empresas",
  planes: "planes",
  suscripciones: "suscripciones",
  operadores: "saas_operadores",
  soporte: "saas_soporte_autorizaciones",
  provisionamientos: "provisionamientos_empresariales",
};

// El campo de ordenación se declara por recurso porque el modelo de datos no usa
// un nombre único: los agregados femeninos (Empresa, Suscripción, Plan,
// autorización de soporte) persisten `creadaEn`/`actualizadaEn` y los masculinos
// (Operador, provisionamiento) `creadoEn`/`actualizadoEn`. Un `orderBy` sobre un
// campo que el documento no tiene no falla: Firestore excluye esos documentos y
// la consulta devuelve cero resultados en silencio, así que el nombre debe
// declararse junto a la colección y no derivarse de una condición.
const CAMPO_ORDEN: Record<RecursoPlataforma, string> = {
  empresas: "actualizadaEn",
  planes: "creadaEn",
  suscripciones: "creadaEn",
  operadores: "actualizadoEn",
  soporte: "actualizadaEn",
  provisionamientos: "actualizadoEn",
};

function sanitizar(data: Record<string, any>) {
  const permitido = [
    "id", "empresaId", "nombre", "nombreComercial", "estado", "paisFiscal",
    "ownerUid", "revision", "planId", "planVersion", "trialInicio", "trialFin",
    "periodoInicio", "periodoFin", "graceFin", "uid", "facultades",
    "cancelacionProgramadaPara", "capacidades", "limites", "periodicidad", "precio", "grandfathered",
    "snapshotContrato", "ultimoPagoAnualId",
    "versionAutorizacion", "actualizadoEn", "creadoEn", "actualizadaEn", "creadaEn",
    "tipo", "resultado",
    "origen", "actor", "facultad", "comando", "agregado", "empresaObjetivoId",
    "correlacionId", "motivo", "registradoEn", "autorizacionId", "operadorUid",
    "solicitante", "alcanceCodigo", "expiraEn", "version", "provisionamientoId",
    "ultimoPasoConfirmado", "errorRecuperable", "codigo", "versionActual",
  ];
  return Object.fromEntries(permitido.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

export async function listarRecursosPlataforma(
  db: Firestore,
  recurso: RecursoPlataforma,
  opciones: { limite?: number; estado?: string; empresaId?: string; operadorUid?: string; cursor?: string } = {},
) {
  if (!(recurso in COLECCIONES)) throw new HttpsError("invalid-argument", "RECURSO_INVALIDO");
  const limite = Math.min(Math.max(Number(opciones.limite) || 25, 1), 100);
  let q: Query = db.collection(COLECCIONES[recurso]);
  if (opciones.estado) q = q.where("estado", "==", opciones.estado);
  if (opciones.empresaId && ["suscripciones", "soporte", "provisionamientos"].includes(recurso)) {
    const campo = recurso === "soporte" ? "empresaObjetivoId" : "empresaId";
    q = q.where(campo, "==", opciones.empresaId);
  }
  if (recurso === "soporte" && opciones.operadorUid) {
    q = q.where("operadorUid", "==", opciones.operadorUid);
  }
  q = q.orderBy(CAMPO_ORDEN[recurso], "desc").limit(limite);
  if (opciones.cursor) {
    const cursor = await db.collection(COLECCIONES[recurso]).doc(opciones.cursor).get();
    if (!cursor.exists) throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
    q = q.startAfter(cursor);
  }
  const snap = await q.get();
  const items = recurso === "planes"
    ? await Promise.all(snap.docs.map(async (doc) => {
        const root = doc.data();
        const versionActual = root.versionActual;
        const version = Number.isInteger(versionActual)
          ? await db.collection("planes").doc(doc.id).collection("versiones").doc(String(versionActual)).get()
          : null;
        return { id: doc.id, ...sanitizar(root), ...(version?.exists ? sanitizar(version.data()!) : {}) };
      }))
    : snap.docs.map((doc) => ({ id: doc.id, ...sanitizar(doc.data()) }));
  return {
    items,
    cursor: snap.docs.length === limite ? snap.docs.at(-1)!.id : null,
  };
}

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

export const TIPOS_ALERTA_OPERADOR = [
  "BOOTSTRAP_RECUPERABLE",
  "ADMINISTRADOR_PENDIENTE_ACTIVAR",
  "CREDENCIAL_TEMPORAL_EXPIRADA",
  "EMPRESA_SIN_SUSCRIPCION",
  "TRIAL_PROXIMO_VENCER",
  "ONBOARDING_DETENIDO",
  "READINESS_OPERATIVO_INCOMPLETO",
  "EMPRESA_SUSPENDIDA",
  "INCONSISTENCIA_CANONICA",
] as const;

export type TipoAlertaOperador = (typeof TIPOS_ALERTA_OPERADOR)[number];
export interface AlertaOperador {
  tipo: TipoAlertaOperador;
  empresaId: string;
  empresaNombre: string;
  severidad: "CRITICA" | "ADVERTENCIA";
}
export interface FuenteResumenDegradada {
  empresaId: string;
  fuente: "DETALLE_EMPRESA" | "ONBOARDING";
}
export interface ResumenOperadorSaas {
  empresasTotal: number;
  alertas: AlertaOperador[];
  fuentesDegradadas: FuenteResumenDegradada[];
}

const DIAS_ALERTA_TRIAL = 3;

/**
 * ADR-SAAS-013 §5.3 — proyección derivada para la ficha de empresa del
 * Backoffice, SIN campo nuevo: se lee de `incorporaciones` (nunca de
 * `credenciales_operativas`, que es la única colección con `pinHash` — así
 * es estructuralmente imposible que esta consulta lo exponga).
 */
function proyectarEstadoCredencial(data: FirebaseFirestore.DocumentData | undefined): EstadoCredencialInicialProyectado {
  if (!data) return "SIN_PROVISIONAR";
  if (data.estado === "ACTIVE") return "ACTIVA";
  if (data.estado === "EXPIRED") return "EXPIRADA";
  if (data.estado === "TEMP_CREDENTIAL") {
    const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
    const vencida = typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() <= Date.now();
    return vencida ? "EXPIRADA" : "PENDIENTE_ACTIVACION";
  }
  return "SIN_PROVISIONAR";
}

/**
 * La ficha SaaS recibe un diagnóstico B1, no el documento de configuración.
 * Esto mantiene fuera de la proyección datos fiscales, contactos, branding y
 * parámetros operativos que el operador no necesita para decidir una acción.
 */
function proyectarDiagnosticoConfiguracion(
  data: FirebaseFirestore.DocumentData | undefined,
  empresaId: string,
  paisFiscalEmpresa: string | undefined,
): DiagnosticoConfiguracionEmpresa {
  if (!data) {
    return { disponible: false, readiness: null, modulosHabilitados: [] };
  }
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
  const suscripcionData = suscripcionSnap.data();
  const relacionVigente = await leerRelacionContractualVigente(db, empresaId);
  const suscripcionOperativa = suscripcionData && relacionVigente
    ? proyectarSuscripcionDesdeRelacion(suscripcionData as Suscripcion, relacionVigente)
    : suscripcionData;
  const suscripcion = proyectarSuscripcionDetalle(suscripcionOperativa);
  const diagnosticoConfiguracion = proyectarDiagnosticoConfiguracion(
    configuracionSnap.data(),
    empresaId,
    typeof empresaData.paisFiscal === "string" ? empresaData.paisFiscal : undefined,
  );

  const planVersionSnap = suscripcion?.planId && suscripcion.planVersion !== null
    ? await db.collection("planes").doc(suscripcion.planId).collection("versiones").doc(String(suscripcion.planVersion)).get()
    : null;

  let adminInicial: { rol: string | null; estado: string | null; activo: boolean | null } | null = null;
  let credencialInicial: {
    estado: EstadoCredencialInicialProyectado;
    incorporacionId: string | null;
    puedeReemitir: boolean;
    restablecimientoPendiente: boolean;
    puedeReemitirRestablecimiento: boolean;
  } = {
    estado: "SIN_PROVISIONAR", incorporacionId: null, puedeReemitir: false,
    restablecimientoPendiente: false, puedeReemitirRestablecimiento: false,
  };

  if (ownerUid) {
    const [membresiaSnap, incorporacionesSnap, credencialesSnap] = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get(),
      // Misma consulta compartida que gobierna emisión/reemisión — así la
      // ficha nunca muestra una credencial superada por una reemisión.
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
    const puedeReemitir = estado === "PENDIENTE_ACTIVACION"
      && incorporacionData?.origen === "PLATAFORMA"
      && typeof expiraEn?.toMillis === "function"
      && expiraEn.toMillis() > Date.now();
    const credencialesActivas = credencialesSnap.docs.filter((doc) => doc.get("activo") === true);
    const credencialActiva = credencialesActivas.length === 1 ? credencialesActivas[0] : null;
    const restablecimientoPendiente = credencialActiva?.get("requiereCambio") === true
      && typeof credencialActiva.get("restablecimientoId") === "string"
      && credencialActiva.get("restablecimientoId").trim().length > 0;
    credencialInicial = {
      estado,
      incorporacionId: incorporacionesSnap.empty ? null : incorporacionesSnap.docs[0].id,
      puedeReemitir,
      restablecimientoPendiente,
      puedeReemitirRestablecimiento: restablecimientoPendiente,
    };
  }
  let estadoAccesoInicial: EstadoAccesoAdministradorInicial = credencialInicial.restablecimientoPendiente
    ? "CREDENCIAL_TEMPORAL_PENDIENTE"
    : credencialInicial.estado === "EXPIRADA"
    ? "CREDENCIAL_EXPIRADA"
    : credencialInicial.estado === "PENDIENTE_ACTIVACION"
      ? "CREDENCIAL_TEMPORAL_PENDIENTE"
      : credencialInicial.estado === "ACTIVA" ? "ACTIVO" : "DISPONIBLE";
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

type DetalleEmpresaPlataforma = Awaited<ReturnType<typeof obtenerDetalleEmpresaPlataforma>>;
type EstadoOnboardingPlataforma = Awaited<ReturnType<typeof obtenerEstadoOnboardingTenant>>;

interface DependenciasResumenOperador {
  ahoraMs?: () => number;
  obtenerDetalle?: (db: Firestore, empresaId: string) => Promise<DetalleEmpresaPlataforma>;
  obtenerOnboarding?: (db: Firestore, empresaId: string, paisFiscal: string) => Promise<EstadoOnboardingPlataforma>;
}

/**
 * Proyección read-only del estado operativo SaaS. Cada alerta se recalcula de
 * los agregados canónicos; no se materializa ni reemplaza ninguna autoridad.
 */
export async function obtenerResumenOperadorSaas(
  db: Firestore,
  dependencias: DependenciasResumenOperador = {},
): Promise<ResumenOperadorSaas> {
  const empresasSnap = await db.collection("empresas").get();
  const obtenerDetalle = dependencias.obtenerDetalle ?? obtenerDetalleEmpresaPlataforma;
  const obtenerOnboarding = dependencias.obtenerOnboarding ?? obtenerEstadoOnboardingTenant;
  const ahora = dependencias.ahoraMs?.() ?? Date.now();
  const hoy = fechaComercialUtc(new Date(ahora));
  const limiteTrial = fechaComercialUtc(new Date(ahora + DIAS_ALERTA_TRIAL * 86_400_000));
  const alertas: AlertaOperador[] = [];
  const fuentesDegradadas: FuenteResumenDegradada[] = [];

  await Promise.all(empresasSnap.docs.map(async (empresaSnap) => {
    const empresa = empresaSnap.data();
    const empresaId = empresaSnap.id;
    const empresaNombre = typeof empresa.nombre === "string"
      ? empresa.nombre
      : typeof empresa.nombreComercial === "string" ? empresa.nombreComercial : empresaId;
    const tipos = new Set<TipoAlertaOperador>();
    const agregar = (tipo: TipoAlertaOperador) => tipos.add(tipo);

    if (empresa.estado === "suspendida") agregar("EMPRESA_SUSPENDIDA");

    const [detalleResultado, onboardingResultado] = await Promise.allSettled([
      obtenerDetalle(db, empresaId),
      obtenerOnboarding(db, empresaId, typeof empresa.paisFiscal === "string" ? empresa.paisFiscal : "CO"),
    ]);

    if (detalleResultado.status === "fulfilled") {
      const detalle = detalleResultado.value;
      const provisionamiento = detalle.provisionamiento;
      if (provisionamiento?.estado === "RETRYABLE_FAILURE" || provisionamiento?.estado === "REJECTED") {
        agregar("BOOTSTRAP_RECUPERABLE");
      }
      if (detalle.credencialInicial.estado === "PENDIENTE_ACTIVACION") agregar("ADMINISTRADOR_PENDIENTE_ACTIVAR");
      if (detalle.credencialInicial.estado === "EXPIRADA") agregar("CREDENCIAL_TEMPORAL_EXPIRADA");
      if (!detalle.suscripcion) {
        agregar("EMPRESA_SIN_SUSCRIPCION");
      } else {
        if (
          detalle.suscripcion.estado === "trialing"
          && typeof detalle.suscripcion.trialFin === "string"
          && detalle.suscripcion.trialFin >= hoy
          && detalle.suscripcion.trialFin <= limiteTrial
        ) {
          agregar("TRIAL_PROXIMO_VENCER");
        }
        if (detalle.suscripcion.empresaId !== empresaId || !detalle.versionPlan) agregar("INCONSISTENCIA_CANONICA");
      }
      if (!detalle.diagnosticoConfiguracion.readiness?.operativa.lista) agregar("READINESS_OPERATIVO_INCOMPLETO");
      if (
        !detalle.diagnosticoConfiguracion.disponible
        || !detalle.adminInicial
        || detalle.adminInicial.rol !== "admin"
        || detalle.adminInicial.estado !== "activa"
        || detalle.adminInicial.activo !== true
      ) {
        agregar("INCONSISTENCIA_CANONICA");
      }
    } else {
      fuentesDegradadas.push({ empresaId, fuente: "DETALLE_EMPRESA" });
    }

    if (onboardingResultado.status === "fulfilled") {
      const onboarding = onboardingResultado.value;
      const demoOperativo = onboarding.ventaDemostracion?.disponible === true
        && onboarding.readinessTotal.detalles?.configuracion?.operativa?.lista === true;
      if (!onboarding.readinessTotal.listo && !demoOperativo) agregar("ONBOARDING_DETENIDO");
    } else {
      fuentesDegradadas.push({ empresaId, fuente: "ONBOARDING" });
    }

    for (const tipo of tipos) {
      alertas.push({
        tipo,
        empresaId,
        empresaNombre,
        severidad: tipo === "BOOTSTRAP_RECUPERABLE" || tipo === "INCONSISTENCIA_CANONICA" ? "CRITICA" : "ADVERTENCIA",
      });
    }
  }));

  alertas.sort((a, b) => a.empresaNombre.localeCompare(b.empresaNombre) || a.tipo.localeCompare(b.tipo));
  fuentesDegradadas.sort((a, b) => a.empresaId.localeCompare(b.empresaId) || a.fuente.localeCompare(b.fuente));
  return { empresasTotal: empresasSnap.size, alertas, fuentesDegradadas };
}

export type FiltroAuditoria =
  | { por: "comando"; valor: string }
  | { por: "agregado"; tipoAgregado: string; valor: string }
  | { por: "empresa"; valor: string; tipo: string }
  | { por: "actor"; valor: string; tipo: string }
  | { por: "tipo"; valor: string; ventana?: { desde: number; hasta: number } }
  | { por: "correlacion"; valor: string };

function textoFiltro(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ventanaValida(value: unknown): value is { desde: number; hasta: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Number.isFinite(v.desde) && Number.isFinite(v.hasta) && (v.desde as number) < (v.hasta as number);
}

export function validarFiltroAuditoria(value: unknown): FiltroAuditoria {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  }
  const filtro = value as Record<string, unknown>;
  if (!textoFiltro(filtro.valor)) throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  if (filtro.por === "comando" || filtro.por === "correlacion") {
    return { por: filtro.por, valor: filtro.valor };
  }
  if (filtro.por === "tipo") {
    // ADR-SAAS-012 §7: consultar globalmente por un tipo de Seguridad/Soporte exige
    // ventana temporal obligatoria; los demás tipos conservan el comportamiento previo.
    if (TIPOS_SEGURIDAD_O_SOPORTE.has(filtro.valor)) {
      if (!ventanaValida(filtro.ventana)) {
        throw new HttpsError("invalid-argument", "VENTANA_TEMPORAL_REQUERIDA");
      }
      return { por: "tipo", valor: filtro.valor, ventana: filtro.ventana };
    }
    return { por: "tipo", valor: filtro.valor };
  }
  if (filtro.por === "agregado" && textoFiltro(filtro.tipoAgregado)) {
    return { por: "agregado", tipoAgregado: filtro.tipoAgregado, valor: filtro.valor };
  }
  if ((filtro.por === "empresa" || filtro.por === "actor") && textoFiltro(filtro.tipo)) {
    return { por: filtro.por, tipo: filtro.tipo, valor: filtro.valor };
  }
  throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
}

export async function consultarAuditoriaPlataforma(
  db: Firestore,
  filtro: FiltroAuditoria,
  limiteSolicitado = 50,
  cursorId?: string,
) {
  const tope = LIMITE_MAXIMO_POR_FILTRO[filtro.por];
  const limite = Math.min(Math.max(Number(limiteSolicitado) || tope, 1), tope);
  let q: Query = db.collection("saas_auditoria");
  if (filtro.por === "comando") q = q.where("comando.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "agregado") q = q.where("agregado.tipo", "==", filtro.tipoAgregado).where("agregado.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "empresa") q = q.where("empresaObjetivoId", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "actor") q = q.where("actor.uid", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "tipo") {
    q = q.where("tipo", "==", filtro.valor);
    if (filtro.ventana) {
      q = q.where("registradoEn", ">=", Timestamp.fromMillis(filtro.ventana.desde))
        .where("registradoEn", "<=", Timestamp.fromMillis(filtro.ventana.hasta));
    }
    q = q.orderBy("registradoEn", "desc");
  } else q = q.where("correlacionId", "==", filtro.valor).orderBy("registradoEn", "asc");
  if (cursorId) {
    const cursor = await db.collection("saas_auditoria").doc(cursorId).get();
    if (!cursor.exists) throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
    q = q.startAfter(cursor);
  }
  const snap = await q.limit(limite).get();
  return {
    items: snap.docs.map((doc) => ({ id: doc.id, ...sanitizar(doc.data()) })),
    cursor: snap.docs.length === limite ? snap.docs.at(-1)!.id : null,
  };
}
