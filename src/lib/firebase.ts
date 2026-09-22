import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Default storage uses the bucket configured in firebaseConfig
export const storage = getStorage(app);

// Secondary fallback storage in case firebasestorage.app is not activated but appspot.com is
export const fallbackStorage = getStorage(app, `gs://${firebaseConfig.projectId}.appspot.com`);

export default app;
