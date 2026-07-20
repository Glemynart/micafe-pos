import assert from "node:assert/strict";
import test from "node:test";
import {
  esEstadoMembresia,
  esRolMembresia,
  estadoMembresiaDesdeActivo,
  idMembresia,
  normalizarPermisos,
  permisosSonIguales,
} from "../membresias-service";
import { planificarPreparacionMembresias } from "../membresias-preparacion";

const EMPRESA_ID = "empresa-1";
const PLANTILLAS = new Map([
  ["admin", ["sell"]], ["supervisor", ["sell"]], ["cajero", ["sell"]],
  ["cocinero", ["sell"]], ["marketing", []],
] as const);

function usuario(uid = "u1") {
  return { uid, rol: "admin", permisos: ["reports"], activo: true };
}

function membresiaCompleta(uid = "u1") {
  return {
    id: idMembresia(EMPRESA_ID, uid),
    data: { empresaId: EMPRESA_ID, uid, rol: "admin", permisos: ["reports", "sell"], estado: "activa", activo: true, creadaEn: {}, actualizadaEn: {} },
  };
}

test("el contrato de rol acepta exactamente los cinco roles tenant", () => {
  for (const rol of ["admin", "supervisor", "cajero", "cocinero", "marketing"]) {
    assert.equal(esRolMembresia(rol), true);
  }
  assert.equal(esRolMembresia("cashier"), false);
  assert.equal(esRolMembresia("superadmin"), false);
  assert.equal(esRolMembresia("operator"), false);
});

test("el estado canónico preserva la proyección de compatibilidad activo", () => {
  assert.equal(estadoMembresiaDesdeActivo(true), "activa");
  assert.equal(estadoMembresiaDesdeActivo(false), "inactiva");
  assert.equal(esEstadoMembresia("activa"), true);
  assert.equal(esEstadoMembresia("inactiva"), true);
  assert.equal(esEstadoMembresia("suspendida"), false);
});

test("los permisos se normalizan de forma estable sin aceptar datos inválidos", () => {
  assert.deepEqual(normalizarPermisos(["sell", "reports", "sell"]), ["reports", "sell"]);
  assert.equal(normalizarPermisos(["sell", 42]), null);
  assert.equal(normalizarPermisos("sell"), null);
  assert.equal(permisosSonIguales(["reports", "sell"], ["reports", "sell"]), true);
  assert.equal(permisosSonIguales(["reports", "sell"], ["sell", "reports"]), false);
});

test("la identidad de membresía es determinística por empresa y usuario", () => {
  assert.equal(idMembresia("empresa-1", "usuario-1"), "empresa-1_usuario-1");
});

test("--verify bloquea usuarios de Firestore sin identidad Firebase", () => {
  const plan = planificarPreparacionMembresias({ empresaId: EMPRESA_ID, usuarios: [usuario()], plantillas: PLANTILLAS, membresias: [membresiaCompleta()], identidadesInexistentes: ["u1"] });
  assert.match(plan.errores.join("\n"), /Firebase Authentication/);
});

test("--verify exitoso no propone escrituras", () => {
  const plan = planificarPreparacionMembresias({ empresaId: EMPRESA_ID, usuarios: [usuario()], plantillas: PLANTILLAS, membresias: [membresiaCompleta()] });
  assert.deepEqual(plan.errores, []);
  assert.deepEqual(plan.creadas, []);
  assert.deepEqual(plan.actualizadas, []);
  assert.deepEqual(plan.sinCambios, ["u1"]);
});

test("la preparación reporta plantillas ausentes, permisos inválidos y membresías duplicadas", () => {
  const plantillas = new Map(PLANTILLAS);
  plantillas.delete("marketing");
  const plan = planificarPreparacionMembresias({ empresaId: EMPRESA_ID, usuarios: [{ ...usuario(), permisos: [42] }], plantillas, membresias: [membresiaCompleta(), { ...membresiaCompleta(), id: "duplicada" }] });
  assert.match(plan.errores.join("\n"), /permisos_roles\/marketing/);
  assert.match(plan.errores.join("\n"), /permisos no es un arreglo válido/);
  assert.match(plan.errores.join("\n"), /múltiples membresías/);
});

test("una segunda planificación es idempotente y una ejecución parcial se recupera", () => {
  const parcial = planificarPreparacionMembresias({ empresaId: EMPRESA_ID, usuarios: [usuario("u1"), usuario("u2")], plantillas: PLANTILLAS, membresias: [membresiaCompleta("u1")] });
  assert.deepEqual(parcial.sinCambios, ["u1"]);
  assert.deepEqual(parcial.creadas, ["u2"]);
  const recuperado = planificarPreparacionMembresias({ empresaId: EMPRESA_ID, usuarios: [usuario("u1"), usuario("u2")], plantillas: PLANTILLAS, membresias: [membresiaCompleta("u1"), membresiaCompleta("u2")] });
  assert.deepEqual(recuperado.creadas, []);
  assert.deepEqual(recuperado.actualizadas, []);
  assert.deepEqual(recuperado.sinCambios, ["u1", "u2"]);
});
