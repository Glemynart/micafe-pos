"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarMembresiaActiva = validarMembresiaActiva;
exports.exigirTenantActivo = exigirTenantActivo;
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const contracts_1 = require("../contracts");
const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";
function errorCredenciales() {
    return new https_1.HttpsError("unauthenticated", ERROR_CREDENCIALES);
}
function esMembresiaActivaYValida(data, empresaId, uid) {
    return !!data
        && data.empresaId === empresaId
        && data.uid === uid
        && data.estado === "activa"
        && data.activo === true
        && (0, contracts_1.esRolTenant)(data.rol)
        && Array.isArray(data.permisos)
        && data.permisos.every((permiso) => typeof permiso === "string" && permiso.length > 0);
}
/** La membresía, no `usuarios`, decide rol, permisos y estado. */
async function validarMembresiaActiva(empresaId, uid, dbParam) {
    const db = dbParam ?? (0, firestore_1.getFirestore)();
    let membresiaSnap;
    try {
        const res = await Promise.all([
            db.collection("membresias").doc(`${empresaId}_${uid}`).get(),
            (0, auth_1.getAuth)().getUser(uid).catch(() => null),
        ]);
        membresiaSnap = res[0];
    }
    catch {
        membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${uid}`).get();
    }
    const membresia = membresiaSnap.data();
    if (!membresiaSnap.exists || !esMembresiaActivaYValida(membresia, empresaId, uid)) {
        throw errorCredenciales();
    }
    return { rol: membresia.rol, permisos: membresia.permisos };
}
/** Revalida claim, Empresa y membresía para lecturas tenant de backend. */
async function exigirTenantActivo(request, dbParam) {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Autenticación requerida.");
    const empresaId = request.auth.token.empresaId;
    if (typeof empresaId !== "string" || !empresaId.trim()) {
        throw new https_1.HttpsError("permission-denied", "Acceso denegado.");
    }
    const db = dbParam ?? (0, firestore_1.getFirestore)();
    const snap = await db.collection("empresas").doc(empresaId).get();
    const estado = snap.data()?.estado;
    const paisFiscal = snap.data()?.paisFiscal;
    if (!snap.exists || (estado !== "activa" && estado !== "trial")) {
        throw new https_1.HttpsError("permission-denied", "Acceso denegado.");
    }
    const membresiaActual = await validarMembresiaActiva(empresaId, request.auth.uid, db);
    if (request.auth.token.rol !== membresiaActual.rol) {
        throw new https_1.HttpsError("permission-denied", "Acceso denegado.");
    }
    return {
        id: empresaId,
        estado: estado,
        rol: membresiaActual.rol,
        permisos: membresiaActual.permisos,
        paisFiscal: typeof paisFiscal === "string" ? paisFiscal : undefined,
    };
}
