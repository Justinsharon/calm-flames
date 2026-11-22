/**
 * Phase 4a against the Firestore + Storage emulators. No mocks: real firebase-admin, real
 * browser SDK under the real security rules, real Express routes (no Razorpay calls are made).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { app } from '../../../server';
import { getAdminDb, getAdminBucket } from '../../server/firestoreAdmin';
import { importCatalog } from '../../../scripts/catalog/importCatalog';
import { seedTaxonomy } from '../../../scripts/catalog/seedTaxonomy';
import {
  updateProductDetails,
  setProductImages,
  addProductPhotos,
  saveTaxonomyDoc,
  saveStoreSettings
} from '../../services/adminCatalogService';
import { clearFirestore, realFetch, getData, seedPricedProduct, seedStoreSettings, PRODUCT, TEST_PRICE } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const ADMIN = { uid: 'admin-uid', email: 'owner@example.com', admin: true };
const CUSTOMER = { uid: 'cust-uid', email: 'buyer@example.com' };
const PHOTO = path.resolve(__dirname, '../../assets/images/peony_bloom_candle_1791107531344.jpg');
const customer = { fullName: 'T', email: 't@example.com', phone: '9876543210', addressLine1: 'x', city: 'y', state: 'z', pincode: '400001' };

async function seedUsers() {
  await getAdminDb().collection('customers').doc(ADMIN.uid).set({ role: 'admin' });
  await getAdminDb().collection('customers').doc(CUSTOMER.uid).set({ role: 'customer' });
}
async function clearBucket() {
  const [files] = await getAdminBucket().getFiles({ prefix: 'products/' });
  await Promise.all(files.map((f: any) => f.delete()));
}
const run = (rows: Record<string, string>[], extra: Partial<Parameters<typeof importCatalog>[0]> = {}) =>
  importCatalog({ db: getAdminDb(), bucket: getAdminBucket(), rows, storageEmulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST, ...extra });

beforeEach(async () => {
  await clearFirestore();
  await seedUsers();
});
afterAll(async () => {
  await deleteClientApps();
});

// ===========================================================================
describe('import-catalog (Firestore + Storage emulators)', () => {
  beforeEach(clearBucket);

  async function seedExisting() {
    await getAdminDb().collection('products').doc('peony-bloom').set({
      name: 'Peony Bloom', price: 750, priceStatus: 'active', isActive: true, shortDescription: 'Keep me',
      tags: ['Sensual'], notes: { top: ['peony'], base: ['musk'] }, sortOrder: 3
    });
    await getAdminDb().collection('inventory').doc('peony-bloom').set({ availableQuantity: 4, reservedQuantity: 2, quantity: 6, status: 'in_stock', inStock: true });
  }

  it('dry run reports per row and writes nothing', async () => {
    await seedExisting();
    const report = await run([
      { ID: 'peony-bloom', Name: 'Peony Bloom', 'Heart notes': 'rose', Stock: '10' },
      { ID: 'new-jar', Name: 'New Jar', Price: '1200' },
      { ID: 'peony-bloom', Name: 'dup' },
      { ID: 'oops', Collection: 'tealights' },
      { ID: 'peony-bloom-x' } // new without name
    ]);
    expect(report.applied).toBe(false);
    expect(report.rows.map((r) => r.status)).toEqual(['updated', 'new', 'error', 'error', 'error']);
    expect(report.rows[0].changes).toEqual(['notes', 'stock']);
    expect(report.rows[2].errors[0]).toMatch(/Duplicate ID/);
    expect(report.counts).toEqual({ new: 1, updated: 1, unchanged: 0, error: 3 });
    expect((await getAdminDb().collection('products').get()).size).toBe(1);
    expect(await getData('inventory', 'peony-bloom')).toMatchObject({ availableQuantity: 4 });
  });

  it('--apply: blanks never overwrite, price only from the file, stock keeps reserved, new products hidden', async () => {
    await seedExisting();
    const report = await run(
      [
        { ID: 'peony-bloom', 'Heart notes': 'rose, oud', Stock: '10', Tags: 'bestseller', 'Short description': '', Price: '' },
        { ID: 'new-jar', Name: 'New Jar', Collection: 'Jar Candles', 'Scent family': 'gourmand', Occasions: 'birthday', 'Box eligible': 'yes' },
        { ID: 'priced-jar', Name: 'Priced Jar', Price: '1200' },
        { ID: 'bad', Name: 'Bad', Price: '-5' }
      ],
      { apply: true }
    );
    expect(report.counts).toEqual({ new: 2, updated: 1, unchanged: 0, error: 1 });

    expect(await getData('products', 'peony-bloom')).toMatchObject({
      name: 'Peony Bloom', price: 750, priceStatus: 'active', shortDescription: 'Keep me', sortOrder: 3,
      notes: { top: ['peony'], heart: ['rose', 'oud'], base: ['musk'] }, tags: ['Sensual', 'bestseller'],
      inStock: true, availableStock: 10
    });
    expect(await getData('inventory', 'peony-bloom')).toMatchObject({ availableQuantity: 10, reservedQuantity: 2, quantity: 12 });

    expect(await getData('products', 'new-jar')).toMatchObject({
      name: 'New Jar', isActive: false, price: 0, priceStatus: 'missing', collection: 'jar-candles', scentFamily: 'gourmand',
      occasions: ['birthday'], boxEligible: true
    });
    expect(await getData('inventory', 'new-jar')).toMatchObject({ status: 'unknown', availableQuantity: 0 });
    expect(await getData('products', 'priced-jar')).toMatchObject({ price: 1200, priceStatus: 'active', isActive: false });
    expect(await getData('products', 'bad')).toBeUndefined();

    // second run: nothing changes
    const again = await run(
      [
        { ID: 'peony-bloom', 'Heart notes': 'rose, oud', Stock: '10', Tags: 'bestseller' },
        { ID: 'new-jar', Name: 'New Jar', Collection: 'jar-candles' }
      ],
      { apply: true }
    );
    expect(again.rows.map((r) => r.status)).toEqual(['unchanged', 'unchanged']);
  });

  it('imported products stay unbuyable until priced AND activated', async () => {
    await seedStoreSettings();
    await run([{ ID: 'hidden-jar', Name: 'Hidden', Stock: '5' }], { apply: true });
    let res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'hidden-jar', quantity: 1 }] });
    expect(res.status).toBe(400);
    await getAdminDb().collection('products').doc('hidden-jar').update({ isActive: true });
    res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'hidden-jar', quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/verified retail price/);
    await run([{ ID: 'hidden-jar', Price: '700' }], { apply: true });
    res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'hidden-jar', quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.items[0].unitPrice).toBe(700);
  });

  it('uploads <ID>-n photos in order, idempotently, and serves them', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcf-photos-'));
    fs.copyFileSync(PHOTO, path.join(dir, 'photo-jar-2.jpg'));
    fs.writeFileSync(path.join(dir, 'photo-jar-1.png'), fs.readFileSync(PHOTO).subarray(0, 2000));
    fs.copyFileSync(PHOTO, path.join(dir, 'unknown-id-1.jpg'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

    const report = await run([{ ID: 'photo-jar', Name: 'Photo Jar' }], { apply: true, photosDir: dir });
    expect(report.rows[0].changes).toContain('images (2 photos)');
    expect(report.unmatchedPhotoIds).toEqual(['unknown-id']);
    const p = (await getData('products', 'photo-jar'))!;
    expect(p.images).toHaveLength(2);
    expect(p.images[0]).toMatch(/photo-jar%2Fimport-1-[0-9a-f]{12}\.png/);
    expect(p.images[1]).toMatch(/photo-jar%2Fimport-2-[0-9a-f]{12}\.jpg/);
    expect(p.imageUrl).toBe(p.images[0]);
    expect((await realFetch(p.images[1])).status).toBe(200);

    const again = await run([{ ID: 'photo-jar', Name: 'Photo Jar' }], { apply: true, photosDir: dir });
    expect(again.rows[0].status).toBe('unchanged');
    expect((await getData('products', 'photo-jar'))!.images).toEqual(p.images);
    const [files] = await getAdminBucket().getFiles({ prefix: 'products/photo-jar/' });
    expect(files).toHaveLength(2);
  });
});

// ===========================================================================
describe('taxonomy seed (create-only)', () => {
  it('creates 16 docs once and never overwrites owner edits', async () => {
    const first = await seedTaxonomy(getAdminDb());
    expect(first.created).toHaveLength(16);
    await getAdminDb().collection('collections').doc('jar-candles').update({ name: 'Owner Name', description: 'Edited' });
    const second = await seedTaxonomy(getAdminDb());
    expect(second.created).toHaveLength(0);
    expect(second.existing).toHaveLength(16);
    expect(await getData('collections', 'jar-candles')).toMatchObject({ name: 'Owner Name', description: 'Edited' });
    expect(await getData('scentFamilies', 'spicy-resinous')).toMatchObject({ name: 'Spicy & Resinous', description: '', headerImage: '' });
  });
});

// ===========================================================================
describe('security rules for the new fields, taxonomy and settings', () => {
  beforeEach(async () => {
    await getAdminDb().collection('products').doc('p1').set({ name: 'P1', price: 0, priceStatus: 'missing', isActive: true, tags: ['Grounded'], scentFamily: 'Floral' });
    await seedTaxonomy(getAdminDb());
  });

  it('admin can write valid Phase 4a fields; invalid values are rejected even for admins', async () => {
    const admin = clientFor(ADMIN);
    await updateDoc(doc(admin.db, 'products', 'p1'), {
      collection: 'coconut-shell', scentFamily: 'indian-botanical', notes: { top: ['a'] }, burnTimeHours: 30,
      weightGrams: 150, sizeCm: '7 x 7', occasions: ['christmas'], boxEligible: true, mrp: 999, images: ['https://x/y.jpg']
    });
    for (const bad of [{ collection: 'tealights' }, { occasions: ['diwali'] }, { burnTimeHours: -1 }, { notes: { middle: ['x'] } }, { boxEligible: 'yes' }, { mrp: '999' }]) {
      await expect(updateDoc(doc(admin.db, 'products', 'p1'), bad)).rejects.toMatchObject({ code: 'permission-denied' });
    }
    // legacy docs (label scentFamily, free-text tags) remain editable
    await updateDoc(doc(admin.db, 'products', 'p1'), { scentFamily: 'Earthy', tags: ['Grounded', 'new'] });
  });

  it('taxonomy: public read, admin-only writes, fixed slugs only', async () => {
    const visitor = clientFor();
    expect((await getDoc(doc(visitor.db, 'occasions', 'wedding'))).data()).toMatchObject({ name: 'Wedding' });
    const cust = clientFor(CUSTOMER);
    await expect(updateDoc(doc(cust.db, 'collections', 'jar-candles'), { name: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
    const admin = clientFor(ADMIN);
    await saveTaxonomyDoc('collections', 'jar-candles', { name: 'Jar Candles', description: 'Poured in glass', headerImage: '', sortOrder: 1 }, admin);
    expect(await getData('collections', 'jar-candles')).toMatchObject({ description: 'Poured in glass' });
    await expect(setDoc(doc(admin.db, 'collections', 'tealights'), { slug: 'tealights', name: 'T', sortOrder: 9 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'occasions', 'wedding'), { slug: 'birthday', name: 'W', sortOrder: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('settings/store: public read, admin-only, validated', async () => {
    const admin = clientFor(ADMIN);
    await saveStoreSettings({ freeShippingThreshold: 2000, shippingFee: 80, codEnabled: false }, admin);
    expect((await getDoc(doc(clientFor().db, 'settings', 'store'))).data()).toMatchObject({ freeShippingThreshold: 2000, shippingFee: 80 });
    await expect(setDoc(doc(clientFor(CUSTOMER).db, 'settings', 'store'), { shippingFee: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'settings', 'store'), { shippingFee: -1 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'settings', 'store'), { surprise: 1 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'settings', 'other'), {})).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(saveStoreSettings({ freeShippingThreshold: 2000 }, admin)).rejects.toThrow(/both/);
  });
});

// ===========================================================================
describe('admin editor services under the rules', () => {
  beforeEach(async () => {
    await clearBucket();
    await getAdminDb().collection('products').doc('p1').set({ name: 'P1', price: 0, priceStatus: 'missing', isActive: true, tags: ['Grounded', 'limited'], images: ['https://a', 'https://b'] });
  });

  it('details save keeps legacy tags, clears blanks; photo order and upload', async () => {
    const admin = clientFor(ADMIN);
    await updateProductDetails('p1', {
      collection: 'floral-bouquets', scentFamily: 'floral', notes: { top: ['rose'], heart: [], base: [] }, burnTimeHours: 12, weightGrams: null,
      sizeCm: null, ingredients: 'soy', shortDescription: null, description: 'Desc', badges: ['new'], occasions: ['birthday'], boxEligible: true, mrp: null
    }, ['Grounded', 'limited'], admin);
    const p = (await getData('products', 'p1'))!;
    expect(p).toMatchObject({ collection: 'floral-bouquets', tags: ['Grounded', 'new'], burnTimeHours: 12, boxEligible: true });
    expect('weightGrams' in p).toBe(false);

    await setProductImages('p1', ['https://b', 'https://a'], admin);
    expect(await getData('products', 'p1')).toMatchObject({ images: ['https://b', 'https://a'], imageUrl: 'https://b', galleryImageUrls: ['https://b', 'https://a'] });

    const buf = fs.readFileSync(PHOTO);
    const file = Object.assign(new Blob([buf], { type: 'image/jpeg' }), { name: 'Extra.jpg' });
    const next = await addProductPhotos('p1', ['https://b', 'https://a'], [file], admin);
    expect(next).toHaveLength(3);
    expect((await getData('products', 'p1'))!.images[2]).toMatch(/products%2Fp1%2F/);
    await expect(setProductImages('p1', [], clientFor(CUSTOMER))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

// ===========================================================================
describe('settings/store gating on the server', () => {
  it('no shipping settings -> cart validation and order creation refuse to quote totals; readiness reports it', async () => {
    await seedPricedProduct();
    await getAdminDb().collection('settings').doc('store').delete();
    await getAdminDb().collection('inventory').doc(PRODUCT).set({ availableQuantity: 5, reservedQuantity: 0, status: 'in_stock', inStock: true });
    await getAdminDb().collection('products').doc(PRODUCT).update({ inStock: true, inventoryStatus: 'in_stock', availableStock: 5 });

    const cart = await request(app).post('/api/cart/validate').send({ items: [{ productId: PRODUCT, quantity: 1 }] });
    expect(cart.status).toBe(503);
    expect(cart.body.error).toMatch(/Shipping is not configured/);
    const order = await request(app).post('/api/orders/create').set('Idempotency-Key', 'no-settings-key-000001')
      .send({ items: [{ productId: PRODUCT, quantity: 1 }], customer, paymentMethod: 'razorpay' });
    expect(order.status).toBe(503);
    expect((await getAdminDb().collection('orders').get()).size).toBe(0);
    expect((await getAdminDb().collection('inventoryReservations').get()).size).toBe(0);
    expect((await request(app).get('/api/checkout/readiness')).body.checks.storeSettingsConfigured).toBe(false);

    await seedStoreSettings({ freeShippingThreshold: 2000, shippingFee: 70 });
    const ok = await request(app).post('/api/cart/validate').send({ items: [{ productId: PRODUCT, quantity: 1 }] });
    expect(ok.body).toMatchObject({ shipping: 70, total: TEST_PRICE + 70 });
    const r = await request(app).get('/api/checkout/readiness');
    expect(r.body.checks.storeSettingsConfigured).toBe(true);
    expect(r.body.checkoutEnabled).toBe(false);
  });

  it('cash on delivery only when enabled with fee and limit; fee added; limit enforced', async () => {
    await seedPricedProduct();
    await getAdminDb().collection('inventory').doc(PRODUCT).set({ availableQuantity: 50, reservedQuantity: 0, status: 'in_stock', inStock: true });
    const create = (key: string, quantity = 1) =>
      request(app).post('/api/orders/create').set('Idempotency-Key', key).send({ items: [{ productId: PRODUCT, quantity }], customer, paymentMethod: 'cod' });

    const off = await create('cod-off-key-0000000001');
    expect(off.status).toBe(400);
    expect(off.body.error).toMatch(/Cash on delivery is not available/);

    await seedStoreSettings({ freeShippingThreshold: 1500, shippingFee: 99, codEnabled: true, codFee: 49, codMaxOrder: 2000 });
    const ok = await create('cod-on-key-00000000001');
    expect(ok.status).toBe(200);
    expect(ok.body.amount).toBe(TEST_PRICE + 99 + 49);
    expect(await getData('orders', ok.body.orderNumber)).toMatchObject({ codFee: 49, total: TEST_PRICE + 99 + 49, paymentMethod: 'cod' });

    const tooBig = await create('cod-big-key-0000000001', 5); // 2500 > 2000
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/up to ₹2000/);
  });
});
