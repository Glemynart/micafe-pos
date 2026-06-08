/**
 * seed-usuarios.ts
 * 
 * Script para crear los usuarios iniciales en Firebase Auth + Firestore.
 * Ejecutar UNA SOLA VEZ para inicializar la colección `usuarios`.
 * 
 * Uso: npx tsx scripts/seed-usuarios.ts
 * 
 * Requisitos:
 *   - El archivo .env.local debe estar configurado con las credenciales de Firebase.
 *   - El proyecto Firebase debe tener habilitado: Authentication (Email/Password) + Firestore.
 */

// Carga las variables de entorno antes de importar Firebase
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Configuración ────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const EMAIL_DOMAIN = "@micafe-pos.internal";

// ─── Usuarios a Crear ─────────────────────────────────────────────────────────
//
// ⚠️  IMPORTANTE: Cambia las contraseñas antes de usar en producción.
//     Mínimo 6 caracteres (requisito de Firebase Auth).
//

const USUARIOS_SEED = [
  {
    username: "admin",
    nombre: "Administrador",
    password: "Admin2024*",
    rol: "admin" as const,
    permisos: ["sell", "kitchen", "inventory", "recipes", "purchases", "reports", "shifts", "waste", "permissions", "settings", "finanzas", "gastos", "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard", "historial"],
  },
  {
    username: "cajero1",
    nombre: "Carlos Cajero",
    password: "Cajero2024*",
    rol: "cajero" as const,
    permisos: ["sell", "reports", "shifts"],
  },
  {
    username: "cocinero1",
    nombre: "Ana Cocinera",
    password: "Cocina2024*",
    rol: "cocinero" as const,
    permisos: ["sell"],
  },
];

// ─── Script Principal ─────────────────────────────────────────────────────────

async function seed() {
  console.log("🔥 Iniciando seed de usuarios en Firebase...\n");

  const app = initializeApp(firebaseConfig, "seed-app");
  const auth = getAuth(app);
  const db = getFirestore(app);

  let creados = 0;
  let omitidos = 0;
  let errores = 0;

  for (const usuario of USUARIOS_SEED) {
    const email = `${usuario.username}${EMAIL_DOMAIN}`;
    console.log(`⏳ Procesando: ${usuario.username} (${email})`);

    try {
      let uid: string;

      // Intentamos crear el usuario en Firebase Auth
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, usuario.password);
        uid = cred.user.uid;
        console.log(`  ✅ Auth creado. UID: ${uid}`);
      } catch (authError: unknown) {
        const code = (authError as { code?: string }).code;
        if (code === "auth/email-already-in-use") {
          // Ya existe en Auth → iniciamos sesión para obtener el UID
          const cred = await signInWithEmailAndPassword(auth, email, usuario.password);
          uid = cred.user.uid;
          console.log(`  ℹ️  Auth ya existe. UID: ${uid}`);
        } else {
          throw authError;
        }
      }

      // Verificamos si ya existe en Firestore
      const docRef = doc(db, "usuarios", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        console.log(`  ⏭️  Ya existe en Firestore. Omitiendo.\n`);
        omitidos++;
        continue;
      }

      // Creamos el documento en Firestore
      await setDoc(docRef, {
        uid,
        username: usuario.username,
        nombre: usuario.nombre,
        email,
        rol: usuario.rol,
        activo: true,
        permisos: usuario.permisos,
        creadoEn: serverTimestamp(),
        ultimoAcceso: null,
      });

      console.log(`  ✅ Documento Firestore creado.\n`);
      creados++;
    } catch (error: unknown) {
      console.error(`  ❌ Error al procesar ${usuario.username}:`, error);
      errores++;
    }
  }

  console.log("─────────────────────────────────────");
  console.log(`✅ Creados:  ${creados}`);
  console.log(`⏭️  Omitidos: ${omitidos} (ya existían)`);
  console.log(`❌ Errores:  ${errores}`);
  console.log("─────────────────────────────────────");
  console.log("\n🎉 Seed completado.");
  console.log("\nUsuarios disponibles para login:");
  USUARIOS_SEED.forEach(u => {
    console.log(`  👤 ${u.username} / ${u.password}  (rol: ${u.rol})`);
  });
  console.log("\n⚠️  Recuerda cambiar las contraseñas en producción.\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error fatal en el seed:", err);
  process.exit(1);
});
