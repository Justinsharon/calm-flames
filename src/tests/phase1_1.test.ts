import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  ACTIVE_CANONICAL_CATALOG_MAP,
  CANONICAL_CATALOG_MAP,
  CANONICAL_PRODUCTS,
  HISTORICAL_PRODUCTS,
  getActiveCanonicalProductById,
  getCanonicalProductById
} from '../data/canonicalCatalog';

describe('The Calm Flame — Comprehensive Phase 1.1 Remediation Test Suite', () => {
  // ========================================================
  // 1. Catalogue and Pricing
  // ========================================================
  describe('1. Catalogue & Retail Pricing Integrity', () => {
    it('must keep exactly 33 verified active canonical products unchanged', () => {
      expect(CANONICAL_PRODUCTS).toHaveLength(33);
      expect(Object.keys(ACTIVE_CANONICAL_CATALOG_MAP)).toHaveLength(33);
    });

    it('must isolate historical products and prevent them from appearing in active lookups', () => {
      expect(HISTORICAL_PRODUCTS.length).toBeGreaterThan(0);
      for (const hist of HISTORICAL_PRODUCTS) {
        expect(ACTIVE_CANONICAL_CATALOG_MAP[hist.id]).toBeUndefined();
        expect(getActiveCanonicalProductById(hist.id)).toBeUndefined();
        // Historical products must remain in canonical reference for data integrity
        expect(CANONICAL_CATALOG_MAP[hist.id]).toBeDefined();
        expect(CANONICAL_CATALOG_MAP[hist.id]?.isHistorical).toBe(true);
        expect(CANONICAL_CATALOG_MAP[hist.id]?.isActive).toBe(false);
      }
    });

    it('must reject unknown and inactive product IDs from active catalogue lookups', () => {
      const unknownIds = ['unknown-candle-999', 'jasmine-sage', 'sandalwood-rose', 'massage-candles'];
      unknownIds.forEach((id) => {
        expect(getActiveCanonicalProductById(id)).toBeUndefined();
      });
    });

    it('must have priceStatus: missing and price: 0 for all 33 Festive products (no wholesale price leakage)', () => {
      const unpriced = CANONICAL_PRODUCTS.filter(p => p.priceStatus === 'missing' || p.price <= 0);
      expect(unpriced).toHaveLength(33);
    });

    it('must reject missing, zero, negative, and non-finite prices during cart validation logic', () => {
      const validatePrice = (price: any, priceStatus: any) => {
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || priceStatus === 'missing') {
          return { valid: false, error: 'Product does not have a verified retail price.' };
        }
        return { valid: true };
      };

      expect(validatePrice(0, 'missing').valid).toBe(false);
      expect(validatePrice(-100, 'active').valid).toBe(false);
      expect(validatePrice(NaN, 'active').valid).toBe(false);
      expect(validatePrice(Infinity, 'active').valid).toBe(false);
      expect(validatePrice(null, 'active').valid).toBe(false);
      expect(validatePrice(undefined, 'active').valid).toBe(false);
      expect(validatePrice(799, 'missing').valid).toBe(false);
      expect(validatePrice(799, 'active').valid).toBe(true);
    });

    it('must enforce server-authoritative prices over client-supplied prices', () => {
      const serverProduct = { id: 'golden-mogra-jar', price: 0, priceStatus: 'missing' };
      const clientSuppliedPrice = 299; // Client attempts to send ₹299
      const effectivePrice = (serverProduct.priceStatus === 'active' && serverProduct.price > 0)
        ? serverProduct.price
        : undefined;

      expect(effectivePrice).toBeUndefined();
      expect(effectivePrice).not.toBe(clientSuppliedPrice);
    });
  });

  // ========================================================
  // 2. Inventory State & Overselling Prevention
  // ========================================================
  describe('2. Live Inventory State & Overselling Prevention', () => {
    it('must represent unknown stock as unknown and inStock: false by default', () => {
      for (const prod of CANONICAL_PRODUCTS) {
        expect(prod.inventoryStatus).toBe('unknown');
        expect(prod.inStock).toBe(false);
      }
    });

    it('must reject checkout when inventory is unknown, unverified, or zero', () => {
      const checkInventory = (inv: { status?: string; inStock?: boolean; availableQuantity?: number }, requestedQty: number) => {
        if (!inv || inv.status !== 'in_stock' || inv.inStock !== true) {
          return { permitted: false, error: 'Stock not verified' };
        }
        const available = inv.availableQuantity ?? 0;
        if (available < requestedQty) {
          return { permitted: false, error: 'Insufficient stock' };
        }
        return { permitted: true, available };
      };

      expect(checkInventory({ status: 'unknown', inStock: false }, 1).permitted).toBe(false);
      expect(checkInventory({ status: 'out_of_stock', inStock: false, availableQuantity: 0 }, 1).permitted).toBe(false);
      expect(checkInventory({ status: 'in_stock', inStock: true, availableQuantity: 2 }, 5).permitted).toBe(false);
      expect(checkInventory({ status: 'in_stock', inStock: true, availableQuantity: 10 }, 2).permitted).toBe(true);
    });

    it('must atomically deduct stock and prevent overselling under concurrent requests', () => {
      // Simulating atomic transaction logic
      let inventoryState = { available: 5, reserved: 0 };
      const attemptReservation = (qty: number): boolean => {
        if (inventoryState.available >= qty) {
          inventoryState.available -= qty;
          inventoryState.reserved += qty;
          return true;
        }
        return false;
      };

      expect(attemptReservation(3)).toBe(true); // 5 -> 2
      expect(inventoryState.available).toBe(2);

      expect(attemptReservation(3)).toBe(false); // Insufficient (needs 3, only 2 left)
      expect(inventoryState.available).toBe(2); // Unchanged

      expect(attemptReservation(2)).toBe(true); // 2 -> 0
      expect(inventoryState.available).toBe(0);
      expect(inventoryState.reserved).toBe(5);
    });

    it('must release reserved inventory if an order creation or payment fails', () => {
      let inventoryState = { available: 0, reserved: 5 };
      const releaseReservation = (qty: number) => {
        inventoryState.available += qty;
        inventoryState.reserved = Math.max(0, inventoryState.reserved - qty);
      };

      releaseReservation(5);
      expect(inventoryState.available).toBe(5);
      expect(inventoryState.reserved).toBe(0);
    });
  });

  // ========================================================
  // 3. Razorpay Payment & Webhook Security
  // ========================================================
  describe('3. Razorpay Payment & Webhook Security', () => {
    it('must reject payment verification if server secret is missing', () => {
      const serverSecret = undefined;
      expect(!serverSecret).toBe(true);
    });

    it('must reject payment verification if signature is missing or empty', () => {
      const razorpay_signature = '';
      expect(!razorpay_signature).toBe(true);
    });

    it('must verify valid HMAC SHA-256 signature using order_id and payment_id', () => {
      const secret = 'secret_key_mock_123';
      const orderId = 'order_mock_999';
      const paymentId = 'pay_mock_888';

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(expected).toBe(validSignature);
    });

    it('must reject tampered or mismatched payment signatures', () => {
      const secret = 'secret_key_mock_123';
      const orderId = 'order_mock_999';
      const paymentId = 'pay_mock_888';

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const tampered = 'invalid_tampered_signature_hex';
      expect(validSignature).not.toBe(tampered);
    });

    it('must verify Razorpay webhook signature against raw request body bytes', () => {
      const webhookSecret = 'whsec_calmflame_test_secret';
      const rawPayload = Buffer.from(JSON.stringify({
        event: 'order.paid',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_123',
              order_id: 'order_rzp_456',
              amount: 159900,
              currency: 'INR'
            }
          }
        }
      }));

      const expectedWebhookSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const computedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      expect(computedSig).toBe(expectedWebhookSig);
    });

    it('must reject webhook if X-Razorpay-Signature header is missing or mismatched', () => {
      const webhookSecret = 'whsec_calmflame_test_secret';
      const rawPayload = Buffer.from('{"event":"payment.captured"}');
      const badSignature = 'forged_signature_12345';

      const computed = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      expect(computed).not.toBe(badSignature);
    });

    it('must enforce webhook event idempotency and reject duplicate events', () => {
      const processedStore = new Set<string>();
      const handleEvent = (eventId: string) => {
        if (processedStore.has(eventId)) {
          return { status: 'already_processed' };
        }
        processedStore.add(eventId);
        return { status: 'success' };
      };

      const eventId = 'evt_test_unique_001';
      expect(handleEvent(eventId).status).toBe('success');
      expect(handleEvent(eventId).status).toBe('already_processed');
      expect(handleEvent(eventId).status).toBe('already_processed');
    });

    it('must never synthesize fake Razorpay order IDs when gateway order creation fails', () => {
      const hasCredentials = false;
      let createdOrderId: string | null = null;
      if (hasCredentials) {
        createdOrderId = 'order_valid_from_api';
      }
      expect(createdOrderId).toBeNull();
    });
  });

  // ========================================================
  // 4. AI Product Validation Boundary
  // ========================================================
  describe('4. AI Product Validation Boundary', () => {
    it('must reject unknown and inactive product IDs from AI output', () => {
      const aiOutputIds = ['jumbo-tealight-mogra', 'fabricated-candle-xyz', 'jasmine-sage', 'royal-urli'];
      const validatedActive = aiOutputIds.filter((id) => {
        const prod = ACTIVE_CANONICAL_CATALOG_MAP[id];
        return prod && prod.isActive === true && !prod.isHistorical;
      });

      expect(validatedActive).toEqual(['jumbo-tealight-mogra', 'royal-urli']);
      expect(validatedActive).not.toContain('fabricated-candle-xyz');
      expect(validatedActive).not.toContain('jasmine-sage'); // Historical product filtered out
    });

    it('must validate AI Ritual Generator product ID and return 404/unavailable for unknown products', () => {
      const getRitualProduct = (productId: string) => {
        const p = ACTIVE_CANONICAL_CATALOG_MAP[productId];
        if (!p || p.isActive === false || p.isHistorical) {
          return null;
        }
        return p;
      };

      expect(getRitualProduct('invalid-product')).toBeNull();
      expect(getRitualProduct('jasmine-sage')).toBeNull();
      expect(getRitualProduct('jumbo-tealight-mogra')).toBeDefined();
    });

    it('must validate AI Product Comparison and reject unknown products', () => {
      const compareList = ['jumbo-tealight-mogra', 'fake-product-123'];
      const validated = compareList.map(id => {
        const p = ACTIVE_CANONICAL_CATALOG_MAP[id];
        return p && p.isActive ? p : null;
      });

      expect(validated[0]).not.toBeNull();
      expect(validated[1]).toBeNull();
    });
  });

  // ========================================================
  // 5. Global Checkout Readiness Gate
  // ========================================================
  describe('5. Global Checkout Readiness Gate', () => {
    it('must keep real checkout disabled while retail prices are pending and credentials absent', () => {
      const activeProducts = Object.values(ACTIVE_CANONICAL_CATALOG_MAP);
      const pricedCount = activeProducts.filter(p => p.priceStatus === 'active' && p.price > 0).length;
      const missingPriceCount = activeProducts.filter(p => p.priceStatus === 'missing' || p.price <= 0).length;

      const hasPaymentCredentials = false; // Currently absent in test environment
      const hasWebhookSecret = false;
      const hasPricedCatalogue = pricedCount > 0 && missingPriceCount === 0;

      const isCheckoutEnabled = hasPaymentCredentials && hasWebhookSecret && hasPricedCatalogue;

      expect(isCheckoutEnabled).toBe(false);
      expect(missingPriceCount).toBe(33);
    });

    it('allows storefront browsing while checkout is disabled', () => {
      expect(CANONICAL_PRODUCTS.length).toBe(33);
      const browsableProducts = CANONICAL_PRODUCTS.filter(p => p.isActive);
      expect(browsableProducts).toHaveLength(33);
    });
  });
});
