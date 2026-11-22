/** Server-side coupon lookup (firebase-admin; `coupons/` is not readable by clients). */
import { getAdminDb } from './firestoreAdmin';
import { type Coupon, normalizeCouponCode, parseCoupon, COUPON_CODE_RE } from '../lib/coupons';

/** null = no code given. An unreadable or unknown code resolves to `coupon: null` (no discount). */
export async function loadCoupon(raw: unknown): Promise<{ code: string; coupon: Coupon | null } | null> {
  const code = normalizeCouponCode(raw);
  if (!code) return null;
  if (!COUPON_CODE_RE.test(code)) return { code, coupon: null };
  try {
    const snap = await getAdminDb().collection('coupons').doc(code).get();
    return { code, coupon: snap.exists ? parseCoupon(code, snap.data()) : null };
  } catch (e) {
    console.error('Could not read coupon (no discount applied):', e);
    return { code, coupon: null };
  }
}
