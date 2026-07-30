/**
 * Regulariza exclusivamente `configuraciones/1ae0rD9H8t3ZFSBKrrHR`.
 *
 * Uso desde la raíz:
 *   npx tsx functions/src/configuracion/migrar-fundacional-cli.ts             # dry-run
 *   npx tsx functions/src/configuracion/migrar-fundacional-cli.ts --execute   # ejecuta
 *
 * Este archivo vive en Functions para compartir la misma instancia de
 * firebase-admin que el inicializador B1 y evitar serializaciones cruzadas.
 */

import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  EMPRESA_FUNDACIONAL_ID,
  migrarConfiguracionEmpresaFundacional,
} from "./fundacional-migration";
import { leerConfiguracionEmpresa } from "./service";

dotenv.config({ path: ".env.local" });

const ejecutar = process.argv.includes("--execute") && !process.argv.includes("--dry-run");

function cargarCuentaServicio(): object {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline) as object;
    } catch {
      // Se intenta la fuente de archivo habitual sin exponer secretos.
    }
  }

  const rutas = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    "./service-account.local.json",
  ].filter((ruta): ruta is string => Boolean(ruta));
  for (const ruta of rutas) {
    if (fs.existsSync(ruta)) return JSON.parse(fs.readFileSync(ruta, "utf8")) as object;
  }
  throw new Error("No se encontró un service account para ejecutar la migración.");
}

async function main(): Promise<void> {
  if (!getApps().length) initializeApp({ credential: cert(cargarCuentaServicio()) });
  const db = getFirestore();
  const empresaRef = db.collection("empresas").doc(EMPRESA_FUNDACIONAL_ID);
  const configuracionRef = db.collection("configuraciones").doc(EMPRESA_FUNDACIONAL_ID);
  const [empresa, configuracion] = await Promise.all([empresaRef.get(), configuracionRef.get()]);

  if (!empresa.exists) throw new Error(`No existe empresas/${EMPRESA_FUNDACIONAL_ID}.`);

  console.log(`Tenant fundacional: ${EMPRESA_FUNDACIONAL_ID}`);
  console.log(`Configuración B1 existente: ${configuracion.exists ? "sí (no-op)" : "no"}`);
  if (!ejecutar) {
    console.log("DRY-RUN: no se escribió nada. Use --execute para regularizar el documento ausente.");
    return;
  }

  const resultado = await migrarConfiguracionEmpresaFundacional(db);
  const configuracionFinal = await leerConfiguracionEmpresa(db, EMPRESA_FUNDACIONAL_ID);
  console.log(resultado.creada ? "Configuración B1 creada." : "Configuración B1 ya existía; no se modificó.");
  console.log(`Verificada: revision=${configuracionFinal.revision}, schemaVersion=${configuracionFinal.schemaVersion}.`);
}

main().catch((error) => {
  console.error("Error de migración:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
