/**
 * Corrige la plantilla canónica `permisos_roles/admin` y sanea snapshots
 * `permisosEfectivos` de incorporaciones DIRECTA emitidas con la plantilla
 * legacy incompleta (faltaba `cuentas_cobro`).
 *
 * Uso:
 *   tsx scripts/sync-admin-permissions-template.ts --verify
 *   tsx scripts/sync-admin-permissions-template.ts --execute
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config({ path: ".env.local" });

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  ADMIN_PERMISOS_CANONICOS,
  diagnosticarPermisosAdmin,
  normalizarPermisos,
  resolverPoliticaPlantillaAdmin,
} from "./lib/admin-permissions-template";

const VERIFY = process.argv.includes("--verify");
const EXECUTE = process.argv.includes("--execute") && !VERIFY && !process.argv.includes("--dry-run");
const PAGE_SIZE = 500;
const ESTADOS_SANEABLES = new Set(["TEMP_CREDENTIAL", "ACTIVE"]);

function cargarServiceAccount(): unknown {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline?.trim()) {
    try { return JSON.parse(inline); } catch { /* intenta archivo */ }
  }
  for (const candidate of [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    "./service-account.local.json",
    "./micafe-pos-firebase-adminsdk-fbsvc-643a7af602.json",
  ].filter(Boolean) as string[]) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8"));
  }
  throw new Error("No se encontró el service account (env inline o archivo).");
}

if (!getApps().length) initializeApp({ credential: cert(cargarServiceAccount() as Parameters<typeof cert>[0]) });
const db = getFirestore();

type Hallazgo = {
  incorporacionId: string;
  empresaId: string | null;
  uid: string | null;
  estado: string | null;
  diagnostico: string;
  permisos: string[] | null;
};

type Reporte = {
  modo: "VERIFY" | "EXECUTE" | "DRY-RUN";
  plantillaAdmin: {
    diagnostico: string;
    politica: string;
    permisosActuales: string[] | null;
    requiereActualizacion: boolean;
  };
  saneables: Hallazgo[];
  anomalias: Hallazgo[];
  errores: string[];
};

function imprimirReporte(reporte: Reporte): void {
  console.log("=".repeat(88));
  console.log(`SYNC ADMIN TEMPLATE — ${reporte.modo}`);
  console.log(`Plantilla admin: ${reporte.plantillaAdmin.diagnostico}; política: ${reporte.plantillaAdmin.politica}; requiere actualización: ${reporte.plantillaAdmin.requiereActualizacion}`);
  console.log(`Snapshots saneables: ${reporte.saneables.length}`);
  console.log(`Anomalías admin no saneadas automáticamente: ${reporte.anomalias.length}`);
  if (reporte.saneables.length) {
    console.log("  Incorporaciones a corregir:");
    for (const hallazgo of reporte.saneables) {
      console.log(`  - ${hallazgo.incorporacionId} | empresa=${hallazgo.empresaId ?? "?"} | uid=${hallazgo.uid ?? "?"} | estado=${hallazgo.estado ?? "?"}`);
    }
  }
  if (reporte.anomalias.length) {
    console.log("  Anomalías detectadas:");
    for (const hallazgo of reporte.anomalias) {
      console.log(`  - ${hallazgo.incorporacionId} | diag=${hallazgo.diagnostico} | empresa=${hallazgo.empresaId ?? "?"} | uid=${hallazgo.uid ?? "?"} | estado=${hallazgo.estado ?? "?"}`);
    }
  }
  for (const error of reporte.errores) console.log(`  ! ${error}`);
  console.log(`Resultado: ${reporte.errores.length ? "FAILED" : "SUCCESS"}`);
  console.log("=".repeat(88));
}

