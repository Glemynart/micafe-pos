import { createHash } from "node:crypto";
import { FieldValue, getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial, fechaComercialUtc, type PlanVersion } from "../../../lib/suscripciones/contrato";
import type { EntradaBootstrapEmpresarial, ProvisionamientoEmpresarial, ResultadoBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion } from "../configuracion/service";
import { crearSuscripcionTrialEnTransaccion, referenciasTrial } from "../suscripciones/service";
import { actualizarClaimsTenant, permisosPredeterminados } from "../operational-auth";

export const PROVISIONAMIENTOS_COLLECTION = "provisionamientos_empresariales";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (prefix: string, key: string) => `${prefix}_${hash(key)}`;
const fail = (code: "invalid-argument" | "already-exists" | "failed-precondition" | "not-found", msg: string): never => { throw new HttpsError(code, msg); };

function validarEntradaBootstrap(e: EntradaBootstrapEmpresarial): void {
  if (
    !e ||
    !esIdComercial(e.commandId) ||
    !esIdComercial(e.idempotencyKey) ||
    !esIdComercial(e.correlationId) ||
    !esIdComercial(e.causationId) ||
    !esIdComercial(e.ownerUid) ||
    !esIdComercial(e.empresaId) ||
    typeof e.nombreComercial !== "string" ||
    !e.nombreComercial.trim() ||
    typeof e.paisFiscal !== "string" ||
    !e.paisFiscal.trim() ||
    !esIdComercial(e.planId) ||
    !Number.isInteger(e.planVersion) ||
    e.planVersion < 1
  ) {
    fail("invalid-argument", "ENTRADA_BOOTSTRAP_INVALIDA");
  }
}

export type ClaimsEmitter = (uid: string, empresaId: string, rol: "admin") => Promise<void>;
export type OwnerIdentityVerifier = (uid: string) => Promise<void>;
/**
 * Observador opcional de la capa de plataforma (ADR-SAAS-012 Anexo A). Puede registrar,
 * dentro de la misma transacción del hecho durable, una obligación de auditoría ya
 * identificada y devolver su `obligacionId` para que quede persistido junto al registro
 * de provisionamiento y un reintento idempotente lo recupere en vez de perderlo. No crea
 * Empresa, Membresía, claims ni ningún recurso tenant; ADR-SAAS-007 no se altera.
 */
export type BootstrapCoreCommitObserver = (
  tx: Transaction,
  provisionamiento: Pick<ProvisionamientoEmpresarial, "provisionamientoId" | "empresaId">,
) => { obligacionId: string } | void;

