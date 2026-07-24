import { createHash } from "node:crypto";
import { FieldValue, getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  aplicarOperacionesConfiguracion,
  crearPlantillaConfiguracionRevision1,
  validarConfiguracionEmpresa,
  type ConfiguracionEmpresa,
  type OperacionConfiguracion,
  type RutaHojaEditableConfiguracion,
} from "../../../lib/configuracion";

export const CONFIGURACIONES_COLLECTION = "configuraciones";
const COMANDOS = ["ActualizarConfiguracionEmpresa", "ActualizarParametrosFiscales", "ActualizarPreferenciasImpresion", "ActualizarPoliticasOperativas"] as const;
type Comando = (typeof COMANDOS)[number];
export interface EntradaComandoConfiguracion { comando: Comando; expectedRevision: number; idempotencyKey: string; commandId: string; correlationId: string; motivo?: string; operaciones: OperacionConfiguracion[] }
export interface ContextoComandoConfiguracion { empresaId: string; actorId: string; origen: "ADMIN" | "RECOVERY"; paisFiscal: string; modulosPermitidos?: readonly string[]; metodosPagoPermitidos?: readonly string[] }
export interface ResultadoComandoConfiguracion { revision: number; idempotente: boolean; noOp: boolean }

const PREFIJOS: Record<Comando, readonly string[]> = {
  ActualizarConfiguracionEmpresa: ["identidadFiscal.", "localizacion.", "impuestos.", "branding.", "ticket.", "preferencias."],
  ActualizarParametrosFiscales: ["identidadFiscal.", "localizacion.", "impuestos."],
  ActualizarPreferenciasImpresion: ["impresion."],
  ActualizarPoliticasOperativas: ["pos.", "caja.", "modulos.", "kds."],
};
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (prefijo: string, empresaId: string, clave: string) => `${prefijo}_${empresaId}_${hash(clave)}`;
function fallo(code: "failed-precondition" | "already-exists" | "invalid-argument", mensaje: string): never { throw new HttpsError(code, mensaje); }
export function rutasPermitidas(entrada: EntradaComandoConfiguracion): RutaHojaEditableConfiguracion[] {
  if (!Array.isArray(entrada.operaciones) || entrada.operaciones.length === 0) fallo("invalid-argument", "Operaciones inválidas.");
  const prefijos = PREFIJOS[entrada.comando];
  if (!prefijos || entrada.operaciones.some((o) => !prefijos.some((p) => o.ruta.startsWith(p)))) fallo("invalid-argument", "Ruta no permitida para el comando.");
  if (entrada.comando === "ActualizarParametrosFiscales" && (!entrada.motivo || entrada.motivo.trim().length === 0)) fallo("invalid-argument", "El motivo fiscal es obligatorio.");
  return entrada.operaciones.map((o) => o.ruta);
}
function modificaIdentidadFiscal(entrada: EntradaComandoConfiguracion): boolean { return entrada.operaciones.some((operacion) => operacion.ruta.startsWith("identidadFiscal.")); }
function requiereCapacidadesPlan(entrada: EntradaComandoConfiguracion): boolean { return entrada.operaciones.some((operacion) => operacion.ruta === "modulos.habilitados" || operacion.ruta === "pos.metodosPagoHabilitados"); }
export function prepararInicializacionConfiguracion(entrada: EntradaInicializacionConfiguracion): ConfiguracionEmpresa {
  if (!entrada.empresaId || !entrada.nombreComercial || !entrada.commandId || !entrada.correlationId || (entrada.origen !== "BOOTSTRAP" && entrada.origen !== "BACKFILL")) fallo("invalid-argument", "Contexto de inicialización inválido.");
  return crearPlantillaConfiguracionRevision1({ empresaId: entrada.empresaId, nombreComercial: entrada.nombreComercial, creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(), ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: entrada.origen, commandId: entrada.commandId, correlationId: entrada.correlationId } });
}
function documentoEmpresaValido(data: FirebaseFirestore.DocumentData | undefined, empresaId: string, pais: string): void {
  if (!data || data.estado === undefined || data.paisFiscal !== pais || data.id === "") fallo("failed-precondition", "Empresa o país incompatibles.");
  if (data.estado !== "trial" && data.estado !== "activa") fallo("failed-precondition", "Lifecycle no escribible.");
  if (data.empresaId !== undefined && data.empresaId !== empresaId) fallo("failed-precondition", "Tenant inconsistente.");
}

