/**
 * Reviews (firestore.rules): id = {uid}_{productId}; created only by verified buyers (the server
 * writes customers/{uid}/purchases/{productId}), always 'pending'; the public sees 'approved' only.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { db as appDb } from '../lib/firebase';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export interface ProductReview {
  id: string;
  productId: string;
  customerId: string;
  authorName: string;
  rating: number;
  title?: string;
  body: string;
  status: ReviewStatus;
  createdAt: string;
}

const fromDoc = (id: string, d: any): ProductReview => ({
  id,
  productId: d.productId,
  customerId: d.customerId,
  authorName: d.authorName,
  rating: d.rating,
  title: d.title,
  body: d.body,
  status: d.status,
  createdAt: d.createdAt
});

export const reviewId = (uid: string, productId: string) => `${uid}_${productId}`;

export async function getApprovedReviews(productId: string, db: Firestore = appDb as Firestore): Promise<ProductReview[]> {
  const snap = await getDocs(query(collection(db, 'reviews'), where('productId', '==', productId), where('status', '==', 'approved')));
  return snap.docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

/** Can this signed-in customer review the product (bought it, not reviewed yet)? */
export async function reviewEligibility(uid: string, productId: string, db: Firestore = appDb as Firestore): Promise<'can' | 'reviewed' | 'not-buyer'> {
  const bought = await getDoc(doc(db, 'customers', uid, 'purchases', productId)).catch(() => null);
  if (!bought?.exists()) return 'not-buyer';
  const mine = await getDoc(doc(db, 'reviews', reviewId(uid, productId))).catch(() => null);
  return mine?.exists() ? 'reviewed' : 'can';
}

export async function submitReview(
  r: { uid: string; productId: string; authorName: string; rating: number; title?: string; body: string },
  db: Firestore = appDb as Firestore
): Promise<void> {
  const payload: Record<string, unknown> = {
    productId: r.productId,
    customerId: r.uid,
    authorName: r.authorName.trim().slice(0, 60) || 'Customer',
    rating: Math.round(r.rating),
    body: r.body.trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  if (r.title?.trim()) payload.title = r.title.trim().slice(0, 120);
  await setDoc(doc(db, 'reviews', reviewId(r.uid, r.productId)), payload);
}

// ---- admin ----
export async function getAllReviews(db: Firestore = appDb as Firestore): Promise<ProductReview[]> {
  const snap = await getDocs(collection(db, 'reviews'));
  return snap.docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}
export const setReviewStatus = (id: string, status: ReviewStatus, db: Firestore = appDb as Firestore) =>
  updateDoc(doc(db, 'reviews', id), { status, moderatedAt: new Date().toISOString() });
export const deleteReview = (id: string, db: Firestore = appDb as Firestore) => deleteDoc(doc(db, 'reviews', id));