export async function ejecutarBootstrapEmpresarial(
  dbParam?: Firestore,
  entrada?: EntradaBootstrapEmpresarial,
  customClaimsEmitter?: ClaimsEmitter,
  ownerIdentityVerifier?: OwnerIdentityVerifier,
  coreCommitObserver?: BootstrapCoreCommitObserver,
  completionObserver?: BootstrapCoreCommitObserver,
): Promise<ResultadoBootstrapEmpresarial> {
  const db = dbParam ?? getFirestore();
  if (!entrada) return fail("invalid-argument", "ENTRADA_REQUERIDA");
  validarEntradaBootstrap(entrada);

  const fingerprint = hash({
    ownerUid: entrada.ownerUid,
    empresaId: entrada.empresaId,
    nombreComercial: entrada.nombreComercial.trim(),
    paisFiscal: entrada.paisFiscal.trim(),
    planId: entrada.planId,
    planVersion: entrada.planVersion,
  });

  const provisionamientoId = id("prov", entrada.idempotencyKey);
  const provRef = db.collection(PROVISIONAMIENTOS_COLLECTION).doc(provisionamientoId);

  const verificarOwner = ownerIdentityVerifier ?? (async (uid: string) => {
    const { getAuth } = await import("firebase-admin/auth");
    await getAuth().getUser(uid);
  });
  await verificarOwner(entrada.ownerUid);

  // 1. Verificación pre-transaccional: El plan debe existir y estar en estado PUBLICADA
  const planVersionRef = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion));
  const planSnap = await planVersionRef.get();
  if (!planSnap.exists || (planSnap.data() as PlanVersion).estado !== "PUBLICADA") {
    fail("failed-precondition", "PLAN_NOT_PUBLISHED");
  }
  const permisos = await permisosPredeterminados("admin", db);

  // 2. Commit atómico del núcleo (Transacción Firestore)
  const trialDias = entrada.trialDias ?? 14;
  const hoyMs = Date.now();
  const trialInicio = fechaComercialUtc(new Date(hoyMs));
  const trialFin = fechaComercialUtc(new Date(hoyMs + trialDias * 86400000));
  const entradaTrial = {
    commandId: entrada.commandId,
    idempotencyKey: `sub_${entrada.idempotencyKey}`,
    correlationId: entrada.correlationId,
    causationId: entrada.causationId,
    expectedRevision: 1,
    motivo: "BOOTSTRAP_TRIAL",
    empresaId: entrada.empresaId,
    planId: entrada.planId,
    planVersion: entrada.planVersion,
    trialInicio,
    trialFin,
  };
  const refsTrial = referenciasTrial(db, entradaTrial);

  const transaccionResultado = await db.runTransaction(async (tx) => {
    const provSnap = await tx.get(provRef);
    if (provSnap.exists) {
      const actual = provSnap.data() as ProvisionamientoEmpresarial;
      if (actual.idempotencyKey !== entrada.idempotencyKey || actual.fingerprint !== fingerprint) {
        fail("already-exists", "IDEMPOTENCY_CONFLICT");
      }
      return { yaCometido: true, prov: actual };
    }

    const empresaRef = db.collection("empresas").doc(entrada.empresaId);
    const subRef = db.collection("suscripciones").doc(entrada.empresaId);
    const configRef = db.collection("configuraciones").doc(entrada.empresaId);
    const [empresaSnap, subSnap, configSnap, comandoTrialSnap, commandIdTrialSnap, planTrialSnap] = await Promise.all([
      tx.get(empresaRef),
      tx.get(subRef),
      tx.get(configRef),
      tx.get(refsTrial.comando),
      tx.get(refsTrial.commandId),
      tx.get(refsTrial.plan),
    ]);

    if (empresaSnap.exists || subSnap.exists) {
      fail("already-exists", "EMPRESA_ALREADY_EXISTS");
    }

    const empresaInicial = {
      id: entrada.empresaId,
      empresaId: entrada.empresaId,
      nombre: entrada.nombreComercial.trim(),
      nombreComercial: entrada.nombreComercial.trim(),
      ownerUid: entrada.ownerUid,
      paisFiscal: entrada.paisFiscal.trim(),
      estado: "trial",
      esFundacional: false,
      revision: 1,
      schemaVersion: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    };
    tx.create(empresaRef, empresaInicial);

    // B. Configuración inicial (B1)
    inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion(db, tx, {
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      paisFiscal: entrada.paisFiscal.trim(),
      commandId: entrada.commandId,
      correlationId: entrada.correlationId,
      origen: "BOOTSTRAP",
    }, empresaInicial, configSnap);

    // C. Espacio inicial
    const espacioId = `esp_${entrada.empresaId}_1`;
    tx.create(db.collection("espacios").doc(espacioId), {
      id: espacioId,
      empresaId: entrada.empresaId,
      nombre: "Espacio Principal",
      activo: true,
      creadoEn: FieldValue.serverTimestamp(),
    });

    // D. Numeración inicial en BORRADOR (B2)
    const numeracionId = `num_${entrada.empresaId}_1`;
    tx.create(db.collection("numeraciones").doc(`${entrada.empresaId}_${numeracionId}`), {
      empresaId: entrada.empresaId,
      numeracionId,
      paisFiscal: entrada.paisFiscal.trim(),
      tipoDocumento: "pos",
      scope: "EMPRESA",
      prefijo: "POS",
      resolucion: "BORRADOR_INICIAL",
      rangoInicio: 1,
      rangoFin: 1000,
      ultimoAsignado: 0,
      vigenciaDesde: trialInicio,
      vigenciaHasta: "2099-12-31",
      estado: "BORRADOR",
      revision: 1,
      schemaVersion: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });

    // E. Membresía ADMIN del owner
    tx.create(db.collection("membresias").doc(`${entrada.empresaId}_${entrada.ownerUid}`), {
      empresaId: entrada.empresaId,
      uid: entrada.ownerUid,
      rol: "admin",
      permisos,
      estado: "activa",
      activo: true,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });

    // F. Suscripción Trial (B3)
    await crearSuscripcionTrialEnTransaccion(
      db,
      tx,
      entradaTrial,
      { actorId: entrada.ownerUid, origen: "SYSTEM" },
      {
        comando: comandoTrialSnap,
        commandId: commandIdTrialSnap,
        plan: planTrialSnap,
        suscripcion: subSnap,
      },
    );

    // G. Registro de Provisionamiento (CORE_COMMITTED)
    const observadoCore = coreCommitObserver?.(tx, {
      provisionamientoId,
      empresaId: entrada.empresaId,
    });
    const prov: ProvisionamientoEmpresarial = {
      provisionamientoId,
      idempotencyKey: entrada.idempotencyKey,
      fingerprint,
      ownerUid: entrada.ownerUid,
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      paisFiscal: entrada.paisFiscal.trim(),
      planId: entrada.planId,
      planVersion: entrada.planVersion,
      estado: "CORE_COMMITTED",
      ultimoPasoConfirmado: "CORE_COMMITTED",
      obligacionId: observadoCore?.obligacionId ?? null,
      schemaVersion: 1,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    };
    tx.create(provRef, prov);

    return { yaCometido: false, prov };
  });

  if (transaccionResultado.prov.estado === "COMPLETED") {
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "COMPLETED",
      claimsEmitidos: true,
      obligacionId: transaccionResultado.prov.obligacionId ?? null,
      obligacionCompletadoId: transaccionResultado.prov.obligacionCompletadoId ?? null,
      idempotente: true,
    };
  }

  // 3. Paso recuperable de emisión de Custom Claims
  const emitter = customClaimsEmitter ?? (async (u, e, r) => actualizarClaimsTenant(u, e, r));
  const claimsYaEmitidos = transaccionResultado.prov.estado === "CLAIMS_ISSUED"
    || (transaccionResultado.prov.estado === "RETRYABLE_FAILURE"
      && transaccionResultado.prov.ultimoPasoConfirmado === "CLAIMS_ISSUED");

  if (!claimsYaEmitidos) {
    try {
      await emitter(entrada.ownerUid, entrada.empresaId, "admin");
      await provRef.update({
        estado: "CLAIMS_ISSUED",
        ultimoPasoConfirmado: "CLAIMS_ISSUED",
        errorRecuperable: null,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "AUTH_CLAIMS_FAILED";
      await provRef.update({
        estado: "RETRYABLE_FAILURE",
        ultimoPasoConfirmado: "CORE_COMMITTED",
        errorRecuperable: errorMsg,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return {
        provisionamientoId,
        empresaId: entrada.empresaId,
        estado: "RETRYABLE_FAILURE",
        claimsEmitidos: false,
        idempotente: transaccionResultado.yaCometido,
      };
    }
  }

  try {
    const obligacionCompletadoId = await db.runTransaction(async (tx) => {
      // Lectura transaccional previa a cualquier escritura: si un commit concurrente ya
      // completó este mismo provisionamiento (reintento de Firestore tras conflicto de
      // versión), se reutiliza su obligacionCompletadoId ya persistido en vez de invocar
      // de nuevo el observador y generar una segunda obligación para el mismo hecho
      // (ADR-SAAS-012 §2.1: nunca un segundo CONFIRMADO del mismo hecho).
      const previo = (await tx.get(provRef)).data() as ProvisionamientoEmpresarial | undefined;
      if (previo?.estado === "COMPLETED") {
        return previo.obligacionCompletadoId ?? null;
      }
      const observadoCompletado = completionObserver?.(tx, { provisionamientoId, empresaId: entrada.empresaId });
      tx.update(provRef, {
        estado: "COMPLETED",
        ultimoPasoConfirmado: "COMPLETED",
        errorRecuperable: null,
        obligacionCompletadoId: observadoCompletado?.obligacionId ?? null,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return observadoCompletado?.obligacionId ?? null;
    });
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "COMPLETED",
      claimsEmitidos: true,
      obligacionId: transaccionResultado.prov.obligacionId ?? null,
      obligacionCompletadoId,
      idempotente: transaccionResultado.yaCometido,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "COMPLETION_PERSISTENCE_FAILED";
    await provRef.update({
      estado: "RETRYABLE_FAILURE",
      ultimoPasoConfirmado: "CLAIMS_ISSUED",
      errorRecuperable: errorMsg,
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "RETRYABLE_FAILURE",
      claimsEmitidos: true,
      idempotente: transaccionResultado.yaCometido,
    };
  }
}