/** Única orquestación Admin SDK: dominio puro + commit de configuración, auditoría y evento. */
export async function ejecutarComandoConfiguracion(db: Firestore, entrada: EntradaComandoConfiguracion, contexto: ContextoComandoConfiguracion): Promise<ResultadoComandoConfiguracion> {
  if (!COMANDOS.includes(entrada.comando) || !Number.isInteger(entrada.expectedRevision) || entrada.expectedRevision < 1 || !entrada.idempotencyKey || !entrada.commandId || !entrada.correlationId) fallo("invalid-argument", "Envelope de comando inválido.");
  const permitidas = rutasPermitidas(entrada); const fingerprint = hash({ comando: entrada.comando, expectedRevision: entrada.expectedRevision, operaciones: entrada.operaciones, motivo: entrada.motivo });
  if (requiereCapacidadesPlan(entrada) && (!contexto.modulosPermitidos || !contexto.metodosPagoPermitidos)) fallo("failed-precondition", "PLAN_CAPABILITY_UNAVAILABLE");
  const configRef = db.collection(CONFIGURACIONES_COLLECTION).doc(contexto.empresaId); const empresaRef = db.collection("empresas").doc(contexto.empresaId); const comandoRef = db.collection("configuracion_comandos").doc(id("cfgcmd", contexto.empresaId, entrada.idempotencyKey)); const commandIdRef = db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(entrada.commandId)}`);
  const emisionesRef = db.collection("ventas").where("empresaId", "==", contexto.empresaId).where("dian.emitidoEn", "!=", null).limit(1);
  return db.runTransaction(async (tx) => {
    const [empresaSnap, configSnap, previoSnap, commandIdSnap, emisionesSnap] = await Promise.all([tx.get(empresaRef), tx.get(configRef), tx.get(comandoRef), tx.get(commandIdRef), modificaIdentidadFiscal(entrada) ? tx.get(emisionesRef) : Promise.resolve(undefined)]);
    documentoEmpresaValido(empresaSnap.data(), contexto.empresaId, contexto.paisFiscal);
    if (commandIdSnap.exists) { const previo = commandIdSnap.data()!; if (previo.empresaId !== contexto.empresaId || previo.idempotencyKey !== entrada.idempotencyKey || previo.fingerprint !== fingerprint) fallo("already-exists", "COMMAND_ID_CONFLICT"); return { ...(previo.resultado as ResultadoComandoConfiguracion), idempotente: true }; }
    if (previoSnap.exists) { const previo = previoSnap.data()!; if (previo.commandId !== entrada.commandId || previo.fingerprint !== fingerprint) fallo("already-exists", "IDEMPOTENCY_CONFLICT"); return { ...(previo.resultado as ResultadoComandoConfiguracion), idempotente: true }; }
    if (!configSnap.exists) fallo("failed-precondition", "Configuración inexistente.");
    if (emisionesSnap && !emisionesSnap.empty) fallo("failed-precondition", "IDENTIDAD_FISCAL_BLOQUEADA_POR_EMISION");
    const actual = configSnap.data() as ConfiguracionEmpresa;
    if (actual.revision !== entrada.expectedRevision) fallo("failed-precondition", "CONFIG_REVISION_CONFLICT");
    const contextoValidacion = { empresaId: contexto.empresaId, paisFiscalEmpresa: contexto.paisFiscal, modulosPermitidos: contexto.modulosPermitidos, metodosPagoPermitidos: contexto.metodosPagoPermitidos };
    const aplicado = aplicarOperacionesConfiguracion(actual, entrada.operaciones, permitidas, contextoValidacion);
    const resultado: ResultadoComandoConfiguracion = aplicado.tipo === "NO_OP" ? { revision: actual.revision, idempotente: false, noOp: true } : { revision: actual.revision + 1, idempotente: false, noOp: false };
    if (resultado.noOp) return resultado;
    const siguiente = { ...aplicado.configuracion, revision: resultado.revision, actualizadaEn: FieldValue.serverTimestamp(), ultimaMutacion: { actorTipo: "USER" as const, actorId: contexto.actorId, origen: contexto.origen, commandId: entrada.commandId, correlationId: entrada.correlationId, ...(entrada.motivo ? { motivo: entrada.motivo } : {}) } };
    if (!validarConfiguracionEmpresa(siguiente, contextoValidacion).valida) fallo("failed-precondition", "Configuración resultante inválida.");
    tx.set(configRef, siguiente);
    tx.create(comandoRef, { empresaId: contexto.empresaId, idempotencyKey: entrada.idempotencyKey, fingerprint, resultado, commandId: entrada.commandId, creadoEn: FieldValue.serverTimestamp() });
    tx.create(commandIdRef, { empresaId: contexto.empresaId, idempotencyKey: entrada.idempotencyKey, fingerprint, resultado, commandId: entrada.commandId, creadoEn: FieldValue.serverTimestamp() });
    const auditId = id("cfgaudit", contexto.empresaId, entrada.commandId); const eventId = id("cfgevent", contexto.empresaId, entrada.commandId); const rutas = entrada.operaciones.map((operacion) => operacion.ruta); const seccionesAfectadas = [...new Set(rutas.map((ruta) => ruta.split(".")[0]))];
    tx.create(db.collection("auditoria_logs").doc(auditId), { empresaId: contexto.empresaId, agregado: "CONFIGURACION", revisionAnterior: actual.revision, revisionNueva: resultado.revision, comando: entrada.comando, commandId: entrada.commandId, idempotencyKey: entrada.idempotencyKey, correlationId: entrada.correlationId, actorId: contexto.actorId, actorTipo: "USER", origen: contexto.origen, motivo: entrada.motivo ?? null, rutas, seccionesAfectadas, impactoFiscal: modificaIdentidadFiscal(entrada), creadoEn: FieldValue.serverTimestamp() });
    tx.create(db.collection("eventos_dominio").doc(eventId), { eventId, tipo: "ConfiguracionEmpresaActualizada", version: 1, agregado: "CONFIGURACION", empresaId: contexto.empresaId, revisionAnterior: actual.revision, revisionNueva: resultado.revision, actorId: contexto.actorId, actorTipo: "USER", origen: contexto.origen, correlationId: entrada.correlationId, commandId: entrada.commandId, idempotencyKey: entrada.idempotencyKey, motivo: entrada.motivo ?? null, rutas, seccionesAfectadas, impactoFiscal: modificaIdentidadFiscal(entrada), creadoEn: FieldValue.serverTimestamp() });
    return resultado;
  });
}

export interface EntradaInicializacionConfiguracion { empresaId: string; nombreComercial: string; paisFiscal: string; commandId: string; correlationId: string; origen: "BOOTSTRAP" | "BACKFILL" }
/** Operación interna, componible en la transacción de Bootstrap; no es callable. */
function inicializarConfiguracionConEstadoPreleidoEnTransaccion(
  db: Firestore,
  tx: Transaction,
  entrada: EntradaInicializacionConfiguracion,
  empresa: FirebaseFirestore.DocumentData | undefined,
  existente: FirebaseFirestore.DocumentSnapshot,
): { idempotente: boolean; configuracion: ConfiguracionEmpresa } {
  const configRef = db.collection(CONFIGURACIONES_COLLECTION).doc(entrada.empresaId);
  documentoEmpresaValido(empresa, entrada.empresaId, entrada.paisFiscal);
  const plantilla = prepararInicializacionConfiguracion(entrada);
  if (existente.exists) { const actual = existente.data() as ConfiguracionEmpresa; if (actual.empresaId === plantilla.empresaId && actual.schemaVersion === 1 && actual.revision === 1 && actual.localizacion.paisFiscal === entrada.paisFiscal && validarConfiguracionEmpresa(actual, { empresaId: entrada.empresaId, paisFiscalEmpresa: entrada.paisFiscal }).valida) return { idempotente: true, configuracion: actual }; fallo("already-exists", "Inicialización incompatible."); }
  if (!validarConfiguracionEmpresa(plantilla, { empresaId: entrada.empresaId, paisFiscalEmpresa: entrada.paisFiscal }).valida) fallo("failed-precondition", "Plantilla inválida.");
  tx.create(configRef, plantilla); const eventId = id("cfgevent", entrada.empresaId, entrada.commandId);
  const seccionesAfectadas = ["identidadFiscal", "localizacion", "impuestos", "branding", "ticket", "impresion", "pos", "caja", "modulos", "kds", "autenticacionOperativa", "preferencias"];
  tx.create(db.collection("auditoria_logs").doc(id("cfgaudit", entrada.empresaId, entrada.commandId)), { empresaId: entrada.empresaId, agregado: "CONFIGURACION", revisionAnterior: 0, revisionNueva: 1, comando: "InicializarConfiguracionEmpresa", commandId: entrada.commandId, correlationId: entrada.correlationId, actorTipo: "SYSTEM", actorId: "system", origen: entrada.origen, schemaVersion: 1, seccionesAfectadas, creadoEn: FieldValue.serverTimestamp() });
  tx.create(db.collection("eventos_dominio").doc(eventId), { eventId, tipo: "ConfiguracionEmpresaInicializada", version: 1, agregado: "CONFIGURACION", empresaId: entrada.empresaId, revisionAnterior: 0, revisionNueva: 1, schemaVersion: 1, origen: entrada.origen, commandId: entrada.commandId, correlationId: entrada.correlationId, seccionesAfectadas, creadoEn: FieldValue.serverTimestamp() });
  return { idempotente: false, configuracion: plantilla };
}

/**
 * Inicializa la configuración dentro de una transacción que ya leyó Empresa y
 * Configuración. Bootstrap la usa para conservar la regla Firestore de leer
 * todo antes de escribir el núcleo atómico.
 */
export function inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion(
  db: Firestore,
  tx: Transaction,
  entrada: EntradaInicializacionConfiguracion,
  empresa: FirebaseFirestore.DocumentData,
  existente: FirebaseFirestore.DocumentSnapshot,
): { idempotente: boolean; configuracion: ConfiguracionEmpresa } {
  return inicializarConfiguracionConEstadoPreleidoEnTransaccion(db, tx, entrada, empresa, existente);
}

/** Operación interna, componible en una transacción aislada de configuración. */
export async function inicializarConfiguracionEmpresaEnTransaccion(db: Firestore, tx: Transaction, entrada: EntradaInicializacionConfiguracion): Promise<{ idempotente: boolean; configuracion: ConfiguracionEmpresa }> {
  const configRef = db.collection(CONFIGURACIONES_COLLECTION).doc(entrada.empresaId);
  const empresaRef = db.collection("empresas").doc(entrada.empresaId);
  const [empresaSnap, existente] = await Promise.all([tx.get(empresaRef), tx.get(configRef)]);
  return inicializarConfiguracionConEstadoPreleidoEnTransaccion(db, tx, entrada, empresaSnap.data(), existente);
}

export async function inicializarConfiguracionEmpresa(entrada: EntradaInicializacionConfiguracion) { const db = getFirestore(); return db.runTransaction((tx) => inicializarConfiguracionEmpresaEnTransaccion(db, tx, entrada)); }

export async function leerConfiguracionEmpresa(db: Firestore, empresaId: string): Promise<ConfiguracionEmpresa> {
  const snap = await db.collection(CONFIGURACIONES_COLLECTION).doc(empresaId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Configuración inexistente.");
  const configuracion = snap.data() as ConfiguracionEmpresa;
  const empresa = await db.collection("empresas").doc(empresaId).get();
  const paisFiscal = empresa.data()?.paisFiscal;
  if (!empresa.exists || typeof paisFiscal !== "string" || !validarConfiguracionEmpresa(configuracion, { empresaId, paisFiscalEmpresa: paisFiscal }).valida) {
    throw new HttpsError("failed-precondition", "Configuración inválida.");
  }
  return configuracion;
}
