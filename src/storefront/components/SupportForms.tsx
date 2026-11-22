import React, { useState } from 'react';
import { normalizePhone } from '../../lib/checkoutForm';
import { checkSupportPhoto, uploadSupportPhoto } from '../../services/supportService';
import { Button } from './ui';

const STATUS: Record<string, string> = {
  PAYMENT_PENDING: 'Placed: we are confirming the payment',
  RESERVED: 'Placed',
  CONFIRMED: 'Confirmed: being prepared in our studio',
  PROCESSING: 'Being hand-packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Not completed (payment not received)',
  FAILED: 'Not completed',
  RECONCILIATION_REQUIRED: 'Being checked by our team'
};

/** Order number + checkout phone; the server checks both and returns status + tracking link only. */
export const TrackOrder: React.FC = () => {
  const [num, setNum] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ status: string; trackingUrl: string | null; orderNumber: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 48, padding: 'clamp(28px, 4vw, 52px)', background: 'linear-gradient(135deg, rgba(123,30,46,.5), rgba(92,22,34,.2))' }}>
      <form
        style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setRes(null);
          if (!/^TCF-\d{6}$/i.test(num.trim())) return setErr('Order numbers look like TCF-123456.');
          if (!normalizePhone(phone)) return setErr('Enter the 10-digit mobile number used at checkout.');
          setBusy(true);
          try {
            const r = await fetch('/api/orders/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber: num.trim().toUpperCase(), phone }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'We could not find that order.');
            setRes(d);
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>Order status</p>
        <h2 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(2.2rem, 5vw, 48px)', lineHeight: 1.05 }}>
          Track your <span className="script" style={{ color: 'var(--color-rose)', fontSize: '1.2em' }}>order</span>
        </h2>
        <label className="lab">Order number<input className="in" value={num} onChange={(e) => setNum(e.target.value)} autoComplete="off" placeholder="TCF-" /></label>
        <label className="lab">Phone used at checkout<input className="in" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91" /></label>
        <div><Button type="submit" disabled={busy}>{busy ? 'Looking…' : 'Track order'}</Button></div>
      </form>
      <div aria-live="polite" style={{ flex: '1 1 320px', minWidth: 0, minHeight: 220, border: '1px dashed rgba(244,237,231,.22)', borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 10 }}>
        {err ? (
          <p role="alert" style={{ margin: 0, color: '#F3B7AE' }}>{err}</p>
        ) : res ? (
          <>
            <span className="serif" style={{ fontSize: 26 }}>{res.orderNumber}</span>
            <span>{STATUS[res.status] || res.status}</span>
            {res.trackingUrl ? (
              <a href={res.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-out">Track parcel</a>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--color-taupe)' }}>We'll add the courier tracking link when it ships.</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--color-taupe)' }}>Your order status appears here.</span>
        )}
      </div>
    </div>
  );
};

/** Call-back / damaged-item request with an optional photo. */
export const SupportForm: React.FC = () => {
  const [type, setType] = useState<'callback' | 'damaged'>('callback');
  const [f, setF] = useState({ name: '', phone: '', email: '', orderNumber: '', preferredTime: '', message: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (state === 'sent') {
    return (
      <div className="glass" role="status" style={{ padding: 'clamp(28px, 4vw, 48px)', maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>
        <p className="script" style={{ fontSize: 40, margin: 0 }}>Thank you</p>
        <p style={{ color: 'var(--color-muted)' }}>We've got your request and will call you back soon.</p>
      </div>
    );
  }
  return (
    <form
      className="glass"
      style={{ padding: 'clamp(28px, 4vw, 48px)', maxWidth: 920, margin: '0 auto' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (!f.name.trim()) return setErr('Enter your name.');
        if (!normalizePhone(f.phone)) return setErr('Enter a 10-digit Indian mobile number.');
        if (type === 'damaged' && !/^TCF-\d{6}$/i.test(f.orderNumber.trim())) return setErr('Add the order number (TCF-123456) for a damaged item.');
        if (!f.message.trim()) return setErr('Tell us how we can help.');
        setState('busy');
        try {
          const photoPath = photo ? await uploadSupportPhoto(photo) : undefined;
          const r = await fetch('/api/support', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...f, orderNumber: f.orderNumber.trim().toUpperCase() || undefined, email: f.email.trim() || undefined, photoPath })
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || 'We could not send your request.');
          setState('sent');
        } catch (e: any) {
          setErr(e?.message || 'We could not send your request.');
          setState('idle');
        }
      }}
    >
      <h3 className="serif" style={{ margin: '0 0 22px', fontWeight: 400, fontSize: 34 }}>
        Request a <span className="script" style={{ color: 'var(--color-rose)' }}>call back</span>
      </h3>
      <div role="radiogroup" aria-label="What do you need?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {([['callback', 'Call me back'], ['damaged', 'Damaged item']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={type === v} className={`chip${type === v ? ' on' : ''}`} onClick={() => setType(v)}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <label className="lab">Name<input className="in" value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} /></label>
        <label className="lab">Phone<input className="in" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="+91" /></label>
        <label className="lab">Email (optional)<input className="in" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label className="lab">Order number{type === 'damaged' ? '' : ' (optional)'}<input className="in" value={f.orderNumber} onChange={set('orderNumber')} placeholder="TCF-" /></label>
        {type === 'callback' && <label className="lab">Best time to call (optional)<input className="in" value={f.preferredTime} onChange={set('preferredTime')} maxLength={60} placeholder="e.g. weekdays after 6 pm" /></label>}
        <label className="lab" style={{ gridColumn: '1 / -1' }}>How can we help?<textarea className="in" rows={4} value={f.message} onChange={set('message')} maxLength={1000} /></label>
        <label className="lab" style={{ gridColumn: '1 / -1' }}>
          Photo (optional · JPG, PNG or WebP up to 5 MB)
          <input
            className="in"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ paddingTop: 12 }}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              const bad = file ? checkSupportPhoto(file) : null;
              setErr(bad);
              setPhoto(bad ? null : file);
              if (bad) e.target.value = '';
            }}
          />
        </label>
      </div>
      {err && <p role="alert" className="field-err" style={{ marginTop: 14 }}>{err}</p>}
      <div style={{ marginTop: 22 }}>
        <Button type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send request'}</Button>
      </div>
    </form>
  );
};
