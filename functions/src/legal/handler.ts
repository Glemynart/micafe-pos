import { createHash } from "node:crypto";
import { FieldPath, FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import { esSnapshotContratoCompatible, type SnapshotContrato } from "../../../lib/suscripciones/contrato";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import { leerRelacionContractualVigente } from "../suscripciones/relacion-vigente";
import { BUNDLE_LEGAL_ACTUAL, type BundleLegal } from "./catalog";
import {
  EXPORT_CONTACT_AUTHORITY_COLLECTION,
  TENANT_ANNEX_COLLECTION,
  crearSnapshotAnexoTenant,
  validarAutoridadContacto,
  validarSnapshotAnexoPersistido,
  type TenantAnnexResult,
  type TenantAnnexSnapshot,
} from "./tenant-annex";
import { EXPORT_CONTACT_DESIGNATION_COLLECTION, validarDesignacionContactoActiva } from "./contact-designation";

type Request = { auth?: { uid: string; token: Record<string, unknown> }; data?: unknown };
type Tenant = Awaited<ReturnType<typeof exigirTenantActivo>>;
type UserRecordLike = { disabled?: boolean; tokensValidAfterTime?: string };
type Dependencies = {
  db?: Firestore | any;
  exigirTenant?: typeof exigirTenantActivo;
  getUser?: (uid: string) => Promise<UserRecordLike>;
  bundle?: BundleLegal;
  projectId?: string;
  loadTenantAnnex?: (input: { db: any; tx?: any; empresaId: string; capacidadesContrato: string[] }) => Promise<TenantAnnexResult>;
  serverTimestamp?: () => unknown;
};

const ERROR_AUTH = "Autenticación requerida.";
const ERROR_ACCESS = "Acceso denegado.";
const CORRELATION = /^[A-Za-z0-9._:-]{1,100}$/;
const CONTRACT_REFERENCE = /^[A-Za-z0-9._:-]{1,120}$/;

type CondicionesComercialesTenant = {
  referenciaContrato: string;
  codigoPlan: string;
  planVersion: number;
  periodicidad: "ANUAL";
  precio: { importe: number; moneda: string };
  vigencia: { inicio: string; fin: string };
  capacidades: string[];
  limites: Record<string, { unidad: string; valor: number }>;
  fiscalidad: { pais?: string; modalidad?: string; habilitada?: boolean } | null;
  trialDias: number | null;
};

type ContratoVigente = { snapshot: SnapshotContrato; referencia: string };

function fail(code: HttpsError["code"], message: string): never {
  throw new HttpsError(code, message);
}

function leerObjeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid-argument", "Solicitud legal inválida.");
  return value as Record<string, unknown>;
}

function leerEntradaAceptacion(value: unknown) {
  const data = leerObjeto(value);
  const keys = new Set(["bundleId", "aceptoTerminos", "aceptoAnexo", "declaroFacultad", "confirmoInstruccionesAnexo", "sha256AnexoTenant", "correlationId", "referenciaContrato"]);
  if (Object.keys(data).some((key) => !keys.has(key))
    || data.aceptoTerminos !== true
    || data.aceptoAnexo !== true
    || data.declaroFacultad !== true
    || data.confirmoInstruccionesAnexo !== true
    || typeof data.sha256AnexoTenant !== "string"
    || !/^[a-f0-9]{64}$/.test(data.sha256AnexoTenant)
    || typeof data.bundleId !== "string"
    || typeof data.correlationId !== "string"
    || !CORRELATION.test(data.correlationId)
    || typeof data.referenciaContrato !== "string"
    || !CONTRACT_REFERENCE.test(data.referenciaContrato)) {
    fail("invalid-argument", "Debes aceptar los documentos contractuales y declarar tu facultad de representación.");
  }
  return { bundleId: data.bundleId, correlationId: data.correlationId, referenciaContrato: data.referenciaContrato, sha256AnexoTenant: data.sha256AnexoTenant };
}

function validarContrato(snapshot: unknown, revision: unknown, relacionId?: unknown): ContratoVigente | null {
  if (!esSnapshotContratoCompatible(snapshot) || !Number.isSafeInteger(revision) || (revision as number) < 1) return null;
  const referencia = typeof relacionId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(relacionId)
    ? `relacion:${relacionId}`
    : `suscripcion:r${revision}`;
  return { snapshot, referencia };
}

