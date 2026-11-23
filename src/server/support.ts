/**
 * Help & Support (server side).
 * - Order lookup: order number + the phone used at checkout must BOTH match; the answer is the
 *   status and the admin's tracking link only. Mismatch and unknown order answer identically.
 * - Support requests (call-back / damaged item): validated here, saved to `supportRequests`
 *   (clients cannot write it). An optional photo is sent to the server with a one-time,
 *   15-minute upload ticket for that request; the server checks the bytes and stores it.
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
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Upload tickets are valid this long after the request is created. */
export const PHOTO_TICKET_MINUTES = 15;
const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface SupportInput {
  type: (typeof SUPPORT_TYPES)[number];
  name: string;
  phone: string;
  email?: string;
  orderNumber?: string;
  message: string;
  preferredTime?: string;
  /** The shopper will attach a photo next (the server issues a one-time upload ticket). */
  withPhoto?: boolean;
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
  if (b.withPhoto !== undefined && typeof b.withPhoto !== 'boolean') return { ok: false, error: 'Invalid photo option.' };
  const value: SupportInput = { type: b.type, name, phone, message };
  if (email) value.email = email.toLowerCase();
  if (orderNumber) value.orderNumber = orderNumber;
  if (preferredTime) value.preferredTime = preferredTime;
  if (b.withPhoto === true) value.withPhoto = true;
  return { ok: true, value };
}

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Saves the request. With `withPhoto`, it also stores the hash of a one-time upload ticket valid
 * for PHOTO_TICKET_MINUTES and returns the ticket (only the browser that sent the request has it).
 */
export async function createSupportRequest(v: SupportInput, now = new Date()): Promise<{ id: string; uploadTicket?: string }> {
  const id = crypto.randomUUID();
  const at = now.toISOString();
  const { withPhoto, ...fields } = v;
  const ticket = withPhoto ? crypto.randomBytes(24).toString('base64url') : undefined;
  await getAdminDb().collection('supportRequests').doc(id).create({
    ...fields,
    photo: null,
    photoUpload: ticket ? { ticketHash: hash(ticket), expiresAt: new Date(now.getTime() + PHOTO_TICKET_MINUTES * 60_000).toISOString() } : null,
    status: 'open',
    createdAt: at,
    updatedAt: at
  });
  return ticket ? { id, uploadTicket: ticket } : { id };
}

/** Content sniffing: the bytes must really be a JPEG, PNG or WebP of the declared type. */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * The server stores the photo itself (clients cannot write to support/ in Storage). The request
 * must exist, still be waiting for its photo, and the ticket must match and not be expired; the
 * ticket is consumed in the same transaction, so it works once.
 */
export async function attachSupportPhoto(
  id: unknown,
  ticket: unknown,
  contentType: unknown,
  body: unknown,
  now = new Date()
): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> {
  const bad = (status: number, error: string) => ({ ok: false as const, status, error });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || typeof ticket !== 'string' || ticket.length < 16 || ticket.length > 100) return bad(403, 'This upload link is not valid.');
  if (!Buffer.isBuffer(body) || body.length === 0) return bad(400, 'Photos must be JPG, PNG or WebP and at most 5 MB.');
  if (body.length > MAX_PHOTO_BYTES) return bad(413, 'Photos can be up to 5 MB.');
  const declared = String(contentType || '').split(';')[0].trim().toLowerCase();
  const actual = sniffImage(body);
  if (!actual || actual !== declared) return bad(415, 'Photos must be JPG, PNG or WebP and at most 5 MB.');

  const db = getAdminDb();
  const ref = db.collection('supportRequests').doc(id);
  const path = `support/${id}/photo.${PHOTO_EXT[actual]}`;
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.data();
    const up = r?.photoUpload;
    if (!r || r.photo || !up?.ticketHash) return 'invalid';
    if (Date.parse(up.expiresAt) <= now.getTime()) return 'expired';
    const a = Buffer.from(hash(ticket), 'hex');
    const b = Buffer.from(String(up.ticketHash), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'invalid';
    tx.update(ref, { photoUpload: null, updatedAt: now.toISOString() });
    return 'ok';
  });
  if (claimed === 'expired') return bad(410, 'This upload link has expired. Please send the request again.');
  if (claimed !== 'ok') return bad(403, 'This upload link is not valid.');
  await getAdminBucket().file(path).save(body, { contentType: actual, resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
  await ref.update({ photo: { path, contentType: actual, size: body.length }, updatedAt: new Date().toISOString() });
  return { ok: true, path };
}

/** Optional email to the shop (SUPPORT_NOTIFY_EMAIL + the configured mailer). Never throws. */
export async function notifySupport(id: string, v: SupportInput, env: NodeJS.ProcessEnv = process.env): Promise<'sent' | 'skipped' | 'failed'> {
  const to = env.SUPPORT_NOTIFY_EMAIL;
  const mailer = getMailer(env);
  if (!to || !mailer) return 'skipped';
  const kind = v.type === 'damaged' ? 'Damaged item' : 'Call-back request';
  const lines = [`${kind} ${id}`, `Name: ${v.name}`, `Phone: ${v.phone}`, v.email && `Email: ${v.email}`, v.orderNumber && `Order: ${v.orderNumber}`, v.preferredTime && `Best time: ${v.preferredTime}`, v.withPhoto ? 'A photo is being attached (see Admin → Support)' : '', '', v.message].filter((x): x is string => typeof x === 'string');
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  try {
    await mailer.send({ to, subject: `${kind}${v.orderNumber ? ` · ${v.orderNumber}` : ''}`, text: lines.join('\n'), html: `<pre style="font-family:inherit">${esc(lines.join('\n'))}</pre>` });
    return 'sent';
  } catch (e: any) {
    console.error('[mail] Support notification failed:', e?.message || e);
    return 'failed';
  }
}
