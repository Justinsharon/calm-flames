import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, CustomerDetails, OrderRecord, CartItem, InventoryReservationRecord, ReservationStatus } from '../types';
import { CANONICAL_PRODUCTS, CanonicalProduct, ACTIVE_CANONICAL_CATALOG_MAP } from '../data/canonicalCatalog';

function canonicalToProduct(cp: CanonicalProduct): Product {
  return {
    id: cp.id,
    slug: cp.slug,
    name: cp.name,
    tagline: cp.tagline,
    price: cp.price,
    originalPrice: cp.originalPrice,
    priceStatus: cp.priceStatus,
    primaryCategory: cp.primaryCategory,
    subcategory: cp.subcategory,
    collections: cp.collections,
    tags: cp.tags,
    weight: cp.weight,
    dimensions: cp.dimensions,
    fragrance: cp.fragrance,
    burnTime: cp.burnTime,
    scentFamily: cp.scentFamily,
    shortDescription: cp.shortDescription,
    longDescription: cp.longDescription,
    howItFeels: cp.howItFeels,
    image: cp.imagePath,
    galleryImages: [cp.imagePath],
    customisation: cp.customisation,
    inStock: cp.inStock ?? false,
    inventoryStatus: cp.inventoryStatus ?? 'unknown',
    availableStock: cp.availableStock,
    featured: cp.featured ?? false,
    categories: cp.categories || ['aromatherapy-candles'],
    moods: cp.moods || ['calm'],
    matchReasons: {}
  };
}

export const FALLBACK_PRODUCTS: Product[] = CANONICAL_PRODUCTS.map(canonicalToProduct);

export interface FirestoreProductDoc extends Omit<Product, 'matchReasons'> {
  matchReasons?: Record<string, string>;
  compareAtPrice?: number;
  sku: string;
  stock?: number;
  isActive: boolean;
  isFeatured: boolean;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRecord {
  productId: string;
  sku: string;
  inStock?: boolean;
  status?: 'in_stock' | 'out_of_stock' | 'unknown';
  quantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  lowStockThreshold?: number;
  updatedAt: string;
}

export interface CouponRecord {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minimumOrderValue: number;
  maximumDiscount?: number;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
}

/**
 * Seed initial Calm Flame products and inventory into Firestore if collection is empty
 * Safely seeds all 33 real catalogue products and keeps legacy products deactivated.
 */
export async function seedInitialCatalogIfNeeded(): Promise<void> {
  const productsRef = collection(db, 'products');
  try {
    // Check if real catalogue is already seeded with latest photography
    const sampleDocRef = doc(db, 'products', 'jumbo-tealight-mogra');
    const sampleSnap = await getDoc(sampleDocRef);
    if (sampleSnap.exists() && sampleSnap.data()?.image === FALLBACK_PRODUCTS[0]?.image) {
      return; // Real catalogue and photography already synchronized
    }

    const batch = writeBatch(db);

    // Deactivate placeholder products if they exist
    const placeholders = ['jasmine-sage', 'sandalwood-rose', 'nag-champa', 'ritual-collection'];
    for (const phId of placeholders) {
      const phRef = doc(db, 'products', phId);
      batch.set(phRef, { isActive: false, isHistorical: true }, { merge: true });
    }

    // Seed or update all 33 real products with latest photography
    for (const prod of FALLBACK_PRODUCTS) {
      const prodDocRef = doc(db, 'products', prod.id);
      const inventoryDocRef = doc(db, 'inventory', prod.id);

      const productPayload: Partial<FirestoreProductDoc> = {
        ...prod,
        sku: `TCF-${prod.id.toUpperCase().replace(/-/g, '')}`,
        image: prod.image,
        galleryImages: prod.galleryImages || [prod.image],
        needsImageAsset: false,
        isActive: true,
        isFeatured: prod.featured ?? false,
        isNew: true,
        updatedAt: new Date().toISOString()
      };

      const inventoryPayload: InventoryRecord = {
        productId: prod.id,
        sku: `TCF-${prod.id.toUpperCase().replace(/-/g, '')}`,
        inStock: false,
        status: 'unknown',
        updatedAt: new Date().toISOString()
      };

      batch.set(prodDocRef, productPayload, { merge: true });
      batch.set(inventoryDocRef, inventoryPayload, { merge: true });
    }

    // Seed default welcome coupons
    const couponRef = doc(db, 'coupons', 'CALM10');
    batch.set(couponRef, {
      code: 'CALM10',
      type: 'percentage',
      value: 10,
      minimumOrderValue: 500,
      maximumDiscount: 500,
      usageLimit: 500,
      usedCount: 0,
      isActive: true
    }, { merge: true });

    const coupon2Ref = doc(db, 'coupons', 'FIRSTFLAME');
    batch.set(coupon2Ref, {
      code: 'FIRSTFLAME',
      type: 'fixed',
      value: 150,
      minimumOrderValue: 999,
      usageLimit: 200,
      usedCount: 0,
      isActive: true
    }, { merge: true });

    await batch.commit();
    console.log('Seeded The Calm Flame 33 real catalogue products & inventory successfully.');
  } catch (error) {
    console.warn('Could not auto-seed Firestore products (will use static fallback):', error);
  }
}

/**
 * Fetch all active products from Firestore with fallback to local catalog
 */
export async function fetchLiveProducts(): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('isActive', '==', true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return FALLBACK_PRODUCTS;
    }

