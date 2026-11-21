/**
 * Server-only inventory reservation logic (firebase-admin).
 * Moved from src/services/dbService.ts so the server no longer uses the unauthenticated client SDK.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb, doc, runTransaction, type TransactionLike } from './firestoreAdmin';
import type { InventoryReservationRecord } from '../types';
import { ACTIVE_CANONICAL_CATALOG_MAP } from '../data/canonicalCatalog';
import type { InventoryRecord } from '../services/dbService';

/**
 * Fetch inventory levels (server). Returns [] when storage is unreachable.
 */
export async function fetchInventory(): Promise<InventoryRecord[]> {
  try {
    const snapshot = await getAdminDb().collection('inventory').get();
    return snapshot.docs.map((d) => ({ productId: d.id, ...d.data() }) as InventoryRecord);
  } catch {
    return [];
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
    const db = getAdminDb();
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
    const db = getAdminDb();
    return await runTransaction(db, async (transaction) => {
      const plan = await planReservationRelease(transaction, db, resId);
      if (plan.kind === 'already_released') return { success: true, alreadyReleased: true };
      if (plan.kind !== 'release') return { success: false, error: plan.error };
      plan.apply();
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

export type ReleasePlan =
  | { kind: 'release'; apply: () => void }
  | { kind: 'already_released' }
  | { kind: 'missing'; error: string }
  | { kind: 'blocked'; error: string };

/**
 * Reads (but does not write) everything needed to release a reservation inside an existing
 * transaction. Firestore transactions require all reads before writes, so callers combine this
 * with their own fence checks and then call `plan.apply()` only if they still own the attempt.
 *
 * Invariants: never restores stock for a missing reservation or missing inventory doc, never
 * releases a CONSUMED reservation, never drives reservedQuantity negative.
 */
export async function planReservationRelease(
  transaction: TransactionLike,
  db: Firestore,
  resId: string
): Promise<ReleasePlan> {
  const resRef = doc(db, 'inventoryReservations', resId);
  const resSnap = await transaction.get(resRef);

  if (!resSnap.exists()) {
    return {
      kind: 'missing',
      error: `Reservation "${resId}" does not exist in authoritative storage. Stock cannot be released.`
    };
  }

  const resData = resSnap.data() as InventoryReservationRecord;
  if (resData.status === 'RELEASED') return { kind: 'already_released' };
  if (resData.status === 'CONSUMED') {
    return { kind: 'blocked', error: `Reservation "${resId}" is already CONSUMED and cannot be released.` };
  }
  if (resData.status !== 'RESERVED') {
    return {
      kind: 'blocked',
      error: `Reservation "${resId}" is in invalid state "${resData.status}". Expected RESERVED.`
    };
  }

  const itemsToRelease = resData.items;
  if (!Array.isArray(itemsToRelease) || itemsToRelease.length === 0) {
    return { kind: 'blocked', error: `Reservation "${resId}" has missing or empty items array.` };
  }

  const invUpdates: { ref: any; newAvail: number; newReserved: number }[] = [];
  for (const item of itemsToRelease) {
    if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
      return {
        kind: 'blocked',
        error: `Reservation "${resId}" contains invalid item specification for "${item.productId}".`
      };
    }
    const invRef = doc(db, 'inventory', item.productId);
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) {
      return {
        kind: 'blocked',
        error: `Authoritative inventory document for product "${item.productId}" does not exist. Aborting release.`
      };
    }
    const invData = invSnap.data() as InventoryRecord;
    const currentAvail = invData.availableQuantity ?? invData.quantity ?? 0;
    const currentReserved = invData.reservedQuantity ?? 0;
    if (currentReserved < item.quantity) {
      return {
        kind: 'blocked',
        error: `Inconsistent inventory for product "${item.productId}": reservedQuantity (${currentReserved}) is less than release quantity (${item.quantity}). Aborting release.`
      };
    }
    invUpdates.push({ ref: invRef, newAvail: currentAvail + item.quantity, newReserved: currentReserved - item.quantity });
  }

  return {
    kind: 'release',
    apply: () => {
      const now = new Date().toISOString();
      for (const u of invUpdates) {
        transaction.update(u.ref, {
          availableQuantity: u.newAvail,
          reservedQuantity: u.newReserved,
          inStock: u.newAvail > 0,
          status: u.newAvail > 0 ? 'in_stock' : 'out_of_stock',
          updatedAt: now
        });
      }
      transaction.update(resRef, { status: 'RELEASED', releasedAt: now, updatedAt: now });
    }
  };
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
    const db = getAdminDb();
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

