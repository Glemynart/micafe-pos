import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  EVIDENCE_DIR,
  PASSWORD,
  PROJECT_ID,
  RUN_ID,
  adminEmuladores,
  asegurarDirectorioEvidencia,
  huella,
  leerManifest,
  snapshotCompleto,
  tenantSpecs,
} from "./p0-10-fixture";

interface Manifest {
  schemaVersion: number;
  runId: string;
  projectId: string;
  tenants: Array<{ empresaId: string; ownerUid: string; email: string; [key: string]: unknown }>;
  snapshotDigest: string;
}

async function main(): Promise<void> {
const { auth, db } = adminEmuladores();
const manifest = leerManifest<Manifest>();
const specs = tenantSpecs();
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.runId, RUN_ID);
assert.equal(manifest.projectId, PROJECT_ID);
assert.equal(manifest.tenants.length, specs.length);

const loginResults: string[] = [];
for (const spec of specs) {
  const empresa = await db.collection("empresas").doc(spec.empresaId).get();
  assert.equal(empresa.data()?.empresaId, spec.empresaId);
  assert.equal(empresa.data()?.estado, "trial");

  const configuracion = await db.collection("configuraciones").doc(spec.empresaId).get();
  assert.equal(configuracion.data()?.empresaId, spec.empresaId);
  assert.deepEqual(configuracion.data()?.modulos?.habilitados, ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts"]);
  assert.equal(configuracion.data()?.identidadFiscal?.estado, "PENDIENTE_CONFIGURACION");

  const producto = await db.collection("productos").doc(spec.productoId).get();
  assert.equal(producto.data()?.empresaId, spec.empresaId);
  assert.equal(producto.data()?.stock, 25);

  const venta = await db.collection("ventas").doc(spec.ventaId).get();
  assert.equal(venta.data()?.empresaId, spec.empresaId);
  assert.equal(venta.data()?.modoOperacion, "DEMO");
  assert.equal(venta.data()?.estadoOperativo, "COMPLETO");
  assert.equal("snapshotFiscal" in (venta.data() ?? {}), false);

  const movimiento = await db.collection("transacciones_financieras").doc(spec.movimientoId).get();
  assert.equal(movimiento.data()?.empresaId, spec.empresaId);
  assert.equal(movimiento.data()?.ventaId, spec.ventaId);

  const miembro = await db.collection("membresias").doc(`${spec.empresaId}_${spec.ownerUid}`).get();
  assert.equal(miembro.data()?.empresaId, spec.empresaId);
  assert.equal(miembro.data()?.activo, true);

  const authUser = await auth.getUser(spec.ownerUid);
  assert.equal(authUser.email, spec.email);
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
  const login = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=p0-10-emulator`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: spec.email, password: PASSWORD, returnSecureToken: true }),
  });
  assert.equal(login.ok, true, `el usuario restaurado debe poder iniciar sesión (${spec.email})`);
  const loginBody = await login.json() as { localId?: string };
  assert.equal(loginBody.localId, spec.ownerUid);
  loginResults.push(spec.email);
}

const snapshot = await snapshotCompleto(db, specs);
assert.equal(huella(snapshot), manifest.snapshotDigest, "la huella restaurada debe coincidir con el export original");
for (const spec of specs) {
  const ventas = await db.collection("ventas").where("empresaId", "==", spec.empresaId).get();
  assert.equal(ventas.size, 1, "cada tenant debe recuperar exclusivamente su venta");
  assert.equal(ventas.docs[0].data().empresaId, spec.empresaId);
}

asegurarDirectorioEvidencia();
writeFileSync(`${EVIDENCE_DIR}/restore-verification.json`, `${JSON.stringify({
  status: "PASS",
  runId: RUN_ID,
  projectId: PROJECT_ID,
  target: "firestore-and-auth-emulator-import",
  restoredTenants: specs.map((spec) => spec.empresaId),
  loginVerifiedFor: loginResults,
  snapshotDigest: manifest.snapshotDigest,
  assertions: [
    "empresa, membresía y usuario restaurados",
    "login de Auth Emulator restaurado",
    "configuración y módulos restaurados sin datos fiscales ficticios",
    "inventario, venta DEMO y ledger restaurados",
    "aislamiento multi-tenant conservado",
    "huella de snapshot idéntica antes y después del import",
  ],
  completedAt: new Date().toISOString(),
}, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