function proyectarCondiciones(contrato: ContratoVigente): CondicionesComercialesTenant {
  const snapshot = contrato.snapshot;
  const limites = Object.fromEntries(Object.entries(snapshot.limites)
    .filter(([ , value ]) => !!value && typeof value.unidad === "string"
      && Number.isSafeInteger(value.valor) && value.valor >= 0)
    .sort(([left], [right]) => left.localeCompare(right)));
  const rawFiscalidad = snapshot.fiscalidad;
  const fiscalidad = rawFiscalidad ? {
    ...(typeof rawFiscalidad.pais === "string" ? { pais: rawFiscalidad.pais } : {}),
    ...(typeof rawFiscalidad.modalidad === "string" ? { modalidad: rawFiscalidad.modalidad } : {}),
    ...(typeof rawFiscalidad.habilitada === "boolean" ? { habilitada: rawFiscalidad.habilitada } : {}),
  } : null;
  return {
    referenciaContrato: contrato.referencia,
    codigoPlan: snapshot.codigoPlan,
    planVersion: snapshot.planVersion,
    periodicidad: snapshot.periodicidad,
    precio: { importe: snapshot.precio.importe, moneda: snapshot.precio.moneda },
    vigencia: { inicio: snapshot.vigencia.inicio, fin: snapshot.vigencia.fin },
    capacidades: [...snapshot.capacidades].sort(),
    limites,
    fiscalidad,
    trialDias: "trialDias" in snapshot ? snapshot.trialDias : null,
  };
}

async function leerContratoVigente(db: any, empresaId: string): Promise<ContratoVigente | null> {
  const subscriptionRef = db.collection("suscripciones").doc(empresaId);
  const [subscriptionSnap, relation] = await Promise.all([
    subscriptionRef.get(),
    leerRelacionContractualVigente(db, empresaId),
  ]);
  const subscription = subscriptionSnap.data();
  if (relation) return validarContrato(relation.snapshotContrato, relation.revision, relation.relacionId);
  if (subscription?.empresaId !== empresaId) return null;
  return validarContrato(subscription?.snapshotContrato, subscription?.revision);
}

async function leerContratoVigenteEnTransaccion(db: any, tx: any, empresaId: string): Promise<ContratoVigente | null> {
  const subscriptionRef = db.collection("suscripciones").doc(empresaId);
  const relationsRef = subscriptionRef.collection("relaciones");
  const [subscriptionSnap, controlSnap] = await Promise.all([
    tx.get(subscriptionRef),
    tx.get(relationsRef.doc("_vigente")),
  ]);
  if (controlSnap.exists) {
    const relacionId = controlSnap.data()?.relacionVigenteId;
    if (typeof relacionId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(relacionId)) {
      fail("failed-precondition", "No fue posible verificar el contrato vigente. Actualiza la pantalla.");
    }
    const relationSnap = await tx.get(relationsRef.doc(relacionId));
    const relation = relationSnap.data();
    if (!relationSnap.exists || relation?.relacionId !== relacionId || relation?.empresaId !== empresaId || relation?.schemaVersion !== 1) {
      fail("failed-precondition", "No fue posible verificar el contrato vigente. Actualiza la pantalla.");
    }
    return validarContrato(relation.snapshotContrato, relation.revision, relation.relacionId);
  }
  const subscription = subscriptionSnap.data();
  if (subscription?.empresaId !== empresaId) return null;
  return validarContrato(subscription?.snapshotContrato, subscription?.revision);
}

function idAceptacion(empresaId: string, referenciaContrato: string, uid: string, bundleId: string, sha256AnexoTenant?: string): string {
  const parts = [empresaId, referenciaContrato, uid, bundleId];
  if (sha256AnexoTenant) parts.push(sha256AnexoTenant);
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

async function validarSesionVigente(request: Request, dependencies: Dependencies): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) fail("unauthenticated", ERROR_AUTH);
  const authTime = request.auth?.token.auth_time;
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) fail("unauthenticated", ERROR_AUTH);
  let user: UserRecordLike;
  try {
    user = await (dependencies.getUser ?? ((userId) => getAuth().getUser(userId)))(uid);
  } catch {
    fail("unauthenticated", ERROR_AUTH);
  }
  const invalidAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0;
  if (user.disabled || !Number.isFinite(invalidAfter) || authTime <= invalidAfter) fail("unauthenticated", ERROR_AUTH);
  return uid;
}

