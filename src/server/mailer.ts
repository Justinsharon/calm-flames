/**
 * Order confirmation email. Pluggable and configured ONLY by env vars:
 *   MAIL_PROVIDER=resend  RESEND_API_KEY=…  MAIL_FROM="The Calm Flame <orders@…>"
 * Unset (or incomplete) = log and skip. Each order is emailed at most once
 * (`confirmationEmail` on the order is claimed in a transaction before sending).
 */
import { getAdminDb } from './firestoreAdmin';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface Mailer {
  name: string;
  send(m: MailMessage): Promise<void>;
}

export function getMailer(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Mailer | null {
  if (env.MAIL_PROVIDER === 'resend' && env.RESEND_API_KEY && env.MAIL_FROM) {
    const key = env.RESEND_API_KEY;
    const from = env.MAIL_FROM;
    return {
      name: 'resend',
      async send(m) {
        const r = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
          signal: AbortSignal.timeout(15000)
        });
        if (!r.ok) throw new Error(`Resend responded ${r.status}`);
      }
    };
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function confirmationEmail(o: any): MailMessage {
  const first = String(o.customer?.fullName || '').trim().split(/\s+/)[0] || 'there';
  const lines: string[] = (Array.isArray(o.lines) ? o.lines : o.items || []).map((l: any) =>
    l.kind === 'box'
      ? `Gift box of ${l.boxSize} (${(l.contents || []).map((c: any) => c.productName).join(', ')}) × ${l.quantity} — ${inr(l.totalPrice)}`
      : `${l.productName || l.productId} × ${l.quantity}${l.totalPrice ? ` — ${inr(l.totalPrice)}` : ''}`
  );
  const pay = o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online';
  const totals = [
    `Subtotal ${inr(o.subtotal)}`,
    o.discount ? `Discount −${inr(o.discount)}` : '',
    `Shipping ${o.shipping ? inr(o.shipping) : 'Free'}`,
    o.codFee ? `COD handling ${inr(o.codFee)}` : '',
    `Total ${inr(o.total)} (${pay})`
  ].filter(Boolean);
  const text = [`Thank you, ${first}.`, '', `Your order ${o.orderNumber} is confirmed.`, '', ...lines, '', ...totals, '', `Delivering to ${o.customer?.city || ''} ${o.customer?.pincode || ''}`.trim(), '', 'The Calm Flame'].join('\n');
  const html = `<div style="font-family:Georgia,serif;color:#3A2226;max-width:560px">
<p style="font-size:22px">Thank you, ${esc(first)}.</p>
<p>Your order <strong>${esc(String(o.orderNumber))}</strong> is confirmed.</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p>${totals.map(esc).join('<br>')}</p>
<p>The Calm Flame</p></div>`;
  return { to: String(o.customer?.email || ''), subject: `Your Calm Flame order ${o.orderNumber}`, text, html };
}

export type SendResult = 'sent' | 'skipped' | 'duplicate' | 'failed';
type OnceField = 'confirmationEmail' | 'orderAlertEmail' | 'shippedEmail';

/**
 * Send at most one email of a kind per order: the order's `field` is claimed in a transaction
 * ('sending'), then marked 'sent' or 'failed'. `build` returns null when this kind should not be
 * sent for the order (e.g. no tracking link yet). Never throws.
 */
export async function sendOnce(
  orderNumber: string,
  field: OnceField,
  build: (order: any) => MailMessage | null,
  mailer: Mailer | null
): Promise<SendResult> {
  if (!mailer) {
    console.log(`[mail] No mail provider configured (MAIL_PROVIDER); skipping ${field} for ${orderNumber}.`);
    return 'skipped';
  }
  const db = getAdminDb();
  const ref = db.collection('orders').doc(orderNumber);
  let msg: MailMessage | null = null;
  try {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const o = snap.data()!;
      const st = o[field]?.status;
      if (st === 'sent' || st === 'sending') return false;
      msg = build(o);
      if (!msg) return false;
      tx.update(ref, { [field]: { status: 'sending', provider: mailer.name, at: new Date().toISOString() } });
      return true;
    });
    if (!claimed || !msg) return 'duplicate';
    const m: MailMessage = msg;
    if (!m.to) throw new Error('No recipient address.');
    await mailer.send(m);
    await ref.update({ [field]: { status: 'sent', provider: mailer.name, at: new Date().toISOString() } });
    return 'sent';
  } catch (e: any) {
    console.error(`[mail] ${field} for ${orderNumber} failed:`, e?.message || e);
    await ref.update({ [field]: { status: 'failed', provider: mailer.name, error: String(e?.message || e).slice(0, 200), at: new Date().toISOString() } }).catch(() => {});
    return 'failed';
  }
}

