/**
 * Order state transitions that must be atomic and re-validated inside a Firestore transaction.
 */
import crypto from 'crypto';
import { getAdminDb, doc, runTransaction } from './firestoreAdmin';

export type VerifyTransitionOutcome =
  | { kind: 'confirmed'; order: any }
  | { kind: 'already_paid'; order: any }
  | { kind: 'rejected'; httpStatus: number; status: 'FAILED' | 'RECONCILIATION_REQUIRED'; error: string };

export function idempotencyDocIdForKey(key: string): string {
  return 'order_' + crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Called by /api/payments/verify AFTER the signature and the Razorpay API have confirmed a captured
 * payment of the right amount. In one transaction it:
 *  - re-reads the order: never touches CANCELLED / FAILED / RECONCILIATION_REQUIRED orders and
 *    returns `already_paid` (no write) if the webhook already confirmed it;
 *  - checks the order-creation claim (orderIdempotency) is COMPLETED for this order and Razorpay
 *    order, so a payment can't confirm an attempt that a newer worker took over;
 *  - consumes the reservation and marks the order PAID/CONFIRMED.
 * If the stock is no longer held (reservation released/missing/inconsistent) the order is marked
 * RECONCILIATION_REQUIRED (paid, stock not deducted) in the same fenced transaction.
 */
export async function confirmOrderPaymentFromVerify(args: {
  orderNumber: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}): Promise<VerifyTransitionOutcome> {
  const db = getAdminDb();
  const orderRef = doc(db, 'orders', args.orderNumber);

  return runTransaction(db, async (tx): Promise<VerifyTransitionOutcome> => {
    // ---- reads ----
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) {
      return { kind: 'rejected', httpStatus: 404, status: 'FAILED', error: `Order ${args.orderNumber} not found.` };
    }
    const order = orderSnap.data();

    if (order.paymentStatus === 'PAID' || order.status === 'CONFIRMED') {
      return { kind: 'already_paid', order };
    }
    if (order.status === 'FAILED' || order.status === 'CANCELLED') {
      return {
        kind: 'rejected',
        httpStatus: 409,
        status: 'FAILED',
        error: `Order is ${order.status} and cannot be marked paid. Reconciliation required.`
      };
    }
    if (order.status !== 'PAYMENT_PENDING') {
      return {
        kind: 'rejected',
        httpStatus: 409,
        status: 'RECONCILIATION_REQUIRED',
        error: `Order is in state ${order.status}, not awaiting payment. Reconciliation required.`
      };
    }
    if (order.razorpayOrderId !== args.razorpayOrderId) {
      return { kind: 'rejected', httpStatus: 400, status: 'FAILED', error: 'Razorpay order ID does not match stored order record.' };
    }

    if (order.idempotencyKey) {
      const claimSnap = await tx.get(doc(db, 'orderIdempotency', idempotencyDocIdForKey(order.idempotencyKey)));
      const claim = claimSnap.exists() ? claimSnap.data() : null;
      if (
        !claim ||
        claim.status !== 'COMPLETED' ||
        claim.orderNumber !== args.orderNumber ||
        claim.razorpayOrderId !== args.razorpayOrderId
      ) {
        return {
          kind: 'rejected',
          httpStatus: 409,
          status: 'RECONCILIATION_REQUIRED',
          error: 'Order-creation claim is not complete for this order. Reconciliation required.'
        };
      }
    }

    const now = new Date().toISOString();
    const resId = order.reservationId || order.reservationToken;
    let stockProblem: string | null = null;
    let resRef: any = null;
    const invUpdates: { ref: any; newReserved: number }[] = [];
    let consume = false;

    if (resId) {
      resRef = doc(db, 'inventoryReservations', resId);
      const resSnap = await tx.get(resRef);
      const res = resSnap.exists() ? resSnap.data() : null;
      if (!res) {
        stockProblem = 'RESERVATION_MISSING';
      } else if (res.status === 'RESERVED') {
        for (const item of res.items || []) {
          const invRef = doc(db, 'inventory', item.productId);
          const invSnap = await tx.get(invRef);
          const reserved = invSnap.exists() ? invSnap.data().reservedQuantity ?? 0 : -1;
          if (!invSnap.exists() || reserved < item.quantity) {
            stockProblem = 'INCONSISTENT_RESERVED_QUANTITY';
            break;
          }
          invUpdates.push({ ref: invRef, newReserved: reserved - item.quantity });
        }
        consume = stockProblem === null;
      } else if (res.status !== 'CONSUMED') {
        stockProblem = `RESERVATION_${res.status}`; // e.g. RELEASED by expiry
      }
    }

    // ---- writes ----
    if (stockProblem) {
      tx.update(orderRef, {
        status: 'RECONCILIATION_REQUIRED',
        paymentStatus: 'PAID',
        reconciliationReason: `PAID_BUT_${stockProblem}`,
        razorpayPaymentId: args.razorpayPaymentId,
        updatedAt: now
      });
      return {
        kind: 'rejected',
        httpStatus: 500,
        status: 'RECONCILIATION_REQUIRED',
        error: 'Payment received but the reserved stock is no longer held. Order held for reconciliation.'
      };
    }

    if (consume) {
      for (const u of invUpdates) tx.update(u.ref, { reservedQuantity: u.newReserved, updatedAt: now });
      tx.update(resRef, { status: 'CONSUMED', consumedAt: now, updatedAt: now });
    }
    tx.update(orderRef, {
      paymentStatus: 'PAID',
      status: 'CONFIRMED',
      razorpayPaymentId: args.razorpayPaymentId,
      verifiedAt: now,
      confirmedBy: 'verify',
      updatedAt: now
    });
    return { kind: 'confirmed', order };
  });
}
