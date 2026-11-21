/**
 * Browser-SDK clients connected to the emulators as specific users, so tests exercise the real
 * firestore.rules / storage.rules exactly as the storefront and admin dashboard would.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const apps: FirebaseApp[] = [];
let seq = 0;

function hostPort(envVar: string): [string, number] {
  const [h, p] = String(process.env[envVar]).split(':');
  return [h, Number(p)];
}

/** `user` undefined = signed-out visitor. */
export function clientFor(user?: { uid: string; email?: string; admin?: boolean }): { db: Firestore; storage: FirebaseStorage } {
  const app = initializeApp(
    {
      projectId: process.env.FIREBASE_PROJECT_ID || 'demo-calm-flames',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'demo-calm-flames.appspot.com',
      apiKey: 'demo-api-key'
    },
    `client-${++seq}`
  );
  apps.push(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const mock = user
    ? { mockUserToken: { sub: user.uid, user_id: user.uid, email: user.email, ...(user.admin ? { admin: true } : {}) } }
    : undefined;
  const [fh, fp] = hostPort('FIRESTORE_EMULATOR_HOST');
  const [sh, sp] = hostPort('FIREBASE_STORAGE_EMULATOR_HOST');
  connectFirestoreEmulator(db, fh, fp, mock as any);
  connectStorageEmulator(storage, sh, sp, mock as any);
  return { db, storage };
}

export async function deleteClientApps() {
  await Promise.all(apps.splice(0).map((a) => deleteApp(a)));
}
