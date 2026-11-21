/**
 * Phase 2 (1.2.2) competing-worker tests against the Firestore emulator.
 *
 * Real: firebase-admin, Firestore transactions, the Express routes (via supertest).
 * Mocked: the Razorpay HTTP API (global fetch is stubbed for api.razorpay.com only).
 * Test-only: one product is given an in-memory price for the duration of this file so the order
 * route can be exercised; no catalogue data is changed.
 * Interleavings are forced with one-shot test hooks (src/server/testHooks.ts).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../../server';
import { ACTIVE_CANONICAL_CATALOG_MAP } from '../../data/canonicalCatalog';
import { getAdminDb } from '../../server/firestoreAdmin';
import { setTestHook, clearTestHooks } from '../../server/testHooks';
import {
  PRODUCT,
  clearFirestore,
  realFetch,
  seedInventory,
  getData,
  listIds,
  listDocs,
  inventory,
  idempDocIdFor,
  STALE_TIME,
  jsonResponse,
} from './helpers';

const WEBHOOK_SECRET = 'whsec_emulator_test';
const TEST_PRICE = 500; // test-only in-memory price
const EXPECTED_PAISE = (TEST_PRICE + 99) * 100; // + standard shipping below free-shipping threshold

const customer = {
  fullName: 'Test Buyer',
  email: 'buyer@example.com',
  phone: '9876543210',
  addressLine1: '1 Test Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
};

// ---- Razorpay API stub ----------------------------------------------------
type RzpHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let rzpHandler: RzpHandler;
let rzpCalls: string[] = [];
let rzpOrderSeq = 0;
const defaultRzpHandler: RzpHandler = (url) => {
  if (url.endsWith('/v1/orders')) return jsonResponse({ id: `order_rzp_${++rzpOrderSeq}` });
  return jsonResponse({ error: 'unexpected' }, 500);
};

const original = { price: 0, priceStatus: '' as any };

beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'run via npm run test:emulator').toBeTruthy();
  const p = ACTIVE_CANONICAL_CATALOG_MAP[PRODUCT] as any;
  original.price = p.price;
  original.priceStatus = p.priceStatus;
  p.price = TEST_PRICE;
  p.priceStatus = 'active';
  vi.stubGlobal('fetch', async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.razorpay.com/')) {
      rzpCalls.push(url);
      return rzpHandler(url, init);
    }
    return realFetch(input, init);
  });
});

afterAll(() => {
  const p = ACTIVE_CANONICAL_CATALOG_MAP[PRODUCT] as any;
  p.price = original.price;
  p.priceStatus = original.priceStatus;
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await clearFirestore();
  clearTestHooks();
  rzpHandler = defaultRzpHandler;
  rzpCalls = [];
  rzpOrderSeq = 0;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  clearTestHooks();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

function createOrder(key: string, quantity = 1) {
  return request(app)
    .post('/api/orders/create')
    .set('Idempotency-Key', key)
    .send({ items: [{ productId: PRODUCT, quantity }], customer, paymentMethod: 'razorpay' });
}

async function makeClaimStale(key: string) {
  await getAdminDb().collection('orderIdempotency').doc(idempDocIdFor(key)).update({ updatedAt: STALE_TIME() });
}

function sendWebhook(body: any) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(raw)).digest('hex');
  return request(app)
    .post('/api/webhooks/razorpay')
    .set('x-razorpay-signature', sig)
    .set('Content-Type', 'application/json')
    .send(raw);
}

// ===========================================================================
// Order creation
// ===========================================================================
describe('Order creation: competing workers', () => {
  it('two concurrent requests with the same key create exactly one order and one reservation', async () => {
    await seedInventory(5);
    const key = 'concurrent-key-0000000001';
    const [a, b] = await Promise.all([createOrder(key), createOrder(key)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain(200);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

    expect(await listIds('orders')).toHaveLength(1);
    expect(await listIds('inventoryReservations')).toHaveLength(1);
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
    expect(await getData('orderIdempotency', idempDocIdFor(key))).toMatchObject({ status: 'COMPLETED', claimGeneration: 1 });
    expect(rzpCalls.filter((u) => u.endsWith('/v1/orders'))).toHaveLength(1);
  });

  it('stale worker fenced after reserving: newer claim wins, stale reservation is released, no double stock', async () => {
    await seedInventory(5);
    const key = 'stale-reserve-key-000001';
    let workerB: any;
    let staleOrderNumber = '';
    setTestHook('order.afterReserve', async (ctx) => {
      staleOrderNumber = ctx.orderNumber;
      await makeClaimStale(key);
      workerB = await createOrder(key); // reclaims with generation 2 and completes
    });

    const workerA = await createOrder(key);
    expect(workerA.status).toBe(409);
    expect(workerB.status).toBe(200);
    const winner = workerB.body.orderNumber;
    expect(winner).not.toBe(staleOrderNumber);

    const idem = await getData('orderIdempotency', idempDocIdFor(key));
    expect(idem).toMatchObject({ status: 'COMPLETED', claimGeneration: 2, orderNumber: winner });
    expect(await listIds('orders')).toEqual([winner]);
    const reservations = await listDocs('inventoryReservations');
    expect(reservations).toHaveLength(2);
    expect(reservations.find((r: any) => r.orderNumber === staleOrderNumber)).toMatchObject({ status: 'RELEASED' });
    expect(reservations.find((r: any) => r.orderNumber === winner)).toMatchObject({ status: 'RESERVED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });

  it('stale worker fenced while calling Razorpay: no overwrite of the newer claim, orphan mapping kept for reconciliation', async () => {
    await seedInventory(5);
    const key = 'stale-gateway-key-000001';
    let recoverer: any;
    let orderNumber = '';
    setTestHook('order.afterGateway', async (ctx) => {
      orderNumber = ctx.orderNumber;
      await makeClaimStale(key);
      recoverer = await createOrder(key); // finds RESERVED order without razorpay ID -> reconciliation
    });

    const workerA = await createOrder(key);
    expect(recoverer.status).toBe(409);
    expect(workerA.status).toBe(409);

    const idem = await getData('orderIdempotency', idempDocIdFor(key));
    expect(idem).toMatchObject({ status: 'RECONCILIATION_REQUIRED', claimGeneration: 2 });
    // Stale worker did not mark the order PAYMENT_PENDING nor release stock
    expect(await getData('orders', orderNumber)).toMatchObject({ status: 'RESERVED', razorpayOrderId: null });
    expect(await getData('orderMappings', 'order_rzp_1')).toMatchObject({
      orderNumber,
      reconciliationRequired: true,
      reconciliationReason: 'WORKER_FENCED_OFF_AFTER_GATEWAY_CREATE',
    });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
    expect((await listDocs('inventoryReservations'))[0]).toMatchObject({ status: 'RESERVED' });
  });

  it('orphan mapping never overwrites an existing mapping; the conflict is kept for reconciliation', async () => {
    await seedInventory(5);
    await getAdminDb().collection('orderMappings').doc('order_rzp_1').set({ orderNumber: 'TCF-EXISTING', createdAt: 'x' });
    const key = 'orphan-conflict-key-0001';
    let orderNumber = '';
    setTestHook('order.afterGateway', async (ctx) => {
      orderNumber = ctx.orderNumber;
      await makeClaimStale(key);
      await createOrder(key);
    });

    const workerA = await createOrder(key);
    expect(workerA.status).toBe(409);
    expect(await getData('orderMappings', 'order_rzp_1')).toEqual({ orderNumber: 'TCF-EXISTING', createdAt: 'x' });
    expect(await getData('orderMappingConflicts', `order_rzp_1__${orderNumber}`)).toMatchObject({
      razorpayOrderId: 'order_rzp_1',
      attemptedOrderNumber: orderNumber,
      existingOrderNumber: 'TCF-EXISTING',
      reconciliationReason: 'WORKER_FENCED_OFF_AFTER_GATEWAY_CREATE',
    });
  });

  it('non-stale worker hitting an existing mapping for another order holds for reconciliation without overwriting', async () => {
    await seedInventory(5);
    await getAdminDb().collection('orderMappings').doc('order_rzp_1').set({ orderNumber: 'TCF-OTHER' });
    const res = await createOrder('mapping-conflict-key-001');
    expect(res.status).toBe(500);

    const orderNumber = (await listIds('orders'))[0];
    expect(await getData('orderMappings', 'order_rzp_1')).toEqual({ orderNumber: 'TCF-OTHER' });
    expect(await getData('orders', orderNumber)).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reconciliationReason: 'ORDER_MAPPING_CONFLICT',
      razorpayOrderId: 'order_rzp_1',
    });
    expect(await getData('orderMappingConflicts', `order_rzp_1__${orderNumber}`)).toMatchObject({
      existingOrderNumber: 'TCF-OTHER',
    });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });

  it('stale worker whose gateway call is rejected cannot fail the order or release stock owned by a newer claim', async () => {
    await seedInventory(5);
    rzpHandler = () => jsonResponse({ error: { description: 'bad request' } }, 400);
    const key = 'stale-reject-key-0000001';
    let orderNumber = '';
    setTestHook('order.afterGatewayReject', async (ctx) => {
      orderNumber = ctx.orderNumber;
      await makeClaimStale(key);
      await createOrder(key); // recoverer -> RECONCILIATION_REQUIRED, bumps generation
    });

    const workerA = await createOrder(key);
    expect(workerA.status).toBe(502);
    expect(await getData('orderIdempotency', idempDocIdFor(key))).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      claimGeneration: 2,
    });
    expect(await getData('orders', orderNumber)).toMatchObject({ status: 'RESERVED' });
    expect((await listDocs('inventoryReservations'))[0]).toMatchObject({ status: 'RESERVED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });

  it('gateway rejection for the owning worker fails the order and releases stock atomically', async () => {
    await seedInventory(5);
    rzpHandler = () => jsonResponse({ error: {} }, 400);
    const key = 'owner-reject-key-0000001';
    const res = await createOrder(key);
    expect(res.status).toBe(502);
    const orderNumber = (await listIds('orders'))[0];
    expect(await getData('orders', orderNumber)).toMatchObject({ status: 'FAILED' });
    expect(await getData('orderIdempotency', idempDocIdFor(key))).toMatchObject({ status: 'FAILED' });
    expect((await listDocs('inventoryReservations'))[0]).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
  });

  it('gateway timeout keeps the reservation and holds order + claim for reconciliation', async () => {
    await seedInventory(5);
    rzpHandler = () => {
      throw new Error('network timeout');
    };
    const key = 'timeout-key-000000000001';
    const res = await createOrder(key);
    expect(res.status).toBe(502);
    const orderNumber = (await listIds('orders'))[0];
    expect(await getData('orders', orderNumber)).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reconciliationReason: 'RAZORPAY_CREATE_TIMEOUT',
    });
    expect(await getData('orderIdempotency', idempDocIdFor(key))).toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });
});

// ===========================================================================
// Webhook
// ===========================================================================
const ORDER = 'TCF-WEBHOOK-1';
const RZP_ORDER = 'order_rzp_wh_1';
const RES_ID = 'res_wh_1';

async function seedPendingOrder() {
  await seedInventory(4, 1);
  const db = getAdminDb();
  await db.collection('inventoryReservations').doc(RES_ID).set({
    reservationId: RES_ID,
    orderNumber: ORDER,
    items: [{ productId: PRODUCT, quantity: 1 }],
    status: 'RESERVED',
  });
  await db.collection('orders').doc(ORDER).set({
    orderNumber: ORDER,
    razorpayOrderId: RZP_ORDER,
    expectedAmountPaise: EXPECTED_PAISE,
    currency: 'INR',
    reservationId: RES_ID,
    status: 'PAYMENT_PENDING',
    paymentStatus: 'PENDING',
  });
  await db.collection('orderMappings').doc(RZP_ORDER).set({ orderNumber: ORDER });
}

const captured = (eventId: string) => ({
  event: 'payment.captured',
  event_id: eventId,
  payload: {
    payment: {
      entity: { id: 'pay_ok_1', order_id: RZP_ORDER, amount: EXPECTED_PAISE, currency: 'INR', status: 'captured' },
    },
  },
});

const failed = (eventId: string, entityOverrides: Record<string, any> = {}) => {
  const entity: any = { id: 'pay_fail_1', order_id: RZP_ORDER, amount: EXPECTED_PAISE, currency: 'INR', status: 'failed', ...entityOverrides };
  for (const k of Object.keys(entity)) if (entity[k] === undefined) delete entity[k];
  return { event: 'payment.failed', event_id: eventId, payload: { payment: { entity } } };
};

async function expectOrderUntouched() {
  expect(await getData('orders', ORDER)).toMatchObject({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING' });
  expect(await getData('inventoryReservations', RES_ID)).toMatchObject({ status: 'RESERVED' });
  expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
}

describe('Webhook: payment.failed without amount/currency (gap 1)', () => {
  it('missing amount and no Razorpay credentials -> event held for reconciliation, no state change', async () => {
    await seedPendingOrder();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const res = await sendWebhook(failed('evt_f_noamt', { amount: undefined }));
    expect(res.status).toBe(202);
    expect(await getData('razorpayEvents', 'evt_f_noamt')).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reconciliationReason: 'PAYMENT_FAILED_UNVERIFIED',
    });
    await expectOrderUntouched();
    expect(rzpCalls).toHaveLength(0);
  });

  it('missing currency, Razorpay API unreachable -> reconciliation, no state change', async () => {
    await seedPendingOrder();
    rzpHandler = () => jsonResponse({}, 503);
    const res = await sendWebhook(failed('evt_f_api_down', { currency: undefined }));
    expect(res.status).toBe(202);
    expect(await getData('razorpayEvents', 'evt_f_api_down')).toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
    await expectOrderUntouched();
  });

  it('missing amount, API reports a different status -> reconciliation, no state change', async () => {
    await seedPendingOrder();
    rzpHandler = () => jsonResponse({ id: 'pay_fail_1', order_id: RZP_ORDER, amount: EXPECTED_PAISE, currency: 'INR', status: 'captured' });
    const res = await sendWebhook(failed('evt_f_api_status', { amount: undefined, status: undefined }));
    expect(res.status).toBe(202);
    expect(await getData('razorpayEvents', 'evt_f_api_status')).toMatchObject({ reconciliationReason: 'PAYMENT_FAILED_API_STATUS' });
    await expectOrderUntouched();
  });

  it('missing amount, API amount does not match the order -> rejected, no state change', async () => {
    await seedPendingOrder();
    rzpHandler = () => jsonResponse({ id: 'pay_fail_1', order_id: RZP_ORDER, amount: 100, currency: 'INR', status: 'failed' });
    const res = await sendWebhook(failed('evt_f_api_amt', { amount: undefined }));
    expect(res.status).toBe(400);
    expect(await getData('razorpayEvents', 'evt_f_api_amt')).toMatchObject({ status: 'FAILED', reconciliationReason: 'AMOUNT_MISMATCH' });
    await expectOrderUntouched();
  });

  it('missing amount, API confirms the failed payment -> order cancelled and stock released once', async () => {
    await seedPendingOrder();
    rzpHandler = (url) => {
      expect(url).toBe('https://api.razorpay.com/v1/payments/pay_fail_1');
      return jsonResponse({ id: 'pay_fail_1', order_id: RZP_ORDER, amount: EXPECTED_PAISE, currency: 'INR', status: 'failed' });
    };
    const res = await sendWebhook(failed('evt_f_verified', { amount: undefined, currency: undefined }));
    expect(res.status).toBe(200);
    expect(await getData('orders', ORDER)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect(await getData('inventoryReservations', RES_ID)).toMatchObject({ status: 'RELEASED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
    expect(await getData('razorpayEvents', 'evt_f_verified')).toMatchObject({ status: 'COMPLETED' });
  });
});

describe('Webhook: competing workers (gap 3/4)', () => {
  it('five concurrent deliveries of the same payment.captured confirm once and consume stock once', async () => {
    await seedPendingOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(captured('evt_dup_1'))));
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect(results.filter((r) => r.body.outcome === 'confirmed')).toHaveLength(1);

    expect(await getData('orders', ORDER)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(await getData('inventoryReservations', RES_ID)).toMatchObject({ status: 'CONSUMED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
    expect(await getData('razorpayEvents', 'evt_dup_1')).toMatchObject({ status: 'COMPLETED', leaseGeneration: 1 });
  });

  it('stale lease holder is fenced off after a redelivery takes over; stock consumed once', async () => {
    await seedPendingOrder();
    let redelivery: any;
    setTestHook('webhook.beforeTransition', async ({ eventId }) => {
      await getAdminDb().collection('razorpayEvents').doc(eventId).update({ claimedAt: STALE_TIME() });
      redelivery = await sendWebhook(captured('evt_stale_1'));
    });
    const stale = await sendWebhook(captured('evt_stale_1'));
    expect(redelivery.status).toBe(200);
    expect(stale.status).toBe(409);

    expect(await getData('razorpayEvents', 'evt_stale_1')).toMatchObject({
      status: 'COMPLETED',
      leaseGeneration: 2,
      completedByGeneration: 2,
    });
    expect(await getData('orders', ORDER)).toMatchObject({ status: 'CONFIRMED' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
  });

  it("stale lease holder's failure write cannot overwrite the newer worker's record", async () => {
    // No matching order -> each worker tries to record NO_MATCHING_ORDER (a failure write).
    let redelivery: any;
    const body = captured('evt_stale_fail');
    setTestHook('webhook.afterClaim', async ({ eventId }) => {
      await getAdminDb().collection('razorpayEvents').doc(eventId).update({ claimedAt: STALE_TIME() });
      redelivery = await sendWebhook(body);
    });
    const stale = await sendWebhook(body);
    expect(redelivery.status).toBe(404);
    expect(stale.status).toBe(409);
    const ev = await getData('razorpayEvents', 'evt_stale_fail');
    expect(ev).toMatchObject({ status: 'FAILED', leaseGeneration: 2, reconciliationReason: 'NO_MATCHING_ORDER' });
  });

  it('concurrent payment.captured and payment.failed for one order: exactly one outcome, inventory consistent', async () => {
    for (let round = 0; round < 3; round++) {
      await clearFirestore();
      await seedPendingOrder();
      await Promise.all([sendWebhook(captured(`evt_race_c${round}`)), sendWebhook(failed(`evt_race_f${round}`))]);
      const order = await getData('orders', ORDER);
      const reservation = await getData('inventoryReservations', RES_ID);
      const inv = await inventory();
      if (order!.status === 'CONFIRMED') {
        expect(reservation).toMatchObject({ status: 'CONSUMED' });
        expect(inv).toMatchObject({ availableQuantity: 4, reservedQuantity: 0 });
      } else {
        expect(order).toMatchObject({ status: 'CANCELLED' });
        expect(reservation).toMatchObject({ status: 'RELEASED' });
        expect(inv).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });
      }
    }
  });

  it('state conflicts in the transition are recorded for reconciliation instead of leaving the event PROCESSING', async () => {
    await seedPendingOrder();
    await getAdminDb().collection('inventoryReservations').doc(RES_ID).delete();
    const res = await sendWebhook(captured('evt_conflict_1'));
    expect(res.status).toBe(422);
    expect(await getData('razorpayEvents', 'evt_conflict_1')).toMatchObject({
      status: 'FAILED',
      requiresReconciliation: true,
      reconciliationReason: 'RESERVATION_MISSING',
    });
    expect(await getData('orders', ORDER)).toMatchObject({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING' });
    expect(await inventory()).toMatchObject({ availableQuantity: 4, reservedQuantity: 1 });
  });
});
