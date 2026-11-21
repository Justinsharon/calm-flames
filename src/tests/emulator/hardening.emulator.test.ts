/**
 * Issues 11 + 12 against the Firestore emulator, asserting final order / reservation / inventory /
 * claim state. Real: firebase-admin, transactions, Express routes. Mocked: Razorpay HTTP API only.
 * Interleavings forced with one-shot test hooks (src/server/testHooks.ts).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../../server';
import { getAdminDb } from '../../server/firestoreAdmin';
import { setTestHook, clearTestHooks } from '../../server/testHooks';
import { expireStaleReservations } from '../../server/reservationExpiry';
import { idempotencyDocIdForKey } from '../../server/orderTransitions';
import { PRODUCT, TEST_PRICE, clearFirestore, realFetch, seedInventory, getData, inventory, jsonResponse } from './helpers';

/** Older than the 30-minute default reservation limit. */
const OLD = () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const KEY_SECRET = 'rzp_test_secret';
const WEBHOOK_SECRET = 'whsec_hardening';
const MAINT_SECRET = 'maintenance-secret-0123456789';
const ORDER = 'TCF-HARD-1';
const RZP_ORDER = 'order_rzp_hard_1';
const RES_ID = 'res_hard_1';
const PAY_ID = 'pay_hard_1';
const IDEM_KEY = 'hardening-key-000000001';
const PAISE = (TEST_PRICE + 99) * 100;