async function exigirAdminTenant(request: Request, dependencies: Dependencies) {
  if (!request.auth) fail("unauthenticated", ERROR_AUTH);
  const uid = await validarSesionVigente(request, dependencies);
  const db = dependencies.db ?? getFirestore();
  const tenant: Tenant = await (dependencies.exigirTenant ?? exigirTenantActivo)(request, db);
  if (tenant.id !== request.auth.token.empresaId || tenant.rol !== "admin" || request.auth.token.rol !== "admin") fail("permission-denied", ERROR_ACCESS);
  return { db, empresaId: tenant.id, uid };
}

function refAceptacion(db: any, empresaId: string, referenciaContrato: string, uid: string, bundleId: string, sha256AnexoTenant?: string) {
  const id = idAceptacion(empresaId, referenciaContrato, uid, bundleId, sha256AnexoTenant);
  return { id, ref: db.collection("empresas").doc(empresaId).collection("aceptacionesLegales").doc(id) };
}

async function leerSnapshotAnexoTenant(input: { db: any; tx?: any; empresaId: string; capacidadesContrato: string[]; projectId?: string }): Promise<TenantAnnexResult> {
  const projectId = input.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GCLOUD_PROJECT_ID;
  if (!projectId || !/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) return { disponible: false, faltantes: ["proyecto de ejecución verificable"] };
  const annexRef = input.db.collection(TENANT_ANNEX_COLLECTION).doc(input.empresaId);
  const authorityRef = input.db.collection(EXPORT_CONTACT_AUTHORITY_COLLECTION).doc(input.empresaId);
  const designationRef = input.db.collection(EXPORT_CONTACT_DESIGNATION_COLLECTION).doc(input.empresaId);
  const get = (ref: any) => input.tx ? input.tx.get(ref) : ref.get();
  const [annexSnap, authoritySnap, designationSnap] = await Promise.all([get(annexRef), get(authorityRef), get(designationRef)]);
  const authority = authoritySnap.exists ? authoritySnap.data() : null;
  const designation = designationSnap.exists ? designationSnap.data() : null;
  const authorityWithCurrentDesignation = authority && designation && validarAutoridadContacto(authority, projectId, input.empresaId)
    && validarDesignacionContactoActiva(designation, {
      projectId, empresaId: input.empresaId, contactId: authority.contacto.id, channel: authority.contacto.canal,
      designationRef: authority.contacto.designacionRef, designationAt: authority.contacto.designadoEn,
      designationVersion: authority.contacto.designacionVersion,
    }) ? authority : null;
  return crearSnapshotAnexoTenant({
    empresaId: input.empresaId,
    projectId,
    annexRecord: annexSnap.exists ? annexSnap.data() : null,
    authority: authorityWithCurrentDesignation,
    capacidadesContrato: input.capacidadesContrato,
  });
}

function aceptaBundle(bundle: BundleLegal): boolean {
  return bundle.estado === "EXIGIBLE"
    && bundle.documentosContractualesRequeridos.every((id) => bundle.documentos.some((doc) => doc.id === id && doc.estado === "PUBLICADO"));
}

function documentosContratados(bundle: BundleLegal) {
  return bundle.documentosContractualesRequeridos.map((docId) => {
    const doc = bundle.documentos.find((candidate) => candidate.id === docId && candidate.estado === "PUBLICADO");
    if (!doc) fail("failed-precondition", "Falta una versión contractual publicada.");
    return { id: doc.id, version: doc.version, sha256: doc.sha256 };
  });
}

function ordenarJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(ordenarJson);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, ordenarJson(entry)] as const);
    return Object.fromEntries(entries);
  }
  fail("failed-precondition", "No fue posible conservar las condiciones comerciales.");
}

function hashCondicionesComerciales(condiciones: CondicionesComercialesTenant): string {
  return createHash("sha256").update(JSON.stringify(ordenarJson(condiciones)) ?? "null", "utf8").digest("hex");
}

function snapshotCondicionesCoincide(value: unknown, expectedHash: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return hashCondicionesComerciales(value as CondicionesComercialesTenant) === expectedHash;
  } catch {
    return false;
  }
}

