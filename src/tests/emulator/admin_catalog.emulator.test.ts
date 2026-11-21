/**
 * Admin dashboard catalogue writes (src/services/adminCatalogService.ts) through the browser SDK
 * against the Firestore + Storage emulators, with the real security rules enforced.
 * No mocks. Users are emulator mock tokens.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import {
  updateProductCommercials,
  setProductStock,
  uploadProductPhoto,
  subscribeAllProducts
} from '../../services/adminCatalogService';
import { productFromDoc } from '../../lib/productMapping';
import { getAdminDb } from '../../server/firestoreAdmin';
import { buildProductDoc } from '../../../scripts/catalog/migrate';
import { CANONICAL_PRODUCTS, HISTORICAL_PRODUCTS } from '../../data/canonicalCatalog';
import { clearFirestore, realFetch } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const ADMIN = { uid: 'admin-uid', email: 'owner@example.com', admin: true };
const CUSTOMER = { uid: 'customer-uid', email: 'buyer@example.com' };

async function makeAdmin(uid: string) {
  await getAdminDb().collection('customers').doc(uid).set({ role: 'admin', email: ADMIN.email });
  await getAdminDb().collection('admins').doc(uid).set({ email: ADMIN.email });
}

async function seed() {
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date().toISOString();
  [...CANONICAL_PRODUCTS, ...HISTORICAL_PRODUCTS].forEach((cp, i) => {
    batch.set(db.collection('products').doc(cp.id), buildProductDoc(cp, [{ url: 'https://example.com/old.jpg', storagePath: 'products/old.jpg' }], now, i));
  });
  batch.set(db.collection('inventory').doc('peony-bloom'), {
    productId: 'peony-bloom', availableQuantity: 0, reservedQuantity: 2, quantity: 2, status: 'unknown', inStock: false
  });
  await batch.commit();
  await db.collection('customers').doc(CUSTOMER.uid).set({ role: 'customer', email: CUSTOMER.email });
  await makeAdmin(ADMIN.uid);
}

const jpeg = () => {
  const buf = fs.readFileSync(path.resolve(__dirname, '../../assets/images/peony_bloom_candle_1791107531344.jpg'));
  return Object.assign(new Blob([buf], { type: 'image/jpeg' }), { name: 'New Peony Photo.JPG' });
};

function waitFor<T>(subscribe: (cb: (v: T) => void) => () => void, predicate: (v: T) => boolean, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub: () => void = () => {};
    const t = setTimeout(() => { unsub(); reject(new Error('timed out waiting for realtime update')); }, ms);
    unsub = subscribe((v) => {
      if (predicate(v)) { clearTimeout(t); unsub(); resolve(v); }
    });
  });
}

describe('admin catalogue editing (emulators + security rules)', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seed();
  });
  afterAll(async () => {
    await deleteClientApps();
  });

  it('price / priceStatus / active edits reach a signed-out storefront listener in realtime', async () => {
    const admin = clientFor(ADMIN);
    const visitor = clientFor();
    const storefrontPeony = (cb: (p: any) => void) =>
      onSnapshot(query(collection(visitor.db, 'products'), where('isActive', '==', true)), (snap) => {
        const d = snap.docs.find((x) => x.id === 'peony-bloom');
        cb(d ? productFromDoc(d.id, d.data()) : null);
      });

    const pending = waitFor(storefrontPeony, (p) => p?.price === 799 && p?.priceStatus === 'active');
    await updateProductCommercials('peony-bloom', { price: 799, priceStatus: 'active', isActive: true }, admin);
    expect((await pending).price).toBe(799);

    const hidden = waitFor(storefrontPeony, (p) => p === null);
    await updateProductCommercials('peony-bloom', { price: 799, priceStatus: 'active', isActive: false }, admin);
    await hidden; // deactivated product disappears from the storefront query
  });

  it('refuses to mark a product priced without a positive price (nothing written)', async () => {
    const admin = clientFor(ADMIN);
    await expect(
      updateProductCommercials('peony-bloom', { price: 0, priceStatus: 'active', isActive: true }, admin)
    ).rejects.toThrow(/above ₹0/);
    const d = (await getAdminDb().collection('products').doc('peony-bloom').get()).data();
    expect(d).toMatchObject({ price: 0, priceStatus: 'missing' });
  });

  it('stock edit keeps reserved units and updates the storefront mirror atomically', async () => {
    const admin = clientFor(ADMIN);
    await setProductStock('peony-bloom', 12, admin);
    expect((await getAdminDb().collection('inventory').doc('peony-bloom').get()).data()).toMatchObject({
      availableQuantity: 12, reservedQuantity: 2, quantity: 14, inStock: true, status: 'in_stock'
    });
    expect((await getAdminDb().collection('products').doc('peony-bloom').get()).data()).toMatchObject({
      inStock: true, inventoryStatus: 'in_stock', availableStock: 12
    });
    await setProductStock('peony-bloom', 0, admin);
    expect((await getAdminDb().collection('products').doc('peony-bloom').get()).data()).toMatchObject({
      inStock: false, inventoryStatus: 'out_of_stock', availableStock: 0
    });
  });

  it('photo upload stores the file in Storage and points the product at it', async () => {
    const admin = clientFor(ADMIN);
    const before = productFromDoc('peony-bloom', (await getAdminDb().collection('products').doc('peony-bloom').get()).data()!);
    const url = await uploadProductPhoto(before, jpeg(), admin);

    const after = (await getAdminDb().collection('products').doc('peony-bloom').get()).data()!;
    expect(after.imageUrl).toBe(url);
    expect(after.imageStoragePath).toMatch(/^products\/peony-bloom\/\d+-new-peony-photo\.jpg$/);
    expect(after.galleryImageUrls[0]).toBe(url);
    expect(after.galleryImageUrls).not.toContain('https://example.com/old.jpg');
    const res = await realFetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/jpeg/);
  });

  it('admin sees inactive and historical products; visitors cannot read them', async () => {
    const admin = clientFor(ADMIN);
    const all = await waitFor<any[]>(
      (cb) => subscribeAllProducts(cb, (e) => { throw e; }, admin),
      (list) => list.length === 37
    );
    expect(all.filter((p) => p.isHistorical)).toHaveLength(4);
    const visitor = clientFor();
    await expect(getDoc(doc(visitor.db, 'products', 'jasmine-sage'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDoc(doc(visitor.db, 'products', 'peony-bloom'))).resolves.toBeTruthy();
  });

  it('customers and visitors cannot change prices, stock or photos', async () => {
    for (const who of [clientFor(CUSTOMER), clientFor()]) {
      await expect(
        updateProductCommercials('peony-bloom', { price: 1, priceStatus: 'active', isActive: true }, who)
      ).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setProductStock('peony-bloom', 5, who)).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(uploadBytes(ref(who.storage, 'products/peony-bloom/hack.jpg'), jpeg(), { contentType: 'image/jpeg' }))
        .rejects.toMatchObject({ code: 'storage/unauthorized' });
    }
    expect((await getAdminDb().collection('products').doc('peony-bloom').get()).data()).toMatchObject({ price: 0, priceStatus: 'missing' });
  });

  it('storage rejects non-image or oversized uploads even from an admin', async () => {
    const admin = clientFor(ADMIN);
    await expect(
      uploadBytes(ref(admin.storage, 'products/peony-bloom/x.txt'), new Blob(['hi'], { type: 'text/plain' }), { contentType: 'text/plain' })
    ).rejects.toMatchObject({ code: 'storage/unauthorized' });
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' });
    await expect(uploadBytes(ref(admin.storage, 'products/peony-bloom/big.jpg'), big, { contentType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'storage/unauthorized' });
  });
});
