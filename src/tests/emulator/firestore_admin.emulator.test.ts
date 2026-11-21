/**
 * Firestore-emulator-backed tests (run with `npm run test:emulator`).
 * These use the real firebase-admin code path against the local emulator and assert final DB state.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { getAdminDb } from '../../server/firestoreAdmin';
import {
  reserveInventoryTransaction,
  releaseInventoryReservation,
  consumeInventoryReservation,
  fetchInventory,
} from '../../server/inventoryService';
import { app } from '../../../server';

const PRODUCT = 'jumbo-tealight-mogra';

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.FIREBASE_PROJECT_ID || 'demo-calm-flames';
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
}

async function seedInventory(quantity: number) {
  await getAdminDb().collection('inventory').doc(PRODUCT).set({
    productId: PRODUCT,
    quantity,
    availableQuantity: quantity,
    reservedQuantity: 0,
    inStock: quantity > 0,
    status: quantity > 0 ? 'in_stock' : 'out_of_stock',
  });
}

async function inv() {
  return (await getAdminDb().collection('inventory').doc(PRODUCT).get()).data()!;
}
async function reservation(id: string) {
  return (await getAdminDb().collection('inventoryReservations').doc(id).get()).data();
}

describe('firebase-admin against Firestore emulator', () => {
  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST, 'run via npm run test:emulator').toBeTruthy();
    expect(process.env.FIRESTORE_DISABLED).toBeUndefined();
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  it('fetchInventory reads seeded documents', async () => {
    await seedInventory(5);
    const records = await fetchInventory();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ productId: PRODUCT, availableQuantity: 5 });
  });

  it('reserve → consume updates inventory and reservation state', async () => {
    await seedInventory(5);
    const r = await reserveInventoryTransaction(
      [{ productId: PRODUCT, quantity: 1 }, { productId: PRODUCT, quantity: 2 }],
      'res_emu_1',
      'TCF-EMU-1'
    );
    expect(r).toMatchObject({ success: true, reservationId: 'res_emu_1' });
    expect(await inv()).toMatchObject({ availableQuantity: 2, reservedQuantity: 3, inStock: true });
    expect(await reservation('res_emu_1')).toMatchObject({ status: 'RESERVED', orderNumber: 'TCF-EMU-1' });

    expect(await consumeInventoryReservation('res_emu_1')).toEqual({ success: true });
    expect(await inv()).toMatchObject({ availableQuantity: 2, reservedQuantity: 0 });
    expect((await reservation('res_emu_1'))!.status).toBe('CONSUMED');

    // Idempotent + cannot release a consumed reservation
    expect(await consumeInventoryReservation('res_emu_1')).toMatchObject({ success: true, alreadyConsumed: true });
    expect((await releaseInventoryReservation('res_emu_1')).success).toBe(false);
    expect(await inv()).toMatchObject({ availableQuantity: 2, reservedQuantity: 0 });
  });

  it('reserve → release restores stock exactly once', async () => {
    await seedInventory(3);
    await reserveInventoryTransaction([{ productId: PRODUCT, quantity: 3 }], 'res_emu_2', 'TCF-EMU-2');
    expect(await inv()).toMatchObject({ availableQuantity: 0, reservedQuantity: 3, inStock: false, status: 'out_of_stock' });

    expect(await releaseInventoryReservation('res_emu_2')).toEqual({ success: true });
    expect(await releaseInventoryReservation('res_emu_2')).toMatchObject({ success: true, alreadyReleased: true });
    expect(await inv()).toMatchObject({ availableQuantity: 3, reservedQuantity: 0, inStock: true });
    expect((await reservation('res_emu_2'))!.status).toBe('RELEASED');
  });

  it('rejects insufficient stock without writing anything', async () => {
    await seedInventory(1);
    const r = await reserveInventoryTransaction([{ productId: PRODUCT, quantity: 2 }], 'res_emu_3');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Insufficient stock/);
    expect(await inv()).toMatchObject({ availableQuantity: 1, reservedQuantity: 0 });
    expect(await reservation('res_emu_3')).toBeUndefined();
  });

  it('concurrent reservations never oversell', async () => {
    await seedInventory(3);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveInventoryTransaction([{ productId: PRODUCT, quantity: 1 }], `res_emu_c${i}`)
      )
    );
    expect(results.filter((r) => r.success)).toHaveLength(3);
    expect(await inv()).toMatchObject({ availableQuantity: 0, reservedQuantity: 3 });
  });

  it('release/consume of a missing reservation fail with "does not exist"', async () => {
    const rel = await releaseInventoryReservation('res_nonexistent_999999');
    expect(rel.success).toBe(false);
    expect(rel.error).toMatch(/does not exist/);
    const con = await consumeInventoryReservation('res_nonexistent_999999');
    expect(con.success).toBe(false);
    expect(con.error).toMatch(/does not exist/);
  });

  it('reserve with a stale fence is rejected with WORKER_FENCED_OFF and writes nothing', async () => {
    await seedInventory(5);
    await getAdminDb().collection('orderIdempotency').doc('idem_doc').set({
      status: 'CREATING',
      claimGeneration: 2,
      claimToken: 'current-token',
    });
    const r = await reserveInventoryTransaction([{ productId: PRODUCT, quantity: 1 }], 'res_fence', 'TCF-F', {
      idempDocId: 'idem_doc',
      claimGeneration: 1,
      claimToken: 'stale-token',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/^WORKER_FENCED_OFF/);
    expect(await inv()).toMatchObject({ availableQuantity: 5, reservedQuantity: 0 });

    const missing = await reserveInventoryTransaction([{ productId: PRODUCT, quantity: 1 }], 'res_fence2', 'TCF-F', {
      idempDocId: 'no_such_doc',
      claimGeneration: 1,
      claimToken: 'x',
    });
    expect(missing.error).toMatch(/^WORKER_FENCED_OFF: Idempotency claim document does not exist/);
  });

  it('POST /api/payments/verify returns 404 for an order missing from Firestore', async () => {
    const secret = 'emu_test_secret';
    process.env.RAZORPAY_KEY_SECRET = secret;
    try {
      const sig = crypto.createHmac('sha256', secret).update('order_x|pay_x').digest('hex');
      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-NONEXISTENT-999',
        razorpay_order_id: 'order_x',
        razorpay_payment_id: 'pay_x',
        razorpay_signature: sig,
      });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found in authoritative storage/i);
    } finally {
      delete process.env.RAZORPAY_KEY_SECRET;
    }
  });

  it('GET /api/checkout/readiness sees the database but keeps checkout disabled', async () => {
    await seedInventory(1);
    const res = await request(app).get('/api/checkout/readiness');
    expect(res.status).toBe(200);
    expect(res.body.checkoutEnabled).toBe(false);
  });
});
