/**
 * Route tests that need product data, run against a Firestore emulator seeded with the catalogue
 * exactly as scripts/migrate-catalog.ts writes it (all 33 active products unpriced, 4 historical).
 * Moved verbatim from src/tests/routes_integration.test.ts when the server switched from the
 * static catalogue to Firestore; only the catalogue lookups in assertions were adapted.
 * No mocks: real firebase-admin, real routes. No Razorpay calls are reached (all unpriced).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server';
import { reserveInventoryTransaction } from '../../server/inventoryService';
import { getAdminDb } from '../../server/firestoreAdmin';
import { buildProductDoc } from '../../../scripts/catalog/migrate';
import { CANONICAL_PRODUCTS, HISTORICAL_PRODUCTS } from '../../data/canonicalCatalog';
import { clearFirestore } from './helpers';

async function seedCatalogue() {
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date().toISOString();
  [...CANONICAL_PRODUCTS, ...HISTORICAL_PRODUCTS].forEach((cp, i) => {
    batch.set(db.collection('products').doc(cp.id), buildProductDoc(cp, [], now, i));
  });
  await batch.commit();
}

async function isActiveInFirestore(id: string) {
  const d = (await getAdminDb().collection('products').doc(id).get()).data();
  return Boolean(d && d.isActive === true && !d.isHistorical);
}

const validCustomer = {
  fullName: 'Ananya Sharma',
  email: 'ananya@example.com',
  phone: '9876543210',
  addressLine1: '123 Palm Grove Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001'
};

describe('Catalogue-dependent routes (Firestore emulator, seeded catalogue)', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    await clearFirestore();
    await seedCatalogue();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

    it('must report checkout as DISABLED when retail prices are pending or payment credentials absent', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.VITE_RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const res = await request(app).get('/api/checkout/readiness');
      expect(res.status).toBe(200);
      expect(res.body.checkoutEnabled).toBe(false);
      expect(res.body.status).toBe('DISABLED');
      expect(res.body.checks.pricedProductsCount).toBe(0);
      expect(res.body.checks.missingPriceCount).toBe(33);
      expect(res.body.checks.retailPricesReady).toBe(false);
      expect(res.body.checks.paymentCredentialsConfigured).toBe(false);
      expect(res.body.checks.webhookSecretConfigured).toBe(false);
      expect(typeof res.body.checks.databaseAvailable).toBe('boolean');
      expect(typeof res.body.checks.inventoryConfigured).toBe('boolean');
    });

    it('must reject non-existent or unknown product IDs with 400', async () => {
      const res = await request(app).post('/api/cart/validate').send({
        items: [{ productId: 'fabricated-candle-xyz', quantity: 1 }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('must reject historical product IDs from cart with 400', async () => {
      const res = await request(app).post('/api/cart/validate').send({
        items: [{ productId: 'jasmine-sage', quantity: 1 }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/historical product/i);
    });

    it('must reject active products with missing retail prices with 400', async () => {
      const res = await request(app).post('/api/cart/validate').send({
        items: [{ productId: 'golden-mogra-jar', quantity: 1 }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not have a verified retail price/i);
    });

    it('must reject invalid, zero, or negative quantities with 400', async () => {
      const resZero = await request(app).post('/api/cart/validate').send({
        items: [{ productId: 'golden-mogra-jar', quantity: 0 }]
      });
      expect(resZero.status).toBe(400);

      const resNegative = await request(app).post('/api/cart/validate').send({
        items: [{ productId: 'golden-mogra-jar', quantity: -2 }]
      });
      expect(resNegative.status).toBe(400);
    });

    it('must reject unknown product ID in order creation with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_test_key_unknown_123')
        .send({
          items: [{ productId: 'nonexistent-candle', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not available in the active catalogue/i);
    });

    it('must reject historical product ID in order creation with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_test_key_hist_123')
        .send({
          items: [{ productId: 'sandalwood-rose', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not available in the active catalogue/i);
    });

    it('must reject products with unverified retail prices before reserving stock', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_test_key_unpriced_123')
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not have a verified retail price/i);
    });

    it('must reject invalid or non-integer quantities with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_test_key_qty_123')
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 2.5 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });
      expect(res.status).toBe(400);
    });

    it('must fail closed and release reservation if Razorpay credentials are not configured', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.VITE_RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      // Note: With unpriced products, price check safely fails before gateway call
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_test_key_cred_123')
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
          customer: validCustomer,
        paymentMethod: 'razorpay'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('/api/ai/ritual must reject unknown product ID with 404', async () => {
      const res = await request(app)
        .post('/api/ai/ritual')
        .send({ productId: 'unverified-scent-999' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not available in the active catalogue/i);
    });

    it('/api/ai/ritual must reject historical product ID with 404', async () => {
      const res = await request(app)
        .post('/api/ai/ritual')
        .send({ productId: 'jasmine-sage' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not available in the active catalogue/i);
    });

    it('/api/ai/ritual must return valid ritual for verified active product', async () => {
      const res = await request(app)
        .post('/api/ai/ritual')
        .send({ productId: 'jumbo-tealight-mogra', duration: '15 minutes' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBeDefined();
      expect(Array.isArray(res.body.steps)).toBe(true);
      expect(res.body.mantra).toBeDefined();
    });

    it('/api/ai/compare must reject unknown product ID with 404', async () => {
      const res = await request(app)
        .post('/api/ai/compare')
        .send({ productIds: ['jumbo-tealight-mogra', 'unknown-candle-404'] });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/either unavailable or not found/i);
    });

    it('/api/ai/compare must return comparison for verified active products', async () => {
      const res = await request(app)
        .post('/api/ai/compare')
        .send({ productIds: ['jumbo-tealight-mogra', 'royal-urli'] });
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.guidance).toBeDefined();
    });

    it('/api/ai/find-flame must recommend a canonical active product', async () => {
      const res = await request(app)
        .post('/api/ai/find-flame')
        .send({ feeling: 'Calm', moment: 'Evening unwind', scentPreference: 'Floral' });
      expect(res.status).toBe(200);
      expect(await isActiveInFirestore(res.body.productId)).toBe(true);
    });

    it('/api/ai/assistant must return safe response and suggest active products only', async () => {
      const res = await request(app)
        .post('/api/ai/assistant')
        .send({ message: 'What candle is good for meditation?' });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBeDefined();
      for (const id of res.body.suggestedProducts) {
        expect(await isActiveInFirestore(id)).toBe(true);
      }
    });

    it('must reject reservation if any item in duplicate list is historical or invalid', async () => {
      const itemsWithHistorical = [
        { productId: 'jumbo-tealight-mogra', quantity: 1 },
        { productId: 'jasmine-sage', quantity: 2 } // Historical item
      ];

      const res = await reserveInventoryTransaction(itemsWithHistorical, 'res_test_agg_hist', 'TCF-AGG-HIST');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not available in the active catalogue/i);
    });

    it('must reject duplicate request with same idempotency key but unverified prices with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'idemp_key_test_123')
        .send({
          items: [{ productId: 'golden-mogra-jar', quantity: 1 }],
          customer: {
            fullName: 'Tara Sharma',
            email: 'tara@example.com',
            phone: '9876543210',
            addressLine1: '123 Calm Lane',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001'
          },
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not have a verified retail price/i);
    });

    it('must reject order creation with valid key but unpriced products with 400', async () => {
      const validKey = 'chk_attempt_20261019_abcdef123456';
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', validKey)
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not have a verified retail price/i);
    });

    it('must treat two different keys as distinct checkout attempts', async () => {
      const key1 = 'chk_attempt_distinct_111111111';
      const key2 = 'chk_attempt_distinct_222222222';

      const res1 = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', key1)
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      const res2 = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', key2)
        .send({
          items: [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      // Both should be independently validated and stopped before mutation
      expect(res1.status).toBe(400);
      expect(res2.status).toBe(400);
      expect(res1.body.error).toMatch(/does not have a verified retail price/i);
      expect(res2.body.error).toMatch(/does not have a verified retail price/i);
    });

  it('admin price change applies to the very next request (no redeploy, no cache)', async () => {
    const db = getAdminDb();
    let res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'peony-bloom', quantity: 1 }] });
    expect(res.status).toBe(400);
    await db.collection('products').doc('peony-bloom').update({
      price: 650, priceStatus: 'active', inStock: true, inventoryStatus: 'in_stock', availableStock: 5
    });
    res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'peony-bloom', quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ unitPrice: 650, totalPrice: 1300 });
    expect(res.body.total).toBe(1300 + 99);

    // A positive price without an explicit active status is still unbuyable
    await db.collection('products').doc('peony-bloom').update({ priceStatus: 'missing' });
    res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'peony-bloom', quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not have a verified retail price/i);
  });

  it('deactivating a product makes it unbuyable and hides it from AI endpoints', async () => {
    await getAdminDb().collection('products').doc('royal-urli').update({ isActive: false });
    const cart = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'royal-urli', quantity: 1 }] });
    expect(cart.status).toBe(400);
    const ritual = await request(app).post('/api/ai/ritual').send({ productId: 'royal-urli' });
    expect(ritual.status).toBe(404);
  });

  it('readiness reads the live catalogue and stays disabled while products are unpriced', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123';
    process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'mock_wh_secret';
    const res = await request(app).get('/api/checkout/readiness');
    expect(res.body.checkoutEnabled).toBe(false);
    expect(res.body.checks).toMatchObject({ catalogueTotal: 33, pricedProductsCount: 0, missingPriceCount: 33 });
  });

  it('readiness stays disabled even with every product priced unless CHECKOUT_ENABLED is set', async () => {
    const db = getAdminDb();
    const snap = await db.collection('products').where('isActive', '==', true).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { price: 500, priceStatus: 'active' }));
    await batch.commit();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123';
    process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'mock_wh_secret';
    delete process.env.CHECKOUT_ENABLED;
    const res = await request(app).get('/api/checkout/readiness');
    expect(res.body.checks).toMatchObject({ retailPricesReady: true, checkoutSwitchOn: false });
    expect(res.body.checkoutEnabled).toBe(false);
  });
});
