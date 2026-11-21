/**
 * Expires abandoned online-payment orders (status PAYMENT_PENDING for too long) and releases
 * their stock.
 *
 * For each stale order:
 *  1. Ask Razorpay for the order's payments. Any `captured` or `authorized` payment -> leave the
 *     order alone. Razorpay unreachable / not configured -> skip it; the next run retries.
 *  2. Otherwise, in ONE transaction that re-reads the order (still PAYMENT_PENDING, same Razorpay
 *     order, still stale): mark it EXPIRED and release its reservation.
 * A payment that lands after step 1 is never lost: webhook / verify move an EXPIRED order to
 * RECONCILIATION_REQUIRED with paymentStatus PAID (see server.ts and orderTransitions.ts).
 *
 * Cash-on-delivery and other non-Razorpay orders are never expired here.
 * Safe to run twice or concurrently: the transaction re-validates, so an order expires once.
 */
import { getAdminDb, doc, runTransaction } from './firestoreAdmin';
import { planReservationRelease } from './inventoryService';
import { runTestHook } from './testHooks';

export const MIN_ORDER_MAX_AGE_MINUTES = 15;
export const DEFAULT_ORDER_MAX_AGE_MINUTES = 30;
const RAZORPAY_TIMEOUT_MS = 10 * 1000;

export interface OrderExpiryReport {
  cutoff: string;
  scanned: number;
  expired: string[];
  skippedFresh: string[];
  skippedNotRazorpay: string[];
  skippedHasPayment: string[];
  skippedRazorpayUnavailable: string[];
  skippedChanged: string[];
  failed: { orderNumber: string; error: string }[];
}

export function resolveOrderMaxAgeMinutes(requested?: unknown): number {
  const fromEnv = Number(process.env.PAYMENT_PENDING_MAX_AGE_MINUTES);
  const base =
    typeof requested === 'number' && Number.isFinite(requested)
      ? requested
      : Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : DEFAULT_ORDER_MAX_AGE_MINUTES;
  return Math.max(MIN_ORDER_MAX_AGE_MINUTES, base);
}

function orderTime(o: any): number | null {
  const t = Date.parse(o?.createdAt || o?.updatedAt || '');
  return Number.isFinite(t) ? t : null;
}

/** 'paid' | 'unpaid' | 'unavailable' according to Razorpay. */
export async function razorpayPaymentState(razorpayOrderId: string): Promise<'paid' | 'unpaid' | 'unavailable'> {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return 'unavailable';
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS)
    });
    if (!res.ok) return 'unavailable';
    const body = await res.json();
    if (!body || !Array.isArray(body.items)) return 'unavailable';
    return body.items.some((p: any) => p?.status === 'captured' || p?.status === 'authorized') ? 'paid' : 'unpaid';
  } catch {
    return 'unavailable';
  }
}

export async function expireAbandonedOrders(
  opts: { maxAgeMinutes?: number; now?: number; limit?: number } = {}
): Promise<OrderExpiryReport> {
  const db = getAdminDb();
  const maxAgeMs = resolveOrderMaxAgeMinutes(opts.maxAgeMinutes) * 60 * 1000;
  const now = opts.now ?? Date.now();
  const cutoffMs = now - maxAgeMs;
  const report: OrderExpiryReport = {
    cutoff: new Date(cutoffMs).toISOString(),
    scanned: 0,
    expired: [],
    skippedFresh: [],
    skippedNotRazorpay: [],
    skippedHasPayment: [],
    skippedRazorpayUnavailable: [],
    skippedChanged: [],
    failed: []
  };

  // Single-field equality query: no composite index needed.
  const snap = await db.collection('orders').where('status', '==', 'PAYMENT_PENDING').limit(opts.limit ?? 200).get();
  report.scanned = snap.size;

  for (const d of snap.docs) {
    const orderNumber = d.id;
    const o = d.data();
    const t = orderTime(o);
    if (t === null || t > cutoffMs) {
      report.skippedFresh.push(orderNumber);
      continue;
    }
    if (o.paymentMethod !== 'razorpay' || !o.razorpayOrderId) {
      report.skippedNotRazorpay.push(orderNumber);
      continue;
    }

    const state = await razorpayPaymentState(o.razorpayOrderId);
    if (state === 'paid') {
      report.skippedHasPayment.push(orderNumber);
      continue;
    }
    if (state === 'unavailable') {
      report.skippedRazorpayUnavailable.push(orderNumber);
      continue;
    }

    await runTestHook('orderExpiry.beforeTransaction', { orderNumber });

    try {
      const result = await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', orderNumber);
        const cur = await tx.get(orderRef);
        const c = cur.exists() ? cur.data() : null;
        const ct = orderTime(c);
        if (
          !c ||
          c.status !== 'PAYMENT_PENDING' ||
          c.paymentStatus === 'PAID' ||
          c.razorpayOrderId !== o.razorpayOrderId ||
          ct === null ||
          ct > cutoffMs
        ) {
          return 'changed' as const;
        }
        const resId = c.reservationId || c.reservationToken;
        const plan = resId ? await planReservationRelease(tx, db, resId) : null;
        if (plan && plan.kind === 'blocked') throw new Error(plan.error);

        const nowIso = new Date(now).toISOString();
        if (plan?.kind === 'release') plan.apply();
        tx.update(orderRef, {
          status: 'EXPIRED',
          expiredAt: nowIso,
          expiryReason: 'PAYMENT_NOT_RECEIVED',
          stockReleased: plan?.kind === 'release',
          updatedAt: nowIso
        });
        return 'expired' as const;
      });
      if (result === 'expired') report.expired.push(orderNumber);
      else report.skippedChanged.push(orderNumber);
    } catch (e: any) {
      report.failed.push({ orderNumber, error: e?.message || String(e) });
    }
  }
  return report;
}
