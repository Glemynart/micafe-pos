"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consultarEstadoLegalTenant = consultarEstadoLegalTenant;
exports.aceptarDocumentosLegalesTenant = aceptarDocumentosLegalesTenant;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const https_1 = require("firebase-functions/v2/https");
const authority_1 = require("../tenant-configuration/authority");
const catalog_1 = require("./catalog");
const ERROR_AUTH = "Autenticación requerida.";
const ERROR_ACCESS = "Acceso denegado.";
const CORRELATION = /^[A-Za-z0-9._:-]{1,100}$/;
function fail(code, message) {
    throw new https_1.HttpsError(code, message);
}
function leerObjeto(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail("invalid-argument", "Solicitud legal inválida.");
    return value;
}
function leerEntradaAceptacion(value) {
    const data = leerObjeto(value);
    const keys = new Set(["bundleId", "aceptoTerminos", "aceptoAnexo", "declaroFacultad", "correlationId"]);
    if (Object.keys(data).some((key) => !keys.has(key))
        || data.aceptoTerminos !== true
        || data.aceptoAnexo !== true
        || data.declaroFacultad !== true
        || typeof data.bundleId !== "string"
        || typeof data.correlationId !== "string"
        || !CORRELATION.test(data.correlationId)) {
        fail("invalid-argument", "Debes aceptar los documentos contractuales y declarar tu facultad de representación.");
    }
    return { bundleId: data.bundleId, correlationId: data.correlationId };
}
function idAceptacion(empresaId, uid, bundleId) {
    return (0, node_crypto_1.createHash)("sha256").update(`${empresaId}\n${uid}\n${bundleId}`, "utf8").digest("hex");
}
async function validarSesionVigente(request, dependencies) {
    const uid = request.auth?.uid;
    if (!uid)
        fail("unauthenticated", ERROR_AUTH);
    const authTime = request.auth?.token.auth_time;
    if (typeof authTime !== "number" || !Number.isFinite(authTime))
        fail("unauthenticated", ERROR_AUTH);
    let user;
    try {
        user = await (dependencies.getUser ?? ((userId) => (0, auth_1.getAuth)().getUser(userId)))(uid);
    }
    catch {
        fail("unauthenticated", ERROR_AUTH);
    }
    const invalidAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0;
    if (user.disabled || !Number.isFinite(invalidAfter) || authTime <= invalidAfter)
        fail("unauthenticated", ERROR_AUTH);
    return uid;
}
async function exigirAdminTenant(request, dependencies) {
    if (!request.auth)
        fail("unauthenticated", ERROR_AUTH);
    const uid = await validarSesionVigente(request, dependencies);
    const db = dependencies.db ?? (0, firestore_1.getFirestore)();
    const tenant = await (dependencies.exigirTenant ?? authority_1.exigirTenantActivo)(request, db);
    if (tenant.id !== request.auth.token.empresaId || tenant.rol !== "admin" || request.auth.token.rol !== "admin")
        fail("permission-denied", ERROR_ACCESS);
    return { db, empresaId: tenant.id, uid };
}
function refAceptacion(db, empresaId, uid, bundleId) {
    const id = idAceptacion(empresaId, uid, bundleId);
    return { id, ref: db.collection("empresas").doc(empresaId).collection("aceptacionesLegales").doc(id) };
}
function aceptaBundle(bundle) {
    return bundle.estado === "EXIGIBLE"
        && bundle.documentosContractualesRequeridos.every((id) => bundle.documentos.some((doc) => doc.id === id && doc.estado === "PUBLICADO"));
}
/** Estado mínimo visible al administrador del tenant; los textos no se reconstruyen desde el cliente. */
async function consultarEstadoLegalTenant(request, dependencies = {}) {
    const { db, empresaId, uid } = await exigirAdminTenant(request, dependencies);
    const bundle = dependencies.bundle ?? catalog_1.BUNDLE_LEGAL_ACTUAL;
    const company = await db.collection("empresas").doc(empresaId).get();
    if (!company.exists)
        fail("permission-denied", ERROR_ACCESS);
    const habilitado = aceptaBundle(bundle);
    const { id, ref } = refAceptacion(db, empresaId, uid, bundle.id);
    const acceptance = habilitado ? await ref.get() : null;
    const receipt = acceptance?.exists ? acceptance.data() : undefined;
    const acceptedAt = receipt?.aceptadoEn?.toDate?.();
    return {
        empresaId,
        nombreEmpresa: typeof company.data()?.nombreComercial === "string"
            ? company.data().nombreComercial
            : typeof company.data()?.nombre === "string" ? company.data().nombre : empresaId,
        bundleId: bundle.id,
        estado: habilitado ? "EXIGIBLE" : "PREPARACION",
        requiereAceptacion: habilitado && !acceptance?.exists,
        aceptado: habilitado && !!acceptance?.exists,
        aceptacionId: acceptance?.exists ? id : null,
        aceptadoEn: acceptedAt instanceof Date ? acceptedAt.toISOString() : null,
        documentos: bundle.documentos,
    };
}
/** Registra aceptación contractual inmutable. Las autorizaciones personales son otra operación y no se infieren aquí. */
async function aceptarDocumentosLegalesTenant(request, dependencies = {}) {
    if (!request.auth)
        fail("unauthenticated", ERROR_AUTH);
    const input = leerEntradaAceptacion(request.data);
    const { db, empresaId, uid } = await exigirAdminTenant(request, dependencies);
    const bundle = dependencies.bundle ?? catalog_1.BUNDLE_LEGAL_ACTUAL;
    if (input.bundleId !== bundle.id || !aceptaBundle(bundle))
        fail("failed-precondition", "Los documentos legales todavía no están aprobados para aceptación.");
    const { id, ref } = refAceptacion(db, empresaId, uid, bundle.id);
    const empresaRef = db.collection("empresas").doc(empresaId);
    const membershipRef = db.collection("membresias").doc(`${empresaId}_${uid}`);
    const outcome = await db.runTransaction(async (tx) => {
        const [empresaSnap, membershipSnap, receiptSnap] = await Promise.all([
            tx.get(empresaRef), tx.get(membershipRef), tx.get(ref),
        ]);
        const company = empresaSnap.data();
        const membership = membershipSnap.data();
        if (!empresaSnap.exists || !["activa", "trial"].includes(company?.estado)
            || !membershipSnap.exists
            || membership?.empresaId !== empresaId
            || membership?.uid !== uid
            || membership?.rol !== "admin"
            || membership?.estado !== "activa"
            || membership?.activo !== true)
            fail("permission-denied", ERROR_ACCESS);
        const documento = {
            schemaVersion: 1,
            aceptacionId: id,
            empresaId,
            uid,
            relacion: "ADMIN_TENANT_REPRESENTANTE_DECLARADO",
            facultadRepresentacionDeclarada: true,
            bundleId: bundle.id,
            documentos: bundle.documentosContractualesRequeridos.map((docId) => {
                const doc = bundle.documentos.find((candidate) => candidate.id === docId);
                return { id: doc.id, version: doc.version, sha256: doc.sha256 };
            }),
            correlationId: input.correlationId,
            aceptadoEn: (dependencies.serverTimestamp ?? (() => firestore_1.FieldValue.serverTimestamp()))(),
        };
        if (receiptSnap.exists) {
            const previous = receiptSnap.data();
            const same = previous?.empresaId === empresaId
                && previous?.uid === uid
                && previous?.bundleId === bundle.id
                && previous?.facultadRepresentacionDeclarada === true
                && JSON.stringify(previous?.documentos) === JSON.stringify(documento.documentos);
            if (!same)
                fail("data-loss", "El registro de aceptación no coincide con la versión vigente.");
            return { idempotente: true };
        }
        tx.create(ref, documento);
        return { idempotente: false };
    });
    const saved = await ref.get();
    const aceptadoEn = saved.data()?.aceptadoEn?.toDate?.();
    return { aceptacionId: id, bundleId: bundle.id, idempotente: outcome.idempotente, aceptadoEn: aceptadoEn instanceof Date ? aceptadoEn.toISOString() : null };
}
