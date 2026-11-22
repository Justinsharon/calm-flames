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

/** Never throws (called fire-and-forget after an order is placed or paid). */
export async function sendOrderConfirmation(orderNumber: string, mailer: Mailer | null = getMailer()): Promise<'sent' | 'skipped' | 'duplicate' | 'failed'> {
  if (!mailer) {
    console.log(`[mail] No mail provider configured (MAIL_PROVIDER); skipping confirmation for ${orderNumber}.`);
    return 'skipped';
  }
  const db = getAdminDb();
  const ref = db.collection('orders').doc(orderNumber);
  try {
    const order = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const o = snap.data()!;
      if (o.confirmationEmail?.status === 'sent' || o.confirmationEmail?.status === 'sending') return null;
      tx.update(ref, { confirmationEmail: { status: 'sending', provider: mailer.name, at: new Date().toISOString() } });
      return o;
    });
    if (!order) return 'duplicate';
    const msg = confirmationEmail(order);
    if (!msg.to) throw new Error('Order has no email address.');
    await mailer.send(msg);
    await ref.update({ confirmationEmail: { status: 'sent', provider: mailer.name, at: new Date().toISOString() } });
    return 'sent';
  } catch (e: any) {
    console.error(`[mail] Confirmation for ${orderNumber} failed:`, e?.message || e);
    await ref.update({ confirmationEmail: { status: 'failed', provider: mailer.name, error: String(e?.message || e).slice(0, 200), at: new Date().toISOString() } }).catch(() => {});
    return 'failed';
  }
}
