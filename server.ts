import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  ACTIVE_CANONICAL_CATALOG_MAP,
  CANONICAL_CATALOG_MAP,
  CANONICAL_PRODUCTS,
  getActiveCanonicalProductById,
  getCanonicalProductById
} from './src/data/canonicalCatalog';
import {
  reserveInventoryTransaction,
  releaseInventoryReservation,
  consumeInventoryReservation,
  fetchInventory
} from './src/services/dbService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const SERVER_CATALOG: Record<string, any> = ACTIVE_CANONICAL_CATALOG_MAP;

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Initialize Google GenAI Server Client with required aistudio-build User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const FREE_SHIPPING_THRESHOLD = 1500;
const STANDARD_SHIPPING_FEE = 99;

/**
 * Global Checkout Readiness Gate
 * Validates that all production checkout prerequisites are active:
 * 1. Verified retail prices for catalogue products (missing price count must be 0)
 * 2. Database operations availability
 * 3. Inventory management capability
 * 4. Razorpay key configuration
 * 5. Webhook verification secret
 */
app.get('/api/checkout/readiness', async (_req: Request, res: Response) => {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const activeProducts = Object.values(ACTIVE_CANONICAL_CATALOG_MAP);
  const pricedProductsCount = activeProducts.filter(p => p.priceStatus === 'active' && p.price > 0).length;
  const missingPriceCount = activeProducts.filter(p => p.priceStatus === 'missing' || p.price <= 0).length;

  // Operational database check
  let databaseAvailable = false;
  let inventoryConfigured = false;
  try {
    const { db } = await import('./src/lib/firebase');
    databaseAvailable = Boolean(db);
    // Verify inventory collection access or structure
    const invRecords = await fetchInventory();
    inventoryConfigured = Array.isArray(invRecords);
  } catch (dbErr) {
    databaseAvailable = false;
    inventoryConfigured = false;
  }

  const hasPaymentCredentials = Boolean(razorpayKeyId && razorpayKeySecret);
  const hasWebhookSecret = Boolean(webhookSecret);
  const hasPricedCatalogue = pricedProductsCount > 0 && missingPriceCount === 0;

  // Real checkout must remain disabled unless every condition is satisfied
  const isCheckoutEnabled =
    databaseAvailable &&
    inventoryConfigured &&
    hasPaymentCredentials &&
    hasWebhookSecret &&
    hasPricedCatalogue;

  return res.json({
    checkoutEnabled: isCheckoutEnabled,
    status: isCheckoutEnabled ? 'READY' : 'DISABLED',
    checks: {
      catalogueTotal: activeProducts.length,
      pricedProductsCount,
      missingPriceCount,
      retailPricesReady: hasPricedCatalogue,
      databaseAvailable,
      inventoryConfigured,
      paymentCredentialsConfigured: hasPaymentCredentials,
      webhookSecretConfigured: hasWebhookSecret,
    },
    message: isCheckoutEnabled
      ? 'All production checkout gates verified.'
      : 'Real checkout is disabled. Catalogue products have pending retail prices, inventory is unverified, or payment credentials are not configured.',
  });
});

/**
 * 1. Cart Validation Endpoint (Authoritative Prices & Line Items)
 * Rejects missing prices, non-positive prices, historical products, and invalid quantities.
 */
