/**
 * Releases stale inventory reservations (CLAUDE.md issue 12).
 *
 * A reservation is released only if, inside one transaction:
 *  - it is still RESERVED,
 *  - it is older than the time limit (createdAt, or expiresAt for very old records), and
 *  - no order document exists for its orderNumber.
 * Reservations that belong to an existing order are never touched here: the webhook / verify /
 * failure paths own those. Because the order-persist transaction re-checks that its reservation
 * is still RESERVED, a slow checkout and this sweeper cannot both win.
 *
 * Safe to run twice or concurrently (each release re-validates in its transaction; an already
 * released reservation is skipped) and safe alongside the webhook (which needs an order).
 */
import { getAdminDb, doc, runTransaction } from './firestoreAdmin';
import { planReservationRelease } from './inventoryService';

/** Never release anything younger than this, whatever the caller asks. */
export const MIN_MAX_AGE_MINUTES = 15;
export const DEFAULT_MAX_AGE_MINUTES = 30;

export interface ExpiryReport {
  cutoff: string;
  scanned: number;
  released: string[];
  skippedFresh: string[];
  skippedHasOrder: string[];
  skippedChanged: string[];
  failed: { reservationId: string; error: string }[];
}

function reservationTime(r: any): number | null {
  const t = Date.parse(r?.createdAt || r?.expiresAt || '');
  return Number.isFinite(t) ? t : null;
}

export function resolveMaxAgeMinutes(requested?: unknown): number {
  const fromEnv = Number(process.env.RESERVATION_MAX_AGE_MINUTES);
  const base = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_MAX_AGE_MINUTES;
  return Math.max(MIN_MAX_AGE_MINUTES, base);
}

export async function expireStaleReservations(opts: { maxAgeMinutes?: number; now?: number; limit?: number } = {}): Promise<ExpiryReport> {
  const db = getAdminDb();
  const maxAgeMs = resolveMaxAgeMinutes(opts.maxAgeMinutes) * 60 * 1000;
  const now = opts.now ?? Date.now();
  const cutoffMs = now - maxAgeMs;
  const report: ExpiryReport = {
    cutoff: new Date(cutoffMs).toISOString(),
    scanned: 0,
    released: [],
    skippedFresh: [],
    skippedHasOrder: [],
    skippedChanged: [],
    failed: []
  };

  // Single-field equality query: works without a composite index.
  const snap = await db.collection('inventoryReservations').where('status', '==', 'RESERVED').limit(opts.limit ?? 500).get();
  report.scanned = snap.size;

  for (const d of snap.docs) {
    const id = d.id;
    const t = reservationTime(d.data());
    if (t === null || t > cutoffMs) {
      report.skippedFresh.push(id);
      continue;
    }
    try {
      const result = await runTransaction(db, async (tx) => {
        const resRef = doc(db, 'inventoryReservations', id);
        const resSnap = await tx.get(resRef);
        const res = resSnap.exists() ? resSnap.data() : null;
        const time = reservationTime(res);
        if (!res || res.status !== 'RESERVED' || time === null || time > cutoffMs) return 'changed' as const;

        const orderNumber = typeof res.orderNumber === 'string' && res.orderNumber !== 'PENDING' ? res.orderNumber : null;
        if (orderNumber) {
          const orderSnap = await tx.get(doc(db, 'orders', orderNumber));
          if (orderSnap.exists()) return 'has_order' as const;
        }

        const plan = await planReservationRelease(tx, db, id);
        if (plan.kind === 'already_released') return 'changed' as const;
        if (plan.kind !== 'release') throw new Error(plan.error);
        plan.apply();
        tx.update(resRef, { releaseReason: 'EXPIRED_NO_ORDER', expiredAt: new Date(now).toISOString() });
        return 'released' as const;
      });
      if (result === 'released') report.released.push(id);
      else if (result === 'has_order') report.skippedHasOrder.push(id);
      else report.skippedChanged.push(id);
    } catch (e: any) {
      report.failed.push({ reservationId: id, error: e?.message || String(e) });
    }
  }
  return report;
}
