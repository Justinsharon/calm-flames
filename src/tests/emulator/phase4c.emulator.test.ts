/**
 * Phase 4C against the Firestore emulator: real firebase-admin, real Express routes, real
 * security rules through the browser SDK. Mocked: ONLY the Razorpay HTTP API (global fetch is
 * stubbed for api.razorpay.com) and, in one test, the mail provider object.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { app } from '../../../server';
import { getAdminDb } from '../../server/firestoreAdmin';
import { migrateCoupons } from '../../../scripts/catalog/migrateCoupons';
import { sendOrderConfirmation, type Mailer } from '../../server/mailer';
import { hashViewToken } from '../../server/orderView';
import { clearFirestore, realFetch, getData, jsonResponse, seedStoreSettings, TEST_SHIPPING } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const customer = { fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', addressLine1: '1 Lane', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
const ADMIN = { uid: 'admin-uid', email: 'owner@example.com', admin: true };
const SHOPPER = { uid: 'shopper-uid', email: 'shopper@example.com' };

// Fixture values for the EMULATOR only (the owner enters real ones in Firebase).
const BOX = { sizes: [{ count: 2, price: 300 }, { count: 3, price: 450 }], ribbons: ['Gold'], addOns: [{ name: 'Matchbox', price: 99 }] };
const COD = { codEnabled: true, codFee: 49, codMaxOrder: 3000 };

async function seedProduct(id: string, price: number, stock: number, extra: Record<string, any> = {}) {
  const db = getAdminDb();
  await db.collection('products').doc(id).set({ id, slug: id, name: id, price, priceStatus: price > 0 ? 'active' : 'missing', isActive: true, isHistorical: false, boxEligible: true, categories: [], moods: [],
    inStock: stock > 0, inventoryStatus: stock > 0 ? 'in_stock' : 'out_of_stock', availableStock: stock, ...extra });
  await db.collection('inventory').doc(id).set({ productId: id, quantity: stock, availableQuantity: stock, reservedQuantity: 0, inStock: stock > 0, status: stock > 0 ? 'in_stock' : 'out_of_stock' });
}
async function seedShop(settings: Record<string, any> = {}) {
  await seedStoreSettings({ ...TEST_SHIPPING, buildABox: BOX, ...COD, ...settings });
  await seedProduct('laddoo', 450, 5);
  await seedProduct('modak', 650, 5);
  await seedProduct('urli', 2450, 5, { boxEligible: false });
}

let keySeq = 0;
const key = () => `phase4c-test-key-${Date.now()}-${++keySeq}`;
const create = (body: Record<string, any>) =>
  request(app).post('/api/orders/create').set('Idempotency-Key', key()).send({ customer, paymentMethod: 'cod', ...body });
const quote = (body: Record<string, any>) => request(app).post('/api/cart/quote').send(body);
const box3 = { kind: 'box', boxSize: 3, productIds: ['laddoo', 'laddoo', 'modak'], ribbon: 'Gold', addOns: ['Matchbox'], message: 'Happy Diwali', quantity: 1 };
const inv = (id: string) => getData('inventory', id);

let rzpCalls = 0;
beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'run via npm run test:emulator').toBeTruthy();
  vi.stubGlobal('fetch', async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.razorpay.com/')) {
      rzpCalls++;
      return jsonResponse({ id: `order_rzp_${rzpCalls}` });
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
  rzpCalls = 0;
  await getAdminDb().collection('customers').doc(ADMIN.uid).set({ role: 'admin' });
  await getAdminDb().collection('customers').doc(SHOPPER.uid).set({ role: 'customer' });
});
afterEach(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

describe('cart quote with and without settings/store', () => {
  it('no settings: the cart is priced but no totals are quoted (503)', async () => {
    await seedProduct('laddoo', 450, 5);
    const res = await quote({ items: [{ productId: 'laddoo', quantity: 1 }] });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Shipping is not configured/);
  });
  it('no buildABox: a box line is refused even with shipping set', async () => {
    await seedShop({ buildABox: null });
    const res = await quote({ items: [box3] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Build a Box is not available/);
  });
  it('with settings: subtotal, shipping, COD availability and line totals from Firestore', async () => {
    await seedShop();
    const res = await quote({ items: [{ productId: 'laddoo', quantity: 1 }, box3] });
    expect(res.status).toBe(200);
    const boxUnit = 450 + 450 + 450 + 650 + 99;
    expect(res.body.items.map((l: any) => l.totalPrice)).toEqual([450, boxUnit]);
    expect(res.body).toMatchObject({ subtotal: 450 + boxUnit, shipping: 0, total: 450 + boxUnit, cod: { available: true, fee: 49 }, checkoutEnabled: true });
    // owner changes a price: the very next quote uses it
    await getAdminDb().collection('products').doc('laddoo').update({ price: 500 });
    expect((await quote({ items: [{ productId: 'laddoo', quantity: 1 }] })).body).toMatchObject({ subtotal: 500, shipping: 99, total: 599, amountToFreeShipping: 1000 });
  });
  it('a box is validated against stock for all its candles', async () => {
    await seedShop();
    await getAdminDb().collection('products').doc('laddoo').update({ availableStock: 1 });
    const res = await quote({ items: [box3] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Requested 2, available: 1/);
  });
});

describe('box orders reserve every candle inside', () => {
  it('one box line → priced lines on the order, inventory reserved per candle', async () => {
    await seedShop();
    const res = await create({ items: [box3, { productId: 'modak', quantity: 1 }], giftMessage: 'With love' });
    expect(res.status).toBe(200);
    const o = await getData('orders', res.body.orderNumber);
    expect(o!.lines[0]).toMatchObject({ kind: 'box', boxSize: 3, boxPrice: 450, ribbon: 'Gold', message: 'Happy Diwali', addOns: [{ name: 'Matchbox', price: 99 }] });
    expect(o!.subtotal).toBe(2099 + 650);
    expect(o!.giftMessage).toBe('With love');
    expect(await inv('laddoo')).toMatchObject({ availableQuantity: 3, reservedQuantity: 2 });
    expect(await inv('modak')).toMatchObject({ availableQuantity: 3, reservedQuantity: 2 });
    const r = await getData('inventoryReservations', o!.reservationId);
    expect(r!.items).toEqual(expect.arrayContaining([{ productId: 'laddoo', quantity: 2 }, { productId: 'modak', quantity: 2 }]));
  });
  it('a box with a non-eligible candle is refused and nothing is reserved', async () => {
    await seedShop();
    const res = await create({ items: [{ ...box3, productIds: ['laddoo', 'modak', 'urli'] }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot go in a gift box/);
    expect(await inv('laddoo')).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
    expect((await getAdminDb().collection('orders').get()).size).toBe(0);
  });
  it('a client-sent price is ignored', async () => {
    await seedShop();
    const res = await create({ items: [{ productId: 'laddoo', quantity: 1, price: 1, unitPrice: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(450 + 49 + 99); // price + COD fee + shipping, all from Firestore
  });
});

describe('COD gating', () => {
  it('refused when COD is not enabled (or its fee/limit unset)', async () => {
    await seedShop({ codEnabled: false });
    expect((await create({ items: [{ productId: 'laddoo', quantity: 1 }] })).body.error).toBe('Cash on delivery is not available.');
    await seedStoreSettings({ ...TEST_SHIPPING, codEnabled: true });
    expect((await create({ items: [{ productId: 'laddoo', quantity: 1 }] })).status).toBe(400);
  });
  it('refused above the COD maximum; allowed under it with the fee', async () => {
    await seedShop();
    const big = await create({ items: [{ productId: 'urli', quantity: 2 }] });
    expect(big.status).toBe(400);
    expect(big.body.error).toMatch(/up to ₹3000/);
    const ok = await create({ items: [{ productId: 'urli', quantity: 1 }] });
    expect(ok.status).toBe(200);
    expect(await getData('orders', ok.body.orderNumber)).toMatchObject({ codFee: 49, total: 2450 + 49, shipping: 0, paymentMethod: 'cod' });
  });
});

describe('coupons from Firestore', () => {
  it('migration creates CALM10 and FIRSTFLAME inactive, create-only', async () => {
    await getAdminDb().collection('coupons').doc('FIRSTFLAME').set({ code: 'FIRSTFLAME', type: 'fixed', value: 200, minOrder: 0, active: true });
    const r = await migrateCoupons(getAdminDb());
    expect(r).toEqual({ created: ['CALM10'], existing: ['FIRSTFLAME'] });
    expect(await getData('coupons', 'CALM10')).toMatchObject({ type: 'percent', value: 10, minOrder: 500, maxDiscount: 500, active: false });
    expect(await getData('coupons', 'FIRSTFLAME')).toMatchObject({ value: 200, active: true }); // untouched
  });
  it('an inactive migrated code gives no discount; the owner turning it on makes it apply', async () => {
    await seedShop();
    await migrateCoupons(getAdminDb());
    const items = [{ productId: 'modak', quantity: 2 }];
    expect((await quote({ items, couponCode: 'calm10' })).body).toMatchObject({ discount: 0, couponMessage: 'This code is not valid.' });
    await getAdminDb().collection('coupons').doc('CALM10').update({ active: true });
    expect((await quote({ items, couponCode: 'calm10' })).body).toMatchObject({ discount: 130, couponCode: 'CALM10', total: 1300 - 130 + 99 });
    const res = await create({ items, couponCode: 'CALM10', paymentMethod: 'cod' });
    expect(await getData('orders', res.body.orderNumber)).toMatchObject({ discount: 130, couponCode: 'CALM10' });
  });
  it('expired or below-minimum codes give no discount', async () => {
    await seedShop();
    await getAdminDb().collection('coupons').doc('OLD').set({ code: 'OLD', type: 'fixed', value: 100, minOrder: 0, active: true, expiresAt: '2020-01-01T00:00:00Z' });
    await getAdminDb().collection('coupons').doc('BIGONLY').set({ code: 'BIGONLY', type: 'fixed', value: 100, minOrder: 5000, active: true });
    expect((await quote({ items: [{ productId: 'laddoo', quantity: 1 }], couponCode: 'OLD' })).body).toMatchObject({ discount: 0, couponMessage: 'This code has expired.' });
    expect((await quote({ items: [{ productId: 'laddoo', quantity: 1 }], couponCode: 'BIGONLY' })).body).toMatchObject({ discount: 0 });
  });
  it('rules: coupons cannot be read by shoppers; admins write only valid docs', async () => {
    await getAdminDb().collection('coupons').doc('SECRET').set({ code: 'SECRET', type: 'fixed', value: 100, minOrder: 0, active: true });
    for (const who of [clientFor(), clientFor(SHOPPER)]) {
      await expect(getDoc(doc(who.db, 'coupons', 'SECRET'))).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(doc(who.db, 'coupons', 'MINE'), { code: 'MINE', type: 'fixed', value: 999, minOrder: 0, active: true })).rejects.toMatchObject({ code: 'permission-denied' });
    }
    const admin = clientFor(ADMIN);
    await setDoc(doc(admin.db, 'coupons', 'DIWALI'), { code: 'DIWALI', type: 'percent', value: 15, minOrder: 999, maxDiscount: 300, active: false });
    await expect(setDoc(doc(admin.db, 'coupons', 'BAD'), { code: 'BAD', type: 'percent', value: 150, minOrder: 0, active: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'coupons', 'MISMATCH'), { code: 'OTHER', type: 'fixed', value: 10, minOrder: 0, active: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await deleteDoc(doc(admin.db, 'coupons', 'DIWALI'));
  });
});

describe('order view token', () => {
  it('the confirmed page loads only with the token returned at creation', async () => {
    await seedShop();
    const res = await create({ items: [{ productId: 'laddoo', quantity: 1 }] });
    const { orderNumber, viewToken } = res.body;
    expect(viewToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const stored = await getData('orders', orderNumber);
    expect(stored!.viewTokenHash).toBe(hashViewToken(viewToken));
    expect(JSON.stringify(stored)).not.toContain(viewToken);

    const ok = await request(app).get(`/api/orders/${orderNumber}/view`).set('X-Order-Token', viewToken);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ orderNumber, firstName: 'Asha', city: 'Pune', paymentMethod: 'cod', total: 450 + 99 + 49 });
    expect(JSON.stringify(ok.body)).not.toMatch(/asha@example|9876543210|1 Lane/);

    const guess = await request(app).get(`/api/orders/${orderNumber}/view`);
    const wrong = await request(app).get(`/api/orders/${orderNumber}/view`).set('X-Order-Token', 'A'.repeat(32));
    const missing = await request(app).get('/api/orders/TCF-000000/view').set('X-Order-Token', viewToken);
    for (const r of [guess, wrong, missing]) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'Order not found.' });
    }
  });
  it('a retried attempt (same idempotency key) returns the same token', async () => {
    await seedShop();
    const k = key();
    const body = { items: [{ productId: 'laddoo', quantity: 1 }], customer, paymentMethod: 'cod' };
    const a = await request(app).post('/api/orders/create').set('Idempotency-Key', k).send(body);
    const b = await request(app).post('/api/orders/create').set('Idempotency-Key', k).send(body);
    expect(b.body.orderNumber).toBe(a.body.orderNumber);
    expect(b.body.viewToken).toBe(a.body.viewToken);
  });
  it('Razorpay order: the response carries the public key ID and the token (Razorpay HTTP mocked)', async () => {
    await seedShop();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_public';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
    const res = await create({ items: [box3], paymentMethod: 'razorpay' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ razorpayOrderId: 'order_rzp_1', razorpayKeyId: 'rzp_test_public', codFee: 0 });
    expect(JSON.stringify(res.body)).not.toContain('rzp_test_secret');
    expect(rzpCalls).toBe(1);
    const view = await request(app).get(`/api/orders/${res.body.orderNumber}/view`).set('X-Order-Token', res.body.viewToken);
    expect(view.body).toMatchObject({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING', lines: [{ kind: 'box', name: 'Gift box of 3' }] });
  });
  it('the tracking URL the owner pastes shows on the page (https only)', async () => {
    await seedShop();
    const res = await create({ items: [{ productId: 'laddoo', quantity: 1 }] });
    const admin = clientFor(ADMIN);
    await updateDoc(doc(admin.db, 'orders', res.body.orderNumber), { trackingUrl: 'https://track.example/123', status: 'SHIPPED', updatedAt: new Date().toISOString() });
    const view = await request(app).get(`/api/orders/${res.body.orderNumber}/view`).set('X-Order-Token', res.body.viewToken);
    expect(view.body).toMatchObject({ status: 'SHIPPED', trackingUrl: 'https://track.example/123' });
  });
});

describe('order rules', () => {
  it('no client can create an order; admins change fulfilment fields only', async () => {
    await seedShop();
    for (const who of [clientFor(), clientFor(SHOPPER), clientFor(ADMIN)]) {
      await expect(setDoc(doc(who.db, 'orders', 'TCF-999999'), { customerId: 'x', total: 1, items: [] })).rejects.toMatchObject({ code: 'permission-denied' });
    }
    const res = await create({ items: [{ productId: 'laddoo', quantity: 1 }] });
    const ref = (db: any) => doc(db, 'orders', res.body.orderNumber);
    const admin = clientFor(ADMIN);
    await expect(updateDoc(ref(admin.db), { total: 1 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref(admin.db), { trackingUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'permission-denied' });
    await updateDoc(ref(admin.db), { trackingUrl: null, adminNote: 'Called customer' });
    await expect(updateDoc(ref(clientFor(SHOPPER).db), { status: 'DELIVERED' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('confirmation email', () => {
  it('sends once per order through the configured mailer; unset = skipped', async () => {
    await seedShop();
    const res = await create({ items: [{ productId: 'laddoo', quantity: 1 }] });
    const sent: any[] = [];
    const fake: Mailer = { name: 'test', send: async (m) => void sent.push(m) };
    expect(await sendOrderConfirmation(res.body.orderNumber, fake)).toBe('sent');
    expect(await sendOrderConfirmation(res.body.orderNumber, fake)).toBe('duplicate');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'asha@example.com', subject: `Your Calm Flame order ${res.body.orderNumber}` });
    expect(await getData('orders', res.body.orderNumber)).toMatchObject({ confirmationEmail: { status: 'sent', provider: 'test' } });
    const failing: Mailer = { name: 'down', send: async () => { throw new Error('smtp down'); } };
    const res2 = await create({ items: [{ productId: 'modak', quantity: 1 }] });
    expect(await sendOrderConfirmation(res2.body.orderNumber, failing)).toBe('failed');
    expect(await getData('orders', res2.body.orderNumber)).toMatchObject({ confirmationEmail: { status: 'failed', error: 'smtp down' } });
  });
});
