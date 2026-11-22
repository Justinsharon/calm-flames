/**
 * Signed-in customer data (all limited by firestore.rules to the owner):
 * favourites (customers/{uid}/wishlist/{productId}), saved addresses, and their orders.
 * Functions take the Firestore instance so emulator tests can run them as a given user.
 */
import { collection, deleteDoc, doc, getDocs, query, setDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { db as appDb } from '../lib/firebase';
import { type CheckoutCustomer, normalizePhone, validateCustomer } from '../lib/checkoutForm';

const D = () => appDb as Firestore;
export const LOCAL_WISHLIST_KEY = 'the_calm_flame_wishlist';

// ---- favourites ----
export async function getFavourites(uid: string, db: Firestore = D()): Promise<string[]> {
  const snap = await getDocs(collection(db, 'customers', uid, 'wishlist'));
  return snap.docs.map((d) => d.id);
}
export const addFavourite = (uid: string, productId: string, db: Firestore = D()) =>
  setDoc(doc(db, 'customers', uid, 'wishlist', productId), { productId, addedAt: new Date().toISOString() });
export const removeFavourite = (uid: string, productId: string, db: Firestore = D()) => deleteDoc(doc(db, 'customers', uid, 'wishlist', productId));

/**
 * First sign-in on this device: copy the guest (localStorage) favourites into the account, then
 * the caller clears localStorage. Returns the merged list. Existing account items are kept.
 */
export async function mergeLocalFavourites(uid: string, localIds: string[], db: Firestore = D()): Promise<string[]> {
  const existing = await getFavourites(uid, db);
  const toAdd = [...new Set(localIds.filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id)))].filter((id) => !existing.includes(id));
  if (toAdd.length) {
    const batch = writeBatch(db);
    const at = new Date().toISOString();
    for (const id of toAdd) batch.set(doc(db, 'customers', uid, 'wishlist', id), { productId: id, addedAt: at });
    await batch.commit();
  }
  return [...existing, ...toAdd];
}

export function readLocalWishlist(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_WISHLIST_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function clearLocalWishlist() {
  try {
    localStorage.removeItem(LOCAL_WISHLIST_KEY);
  } catch {
    /* ignore */
  }
}

// ---- addresses ----
export interface SavedAddress extends CheckoutCustomer {
  id: string;
  label?: string;
  isDefault: boolean;
}
type AddressFields = Omit<SavedAddress, 'id' | 'email'>;

export async function getAddresses(uid: string, db: Firestore = D()): Promise<SavedAddress[]> {
  const snap = await getDocs(collection(db, 'customers', uid, 'addresses'));
  return snap.docs
    .map((d) => ({ id: d.id, email: '', ...(d.data() as any) }) as SavedAddress)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.fullName.localeCompare(b.fullName));
}

/** Validates like checkout; making one default un-defaults the others (one batch). */
export async function saveAddress(uid: string, a: AddressFields & { id?: string }, db: Firestore = D()): Promise<string> {
  const errs = validateCustomer({ ...a, email: 'placeholder@example.com' });
  if (Object.keys(errs).length) throw new Error(Object.values(errs)[0]);
  const id = a.id || doc(collection(db, 'customers', uid, 'addresses')).id;
  const data: Record<string, unknown> = {
    fullName: a.fullName.trim(),
    phone: normalizePhone(a.phone)!,
    addressLine1: a.addressLine1.trim(),
    city: a.city.trim(),
    state: a.state.trim(),
    pincode: a.pincode.trim(),
    isDefault: Boolean(a.isDefault),
    updatedAt: new Date().toISOString()
  };
  if (a.addressLine2?.trim()) data.addressLine2 = a.addressLine2.trim();
  if (a.label?.trim()) data.label = a.label.trim().slice(0, 40);
  const batch = writeBatch(db);
  if (a.isDefault) {
    for (const other of await getAddresses(uid, db)) {
      if (other.id !== id && other.isDefault) {
        const { id: _i, email: _e, ...rest } = other as any;
        batch.set(doc(db, 'customers', uid, 'addresses', other.id), { ...rest, isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
  }
  batch.set(doc(db, 'customers', uid, 'addresses', id), data);
  await batch.commit();
  return id;
}
export const deleteAddress = (uid: string, id: string, db: Firestore = D()) => deleteDoc(doc(db, 'customers', uid, 'addresses', id));

// ---- orders (rules: customerId == auth.uid) ----
export interface AccountOrder {
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  total: number;
  summary: string;
  trackingUrl: string | null;
}
export async function getMyOrders(uid: string, db: Firestore = D()): Promise<AccountOrder[]> {
  const snap = await getDocs(query(collection(db, 'orders'), where('customerId', '==', uid)));
  return snap.docs
    .map((d) => {
      const o: any = d.data();
      const lines: any[] = Array.isArray(o.lines) ? o.lines : [];
      const summary = lines.map((l) => (l.kind === 'box' ? `Gift box of ${l.boxSize}` : l.productName)).filter(Boolean).join(' + ');
      return {
        orderNumber: o.orderNumber || d.id,
        createdAt: o.createdAt || '',
        status: o.status || '',
        paymentStatus: o.paymentStatus || '',
        total: o.total || 0,
        summary,
        trackingUrl: typeof o.trackingUrl === 'string' && /^https:\/\//.test(o.trackingUrl) ? o.trackingUrl : null
      };
    })
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}
