/**
 * Abandoned PAYMENT_PENDING orders (Phase 3c) against the Firestore emulator, asserting final
 * order / reservation / inventory / event state.
 * Real: firebase-admin, transactions, Express routes. Mocked: ONLY the Razorpay HTTP API.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../../server';
import { getAdminDb } from '../../server/firestoreAdmin';
import { setTestHook, clearTestHooks } from '../../server/testHooks';
import { expireAbandonedOrders } from '../../server/orderExpiry';
import { idempotencyDocIdForKey } from '../../server/orderTransitions';
import { PRODUCT, TEST_PRICE, clearFirestore, realFetch, seedInventory, getData, inventory, jsonResponse } from './helpers';

const KEY_SECRET = 'rzp_test_secret';
const WEBHOOK_SECRET = 'whsec_abandoned';
const MAINT_SECRET = 'maintenance-secret-0123456789';
const ORDER = 'TCF-ABANDON-1';
const RZP_ORDER = 'order_rzp_abandon_1';
const RES_ID = 'res_abandon_1';
const PAY_ID = 'pay_abandon_1';
const IDEM_KEY = 'abandoned-key-00000001';
const PAISE = (TEST_PRICE + 99) * 100;
const OLD = () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

// ---- Razorpay API mock -----------------------------------------------------
type Rzp = { orderPayments: () => Response | Promise<Response>; payment: () => Response };
let rzp: Rzp;
let orderPaymentLookups = 0;
const payments = (...statuses: string[]) =>
  jsonResponse({ entity: 'collection', count: statuses.length, items: statuses.map((s, i) => ({ id: `pay_${i}`, order_id: RZP_ORDER, status: s })) });

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === `https://api.razorpay.com/v1/orders/${RZP_ORDER}/payments`) {
      orderPaymentLookups++;
      return rzp.orderPayments();
    }
    if (url === `https://api.razorpay.com/v1/payments/${PAY_ID}`) return rzp.payment();
    if (url.startsWith('https://api.razorpay.com/')) return jsonResponse({ error: 'unexpected' }, 500);
    return realFetch(input, init);
  });
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(async () => {
  await clearFirestore();
  clearTestHooks();
  orderPaymentLookups = 0;
  rzp = {
    orderPayments: () => payments('failed'),
    payment: () => jsonResponse({ id: PAY_ID, order_id: RZP_ORDER, amount: PAISE, currency: 'INR', status: 'captured' })
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MAINTENANCE_SECRET = MAINT_SECRET;
});
afterEach(() => {
  clearTestHooks();
  for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MAINTENANCE_SECRET']) delete process.env[k];
});

async function seedPendingOrder(over: Record<string, any> = {}) {
  await seedInventory(4, 1);
  const db = getAdminDb();
  const createdAt = over.createdAt || OLD();
  await db.collection('inventoryReservations').doc(RES_ID).set({
    reservationId: RES_ID, orderNumber: ORDER, items: [{ productId: PRODUCT, quantity: 1 }], status: 'RESERVED', createdAt
  });
  await db.collection('orders').doc(ORDER).set({
    orderNumber: ORDER, idempotencyKey: IDEM_KEY, razorpayOrderId: RZP_ORDER, expectedAmountPaise: PAISE, total: PAISE / 100,
    currency: 'INR', paymentMethod: 'razorpay', reservationId: RES_ID, status: 'PAYMENT_PENDING', paymentStatus: 'PENDING',
    createdAt, ...over
  });
  await db.collection('orderIdempotency').doc(idempotencyDocIdForKey(IDEM_KEY)).set({
    orderNumber: ORDER, razorpayOrderId: RZP_ORDER, status: 'COMPLETED', claimGeneration: 1
  });
  await db.collection('orderMappings').doc(RZP_ORDER).set({ orderNumber: ORDER });
}

function webhook(event: 'payment.captured' | 'payment.failed', eventId: string) {
  const body = JSON.stringify({
    event, event_id: eventId,
    payload: { payment: { entity: { id: PAY_ID, order_id: RZP_ORDER, amount: PAISE, currency: 'INR', status: event === 'payment.captured' ? 'captured' : 'failed' } } }
  });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex');
  return request(app).post('/api/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(body);
}

function verify() {
  const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${RZP_ORDER}|${PAY_ID}`).digest('hex');
  return request(app).post('/api/payments/verify').send({
    order_number: ORDER, razorpay_order_id: RZP_ORDER, razorpay_payment_id: PAY_ID, razorpay_signature: sig
  });
}

const order = () => getData('orders', ORDER);
const reservation = () => getData('inventoryReservations', RES_ID);
const untouched = async () => {
  expect(await order()).toMatchObject({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING' });
  expect(await reservation()).toMatchObject({ status: 'RESERVED' });
  expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
};

describe('abandoned PAYMENT_PENDING orders', () => {
  it('an abandoned order expires and its stock is released (via the maintenance endpoint)', async () => {
    await seedPendingOrder();
    const res = await request(app).post('/api/admin/maintenance/expire-reservations').set('x-maintenance-key', MAINT_SECRET).send({});
    expect(res.status).toBe(200);
    expect(res.body.abandonedOrders).toMatchObject({ maxAgeMinutes: 30, expired: [ORDER] });
    expect(await order()).toMatchObject({ status: 'EXPIRED', expiryReason: 'PAYMENT_NOT_RECEIVED', stockReleased: true, paymentStatus: 'PENDING' });
    expect(await reservation()).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
    // the reservation sweeper in the same call did not touch it again
    expect(res.body.released).toEqual([]);
  });

  it('an order paid just before expiry (captured or authorized on Razorpay) is left alone', async () => {
    for (const status of ['captured', 'authorized']) {
      await clearFirestore();
      await seedPendingOrder();
      rzp.orderPayments = () => payments('failed', status);
      const report = await expireAbandonedOrders();
      expect(report.skippedHasPayment).toEqual([ORDER]);
      await untouched();
    }
  });

  it('payment captured between the Razorpay check and the expiry transaction: webhook wins, order not expired', async () => {
    await seedPendingOrder();
    setTestHook('orderExpiry.beforeTransaction', async () => {
      const wh = await webhook('payment.captured', 'evt_just_in_time');
      expect(wh.status).toBe(200);
    });
    const report = await expireAbandonedOrders();
    expect(report.skippedChanged).toEqual([ORDER]);
    expect(await order()).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(await reservation()).toMatchObject({ status: 'CONSUMED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
  });

  it('Razorpay unreachable or not configured: skipped this run, expired on the next', async () => {
    await seedPendingOrder();
    rzp.orderPayments = () => { throw new Error('ECONNRESET'); };
    expect((await expireAbandonedOrders()).skippedRazorpayUnavailable).toEqual([ORDER]);
    rzp.orderPayments = () => jsonResponse({ error: 'server' }, 503);
    expect((await expireAbandonedOrders()).skippedRazorpayUnavailable).toEqual([ORDER]);
    delete process.env.RAZORPAY_KEY_SECRET;
    expect((await expireAbandonedOrders()).skippedRazorpayUnavailable).toEqual([ORDER]);
    await untouched();

    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    rzp.orderPayments = () => payments();
    expect((await expireAbandonedOrders()).expired).toEqual([ORDER]);
    expect(await order()).toMatchObject({ status: 'EXPIRED' });
  });

  it('late payment via webhook after expiry: paid + held for reconciliation, never dropped, stock untouched', async () => {
    await seedPendingOrder();
    await expireAbandonedOrders();
    const wh = await webhook('payment.captured', 'evt_late');
    expect(wh.status).toBe(200);
    expect(wh.body.outcome).toBe('paid_after_expiry');
    expect(await order()).toMatchObject({
      status: 'RECONCILIATION_REQUIRED', paymentStatus: 'PAID', reconciliationReason: 'PAID_AFTER_EXPIRY', razorpayPaymentId: PAY_ID
    });
    expect(await getData('razorpayEvents', 'evt_late')).toMatchObject({ status: 'COMPLETED' });
    expect(await reservation()).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });

    // a duplicate delivery and a later verify don't change it again
    expect((await webhook('payment.captured', 'evt_late_dup')).status).toBe(200);
    const v = await verify();
    expect(v.body.status).toBe('PAID');
    expect(await order()).toMatchObject({ status: 'RECONCILIATION_REQUIRED', paymentStatus: 'PAID' });
  });

  it('late payment via verify after expiry: paid + held for reconciliation', async () => {
    await seedPendingOrder();
    await expireAbandonedOrders();
    const v = await verify();
    expect(v.status).toBe(202);
    expect(v.body).toMatchObject({ verified: false, status: 'RECONCILIATION_REQUIRED' });
    expect(await order()).toMatchObject({
      status: 'RECONCILIATION_REQUIRED', paymentStatus: 'PAID', reconciliationReason: 'PAID_AFTER_EXPIRY', razorpayPaymentId: PAY_ID
    });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
  });

  it('payment.failed after expiry is acknowledged without changing the order', async () => {
    await seedPendingOrder();
    await expireAbandonedOrders();
    const wh = await webhook('payment.failed', 'evt_late_fail');
    expect(wh.status).toBe(200);
    expect(await order()).toMatchObject({ status: 'EXPIRED', paymentStatus: 'PENDING' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
  });

  it('two sweeps at once expire the order and release the stock exactly once', async () => {
    await seedPendingOrder();
    const [a, b] = await Promise.all([expireAbandonedOrders(), expireAbandonedOrders()]);
    expect([...a.expired, ...b.expired]).toEqual([ORDER]);
    expect([...a.failed, ...b.failed]).toEqual([]);
    expect(await order()).toMatchObject({ status: 'EXPIRED' });
    expect(await reservation()).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
    const again = await expireAbandonedOrders();
    expect(again.scanned).toBe(0);
  });

  it('never expires fresh orders (15-minute floor) or cash-on-delivery orders', async () => {
    await seedPendingOrder({ createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
    expect((await expireAbandonedOrders({ maxAgeMinutes: 1 })).skippedFresh).toEqual([ORDER]);
    await untouched();

    await clearFirestore();
    await seedPendingOrder({ paymentMethod: 'cod', razorpayOrderId: null });
    expect((await expireAbandonedOrders()).skippedNotRazorpay).toEqual([ORDER]);
    expect(orderPaymentLookups).toBe(0);
    expect(await order()).toMatchObject({ status: 'PAYMENT_PENDING' });
  });

  it('checkout stays disabled', async () => {
    expect((await request(app).get('/api/checkout/readiness')).body.checkoutEnabled).toBe(false);
  });
});
