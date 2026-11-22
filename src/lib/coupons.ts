/**
 * Coupons live in Firestore `coupons/{CODE}` (admin-edited; read only by the server).
 * Nothing is hard-coded: an unknown, inactive, expired or malformed coupon gives no discount.
 */
export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  code: string;
  type: CouponType;
  /** Percent (1–100) for 'percent', rupees for 'fixed'. */
  value: number;
  /** Subtotal needed before the coupon applies (0 = none). */
  minOrder: number;
  /** Cap on the discount in rupees ('percent' only; unset = no cap). */
  maxDiscount?: number;
  active: boolean;
  /** ISO date-time after which the coupon stops working (unset = no expiry). */
  expiresAt?: string;
}

export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCouponCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Parse a Firestore doc; null if anything required is malformed (treated as no coupon). */
export function parseCoupon(code: string, raw: unknown): Coupon | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, any> | null;
  if (!r || !COUPON_CODE_RE.test(code)) return null;
  if (r.type !== 'percent' && r.type !== 'fixed') return null;
  if (!isMoney(r.value) || r.value <= 0) return null;
  if (r.type === 'percent' && r.value > 100) return null;
  const c: Coupon = {
    code,
    type: r.type,
    value: r.value,
    minOrder: isMoney(r.minOrder) ? r.minOrder : 0,
    active: r.active === true
  };
  if (isMoney(r.maxDiscount) && r.maxDiscount > 0) c.maxDiscount = r.maxDiscount;
  if (typeof r.expiresAt === 'string' && !Number.isNaN(Date.parse(r.expiresAt))) c.expiresAt = r.expiresAt;
  return c;
}

export type CouponResult = { ok: true; discount: number } | { ok: false; reason: string };

/** Discount for a subtotal (rupees, rounded, never more than the subtotal). */
export function couponDiscount(c: Coupon | null, subtotal: number, now: Date = new Date()): CouponResult {
  if (!c || !c.active) return { ok: false, reason: 'This code is not valid.' };
  if (c.expiresAt && Date.parse(c.expiresAt) <= now.getTime()) return { ok: false, reason: 'This code has expired.' };
  if (subtotal < c.minOrder) return { ok: false, reason: `This code needs an order of ₹${c.minOrder} or more.` };
  let d = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value;
  if (c.type === 'percent' && c.maxDiscount !== undefined) d = Math.min(d, c.maxDiscount);
  d = Math.max(0, Math.min(d, subtotal));
  return d > 0 ? { ok: true, discount: d } : { ok: false, reason: 'This code gives no discount on this order.' };
}

/** Admin editor validation: reports what is wrong (null = fine). */
export function validateCoupon(c: Coupon): string | null {
  if (!COUPON_CODE_RE.test(c.code)) return 'Code must be 3–32 characters: A–Z, 0–9, - or _.';
  if (c.type !== 'percent' && c.type !== 'fixed') return 'Type must be percent or fixed.';
  if (!isMoney(c.value) || c.value <= 0) return 'Value must be above 0.';
  if (c.type === 'percent' && c.value > 100) return 'A percent discount cannot exceed 100.';
  if (!isMoney(c.minOrder)) return 'Minimum order must be 0 or more.';
  if (c.maxDiscount !== undefined && (!isMoney(c.maxDiscount) || c.maxDiscount <= 0)) return 'Maximum discount must be above 0 (or empty).';
  if (c.expiresAt !== undefined && Number.isNaN(Date.parse(c.expiresAt))) return 'Expiry must be a valid date.';
  return null;
}

/** The two codes that used to be hard-coded, migrated as INACTIVE (owner decides). */
export const LEGACY_COUPONS: Coupon[] = [
  { code: 'CALM10', type: 'percent', value: 10, minOrder: 500, maxDiscount: 500, active: false },
  { code: 'FIRSTFLAME', type: 'fixed', value: 150, minOrder: 999, active: false }
];