function fechaReciboValida(value: unknown): Date | null {
  try {
    const fecha = (value as { toDate?: () => unknown } | null)?.toDate?.();
    return fecha instanceof Date && Number.isFinite(fecha.getTime()) ? fecha : null;
  } catch {
    return null;
  }
}

async function consultarHistorialLegal(db: any, empresaId: string, cursor: string | null) {
  let query = db.collection("empresas").doc(empresaId).collection("aceptacionesLegales").orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const resultado = await query.limit(51).get();
  const documentos = resultado.docs.slice(0, 50);
  const historial = documentos.map((snap: any) => {
    const r = snap.data();
    const fecha = fechaReciboValida(r?.aceptadoEn);
    const schemaValido = r?.schemaVersion === 1 || r?.schemaVersion === 2
      && typeof r.sha256AnexoTenant === "string"
      && validarSnapshotAnexoPersistido(r.anexoTenant, empresaId, r.sha256AnexoTenant);
    const expectedId = r?.schemaVersion === 2
      ? idAceptacion(empresaId, r.referenciaContrato, r.uid, r.bundleId, r.sha256AnexoTenant)
      : idAceptacion(empresaId, r.referenciaContrato, r.uid, r.bundleId);
    if (!schemaValido || r.empresaId !== empresaId || typeof r.uid !== "string" || !r.uid
      || typeof r.bundleId !== "string" || !r.bundleId || typeof r.referenciaContrato !== "string"
      || r.relacion !== "ADMIN_TENANT_REPRESENTANTE_DECLARADO" || r.facultadRepresentacionDeclarada !== true
      || r.aceptacionId !== snap.id || snap.id !== expectedId
      || typeof r.sha256CondicionesComerciales !== "string" || !/^[a-f0-9]{64}$/.test(r.sha256CondicionesComerciales)
      || !snapshotCondicionesCoincide(r.condicionesComerciales, r.sha256CondicionesComerciales)
      || r.condicionesComerciales?.referenciaContrato !== r.referenciaContrato
      || !Array.isArray(r.documentos) || !r.documentos.length
      || r.documentos.some((doc: any) => !doc || typeof doc.id !== "string" || typeof doc.version !== "string" || !/^[a-f0-9]{64}$/.test(doc.sha256))
      || !fecha) fail("data-loss", "No fue posible verificar el historial de aceptaciones.");
    return { aceptacionId: snap.id, uid: r.uid, bundleId: r.bundleId, referenciaContrato: r.referenciaContrato,
      aceptadoEn: fecha.toISOString(), documentos: r.documentos.map((doc: any) => ({ id: doc.id, version: doc.version, sha256: doc.sha256 })),
      ...(r.schemaVersion === 2 ? { sha256AnexoTenant: r.sha256AnexoTenant } : {}) };
  });
  historial.sort((a: { aceptadoEn: string }, b: { aceptadoEn: string }) => b.aceptadoEn.localeCompare(a.aceptadoEn));
  return { historial, historialLimitado: resultado.docs.length > 50,
    siguienteCursor: resultado.docs.length > 50 ? documentos[documentos.length - 1].id : null };
}

