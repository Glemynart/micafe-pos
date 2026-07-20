import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
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

let firestore: Firestore | null = null;

function getFirebaseDb(): Firestore {
  if (!firestore) {
    firestore = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return firestore;
}

function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
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

export { getFirebaseApp, getFirebaseDb, getFirebaseAuth, getFirebaseStorage };
