/** Admin reads/writes for `coupons/{CODE}` (admin-only in firestore.rules; the server applies them). */
import { collection, deleteDoc, doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { db as appDb } from '../lib/firebase';
import { type Coupon, parseCoupon, validateCoupon } from '../lib/coupons';
import { stripUndefined } from '../lib/productMapping';

export function subscribeCoupons(onChange: (c: Coupon[]) => void, onError: (e: Error) => void, db: Firestore = appDb as Firestore) {
  return onSnapshot(
    collection(db, 'coupons'),
    (snap) => onChange(snap.docs.map((d) => parseCoupon(d.id, d.data())).filter((c): c is Coupon => Boolean(c)).sort((a, b) => a.code.localeCompare(b.code))),
    (e) => onError(e)
  );
}

export async function saveCoupon(c: Coupon, db: Firestore = appDb as Firestore): Promise<void> {
  const err = validateCoupon(c);
  if (err) throw new Error(err);
  await setDoc(
    doc(db, 'coupons', c.code),
    stripUndefined({
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.minOrder,
      maxDiscount: c.type === 'percent' ? c.maxDiscount : undefined,
      active: c.active,
      expiresAt: c.expiresAt,
      updatedAt: new Date().toISOString()
    } as Record<string, any>)
  );
}

export const deleteCoupon = (code: string, db: Firestore = appDb as Firestore) => deleteDoc(doc(db, 'coupons', code));
