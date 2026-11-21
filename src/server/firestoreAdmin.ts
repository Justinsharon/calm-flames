/**
 * Server-side Firestore access via firebase-admin.
 *
 * Credentials (in order):
 *  - FIRESTORE_EMULATOR_HOST set  -> talks to the local Firestore emulator (no credentials needed).
 *  - GOOGLE_APPLICATION_CREDENTIALS -> path to a service-account JSON key (local runs).
 *  - otherwise Application Default Credentials (Cloud Run service account, `gcloud auth application-default login`).
 *
 * FIRESTORE_DISABLED=1 makes every call fail fast with "Firestore unavailable". The plain unit test
 * run (`npm test`) sets this so tests never hang on live Firestore.
 *
 * The small modular-style helpers below (doc/getDoc/setDoc/updateDoc/runTransaction) mirror the client
 * SDK call shapes so server.ts logic did not have to be rewritten during the migration.
 */
import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type Firestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

let cachedDb: Firestore | null = null;

export function isFirestoreDisabled(): boolean {
  return process.env.FIRESTORE_DISABLED === '1' || process.env.FIRESTORE_DISABLED === 'true';
}

function projectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    (firebaseConfig as any).projectId
  );
}

function databaseId(): string | undefined {
  // The emulator ignores named databases unless addressed explicitly; use the default there.
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIRESTORE_DATABASE_ID) return undefined;
  return process.env.FIRESTORE_DATABASE_ID || (firebaseConfig as any).firestoreDatabaseId || undefined;
}

export function getAdminDb(): Firestore {
  if (isFirestoreDisabled()) {
    throw new Error('Firestore unavailable: durable storage disabled (FIRESTORE_DISABLED is set).');
  }
  if (cachedDb) return cachedDb;

  const existing = getApps().find((a) => a.name === 'tcf-server');
  const app: App =
    existing ||
    initializeApp(
      process.env.FIRESTORE_EMULATOR_HOST
        ? { projectId: projectId() }
        : { credential: applicationDefault(), projectId: projectId() },
      'tcf-server'
    );

  const dbId = databaseId();
  cachedDb = dbId ? getFirestore(app, dbId) : getFirestore(app);
  return cachedDb;
}

/** Test helper: drop the cached instance (e.g. after changing env vars). */
export function resetAdminDbForTests(): void {
  cachedDb = null;
}

// ---------------------------------------------------------------------------
// Modular-style helpers
// ---------------------------------------------------------------------------

export interface SnapshotLike<T = any> {
  id: string;
  exists(): boolean;
  data(): T | undefined;
}

function wrapSnap(s: DocumentSnapshot): SnapshotLike {
  return { id: s.id, exists: () => s.exists, data: () => s.data() };
}

export function doc(db: Firestore, collectionPath: string, id: string): DocumentReference {
  return db.collection(collectionPath).doc(id);
}

export async function getDoc(ref: DocumentReference): Promise<SnapshotLike> {
  return wrapSnap(await ref.get());
}

export async function setDoc(ref: DocumentReference, data: any, options?: { merge?: boolean }): Promise<void> {
  if (options) await ref.set(data, options);
  else await ref.set(data);
}

export async function updateDoc(ref: DocumentReference, data: any): Promise<void> {
  await ref.update(data);
}

export interface TransactionLike {
  get(ref: DocumentReference): Promise<SnapshotLike>;
  set(ref: DocumentReference, data: any, options?: { merge?: boolean }): TransactionLike;
  update(ref: DocumentReference, data: any): TransactionLike;
  delete(ref: DocumentReference): TransactionLike;
}

export async function runTransaction<T>(
  db: Firestore,
  fn: (tx: TransactionLike) => Promise<T>
): Promise<T> {
  return db.runTransaction(async (raw: Transaction) => {
    const tx: TransactionLike = {
      get: async (ref) => wrapSnap(await raw.get(ref)),
      set: (ref, data, options) => {
        if (options) raw.set(ref, data, options);
        else raw.set(ref, data);
        return tx;
      },
      update: (ref, data) => {
        raw.update(ref, data);
        return tx;
      },
      delete: (ref) => {
        raw.delete(ref);
        return tx;
      },
    };
    return fn(tx);
  });
}