/** Estado mínimo visible al administrador del tenant; los textos no se reconstruyen desde el cliente. */
export async function consultarEstadoLegalTenant(request: Request, dependencies: Dependencies = {}) {
  const data = request.data === undefined || request.data === null ? {} : leerObjeto(request.data);
  if (Object.keys(data).some(key => key !== "cursor") || (data.cursor !== undefined && (typeof data.cursor !== "string" || !/^[a-f0-9]{64}$/.test(data.cursor)))) fail("invalid-argument", "Cursor de historial inválido.");
  const { db, empresaId, uid } = await exigirAdminTenant(request, dependencies);
  const bundle = dependencies.bundle ?? BUNDLE_LEGAL_ACTUAL;
  const [company, contract, historialLegal] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    leerContratoVigente(db, empresaId),
    consultarHistorialLegal(db, empresaId, typeof data.cursor === "string" ? data.cursor : null),
  ]);
  if (!company.exists) fail("permission-denied", ERROR_ACCESS);

  const habilitado = aceptaBundle(bundle);
  const condicionesComerciales = contract ? proyectarCondiciones(contract) : null;
  const hashCondiciones = condicionesComerciales ? hashCondicionesComerciales(condicionesComerciales) : null;
  const anexoTenant: TenantAnnexResult = contract
    ? await (dependencies.loadTenantAnnex ?? ((input) => leerSnapshotAnexoTenant({ ...input, projectId: dependencies.projectId })))(
      { db, empresaId, capacidadesContrato: contract.snapshot.capacidades },
    )
    : { disponible: false, faltantes: ["snapshot contractual vigente"] };
  const acceptanceRef = habilitado && contract && anexoTenant.disponible
    ? refAceptacion(db, empresaId, contract.referencia, uid, bundle.id, anexoTenant.sha256)
    : null;
  const acceptance = acceptanceRef ? await acceptanceRef.ref.get() : null;
  const receipt = acceptance?.exists ? acceptance.data() : undefined;
  if (receipt && (receipt.schemaVersion !== 2
    || receipt.aceptacionId !== acceptanceRef?.id
    || !fechaReciboValida(receipt.aceptadoEn)
    || receipt.empresaId !== empresaId
    || receipt.uid !== uid
    || receipt.relacion !== "ADMIN_TENANT_REPRESENTANTE_DECLARADO"
    || receipt.facultadRepresentacionDeclarada !== true
    || receipt.bundleId !== bundle.id
    || receipt.referenciaContrato !== contract?.referencia
    || receipt.sha256CondicionesComerciales !== hashCondiciones
    || !snapshotCondicionesCoincide(receipt.condicionesComerciales, receipt.sha256CondicionesComerciales)
    || !anexoTenant.disponible
    || receipt.sha256AnexoTenant !== anexoTenant.sha256
    || !validarSnapshotAnexoPersistido(receipt.anexoTenant, empresaId, receipt.sha256AnexoTenant)
    || JSON.stringify(receipt.documentos) !== JSON.stringify(documentosContratados(bundle)))) {
    fail("data-loss", "La aceptación guardada no coincide con el contrato o documentos vigentes.");
  }
  const acceptedAt = receipt ? fechaReciboValida(receipt.aceptadoEn) : null;

  return {
    empresaId,
    nombreEmpresa: typeof company.data()?.nombreComercial === "string"
      ? company.data().nombreComercial
      : typeof company.data()?.nombre === "string" ? company.data().nombre : empresaId,
    bundleId: bundle.id,
    estado: habilitado ? "EXIGIBLE" : "PREPARACION",
    requiereAceptacion: habilitado && (!acceptance?.exists || !contract || !anexoTenant.disponible),
    aceptacionDisponible: habilitado && !!contract && anexoTenant.disponible,
    aceptado: habilitado && !!acceptance?.exists && !!contract && anexoTenant.disponible,
    aceptacionId: acceptance?.exists ? acceptanceRef?.id ?? null : null,
    aceptadoEn: acceptedAt instanceof Date ? acceptedAt.toISOString() : null,
    sha256CondicionesComerciales: receipt?.sha256CondicionesComerciales ?? null,
    documentosAceptados: receipt?.documentos ?? null,
    condicionesComerciales,
    anexoTenant: anexoTenant.disponible ? anexoTenant.snapshot : null,
    sha256AnexoTenant: anexoTenant.disponible ? anexoTenant.sha256 : null,
    faltantesAnexoTenant: anexoTenant.disponible ? [] : anexoTenant.faltantes,
    documentos: bundle.documentos,
    ...historialLegal,
  };
}

