/**
 * Admin-only catalogue writes (client SDK, enforced by firestore.rules / storage.rules).
 * Every write lands in Firestore `products` / `inventory` or Storage `products/`, which the
 * storefront listens to in realtime, so changes appear without a redeploy.
 */
import { collection, doc, onSnapshot, runTransaction, updateDoc, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { db as appDb, storage as appStorage } from '../lib/firebase';
import {
  validateCommercialUpdate,
  validateStock,
  validatePhoto,
  type CommercialUpdate
} from '../lib/adminValidation';
import { productFromDoc } from '../lib/productMapping';
import { Product } from '../types';

export {
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_TYPES,
  validateCommercialUpdate,
  validateStock,
  validatePhoto
} from '../lib/adminValidation';
export type { CommercialUpdate } from '../lib/adminValidation';

/** Firebase instances to use (defaults to the app's; tests inject emulator-connected ones). */
export interface AdminDeps {
  db: Firestore;
  storage: FirebaseStorage;
}
const defaultDeps = (): AdminDeps => ({ db: appDb, storage: appStorage });

/** Realtime list of ALL products (including inactive/historical) for the admin dashboard. */
export function subscribeAllProducts(
  onChange: (products: Product[]) => void,
  onError: (err: Error) => void,
  { db } = defaultDeps()
): () => void {
  return onSnapshot(
    collection(db, 'products'),
    (snap) => onChange(snap.docs.map((d) => productFromDoc(d.id, d.data()))),
    (err) => onError(err)
  );
}

export async function updateProductCommercials(
  productId: string,
  u: CommercialUpdate,
  { db } = defaultDeps()
): Promise<void> {
  const err = validateCommercialUpdate(u);
  if (err) throw new Error(err);
  const updates: Record<string, any> = {
    price: u.price,
    priceStatus: u.priceStatus,
    isActive: u.isActive,
    updatedAt: new Date().toISOString()
  };
  if (typeof u.name === 'string' && u.name.trim()) updates.name = u.name.trim();
  if (typeof u.tagline === 'string') updates.tagline = u.tagline;
  await updateDoc(doc(db, 'products', productId), updates);
}

/**
 * Set the units available to sell. Reserved units (open checkouts) are preserved, so
 * quantity = available + reserved. The product doc's stock mirror is updated in the same
 * transaction so the storefront shows the change immediately.
 */
export async function setProductStock(
  productId: string,
  available: number,
  { db } = defaultDeps()
): Promise<void> {
  const err = validateStock(available);
  if (err) throw new Error(err);
  const invRef = doc(db, 'inventory', productId);
  const prodRef = doc(db, 'products', productId);
  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(invRef);
    const reserved = invSnap.exists() ? Number(invSnap.data().reservedQuantity) || 0 : 0;
    const now = new Date().toISOString();
    const status = available > 0 ? 'in_stock' : 'out_of_stock';
    tx.set(
      invRef,
      {
        productId,
        availableQuantity: available,
        reservedQuantity: reserved,
        quantity: available + reserved,
        inStock: available > 0,
        status,
        updatedAt: now
      },
      { merge: true }
    );
    tx.update(prodRef, { inStock: available > 0, inventoryStatus: status, availableStock: available, updatedAt: now });
  });
}

/**
 * Upload a new main photo to Storage and point the product at it. Each upload gets a new object
 * path, so the old photo (possibly shared with other products) is never overwritten or deleted.
 */
export async function uploadProductPhoto(
  product: Product,
  file: Blob & { name: string; type: string; size: number },
  { db, storage } = defaultDeps()
): Promise<string> {
  const err = validatePhoto(file);
  if (err) throw new Error(err);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').slice(-60);
  const storagePath = `products/${product.id}/${Date.now()}-${safeName}`;
  const objectRef = ref(storage, storagePath);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  const url = await getDownloadURL(objectRef);
  const previousGallery = (product.galleryImages || []).filter((u) => u && u !== product.image);
  await updateDoc(doc(db, 'products', product.id), {
    imageUrl: url,
    imageStoragePath: storagePath,
    galleryImageUrls: [url, ...previousGallery],
    updatedAt: new Date().toISOString()
  });
  return url;
}
