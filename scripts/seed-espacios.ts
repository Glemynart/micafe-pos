/**
 * seed-espacios.ts
 *
 * Pobla Firestore con los 6 espacios del negocio MiCafe y sus categorías.
 * Proceso idempotente: no duplica si ya existen.
 *
 * Uso: npx tsx scripts/seed-espacios.ts
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
  serverTimestamp,
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

// ─── Datos de Seed ────────────────────────────────────────────────────────────

interface EspacioSeed {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
  categorias: { nombre: string; icono: string; orden: number }[];
}

const ESPACIOS_SEED: EspacioSeed[] = [
  {
    id: "cafeteria",
    nombre: "Cafetería",
    icono: "Coffee",
    color: "#92400E",   // amber-800
    orden: 1,
    categorias: [
      { nombre: "Bebidas Calientes", icono: "Coffee", orden: 1 },
      { nombre: "Bebidas Frías", icono: "CupSoda", orden: 2 },
      { nombre: "Alimentos", icono: "Croissant", orden: 3 },
      { nombre: "Postres", icono: "CakeSlice", orden: 4 },
    ],
  },
  {
    id: "artesanias",
    nombre: "Artesanías",
    icono: "Brush",
    color: "#7C3AED",   // violet-700
    orden: 2,
    categorias: [
      { nombre: "Tejidos", icono: "Shirt", orden: 1 },
      { nombre: "Cerámicas", icono: "Coffee", orden: 2 },
      { nombre: "Pinturas", icono: "Image", orden: 3 },
      { nombre: "Bisutería", icono: "Gem", orden: 4 },
    ],
  },
  {
    id: "libreria",
    nombre: "Librería",
    icono: "Book",
    color: "#1D4ED8",   // blue-700
    orden: 3,
    categorias: [
      { nombre: "Libros", icono: "BookOpen", orden: 1 },
      { nombre: "Útiles Escolares", icono: "Pen", orden: 2 },
      { nombre: "Papelería", icono: "FileText", orden: 3 },
      { nombre: "Revistas", icono: "Newspaper", orden: 4 },
    ],
  },
  {
    id: "fotocopias",
    nombre: "Fotocopias",
    icono: "Printer",
    color: "#0F766E",   // teal-700
    orden: 4,
    categorias: [
      { nombre: "Impresiones", icono: "Printer", orden: 1 },
      { nombre: "Copias", icono: "Copy", orden: 2 },
      { nombre: "Encuadernado", icono: "BookOpen", orden: 3 },
      { nombre: "Plastificado", icono: "Layers", orden: 4 },
    ],
  },
  {
    id: "alquiler",
    nombre: "Alquiler",
    icono: "Building",
    color: "#B45309",   // amber-700
    orden: 5,
    categorias: [
      { nombre: "Salón Principal", icono: "Store", orden: 1 },
      { nombre: "Sala de Reuniones", icono: "Users", orden: 2 },
      { nombre: "Equipos", icono: "Laptop", orden: 3 },
    ],
  },
  {
    id: "consignacion",
    nombre: "Consignación",
    icono: "Handshake",
    color: "#047857",   // emerald-700
    orden: 6,
    categorias: [
      { nombre: "Artesanos Locales", icono: "User", orden: 1 },
      { nombre: "Productores", icono: "Leaf", orden: 2 },
      { nombre: "Ropa", icono: "Shirt", orden: 3 },
    ],
  },
];

// ─── Script Principal ─────────────────────────────────────────────────────────

async function seed() {
  console.log("🔥 Iniciando seed de espacios y categorías...\n");

  const app = initializeApp(firebaseConfig, "seed-app-espacios");
  const db = getFirestore(app);

  let espaciosCreados = 0;
  let espaciosOmitidos = 0;
  let categoriasCreadas = 0;
  let categoriasOmitidas = 0;

  for (const espacio of ESPACIOS_SEED) {
    console.log(`\n📦 Procesando espacio: ${espacio.icono} ${espacio.nombre}`);

    // Verificar si el espacio ya existe
    const espacioRef = doc(db, "espacios", espacio.id);
    const espacioSnap = await getDocs(
      query(collection(db, "espacios"), where("__name__", "==", espacio.id))
    );

    if (!espacioSnap.empty) {
      console.log(`  ⏭️  Espacio ya existe. Omitiendo.`);
      espaciosOmitidos++;
    } else {
      await setDoc(espacioRef, {
        nombre: espacio.nombre,
        icono: espacio.icono,
        color: espacio.color,
        activo: true,
        orden: espacio.orden,
        creadoEn: serverTimestamp(),
      });
      console.log(`  ✅ Espacio creado.`);
      espaciosCreados++;
    }

    // Categorías del espacio
    for (const cat of espacio.categorias) {
      const catId = `${espacio.id}-${cat.nombre.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
      const catRef = doc(db, "categorias", catId);
      const catSnap = await getDocs(
        query(collection(db, "categorias"), where("__name__", "==", catId))
      );

      if (!catSnap.empty) {
        console.log(`  ⏭️  Categoría "${cat.nombre}" ya existe.`);
        categoriasOmitidas++;
      } else {
        await setDoc(catRef, {
          nombre: cat.nombre,
          icono: cat.icono,
          espacioId: espacio.id,
          activo: true,
          orden: cat.orden,
          creadoEn: serverTimestamp(),
        });
        console.log(`  ✅ Categoría "${cat.nombre}" creada. (ID: ${catId})`);
        categoriasCreadas++;
      }
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Espacios creados:       ${espaciosCreados}`);
  console.log(`⏭️  Espacios omitidos:      ${espaciosOmitidos}`);
  console.log(`✅ Categorías creadas:     ${categoriasCreadas}`);
  console.log(`⏭️  Categorías omitidas:   ${categoriasOmitidas}`);
  console.log("─────────────────────────────────────");
  console.log("\n🎉 Seed de espacios completado.");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error fatal en el seed:", err);
  process.exit(1);
});
