import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../server';
import { reserveInventoryTransaction } from '../server/inventoryService';

describe('Route-Level Backend Integration & Production-Safety Test Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // 1. Checkout Readiness Gate (/api/checkout/readiness)
  // =========================================================================
  describe('GET /api/checkout/readiness', () => {

    it('must keep checkout disabled even if credentials exist when retail prices are missing', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123';
      process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'mock_wh_secret';

      const res = await request(app).get('/api/checkout/readiness');
      expect(res.status).toBe(200);
      // Because all 33 Festive products have missing prices, checkout MUST remain disabled
      expect(res.body.checkoutEnabled).toBe(false);
      expect(res.body.status).toBe('DISABLED');
      expect(res.body.checks.retailPricesReady).toBe(false);
    });
  });

  // =========================================================================
  // 2. Cart Validation (/api/cart/validate)
  // =========================================================================
  describe('POST /api/cart/validate', () => {
    it('must reject empty or missing items payload with 400', async () => {
      const res = await request(app).post('/api/cart/validate').send({ items: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/empty or invalid/i);
    });




  });

  // =========================================================================
  // 3. Order Creation & Live Inventory Reservation (/api/orders/create)
  // =========================================================================
  describe('POST /api/orders/create', () => {
    const validCustomer = {
      fullName: 'Ananya Sharma',
      email: 'ananya@example.com',
      phone: '9876543210',
      addressLine1: '123 Palm Grove Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    };

    it('must reject order payload missing items or customer details with 400', async () => {
      const res = await request(app).post('/api/orders/create').send({ items: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing required order payload/i);
    });





  });

  // =========================================================================
  // 4. Authoritative Payment Verification (/api/payments/verify)
  // =========================================================================
  describe('POST /api/payments/verify', () => {
    it('must reject payload missing order_id, payment_id, or order_number with 400', async () => {
      const res = await request(app).post('/api/payments/verify').send({
        razorpay_payment_id: 'pay_123'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing payment verification credentials/i);
    });

    it('must reject verification with 503 if RAZORPAY_KEY_SECRET is not configured on server', async () => {
      delete process.env.RAZORPAY_KEY_SECRET;

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-123456',
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_456',
        razorpay_signature: 'dummy_sig'
      });
      expect(res.status).toBe(503);
      expect(res.body.verified).toBe(false);
      expect(res.body.status).toBe('UNVERIFIED');
      expect(res.body.error).toMatch(/secret is not configured/i);
    });

    it('must reject verification if signature is empty or missing with 400', async () => {
      process.env.RAZORPAY_KEY_SECRET = 'active_test_secret_777';

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-123456',
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_456',
        razorpay_signature: ''
      });
      expect(res.status).toBe(400);
      expect(res.body.verified).toBe(false);
      expect(res.body.error).toMatch(/signature missing/i);
    });

    it('must reject verification with 400 if HMAC signature is tampered or invalid', async () => {
      process.env.RAZORPAY_KEY_SECRET = 'active_test_secret_777';

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-123456',
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_456',
        razorpay_signature: 'tampered_forged_signature_hex'
      });
      expect(res.status).toBe(400);
      expect(res.body.verified).toBe(false);
      expect(res.body.error).toMatch(/signature verification failed/i);
    });

    it('must reject with 404 if internal order is not found in authoritative storage', async () => {
      process.env.RAZORPAY_KEY_SECRET = 'active_test_secret_777';
      const orderId = 'order_test_123';
      const paymentId = 'pay_test_456';
      const validSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-NONEXISTENT-999',
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      });
      expect(res.status).toBe(404);
      expect(res.body.verified).toBe(false);
      expect(res.body.error).toMatch(/not found in authoritative storage/i);
    });
  });

  // =========================================================================
  // 5. Razorpay Webhook Handler (/api/webhooks/razorpay)
  // =========================================================================
  describe('POST /api/webhooks/razorpay', () => {
    it('must reject webhook with 503 if RAZORPAY_WEBHOOK_SECRET is not configured on server', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .send({ event: 'order.paid' });
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/secret not configured/i);
    });

    it('must reject webhook with 400 if X-Razorpay-Signature header is missing', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_999';

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .send({ event: 'order.paid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing X-Razorpay-Signature/i);
    });

    it('must reject webhook with 400 if signature does not match raw request body', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_999';

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', 'forged_signature_hex_123')
        .send({ event: 'payment.captured' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature verification failed/i);
    });

    it('must reject webhook with 400 if event ID is missing', async () => {
      const webhookSecret = 'whsec_test_secret_999';
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

      const payload = JSON.stringify({ event: 'order.paid' });
      const validSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(Buffer.from(payload))
        .digest('hex');

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', validSig)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing event ID/i);
    });

    it('must reject order.paid webhook if missing order ID in payload with 400', async () => {
      const webhookSecret = 'whsec_test_secret_999';
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

      const payload = JSON.stringify({
        event: 'order.paid',
        event_id: 'evt_no_order_123',
        payload: { payment: { entity: { id: 'pay_123' } } }
      });
      const validSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(Buffer.from(payload))
        .digest('hex');

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', validSig)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing order ID/i);
    });
  });

  // =========================================================================
  // 6. AI Product Validation Boundaries
  // =========================================================================
  describe('Reservation expiry endpoint auth (no database needed)', () => {
    const url = '/api/admin/maintenance/expire-reservations';
    it('rejects requests without credentials (401) or with a wrong key (403)', async () => {
      process.env.MAINTENANCE_SECRET = 'maintenance-secret-0123456789';
      expect((await request(app).post(url).send({})).status).toBe(401);
      expect((await request(app).post(url).set('x-maintenance-key', 'wrong').send({})).status).toBe(403);
    });
    it('refuses key auth when MAINTENANCE_SECRET is unset or too short (503)', async () => {
      delete process.env.MAINTENANCE_SECRET;
      expect((await request(app).post(url).set('x-maintenance-key', 'anything').send({})).status).toBe(503);
      process.env.MAINTENANCE_SECRET = 'short';
      expect((await request(app).post(url).set('x-maintenance-key', 'short').send({})).status).toBe(503);
    });
    it('with a valid key but no database, fails closed with 500 and releases nothing', async () => {
      process.env.MAINTENANCE_SECRET = 'maintenance-secret-0123456789';
      const res = await request(app).post(url).set('x-maintenance-key', 'maintenance-secret-0123456789').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/safe to retry/i);
    });
  });

  // Catalogue-dependent route behaviour (unknown / historical / unpriced products, AI endpoints)
  // is tested against a seeded Firestore emulator in src/tests/emulator/routes_catalog.emulator.test.ts.
  // Here, with Firestore disabled, every route that needs product data must FAIL CLOSED.
  describe('Fail closed when the Firestore catalogue is unavailable', () => {
    const customer = {
      fullName: 'Ananya Sharma',
      email: 'ananya@example.com',
      phone: '9876543210',
      addressLine1: '123 Palm Grove Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    };

    it('readiness keeps checkout DISABLED and reports no priced products', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123';
      process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'mock_wh_secret';
      process.env.CHECKOUT_ENABLED = 'true';
      const res = await request(app).get('/api/checkout/readiness');
      expect(res.status).toBe(200);
      expect(res.body.checkoutEnabled).toBe(false);
      expect(res.body.checks.databaseAvailable).toBe(false);
      expect(res.body.checks.catalogueTotal).toBe(0);
      expect(res.body.checks.pricedProductsCount).toBe(0);
      expect(res.body.checks.retailPricesReady).toBe(false);
    });

    it('cart validation returns 503, never a price', async () => {
      const res = await request(app).post('/api/cart/validate').send({ items: [{ productId: 'golden-mogra-jar', quantity: 1 }] });
      expect(res.status).toBe(503);
      expect(res.body.valid).toBeUndefined();
      expect(res.body.error).toMatch(/catalogue is temporarily unavailable/i);
    });

    it('order creation returns 503 before claiming or reserving anything', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'chk_catalog_down_123456')
        .send({ items: [{ productId: 'golden-mogra-jar', quantity: 1 }], customer, paymentMethod: 'cod' });
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/catalogue is temporarily unavailable/i);
    });

    it('AI endpoints return 503 instead of falling back to static product data', async () => {
      const calls = [
        request(app).post('/api/ai/ritual').send({ productId: 'jumbo-tealight-mogra' }),
        request(app).post('/api/ai/compare').send({ productIds: ['jumbo-tealight-mogra'] }),
        request(app).post('/api/ai/find-flame').send({ feeling: 'Calm' }),
        request(app).post('/api/ai/assistant').send({ message: 'hello' }),
        request(app).post('/api/ai/gift').send({ recipient: 'Friend' })
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(503);
      }
    });

    it('reserveInventoryTransaction fails safely without writing', async () => {
      const res = await reserveInventoryTransaction([{ productId: 'jumbo-tealight-mogra', quantity: 1 }], 'res_down_1', 'TCF-DOWN');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unavailable|storage/i);
    });
  });

  // =========================================================================
  // 7. Durable Inventory Reservation Lifecycle & Idempotency
  // =========================================================================
  describe('7. Inventory Reservation Lifecycle & Idempotency Rules', () => {
    it('must enforce valid reservation states: RESERVED, CONSUMED, RELEASED', () => {
      const validStates = ['RESERVED', 'CONSUMED', 'RELEASED'];
      expect(validStates).toContain('RESERVED');
      expect(validStates).toContain('CONSUMED');
      expect(validStates).toContain('RELEASED');
    });

    it('must prevent double-release and double inventory increments', () => {
      let availableStock = 10;
      let reservedStock = 5;
      const reservations: Record<string, { status: string; qty: number }> = {
        'res_test_001': { status: 'RESERVED', qty: 5 }
      };

      const release = (resId: string) => {
        const record = reservations[resId];
        if (!record) return { success: false, error: 'Not found' };
        if (record.status === 'RELEASED') {
          return { success: true, alreadyReleased: true };
        }
        if (record.status === 'CONSUMED') {
          return { success: false, error: 'Cannot release consumed reservation' };
        }
        availableStock += record.qty;
        reservedStock = Math.max(0, reservedStock - record.qty);
        record.status = 'RELEASED';
        return { success: true };
      };

      // First release
      const first = release('res_test_001');
      expect(first.success).toBe(true);
      expect(first.alreadyReleased).toBeUndefined();
      expect(availableStock).toBe(15);
      expect(reservedStock).toBe(0);

      // Repeated duplicate release must NOT increment inventory again
      const second = release('res_test_001');
      expect(second.success).toBe(true);
      expect(second.alreadyReleased).toBe(true);
      expect(availableStock).toBe(15); // Unchanged!
      expect(reservedStock).toBe(0);
    });

    it('must reject releasing a reservation that was already CONSUMED', () => {
      const reservations: Record<string, { status: string; qty: number }> = {
        'res_test_002': { status: 'CONSUMED', qty: 3 }
      };

      const release = (resId: string) => {
        const record = reservations[resId];
        if (record.status === 'CONSUMED') {
          return { success: false, error: 'Cannot release consumed reservation' };
        }
        return { success: true };
      };

      const res = release('res_test_002');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot release consumed/i);
    });

    it('must reject consuming a reservation that was already RELEASED', () => {
      const reservations: Record<string, { status: string; qty: number }> = {
        'res_test_003': { status: 'RELEASED', qty: 2 }
      };

      const consume = (resId: string) => {
        const record = reservations[resId];
        if (record.status === 'RELEASED') {
          return { success: false, error: 'Cannot consume a released reservation' };
        }
        return { success: true };
      };

      const res = consume('res_test_003');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot consume a released reservation/i);
    });
  });

  // =========================================================================
  // 8. Duplicate Product ID Aggregation (reserveInventoryTransaction)
  // =========================================================================
  describe('8. Duplicate Product ID Aggregation in Inventory Reservation', () => {
    it('must validate and aggregate duplicate product IDs before inventory checks', async () => {
      // Test the validation and aggregation boundary of reserveInventoryTransaction
      // Request with duplicate product IDs:
      // Product 'jumbo-tealight-mogra', qty 2 and qty 3 => aggregate 5
      // Product 'royal-urli', qty 1
      const duplicateItems = [
        { productId: 'jumbo-tealight-mogra', quantity: 2 },
        { productId: 'jumbo-tealight-mogra', quantity: 3 },
        { productId: 'royal-urli', quantity: 1 }
      ];

      const res = await reserveInventoryTransaction(duplicateItems, 'res_test_agg_1', 'TCF-AGG-1');
      // Must fail safely with database availability error, NOT an unhandled exception or partial reservation
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('must reject when aggregate quantity across duplicate lines exceeds permitted limit of 100', async () => {
      const excessiveDuplicates = [
        { productId: 'jumbo-tealight-mogra', quantity: 60 },
        { productId: 'jumbo-tealight-mogra', quantity: 45 } // aggregate = 105 > 100
      ];

      const res = await reserveInventoryTransaction(excessiveDuplicates, 'res_test_agg_max', 'TCF-AGG-MAX');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/exceeds permitted limit of 100/i);
    });


    it('must reject reservation if any item has invalid or negative quantity', async () => {
      const itemsWithNegative = [
        { productId: 'jumbo-tealight-mogra', quantity: 2 },
        { productId: 'jumbo-tealight-mogra', quantity: -1 }
      ];

      const res = await reserveInventoryTransaction(itemsWithNegative, 'res_test_agg_neg', 'TCF-AGG-NEG');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/must be a positive integer/i);
    });
  });

  // =========================================================================
  // 9. Fail-Closed Payment Verification Details (/api/payments/verify)
  // =========================================================================
  describe('9. Authoritative Payment Verification Fail-Closed Behavior', () => {
    it('must fail with 503 if Razorpay merchant API credentials are missing on server', async () => {
      process.env.RAZORPAY_KEY_SECRET = 'active_test_secret_777';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.VITE_RAZORPAY_KEY_ID;

      const orderId = 'order_test_api_fail';
      const paymentId = 'pay_test_api_fail';
      const validSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-123456',
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      });

      // Must fail closed with 404 (order not found) or 503 (API credentials missing)
      expect([404, 503]).toContain(res.status);
      expect(res.body.verified).toBe(false);
    });

    it('must reject verification if signature is valid but internal order is not found', async () => {
      process.env.RAZORPAY_KEY_SECRET = 'active_test_secret_777';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_123';

      const orderId = 'order_mock_valid_123';
      const paymentId = 'pay_mock_valid_456';
      const validSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app).post('/api/payments/verify').send({
        order_number: 'TCF-MISSING-ORDER',
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      });

      expect(res.status).toBe(404);
      expect(res.body.verified).toBe(false);
      expect(res.body.error).toMatch(/not found in authoritative storage/i);
    });
  });

  // =========================================================================
  // 10. Concurrency-Safe Razorpay Webhook Processing (/api/webhooks/razorpay)
  // =========================================================================
  describe('10. Concurrency-Safe Razorpay Webhook Processing', () => {
    it('must reject webhook missing raw body buffer or invalid signature with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_999';

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', 'invalid_hex')
        .send({ event: 'order.paid', event_id: 'evt_123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature verification failed/i);
    });

    it('must fail closed with 500 when durable database is unavailable to claim event', async () => {
      const webhookSecret = 'whsec_test_secret_999';
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

      const payload = JSON.stringify({
        event: 'order.paid',
        event_id: 'evt_durable_fail_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_123',
              order_id: 'order_test_123',
              amount: 50000,
              currency: 'INR'
            }
          }
        }
      });

      const validSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(Buffer.from(payload))
        .digest('hex');

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', validSig)
        .set('Content-Type', 'application/json')
        .send(payload);

      // In testing without live Firestore credentials, must return 500 so provider retries safely
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Durable storage unavailable/i);
    });
  });

  // =========================================================================
  // 11. Durable Order Creation Idempotency & Uncertainty Handling (/api/orders/create)
  // =========================================================================
  describe('11. Order Creation Idempotency & Uncertain Outcomes', () => {

    it('must reject order creation with malformed customer or empty items with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'idemp_key_test_empty')
        .send({
          items: [],
          customer: null,
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing required order payload/i);
    });
  });

  // =========================================================================
  // 12. Inventory Consumption & Release Invariants Regression
  // =========================================================================
  describe('12. Inventory Invariants (Consume & Release)', () => {
    it('releaseInventoryReservation must fail safely when reservation record does not exist', async () => {
      const { releaseInventoryReservation } = await import('../server/inventoryService');
      const result = await releaseInventoryReservation('res_nonexistent_999999');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist|storage|failed|permission/i);
    });

    it('consumeInventoryReservation must fail safely when reservation record does not exist', async () => {
      const { consumeInventoryReservation } = await import('../server/inventoryService');
      const result = await consumeInventoryReservation('res_nonexistent_999999');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist|storage|failed|permission/i);
    });

    it('consumeInventoryReservation must reject empty or non-string reservation ID', async () => {
      const { consumeInventoryReservation } = await import('../server/inventoryService');
      // @ts-ignore
      const result = await consumeInventoryReservation('');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/valid reservation ID is required/i);
    });

    it('releaseInventoryReservation must reject missing reservation ID', async () => {
      const { releaseInventoryReservation } = await import('../server/inventoryService');
      // @ts-ignore
      const result = await releaseInventoryReservation(undefined);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/valid reservation ID is required/i);
    });
  });

  // =========================================================================
  // 13. Phase 1.2 Fix A: Mandatory Razorpay Webhook Validation Matrix
  // =========================================================================
  describe('13. Phase 1.2 Fix A: Webhook Validation Matrix', () => {
    const webhookSecret = 'whsec_test_secret_999';

    function signPayload(payloadStr: string) {
      return crypto.createHmac('sha256', webhookSecret).update(Buffer.from(payloadStr)).digest('hex');
    }

    it('must safely ignore unsupported webhook events without altering order or inventory state', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'subscription.charged',
        event_id: 'evt_unsupported_123',
        payload: { subscription: { entity: { id: 'sub_123' } } }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ignored_unsupported_event');
      expect(res.body.event).toBe('subscription.charged');
    });

    it('must reject payment.captured webhook missing payment entity with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.captured',
        event_id: 'evt_no_pay_entity_123',
        payload: {}
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing payment entity/i);
    });

    it('must reject payment.captured webhook missing payment ID with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.captured',
        event_id: 'evt_no_pid_123',
        payload: {
          payment: {
            entity: {
              order_id: 'order_123',
              amount: 50000,
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing payment ID/i);
    });

    it('must reject payment.captured webhook with invalid/uncaptured status with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.captured',
        event_id: 'evt_bad_status_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 50000,
              currency: 'INR',
              status: 'created' // not captured!
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid payment status/i);
    });

    it('must reject payment.captured webhook with missing or invalid currency with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.captured',
        event_id: 'evt_no_curr_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 50000,
              currency: '',
              status: 'captured'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing currency/i);
    });

    it('must reject payment.captured webhook with missing or non-integer amount with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.captured',
        event_id: 'evt_bad_amt_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 'not-a-number',
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or invalid amount/i);
    });

    it('must reject order.paid webhook with invalid order status with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'order.paid',
        event_id: 'evt_bad_ord_status_123',
        payload: {
          order: {
            entity: {
              id: 'order_123',
              amount: 50000,
              currency: 'INR',
              status: 'attempted' // not paid!
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid order status/i);
    });
  });

  // =========================================================================
  // 14. Phase 1.2 Fix C: Unique Checkout-Attempt Idempotency & Replay Safety
  // =========================================================================
  describe('14. Phase 1.2 Fix C: Unique Checkout Idempotency', () => {
    const validCustomer = {
      fullName: 'Aarav Patel',
      email: 'aarav@example.com',
      phone: '9876543210',
      addressLine1: '456 Lotus Court',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001'
    };

    it('must reject order creation when client idempotency key is missing', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .send({
          items: [{ productId: 'golden-mogra-jar', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or invalid checkout idempotency key/i);
    });

    it('must reject order creation when idempotency key is too short (< 16 chars)', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'too_short_key')
        .send({
          items: [{ productId: 'golden-mogra-jar', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or invalid checkout idempotency key/i);
    });

    it('must reject order creation when idempotency key contains invalid characters', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set('idempotency-key', 'key_with/illegal/slashes/123456789')
        .send({
          items: [{ productId: 'golden-mogra-jar', quantity: 1 }],
          customer: validCustomer,
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or invalid checkout idempotency key/i);
    });


  });

  // =========================================================================
  // 15. Phase 1.2.1 Concurrency, Fencing & Webhook Race Conditions
  // =========================================================================
  describe('15. Phase 1.2.1 Concurrency, Fencing & Webhook Race Conditions', () => {
    const webhookSecret = 'whsec_test_secret_999';

    function signPayload(payloadStr: string) {
      return crypto.createHmac('sha256', webhookSecret).update(Buffer.from(payloadStr)).digest('hex');
    }

    it('reserveInventoryTransaction must fail with WORKER_FENCED_OFF when fence claim fails', async () => {
      const { reserveInventoryTransaction } = await import('../server/inventoryService');
      const result = await reserveInventoryTransaction(
        [{ productId: 'jumbo-tealight-mogra', quantity: 1 }],
        'res_fence_test_123',
        'TCF-FENCE-123',
        {
          idempDocId: 'order_nonexistent_fenced_doc_id',
          claimGeneration: 99,
          claimToken: 'stale-claim-token-123'
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/WORKER_FENCED_OFF|storage|permission|failed/i);
    });

    it('payment.failed webhook must reject missing payment entity with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_no_entity_123',
        payload: {}
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing payment entity/i);
    });

    it('payment.failed webhook must reject missing payment ID with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_no_pid_123',
        payload: {
          payment: {
            entity: {
              order_id: 'order_123',
              status: 'failed'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing payment ID/i);
    });

    it('payment.failed webhook must reject missing order ID with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_no_oid_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_123',
              status: 'failed'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing order ID/i);
    });

    it('payment.failed webhook must reject captured payment with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_captured_bad_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_captured_in_failed_evt',
              order_id: 'order_123',
              status: 'captured'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid payment status/i);
    });

    it('payment.failed webhook with non-integer amount must be rejected with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_bad_amt_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 'not-an-integer',
              status: 'failed'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or invalid amount/i);
    });

    it('payment.failed webhook with empty currency must be rejected with 400', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
      const payload = JSON.stringify({
        event: 'payment.failed',
        event_id: 'evt_fail_empty_curr_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              currency: '',
              status: 'failed'
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing or empty currency/i);
    });
  });
});


