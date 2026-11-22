import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCart, type CartQuote } from '../../context/CartContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { formatInr } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { INDIAN_STATES, type CheckoutCustomer, type CustomerErrors, validateCustomer } from '../../lib/checkoutForm';
import { useDocumentMeta } from '../hooks/useMotion';
import { payWithRazorpay, type RazorpayMethod } from '../lib/razorpay';
import { Button, ButtonLink } from '../components/ui';

type Pay = RazorpayMethod | 'cod';
const PAY_OPTIONS: { id: Pay; label: string; sub: string }[] = [
  { id: 'upi', label: 'UPI', sub: 'GPay, PhonePe, Paytm' },
  { id: 'card', label: 'Card', sub: 'Credit or debit' },
  { id: 'netbanking', label: 'Netbanking', sub: 'All major banks' }
];

const EMPTY: CheckoutCustomer = { fullName: '', email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '' };

export const tokenStorageKey = (orderNumber: string) => `tcf_order_view_${orderNumber}`;

function newAttemptKey(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Shown instead of the form while CHECKOUT_ENABLED is off (Phase 4). */
const OpeningSoon: React.FC = () => (
  <section className="wrap" style={{ paddingTop: 150, paddingBottom: 110, minHeight: '60vh', maxWidth: 760 }}>
    <p className="eyebrow">Checkout</p>
    <h1 className="serif" style={{ fontSize: 'clamp(2.4rem, 5vw, 64px)', fontWeight: 400, margin: '0 0 18px', lineHeight: 1.05 }}>
      Opening <span className="script">soon</span>
    </h1>
    <p style={{ color: 'var(--color-muted)', margin: '0 0 28px', fontSize: 18 }}>
      We're putting the finishing touches on our online checkout. Your cart is saved on this device, so it will be waiting for you when we open.
    </p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <ButtonLink to={paths.cart()}>Back to cart</ButtonLink>
      <ButtonLink to={paths.support()} variant="out">Contact us</ButtonLink>
    </div>
  </section>
);

const Field: React.FC<{
  id: keyof CheckoutCustomer;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  optional?: boolean;
}> = ({ id, label, value, error, onChange, onBlur, type = 'text', autoComplete, inputMode, maxLength, optional }) => (
  <label className="lab" htmlFor={`co-${id}`}>
    {label}
    {optional && <span style={{ color: 'var(--color-taupe)' }}> (optional)</span>}
    <input
      id={`co-${id}`}
      className="in"
      type={type}
      value={value}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `co-${id}-err` : undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
    {error && (
      <p className="field-err" id={`co-${id}-err`}>
        {error}
      </p>
    )}
  </label>
);

export const CheckoutPage: React.FC = () => {
  useDocumentMeta('Checkout', 'Checkout at The Calm Flame.');
  const navigate = useNavigate();
  const { lines, inputs, couponCode, giftMessage, clearCart } = useCart();
  const { cod: codCfg } = useStoreSettings();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [form, setForm] = useState<CheckoutCustomer>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof CheckoutCustomer, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pay, setPay] = useState<Pay>('upi');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fp: string; key: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/checkout/readiness')
      .then((r) => r.json())
      .then((d) => live && setEnabled(d?.checkoutEnabled === true))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, []);

  // Quote for the chosen payment method (COD adds its fee) — always the server's numbers.
  const method = pay === 'cod' ? 'cod' : 'razorpay';
  useEffect(() => {
    if (inputs.length === 0) return;
    let live = true;
    fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: inputs, couponCode: couponCode || undefined, paymentMethod: method })
    })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!live) return;
        if (ok) {
          setQuote(d);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(d.error || 'We could not price your order.');
          // COD over the limit: fall back to online payment rather than block the page.
          if (method === 'cod') setPay('upi');
        }
      })
      .catch(() => live && setQuoteError('We could not reach the shop. Please try again.'));
    return () => {
      live = false;
    };
  }, [inputs, couponCode, method]);

  const errors: CustomerErrors = useMemo(() => validateCustomer(form), [form]);
  const show = (k: keyof CheckoutCustomer) => (submitted || touched[k] ? errors[k] : undefined);
  const set = (k: keyof CheckoutCustomer) => (v: string) => setForm((f) => ({ ...f, [k]: k === 'pincode' ? v.replace(/\D/g, '').slice(0, 6) : v }));
  const blur = (k: keyof CheckoutCustomer) => () => setTouched((t) => ({ ...t, [k]: true }));

  if (enabled === null) return <div style={{ minHeight: '80vh' }} />;
  if (!enabled) return <OpeningSoon />;
  if (lines.length === 0) {
    return (
      <section className="wrap" style={{ paddingTop: 150, paddingBottom: 110, minHeight: '60vh' }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2.4rem, 5vw, 64px)', fontWeight: 400, margin: '0 0 18px' }}>
          <span className="script">Checkout</span>
        </h1>
        <p style={{ color: 'var(--color-muted)' }}>Your cart is empty.</p>
        <ButtonLink to={paths.home()}>Explore candles</ButtonLink>
      </section>
    );
  }

  const codShown = Boolean(codCfg);
  const codBlocked = quote ? !quote.cod.available : false;

  const placeOrder = async () => {
    setSubmitted(true);
    setError(null);
    if (Object.keys(errors).length > 0) {
      document.getElementById(`co-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    const body = { items: inputs, customer: form, paymentMethod: method, couponCode: couponCode || undefined, giftMessage: giftMessage.trim() || undefined };
    // Same cart + details + method = same attempt (the server returns the same order).
    const fp = JSON.stringify(body);
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { fp, key: newAttemptKey() };
    setBusy(true);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key },
        body: JSON.stringify(body)
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status !== 409) attempt.current = null;
        throw new Error(d.error || 'We could not place your order. Please try again.');
      }
      if (d.viewToken) {
        try {
          sessionStorage.setItem(tokenStorageKey(d.orderNumber), d.viewToken);
        } catch {
          /* the token is in the URL fragment too */
        }
      }
      if (d.paymentMethod === 'razorpay') {
        if (!d.razorpayOrderId || !d.razorpayKeyId) throw new Error('Online payment is not available right now.');
        const r = await payWithRazorpay({
          keyId: d.razorpayKeyId,
          orderId: d.razorpayOrderId,
          amountPaise: Math.round(d.amount * 100),
          orderNumber: d.orderNumber,
          method: pay as RazorpayMethod,
          prefill: { name: form.fullName, email: form.email, contact: form.phone }
        });
        // The webhook also confirms the payment, so a failed call here is not final.
        await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...r, order_number: d.orderNumber })
        }).catch(() => null);
      }
      attempt.current = null;
      clearCart();
      navigate(paths.orderConfirmed(d.orderNumber, d.viewToken || undefined));
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cta = busy ? 'Placing your order…' : quote ? (pay === 'cod' ? `Place order · ${formatInr(quote.total)}` : `Pay ${formatInr(quote.total)}`) : 'Place order';

  return (
    <section className="wrap" style={{ paddingTop: 150, paddingBottom: 110 }}>
      <nav aria-label="Breadcrumb">
        <p className="crumb">
          <Link to={paths.cart()}>Cart</Link> · <span aria-current="page">Checkout</span>
        </p>
      </nav>
      <h1 className="serif" style={{ fontSize: 'clamp(2.6rem, 6vw, 80px)', fontWeight: 400, margin: '0 0 36px', lineHeight: 1 }}>
        <span className="script">Checkout</span>
      </h1>
      <form
        noValidate
        className="two-col"
        onSubmit={(e) => {
          e.preventDefault();
          void placeOrder();
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <fieldset className="glass" style={{ padding: 'clamp(20px, 3vw, 32px)', margin: 0, display: 'grid', gap: 16 }}>
            <legend className="serif" style={{ fontSize: 26, padding: 0, float: 'left', marginBottom: 4 }}>Contact</legend>
            <Field id="email" label="Email" type="email" autoComplete="email" value={form.email} error={show('email')} onChange={set('email')} onBlur={blur('email')} />
            <Field id="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} error={show('phone')} onChange={set('phone')} onBlur={blur('phone')} />
          </fieldset>

          <fieldset className="glass" style={{ padding: 'clamp(20px, 3vw, 32px)', margin: 0, display: 'grid', gap: 16 }}>
            <legend className="serif" style={{ fontSize: 26, padding: 0, float: 'left', marginBottom: 4 }}>Delivery address</legend>
            <Field id="fullName" label="Full name" autoComplete="name" value={form.fullName} error={show('fullName')} onChange={set('fullName')} onBlur={blur('fullName')} />
            <Field id="pincode" label="Pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} error={show('pincode')} onChange={set('pincode')} onBlur={blur('pincode')} />
            <Field id="addressLine1" label="Address" autoComplete="address-line1" value={form.addressLine1} error={show('addressLine1')} onChange={set('addressLine1')} onBlur={blur('addressLine1')} />
            <Field id="addressLine2" label="Landmark, apartment" optional autoComplete="address-line2" value={form.addressLine2 || ''} error={show('addressLine2')} onChange={set('addressLine2')} onBlur={blur('addressLine2')} />
            <Field id="city" label="City" autoComplete="address-level2" value={form.city} error={show('city')} onChange={set('city')} onBlur={blur('city')} />
            <label className="lab" htmlFor="co-state">
              State
              <select
                id="co-state"
                className="in"
                value={form.state}
                autoComplete="address-level1"
                aria-invalid={show('state') ? true : undefined}
                aria-describedby={show('state') ? 'co-state-err' : undefined}
                onChange={(e) => set('state')(e.target.value)}
                onBlur={blur('state')}
              >
                <option value="">Choose…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {show('state') && <p className="field-err" id="co-state-err">{show('state')}</p>}
            </label>
          </fieldset>

          <fieldset className="glass" style={{ padding: 'clamp(20px, 3vw, 32px)', margin: 0 }}>
            <legend className="serif" style={{ fontSize: 26, padding: 0, float: 'left', marginBottom: 16 }}>Payment</legend>
            <div role="radiogroup" aria-label="Payment method" style={{ clear: 'both', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {PAY_OPTIONS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={pay === o.id} className="glass opt" onClick={() => setPay(o.id)}>
                  <span style={{ fontWeight: 700 }}>{o.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{o.sub}</span>
                </button>
              ))}
              {codShown && (
                <button type="button" role="radio" aria-checked={pay === 'cod'} className="glass opt" disabled={codBlocked} onClick={() => setPay('cod')}>
                  <span style={{ fontWeight: 700 }}>Cash on delivery</span>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {codBlocked && quote?.cod.reason ? quote.cod.reason : `${formatInr(codCfg!.codFee)} handling fee`}
                  </span>
                </button>
              )}
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--color-muted)' }}>
              {pay === 'cod' ? 'Pay in cash when your order arrives.' : "Secure payment by Razorpay. You'll confirm in a Razorpay window."}
            </p>
          </fieldset>
        </div>

        <aside className="glass" aria-label="Order summary" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Order summary</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lines.map((l, i) => {
              const img = l.kind === 'box' ? l.products.find((p) => p.image)?.image : l.product.image;
              const name = l.kind === 'box' ? `Gift box of ${l.input.boxSize}` : l.product.name;
              return (
                <li key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {img ? <img src={img} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flex: 'none' }} /> : <span style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--color-ink-2)', flex: 'none' }} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="serif" style={{ display: 'block', fontSize: 18, lineHeight: 1.2 }}>{name}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Qty {l.quantity}</span>
                  </span>
                  <span>{quote?.items[i] ? formatInr(quote.items[i].totalPrice) : '…'}</span>
                </li>
              );
            })}
          </ul>
          {quoteError ? (
            <p role="alert" style={{ margin: 0, color: '#F3B7AE' }}>{quoteError}</p>
          ) : (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(244,237,231,.14)', paddingTop: 12 }}>
              <p className="sum-row"><span>Subtotal</span><span>{quote ? formatInr(quote.subtotal) : '…'}</span></p>
              {quote && quote.discount > 0 && <p className="sum-row"><span>Discount ({quote.couponCode})</span><span>−{formatInr(quote.discount)}</span></p>}
              <p className="sum-row"><span>Shipping</span><span>{quote ? (quote.shipping === 0 ? 'Free' : formatInr(quote.shipping)) : '…'}</span></p>
              {quote && quote.codFee > 0 && <p className="sum-row"><span>COD handling</span><span>{formatInr(quote.codFee)}</span></p>}
            </div>
          )}
          <p className="serif sum-row" style={{ fontSize: 26, marginTop: 4 }}>
            <span>Total</span>
            <span>{quote ? formatInr(quote.total) : '…'}</span>
          </p>
          {error && <p role="alert" style={{ margin: 0, color: '#F3B7AE' }}>{error}</p>}
          <Button type="submit" disabled={busy || !quote}>{cta}</Button>
          <Link to={paths.cart()} className="lnk" style={{ textAlign: 'center' }}>Back to cart</Link>
        </aside>
      </form>
    </section>
  );
};
