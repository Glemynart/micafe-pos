/**
 * MT-U5B Bloque 1 — backfill y gate de preparación de membresías.
 *
 * `--verify` es solo lectura y exige consistencia entre usuarios, plantillas,
 * membresías y Firebase Authentication antes del cambio de autoridad.
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config({ path: ".env.local" });

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION } from "../lib/empresas-service";
import { MEMBRESIAS_COLLECTION, ROLES_MEMBRESIA, type RolMembresia } from "../lib/membresias-service";
import { planificarPreparacionMembresias, type MembresiaPreparacion, type UsuarioPreparacion } from "../lib/membresias-preparacion";

const VERIFY = process.argv.includes("--verify");
const EXECUTE = process.argv.includes("--execute") && !process.argv.includes("--dry-run") && !VERIFY;
const BATCH_LIMIT = 500;

function cargarServiceAccount(): unknown {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline?.trim()) {
    try { return JSON.parse(inline); } catch { /* intenta archivo */ }
  }
  for (const candidate of [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, process.env.GOOGLE_APPLICATION_CREDENTIALS, "./service-account.local.json"].filter(Boolean) as string[]) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8"));
  }
  throw new Error("No se encontró el service account (env inline o archivo).");
}

if (!getApps().length) initializeApp({ credential: cert(cargarServiceAccount() as Parameters<typeof cert>[0]) });
const db = getFirestore();

async function resolverEmpresaFundacional(): Promise<string> {
  const snap = await db.collection(EMPRESAS_COLLECTION).where("esFundacional", "==", true).limit(2).get();
  if (snap.size !== 1) throw new Error(`Se esperaba exactamente una empresa fundacional y se encontraron ${snap.size}.`);
  return snap.docs[0].id;
}

async function identidadesInexistentes(uids: readonly string[]): Promise<string[]> {
  const faltantes: string[] = [];
  for (let inicio = 0; inicio < uids.length; inicio += 100) {
    const resultado = await getAuth().getUsers(uids.slice(inicio, inicio + 100).map((uid) => ({ uid })));
    for (const identidad of resultado.notFound) {
      if ("uid" in identidad && typeof identidad.uid === "string") faltantes.push(identidad.uid);
    }
  }
  return faltantes;
}

function imprimirReporte(reporte: { modo: string; empresaId: string | null; creadas: string[]; actualizadas: string[]; sinCambios: string[]; errores: string[] }): void {
  console.log("=".repeat(78));
  console.log(`MT-U5B Bloque 1 — ${reporte.modo}`);
  console.log(`Empresa fundacional: ${reporte.empresaId ?? "(no resuelta)"}`);
  console.log(`Creadas: ${reporte.creadas.length}; actualizadas: ${reporte.actualizadas.length}; sin cambios: ${reporte.sinCambios.length}`);
  for (const error of reporte.errores) console.log(`  - ${error}`);
  console.log(`Resultado: ${reporte.errores.length ? "FAILED" : "SUCCESS"}`);
  console.log("=".repeat(78));
}

async function main(): Promise<void> {
  const reporte = { modo: EXECUTE ? "EXECUTE" : VERIFY ? "VERIFY" : "DRY-RUN", empresaId: null as string | null, creadas: [] as string[], actualizadas: [] as string[], sinCambios: [] as string[], errores: [] as string[] };
  try {
    const empresaId = await resolverEmpresaFundacional();
    reporte.empresaId = empresaId;
    const usuariosSnap = await db.collection("usuarios").get();
    const usuarios: UsuarioPreparacion[] = usuariosSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
    const [membresiasSnap, ...plantillasSnap] = await Promise.all([
      db.collection(MEMBRESIAS_COLLECTION).where("empresaId", "==", empresaId).get(),
      ...ROLES_MEMBRESIA.map((rol) => db.collection("permisos_roles").doc(rol).get()),
    ]);
    const directas = await Promise.all(usuarios.map((usuario) => db.collection(MEMBRESIAS_COLLECTION).doc(`${empresaId}_${usuario.uid}`).get()));
    const membresias = new Map<string, MembresiaPreparacion>();
    for (const doc of [...membresiasSnap.docs, ...directas.filter((doc) => doc.exists)]) membresias.set(doc.id, { id: doc.id, data: doc.data() ?? {} });
    const plantillas = new Map<RolMembresia, unknown>();
    ROLES_MEMBRESIA.forEach((rol, index) => { if (plantillasSnap[index].exists) plantillas.set(rol, plantillasSnap[index].data()?.permisos); });
    const plan = planificarPreparacionMembresias({ empresaId, usuarios, plantillas, membresias: [...membresias.values()], identidadesInexistentes: await identidadesInexistentes(usuarios.map((usuario) => usuario.uid)) });
    reporte.creadas = plan.creadas;
    reporte.actualizadas = plan.actualizadas;
    reporte.sinCambios = plan.sinCambios;
    reporte.errores.push(...plan.errores);
    if (VERIFY && (plan.creadas.length || plan.actualizadas.length)) reporte.errores.push(`La empresa no está lista: faltan ${plan.creadas.length} membresías y ${plan.actualizadas.length} requieren sincronización.`);
    if (reporte.errores.length) { imprimirReporte(reporte); process.exitCode = 1; return; }
    if (EXECUTE) {
      let batch = db.batch(); let operaciones = 0;
      for (const uid of [...plan.creadas, ...plan.actualizadas]) {
        const esperada = plan.esperadas.get(uid)!;
        const ref = db.collection(MEMBRESIAS_COLLECTION).doc(`${empresaId}_${uid}`);
        const existente = await ref.get();
        batch.set(ref, { empresaId, ...esperada, creadaEn: existente.data()?.creadaEn ?? FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() }, { merge: true });
        if (++operaciones === BATCH_LIMIT) { await batch.commit(); batch = db.batch(); operaciones = 0; }
      }
      if (operaciones) await batch.commit();
    }
    imprimirReporte(reporte);
  } catch (error) {
    reporte.errores.push(error instanceof Error ? error.message : "Error inesperado.");
    imprimirReporte(reporte); process.exitCode = 1;
  }
}

void main();