    const liveProducts: Product[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestoreProductDoc;
      const staticProduct = FALLBACK_PRODUCTS.find((p) => p.id === docSnap.id);
      const chosenImage = staticProduct ? staticProduct.image : data.image;
      const chosenGallery =
        staticProduct && staticProduct.galleryImages && staticProduct.galleryImages.length > 0
          ? staticProduct.galleryImages
          : data.galleryImages || [chosenImage];

      liveProducts.push({
        id: docSnap.id,
        slug: data.slug || docSnap.id,
        name: data.name,
        tagline: data.tagline ?? staticProduct?.tagline,
        price: Number(data.price),
        originalPrice: data.compareAtPrice ?? staticProduct?.originalPrice,
        priceStatus: (data as any).priceStatus ?? staticProduct?.priceStatus ?? (Number(data.price) > 0 ? 'active' : 'missing'),
        weight: data.weight ?? staticProduct?.weight,
        dimensions: (data as any).dimensions ?? staticProduct?.dimensions,
        fragrance: (data as any).fragrance ?? staticProduct?.fragrance,
        burnTime: data.burnTime ?? staticProduct?.burnTime,
        scentFamily: data.scentFamily ?? staticProduct?.scentFamily,
        shortDescription: data.shortDescription ?? staticProduct?.shortDescription,
        longDescription: data.longDescription ?? staticProduct?.longDescription,
        howItFeels: data.howItFeels ?? staticProduct?.howItFeels,
        scentNotes: data.scentNotes ?? staticProduct?.scentNotes,
        ritual: data.ritual ?? staticProduct?.ritual,
        image: chosenImage,
        galleryImages: chosenGallery,
        waxType: data.waxType ?? staticProduct?.waxType,
        wickType: data.wickType ?? staticProduct?.wickType,
        vessel: data.vessel ?? staticProduct?.vessel,
        inStock: data.inStock ?? staticProduct?.inStock ?? false,
        inventoryStatus: (data as any).status ?? (data as any).inventoryStatus ?? staticProduct?.inventoryStatus ?? 'unknown',
        availableStock: data.stock ?? staticProduct?.availableStock,
        featured: data.isFeatured ?? staticProduct?.featured,
        categories: data.categories || staticProduct?.categories || ['aromatherapy-candles'],
        moods: data.moods || staticProduct?.moods || ['calm'],
        matchReasons: data.matchReasons || staticProduct?.matchReasons || {}
      });
    });

    return liveProducts.length > 0 ? liveProducts : FALLBACK_PRODUCTS;
  } catch (err) {
    console.warn('Falling back to local product catalog:', err);
    return FALLBACK_PRODUCTS;
  }
}

/**
 * Fetch a single active product by ID (Excludes historical products)
 */
