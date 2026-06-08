/**
 * seed-mesas.ts
 *
 * Pobla Firestore con mesas por defecto para el espacio Cafetería.
 * Proceso idempotente.
 *
 * Uso: npx tsx scripts/seed-mesas.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const MESAS = [
  { id: "mesa-1", nombre: "Mesa 1", espacioId: "cafeteria", activa: true, orden: 1 },
  { id: "mesa-2", nombre: "Mesa 2", espacioId: "cafeteria", activa: true, orden: 2 },
  { id: "mesa-3", nombre: "Mesa 3", espacioId: "cafeteria", activa: true, orden: 3 },
  { id: "mesa-4", nombre: "Mesa 4", espacioId: "cafeteria", activa: true, orden: 4 },
  { id: "barra-1", nombre: "Barra Principal", espacioId: "cafeteria", activa: true, orden: 5 },
  { id: "terraza-1", nombre: "Terraza 1", espacioId: "cafeteria", activa: true, orden: 6 },
  { id: "terraza-2", nombre: "Terraza 2", espacioId: "cafeteria", activa: true, orden: 7 },
];

async function seed() {
  console.log("🔥 Iniciando seed de mesas...\n");

  const app = initializeApp(firebaseConfig, "seed-app-mesas");
  const db = getFirestore(app);

  let creadas = 0;
  let omitidas = 0;

  for (const mesa of MESAS) {
    const docRef = doc(db, "mesas", mesa.id);
    const snap = await getDocs(
      query(collection(db, "mesas"), where("__name__", "==", mesa.id))
    );

    if (!snap.empty) {
      console.log(`  ⏭️  ${mesa.nombre} ya existe. Omitiendo.`);
      omitidas++;
    } else {
      await setDoc(docRef, { ...mesa });
      console.log(`  ✅ ${mesa.nombre} creada.`);
      creadas++;
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Mesas creadas:       ${creadas}`);
  console.log(`⏭️  Mesas omitidas:      ${omitidas}`);
  console.log("─────────────────────────────────────");
  console.log("\n🎉 Seed de mesas completado.");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error fatal en el seed:", err);
  process.exit(1);
});