app.post('/api/cart/validate', (req: Request, res: Response) => {
  try {
    const { items, couponCode } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or invalid format.' });
    }

    let calculatedSubtotal = 0;
    const validatedItems: any[] = [];

    for (const item of items) {
      // 1. Verify existence in active canonical catalog
      const serverProduct = ACTIVE_CANONICAL_CATALOG_MAP[item.productId];
      if (!serverProduct) {
        const historical = CANONICAL_CATALOG_MAP[item.productId];
        if (historical) {
          return res.status(400).json({
            error: `${historical.name} is a historical product and is no longer available in the active catalogue.`
          });
        }
        return res.status(400).json({ error: `Product ${item.productId} not found.` });
      }

      // 2. Reject inactive or historical items
      if (serverProduct.isActive === false || serverProduct.isHistorical) {
        return res.status(400).json({
          error: `${serverProduct.name} is no longer available in the active catalogue.`
        });
      }

      // 3. Strict Retail Price Validation - Never allow missing, zero, or unverified prices
      if (
        typeof serverProduct.price !== 'number' ||
        !Number.isFinite(serverProduct.price) ||
        serverProduct.price <= 0 ||
        serverProduct.priceStatus === 'missing'
      ) {
        return res.status(400).json({
          error: `${serverProduct.name} does not have a verified retail price and is currently unavailable for online purchase.`
        });
      }

      // 4. Validate quantity (positive integer, 1 to 100)
      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 100
      ) {
        return res.status(400).json({
          error: `Invalid quantity for ${serverProduct.name}. Permitted range is 1 to 100.`
        });
      }

      // 5. Strict Inventory Verification - Unknown inventory is never treated as in stock
      if (
        serverProduct.inStock !== true ||
        serverProduct.inventoryStatus !== 'in_stock'
      ) {
        return res.status(400).json({
          error: `${serverProduct.name} does not have verified available stock and cannot be purchased at this time.`
        });
      }

      if (typeof serverProduct.availableStock === 'number' && serverProduct.availableStock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${serverProduct.name}. Requested ${item.quantity}, available: ${serverProduct.availableStock}.`
        });
      }

      const verifiedUnitPrice = serverProduct.price;
      const verifiedLineTotal = verifiedUnitPrice * item.quantity;
      calculatedSubtotal += verifiedLineTotal;

      validatedItems.push({
        productId: item.productId,
        productName: serverProduct.name,
        quantity: item.quantity,
        unitPrice: verifiedUnitPrice,
        totalPrice: verifiedLineTotal,
        priceStatus: serverProduct.priceStatus
      });
    }

    let discount = 0;
    if (couponCode) {
      const codeClean = String(couponCode).trim().toUpperCase();
      if (codeClean === 'CALM10' && calculatedSubtotal >= 500) {
        discount = Math.min(500, Math.round(calculatedSubtotal * 0.10));
      } else if (codeClean === 'FIRSTFLAME' && calculatedSubtotal >= 999) {
        discount = 150;
      }
    }

    const shipping = calculatedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    const finalTotal = Math.max(0, calculatedSubtotal - discount + shipping);

    return res.json({
      valid: true,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      discount,
      shipping,
      total: finalTotal,
      currency: 'INR',
    });
  } catch (err: any) {
    console.error('Cart validation error:', err);
    return res.status(500).json({ error: 'Server error during price validation.' });
  }
});

/**
 * 2. Create Order & Razorpay Order (Strict Server-Calculated Totals, Live Inventory Reservation & Durable Idempotency)
 * Connects live inventory to order creation via atomic reservation.
 * Idempotent: Tracks requests via durable orderIdempotency collection and payload fingerprinting.
 * Fail-closed: Safely reconciles uncertain gateway timeouts and releases reservations on definitive failures.
 */
app.post('/api/orders/create', async (req: Request, res: Response) => {
  try {
    const { items, customer, paymentMethod, couponCode } = req.body;

    if (!Array.isArray(items) || items.length === 0 || !customer) {
      return res.status(400).json({ error: 'Missing required order payload.' });
    }

    // 1. Mandatory Unique Client Checkout-Attempt Idempotency Key (Fix C)
    const rawIdempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string) ||
      req.body.idempotencyKey;

    if (
      !rawIdempotencyKey ||
      typeof rawIdempotencyKey !== 'string' ||
      rawIdempotencyKey.trim().length < 16 ||
      rawIdempotencyKey.trim().length > 128 ||
      !/^[A-Za-z0-9_\-\.]+$/.test(rawIdempotencyKey.trim())
    ) {
      return res.status(400).json({
        error:
          'Missing or invalid checkout idempotency key. A unique client-generated key (16-128 characters matching [A-Za-z0-9_.-]) is required.'
      });
    }

    const cleanIdempotencyKey = rawIdempotencyKey.trim();
    // Derives a safe Firestore-compatible document ID scoped to order checkout
    const idempDocId =
      'order_' + crypto.createHash('sha256').update(cleanIdempotencyKey).digest('hex');

    // 2. Strict Retail Price and Quantity Validation across Active Canonical Catalogue
    let subtotal = 0;
    for (const item of items) {
      if (!item || typeof item.productId !== 'string' || !item.productId.trim()) {
        return res.status(400).json({ error: 'Invalid item format in order payload.' });
      }
      const prodId = item.productId.trim();
      const prod = ACTIVE_CANONICAL_CATALOG_MAP[prodId];
      if (!prod) {
        return res.status(400).json({
          error: `Product ${prodId} is not available in the active catalogue.`
        });
      }
      if (prod.isActive === false || prod.isHistorical) {
        return res.status(400).json({
          error: `${prod.name} is no longer available in the active catalogue.`
        });
      }

      if (
        typeof prod.price !== 'number' ||
        !Number.isFinite(prod.price) ||
        prod.price <= 0 ||
        prod.priceStatus === 'missing'
      ) {
        return res.status(400).json({
          error: `${prod.name} does not have a verified retail price and cannot be ordered.`
        });
      }

      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 100
      ) {
        return res.status(400).json({
          error: `Invalid quantity for ${prod.name}. Permitted range is 1 to 100.`
        });
      }

      subtotal += prod.price * item.quantity;
    }

    // 3. Calculate authoritative server totals and discounts
    let discount = 0;
    if (couponCode) {
      const codeClean = String(couponCode).trim().toUpperCase();
      if (codeClean === 'CALM10' && subtotal >= 500) discount = Math.min(500, Math.round(subtotal * 0.10));
      if (codeClean === 'FIRSTFLAME' && subtotal >= 999) discount = 150;
    }

    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    const total = Math.max(0, subtotal - discount + shipping);

    const normalizedItems = [...items]
      .map((i: any) => ({ productId: String(i.productId).trim(), quantity: Number(i.quantity) }))
      .sort((a, b) => a.productId.localeCompare(b.productId));

    const payloadFingerprint = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          items: normalizedItems,
          email: String(customer.email).trim().toLowerCase(),
          paymentMethod: String(paymentMethod).trim().toLowerCase(),
          couponCode: couponCode ? String(couponCode).trim().toUpperCase() : ''
        })
      )
      .digest('hex');

    // 4. ATOMIC IDEMPOTENCY CLAIM VIA FIRESTORE TRANSACTION WITH ABANDONED CLAIM RECOVERY
    const { db } = await import('./src/lib/firebase');
    const { runTransaction, doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
    const idempDocRef = doc(db, 'orderIdempotency', idempDocId);

    const initialClaimToken = crypto.randomUUID();
    const initialOrderNumber = `TCF-${Math.floor(100000 + Math.random() * 900000)}`;
    const initialReservationId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    let claimResult: any = null;
    try {
      claimResult = await runTransaction(db, async (transaction) => {
        const idempSnap = await transaction.get(idempDocRef);
        if (idempSnap.exists()) {
          const existing = idempSnap.data() as any;
          // Detect reused key with different request payload and reject safely
          if (existing.payloadHash && existing.payloadHash !== payloadFingerprint) {
            return { action: 'MISMATCHED_PAYLOAD' };
          }
          if (
            existing.status === 'COMPLETED' ||
            existing.status === 'PAYMENT_PENDING'
          ) {
            return { action: 'RETURN_EXISTING', orderNumber: existing.orderNumber };
          }
          if (existing.status === 'RECONCILIATION_REQUIRED') {
            return { action: 'RECONCILIATION_REQUIRED', orderNumber: existing.orderNumber };
          }
          if (existing.status === 'FAILED') {
            return { action: 'PREVIOUSLY_FAILED' };
          }

          if (existing.status === 'CREATING' || existing.status === 'RESERVED') {
            const claimTime = existing.updatedAt
              ? new Date(existing.updatedAt).getTime()
              : (existing.createdAt ? new Date(existing.createdAt).getTime() : 0);
            const now = Date.now();
            const CLAIM_TIMEOUT_MS = 60 * 1000; // 60-second lease

            if (now - claimTime < CLAIM_TIMEOUT_MS) {
              return { action: 'IN_PROGRESS' };
            }

            // STALE ABANDONED CLAIM RECOVERY (Fix C.C):
            // Check whether order or mapping was already persisted
            if (existing.orderNumber) {
              const existingOrderRef = doc(db, 'orders', existing.orderNumber);
              const existingOrderSnap = await transaction.get(existingOrderRef);

              if (existingOrderSnap.exists()) {
                const ordData = existingOrderSnap.data();
                if (ordData.paymentStatus === 'PAID' || ordData.status === 'CONFIRMED') {
                  transaction.update(idempDocRef, {
                    status: 'COMPLETED',
                    updatedAt: new Date().toISOString()
                  });
                  return { action: 'RETURN_EXISTING', orderNumber: existing.orderNumber };
                }
                if (ordData.razorpayOrderId) {
                  transaction.update(idempDocRef, {
                    status: 'PAYMENT_PENDING',
                    razorpayOrderId: ordData.razorpayOrderId,
                    updatedAt: new Date().toISOString()
                  });
                  return { action: 'RETURN_EXISTING', orderNumber: existing.orderNumber };
                }
                // Order persisted in RESERVED state without razorpayOrderId:
                // Uncertain if gateway call occurred; transition to RECONCILIATION_REQUIRED
                transaction.update(idempDocRef, {
                  status: 'RECONCILIATION_REQUIRED',
                  reconciliationReason: 'ABANDONED_RESERVED_ORDER',
                  updatedAt: new Date().toISOString()
                });
                return { action: 'RECONCILIATION_REQUIRED', orderNumber: existing.orderNumber };
              }
            }

            // Previous worker crashed before order creation; reclaim attempt with incremented generation
            const nextGen = (existing.claimGeneration || 1) + 1;
            const newOrderNum = `TCF-${Math.floor(100000 + Math.random() * 900000)}`;
            const newResId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

            transaction.update(idempDocRef, {
              status: 'CREATING',
              orderNumber: newOrderNum,
              reservationId: newResId,
              claimGeneration: nextGen,
              claimToken: initialClaimToken,
              updatedAt: new Date().toISOString()
            });

            return {
              action: 'CLAIMED',
              orderNumber: newOrderNum,
              reservationId: newResId,
              claimGeneration: nextGen,
              claimToken: initialClaimToken
            };
          }
        }

        // Fresh claim: claim idempotency key in CREATING state with generation 1
        transaction.set(idempDocRef, {
          idempotencyKey: cleanIdempotencyKey,
          clientKey: cleanIdempotencyKey,
          orderNumber: initialOrderNumber,
          reservationId: initialReservationId,
          claimGeneration: 1,
          claimToken: initialClaimToken,
          status: 'CREATING',
          payloadHash: payloadFingerprint,
          amount: total,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return {
          action: 'CLAIMED',
          orderNumber: initialOrderNumber,
          reservationId: initialReservationId,
          claimGeneration: 1,
          claimToken: initialClaimToken
        };
      });
    } catch (claimErr) {
      console.error('Atomic idempotency claim transaction failed:', claimErr);
      return res.status(500).json({ error: 'Atomic idempotency claim failed. Order creation stopped.' });
    }

    if (claimResult.action === 'MISMATCHED_PAYLOAD') {
      return res.status(400).json({
        error: 'Idempotency key reuse detected with mismatched request payload.'
      });
    }

    if (claimResult.action === 'IN_PROGRESS') {
      return res.status(409).json({
        error: 'Order creation is currently in progress for this request.'
      });
    }

    if (claimResult.action === 'RECONCILIATION_REQUIRED') {
      return res.status(409).json({
        error: 'Previous order creation requires manual reconciliation. Please contact support.'
      });
    }

    if (claimResult.action === 'PREVIOUSLY_FAILED') {
      return res.status(400).json({
        error: 'Previous order creation attempt with this idempotency key failed. Please use a new checkout attempt.'
      });
    }

    if (claimResult.action === 'RETURN_EXISTING') {
      try {
        const existingOrderRef = doc(db, 'orders', claimResult.orderNumber);
        const orderSnap = await getDoc(existingOrderRef);
        if (orderSnap.exists()) {
          const ord = orderSnap.data();
          return res.json({
            orderNumber: ord.orderNumber,
            razorpayOrderId: ord.razorpayOrderId,
            amount: ord.total,
            currency: ord.currency || 'INR',
            subtotal: ord.subtotal,
            discount: ord.discount || 0,
            shipping: ord.shipping || 0,
            paymentMethod: ord.paymentMethod
          });
        }
      } catch (fetchErr) {
        console.error('Could not retrieve existing order from Firestore:', fetchErr);
      }
      return res.status(500).json({ error: 'Failed to retrieve existing completed order.' });
    }

    // Use claimed orderNumber and reservationId
    const claimedOrderNumber = claimResult.orderNumber;
    const claimedReservationId = claimResult.reservationId;
    const workerClaimGeneration = claimResult.claimGeneration || 1;
    const workerClaimToken = claimResult.claimToken;

    const fencedUpdateIdempotency = async (updates: Record<string, any>) => {
      try {
        return await runTransaction(db, async (tx) => {
          const snap = await tx.get(idempDocRef);
          if (!snap.exists()) return false;
          const data = snap.data();
          if (
            data.claimGeneration !== workerClaimGeneration ||
            data.claimToken !== workerClaimToken
          ) {
            return false;
          }
          tx.update(idempDocRef, { ...updates, updatedAt: new Date().toISOString() });
          return true;
        });
      } catch (e) {
        return false;
      }
    };

    // 5. Perform live atomic inventory reservation in Firestore with idempotency claim fence
    const reservationResult = await reserveInventoryTransaction(
      items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      claimedReservationId,
      claimedOrderNumber,
      {
        idempDocId,
        claimGeneration: workerClaimGeneration,
        claimToken: workerClaimToken
      }
    );

    if (!reservationResult.success) {
      if (reservationResult.error?.includes('WORKER_FENCED_OFF')) {
        return res.status(409).json({
          error: 'Worker was fenced off. Idempotency claim was reclaimed by another worker.'
        });
      }
      await fencedUpdateIdempotency({
        status: 'FAILED',
        error: reservationResult.error
      });
      return res.status(400).json({
        error: reservationResult.error || 'Could not reserve inventory for requested items.'
      });
    }

    const reservedItems = reservationResult.reservedItems || [];

    // 6. Persist initial order record and update idempotency status in ONE fenced Firestore transaction
    const orderDocRef = doc(db, 'orders', claimedOrderNumber);
    try {
      await runTransaction(db, async (tx) => {
        const idempSnap = await tx.get(idempDocRef);
        if (!idempSnap.exists()) {
          throw new Error('WORKER_FENCED_OFF: Idempotency claim document does not exist.');
        }
        const idempData = idempSnap.data() as any;
        if (
          idempData.claimGeneration !== workerClaimGeneration ||
          idempData.claimToken !== workerClaimToken ||
          idempData.status !== 'CREATING'
        ) {
          throw new Error('WORKER_FENCED_OFF: Idempotency claim was reclaimed or updated by another worker.');
        }

        tx.set(orderDocRef, {
          orderId: claimedOrderNumber,
          orderNumber: claimedOrderNumber,
          idempotencyKey: cleanIdempotencyKey,
          razorpayOrderId: null,
          subtotal,
          discount,
          shipping,
          total,
          expectedAmountPaise: Math.round(total * 100),
          currency: 'INR',
          paymentMethod,
          items: reservedItems,
          customer,
          reservationId: claimedReservationId,
          status: 'RESERVED',
          paymentStatus: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        tx.update(idempDocRef, {
          status: 'RESERVED',
          updatedAt: new Date().toISOString()
        });
      });
    } catch (orderPersistErr: any) {
      console.error('Could not persist initial order in Firestore:', orderPersistErr);
      await releaseInventoryReservation(claimedReservationId, reservedItems);
      if (orderPersistErr?.message?.includes('WORKER_FENCED_OFF')) {
        return res.status(409).json({
          error: 'Worker was fenced off. Attempt was reclaimed by a newer worker.'
        });
      }
      await fencedUpdateIdempotency({
        status: 'FAILED',
        error: 'Order persistence failed.'
      });
      return res.status(500).json({
        error: 'Order persistence failed. Inventory reservation released.'
      });
    }

    // 7. Razorpay Order Creation (if paymentMethod === 'razorpay')
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    let razorpayOrderId: string | undefined = undefined;

    if (paymentMethod === 'razorpay') {
      if (!razorpayKeyId || !razorpayKeySecret) {
        // Fail closed: Release reservation before returning error
        await releaseInventoryReservation(claimedReservationId, reservedItems);
        try {
          await runTransaction(db, async (tx) => {
            const idempSnap = await tx.get(idempDocRef);
            if (idempSnap.exists()) {
              const idData = idempSnap.data();
              if (idData.claimGeneration === workerClaimGeneration && idData.claimToken === workerClaimToken) {
                tx.update(orderDocRef, { status: 'FAILED', updatedAt: new Date().toISOString() });
                tx.update(idempDocRef, { status: 'FAILED', updatedAt: new Date().toISOString() });
              }
            }
          });
        } catch (e) {}
        return res.status(503).json({
          error: 'Razorpay payment gateway is not configured with active merchant credentials on the server. Online payment is unavailable.'
        });
      }

      // Check fence before executing external network call to prevent duplicate provider orders
      try {
        const idempPreSnap = await getDoc(idempDocRef);
        if (idempPreSnap.exists()) {
          const preData = idempPreSnap.data();
          if (
            preData.claimGeneration !== workerClaimGeneration ||
            preData.claimToken !== workerClaimToken
          ) {
            await releaseInventoryReservation(claimedReservationId, reservedItems);
            return res.status(409).json({
              error: 'Worker was fenced off before payment gateway interaction.'
            });
          }
        }
      } catch (e) {}

      try {
        const authHeader = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
        const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`
          },
          body: JSON.stringify({
            amount: Math.round(total * 100),
            currency: 'INR',
            receipt: claimedOrderNumber,
            notes: {
              customer_name: customer.fullName,
              customer_email: customer.email,
              order_number: claimedOrderNumber
            }
          })
        });

        if (!rzpResponse.ok) {
          const errBody = await rzpResponse.json().catch(() => ({}));
          console.error('Razorpay order creation API error:', errBody);
          // Gateway definitively rejected order: release reservation and fail safely
          await releaseInventoryReservation(claimedReservationId, reservedItems);
          try {
            await runTransaction(db, async (tx) => {
              const idempSnap = await tx.get(idempDocRef);
              if (idempSnap.exists()) {
                const idData = idempSnap.data();
                if (idData.claimGeneration === workerClaimGeneration && idData.claimToken === workerClaimToken) {
                  tx.update(orderDocRef, { status: 'FAILED', updatedAt: new Date().toISOString() });
                  tx.update(idempDocRef, { status: 'FAILED', updatedAt: new Date().toISOString() });
                }
              }
            });
          } catch (e) {}
          return res.status(502).json({
            error: 'Failed to create payment order with Razorpay gateway. Please try again or select Cash on Delivery.'
          });
        }

        const rzpData = await rzpResponse.json();
        razorpayOrderId = rzpData.id;
      } catch (err: any) {
        console.error('Razorpay server order creation network exception or timeout:', err);
        // Uncertain outcome: do NOT assume order was not created; hold for reconciliation
        try {
          await runTransaction(db, async (tx) => {
            const idempSnap = await tx.get(idempDocRef);
            if (idempSnap.exists()) {
              const idData = idempSnap.data();
              if (idData.claimGeneration === workerClaimGeneration && idData.claimToken === workerClaimToken) {
                tx.update(orderDocRef, {
                  status: 'RECONCILIATION_REQUIRED',
                  reconciliationReason: 'RAZORPAY_CREATE_TIMEOUT',
                  updatedAt: new Date().toISOString()
                });
                tx.update(idempDocRef, {
                  status: 'RECONCILIATION_REQUIRED',
                  updatedAt: new Date().toISOString()
                });
              }
            }
          });
        } catch (e) {}
        return res.status(502).json({
          error: 'Payment gateway communication timed out with uncertain outcome. Order held for reconciliation.'
        });
      }
    }

    // 8. Atomically Persist Razorpay Order ID & Order Mapping with claim fencing
    try {
      await runTransaction(db, async (tx) => {
        const idempSnap = await tx.get(idempDocRef);
        if (!idempSnap.exists()) {
          throw new Error('WORKER_FENCED_OFF: Idempotency claim record missing.');
        }
        const idempData = idempSnap.data();
        if (
          idempData.claimGeneration !== workerClaimGeneration ||
          idempData.claimToken !== workerClaimToken
        ) {
          throw new Error('WORKER_FENCED_OFF: Claim was reclaimed during gateway interaction.');
        }

        const curOrderSnap = await tx.get(orderDocRef);
        if (!curOrderSnap.exists()) {
          throw new Error('ORDER_MISSING');
        }

        tx.update(orderDocRef, {
          razorpayOrderId: razorpayOrderId || null,
          status: 'PAYMENT_PENDING',
          updatedAt: new Date().toISOString()
        });

        if (razorpayOrderId) {
          const mapDocRef = doc(db, 'orderMappings', razorpayOrderId);
          tx.set(mapDocRef, {
            orderNumber: claimedOrderNumber,
            createdAt: new Date().toISOString()
          });
        }

        tx.update(idempDocRef, {
          status: 'COMPLETED',
          razorpayOrderId: razorpayOrderId || null,
          updatedAt: new Date().toISOString()
        });
      });
    } catch (mappingErr: any) {
      console.error('Post-order persistence transaction error:', mappingErr);
      if (mappingErr?.message?.includes('WORKER_FENCED_OFF')) {
        if (razorpayOrderId) {
          try {
            const mapDocRef = doc(db, 'orderMappings', razorpayOrderId);
            await setDoc(mapDocRef, {
              orderNumber: claimedOrderNumber,
              reconciliationRequired: true,
              reconciliationReason: 'WORKER_FENCED_OFF_AFTER_GATEWAY_CREATE',
              createdAt: new Date().toISOString()
            });
          } catch (e) {}
        }
        return res.status(409).json({
          error: 'Worker was fenced off. A newer attempt has taken ownership.'
        });
      }

      try {
        await updateDoc(orderDocRef, {
          status: 'RECONCILIATION_REQUIRED',
          reconciliationReason: 'ORDER_MAPPING_PERSISTENCE_FAILED',
          updatedAt: new Date().toISOString()
        });
        await updateDoc(idempDocRef, {
          status: 'RECONCILIATION_REQUIRED',
          updatedAt: new Date().toISOString()
        });
      } catch (e) {}
      return res.status(500).json({
        error: 'Order mapping persistence failed. Order held for reconciliation.'
      });
    }

    return res.json({
      orderNumber: claimedOrderNumber,
      razorpayOrderId,
      amount: total,
      currency: 'INR',
      subtotal,
      discount,
      shipping,
      paymentMethod
    });
  } catch (err: any) {
    console.error('Order creation error:', err);
    return res.status(500).json({ error: 'Failed to create order.' });
  }
});

