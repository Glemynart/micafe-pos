import { createHash } from "node:crypto";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial, fechaComercialUtc, type PlanVersion } from "../../../lib/suscripciones/contrato";
import type { EntradaBootstrapEmpresarial, ProvisionamientoEmpresarial, ResultadoBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { inicializarConfiguracionEmpresaEnTransaccion } from "../configuracion/service";
import { crearSuscripcionTrialEnTransaccion } from "../suscripciones/service";
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

export async function ejecutarBootstrapEmpresarial(
  dbParam?: Firestore,
  entrada?: EntradaBootstrapEmpresarial,
  customClaimsEmitter?: ClaimsEmitter
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

  // 1. Verificación pre-transaccional: El plan debe existir y estar en estado PUBLICADA
  const planVersionRef = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion));
  const planSnap = await planVersionRef.get();
  if (!planSnap.exists || (planSnap.data() as PlanVersion).estado !== "PUBLICADA") {
    fail("failed-precondition", "PLAN_NOT_PUBLISHED");
  }

  // 2. Commit atómico del núcleo (Transacción Firestore)
  const trialDias = entrada.trialDias ?? 14;
  const hoyMs = Date.now();
  const trialInicio = fechaComercialUtc(new Date(hoyMs));
  const trialFin = fechaComercialUtc(new Date(hoyMs + trialDias * 86400000));

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
    const [empresaSnap, subSnap] = await Promise.all([tx.get(empresaRef), tx.get(subRef)]);

    if (empresaSnap.exists || subSnap.exists) {
      fail("already-exists", "EMPRESA_ALREADY_EXISTS");
    }

    // A. Empresa (estado: trial)
    tx.create(empresaRef, {
      id: entrada.empresaId,
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      ownerUid: entrada.ownerUid,
      paisFiscal: entrada.paisFiscal.trim(),
      estado: "trial",
      revision: 1,
      schemaVersion: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });

    // B. Configuración inicial (B1)
    await inicializarConfiguracionEmpresaEnTransaccion(db, tx, {
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      paisFiscal: entrada.paisFiscal.trim(),
      commandId: entrada.commandId,
      correlationId: entrada.correlationId,
      origen: "BOOTSTRAP",
    });

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
    let permisos: string[];
    try {
      permisos = await permisosPredeterminados("admin");
    } catch {
      permisos = ["pos", "configuracion", "reportes", "usuarios", "inventario", "caja"];
    }
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
      {
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
      },
      { actorId: entrada.ownerUid, origen: "SYSTEM" }
    );

    // G. Registro de Provisionamiento (CORE_COMMITTED)
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
      idempotente: true,
    };
  }

  // 3. Paso recuperable de emisión de Custom Claims
  const emitter = customClaimsEmitter ?? (async (u, e, r) => actualizarClaimsTenant(u, e, r));
  try {
    await emitter(entrada.ownerUid, entrada.empresaId, "admin");
    await provRef.update({
      estado: "COMPLETED",
      ultimoPasoConfirmado: "COMPLETED",
      errorRecuperable: null,
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "COMPLETED",
      claimsEmitidos: true,
      idempotente: transaccionResultado.yaCometido,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "AUTH_CLAIMS_FAILED";
    await provRef.update({
      estado: "RETRYABLE_FAILURE",
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
