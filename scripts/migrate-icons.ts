import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const emojiToIcon: Record<string, string> = {
  // Espacios
  "☕": "Coffee",
  "🎨": "Brush",
  "📚": "Book",
  "📄": "Printer",
  "🏢": "Building",
  "🤝": "Handshake",
  // Categorias y Productos
  "🧃": "CupSoda",
  "🥐": "Croissant",
  "🍰": "CakeSlice",
  "🧶": "Shirt",
  "🏺": "Coffee",
  "🖼️": "Image",
  "💍": "Gem",
  "📖": "BookOpen",
  "✏️": "Pen",
  "📝": "FileText",
  "📰": "Newspaper",
  "🖨️": "Printer",
  "📋": "BookOpen",
  "🗂️": "Layers",
  "🏛️": "Store",
  "💻": "Laptop",
  "🧑‍🎨": "User",
  "🌱": "Leaf",
  "👕": "Shirt",
  "🥛": "CupSoda",
  "🍫": "IceCream",
  "🥪": "Sandwich",
  "🧁": "CakeSlice",
  "🍳": "Utensils",
  "🍽️": "Utensils",
  "💧": "GlassWater",
  "📦": "Package"
};

async function migrate() {
  console.log("🔥 Iniciando migración de emojis a iconos...");
  const app = initializeApp(firebaseConfig, "migration-app");
  const db = getFirestore(app);

  const collections = ["espacios", "categorias", "productos"];

  for (const colName of collections) {
    const snap = await getDocs(collection(db, colName));
    let updated = 0;
    
    for (const d of snap.docs) {
      const data = d.data();
      if (data.icono && emojiToIcon[data.icono]) {
        await updateDoc(doc(db, colName, d.id), {
          icono: emojiToIcon[data.icono]
        });
        updated++;
      }
    }
    console.log(`✅ Colección ${colName}: ${updated} documentos actualizados.`);
  }

  console.log("🎉 Migración completada.");
  process.exit(0);
}

migrate().catch(console.error);