async function recopilarIncorporacionesAdmin(): Promise<{ saneables: Hallazgo[]; anomalias: Hallazgo[] }> {
  const saneables: Hallazgo[] = [];
  const anomalias: Hallazgo[] = [];
  let cursor: string | null = null;

  while (true) {
    let query = db.collection("incorporaciones")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (!snap.size) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      cursor = doc.id;
      if (data.mecanismo !== "DIRECTA") continue;
      if (data.rol !== "admin") continue;
      if (data.origen !== "PLATAFORMA") continue;
      if (!ESTADOS_SANEABLES.has(data.estado)) continue;

      const diagnostico = diagnosticarPermisosAdmin(data.permisosEfectivos);
      if (diagnostico === "CANONICO") continue;
      const hallazgo: Hallazgo = {
        incorporacionId: doc.id,
        empresaId: typeof data.empresaId === "string" ? data.empresaId : null,
        uid: typeof data.uid === "string" ? data.uid : null,
        estado: typeof data.estado === "string" ? data.estado : null,
        diagnostico,
        permisos: normalizarPermisos(data.permisosEfectivos),
      };
      if (diagnostico === "LEGACY_SIN_CUENTAS_COBRO") saneables.push(hallazgo);
      else anomalias.push(hallazgo);
    }

    if (snap.size < PAGE_SIZE) break;
  }

  return { saneables, anomalias };
}

async function main(): Promise<void> {
  const reporte: Reporte = {
    modo: EXECUTE ? "EXECUTE" : VERIFY ? "VERIFY" : "DRY-RUN",
    plantillaAdmin: {
      diagnostico: "INVALIDO",
      politica: "REVISION_MANUAL",
      permisosActuales: null,
      requiereActualizacion: false,
    },
    saneables: [],
    anomalias: [],
    errores: [],
  };

  try {
    const plantillaRef = db.collection("permisos_roles").doc("admin");
    const plantillaSnap = await plantillaRef.get();
    reporte.plantillaAdmin.permisosActuales = normalizarPermisos(plantillaSnap.data()?.permisos);
    reporte.plantillaAdmin.diagnostico = diagnosticarPermisosAdmin(plantillaSnap.data()?.permisos);
    reporte.plantillaAdmin.politica = resolverPoliticaPlantillaAdmin(
      reporte.plantillaAdmin.diagnostico as "CANONICO" | "LEGACY_SIN_CUENTAS_COBRO" | "INVALIDO" | "OTRO",
    );
    reporte.plantillaAdmin.requiereActualizacion = reporte.plantillaAdmin.politica === "AUTOCORREGIR_LEGACY";

    const { saneables, anomalias } = await recopilarIncorporacionesAdmin();
    reporte.saneables = saneables;
    reporte.anomalias = anomalias;

    if (reporte.plantillaAdmin.politica === "REVISION_MANUAL") {
      reporte.errores.push("La plantilla permisos_roles/admin presenta un drift no saneable automáticamente; requiere revisión manual.");
    }
    if (VERIFY && (reporte.plantillaAdmin.requiereActualizacion || reporte.saneables.length || reporte.anomalias.length)) {
      reporte.errores.push("Se detectaron divergencias en la plantilla admin o en snapshots emitidos.");
    }
    if (reporte.anomalias.length) {
      reporte.errores.push("Existen incorporaciones admin con drift distinto del caso legacy esperado; revisar manualmente antes de ejecutar.");
    }
    if (reporte.errores.length) {
      imprimirReporte(reporte);
      process.exitCode = 1;
      return;
    }

    if (EXECUTE) {
      const escrituras: Array<Promise<unknown>> = [];
      if (reporte.plantillaAdmin.politica === "AUTOCORREGIR_LEGACY") {
        escrituras.push(plantillaRef.set({
          rol: "admin",
          permisos: ADMIN_PERMISOS_CANONICOS,
          actualizadoEn: FieldValue.serverTimestamp(),
        }, { merge: true }));
      }

      let batch = db.batch();
      let pending = 0;
      for (const hallazgo of reporte.saneables) {
        batch.update(db.collection("incorporaciones").doc(hallazgo.incorporacionId), {
          permisosEfectivos: ADMIN_PERMISOS_CANONICOS,
          actualizadaEn: FieldValue.serverTimestamp(),
        });
        pending++;
        if (pending === 400) {
          escrituras.push(batch.commit());
          batch = db.batch();
          pending = 0;
        }
      }
      if (pending) escrituras.push(batch.commit());
      if (escrituras.length) await Promise.all(escrituras);
    }

    imprimirReporte(reporte);
  } catch (error) {
    reporte.errores.push(error instanceof Error ? error.message : "Error inesperado.");
    imprimirReporte(reporte);
    process.exitCode = 1;
  }
}

void main();
