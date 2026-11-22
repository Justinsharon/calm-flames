/** Admin → Support (firestore.rules: admins read/update status + note; the server creates requests). */
import { collection, doc, onSnapshot, updateDoc, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref, type FirebaseStorage } from 'firebase/storage';
import { db as appDb, storage as appStorage } from '../lib/firebase';

export type SupportStatus = 'open' | 'in_progress' | 'resolved';
export interface SupportRequest {
  id: string;
  type: 'callback' | 'damaged';
  name: string;
  phone: string;
  email?: string;
  orderNumber?: string;
  preferredTime?: string;
  message: string;
  photo: { path: string; contentType: string; size: number } | null;
  status: SupportStatus;
  adminNote?: string;
  createdAt: string;
}

export function subscribeSupportRequests(onChange: (r: SupportRequest[]) => void, onError: (e: Error) => void, db: Firestore = appDb as Firestore) {
  return onSnapshot(
    collection(db, 'supportRequests'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))),
    onError
  );
}
export const setSupportStatus = (id: string, status: SupportStatus, adminNote?: string, db: Firestore = appDb as Firestore) =>
  updateDoc(doc(db, 'supportRequests', id), { status, ...(adminNote !== undefined ? { adminNote } : {}), updatedAt: new Date().toISOString() });
export const supportPhotoUrl = (path: string, storage: FirebaseStorage = appStorage as FirebaseStorage) => getDownloadURL(ref(storage, path));
