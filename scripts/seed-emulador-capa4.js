/**
 * Semilla del entorno de validación funcional (Capa 4, ADR-SAAS-013).
 *
 * SOLO EMULADORES. Aborta si no detecta los hosts de emulador, para que nunca
 * pueda ejecutarse por accidente contra el proyecto real: crea un operador de
 * plataforma mediante un bootstrap irrepetible, y eso en producción se gasta
 * una única vez.
 *
 * Uso (desde la raíz del repo, con los emuladores arriba):
 *   node scripts/seed-emulador-capa4.js
 */

const FIRESTORE_HOST = "127.0.0.1:8085";
const AUTH_HOST = "127.0.0.1:9099";
const PROJECT_ID = "micafe-pos";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const OPERADOR = {
  uid: "operador-e2e-capa4",
  email: "operador@e2e.local",
  password: "Emulador-2026",
};
const PLAN = { planId: "plan_profesional", planVersion: 1 };

// El SDK debe resolverse desde `functions/node_modules`, no desde la raíz: el
// código compilado de functions usa esa copia, y los sentinels (FieldValue.
// serverTimestamp) solo son válidos dentro de la instancia que los creó.
const { createRequire } = require("node:module");
const path = require("node:path");
const requireFunctions = createRequire(
  path.join(__dirname, "..", "functions", "package.json"),
);

const { initializeApp } = requireFunctions("firebase-admin/app");
const { getAuth } = requireFunctions("firebase-admin/auth");
const { getFirestore } = requireFunctions("firebase-admin/firestore");
const {
  bootstrapOperadorInicial,
} = require("../functions/lib/functions/src/platform/initial-bootstrap");
const {
  FACULTADES_PLATAFORMA,
} = require("../functions/lib/functions/src/platform/contracts");
const {
  OPERADORES_COLLECTION,
} = require("../functions/lib/functions/src/platform/authorization");

async function main() {
  initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  // Verificación de vida: si los emuladores no están arriba, esto falla aquí y
  // no a mitad del seed.
  await db.collection("_seed_ping").doc("ping").set({ at: Date.now() });
  await db.collection("_seed_ping").doc("ping").delete();

  try {
    await auth.getUser(OPERADOR.uid);
    console.log(`· operador ${OPERADOR.uid} ya existe en Auth`);
  } catch {
    await auth.createUser({
      uid: OPERADOR.uid,
      email: OPERADOR.email,
      password: OPERADOR.password,
      displayName: "Operador E2E Capa 4",
    });
    console.log(`✓ operador creado en Auth: ${OPERADOR.email}`);
  }

  const yaOperador = await db.collection(OPERADORES_COLLECTION).doc(OPERADOR.uid).get();
  if (yaOperador.exists) {
    console.log("· operadores_plataforma ya sembrado (bootstrap irrepetible ya consumido)");
  } else {
    const resultado = await bootstrapOperadorInicial(
      db,
      { uid: OPERADOR.uid, facultades: [...FACULTADES_PLATAFORMA] },
      auth,
    );
    console.log(`✓ operador de plataforma: ${JSON.stringify(resultado)}`);
  }

  const planRef = db
    .collection("planes")
    .doc(PLAN.planId)
    .collection("versiones")
    .doc(String(PLAN.planVersion));
  await planRef.set({
    schemaVersion: 1,
    planId: PLAN.planId,
    codigo: "PROFESIONAL",
    planVersion: PLAN.planVersion,
    estado: "PUBLICADA",
    capacidades: ["POS", "INVENTARIO"],
    limites: { usuarios: { unidad: "USUARIOS", valor: 10 } },
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
  });
  console.log(`✓ plan publicado: ${PLAN.planId} v${PLAN.planVersion}`);

  // El paso de membresía inicial resuelve los permisos del rol contra esta
  // plantilla (`permisosPredeterminados`, functions/src/operational-auth.ts).
  // Sin ella el bootstrap aborta con "La plantilla de permisos no está
  // disponible."
  await db.collection("permisos_roles").doc("admin").set({
    permisos: ["configuracion", "pos", "inventario", "ventas", "usuarios", "reportes"],
  });
  console.log("✓ plantilla de permisos sembrada: permisos_roles/admin");

  console.log("\nEntra al Backoffice en /backoffice/login con:");
  console.log(`  email:    ${OPERADOR.email}`);
  console.log(`  password: ${OPERADOR.password}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
