/**
 * After an order is placed (COD) or paid (Razorpay): record which products a signed-in customer
 * bought (customers/{uid}/purchases/{productId}, server-only; gates review creation in rules)
 * and send the confirmation email and the shop's new-order alert (each once). Never throws.
 */
import { getAdminDb } from './firestoreAdmin';
import { sendOrderAlert, sendOrderConfirmation } from './mailer';

export function productIdsOfOrder(o: any): string[] {
  const ids = new Set<string>();
  for (const l of Array.isArray(o?.lines) ? o.lines : []) {
    if (l?.kind === 'box') for (const c of l.contents || []) c?.productId && ids.add(c.productId);
    else if (l?.productId) ids.add(l.productId);
  }
  for (const i of Array.isArray(o?.items) ? o.items : []) i?.productId && ids.add(i.productId);
  return [...ids];
}

export async function recordPurchases(orderNumber: string): Promise<number> {
  try {
    const db = getAdminDb();
    const snap = await db.collection('orders').doc(orderNumber).get();
    const o = snap.data();
    if (!o?.customerId) return 0;
    const ids = productIdsOfOrder(o);
    const batch = db.batch();
    const at = new Date().toISOString();
    for (const id of ids) batch.set(db.collection('customers').doc(o.customerId).collection('purchases').doc(id), { productId: id, orderNumber, at }, { merge: true });
    await batch.commit();
    return ids.length;
  } catch (e) {
    console.error(`Could not record purchases for ${orderNumber}:`, e);
    return 0;
  }
}

export async function afterOrderPlaced(orderNumber: string): Promise<void> {
  await recordPurchases(orderNumber);
  await sendOrderConfirmation(orderNumber);
  await sendOrderAlert(orderNumber);
}
