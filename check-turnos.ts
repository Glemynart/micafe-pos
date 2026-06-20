import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './lib/firebase';

async function test() {
  try {
    // We don't have the user's password to login.
    // We can't query Firestore directly in Node without firebase-admin unless we log in.
    // Wait, the security rules might be open for read!
    const q = query(collection(db, 'turnos'), where('cajeroNombre', '==', 'Sebas'));
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} turnos for Sebas`);
    snap.forEach(doc => console.log(doc.id, doc.data().estado, doc.data().fechaApertura));
    process.exit(0);
  } catch (e: unknown) {
    console.log("Error:", (e as Error).message);
    process.exit(1);
  }
}

test();
