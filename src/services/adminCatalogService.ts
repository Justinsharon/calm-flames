/**
 * Admin-only catalogue writes (client SDK, enforced by firestore.rules / storage.rules).
 * Every write lands in Firestore `products` / `inventory` or Storage `products/`, which the
 * storefront listens to in realtime, so changes appear without a redeploy.
 */
import { collection, deleteField, doc, onSnapshot, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { db as appDb, storage as appStorage } from '../lib/firebase';
import {
  validateCommercialUpdate,
  validateStock,
  validatePhoto,
  validateProductDetails,
  validateTaxonomyEdit,
  type CommercialUpdate,
  type ProductDetailsUpdate
} from '../lib/adminValidation';
import { PRODUCT_BADGE_TAGS, TAXONOMY_SLUGS, type TaxonomyDoc, type TaxonomyKind } from '../lib/taxonomy';
import { parseStoreSettings, validateStoreSettings, type StoreSettings } from '../lib/storeSettings';
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
  if (typeof u.sortOrder === 'number') updates.sortOrder = u.sortOrder;
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
    images: [url, ...previousGallery],
    updatedAt: new Date().toISOString()
  });
  return url;
}

type PhotoFile = Blob & { name: string; type: string; size: number };

async function uploadOne(storage: FirebaseStorage, productId: string, file: PhotoFile): Promise<string> {
  const err = validatePhoto(file);
  if (err) throw new Error(`${file.name}: ${err}`);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').slice(-60);
  const objectRef = ref(storage, `products/${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  return getDownloadURL(objectRef);
}

/**
 * Save the ordered photo list ([0] = main, [1] = hover). Also keeps the Phase 3 fields
 * (imageUrl, galleryImageUrls) in sync so older code paths show the same main photo.
 * Removing a URL from the list never deletes the Storage object (it may be shared).
 */
export async function setProductImages(productId: string, images: string[], { db } = defaultDeps()): Promise<void> {
  const clean = images.filter((u) => typeof u === 'string' && u.trim());
  if (clean.length > 12) throw new Error('A product can have at most 12 photos.');
  await updateDoc(doc(db, 'products', productId), {
    images: clean,
    imageUrl: clean[0] ?? deleteField(),
    galleryImageUrls: clean,
    updatedAt: new Date().toISOString()
  });
}

/** Upload several photos and append them, in order, after the existing ones. */
export async function addProductPhotos(
  productId: string,
  current: string[],
  files: PhotoFile[],
  deps = defaultDeps()
): Promise<string[]> {
  for (const f of files) {
    const err = validatePhoto(f);
    if (err) throw new Error(`${f.name}: ${err}`);
  }
  const urls: string[] = [];
  for (const f of files) urls.push(await uploadOne(deps.storage, productId, f));
  const next = [...current, ...urls];
  await setProductImages(productId, next, deps);
  return next;
}

/** Write the Phase 4a detail fields. `null` clears a field; non-badge legacy tags are kept. */
export async function updateProductDetails(
  productId: string,
  u: ProductDetailsUpdate,
  existingTags: string[] = [],
  { db } = defaultDeps()
): Promise<void> {
  const err = validateProductDetails(u);
  if (err) throw new Error(err);
  const orDelete = (v: unknown) => (v === null || v === '' ? deleteField() : v);
  const legacyTags = existingTags.filter((t) => !(PRODUCT_BADGE_TAGS as readonly string[]).includes(t));
  await updateDoc(doc(db, 'products', productId), {
    collection: orDelete(u.collection),
    scentFamily: orDelete(u.scentFamily),
    notes:
      u.notes && (u.notes.top.length || u.notes.heart.length || u.notes.base.length) ? u.notes : deleteField(),
    burnTimeHours: orDelete(u.burnTimeHours),
    weightGrams: orDelete(u.weightGrams),
    sizeCm: orDelete(u.sizeCm?.trim() || null),
    ingredients: orDelete(u.ingredients?.trim() || null),
    shortDescription: orDelete(u.shortDescription?.trim() || null),
    description: orDelete(u.description?.trim() || null),
    tags: [...legacyTags, ...u.badges],
    occasions: u.occasions,
    boxEligible: u.boxEligible,
    mrp: orDelete(u.mrp),
    updatedAt: new Date().toISOString()
  });
}

// ---- Taxonomy ----
export function subscribeTaxonomy(
  kind: TaxonomyKind,
  onChange: (docs: TaxonomyDoc[]) => void,
  onError: (err: Error) => void,
  { db } = defaultDeps()
): () => void {
  return onSnapshot(
    collection(db, kind),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ ...(d.data() as TaxonomyDoc), slug: d.id }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      ),
    (err) => onError(err)
  );
}

export async function saveTaxonomyDoc(
  kind: TaxonomyKind,
  slug: string,
  t: { name: string; description: string; headerImage: string; sortOrder: number },
  { db } = defaultDeps()
): Promise<void> {
  if (!TAXONOMY_SLUGS[kind].includes(slug)) throw new Error(`Unknown ${kind} slug "${slug}".`);
  const err = validateTaxonomyEdit(t);
  if (err) throw new Error(err);
  await setDoc(doc(db, kind, slug), {
    slug,
    name: t.name.trim(),
    description: t.description,
    headerImage: t.headerImage,
    sortOrder: t.sortOrder,
    updatedAt: new Date().toISOString()
  });
}

export async function uploadTaxonomyHeader(
  kind: TaxonomyKind,
  slug: string,
  file: PhotoFile,
  { storage } = defaultDeps()
): Promise<string> {
  const err = validatePhoto(file);
  if (err) throw new Error(err);
  const objectRef = ref(storage, `taxonomy/${kind}/${slug}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').slice(-60)}`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  return getDownloadURL(objectRef);
}

// ---- settings/store ----
/** Replaces the whole doc: a field left out is unset (and its feature hides itself). */
export async function saveStoreSettings(s: StoreSettings, { db } = defaultDeps()): Promise<void> {
  const err = validateStoreSettings(s);
  if (err) throw new Error(err);
  const clean = parseStoreSettings(s);
  await setDoc(doc(db, 'settings', 'store'), { ...clean, updatedAt: new Date().toISOString() });
}