let rzpPayment: any;
beforeAll(() => {
  vi.stubGlobal('fetch', async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.razorpay.com/v1/payments/')) return jsonResponse(rzpPayment);
    if (url.startsWith('https://api.razorpay.com/')) return jsonResponse({ id: 'order_rzp_new' });
    return realFetch(input, init);
  });
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(async () => {
  await clearFirestore();
  clearTestHooks();
  rzpPayment = { id: PAY_ID, order_id: RZP_ORDER, amount: PAISE, currency: 'INR', status: 'captured' };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MAINTENANCE_SECRET = MAINT_SECRET;
});
afterEach(() => {
  clearTestHooks();
  for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MAINTENANCE_SECRET']) delete process.env[k];
});

/** An order awaiting payment exactly as /api/orders/create leaves it. */
async function seedPendingOrder(over: { claimStatus?: string; createdAt?: string } = {}) {
  await seedInventory(4, 1);
  const db = getAdminDb();
  const createdAt = over.createdAt || new Date().toISOString();
  await db.collection('inventoryReservations').doc(RES_ID).set({
    reservationId: RES_ID, orderNumber: ORDER, items: [{ productId: PRODUCT, quantity: 1 }], status: 'RESERVED', createdAt
  });
  await db.collection('orders').doc(ORDER).set({
    orderNumber: ORDER, idempotencyKey: IDEM_KEY, razorpayOrderId: RZP_ORDER, expectedAmountPaise: PAISE, total: PAISE / 100,
    currency: 'INR', reservationId: RES_ID, status: 'PAYMENT_PENDING', paymentStatus: 'PENDING'
  });
  await db.collection('orderIdempotency').doc(idempotencyDocIdForKey(IDEM_KEY)).set({
    orderNumber: ORDER, razorpayOrderId: RZP_ORDER, status: over.claimStatus || 'COMPLETED', claimGeneration: 1
  });
  await db.collection('orderMappings').doc(RZP_ORDER).set({ orderNumber: ORDER });
}

function verify() {
  const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${RZP_ORDER}|${PAY_ID}`).digest('hex');
  return request(app).post('/api/payments/verify').send({
    order_number: ORDER, razorpay_order_id: RZP_ORDER, razorpay_payment_id: PAY_ID, razorpay_signature: sig
  });
}

function webhook(event: 'payment.captured' | 'payment.failed', eventId: string) {
  const body = JSON.stringify({
    event, event_id: eventId,
    payload: { payment: { entity: { id: PAY_ID, order_id: RZP_ORDER, amount: PAISE, currency: 'INR', status: event === 'payment.captured' ? 'captured' : 'failed' } } }
  });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex');
  return request(app).post('/api/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(body);
}

const order = () => getData('orders', ORDER);
const reservation = () => getData('inventoryReservations', RES_ID);

// ===========================================================================
describe('Issue 11: /api/payments/verify changes order status only inside a fenced transaction', () => {
  it('confirms a pending order and consumes stock exactly once (verify twice concurrently)', async () => {
    await seedPendingOrder();
    const [a, b] = await Promise.all([verify(), verify()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await order()).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', razorpayPaymentId: PAY_ID, confirmedBy: 'verify' });
    expect(await reservation()).toMatchObject({ status: 'CONSUMED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
  });

  it('webhook cancels the order between verify\'s checks and its write: verify must not overwrite CANCELLED', async () => {
    await seedPendingOrder();
    let wh: any;
    setTestHook('verify.beforeTransition', async () => {
      wh = await webhook('payment.failed', 'evt_cancel_mid_verify');
    });
    const v = await verify();
    expect(wh.status).toBe(200);
    expect(v.status).toBe(409);
    expect(v.body.verified).toBe(false);
    expect(await order()).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect((await order())!.razorpayPaymentId).toBeUndefined();
    expect(await reservation()).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 }); // released once, never consumed
  });

  it('webhook confirms the order between verify\'s checks and its write: verify reports paid, no double consume', async () => {
    await seedPendingOrder();
    setTestHook('verify.beforeTransition', async () => {
      await webhook('payment.captured', 'evt_confirm_mid_verify');
    });
    const v = await verify();
    expect(v.status).toBe(200);
    expect(v.body.status).toBe('PAID');
    const o = await order();
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(o!.confirmedBy).toBeUndefined(); // the webhook's write stands
    expect(await getData('razorpayEvents', 'evt_confirm_mid_verify')).toMatchObject({ status: 'COMPLETED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
  });

  it('unhooked race: verify and payment.captured webhook together, five rounds', async () => {
    for (let round = 0; round < 5; round++) {
      await clearFirestore();
      await seedPendingOrder();
      const [v, w] = await Promise.all([verify(), webhook('payment.captured', `evt_race_${round}`)]);
      expect(v.status).toBe(200);
      expect([200, 409]).toContain(w.status);
      expect(await order()).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
      expect(await reservation()).toMatchObject({ status: 'CONSUMED' });
      expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
    }
  });

  it('unhooked race: verify against payment.failed webhook never ends half-applied', async () => {
    for (let round = 0; round < 5; round++) {
      await clearFirestore();
      await seedPendingOrder();
      await Promise.all([verify(), webhook('payment.failed', `evt_frace_${round}`)]);
      const o = await order();
      const r = await reservation();
      const inv = await inventory();
      if (o!.status === 'CONFIRMED') {
        expect(r).toMatchObject({ status: 'CONSUMED' });
        expect(inv).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
      } else {
        expect(o).toMatchObject({ status: 'CANCELLED' });
        expect(r).toMatchObject({ status: 'RELEASED' });
        expect(inv).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
      }
    }
  });

  it('does not touch a FAILED order', async () => {
    await seedPendingOrder();
    await getAdminDb().collection('orders').doc(ORDER).update({ status: 'FAILED' });
    const v = await verify();
    expect(v.status).toBe(400);
    expect(await order()).toMatchObject({ status: 'FAILED', paymentStatus: 'PENDING' });
    expect(await reservation()).toMatchObject({ status: 'RESERVED' });
  });

  it('refuses when the order-creation claim is not COMPLETED (taken over / under reconciliation)', async () => {
    await seedPendingOrder({ claimStatus: 'RECONCILIATION_REQUIRED' });
    const v = await verify();
    expect(v.status).toBe(409);
    expect(await order()).toMatchObject({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING' });
    expect(await reservation()).toMatchObject({ status: 'RESERVED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });

  it('paid but stock no longer held -> order held for reconciliation, inventory untouched', async () => {
    await seedPendingOrder();
    await getAdminDb().collection('inventoryReservations').doc(RES_ID).update({ status: 'RELEASED' });
    await getAdminDb().collection('inventory').doc(PRODUCT).update({ availableQuantity: 5, reservedQuantity: 0 });
    const v = await verify();
    expect(v.status).toBe(500);
    expect(await order()).toMatchObject({
      status: 'RECONCILIATION_REQUIRED', paymentStatus: 'PAID', reconciliationReason: 'PAID_BUT_RESERVATION_RELEASED'
    });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
  });
});

// ===========================================================================
async function seedOrphanReservation(id: string, createdAt: string, qty = 2) {
  await getAdminDb().collection('inventoryReservations').doc(id).set({
    reservationId: id, orderNumber: `TCF-ORPHAN-${id}`, items: [{ productId: PRODUCT, quantity: qty }], status: 'RESERVED', createdAt
  });
}

describe('Issue 12: stale reservation expiry', () => {
  it('releases only stale, order-less reservations, once, even when run twice concurrently', async () => {
    await seedInventory(3, 2 + 1 + 1); // 2 orphan-stale + 1 fresh orphan + 1 for an existing order
    await seedOrphanReservation('res_stale', OLD(), 2);
    await seedOrphanReservation('res_fresh', new Date().toISOString(), 1);
    await getAdminDb().collection('inventoryReservations').doc('res_with_order').set({
      reservationId: 'res_with_order', orderNumber: 'TCF-REAL', items: [{ productId: PRODUCT, quantity: 1 }], status: 'RESERVED', createdAt: OLD()
    });
    await getAdminDb().collection('orders').doc('TCF-REAL').set({ orderNumber: 'TCF-REAL', status: 'PAYMENT_PENDING', reservationId: 'res_with_order' });

    const [r1, r2] = await Promise.all([expireStaleReservations(), expireStaleReservations()]);
    expect([...r1.released, ...r2.released]).toEqual(['res_stale']);
    expect(r1.failed).toEqual([]);
    expect(r2.failed).toEqual([]);
    expect(await getData('inventoryReservations', 'res_stale')).toMatchObject({ status: 'RELEASED', releaseReason: 'EXPIRED_NO_ORDER' });
    expect(await getData('inventoryReservations', 'res_fresh')).toMatchObject({ status: 'RESERVED' });
    expect(await getData('inventoryReservations', 'res_with_order')).toMatchObject({ status: 'RESERVED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 2 });

    const again = await expireStaleReservations();
    expect(again.released).toEqual([]);
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 2 });
  });

  it('never releases anything younger than 15 minutes, whatever is requested', async () => {
    await seedInventory(0, 1);
    await seedOrphanReservation('res_10min', new Date(Date.now() - 10 * 60 * 1000).toISOString(), 1);
    const report = await expireStaleReservations({ maxAgeMinutes: 1 });
    expect(report.released).toEqual([]);
    expect(await getData('inventoryReservations', 'res_10min')).toMatchObject({ status: 'RESERVED' });
  });

  it('a checkout whose reservation expires before its order is saved fails cleanly (no order on released stock)', async () => {
    await seedInventory(5);
    let sweep: any;
    setTestHook('order.afterReserve', async ({ reservationId }) => {
      await getAdminDb().collection('inventoryReservations').doc(reservationId).update({ createdAt: OLD() });
      sweep = await expireStaleReservations();
    });
    const key = 'expiry-race-key-0000001';
    const res = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', key)
      .send({
        items: [{ productId: PRODUCT, quantity: 2 }],
        customer: { fullName: 'T', email: 't@example.com', phone: '9876543210', addressLine1: 'x', city: 'y', state: 'z', pincode: '400001' },
        paymentMethod: 'razorpay'
      });
    expect(sweep.released).toHaveLength(1);
    expect(res.status).toBe(409);
    expect((await getAdminDb().collection('orders').get()).size).toBe(0);
    expect(await getData('orderIdempotency', idempotencyDocIdForKey(key))).toMatchObject({ status: 'FAILED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 }); // released exactly once
  });

  it('running alongside the webhook for an order with an old reservation: sweeper skips it, webhook consumes once', async () => {
    await seedPendingOrder({ createdAt: OLD() });
    const [report, wh] = await Promise.all([expireStaleReservations(), webhook('payment.captured', 'evt_with_sweep')]);
    expect(wh.status).toBe(200);
    expect(report.released).toEqual([]);
    expect(await order()).toMatchObject({ status: 'CONFIRMED' });
    expect(await reservation()).toMatchObject({ status: 'CONSUMED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
  });

  it('endpoint: maintenance key required; with it, expires and reports', async () => {
    await seedInventory(0, 2);
    await seedOrphanReservation('res_ep', OLD(), 2);
    const none = await request(app).post('/api/admin/maintenance/expire-reservations').send({});
    expect(none.status).toBe(401);
    const wrong = await request(app).post('/api/admin/maintenance/expire-reservations').set('x-maintenance-key', 'nope').send({});
    expect(wrong.status).toBe(403);
    const badToken = await request(app).post('/api/admin/maintenance/expire-reservations').set('Authorization', 'Bearer not-a-token').send({});
    expect(badToken.status).toBe(401);
    expect(await getData('inventoryReservations', 'res_ep')).toMatchObject({ status: 'RESERVED' });

    const ok = await request(app).post('/api/admin/maintenance/expire-reservations').set('x-maintenance-key', MAINT_SECRET).send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ maxAgeMinutes: 30, released: ['res_ep'] });
    expect(await inventory()).toMatchObject({ availableQuantity: 2, reservedQuantity: 0 });
  });

  it('checkout stays disabled', async () => {
    const r = await request(app).get('/api/checkout/readiness');
    expect(r.body.checkoutEnabled).toBe(false);
  });
});
