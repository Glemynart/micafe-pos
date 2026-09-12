import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Modo emulador: exclusivo para validación funcional local. Los puertos
 * replican `firebase.json`. Sin `NEXT_PUBLIC_USE_EMULATORS=1` este módulo se
 * comporta exactamente como antes y nunca importa una ruta de emulador.
 */
const USANDO_EMULADORES = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
const EMULADOR_HOST = "127.0.0.1";

function puertoEmulador(nombre: string, value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${nombre} debe ser un puerto local válido.`);
  }
  return port;
}

const PUERTO_FIRESTORE_EMULATOR = puertoEmulador(
  "NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT",
  process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
  8085,
);
const PUERTO_AUTH_EMULATOR = puertoEmulador(
  "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT",
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
  9099,
);
const PUERTO_FUNCTIONS_EMULATOR = puertoEmulador(
  "NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT",
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
  5001,
);

let firestore: Firestore | null = null;

function getFirebaseDb(): Firestore {
  if (!firestore) {
    firestore = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (USANDO_EMULADORES) connectFirestoreEmulator(firestore, EMULADOR_HOST, PUERTO_FIRESTORE_EMULATOR);
  }
  return firestore;
}

let authInstance: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    if (USANDO_EMULADORES) {
      connectAuthEmulator(authInstance, `http://${EMULADOR_HOST}:${PUERTO_AUTH_EMULATOR}`, { disableWarnings: true });
    }
  }
  return authInstance;
}

let functionsInstance: Functions | null = null;

function getFirebaseFunctions(region = "us-central1"): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getFirebaseApp(), region);
    if (USANDO_EMULADORES) connectFunctionsEmulator(functionsInstance, EMULADOR_HOST, PUERTO_FUNCTIONS_EMULATOR);
  }
  return functionsInstance;
}

function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

/**
 * Expone una instancia Firebase sin crearla al importar el mÃ³dulo. La fachada
 * conserva la API existente para servicios cliente y materializa el SDK solo
 * cuando el consumidor accede realmente a la instancia.
 */
function lazyFirebase<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve();
      const value = Reflect.get(instance, property, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
    has(_target, property) {
      return Reflect.has(resolve(), property);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}

export const app = lazyFirebase(getFirebaseApp);
export const db = lazyFirebase(getFirebaseDb);
export const auth = lazyFirebase(getFirebaseAuth);
export const storage = lazyFirebase(getFirebaseStorage);

export { getFirebaseApp, getFirebaseDb, getFirebaseAuth, getFirebaseFunctions, getFirebaseStorage };
