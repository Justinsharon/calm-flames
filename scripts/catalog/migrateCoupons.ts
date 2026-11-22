import type { Firestore } from 'firebase-admin/firestore';
import { LEGACY_COUPONS } from '../../src/lib/coupons';

/** Create-only: writes the two formerly hard-coded codes as INACTIVE; never touches existing docs. */
export async function migrateCoupons(db: Firestore, opts: { dryRun?: boolean } = {}) {
  const created: string[] = [];
  const existing: string[] = [];
  for (const c of LEGACY_COUPONS) {
    const ref = db.collection('coupons').doc(c.code);
    if ((await ref.get()).exists) {
      existing.push(c.code);
      continue;
    }
    if (!opts.dryRun) await ref.create({ ...c, active: false, createdAt: new Date().toISOString(), note: 'Migrated from code (was hard-coded). Inactive until the owner turns it on.' });
    created.push(c.code);
  }
  return { created, existing };
}