/**
 * 3. Verify Payment Signature (Authoritative & Durable)
 * Validates internal stored order, expected amounts in paise, currency, order association,
 * requires authenticated Razorpay API payment verification, fails closed on any error,
 * and consumes inventory reservation upon successful payment verification.
 */
app.post('/api/payments/verify', async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_number } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !order_number) {
      return res.status(400).json({ error: 'Missing payment verification credentials or order number.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(503).json({
        verified: false,
        status: 'UNVERIFIED',
        error: 'Payment verification secret is not configured on the server. Contact store support.',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id
      });
    }

    if (!razorpay_signature) {
      return res.status(400).json({
        verified: false,
        status: 'UNVERIFIED',
        error: 'Payment signature missing from verification payload.'
      });
    }

    // 1. Verify HMAC signature using server key secret
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Signature verification failed. Invalid authenticity token.'
      });
    }

    // 2. Load matching internal pending order from durable storage
    let storedOrder: any = null;
    let orderDocRef: any = null;
    try {
      const { db } = await import('./src/lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      orderDocRef = doc(db, 'orders', order_number);
      const snap = await getDoc(orderDocRef);
      if (snap.exists()) {
        storedOrder = snap.data();
      }
    } catch (dbErr) {
      console.warn('Could not read stored order from Firestore:', dbErr);
    }

    if (!storedOrder) {
      return res.status(404).json({
        verified: false,
        status: 'FAILED',
        error: `Matching pending order ${order_number} not found in authoritative storage.`
      });
    }

    // 3. Idempotent check: if already verified and confirmed, return existing confirmation
    if (storedOrder.paymentStatus === 'PAID' || storedOrder.status === 'CONFIRMED') {
      return res.json({
        verified: true,
        status: 'PAID',
        paymentId: storedOrder.razorpayPaymentId || razorpay_payment_id,
        orderId: storedOrder.razorpayOrderId || razorpay_order_id,
        orderNumber: storedOrder.orderNumber || order_number,
        amount: storedOrder.total,
        currency: storedOrder.currency || 'INR',
        timestamp: storedOrder.verifiedAt || new Date().toISOString()
      });
    }

    // 4. Validate order state: do not allow failed or cancelled orders to become paid without reconciliation
    if (storedOrder.status === 'FAILED' || storedOrder.status === 'CANCELLED') {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Order is in a non-payable terminal state (FAILED/CANCELLED). Reconciliation required.'
      });
    }

    // 5. Validate order association: verify that razorpayOrderId exists and matches incoming provider ID
    if (!storedOrder.razorpayOrderId || storedOrder.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Razorpay order ID does not match stored order record.'
      });
    }

    // 6. Authoritative Gateway API Verification: retrieve payment from Razorpay API
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    if (!keyId) {
      return res.status(503).json({
        verified: false,
        status: 'UNVERIFIED',
        error: 'Razorpay merchant API credentials not configured on the server. Authoritative verification required.'
      });
    }

    let payData: any = null;
    try {
      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const rzpPayResp = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        headers: { Authorization: `Basic ${authHeader}` },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!rzpPayResp.ok) {
        console.error('Razorpay payment fetch failed with status:', rzpPayResp.status);
        return res.status(502).json({
          verified: false,
          status: 'UNVERIFIED',
          error: 'Razorpay API verification failed. Payment status could not be established.'
        });
      }
      payData = await rzpPayResp.json();
    } catch (payFetchErr: any) {
      console.error('Razorpay payment API network exception or timeout:', payFetchErr);
      return res.status(502).json({
        verified: false,
        status: 'UNVERIFIED',
        error: 'Razorpay API verification request failed or timed out. Failing closed.'
      });
    }

    // 7. Verify provider-confirmed payment belongs to expected Razorpay order
    if (!payData.order_id || payData.order_id !== storedOrder.razorpayOrderId) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Payment does not belong to the expected Razorpay order.'
      });
    }

    // 8. Verify provider-confirmed amount in paise matches server-persisted expectedAmountPaise
    if (typeof payData.amount !== 'number' || payData.amount !== storedOrder.expectedAmountPaise) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Payment amount mismatch between gateway and stored order.'
      });
    }

    // 9. Verify currency matches stored currency
    if (!payData.currency || payData.currency !== (storedOrder.currency || 'INR')) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: 'Payment currency mismatch between gateway and stored order.'
      });
    }

    // 10. Require appropriate captured status
    if (payData.status !== 'captured') {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        error: `Payment is not in captured status (current status: ${payData.status}).`
      });
    }

    // 11. Consume inventory reservation durably
    const resId = storedOrder.reservationId || storedOrder.reservationToken;
    if (resId) {
      const consumeResult = await consumeInventoryReservation(resId);
      if (!consumeResult.success) {
        try {
          const { updateDoc } = await import('firebase/firestore');
          await updateDoc(orderDocRef, {
            status: 'RECONCILIATION_REQUIRED',
            paymentStatus: 'PAID',
            reconciliationReason: 'INVENTORY_CONSUMPTION_FAILED',
            razorpayPaymentId: razorpay_payment_id,
            updatedAt: new Date().toISOString()
          });
        } catch (recErr) {}
        return res.status(500).json({
          verified: false,
          status: 'RECONCILIATION_REQUIRED',
          error: 'Inventory consumption failed. Order held for reconciliation.'
        });
      }
    }

    // 12. Update order status in durable storage to PAID / CONFIRMED
    try {
      if (orderDocRef) {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(orderDocRef, {
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
          razorpayPaymentId: razorpay_payment_id,
          verifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (updErr) {
      console.error('Could not update order status in Firestore:', updErr);
      return res.status(500).json({
        verified: false,
        status: 'RECONCILIATION_REQUIRED',
        error: 'Payment confirmed by gateway but database update failed. Order held for reconciliation.'
      });
    }

    return res.json({
      verified: true,
      status: 'PAID',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      orderNumber: order_number,
      amount: storedOrder.total,
      currency: storedOrder.currency || 'INR',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ verified: false, error: 'Internal verification failure.' });
  }
});

/**
 * 4. Secure & Concurrency-Safe Razorpay Webhook Handler
 * Verifies X-Razorpay-Signature using raw request bytes and webhook secret.
 * Rejects missing secrets, missing signatures, or signature mismatches.
 * Uses durable Firestore transaction to claim event ID with active lease checking.
 * Reconciles missing orders safely without marking unverified events completed.
 * Fail closed: returns 500 on database failure so provider retries.
 */
app.post('/api/webhooks/razorpay', async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'] as string;

    if (!webhookSecret) {
      console.warn('Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured on the server.');
      return res.status(503).json({
        error: 'Webhook verification secret not configured on the server. Webhook processing disabled.'
      });
    }

    if (!signature) {
      return res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
    }

    // Verify using exact raw request body buffer
    const rawBodyBuffer = (req as any).rawBody;
    if (!rawBodyBuffer) {
      return res.status(400).json({ error: 'Raw request body not available for signature verification.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBodyBuffer)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('Razorpay webhook signature mismatch.');
      return res.status(400).json({ error: 'Webhook signature verification failed.' });
    }

    const event = req.body;
    const eventId = event?.event_id || event?.id;
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({ error: 'Missing event ID in webhook payload.' });
    }

    const eventType = event.event;
    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid event type in webhook payload.' });
    }

    // Acknowledge unsupported event types safely without altering order or inventory state (Fix A.C)
    const SUPPORTED_EVENTS = ['order.paid', 'payment.captured', 'payment.failed'];
    if (!SUPPORTED_EVENTS.includes(eventType)) {
      return res.status(200).json({
        status: 'ignored_unsupported_event',
        event: eventType,
        eventId
      });
    }

    // Extract event-specific payload entities safely (Fix A.A & Fix A.B)
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;

    let rzpOrderId: string | undefined = undefined;
    let rzpPaymentId: string | undefined = undefined;
    let incomingAmountPaise: number | undefined = undefined;
    let incomingCurrency: string | undefined = undefined;

    if (eventType === 'payment.captured') {
      if (!paymentEntity) {
        return res.status(400).json({ error: 'Missing payment entity in payment.captured webhook payload.' });
      }
      rzpOrderId = paymentEntity.order_id;
      rzpPaymentId = paymentEntity.id;
      incomingAmountPaise = paymentEntity.amount;
      incomingCurrency = paymentEntity.currency;

      if (!rzpOrderId || typeof rzpOrderId !== 'string' || !rzpOrderId.trim()) {
        return res.status(400).json({ error: 'Missing order ID in payment.captured payload.' });
      }
      if (!rzpPaymentId || typeof rzpPaymentId !== 'string' || !rzpPaymentId.trim()) {
        return res.status(400).json({ error: 'Missing payment ID in payment.captured payload.' });
      }
      if (typeof incomingAmountPaise !== 'number' || !Number.isInteger(incomingAmountPaise) || incomingAmountPaise <= 0) {
        return res.status(400).json({ error: 'Missing or invalid amount in payment.captured payload.' });
      }
      if (!incomingCurrency || typeof incomingCurrency !== 'string' || !incomingCurrency.trim()) {
        return res.status(400).json({ error: 'Missing currency in payment.captured payload.' });
      }
      if (paymentEntity.status !== 'captured') {
        return res.status(400).json({ error: `Invalid payment status for payment.captured: ${paymentEntity.status}` });
      }
    } else if (eventType === 'order.paid') {
      rzpOrderId = orderEntity?.id || paymentEntity?.order_id;
      rzpPaymentId = paymentEntity?.id;
      incomingAmountPaise = orderEntity?.amount ?? paymentEntity?.amount;
      incomingCurrency = orderEntity?.currency || paymentEntity?.currency;

      if (!rzpOrderId || typeof rzpOrderId !== 'string' || !rzpOrderId.trim()) {
        return res.status(400).json({ error: 'Missing order ID in order.paid payload.' });
      }
      if (typeof incomingAmountPaise !== 'number' || !Number.isInteger(incomingAmountPaise) || incomingAmountPaise <= 0) {
        return res.status(400).json({ error: 'Missing or invalid amount in order.paid payload.' });
      }
      if (!incomingCurrency || typeof incomingCurrency !== 'string' || !incomingCurrency.trim()) {
        return res.status(400).json({ error: 'Missing or empty currency in order.paid payload.' });
      }
      if (orderEntity?.status && orderEntity.status !== 'paid') {
        return res.status(400).json({ error: `Invalid order status in order.paid payload: ${orderEntity.status}` });
      }

      // If order.paid payload lacks payment ID, query authenticated Razorpay API (Fix A.B)
      if (!rzpPaymentId) {
        const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
          return res.status(503).json({
            error: 'Razorpay merchant API credentials not configured to retrieve missing payment entity for order.paid.'
          });
        }

        try {
          const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
          const fetchRes = await fetch(`https://api.razorpay.com/v1/orders/${rzpOrderId}/payments`, {
            headers: { Authorization: `Basic ${authHeader}` }
          });
          if (!fetchRes.ok) {
            return res.status(502).json({
              error: 'Failed to retrieve payment records from Razorpay API for order.paid verification.'
            });
          }
          const payList = await fetchRes.json();
          const validPay = payList.items?.find(
            (p: any) =>
              p.status === 'captured' &&
              p.order_id === rzpOrderId &&
              p.amount === incomingAmountPaise &&
              p.currency === incomingCurrency
          );
          if (!validPay) {
            return res.status(400).json({
              error: 'No captured payment matching order and expected amount found on Razorpay.'
            });
          }
          rzpPaymentId = validPay.id;
        } catch (apiErr) {
          console.error('Razorpay API payment retrieval exception:', apiErr);
          return res.status(502).json({
            error: 'Razorpay API communication failure while retrieving payment for order.paid.'
          });
        }
      }
    } else if (eventType === 'payment.failed') {
      if (!paymentEntity) {
        return res.status(400).json({ error: 'Missing payment entity in payment.failed webhook payload.' });
      }
      rzpOrderId = paymentEntity.order_id || orderEntity?.id;
      rzpPaymentId = paymentEntity.id;
      incomingAmountPaise = paymentEntity.amount !== undefined ? paymentEntity.amount : orderEntity?.amount;
      incomingCurrency = paymentEntity.currency !== undefined ? paymentEntity.currency : orderEntity?.currency;

      if (!rzpOrderId || typeof rzpOrderId !== 'string' || !rzpOrderId.trim()) {
        return res.status(400).json({ error: 'Missing order ID in payment.failed payload.' });
      }
      if (!rzpPaymentId || typeof rzpPaymentId !== 'string' || !rzpPaymentId.trim()) {
        return res.status(400).json({ error: 'Missing payment ID in payment.failed payload.' });
      }
      if (incomingAmountPaise !== undefined) {
        if (typeof incomingAmountPaise !== 'number' || !Number.isInteger(incomingAmountPaise) || incomingAmountPaise <= 0) {
          return res.status(400).json({ error: 'Missing or invalid amount in payment.failed payload.' });
        }
      }
      if (incomingCurrency !== undefined) {
        if (typeof incomingCurrency !== 'string' || !incomingCurrency.trim()) {
          return res.status(400).json({ error: 'Missing or empty currency in payment.failed payload.' });
        }
      }
      if (paymentEntity.status && paymentEntity.status === 'captured') {
        return res.status(400).json({ error: 'Invalid payment status: captured payment received in payment.failed event.' });
      }
    }

    // 1. Claim event ID durably with monotonic lease generation and UUID fence token (Fix B)
    let workerLeaseGeneration = 1;
    const workerLeaseToken = crypto.randomUUID();

    try {
      const { db } = await import('./src/lib/firebase');
      const { runTransaction, doc, getDoc, updateDoc } = await import('firebase/firestore');

      const txResult = await runTransaction(db, async (transaction) => {
        const eventDocRef = doc(db, 'razorpayEvents', eventId);
        const eventDocSnap = await transaction.get(eventDocRef);

        if (eventDocSnap.exists()) {
          const eventData = eventDocSnap.data();
          if (eventData.status === 'COMPLETED') {
            return { outcome: 'already_completed' };
          }
          if (eventData.status === 'PROCESSING') {
            const claimTime = eventData.claimedAt ? new Date(eventData.claimedAt).getTime() : 0;
            const now = Date.now();
            const LEASE_DURATION_MS = 60 * 1000; // 60-second processing lease
            if (now - claimTime < LEASE_DURATION_MS) {
              return { outcome: 'in_progress' };
            }
            // Stale claim lease expired; increment monotonic lease generation (Fix B)
            workerLeaseGeneration = (eventData.leaseGeneration || 1) + 1;
          } else {
            workerLeaseGeneration = (eventData.leaseGeneration || 1) + 1;
          }
        }

        // Atomically claim event in progress with lease generation and fence token
        transaction.set(
          eventDocRef,
          {
            eventId,
            event: eventType,
            status: 'PROCESSING',
            leaseToken: workerLeaseToken,
            leaseGeneration: workerLeaseGeneration,
            claimedAt: new Date().toISOString(),
            receivedAt: eventDocSnap.exists()
              ? eventDocSnap.data().receivedAt || new Date().toISOString()
              : new Date().toISOString()
          },
          { merge: true }
        );

        return { outcome: 'claimed', leaseGeneration: workerLeaseGeneration, leaseToken: workerLeaseToken };
      });

      if (txResult.outcome === 'already_completed') {
        return res.status(200).json({ status: 'already_processed', eventId });
      }

      if (txResult.outcome === 'in_progress') {
        return res.status(409).json({
          status: 'in_progress',
          message: 'Event is currently being processed by concurrent delivery.'
        });
      }

      // Fenced helper for updating razorpayEvents during validation & early return paths
      const fencedUpdateEvent = async (updates: Record<string, any>) => {
        try {
          return await runTransaction(db, async (tx) => {
            const eventDocRef = doc(db, 'razorpayEvents', eventId);
            const snap = await tx.get(eventDocRef);
            if (!snap.exists()) return { success: false, fencedOff: true };
            const cur = snap.data();
            if (
              cur.leaseGeneration !== workerLeaseGeneration ||
              cur.leaseToken !== workerLeaseToken ||
              cur.status !== 'PROCESSING'
            ) {
              return { success: false, fencedOff: true };
            }
            tx.update(eventDocRef, {
              ...updates,
              updatedAt: new Date().toISOString()
            });
            return { success: true };
          });
        } catch (e) {
          return { success: false };
        }
      };

      // 2. Resolve matching internal order via receipt or durable orderMappings
      let orderDocRef: any = null;
      let orderData: any = null;
      const receipt = event.payload?.order?.entity?.receipt;

      if (receipt) {
        const rRef = doc(db, 'orders', receipt);
        const rSnap = await getDoc(rRef);
        if (rSnap.exists()) {
          orderDocRef = rRef;
          orderData = rSnap.data();
        }
      }

      if (!orderDocRef && rzpOrderId) {
        const mapRef = doc(db, 'orderMappings', rzpOrderId);
        const mapSnap = await getDoc(mapRef);
        if (mapSnap.exists()) {
          const mapData = mapSnap.data();
          if (mapData.orderNumber) {
            const oRef = doc(db, 'orders', mapData.orderNumber);
            const oSnap = await getDoc(oRef);
            if (oSnap.exists()) {
              orderDocRef = oRef;
              orderData = oSnap.data();
            }
          }
        }
      }

      // 3. If no matching order exists, DO NOT mark completed. Fail safely and record reconciliation state.
      if (!orderDocRef || !orderData) {
        const updateRes = await fencedUpdateEvent({
          status: 'FAILED',
          requiresReconciliation: true,
          reconciliationReason: 'NO_MATCHING_ORDER',
          error: `No internal order found for Razorpay order ID ${rzpOrderId || 'unknown'} or receipt ${receipt || 'unknown'}`
        });
        if (updateRes.fencedOff) {
          return res.status(409).json({
            error: 'Worker was fenced off. Event lease was reclaimed by a newer generation worker.'
          });
        }
        return res.status(404).json({
          error: 'Matching order record not found in authoritative storage. Preserved for reconciliation.'
        });
      }

      // 4. Mandatory Business-State Validation against stored order (Fix A & Fix 2/3)
      // Validation A: Terminal failed or cancelled order state protection
      if (orderData.status === 'FAILED' || orderData.status === 'CANCELLED') {
        if (eventType === 'order.paid' || eventType === 'payment.captured') {
          const updateRes = await fencedUpdateEvent({
            status: 'FAILED',
            requiresReconciliation: true,
            reconciliationReason: 'ORDER_IN_TERMINAL_FAILED_STATE',
            error: `Cannot confirm payment for order in terminal ${orderData.status} state without reconciliation.`
          });
          if (updateRes.fencedOff) {
            return res.status(409).json({ error: 'Worker was fenced off.' });
          }
          return res.status(400).json({
            error: `Cannot process payment webhook: order ${orderData.orderNumber} is in terminal ${orderData.status} state. Reconciliation required.`
          });
        } else if (eventType === 'payment.failed') {
          const updateRes = await fencedUpdateEvent({
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            note: `Order was already in terminal ${orderData.status} state.`
          });
          if (updateRes.fencedOff) {
            return res.status(409).json({ error: 'Worker was fenced off.' });
          }
          return res.status(200).json({
            status: 'already_cancelled',
            eventId,
            orderNumber: orderData.orderNumber
          });
        }
      }

      // Validation B: Razorpay Order ID must match stored record exactly across all event types
      if (!orderData.razorpayOrderId || orderData.razorpayOrderId !== rzpOrderId) {
        const updateRes = await fencedUpdateEvent({
          status: 'FAILED',
          requiresReconciliation: true,
          reconciliationReason: 'ORDER_ID_MISMATCH',
          error: `Razorpay order ID mismatch. Webhook: ${rzpOrderId}, Stored: ${orderData.razorpayOrderId}`
        });
        if (updateRes.fencedOff) {
          return res.status(409).json({ error: 'Worker was fenced off.' });
        }
        return res.status(400).json({
          error: 'Razorpay order ID in webhook payload does not match stored order record.'
        });
      }

      // Validation C: Payment Amount in Paise must match expectedAmountPaise exactly
      if (
        incomingAmountPaise !== undefined &&
        (typeof orderData.expectedAmountPaise !== 'number' || incomingAmountPaise !== orderData.expectedAmountPaise)
      ) {
        const updateRes = await fencedUpdateEvent({
          status: 'FAILED',
          requiresReconciliation: true,
          reconciliationReason: 'AMOUNT_MISMATCH',
          error: `Payment amount in paise (${incomingAmountPaise}) does not match stored order expected amount (${orderData.expectedAmountPaise})`
        });
        if (updateRes.fencedOff) {
          return res.status(409).json({ error: 'Worker was fenced off.' });
        }
        return res.status(400).json({
          error: 'Payment amount mismatch between webhook payload and stored order.'
        });
      }

      // Validation D: Payment Currency must match stored currency exactly
      const expectedCurrency = orderData.currency || 'INR';
      if (incomingCurrency !== undefined && incomingCurrency !== expectedCurrency) {
        const updateRes = await fencedUpdateEvent({
          status: 'FAILED',
          requiresReconciliation: true,
          reconciliationReason: 'CURRENCY_MISMATCH',
          error: `Payment currency (${incomingCurrency}) does not match stored order currency (${expectedCurrency})`
        });
        if (updateRes.fencedOff) {
          return res.status(409).json({ error: 'Worker was fenced off.' });
        }
        return res.status(400).json({
          error: 'Payment currency mismatch between webhook payload and stored order.'
        });
      }

      // Validation E: Already paid / confirmed (idempotency check & out-of-order protection)
      if (orderData.paymentStatus === 'PAID' || orderData.status === 'CONFIRMED') {
        if (eventType === 'order.paid' || eventType === 'payment.captured') {
          const updateRes = await fencedUpdateEvent({
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            note: 'Order was already confirmed and paid.'
          });
          if (updateRes.fencedOff) {
            return res.status(409).json({ error: 'Worker was fenced off.' });
          }
          return res.status(200).json({ status: 'already_paid', eventId, orderNumber: orderData.orderNumber });
        } else if (eventType === 'payment.failed') {
          const updateRes = await fencedUpdateEvent({
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            note: 'Ignored payment.failed for already paid order'
          });
          if (updateRes.fencedOff) {
            return res.status(409).json({ error: 'Worker was fenced off.' });
          }
          return res.status(200).json({
            status: 'ignored_delayed_failure',
            eventId,
            orderNumber: orderData.orderNumber
          });
        }
      }

      // 5. ATOMIC FENCED STATE TRANSITION (Fix B)
      // Enforces lease generation, order state, reservation state, and inventory mutations in ONE transaction
      const eventDocRef = doc(db, 'razorpayEvents', eventId);

      const transitionResult = await runTransaction(db, async (transaction) => {
        // Authoritative Fencing Check inside transaction:
        const curEventSnap = await transaction.get(eventDocRef);
        if (!curEventSnap.exists()) {
          throw new Error('WORKER_FENCED_OFF: Event document does not exist.');
        }
        const curEventData = curEventSnap.data();
        if (
          curEventData.leaseGeneration !== workerLeaseGeneration ||
          curEventData.leaseToken !== workerLeaseToken ||
          curEventData.status !== 'PROCESSING'
        ) {
          throw new Error('WORKER_FENCED_OFF: Lease reclaimed by newer worker generation.');
        }

        const curOrderSnap = await transaction.get(orderDocRef);
        if (!curOrderSnap.exists()) {
          throw new Error('ORDER_NOT_FOUND');
        }
        const curOrderData = curOrderSnap.data() as any;

        if (eventType === 'order.paid' || eventType === 'payment.captured') {
          if (curOrderData.status === 'FAILED' || curOrderData.status === 'CANCELLED') {
            throw new Error('ORDER_TERMINAL_STATE');
          }
          if (curOrderData.paymentStatus === 'PAID' || curOrderData.status === 'CONFIRMED') {
            transaction.update(eventDocRef, {
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
              note: 'Order already confirmed by concurrent transition.'
            });
            return { outcome: 'already_paid' };
          }

          // Consume inventory reservation atomically inside this transaction
          const resId = curOrderData.reservationId || curOrderData.reservationToken;
          if (resId) {
            const resRef = doc(db, 'inventoryReservations', resId);
            const resSnap = await transaction.get(resRef);
            if (!resSnap.exists()) {
              throw new Error(`RESERVATION_MISSING: Reservation ${resId} not found.`);
            }
            const resData = resSnap.data() as any;
            if (resData.status === 'RELEASED') {
              throw new Error('CANNOT_CONSUME_RELEASED_RESERVATION');
            }
            if (resData.status === 'RESERVED') {
              const invUpdates: { ref: any; newReserved: number }[] = [];
              for (const item of resData.items || []) {
                const invRef = doc(db, 'inventory', item.productId);
                const invSnap = await transaction.get(invRef);
                if (!invSnap.exists()) {
                  throw new Error(`MISSING_INVENTORY_DOC: Product ${item.productId} inventory missing.`);
                }
                const invData = invSnap.data() as any;
                const currentReserved = invData.reservedQuantity ?? 0;
                if (currentReserved < item.quantity) {
                  throw new Error(`INCONSISTENT_RESERVED_QUANTITY for product ${item.productId}`);
                }
                invUpdates.push({
                  ref: invRef,
                  newReserved: currentReserved - item.quantity
                });
              }

              for (const u of invUpdates) {
                transaction.update(u.ref, {
                  reservedQuantity: u.newReserved,
                  updatedAt: new Date().toISOString()
                });
              }

              transaction.update(resRef, {
                status: 'CONSUMED',
                consumedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
          }

          // Mark order paid and confirmed
          transaction.update(orderDocRef, {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            razorpayPaymentId: rzpPaymentId || curOrderData.razorpayPaymentId || null,
            verifiedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // Mark webhook event completed with lease generation signature
          transaction.update(eventDocRef, {
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            completedByGeneration: workerLeaseGeneration
          });

          return { outcome: 'confirmed' };
        } else if (eventType === 'payment.failed') {
          if (curOrderData.paymentStatus === 'PAID' || curOrderData.status === 'CONFIRMED') {
            transaction.update(eventDocRef, {
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
              note: 'Ignored payment.failed for already confirmed order'
            });
            return { outcome: 'ignored_delayed_failure' };
          }

          // Release inventory reservation atomically inside this transaction
          const resId = curOrderData.reservationId || curOrderData.reservationToken;
          if (resId) {
            const resRef = doc(db, 'inventoryReservations', resId);
            const resSnap = await transaction.get(resRef);
            if (!resSnap.exists()) {
              throw new Error(`RESERVATION_MISSING: Reservation ${resId} not found.`);
            }
            const resData = resSnap.data() as any;
            if (resData.status === 'CONSUMED') {
              throw new Error('CANNOT_RELEASE_CONSUMED_RESERVATION');
            }
            if (resData.status === 'RESERVED') {
              const invUpdates: { ref: any; newAvail: number; newReserved: number }[] = [];
              for (const item of resData.items || []) {
                const invRef = doc(db, 'inventory', item.productId);
                const invSnap = await transaction.get(invRef);
                if (!invSnap.exists()) {
                  throw new Error(`MISSING_INVENTORY_DOC: Product ${item.productId} inventory missing.`);
                }
                const invData = invSnap.data() as any;
                const currentAvail = invData.availableQuantity ?? invData.quantity ?? 0;
                const currentReserved = invData.reservedQuantity ?? 0;
                if (currentReserved < item.quantity) {
                  throw new Error(`INCONSISTENT_RESERVED_QUANTITY for product ${item.productId}`);
                }
                invUpdates.push({
                  ref: invRef,
                  newAvail: currentAvail + item.quantity,
                  newReserved: currentReserved - item.quantity
                });
              }

              for (const u of invUpdates) {
                transaction.update(u.ref, {
                  availableQuantity: u.newAvail,
                  reservedQuantity: u.newReserved,
                  inStock: u.newAvail > 0,
                  status: u.newAvail > 0 ? 'in_stock' : 'out_of_stock',
                  updatedAt: new Date().toISOString()
                });
              }

              transaction.update(resRef, {
                status: 'RELEASED',
                releasedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
          }

          // Mark order failed & cancelled
          transaction.update(orderDocRef, {
            paymentStatus: 'FAILED',
            status: 'CANCELLED',
            updatedAt: new Date().toISOString()
          });

          // Mark webhook event completed with lease generation signature
          transaction.update(eventDocRef, {
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            completedByGeneration: workerLeaseGeneration
          });

          return { outcome: 'cancelled' };
        }
      });

      return res.status(200).json({
        status: 'success',
        eventId,
        outcome: transitionResult?.outcome,
        orderId: rzpOrderId,
        amount: incomingAmountPaise,
        currency: incomingCurrency
      });
    } catch (durableErr: any) {
      console.error('Durable webhook transition error:', durableErr);

      if (durableErr?.message?.includes('WORKER_FENCED_OFF')) {
        return res.status(409).json({
          error: 'Worker was fenced off. Event lease was reclaimed by a newer generation worker.'
        });
      }

      // FAIL CLOSED: Return 500 so provider retries when storage is available
      return res.status(500).json({
        error: 'Durable storage unavailable to complete webhook transition safely. Please retry.'
      });
    }
  } catch (err: any) {
    console.error('Webhook processing exception:', err);
    return res.status(500).json({ error: 'Webhook processing error.' });
  }
});

/**
 * 5. PHASE 3: Gemini AI "Find Your Flame" Personalized Engine
 */
app.post('/api/ai/find-flame', async (req: Request, res: Response) => {
  try {
    const { feeling, moment, scentPreference, intensity } = req.body;

    // Deterministic baseline match from canonical catalog
    let chosenId = 'jumbo-tealight-mogra';
    if (scentPreference === 'Woody' || scentPreference === 'Earthy' || feeling === 'Grounded' || moment === 'Morning reset') {
      chosenId = 'royal-urli';
    } else if (feeling === 'Uplifted' || moment === 'Meditation') {
      chosenId = 'lotus-bloom';
    } else if (feeling === 'Sensual' || moment === 'Bath' || moment === 'Date night') {
      chosenId = 'peony-bloom';
    } else if (moment === 'Gifting' || moment === 'Celebration') {
      chosenId = 'ganpati-bappa-hamper';
    } else if (feeling === 'Sleepy' || moment === 'Evening unwind') {
      chosenId = 'golden-mogra-jar';
    }

    const baselineProduct = SERVER_CATALOG[chosenId] || SERVER_CATALOG['jumbo-tealight-mogra'];

    // Try Gemini if API key available
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `You are the scent curator for "The Calm Flame", an artisanal candle brand rooted in India's botanical heritage.
Available canonical products:
1. "jumbo-tealight-mogra": Hand-poured 25g jumbo tealight with authentic mogra blossom. Floral, Calm.
2. "royal-urli": 5" Royal Botanical Urli with dried orange, whole cinnamon, star anise. Earthy/Spiced, Grounded.
3. "lotus-bloom": Delicate sculpted lotus bloom candle. Fresh floral, Uplifted.
4. "golden-mogra-jar": Handcrafted glass jar infused with pure mogra blossom. Floral, Sleepy/Restorative.
5. "peony-bloom": Handcrafted layered peony blossom candle. Velvety floral, Sensual.
6. "ganpati-bappa-hamper": Festive celebration gift set with handcrafted botanical candles. Gifting.

Customer answers:
- Current feeling: ${feeling || 'Seeking calm'}
- Creating moment: ${moment || 'Evening unwind'}
- Scent preference: ${scentPreference || 'Floral'}
- Intensity: ${intensity || 'Balanced'}

Task: Pick the single best matching product ID from the available canonical IDs above.
Respond in valid JSON format:
{
  "productId": "jumbo-tealight-mogra" | "royal-urli" | "lotus-bloom" | "golden-mogra-jar" | "peony-bloom" | "ganpati-bappa-hamper",
  "reason": "1-2 sentences warm, human, grounded reason without medical claims",
  "ritual": {
    "bestTime": "recommended time of day",
    "setTheMood": "1 sentence setting suggestion",
    "steps": ["Step 1", "Step 2", "Step 3", "Step 4"],
    "mantra": "A short 1-sentence calming mantra"
  }
}`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const raw = aiResponse.text?.trim() || '';
        const parsed = JSON.parse(raw);
        if (SERVER_CATALOG[parsed.productId] && SERVER_CATALOG[parsed.productId].isActive) {
          return res.json({
            productId: parsed.productId,
            productName: SERVER_CATALOG[parsed.productId].name,
            reason: parsed.reason,
            ritual: parsed.ritual,
            poweredBy: 'gemini',
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini find-flame fallback:', geminiErr);
      }
    }

    // Fallback response
    return res.json({
      productId: chosenId,
      productName: baselineProduct.name,
      reason: `You seem to be seeking a softer rhythm (${feeling?.toLowerCase() || 'calm'} for a ${moment?.toLowerCase() || 'quiet evening'}). ${baselineProduct.name} brings grounding botanical notes that gently release the day.`,
      ritual: {
        bestTime: 'Evening unwind & twilight transition',
        setTheMood: 'Dim the overhead lights, draw curtains, and enjoy quiet presence.',
        steps: [
          'Place your candle on a heat-safe flat surface.',
          'Light your candle with a deliberate match strike.',
          'Put your phone away and take three slow belly breaths.',
          'Allow ten quiet minutes for the botanical essence to settle your thoughts.',
        ],
        mantra: 'The day is done. I allow stillness to arrive.',
      },
      poweredBy: 'deterministic',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not generate flame match.' });
  }
});

/**
 * 6. PHASE 3: AI Ritual Generator
 */
app.post('/api/ai/ritual', async (req: Request, res: Response) => {
  try {
    const { productId, duration, context } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Missing productId parameter.' });
    }

    const candle = SERVER_CATALOG[productId];
    if (!candle || candle.isActive === false || candle.isHistorical) {
      return res.status(404).json({
        error: `Product "${productId}" is not available in the active catalogue.`
      });
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const scentDesc = candle.fragrance || candle.scentFamily || 'botanical';
        const prompt = `Create a mindful, realistic ${duration || '10-minute'} candle ritual for "${candle.name}" (${candle.scentFamily || 'Botanical'} notes: ${scentDesc}).
Context: ${context || 'evening relaxation'}.
Guidelines:
- Mention "${candle.name}" naturally.
- Keep it concise, calming, premium, and human.
- Strictly NO medical or therapeutic claims.
- Return valid JSON:
{
  "title": "${duration || '10-Minute'} ${candle.name} ${context || 'Pause'}",
  "duration": "${duration || '10 minutes'}",
  "context": "${context || 'Evening unwind'}",
  "steps": [
    "Step 1: lighting / setup",
    "Step 2: breath / sensory grounding",
    "Step 3: mindful activity",
    "Step 4: soft closure"
  ],
  "mantra": "Short peaceful mantra"
}`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const raw = aiResponse.text?.trim() || '';
        const parsed = JSON.parse(raw);
        return res.json(parsed);
      } catch (geminiErr) {
        console.warn('Gemini ritual generator fallback:', geminiErr);
      }
    }

    // Baseline fallback
    return res.json({
      title: `${duration || '10-Minute'} ${candle.name} ${context || 'Evening Unwind'}`,
      duration: duration || '10 minutes',
      context: context || 'Evening unwind',
      steps: [
        `Dim bright overhead lighting and place your ${candle.name} safely on a heat-resistant surface.`,
        'Light the wick mindfully and watch the steady flame for a moment of quiet stillness.',
        `Take four slow breaths in through your nose, taking in the gentle aroma.`,
        `Spend ${duration || 'ten minutes'} in screen-free calm, allowing your thoughts to settle.`,
      ],
      mantra: 'This quiet moment belongs entirely to me.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create ritual.' });
  }
});

/**
 * 7. PHASE 3: AI Shopping Assistant ("Ask The Calm Flame")
 */
app.post('/api/ai/assistant', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message prompt.' });
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const catalogSummary = Object.entries(SERVER_CATALOG)
          .map(([id, p]: [string, any]) => `${id}: "${p.name}" (priceStatus: ${p.priceStatus}, scentFamily: ${p.scentFamily || 'Not specified'}, burnTime: ${p.burnTime || 'Not specified'}, fragrance: ${p.fragrance || 'Not specified'})`)
          .join('\n');

        const systemPrompt = `You are the thoughtful concierge for "The Calm Flame", an artisanal candle brand rooted in India's botanical heritage.
You provide warm, calm, helpful guidance about our products, scent notes, rituals, gifting, and candle care.

Catalog Products:
${catalogSummary}

Brand Standards:
- Free shipping on orders above ₹1,500 across India.
- Handcrafted artisanal candles and botanical creations.
- Never invent product facts, fake prices, unverified burn times, or unreleased candles.
- If a product price or specification is not specified in the catalogue, state that it is not specified or available upon enquiry.
- Safety & Health: Never provide medical advice, diagnosis, or health claims.
- Keep tone serene, unhurried, concise, and elegant.`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `${systemPrompt}\n\nCustomer question: ${message}`,
        });

        const mentionedIds = CANONICAL_PRODUCTS
          .filter((p) => p.isActive && (aiResponse.text || '').toLowerCase().includes(p.name.toLowerCase()))
          .map((p) => p.id)
          .slice(0, 3);

        return res.json({
          reply: aiResponse.text?.trim() || 'I am here to help you discover the right candle and ritual for your space.',
          suggestedProducts: mentionedIds.length > 0 ? mentionedIds : ['jumbo-tealight-mogra', 'floral-lotus-urli'],
        });
      } catch (geminiErr) {
        console.warn('Assistant fallback:', geminiErr);
      }
    }

    // Smart deterministic Q&A fallback
    const lower = message.toLowerCase();
    let reply = 'Welcome to The Calm Flame. We handcraft botanical candles and festive designs rooted in quiet elegance.';
    let suggested: string[] = ['jumbo-tealight-mogra'];

    if (lower.includes('floral') || lower.includes('mogra') || lower.includes('warm') || lower.includes('comfort')) {
      reply = 'If you love authentic florals, our Jumbo Tealight - Mogra and Golden Mogra Jar bring pure, delicate floral stillness.';
      suggested = ['jumbo-tealight-mogra', 'golden-mogra-jar'];
    } else if (lower.includes('urli') || lower.includes('ritual') || lower.includes('brass') || lower.includes('temple')) {
      reply = 'Our Floral Lotus Urli and Royal Urli centerpiece vessels bring timeless Indian botanical heritage to sacred rituals.';
      suggested = ['floral-lotus-urli', 'royal-urli'];
    } else if (lower.includes('care') || lower.includes('wick') || lower.includes('burn')) {
      reply = 'On your first burn, keep the flame lit for 2–3 hours until the wax pool touches the container edges. Trim the cotton wick to 1/4 inch before relighting.';
    } else if (lower.includes('gift') || lower.includes('hamper') || lower.includes('festive')) {
      reply = 'Our Ganpati Bappa Hamper and festive confections make exquisite handcrafted gifts presented in ceremonial boxes.';
      suggested = ['ganpati-bappa-hamper'];
    }

    return res.json({ reply, suggestedProducts: suggested });
  } catch (err: any) {
    return res.status(500).json({ error: 'Assistant service temporarily unavailable.' });
  }
});

/**
 * 8. PHASE 3: Smart Gift Finder
 */
app.post('/api/ai/gift', async (req: Request, res: Response) => {
  try {
    const { recipient, occasion, feeling } = req.body;

    let chosenId = 'ganpati-bappa-hamper';
    if (feeling === 'Sensual' || recipient === 'Partner') {
      chosenId = 'peony-bloom';
    } else if (feeling === 'Calm' || occasion === 'Thank you') {
      chosenId = 'jumbo-tealight-mogra';
    } else if (feeling === 'Grounded' || occasion === 'Housewarming') {
      chosenId = 'royal-urli';
    }

    const prod = SERVER_CATALOG[chosenId];
    if (!prod || prod.isActive === false || prod.isHistorical) {
      return res.status(404).json({ error: 'Gift product recommendation is currently unavailable in the active catalogue.' });
    }

    return res.json({
      productId: prod.id,
      productName: prod.name,
      giftMessage: `A thoughtful gift for your ${recipient || 'special person'} on their ${occasion || 'celebration'}—inviting gentle ${feeling?.toLowerCase() || 'calm'} into their space.`,
      price: prod.priceStatus !== 'missing' && prod.price > 0 ? prod.price : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Gift finder error.' });
  }
});

/**
 * 9. PHASE 3: Product Comparison ("Which one is right for me?")
 */
app.post('/api/ai/compare', (req: Request, res: Response) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one product ID to compare.' });
    }

    const compared: any[] = [];
    for (const id of productIds) {
      const p = SERVER_CATALOG[id];
      if (!p || p.isActive === false || p.isHistorical) {
        return res.status(404).json({
          error: `Product "${id}" is either unavailable or not found in the active catalogue.`
        });
      }
      compared.push({
        id: p.id,
        name: p.name,
        price: p.priceStatus !== 'missing' && p.price > 0 ? p.price : undefined,
        priceStatus: p.priceStatus,
        scentFamily: p.scentFamily || 'Not specified',
        burnTime: p.burnTime || 'Not specified',
        weight: p.weight || 'Not specified',
        howItFeels: p.howItFeels || [],
        fragrance: p.fragrance || p.scentFamily || 'Not specified',
        idealMoment: 'Moments of mindfulness and quiet celebration',
      });
    }

    return res.json({
      products: compared,
      guidance: 'Compare fragrances, dimensions, and botanical elements to choose the flame best suited to your space.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Comparison error.' });
  }
});

// Configure Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app.listen(PORT, () => {
    console.log(`The Calm Flame server listening on port ${PORT}`);
  });
}

// Only launch listening server if not running in a test suite runner
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer();
}

export { app, startServer };
