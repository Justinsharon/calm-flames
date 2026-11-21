/**
 * firestore.rules / storage.rules for the catalogue and the admin role, evaluated by the emulators
 * against browser-SDK clients with mock user tokens. No mocks of Firebase itself.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { getAdminDb } from '../../server/firestoreAdmin';
import { clearFirestore } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const product = (over: Record<string, any> = {}) => ({
  name: 'Test', price: 0, priceStatus: 'missing', isActive: true, categories: [], moods: [], ...over
});

describe('security rules: catalogue + admin role', () => {
  beforeEach(async () => {
    await clearFirestore();
    const db = getAdminDb();
    await db.collection('products').doc('active-1').set(product());
    await db.collection('products').doc('hidden-1').set(product({ isActive: false }));
    await db.collection('customers').doc('admin-uid').set({ role: 'admin', email: 'owner@example.com' });
    await db.collection('customers').doc('cust-uid').set({ role: 'customer', email: 'buyer@example.com' });
  });
  afterAll(async () => {
    await deleteClientApps();
  });

  it('anyone can list and read active products, but not inactive ones', async () => {
    const visitor = clientFor();
    const snap = await getDocs(query(collection(visitor.db, 'products'), where('isActive', '==', true)));
    expect(snap.docs.map((d) => d.id)).toEqual(['active-1']);
    await expect(getDocs(collection(visitor.db, 'products'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDoc(doc(visitor.db, 'products', 'hidden-1'))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('only an admin (Firestore role) can write products', async () => {
    const admin = clientFor({ uid: 'admin-uid', email: 'owner@example.com' });
    await updateDoc(doc(admin.db, 'products', 'active-1'), { price: 499, priceStatus: 'active' });
    await setDoc(doc(admin.db, 'products', 'new-1'), product());
    for (const who of [clientFor({ uid: 'cust-uid', email: 'buyer@example.com' }), clientFor()]) {
      await expect(updateDoc(doc(who.db, 'products', 'active-1'), { price: 1 })).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(doc(who.db, 'products', 'evil'), product())).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(doc(who.db, 'inventory', 'active-1'), { availableQuantity: 99 })).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('the old hard-coded owner email no longer grants admin', async () => {
    await getAdminDb().collection('customers').doc('email-uid').set({ role: 'customer' });
    const sameEmail = clientFor({ uid: 'email-uid', email: 'justinsharon56@gmail.com' });
    await expect(updateDoc(doc(sameEmail.db, 'products', 'active-1'), { price: 1 })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('even an admin cannot mark a product priced without a positive price', async () => {
    const admin = clientFor({ uid: 'admin-uid' });
    await expect(updateDoc(doc(admin.db, 'products', 'active-1'), { price: 0, priceStatus: 'active' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(doc(admin.db, 'products', 'active-1'), { price: '500', priceStatus: 'active' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('users cannot grant themselves the admin role', async () => {
    const newbie = clientFor({ uid: 'new-uid', email: 'new@example.com' });
    await expect(setDoc(doc(newbie.db, 'customers', 'new-uid'), { role: 'admin' })).rejects.toMatchObject({ code: 'permission-denied' });
    await setDoc(doc(newbie.db, 'customers', 'new-uid'), { role: 'customer', email: 'new@example.com' });
    await expect(updateDoc(doc(newbie.db, 'customers', 'new-uid'), { role: 'admin' })).rejects.toMatchObject({ code: 'permission-denied' });
    const cust = clientFor({ uid: 'cust-uid' });
    await expect(updateDoc(doc(cust.db, 'customers', 'cust-uid'), { role: 'admin' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('storage: anyone reads product photos; only the admin claim can upload', async () => {
    const img = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    const admin = clientFor({ uid: 'admin-uid', admin: true });
    await uploadBytes(ref(admin.storage, 'products/rules-test/a.jpg'), img, { contentType: 'image/jpeg' });
    // Firestore role alone is not enough for Storage (claim required; grant-admin sets both)
    const roleOnly = clientFor({ uid: 'admin-uid' });
    await expect(uploadBytes(ref(roleOnly.storage, 'products/rules-test/b.jpg'), img, { contentType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'storage/unauthorized' });
    await expect(uploadBytes(ref(admin.storage, 'other/a.jpg'), img, { contentType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'storage/unauthorized' });
  });
});