/** Registra aceptación contractual inmutable. Las autorizaciones personales son otra operación y no se infieren aquí. */
export async function aceptarDocumentosLegalesTenant(request: Request, dependencies: Dependencies = {}) {
  if (!request.auth) fail("unauthenticated", ERROR_AUTH);
  const input = leerEntradaAceptacion(request.data);
  const { db, empresaId, uid } = await exigirAdminTenant(request, dependencies);
  const bundle = dependencies.bundle ?? BUNDLE_LEGAL_ACTUAL;
  if (input.bundleId !== bundle.id || !aceptaBundle(bundle)) fail("failed-precondition", "Los documentos legales todavía no están aprobados para aceptación.");

  const { id, ref } = refAceptacion(db, empresaId, input.referenciaContrato, uid, bundle.id, input.sha256AnexoTenant);
  const empresaRef = db.collection("empresas").doc(empresaId);
  const membershipRef = db.collection("membresias").doc(`${empresaId}_${uid}`);
  const outcome = await db.runTransaction(async (tx: any) => {
    const [empresaSnap, membershipSnap, receiptSnap] = await Promise.all([
      tx.get(empresaRef), tx.get(membershipRef), tx.get(ref),
    ]);
    const contract = await leerContratoVigenteEnTransaccion(db, tx, empresaId);
    if (!contract || contract.referencia !== input.referenciaContrato) {
      fail("failed-precondition", "El contrato cambió o no tiene un snapshot verificable. Actualiza la pantalla antes de aceptar.");
    }
    const company = empresaSnap.data();
    const membership = membershipSnap.data();
    if (!empresaSnap.exists || !["activa", "trial"].includes(company?.estado)
      || !membershipSnap.exists
      || membership?.empresaId !== empresaId
      || membership?.uid !== uid
      || membership?.rol !== "admin"
      || membership?.estado !== "activa"
      || membership?.activo !== true) fail("permission-denied", ERROR_ACCESS);

    const anexoTenant = await (dependencies.loadTenantAnnex ?? ((parameters) => leerSnapshotAnexoTenant({ ...parameters, projectId: dependencies.projectId })))(
      { db, tx, empresaId, capacidadesContrato: contract.snapshot.capacidades },
    );
    if (!anexoTenant.disponible || anexoTenant.sha256 !== input.sha256AnexoTenant) {
      fail("failed-precondition", "La ficha del anexo cambió o aún tiene datos sin verificar. Actualiza la pantalla antes de aceptar.");
    }

    const condicionesComerciales = proyectarCondiciones(contract);
    const hashCondiciones = hashCondicionesComerciales(condicionesComerciales);
    const documentos = documentosContratados(bundle);
    const documento = {
      schemaVersion: 2,
      aceptacionId: id,
      empresaId,
      uid,
      relacion: "ADMIN_TENANT_REPRESENTANTE_DECLARADO",
      referenciaContrato: contract.referencia,
      sha256CondicionesComerciales: hashCondiciones,
      condicionesComerciales,
      sha256AnexoTenant: anexoTenant.sha256,
      anexoTenant: anexoTenant.snapshot,
      facultadRepresentacionDeclarada: true,
      bundleId: bundle.id,
      documentos,
      correlationId: input.correlationId,
      aceptadoEn: (dependencies.serverTimestamp ?? (() => FieldValue.serverTimestamp()))(),
    };

    if (receiptSnap.exists) {
      const previous = receiptSnap.data();
      const same = previous?.empresaId === empresaId
        && previous?.aceptacionId === id
        && !!fechaReciboValida(previous?.aceptadoEn)
        && previous?.uid === uid
        && previous?.schemaVersion === 2
        && previous?.relacion === "ADMIN_TENANT_REPRESENTANTE_DECLARADO"
        && previous?.bundleId === bundle.id
        && previous?.referenciaContrato === contract.referencia
        && previous?.sha256CondicionesComerciales === hashCondiciones
        && snapshotCondicionesCoincide(previous?.condicionesComerciales, hashCondiciones)
        && previous?.sha256AnexoTenant === anexoTenant.sha256
        && validarSnapshotAnexoPersistido(previous?.anexoTenant, empresaId, anexoTenant.sha256)
        && previous?.facultadRepresentacionDeclarada === true
        && JSON.stringify(previous?.documentos) === JSON.stringify(documento.documentos);
      if (!same) fail("data-loss", "El registro de aceptación no coincide con la versión vigente.");
      return { idempotente: true };
    }
    tx.create(ref, documento);
    return { idempotente: false };
  });

  const saved = await ref.get();
  const receipt = saved.data();
  const aceptadoEn = fechaReciboValida(receipt?.aceptadoEn);
  if (!saved.exists || receipt?.aceptacionId !== id || !aceptadoEn) fail("data-loss", "No fue posible verificar el recibo de aceptación.");
  return {
    aceptacionId: id,
    bundleId: bundle.id,
    idempotente: outcome.idempotente,
    aceptadoEn: aceptadoEn instanceof Date ? aceptadoEn.toISOString() : null,
    referenciaContrato: receipt?.referenciaContrato,
    sha256CondicionesComerciales: receipt?.sha256CondicionesComerciales,
    condicionesComerciales: receipt?.condicionesComerciales,
    sha256AnexoTenant: receipt?.sha256AnexoTenant,
    anexoTenant: receipt?.anexoTenant,
    documentos: receipt?.documentos,
  };
}
