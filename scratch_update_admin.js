require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, updateDoc, doc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const usersRef = collection(db, "usuarios");
  const snap = await getDocs(usersRef);
  
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.rol === 'admin' || data.rol === 'cajero') {
      const permisos = data.permisos || [];
      if (!permisos.includes('historial')) {
        permisos.push('historial');
        await updateDoc(doc(db, "usuarios", docSnap.id), {
          permisos: permisos
        });
        console.log(`Actualizado permisos para usuario: ${data.username} (${data.rol})`);
      }
    }
  }
  
  const rolesRef = collection(db, "permisos_roles");
  const rolesSnap = await getDocs(rolesRef);
  
  for (const docSnap of rolesSnap.docs) {
    const data = docSnap.data();
    if (docSnap.id === 'admin' || docSnap.id === 'cajero') {
      const permisos = data.permisos || [];
      if (!permisos.includes('historial')) {
        permisos.push('historial');
        await updateDoc(doc(db, "permisos_roles", docSnap.id), {
          permisos: permisos
        });
        console.log(`Actualizado permisos de rol base: ${docSnap.id}`);
      }
    }
  }
  
  console.log("Terminado");
  process.exit(0);
}

run().catch(console.error);