export async function fetchLiveProductById(productId: string): Promise<Product | null> {
  try {
    const docRef = doc(db, 'products', productId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return FALLBACK_PRODUCTS.find((p) => p.id === productId) || null;
    }
    const data = docSnap.data();
    if (data?.isActive === false || data?.isHistorical) {
      return null;
    }
    return { id: docSnap.id, ...data } as Product;
  } catch (err) {
    return FALLBACK_PRODUCTS.find((p) => p.id === productId) || null;
  }
}

/**
 * Update an existing product (Admin only)
 */
export async function updateProductInDb(productId: string, updates: Partial<FirestoreProductDoc>): Promise<void> {
  const path = `products/${productId}`;
  try {
    const docRef = doc(db, 'products', productId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Fetch inventory levels
 */
export async function fetchInventory(): Promise<InventoryRecord[]> {
  try {
    const invRef = collection(db, 'inventory');
    const snapshot = await getDocs(invRef);
    const records: InventoryRecord[] = [];
    snapshot.forEach((d) => {
      records.push({ productId: d.id, ...d.data() } as InventoryRecord);
    });
    return records;
  } catch (error) {
    return [];
  }
}

/**
 * Update inventory quantity (Admin only)
 */
export async function updateInventoryStock(productId: string, newQuantity: number): Promise<void> {
  const path = `inventory/${productId}`;
  try {
    const docRef = doc(db, 'inventory', productId);
    await updateDoc(docRef, {
      quantity: newQuantity,
      availableQuantity: newQuantity,
      updatedAt: new Date().toISOString()
    });
    // Also update product stock count for sync
    const prodRef = doc(db, 'products', productId);
    await updateDoc(prodRef, {
      stock: newQuantity,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Atomically checks inventory and reserves stock for an order using a Firestore transaction.
 * Aggregates duplicate product IDs BEFORE any inventory reads or updates.
 * Creates a durable reservation record in `inventoryReservations/{reservationId}`.
 * Prevents concurrent overselling. Fails safely if stock is unknown, unavailable, or insufficient.
 */
export interface InventoryFenceOptions {
  idempDocId: string;
  claimGeneration: number;
  claimToken: string;
}

export async function reserveInventoryTransaction(
  items: { productId: string; quantity: number }[],
  reservationId?: string,
  orderNumber?: string,
  fenceOptions?: InventoryFenceOptions
): Promise<{
  success: boolean;
  reservationId?: string;
  error?: string;
  reservedItems?: { productId: string; quantity: number }[];
}> {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'No items provided for reservation.' };
  }

  // 1. Validate and aggregate duplicate product IDs before any inventory reads/updates
  const aggregatedMap = new Map<string, number>();

  for (const item of items) {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim()) {
      return {
        success: false,
        error: 'Invalid item format in reservation request.'
      };
    }

    const prodId = item.productId.trim();

    // Validate product ID exists in the active canonical catalogue
    const activeProduct = ACTIVE_CANONICAL_CATALOG_MAP[prodId];
    if (!activeProduct || activeProduct.isActive === false || activeProduct.isHistorical) {
      return {
        success: false,
        error: `Product "${prodId}" is not available in the active canonical catalogue.`
      };
    }

    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return {
        success: false,
        error: `Invalid quantity for product "${prodId}". Must be a positive integer.`
      };
    }

    const currentTotal = aggregatedMap.get(prodId) || 0;
    aggregatedMap.set(prodId, currentTotal + item.quantity);
  }

  // 2. Validate aggregate quantity limits (e.g. maximum 100 per product)
  for (const [prodId, aggregateQty] of aggregatedMap.entries()) {
    if (aggregateQty > 100) {
      return {
        success: false,
        error: `Aggregate quantity for product "${prodId}" (${aggregateQty}) exceeds permitted limit of 100.`
      };
    }
  }

  const resId = reservationId || `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const orderNum = orderNumber || 'PENDING';

  try {
    const { runTransaction } = await import('firebase/firestore');
    return await runTransaction(db, async (transaction) => {
      // 0a. Check idempotency claim fence inside the transaction if fenceOptions provided
      if (fenceOptions) {
        const idempRef = doc(db, 'orderIdempotency', fenceOptions.idempDocId);
        const idempSnap = await transaction.get(idempRef);
        if (!idempSnap.exists()) {
          return {
            success: false,
            error: 'WORKER_FENCED_OFF: Idempotency claim document does not exist.'
          };
        }
        const idempData = idempSnap.data() as any;
        if (
          idempData.claimGeneration !== fenceOptions.claimGeneration ||
          idempData.claimToken !== fenceOptions.claimToken ||
          idempData.status !== 'CREATING'
        ) {
          return {
            success: false,
            error: 'WORKER_FENCED_OFF: Idempotency claim was reclaimed or updated by another worker.'
          };
        }
      }

      // 0b. Check if reservation record already exists (idempotency check)
      const resRef = doc(db, 'inventoryReservations', resId);
      const resSnap = await transaction.get(resRef);
      if (resSnap.exists()) {
        const existingData = resSnap.data() as InventoryReservationRecord;
        if (existingData.status === 'RESERVED') {
          return { success: true, reservationId: resId, reservedItems: existingData.items };
        }
        return { success: false, error: `Reservation ${resId} is already in state ${existingData.status}.` };
      }

      // 1. Read all authoritative inventory documents for unique products
      const invDocs: { ref: any; data: InventoryRecord; aggQty: number; prodId: string }[] = [];

      for (const [prodId, aggQty] of aggregatedMap.entries()) {
        const invRef = doc(db, 'inventory', prodId);
        const invSnap = await transaction.get(invRef);

        if (!invSnap.exists()) {
          return {
            success: false,
            error: `Inventory record for product "${prodId}" is not available in the database.`
          };
        }

        const invData = invSnap.data() as InventoryRecord;

        // Authoritative inventory must be confirmed in_stock with known quantity
        if (invData.status !== 'in_stock' || invData.inStock !== true) {
          return {
            success: false,
            error: `Product "${prodId}" does not have confirmed available inventory.`
          };
        }

        const available = invData.availableQuantity ?? invData.quantity ?? 0;
        if (available < aggQty) {
          return {
            success: false,
            error: `Insufficient stock for product "${prodId}". Available: ${available}, requested: ${aggQty}.`
          };
        }

        invDocs.push({
          ref: invRef,
          data: invData,
          aggQty,
          prodId
        });
      }

      // 2. Decrement available quantity and increment reserved quantity atomically
      const reserved: { productId: string; quantity: number }[] = [];
      for (const item of invDocs) {
        const currentAvail = item.data.availableQuantity ?? item.data.quantity ?? 0;
        const newAvail = currentAvail - item.aggQty;
        const newReserved = (item.data.reservedQuantity ?? 0) + item.aggQty;

        transaction.update(item.ref, {
          availableQuantity: newAvail,
          reservedQuantity: newReserved,
          inStock: newAvail > 0,
          status: newAvail > 0 ? 'in_stock' : 'out_of_stock',
          updatedAt: new Date().toISOString()
        });

        reserved.push({ productId: item.prodId, quantity: item.aggQty });
      }

      // 3. Durably store the reservation record in Firestore
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const reservationDoc: InventoryReservationRecord = {
        reservationId: resId,
        orderNumber: orderNum,
        items: reserved,
        status: 'RESERVED',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt
      };

      transaction.set(resRef, reservationDoc);

      return { success: true, reservationId: resId, reservedItems: reserved };
    });
  } catch (err: any) {
    console.error('Inventory reservation transaction exception:', err);
    return {
      success: false,
      error: err?.message || 'Transaction failed while verifying inventory.'
    };
  }
}

/**
 * Releases previously reserved stock if an order or payment creation fails.
 * Enforces strict reservation invariants:
 * - Requires durable reservation record to exist and be in state RESERVED.
 * - Never restores stock if reservation document is missing.
 * - Requires all referenced inventory documents to exist; never skips missing documents.
 * - Verifies reservedQuantity is sufficient before decrementing.
 * - Atomic: updates inventory and marks reservation RELEASED in one transaction.
 * - Idempotent: repeated releases do not alter inventory twice.
 * - Rejects release of CONSUMED reservations.
 */
export async function releaseInventoryReservation(
  reservationIdOrItems: string | { productId: string; quantity: number }[],
  reservationIdOrItems2?: string | { productId: string; quantity: number }[]
): Promise<{ success: boolean; error?: string; alreadyReleased?: boolean }> {
  const resId =
    typeof reservationIdOrItems === 'string'
      ? reservationIdOrItems
      : typeof reservationIdOrItems2 === 'string'
      ? reservationIdOrItems2
      : undefined;

  if (!resId) {
    return {
      success: false,
      error: 'A valid reservation ID is required. Stock cannot be restored without an authoritative reservation record.'
    };
  }

  try {
    const { runTransaction } = await import('firebase/firestore');
    return await runTransaction(db, async (transaction) => {
      const resRef = doc(db, 'inventoryReservations', resId);
      const resSnap = await transaction.get(resRef);

      if (!resSnap.exists()) {
        return {
          success: false,
          error: `Reservation "${resId}" does not exist in authoritative storage. Stock cannot be released.`
        };
      }

      const resData = resSnap.data() as InventoryReservationRecord;

      if (resData.status === 'RELEASED') {
        // Idempotent return: already released, do not alter inventory again
        return { success: true, alreadyReleased: true };
      }

      if (resData.status === 'CONSUMED') {
        return {
          success: false,
          error: `Reservation "${resId}" is already CONSUMED and cannot be released.`
        };
      }

      if (resData.status !== 'RESERVED') {
        return {
          success: false,
          error: `Reservation "${resId}" is in invalid state "${resData.status}". Expected RESERVED.`
        };
      }

      const itemsToRelease = resData.items;
      if (!Array.isArray(itemsToRelease) || itemsToRelease.length === 0) {
        return {
          success: false,
          error: `Reservation "${resId}" has missing or empty items array.`
        };
      }

      // Read phase: Require all referenced inventory documents to exist and check reservedQuantity
      const invUpdates: { ref: any; newAvail: number; newReserved: number; prodId: string }[] = [];

      for (const item of itemsToRelease) {
        if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
          return {
            success: false,
            error: `Reservation "${resId}" contains invalid item specification for "${item.productId}".`
          };
        }

        const invRef = doc(db, 'inventory', item.productId);
        const invSnap = await transaction.get(invRef);

        if (!invSnap.exists()) {
          // Invariant: Never skip missing documents!
          return {
            success: false,
            error: `Authoritative inventory document for product "${item.productId}" does not exist. Aborting release.`
          };
        }

        const invData = invSnap.data() as InventoryRecord;
        const currentAvail = invData.availableQuantity ?? invData.quantity ?? 0;
        const currentReserved = invData.reservedQuantity ?? 0;

        if (currentReserved < item.quantity) {
          return {
            success: false,
            error: `Inconsistent inventory for product "${item.productId}": reservedQuantity (${currentReserved}) is less than release quantity (${item.quantity}). Aborting release.`
          };
        }

        const newAvail = currentAvail + item.quantity;
        const newReserved = currentReserved - item.quantity;

        invUpdates.push({
          ref: invRef,
          newAvail,
          newReserved,
          prodId: item.productId
        });
      }

      // Write phase: update all inventory documents atomically
      for (const update of invUpdates) {
        transaction.update(update.ref, {
          availableQuantity: update.newAvail,
          reservedQuantity: update.newReserved,
          inStock: update.newAvail > 0,
          status: update.newAvail > 0 ? 'in_stock' : 'out_of_stock',
          updatedAt: new Date().toISOString()
        });
      }

      // Mark reservation durably as RELEASED in the same transaction
      transaction.update(resRef, {
        status: 'RELEASED',
        releasedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    });
  } catch (err: any) {
    console.error('Inventory release transaction exception:', err);
    return {
      success: false,
      error: err?.message || 'Transaction failed while releasing reservation.'
    };
  }
}

/**
 * Permanently consumes a reserved inventory quantity upon successful payment.
 * Enforces strict reservation invariants:
 * - Requires durable reservation record to exist and be in state RESERVED.
 * - Requires all referenced inventory documents to exist; never skips missing documents.
 * - Verifies reservedQuantity is sufficient before decrementing.
 * - Atomic: updates inventory documents and marks reservation CONSUMED in one transaction.
 * - Idempotent: repeated consumption does not alter inventory twice.
 * - Rejects consumption of RELEASED reservations.
 */
export async function consumeInventoryReservation(
  reservationId: string
): Promise<{ success: boolean; error?: string; alreadyConsumed?: boolean }> {
  if (!reservationId || typeof reservationId !== 'string') {
    return { success: false, error: 'A valid reservation ID is required for consumption.' };
  }

  try {
    const { runTransaction } = await import('firebase/firestore');
    return await runTransaction(db, async (transaction) => {
      const resRef = doc(db, 'inventoryReservations', reservationId);
      const resSnap = await transaction.get(resRef);

      if (!resSnap.exists()) {
        return {
          success: false,
          error: `Reservation "${reservationId}" does not exist in authoritative storage.`
        };
      }

      const resData = resSnap.data() as InventoryReservationRecord;

      if (resData.status === 'CONSUMED') {
        // Idempotent return: already consumed, do not decrement again
        return { success: true, alreadyConsumed: true };
      }

      if (resData.status === 'RELEASED') {
        return {
          success: false,
          error: `Reservation "${reservationId}" is already RELEASED and cannot be consumed.`
        };
      }

      if (resData.status !== 'RESERVED') {
        return {
          success: false,
          error: `Reservation "${reservationId}" is in invalid state "${resData.status}". Expected RESERVED.`
        };
      }

      const itemsToConsume = resData.items;
      if (!Array.isArray(itemsToConsume) || itemsToConsume.length === 0) {
        return {
          success: false,
          error: `Reservation "${reservationId}" has missing or empty items array.`
        };
      }

      // Read phase: Require all referenced inventory documents to exist and have sufficient reservedQuantity
      const invUpdates: { ref: any; newReserved: number; prodId: string }[] = [];

      for (const item of itemsToConsume) {
        if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
          return {
            success: false,
            error: `Reservation "${reservationId}" contains invalid item specification for "${item.productId}".`
          };
        }

        const invRef = doc(db, 'inventory', item.productId);
        const invSnap = await transaction.get(invRef);

        if (!invSnap.exists()) {
          // Invariant: Never skip missing documents!
          return {
            success: false,
            error: `Authoritative inventory document for product "${item.productId}" does not exist. Aborting consumption.`
          };
        }

        const invData = invSnap.data() as InventoryRecord;
        const currentReserved = invData.reservedQuantity ?? 0;

        if (currentReserved < item.quantity) {
          return {
            success: false,
            error: `Inconsistent inventory for product "${item.productId}": reservedQuantity (${currentReserved}) is less than consume quantity (${item.quantity}). Aborting consumption.`
          };
        }

        const newReserved = currentReserved - item.quantity;
        invUpdates.push({
          ref: invRef,
          newReserved,
          prodId: item.productId
        });
      }

      // Write phase: update all inventory documents atomically
      for (const update of invUpdates) {
        transaction.update(update.ref, {
          reservedQuantity: update.newReserved,
          updatedAt: new Date().toISOString()
        });
      }

      // Mark reservation durably as CONSUMED in the same transaction
      transaction.update(resRef, {
        status: 'CONSUMED',
        consumedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    });
  } catch (err: any) {
    console.error('Inventory consume transaction exception:', err);
    return {
      success: false,
      error: err?.message || 'Transaction failed while consuming reservation.'
    };
  }
}

/**
 * Fetch a specific durable reservation by ID
 */
export async function fetchInventoryReservation(
  reservationId: string
): Promise<InventoryReservationRecord | null> {
  try {
    const resRef = doc(db, 'inventoryReservations', reservationId);
    const snap = await getDoc(resRef);
    if (!snap.exists()) return null;
    return snap.data() as InventoryReservationRecord;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch all orders (Admin or specific user)
 */
export async function fetchOrders(customerId?: string): Promise<OrderRecord[]> {
  try {
    const ordersRef = collection(db, 'orders');
    let q = query(ordersRef, orderBy('createdAt', 'desc'));
    if (customerId) {
      q = query(ordersRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
    }
    const snapshot = await getDocs(q);
    const orders: OrderRecord[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      orders.push({
        id: d.id,
        orderId: data.orderNumber || data.orderId || d.id,
        orderNumber: data.orderNumber || d.id,
        customerId: data.customerId,
        date: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : data.date || 'Recent',
        items: data.items || [],
        subtotal: data.subtotal || 0,
        discount: data.discount || 0,
        shipping: data.shipping || 0,
        total: data.total || 0,
        paymentMethod: data.paymentMethod || 'razorpay',
        paymentId: data.razorpayPaymentId || data.paymentId || '',
        customer: data.shippingAddress || data.customer || { fullName: 'Customer', email: '', phone: '', addressLine1: '', city: '', state: '', pincode: '' },
        status: data.status || 'CONFIRMED',
        paymentStatus: data.paymentStatus || 'PAID',
        fulfillmentStatus: data.fulfillmentStatus || 'Processing'
      });
    });
    return orders;
  } catch (error) {
    // If composite index is pending or rule applies, fallback gracefully
    console.warn('Orders query fallback:', error);
    try {
      const ordersRef = collection(db, 'orders');
      const snapshot = await getDocs(ordersRef);
      const orders: OrderRecord[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!customerId || data.customerId === customerId) {
          orders.push({
            id: d.id,
            orderId: data.orderNumber || data.orderId || d.id,
            orderNumber: data.orderNumber || d.id,
            customerId: data.customerId,
            date: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : data.date || 'Recent',
            items: data.items || [],
            subtotal: data.subtotal || 0,
            discount: data.discount || 0,
            shipping: data.shipping || 0,
            total: data.total || 0,
            paymentMethod: data.paymentMethod || 'razorpay',
            paymentId: data.razorpayPaymentId || data.paymentId || '',
            customer: data.shippingAddress || data.customer || { fullName: 'Customer', email: '', phone: '', addressLine1: '', city: '', state: '', pincode: '' },
            status: data.status || 'CONFIRMED',
            paymentStatus: data.paymentStatus || 'PAID',
            fulfillmentStatus: data.fulfillmentStatus || 'Processing'
          });
        }
      });
      return orders.sort((a, b) => (b.date > a.date ? 1 : -1));
    } catch (e2) {
      return [];
    }
  }
}

/**
 * Update order status (Admin only)
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderRecord['status'],
  fulfillmentStatus?: string
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    const docRef = doc(db, 'orders', orderId);
    await updateDoc(docRef, {
      status,
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Validate and apply a coupon code
 */
export async function validateCoupon(code: string, currentSubtotal: number): Promise<{ valid: boolean; discount: number; message: string }> {
  try {
    const codeClean = code.trim().toUpperCase();
    const docRef = doc(db, 'coupons', codeClean);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { valid: false, discount: 0, message: 'Invalid coupon code.' };
    }

    const coupon = docSnap.data() as CouponRecord;
    if (!coupon.isActive) {
      return { valid: false, discount: 0, message: 'This coupon has expired.' };
    }

    if (currentSubtotal < coupon.minimumOrderValue) {
      return {
        valid: false,
        discount: 0,
        message: `Minimum order value for ${coupon.code} is ₹${coupon.minimumOrderValue}.`
      };
    }

    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round((currentSubtotal * coupon.value) / 100);
      if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
        discount = coupon.maximumDiscount;
      }
    } else {
      discount = coupon.value;
    }

    return {
      valid: true,
      discount,
      message: `Coupon ${coupon.code} applied successfully!`
    };
  } catch (e) {
    return { valid: false, discount: 0, message: 'Could not validate coupon.' };
  }
}
