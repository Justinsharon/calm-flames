/**
 * Help & Support (server side).
 * - Order lookup: order number + the phone used at checkout must BOTH match; the answer is the
 *   status and the admin's tracking link only. Mismatch and unknown order answer identically.
 * - Support requests (call-back / damaged item): validated here, saved to `supportRequests`
 *   (clients cannot write it). An optional photo was uploaded under support/{uuid}/ by the
 *   browser (storage.rules limit type and size); its object is re-checked before linking.
 */
import crypto from 'crypto';
import { getAdminDb, getAdminBucket } from './firestoreAdmin';
import { normalizePhone, isValidEmail } from '../lib/checkoutForm';
import { getMailer } from './mailer';

export async function lookupOrder(orderNumber: unknown, phone: unknown) {
  if (typeof orderNumber !== 'string' || typeof phone !== 'string') return null;
  const num = orderNumber.trim().toUpperCase();
  const ph = normalizePhone(phone);
  if (!/^TCF-\d{6}$/.test(num) || !ph) return null;
  const snap = await getAdminDb().collection('orders').doc(num).get();
  const o = snap.data();
  if (!o || normalizePhone(String(o.customer?.phone || '')) !== ph) return null;
  const tracking = typeof o.trackingUrl === 'string' && /^https:\/\/[^\s]+$/.test(o.trackingUrl) ? o.trackingUrl : null;
  return { orderNumber: num, status: String(o.status || 'PENDING'), paymentStatus: String(o.paymentStatus || ''), trackingUrl: tracking, placedAt: o.createdAt || null };
}

export const SUPPORT_TYPES = ['callback', 'damaged'] as const;
export const PHOTO_PATH_RE = /^support\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/photo\.(jpg|png|webp)$/;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface SupportInput {
  type: (typeof SUPPORT_TYPES)[number];
  name: string;
  phone: string;
  email?: string;
  orderNumber?: string;
  message: string;
  preferredTime?: string;
  photoPath?: string;
}

/** Pure validation; returns the cleaned request or a message. */
export function validateSupport(b: any): { ok: true; value: SupportInput } | { ok: false; error: string } {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
  if (!SUPPORT_TYPES.includes(b?.type)) return { ok: false, error: 'Choose what you need help with.' };
  const name = s(b.name, 80);
  if (!name || name.length > 80) return { ok: false, error: 'Enter your name.' };
  const phone = normalizePhone(s(b.phone, 20));
  if (!phone) return { ok: false, error: 'Enter a 10-digit Indian mobile number.' };
  const email = s(b.email, 254);
  if (email && !isValidEmail(email)) return { ok: false, error: 'Enter a valid email address (or leave it empty).' };
  const orderNumber = s(b.orderNumber, 20).toUpperCase();
  if (orderNumber && !/^TCF-\d{6}$/.test(orderNumber)) return { ok: false, error: 'Order numbers look like TCF-123456.' };
  if (b.type === 'damaged' && !orderNumber) return { ok: false, error: 'Add the order number for a damaged item.' };
  const message = s(b.message, 1000);
  if (!message || message.length > 1000) return { ok: false, error: 'Tell us how we can help (up to 1000 characters).' };
  const preferredTime = s(b.preferredTime, 60);
  const photoPath = s(b.photoPath, 120);
  if (photoPath && !PHOTO_PATH_RE.test(photoPath)) return { ok: false, error: 'That photo could not be attached.' };
  const value: SupportInput = { type: b.type, name, phone, message };
  if (email) value.email = email.toLowerCase();
  if (orderNumber) value.orderNumber = orderNumber;
  if (preferredTime) value.preferredTime = preferredTime;
  if (photoPath) value.photoPath = photoPath;
  return { ok: true, value };
}

/** Saves the request (doc id = the photo's folder id when there is a photo). */
export async function createSupportRequest(v: SupportInput): Promise<{ id: string } | { error: string; status: number }> {
  const db = getAdminDb();
  let id: string = crypto.randomUUID();
  let photo: { path: string; contentType: string; size: number } | undefined;
  if (v.photoPath) {
    id = PHOTO_PATH_RE.exec(v.photoPath)![1];
    const file = getAdminBucket().file(v.photoPath);
    const [exists] = await file.exists();
    if (!exists) return { error: 'That photo could not be found. Please attach it again.', status: 400 };
    const [meta] = await file.getMetadata();
    const size = Number(meta.size);
    if (!/^image\/(jpeg|png|webp)$/.test(String(meta.contentType)) || !(size > 0 && size <= MAX_PHOTO_BYTES)) {
      await file.delete().catch(() => {});
      return { error: 'Photos must be JPG, PNG or WebP and at most 5 MB.', status: 400 };
    }
    photo = { path: v.photoPath, contentType: String(meta.contentType), size };
  }
  const ref = db.collection('supportRequests').doc(id);
  const now = new Date().toISOString();
  try {
    const { photoPath: _drop, ...fields } = v;
    await ref.create({ ...fields, photo: photo || null, status: 'open', createdAt: now, updatedAt: now });
  } catch {
    return { error: 'This request was already sent.', status: 409 };
  }
  return { id };
}

/** Optional email to the shop (SUPPORT_NOTIFY_EMAIL + the configured mailer). Never throws. */
export async function notifySupport(id: string, v: SupportInput, env: NodeJS.ProcessEnv = process.env): Promise<'sent' | 'skipped' | 'failed'> {
  const to = env.SUPPORT_NOTIFY_EMAIL;
  const mailer = getMailer(env);
  if (!to || !mailer) return 'skipped';
  const kind = v.type === 'damaged' ? 'Damaged item' : 'Call-back request';
  const lines = [`${kind} ${id}`, `Name: ${v.name}`, `Phone: ${v.phone}`, v.email && `Email: ${v.email}`, v.orderNumber && `Order: ${v.orderNumber}`, v.preferredTime && `Best time: ${v.preferredTime}`, v.photoPath ? 'Photo attached (see Admin → Support)' : '', '', v.message].filter((x): x is string => typeof x === 'string');
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  try {
    await mailer.send({ to, subject: `${kind}${v.orderNumber ? ` · ${v.orderNumber}` : ''}`, text: lines.join('\n'), html: `<pre style="font-family:inherit">${esc(lines.join('\n'))}</pre>` });
    return 'sent';
  } catch (e: any) {
    console.error('[mail] Support notification failed:', e?.message || e);
    return 'failed';
  }
}
