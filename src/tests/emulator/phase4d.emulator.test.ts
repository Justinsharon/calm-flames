/**
 * Phase 4D against the Firestore + Storage emulators: real security rules through the browser
 * SDK (as guest, shopper, other shopper, admin), real Express routes, real firebase-admin.
 * Mocked: ONLY the Gemini HTTP API (global fetch stubbed for generativelanguage.googleapis.com).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { app } from '../../../server';
import { getAdminDb, getAdminBucket } from '../../server/firestoreAdmin';
import { recordPurchases } from '../../server/purchases';
import { resetRateLimits } from '../../server/rateLimit';
import { addFavourite, getAddresses, getFavourites, getMyOrders, mergeLocalFavourites, saveAddress } from '../../services/accountService';
import { submitReview, getApprovedReviews, reviewEligibility, setReviewStatus } from '../../services/reviewsService';
import { uploadSupportPhoto } from '../../services/supportService';
import { clearFirestore, realFetch, getData, jsonResponse, seedStoreSettings, TEST_SHIPPING } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const ADMIN = { uid: 'admin-uid', email: 'owner@example.com', admin: true };
const ASHA = { uid: 'asha-uid', email: 'asha@example.com' };
const RAVI = { uid: 'ravi-uid', email: 'ravi@example.com' };
const denied = { code: 'permission-denied' };
const storageDenied = { code: 'storage/unauthorized' };
const customer = { fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', addressLine1: '1 Lane', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
const ADDRESS = { fullName: 'Asha Rao', phone: '9876543210', addressLine1: '12 Lotus Residency', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true };

// Fixture products for the EMULATOR (prices are test values, never real shop prices).
async function seedProduct(id: string, over: Record<string, any> = {}) {
  await getAdminDb().collection('products').doc(id).set({
    id, slug: id, name: id.replace(/-/g, ' '), price: 650, priceStatus: 'active', isActive: true, isHistorical: false,
    inStock: true, inventoryStatus: 'in_stock', availableStock: 5, categories: [], moods: [], ...over
  });
  await getAdminDb().collection('inventory').doc(id).set({ productId: id, quantity: 5, availableQuantity: 5, reservedQuantity: 0, inStock: true, status: 'in_stock' });
}

let gemini: (body: any) => Response | Promise<Response>;
let geminiCalls: any[] = [];
beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'run via npm run test:emulator').toBeTruthy();
  vi.stubGlobal('fetch', async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      const body = JSON.parse(String(init?.body));
      geminiCalls.push({ url, headers: init?.headers, body });
      return gemini(body);
    }
    return realFetch(input, init);
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await deleteClientApps();
});
beforeEach(async () => {
  await clearFirestore();
  geminiCalls = [];
  delete process.env.GEMINI_API_KEY;
  const db = getAdminDb();
  await db.collection('customers').doc(ADMIN.uid).set({ role: 'admin' });
  await db.collection('customers').doc(ASHA.uid).set({ role: 'customer' });
  await db.collection('customers').doc(RAVI.uid).set({ role: 'customer' });
});

// ===========================================================================
describe('rules: removed and server-only collections', () => {
  it('payments: no client may write (not even for their own customerId)', async () => {
    for (const who of [clientFor(), clientFor(ASHA), clientFor(ADMIN)]) {
      await expect(setDoc(doc(who.db, 'payments', 'p1'), { customerId: ASHA.uid, amount: 1 })).rejects.toMatchObject(denied);
    }
    await getAdminDb().collection('payments').doc('p2').set({ customerId: ASHA.uid, amount: 100 });
    expect((await getDoc(doc(clientFor(ASHA).db, 'payments', 'p2'))).exists()).toBe(true); // own read still allowed
    await expect(getDoc(doc(clientFor(RAVI).db, 'payments', 'p2'))).rejects.toMatchObject(denied);
  });
  it('rewards, rewardTransactions, rituals, moodInteractions, analyticsEvents are closed', async () => {
    const a = clientFor(ASHA);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'rewards', 'balance'), { points: 99999 })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'rewardTransactions', 't'), { points: 500 })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'rituals', 'r'), { title: 'x' })).rejects.toMatchObject(denied);
    for (const who of [clientFor(), a]) {
      await expect(addDoc(collection(who.db, 'moodInteractions'), { mood: 'calm' })).rejects.toMatchObject(denied);
      await expect(addDoc(collection(who.db, 'analyticsEvents'), { event: 'view' })).rejects.toMatchObject(denied);
    }
  });
  it('purchases are server-written only; supportRequests are admin-only and never client-created', async () => {
    const a = clientFor(ASHA);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'purchases', 'peony'), { productId: 'peony' })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'supportRequests', 'x'), { name: 'A', status: 'open' })).rejects.toMatchObject(denied);
    await getAdminDb().collection('supportRequests').doc('s1').set({ name: 'A', status: 'open', message: 'hi' });
    await expect(getDoc(doc(a.db, 'supportRequests', 's1'))).rejects.toMatchObject(denied);
    await expect(getDoc(doc(clientFor().db, 'supportRequests', 's1'))).rejects.toMatchObject(denied);
    const admin = clientFor(ADMIN);
    expect((await getDoc(doc(admin.db, 'supportRequests', 's1'))).data()).toMatchObject({ name: 'A' });
    await updateDoc(doc(admin.db, 'supportRequests', 's1'), { status: 'resolved', updatedAt: 'now' });
    await expect(updateDoc(doc(admin.db, 'supportRequests', 's1'), { message: 'edited' })).rejects.toMatchObject(denied);
    await expect(updateDoc(doc(admin.db, 'supportRequests', 's1'), { status: 'bogus' })).rejects.toMatchObject(denied);
  });
});

describe('reviews: verified buyers only, pending until approved', () => {
  const body = (over: Record<string, any> = {}) => ({ productId: 'peony', customerId: ASHA.uid, authorName: 'Asha', rating: 5, body: 'Lovely', status: 'pending', createdAt: 'now', ...over });

  it('non-buyers cannot review; buyers can, only as pending, only under their own id', async () => {
    const a = clientFor(ASHA);
    await expect(setDoc(doc(a.db, 'reviews', `${ASHA.uid}_peony`), body())).rejects.toMatchObject(denied);
    expect(await reviewEligibility(ASHA.uid, 'peony', a.db)).toBe('not-buyer');
    await getAdminDb().doc(`customers/${ASHA.uid}/purchases/peony`).set({ productId: 'peony', orderNumber: 'TCF-111111' });
    expect(await reviewEligibility(ASHA.uid, 'peony', a.db)).toBe('can');
    await expect(setDoc(doc(a.db, 'reviews', `${ASHA.uid}_peony`), body({ status: 'approved' }))).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'reviews', 'random-id'), body())).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'reviews', `${ASHA.uid}_peony`), body({ rating: 9 }))).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'reviews', `${ASHA.uid}_peony`), body({ isVerified: true }))).rejects.toMatchObject(denied);
    // Ravi has not bought it and cannot post as Asha either
    await expect(setDoc(doc(clientFor(RAVI).db, 'reviews', `${RAVI.uid}_peony`), body({ customerId: RAVI.uid }))).rejects.toMatchObject(denied);
    await submitReview({ uid: ASHA.uid, productId: 'peony', authorName: 'Asha Rao', rating: 4, body: 'Lovely scent' }, a.db);
    expect(await reviewEligibility(ASHA.uid, 'peony', a.db)).toBe('reviewed');
    expect(await getData('reviews', `${ASHA.uid}_peony`)).toMatchObject({ status: 'pending', rating: 4 });
  });

  it('public sees approved only; author sees own pending; only admin approves', async () => {
    const db = getAdminDb();
    await db.collection('reviews').doc(`${ASHA.uid}_peony`).set(body());
    await db.collection('reviews').doc(`${RAVI.uid}_peony`).set(body({ customerId: RAVI.uid, status: 'approved', body: 'Approved one' }));
    const guest = clientFor();
    await expect(getDoc(doc(guest.db, 'reviews', `${ASHA.uid}_peony`))).rejects.toMatchObject(denied);
    expect((await getDoc(doc(clientFor(ASHA).db, 'reviews', `${ASHA.uid}_peony`))).exists()).toBe(true);
    expect((await getApprovedReviews('peony', guest.db)).map((r) => r.body)).toEqual(['Approved one']);
    await expect(getDocs(query(collection(guest.db, 'reviews'), where('productId', '==', 'peony')))).rejects.toMatchObject(denied);
    await expect(updateDoc(doc(clientFor(ASHA).db, 'reviews', `${ASHA.uid}_peony`), { status: 'approved' })).rejects.toMatchObject(denied);
    const admin = clientFor(ADMIN);
    await setReviewStatus(`${ASHA.uid}_peony`, 'approved', admin.db);
    await expect(updateDoc(doc(admin.db, 'reviews', `${ASHA.uid}_peony`), { body: 'rewritten' })).rejects.toMatchObject(denied);
    expect(await getApprovedReviews('peony', guest.db)).toHaveLength(2);
  });

  it('the server records purchases for a signed-in customer order (incl. box contents)', async () => {
    await getAdminDb().collection('orders').doc('TCF-222222').set({
      orderNumber: 'TCF-222222', customerId: ASHA.uid,
      lines: [{ kind: 'product', productId: 'peony' }, { kind: 'box', contents: [{ productId: 'laddoo' }, { productId: 'modak' }] }]
    });
    expect(await recordPurchases('TCF-222222')).toBe(3);
    expect((await getAdminDb().collection(`customers/${ASHA.uid}/purchases`).get()).docs.map((d) => d.id).sort()).toEqual(['laddoo', 'modak', 'peony']);
    await getAdminDb().collection('orders').doc('TCF-333333').set({ orderNumber: 'TCF-333333', lines: [{ kind: 'product', productId: 'urli' }] });
    expect(await recordPurchases('TCF-333333')).toBe(0); // guest order: nothing recorded
  });
});

describe('favourites (customers/{uid}/wishlist)', () => {
  it('owner-only, validated docs', async () => {
    const a = clientFor(ASHA);
    await addFavourite(ASHA.uid, 'peony', a.db);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'wishlist', 'x'), { productId: 'y', addedAt: 'now' })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'wishlist', 'x'), { productId: 'x', addedAt: 'now', price: 1 })).rejects.toMatchObject(denied);
    await expect(addFavourite(ASHA.uid, 'urli', clientFor(RAVI).db)).rejects.toMatchObject(denied);
    await expect(getFavourites(ASHA.uid, clientFor().db)).rejects.toMatchObject(denied);
    expect(await getFavourites(ASHA.uid, a.db)).toEqual(['peony']);
  });
  it('first sign-in merges the device list into the account, keeping existing items, without duplicates', async () => {
    const a = clientFor(ASHA);
    await addFavourite(ASHA.uid, 'peony', a.db);
    const merged = await mergeLocalFavourites(ASHA.uid, ['urli', 'peony', 'urli', '../bad id'], a.db);
    expect(merged.sort()).toEqual(['peony', 'urli']);
    expect((await getFavourites(ASHA.uid, a.db)).sort()).toEqual(['peony', 'urli']);
    expect(await mergeLocalFavourites(ASHA.uid, [], a.db)).toHaveLength(2);
  });
});

describe('saved addresses', () => {
  it('owner-only, Indian pincode/mobile enforced by rules, one default', async () => {
    const a = clientFor(ASHA);
    const first = await saveAddress(ASHA.uid, ADDRESS, a.db);
    const second = await saveAddress(ASHA.uid, { ...ADDRESS, label: 'Office', addressLine1: 'MG Road', isDefault: true }, a.db);
    const list = await getAddresses(ASHA.uid, a.db);
    expect(list.find((x) => x.id === second)?.isDefault).toBe(true);
    expect(list.find((x) => x.id === first)?.isDefault).toBe(false);
    const bad = { ...ADDRESS, updatedAt: 'now' };
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'addresses', 'b1'), { ...bad, pincode: '011001' })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'addresses', 'b2'), { ...bad, phone: '12345' })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(a.db, 'customers', ASHA.uid, 'addresses', 'b3'), { ...bad, role: 'admin' })).rejects.toMatchObject(denied);
    await expect(saveAddress(ASHA.uid, ADDRESS, clientFor(RAVI).db)).rejects.toMatchObject(denied);
    await expect(getAddresses(ASHA.uid, clientFor(RAVI).db)).rejects.toMatchObject(denied);
    await expect(saveAddress(ASHA.uid, { ...ADDRESS, pincode: '12' }, a.db)).rejects.toThrow(/pincode/);
  });
});

describe('Orders tab: rules-limited read', () => {
  it('a customer lists only their own orders (with tracking links)', async () => {
    const db = getAdminDb();
    await db.collection('orders').doc('TCF-100001').set({ orderNumber: 'TCF-100001', customerId: ASHA.uid, createdAt: '2026-11-20', status: 'SHIPPED', total: 1200, trackingUrl: 'https://track.example/1', lines: [{ kind: 'product', productName: 'Peony' }] });
    await db.collection('orders').doc('TCF-100002').set({ orderNumber: 'TCF-100002', customerId: RAVI.uid, createdAt: '2026-11-21', status: 'CONFIRMED', total: 900 });
    const mine = await getMyOrders(ASHA.uid, clientFor(ASHA).db);
    expect(mine).toEqual([expect.objectContaining({ orderNumber: 'TCF-100001', trackingUrl: 'https://track.example/1', summary: 'Peony' })]);
    await expect(getMyOrders(ASHA.uid, clientFor(RAVI).db)).rejects.toMatchObject(denied);
    await expect(getDocs(collection(clientFor(ASHA).db, 'orders'))).rejects.toMatchObject(denied);
  });
  it('an invalid sign-in token on checkout is refused (401), never silently attached', async () => {
    await seedStoreSettings({ ...TEST_SHIPPING, codEnabled: true, codFee: 49, codMaxOrder: 5000 });
    await seedProduct('peony');
    const res = await request(app).post('/api/orders/create').set('Idempotency-Key', 'phase4d-token-test-key-1').set('Authorization', 'Bearer not-a-real-token')
      .send({ items: [{ productId: 'peony', quantity: 1 }], customer, paymentMethod: 'cod' });
    expect(res.status).toBe(401);
    expect((await getAdminDb().collection('orders').get()).size).toBe(0);
  });
});

describe('Help & Support: order lookup by number + phone', () => {
  beforeEach(async () => {
    await getAdminDb().collection('orders').doc('TCF-654321').set({
      orderNumber: 'TCF-654321', status: 'SHIPPED', paymentStatus: 'PAID', trackingUrl: 'https://track.example/654321', createdAt: '2026-11-20T10:00:00Z',
      customer: { ...customer, phone: '9876543210' }, total: 1234, items: [{ productId: 'peony', quantity: 1 }]
    });
  });
  it('both must match; the answer is status + tracking link only', async () => {
    const ok = await request(app).post('/api/orders/lookup').send({ orderNumber: 'tcf-654321', phone: '+91 98765 43210' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ orderNumber: 'TCF-654321', status: 'SHIPPED', paymentStatus: 'PAID', trackingUrl: 'https://track.example/654321', placedAt: '2026-11-20T10:00:00Z' });
    for (const body of [{ orderNumber: 'TCF-654321', phone: '9876500000' }, { orderNumber: 'TCF-000000', phone: '9876543210' }, { orderNumber: 'TCF-654321' }, { orderNumber: '../x', phone: '9876543210' }]) {
      const r = await request(app).post('/api/orders/lookup').send(body);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'We could not find an order with that number and phone.' });
    }
  });
});

describe('Help & Support: requests with an optional photo', () => {
  const png = (bytes = 1024) => new Uint8Array(bytes).fill(7);
  beforeEach(async () => {
    const [files] = await getAdminBucket().getFiles({ prefix: 'support/' });
    await Promise.all(files.map((f: any) => f.delete()));
  });

  it('storage rules: guests may add one small image under a new support folder; nothing else', async () => {
    const guest = clientFor();
    const id = '0a1b2c3d-1111-4222-8333-444455556666';
    await uploadBytes(ref(guest.storage, `support/${id}/photo.png`), png(), { contentType: 'image/png' });
    await expect(uploadBytes(ref(guest.storage, `support/${id}/photo.png`), png(), { contentType: 'image/png' })).rejects.toMatchObject(storageDenied); // no overwrite
    await expect(uploadBytes(ref(guest.storage, 'support/22222222-1111-4222-8333-444455556666/photo.png'), png(5 * 1024 * 1024 + 1), { contentType: 'image/png' })).rejects.toMatchObject(storageDenied);
    await expect(uploadBytes(ref(guest.storage, 'support/33333333-1111-4222-8333-444455556666/photo.png'), png(), { contentType: 'text/html' })).rejects.toMatchObject(storageDenied);
    await expect(uploadBytes(ref(guest.storage, 'support/33333333-1111-4222-8333-444455556666/evil.svg'), png(), { contentType: 'image/png' })).rejects.toMatchObject(storageDenied);
    await expect(uploadBytes(ref(guest.storage, 'support/not-a-uuid/photo.png'), png(), { contentType: 'image/png' })).rejects.toMatchObject(storageDenied);
    await expect(getBytes(ref(guest.storage, `support/${id}/photo.png`))).rejects.toMatchObject(storageDenied);
    await expect(getBytes(ref(clientFor(ASHA).storage, `support/${id}/photo.png`))).rejects.toMatchObject(storageDenied);
    expect((await getBytes(ref(clientFor(ADMIN).storage, `support/${id}/photo.png`))).byteLength).toBe(1024);
  });

  it('a damaged-item request with a photo is saved for the admin; bad input is refused', async () => {
    const path = await uploadSupportPhoto(new Blob([png(2048)], { type: 'image/jpeg' }) as any, clientFor().storage);
    expect(path).toMatch(/^support\/[0-9a-f-]{36}\/photo\.jpg$/);
    const res = await request(app).post('/api/support').send({ type: 'damaged', name: 'Asha', phone: '98765 43210', orderNumber: 'tcf-654321', message: 'The jar arrived cracked.', photoPath: path });
    expect(res.status).toBe(200);
    const saved = await getData('supportRequests', res.body.id);
    expect(saved).toMatchObject({ type: 'damaged', phone: '9876543210', orderNumber: 'TCF-654321', status: 'open', photo: { path, contentType: 'image/jpeg', size: 2048 } });
    expect(saved).not.toHaveProperty('photoPath');
    // same photo cannot be attached twice
    expect((await request(app).post('/api/support').send({ type: 'damaged', name: 'A', phone: '9876543210', orderNumber: 'TCF-654321', message: 'again', photoPath: path })).status).toBe(409);

    const bad = [
      { type: 'other', name: 'A', phone: '9876543210', message: 'x' },
      { type: 'callback', name: 'A', phone: '123', message: 'x' },
      { type: 'damaged', name: 'A', phone: '9876543210', message: 'no order number' },
      { type: 'callback', name: 'A', phone: '9876543210', message: 'x'.repeat(1001) },
      { type: 'callback', name: 'A', phone: '9876543210', message: 'x', photoPath: 'products/peony/photo.jpg' },
      { type: 'callback', name: 'A', phone: '9876543210', message: 'x', photoPath: 'support/44444444-1111-4222-8333-444455556666/photo.png' } // never uploaded
    ];
    for (const b of bad) expect((await request(app).post('/api/support').send(b)).status).toBe(400);
  });

  it('a file that is not an allowed image (placed around the rules) is rejected and deleted', async () => {
    const path = 'support/55555555-1111-4222-8333-444455556666/photo.png';
    await getAdminBucket().file(path).save(Buffer.from('<svg/>'), { contentType: 'image/svg+xml' });
    const res = await request(app).post('/api/support').send({ type: 'callback', name: 'A', phone: '9876543210', message: 'hi', photoPath: path });
    expect(res.status).toBe(400);
    expect((await getAdminBucket().file(path).exists())[0]).toBe(false);
  });

  it('a call-back without a photo works', async () => {
    const res = await request(app).post('/api/support').send({ type: 'callback', name: 'Ravi', phone: '9123456789', message: 'Please call about corporate gifting.', preferredTime: 'after 6 pm' });
    expect(res.status).toBe(200);
    expect(await getData('supportRequests', res.body.id)).toMatchObject({ type: 'callback', photo: null, preferredTime: 'after 6 pm' });
  });
});

describe('gift guide: grounded on active, priced, in-stock products (Gemini mocked at HTTP)', () => {
  beforeEach(async () => {
    await seedProduct('peony-bloom', { name: 'Peony Bloom', price: 650, notes: { top: ['peony', 'rose'] }, occasions: ['mothers-day'] });
    await seedProduct('royal-urli', { name: 'Royal Urli', price: 2450, notes: { top: ['jasmine'] }, occasions: ['housewarming', 'diwali'] });
    await seedProduct('mogra-jar', { name: 'Mogra Jar', price: 899, notes: { top: ['mogra'] } });
    await seedProduct('unpriced-jar', { price: 0, priceStatus: 'missing' });
    await seedProduct('sold-out', { inStock: false, inventoryStatus: 'out_of_stock' });
    await seedProduct('hidden', { isActive: false });
  });
  const geminiReply = (suggestions: any[]) => jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ suggestions }) }] } }] });

  it('without a key: deterministic keyword match over the grounded list only', async () => {
    const res = await request(app).post('/api/gift-guide').send({ message: 'For my mother, something floral' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.suggestions[0]).toMatchObject({ productId: 'peony-bloom', name: 'Peony Bloom', price: 650 });
    expect(res.body.suggestions.map((s: any) => s.productId)).not.toEqual(expect.arrayContaining(['unpriced-jar']));
    const budget = await request(app).post('/api/gift-guide').send({ message: 'Under ₹1,000' });
    expect(budget.body.suggestions.every((s: any) => s.price <= 1000)).toBe(true);
    expect(geminiCalls).toHaveLength(0);
  });

  it('with a key: only grounded products are sent; invented ids and prices are dropped', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    gemini = () => geminiReply([
      { productId: 'invented-candle', reason: 'Does not exist' },
      { productId: 'unpriced-jar', reason: 'Not priced' },
      { productId: 'royal-urli', reason: 'A centrepiece for a new home. Only ₹99!' },
      { productId: 'mogra-jar', reason: 'Soft jasmine-like mogra.' },
      { productId: 'royal-urli', reason: 'duplicate' }
    ]);
    const res = await request(app).post('/api/gift-guide').send({ message: 'housewarming' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ai');
    expect(res.body.suggestions).toEqual([
      expect.objectContaining({ productId: 'royal-urli', price: 2450, name: 'Royal Urli' }),
      expect.objectContaining({ productId: 'mogra-jar', price: 899 })
    ]);
    const call = geminiCalls[0];
    expect(call.headers['x-goog-api-key']).toBe('test-key');
    expect(call.url).not.toContain('test-key');
    const prompt = call.body.contents[0].parts[0].text as string;
    expect(prompt).toContain('peony-bloom');
    for (const id of ['unpriced-jar', 'sold-out', 'hidden']) expect(prompt).not.toContain(id);
  });

  it('a model failure or a thin answer falls back to the keyword match', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    gemini = () => jsonResponse({ error: 'overloaded' }, 503);
    expect((await request(app).post('/api/gift-guide').send({ message: 'jasmine' })).body.source).toBe('fallback');
    gemini = () => geminiReply([{ productId: 'invented', reason: 'x' }]);
    const r = await request(app).post('/api/gift-guide').send({ message: 'jasmine' });
    expect(r.body.source).toBe('fallback');
    expect(r.body.suggestions[0].productId).toBe('royal-urli');
  });

  it('input is required and capped', async () => {
    expect((await request(app).post('/api/gift-guide').send({ message: '' })).status).toBe(400);
    expect((await request(app).post('/api/gift-guide').send({ message: 'x'.repeat(301) })).status).toBe(400);
  });
});

describe('rate limits on public POSTs', () => {
  it('order lookup answers 429 after its per-IP limit', async () => {
    process.env.RATE_LIMIT_DISABLED = '0';
    resetRateLimits();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) codes.push((await request(app).post('/api/orders/lookup').send({ orderNumber: 'TCF-000000', phone: '9876543210' })).status);
      expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
      const g = await request(app).post('/api/gift-guide').send({ message: 'x' });
      expect(g.status).not.toBe(429); // separate budget per endpoint
    } finally {
      process.env.RATE_LIMIT_DISABLED = '1';
      resetRateLimits();
    }
  });
});
