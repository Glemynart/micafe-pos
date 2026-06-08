/**
 * seed-productos.ts
 *
 * Crea ~5 productos de ejemplo por cada espacio en Firestore.
 * Proceso idempotente: no duplica si ya existen (verifica por nombre+espacioId).
 *
 * Uso: npx tsx scripts/seed-productos.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
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

interface ProductoSeed {
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  imagenUrl: null;
  categoriaId: string;
  espacioId: string;
  activo: boolean;
  descripcion: string;
  unidad: string;
  icono: string;
}

const PRODUCTOS_SEED: ProductoSeed[] = [
  // ─── Cafetería ─────────────────────────────────────────────────────────────
  {
    nombre: "Café Tinto",
    precio: 1500,
    costo: 400,
    stock: 100,
    stockMinimo: 10,
    imagenUrl: null,
    categoriaId: "cafeteria-bebidas-calientes",
    espacioId: "cafeteria",
    activo: true,
    descripcion: "Café negro tradicional colombiano",
    unidad: "taza",
    icono: "☕",
  },
  {
    nombre: "Café con Leche",
    precio: 2500,
    costo: 900,
    stock: 80,
    stockMinimo: 10,
    imagenUrl: null,
    categoriaId: "cafeteria-bebidas-calientes",
    espacioId: "cafeteria",
    activo: true,
    descripcion: "Café con leche fresca",
    unidad: "taza",
    icono: "☕",
  },
  {
    nombre: "Limonada Natural",
    precio: 3000,
    costo: 800,
    stock: 50,
    stockMinimo: 5,
    imagenUrl: null,
    categoriaId: "cafeteria-bebidas-fr-as",
    espacioId: "cafeteria",
    activo: true,
    descripcion: "Limonada fresca con hielo",
    unidad: "vaso",
    icono: "🍋",
  },
  {
    nombre: "Croissant de Mantequilla",
    precio: 4500,
    costo: 1800,
    stock: 20,
    stockMinimo: 3,
    imagenUrl: null,
    categoriaId: "cafeteria-alimentos",
    espacioId: "cafeteria",
    activo: true,
    descripcion: "Croissant artesanal con mantequilla",
    unidad: "unidad",
    icono: "🥐",
  },
  {
    nombre: "Torta de Chocolate",
    precio: 5000,
    costo: 2000,
    stock: 15,
    stockMinimo: 2,
    imagenUrl: null,
    categoriaId: "cafeteria-postres",
    espacioId: "cafeteria",
    activo: true,
    descripcion: "Porción de torta de chocolate casera",
    unidad: "porción",
    icono: "🍰",
  },

  // ─── Artesanías ────────────────────────────────────────────────────────────
  {
    nombre: "Mochila Wayuu",
    precio: 85000,
    costo: 35000,
    stock: 10,
    stockMinimo: 2,
    imagenUrl: null,
    categoriaId: "artesanias-tejidos",
    espacioId: "artesanias",
    activo: true,
    descripcion: "Mochila tejida a mano por artesanos Wayuu",
    unidad: "unidad",
    icono: "👜",
  },
  {
    nombre: "Jarrón de Barro",
    precio: 45000,
    costo: 15000,
    stock: 8,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "artesanias-cer-micas",
    espacioId: "artesanias",
    activo: true,
    descripcion: "Jarrón decorativo de barro cocido",
    unidad: "unidad",
    icono: "🏺",
  },
  {
    nombre: "Cuadro Paisaje Andino",
    precio: 120000,
    costo: 40000,
    stock: 5,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "artesanias-pinturas",
    espacioId: "artesanias",
    activo: true,
    descripcion: "Pintura al óleo de paisaje andino colombiano",
    unidad: "unidad",
    icono: "🖼️",
  },
  {
    nombre: "Collar de Semillas",
    precio: 25000,
    costo: 8000,
    stock: 20,
    stockMinimo: 3,
    imagenUrl: null,
    categoriaId: "artesanias-bisutera",
    espacioId: "artesanias",
    activo: true,
    descripcion: "Collar artesanal de semillas naturales",
    unidad: "unidad",
    icono: "📿",
  },
  {
    nombre: "Tapete de Fique",
    precio: 55000,
    costo: 20000,
    stock: 6,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "artesanias-tejidos",
    espacioId: "artesanias",
    activo: true,
    descripcion: "Tapete tejido en fibra de fique",
    unidad: "unidad",
    icono: "🧶",
  },

  // ─── Librería ──────────────────────────────────────────────────────────────
  {
    nombre: "Cuaderno Universitario 100h",
    precio: 8500,
    costo: 4000,
    stock: 50,
    stockMinimo: 10,
    imagenUrl: null,
    categoriaId: "libreria-tiles-escolares",
    espacioId: "libreria",
    activo: true,
    descripcion: "Cuaderno universitario cuadriculado 100 hojas",
    unidad: "unidad",
    icono: "📓",
  },
  {
    nombre: "Esfero Azul BIC",
    precio: 1500,
    costo: 600,
    stock: 100,
    stockMinimo: 20,
    imagenUrl: null,
    categoriaId: "libreria-tiles-escolares",
    espacioId: "libreria",
    activo: true,
    descripcion: "Esfero azul BIC cristal",
    unidad: "unidad",
    icono: "✒️",
  },
  {
    nombre: "Resma Papel Bond 75g",
    precio: 18000,
    costo: 12000,
    stock: 30,
    stockMinimo: 5,
    imagenUrl: null,
    categoriaId: "libreria-papelera",
    espacioId: "libreria",
    activo: true,
    descripcion: "Resma de papel bond 75g - 500 hojas",
    unidad: "resma",
    icono: "📄",
  },
  {
    nombre: "Libro Cien Años de Soledad",
    precio: 38000,
    costo: 18000,
    stock: 5,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "libreria-libros",
    espacioId: "libreria",
    activo: true,
    descripcion: "Gabriel García Márquez - edición bolsillo",
    unidad: "unidad",
    icono: "📚",
  },
  {
    nombre: "Revista Semana",
    precio: 12000,
    costo: 8000,
    stock: 10,
    stockMinimo: 2,
    imagenUrl: null,
    categoriaId: "libreria-revistas",
    espacioId: "libreria",
    activo: true,
    descripcion: "Revista Semana edición actual",
    unidad: "unidad",
    icono: "📰",
  },

  // ─── Fotocopias ────────────────────────────────────────────────────────────
  {
    nombre: "Fotocopia Simple (B/N)",
    precio: 100,
    costo: 30,
    stock: 9999,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "fotocopias-copias",
    espacioId: "fotocopias",
    activo: true,
    descripcion: "Fotocopia en blanco y negro tamaño carta",
    unidad: "hoja",
    icono: "📄",
  },
  {
    nombre: "Fotocopia a Color",
    precio: 500,
    costo: 200,
    stock: 9999,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "fotocopias-copias",
    espacioId: "fotocopias",
    activo: true,
    descripcion: "Fotocopia a color tamaño carta",
    unidad: "hoja",
    icono: "🖨️",
  },
  {
    nombre: "Impresión Documento Word",
    precio: 200,
    costo: 60,
    stock: 9999,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "fotocopias-impresiones",
    espacioId: "fotocopias",
    activo: true,
    descripcion: "Impresión de documento en blanco y negro",
    unidad: "hoja",
    icono: "🖨️",
  },
  {
    nombre: "Encuadernado Argollado",
    precio: 8000,
    costo: 3000,
    stock: 200,
    stockMinimo: 20,
    imagenUrl: null,
    categoriaId: "fotocopias-encuadernado",
    espacioId: "fotocopias",
    activo: true,
    descripcion: "Encuadernado con argolla metálica y tapa plástica",
    unidad: "trabajo",
    icono: "📋",
  },
  {
    nombre: "Plastificado Carné",
    precio: 2000,
    costo: 500,
    stock: 500,
    stockMinimo: 50,
    imagenUrl: null,
    categoriaId: "fotocopias-plastificado",
    espacioId: "fotocopias",
    activo: true,
    descripcion: "Plastificado tamaño carné (ambos lados)",
    unidad: "unidad",
    icono: "🗂️",
  },

  // ─── Alquiler ──────────────────────────────────────────────────────────────
  {
    nombre: "Alquiler Salón 1 hora",
    precio: 50000,
    costo: 10000,
    stock: 1,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "alquiler-saln-principal",
    espacioId: "alquiler",
    activo: true,
    descripcion: "Alquiler del salón principal por hora (cap. 30 personas)",
    unidad: "hora",
    icono: "🏛️",
  },
  {
    nombre: "Alquiler Sala de Reuniones",
    precio: 30000,
    costo: 8000,
    stock: 1,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "alquiler-sala-de-reuniones",
    espacioId: "alquiler",
    activo: true,
    descripcion: "Sala de reuniones con TV y videoconferencia (cap. 10)",
    unidad: "hora",
    icono: "🤝",
  },
  {
    nombre: "Alquiler Proyector",
    precio: 20000,
    costo: 2000,
    stock: 2,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "alquiler-equipos",
    espacioId: "alquiler",
    activo: true,
    descripcion: "Proyector HD con pantalla incluida",
    unidad: "hora",
    icono: "📽️",
  },
  {
    nombre: "Alquiler Computador",
    precio: 5000,
    costo: 500,
    stock: 5,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "alquiler-equipos",
    espacioId: "alquiler",
    activo: true,
    descripcion: "Computador portátil con acceso a internet",
    unidad: "hora",
    icono: "💻",
  },
  {
    nombre: "Paquete Evento 4 horas",
    precio: 180000,
    costo: 40000,
    stock: 1,
    stockMinimo: 0,
    imagenUrl: null,
    categoriaId: "alquiler-saln-principal",
    espacioId: "alquiler",
    activo: true,
    descripcion: "Paquete completo: salón + proyector + sonido por 4 horas",
    unidad: "paquete",
    icono: "🎉",
  },

  // ─── Consignación ──────────────────────────────────────────────────────────
  {
    nombre: "Mermelada Artesanal Mora",
    precio: 12000,
    costo: 6000,
    stock: 15,
    stockMinimo: 3,
    imagenUrl: null,
    categoriaId: "consignacion-productores",
    espacioId: "consignacion",
    activo: true,
    descripcion: "Mermelada de mora artesanal en frasco de 250g",
    unidad: "frasco",
    icono: "🫙",
  },
  {
    nombre: "Tejido a Crochet (mantel)",
    precio: 65000,
    costo: 30000,
    stock: 4,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "consignacion-artesanos-locales",
    espacioId: "consignacion",
    activo: true,
    descripcion: "Mantel tejido a crochet 60x60 cm",
    unidad: "unidad",
    icono: "🧶",
  },
  {
    nombre: "Camiseta Estampada Local",
    precio: 35000,
    costo: 15000,
    stock: 12,
    stockMinimo: 2,
    imagenUrl: null,
    categoriaId: "consignacion-ropa",
    espacioId: "consignacion",
    activo: true,
    descripcion: "Camiseta con diseño de artista local",
    unidad: "unidad",
    icono: "👕",
  },
  {
    nombre: "Miel de Abeja 500ml",
    precio: 22000,
    costo: 12000,
    stock: 10,
    stockMinimo: 2,
    imagenUrl: null,
    categoriaId: "consignacion-productores",
    espacioId: "consignacion",
    activo: true,
    descripcion: "Miel de abejas pura de productor local",
    unidad: "frasco",
    icono: "🍯",
  },
  {
    nombre: "Bolso de Cuero Artesanal",
    precio: 95000,
    costo: 45000,
    stock: 3,
    stockMinimo: 1,
    imagenUrl: null,
    categoriaId: "consignacion-artesanos-locales",
    espacioId: "consignacion",
    activo: true,
    descripcion: "Bolso de cuero curtido a mano por artesano local",
    unidad: "unidad",
    icono: "👝",
  },
];

// ─── Script Principal ─────────────────────────────────────────────────────────

async function seed() {
  console.log("🔥 Iniciando seed de productos...\n");

  const app = initializeApp(firebaseConfig, "seed-app-productos");
  const db = getFirestore(app);

  let creados = 0;
  let omitidos = 0;
  let errores = 0;

  for (const producto of PRODUCTOS_SEED) {
    try {
      // Verificar si ya existe un producto con el mismo nombre y espacioId
      const q = query(
        collection(db, "productos"),
        where("nombre", "==", producto.nombre),
        where("espacioId", "==", producto.espacioId)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        console.log(`  ⏭️  "${producto.nombre}" [${producto.espacioId}] ya existe.`);
        omitidos++;
        continue;
      }

      await addDoc(collection(db, "productos"), {
        ...producto,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      console.log(`  ✅ "${producto.nombre}" [${producto.espacioId}] creado.`);
      creados++;
    } catch (error) {
      console.error(`  ❌ Error al crear "${producto.nombre}":`, error);
      errores++;
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Creados:  ${creados}`);
  console.log(`⏭️  Omitidos: ${omitidos} (ya existían)`);
  console.log(`❌ Errores:  ${errores}`);
  console.log("─────────────────────────────────────");
  console.log("\n🎉 Seed de productos completado.");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error fatal en el seed:", err);
  process.exit(1);
});
