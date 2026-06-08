import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const mapEspacioToModulos: Record<string, string[]> = {
  cafeteria: ["sell", "kitchen", "inventory", "recipes", "purchases", "reports", "shifts", "waste", "finanzas", "gastos", "cuentas_cobro", "clientes"],
  artesanias: ["sell", "inventory", "purchases", "reports", "shifts", "clientes"],
  libreria: ["sell", "inventory", "purchases", "reports", "shifts", "clientes"],
  fotocopias: ["sell", "inventory", "purchases", "reports", "shifts"],
  alquiler: ["sell", "alquiler_dashboard", "reservas", "reports", "shifts", "clientes"],
  consignacion: ["sell", "consignaciones", "inventory", "reports", "shifts", "clientes"]
};

// Módulos administrativos que siempre deberían estar disponibles (si el usuario tiene permisos y la configuración global los tiene habilitados)
const adminModulos = ["permissions", "settings", "historial"];

async function main() {
  const app = initializeApp(firebaseConfig, "fix-espacios-app");
  const db = getFirestore(app);

  const espaciosSnap = await getDocs(collection(db, "espacios"));
  
  for (const espacioDoc of espaciosSnap.docs) {
    const id = espacioDoc.id;
    let modulos = mapEspacioToModulos[id] || ["sell", "reports", "shifts"];
    
    // Agregamos siempre los administrativos para que los admins no los pierdan al cambiar de espacio
    modulos = [...modulos, ...adminModulos];

    await updateDoc(doc(db, "espacios", id), {
      modulos_permitidos: modulos
    });
    console.log(`Espacio ${id} actualizado con ${modulos.length} módulos permitidos.`);
  }

  console.log("Completado.");
  process.exit(0);
}

main().catch(console.error);
