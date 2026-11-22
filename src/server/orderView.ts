/**
 * Order-confirmed page access. Order numbers are short and guessable, so the page also needs
 * the unguessable view token returned once by /api/orders/create (only its SHA-256 is stored on
 * the order). Wrong token and unknown order answer identically.
 */
import crypto from 'crypto';
import { getAdminDb } from './firestoreAdmin';

export const newViewToken = () => crypto.randomBytes(24).toString('base64url');
export const hashViewToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function checkViewToken(token: unknown, storedHash: unknown): boolean {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128 || typeof storedHash !== 'string') return false;
  const a = Buffer.from(hashViewToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const httpsOnly = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u) ? u : null);

/** What the confirmed page may show: no email, phone or street address. */
export function orderSummaryForViewer(o: any) {
  const lines = Array.isArray(o.lines) ? o.lines : (o.items || []).map((i: any) => ({ kind: 'product', ...i }));
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    firstName: String(o.customer?.fullName || '').trim().split(/\s+/)[0] || '',
    city: o.customer?.city || '',
    pincode: o.customer?.pincode || '',
    lines: lines.map((l: any) =>
      l.kind === 'box'
        ? { kind: 'box', name: `Gift box of ${l.boxSize}`, detail: [l.contents?.map((c: any) => c.productName).join(', '), l.ribbon && `${l.ribbon} ribbon`].filter(Boolean).join(' · '), quantity: l.quantity, total: l.totalPrice }
        : { kind: 'product', productId: l.productId, name: l.productName || l.productId, quantity: l.quantity, total: l.totalPrice }
    ),
    subtotal: o.subtotal || 0,
    discount: o.discount || 0,
    shipping: o.shipping || 0,
    codFee: o.codFee || 0,
    total: o.total || 0,
    trackingUrl: httpsOnly(o.trackingUrl),
    createdAt: o.createdAt || null
  };
}

export async function getOrderForViewer(orderNumber: unknown, token: unknown) {
  if (typeof orderNumber !== 'string' || !/^TCF-\d{6}$/.test(orderNumber)) return null;
  const snap = await getAdminDb().collection('orders').doc(orderNumber).get();
  if (!snap.exists) return null;
  const o = snap.data()!;
  if (!checkViewToken(token, o.viewTokenHash)) return null;
  return orderSummaryForViewer(o);
}