/** Customer confirmation (COD placed / payment confirmed). */
export const sendOrderConfirmation = (orderNumber: string, mailer: Mailer | null = getMailer()) =>
  sendOnce(orderNumber, 'confirmationEmail', (o) => confirmationEmail(o), mailer);

/** Shop alert to ORDER_NOTIFY_EMAIL for a COD order or a paid order. */
export function orderAlertEmail(o: any, to: string): MailMessage {
  const pay = o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online';
  const c = o.customer || {};
  const lines: string[] = (Array.isArray(o.lines) ? o.lines : o.items || []).map((l: any) =>
    l.kind === 'box'
      ? `- Gift box of ${l.boxSize} (${(l.contents || []).map((x: any) => x.productName).join(', ')}${l.ribbon ? `, ${l.ribbon} ribbon` : ''}) × ${l.quantity}`
      : `- ${l.productName || l.productId} × ${l.quantity}`
  );
  const text = [
    `New order ${o.orderNumber}: ${inr(o.total)} (${pay})`,
    '',
    ...lines,
    o.giftMessage ? `Gift message: ${o.giftMessage}` : '',
    '',
    `Ship to: ${c.fullName || ''}, ${[c.addressLine1, c.addressLine2, c.city, c.state, c.pincode].filter(Boolean).join(', ')}`,
    `Phone: ${c.phone || ''} · Email: ${c.email || ''}`,
    '',
    'Open Admin → Orders to pack it.'
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return { to, subject: `New order ${o.orderNumber} · ${inr(o.total)} · ${pay}`, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>` };
}
export const sendOrderAlert = (orderNumber: string, env: NodeJS.ProcessEnv = process.env, mailer: Mailer | null = getMailer(env)) => {
  const to = env.ORDER_NOTIFY_EMAIL;
  if (!to) return Promise.resolve<SendResult>('skipped');
  return sendOnce(orderNumber, 'orderAlertEmail', (o) => orderAlertEmail(o, to), mailer);
};

/** "Your order has shipped": once, the first time a tracking link is saved. */
export function shippedEmail(o: any): MailMessage | null {
  const url = typeof o.trackingUrl === 'string' && /^https:\/\/[^\s]+$/.test(o.trackingUrl) ? o.trackingUrl : null;
  if (!url) return null;
  const first = String(o.customer?.fullName || '').trim().split(/\s+/)[0] || 'there';
  const text = [`Hello ${first},`, '', `Your order ${o.orderNumber} has left our studio and is on its way.`, '', `Track it here: ${url}`, '', 'Thank you for choosing a slower evening with us.', 'The Calm Flame'].join('\n');
  const html = `<div style="font-family:Georgia,serif;color:#3A2226;max-width:560px">
<p style="font-size:20px">Hello ${esc(first)},</p>
<p>Your order <strong>${esc(String(o.orderNumber))}</strong> has left our studio and is on its way.</p>
<p><a href="${esc(url)}" style="color:#7B1E2E">Track your parcel</a></p>
<p>Thank you for choosing a slower evening with us.<br>The Calm Flame</p></div>`;
  return { to: String(o.customer?.email || ''), subject: `Your Calm Flame order ${o.orderNumber} has shipped`, text, html };
}
export const sendShippedEmail = (orderNumber: string, mailer: Mailer | null = getMailer()) => sendOnce(orderNumber, 'shippedEmail', shippedEmail, mailer);
