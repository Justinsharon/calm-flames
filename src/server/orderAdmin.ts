/** Admin order actions that need the server (so emails go out exactly once). */
import { getAdminDb } from './firestoreAdmin';
import { type Mailer, type SendResult, getMailer, sendShippedEmail } from './mailer';

const TRACKING_RE = /^https:\/\/[^\s]{1,500}$/;

export async function setTrackingAndNotify(
  orderNumber: unknown,
  trackingUrl: unknown,
  mailer: Mailer | null = getMailer()
): Promise<{ ok: true; trackingUrl: string | null; email: SendResult | 'not-sent' } | { ok: false; status: number; error: string }> {
  if (typeof orderNumber !== 'string' || !/^TCF-\d{6}$/.test(orderNumber)) return { ok: false, status: 404, error: 'Order not found.' };
  const url = typeof trackingUrl === 'string' && trackingUrl.trim() ? trackingUrl.trim() : null;
  if (url && !TRACKING_RE.test(url)) return { ok: false, status: 400, error: 'Tracking link must start with https://' };
  const ref = getAdminDb().collection('orders').doc(orderNumber);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Order not found.' };
  await ref.update({ trackingUrl: url, updatedAt: new Date().toISOString() });
  // sendOnce ignores orders already emailed, so editing the link later sends nothing new.
  const email = url ? await sendShippedEmail(orderNumber, mailer) : 'not-sent';
  return { ok: true, trackingUrl: url, email };
}
