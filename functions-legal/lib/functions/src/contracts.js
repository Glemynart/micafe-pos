"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESTADOS_INCORPORACION = exports.MECANISMOS_INCORPORACION = exports.ORIGENES_INCORPORACION = exports.ROLES_TENANT = void 0;
exports.normalizarCodigo = normalizarCodigo;
exports.esPinValido = esPinValido;
exports.esRolTenant = esRolTenant;
exports.esMecanismoIncorporacion = esMecanismoIncorporacion;
exports.esEstadoIncorporacion = esEstadoIncorporacion;
exports.normalizarEmail = normalizarEmail;
exports.normalizarNombre = normalizarNombre;
exports.idCredencialOperativa = idCredencialOperativa;
exports.ROLES_TENANT = [
    "admin",
    "supervisor",
    "cajero",
    "vendedor",
    "cocinero",
    "marketing",
];
const CODIGO_REGEX = /^[a-z0-9._-]{3,32}$/;
const PIN_REGEX = /^[0-9]{6}$/;
/**
 * Quién emitió la incorporación/credencial (ADR-SAAS-013 §7.4). Aditivo:
 * ausente en todo documento preexistente, que se sigue leyendo como si
 * fuera "TENANT" (el único origen posible antes de este campo).
 */
exports.ORIGENES_INCORPORACION = ["PLATAFORMA", "TENANT"];
exports.MECANISMOS_INCORPORACION = ["DIRECTA", "EMAIL"];
exports.ESTADOS_INCORPORACION = [
    "INVITED",
    "TEMP_CREDENTIAL",
    "ACTIVE",
    "CANCELLED",
    "EXPIRED",
];
function normalizarCodigo(codigo) {
    if (typeof codigo !== "string")
        return null;
    const normalizado = codigo.trim().toLowerCase().replace(/\s+/g, "-");
    return CODIGO_REGEX.test(normalizado) ? normalizado : null;
}
function esPinValido(pin) {
    return typeof pin === "string" && PIN_REGEX.test(pin);
}
function esRolTenant(rol) {
    return typeof rol === "string" && exports.ROLES_TENANT.includes(rol);
}
function esMecanismoIncorporacion(valor) {
    return typeof valor === "string" && exports.MECANISMOS_INCORPORACION.includes(valor);
}
function esEstadoIncorporacion(valor) {
    return typeof valor === "string" && exports.ESTADOS_INCORPORACION.includes(valor);
}
function normalizarEmail(email) {
    if (typeof email !== "string")
        return null;
    const normalizado = email.trim().toLowerCase();
    return normalizado.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)
        ? normalizado
        : null;
}
function normalizarNombre(nombre) {
    if (typeof nombre !== "string")
        return null;
    const normalizado = nombre.trim();
    return normalizado.length >= 2 && normalizado.length <= 120 ? normalizado : null;
}
function idCredencialOperativa(empresaId, codigo) {
    return `${empresaId}_${codigo}`;
}
