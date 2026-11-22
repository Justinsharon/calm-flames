import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { formatInr } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { sortJournal } from '../../lib/pages';
import { useDocumentMeta } from '../hooks/useMotion';
import { usePublishedPages } from '../hooks/usePages';
import { ButtonLink } from '../components/ui';
import { tokenStorageKey } from './CheckoutPage';

interface OrderView {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: 'razorpay' | 'cod';
  firstName: string;
  city: string;
  pincode: string;
  lines: { kind: string; name: string; detail?: string; quantity: number; total?: number }[];
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  total: number;
  trackingUrl: string | null;
}

/** Token from the #t= fragment (never sent to the server in a URL), else this tab's storage. */
export function readViewToken(hash: string, orderNumber: string): string | null {
  const m = /(?:^#|&)t=([^&]+)/.exec(hash);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  try {
    return sessionStorage.getItem(tokenStorageKey(orderNumber));
  } catch {
    return null;
  }
}

const SHIPPED = ['SHIPPED', 'DELIVERED'];

export const ConfirmedPage: React.FC = () => {
  useDocumentMeta('Order confirmed', 'Your order at The Calm Flame.');
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const { pages: journal } = usePublishedPages('journal');
  const stories = useMemo(() => sortJournal(journal).slice(0, 3), [journal]);

  useEffect(() => {
    const token = readViewToken(hash, id);
    if (!token) {
      setState('missing');
      return;
    }
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      fetch(`/api/orders/${encodeURIComponent(id)}/view`, { headers: { 'X-Order-Token': token } })
        .then(async (r) => {
          if (!live) return;
          if (r.status === 404) return setState('missing');
          if (!r.ok) return setState('error');
          const d: OrderView = await r.json();
          setOrder(d);
          setState('ok');
          // Online payment confirming (verify/webhook in flight): check again a few times.
          if (d.paymentMethod === 'razorpay' && d.paymentStatus !== 'PAID' && tries++ < 6) timer = setTimeout(load, 4000);
        })
        .catch(() => live && setState('error'));
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, hash]);

  if (state === 'loading') return <div style={{ minHeight: '80vh' }} />;
  if (state !== 'ok' || !order) {
    return (
      <section className="wrap" style={{ paddingTop: 150, paddingBottom: 110, minHeight: '60vh', maxWidth: 760 }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2.2rem, 5vw, 56px)', fontWeight: 400, margin: '0 0 16px' }}>
          We couldn't open <span className="script">this order</span>
        </h1>
        <p style={{ color: 'var(--color-muted)', margin: '0 0 28px' }}>
          {state === 'error'
            ? 'Something went wrong loading it. Please refresh in a moment.'
            : 'This page opens only from the browser that placed the order. Your confirmation email has the details, or contact us with your order number.'}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ButtonLink to={paths.home()}>Continue shopping</ButtonLink>
          <ButtonLink to={paths.support()} variant="out">Contact us</ButtonLink>
        </div>
      </section>
    );
  }

  const paid = order.paymentStatus === 'PAID';
  const pending = order.paymentMethod === 'razorpay' && !paid;
  const items = order.lines.reduce((s, l) => s + l.quantity, 0);
  const shipped = SHIPPED.includes(order.status);
  const steps = [
    { t: 'Hand-packed', d: 'Wrapped in our studio', on: true },
    { t: 'Shipped', d: order.trackingUrl ? 'Tracking link below' : 'We send the tracking link when it ships', on: shipped },
    { t: 'Delivered', d: [order.city, order.pincode].filter(Boolean).join(' '), on: order.status === 'DELIVERED' }
  ];

  return (
    <>
      <section style={{ position: 'relative', overflow: 'hidden', paddingTop: 140, paddingBottom: 40, textAlign: 'center' }}>
        <div className="wrap" style={{ position: 'relative' }}>
          <div className="match" aria-hidden="true">
            <span className="m-glow" />
            <span className="m-stick" />
            <span className="m-head" />
            <span className="m-spark" />
            <span className="m-flame" />
          </div>
          <h1 className="serif after-lit" style={{ fontSize: 'clamp(2.6rem, 6vw, 80px)', fontWeight: 400, margin: '0 0 14px', lineHeight: 1.05 }}>
            <span className="script">Thank you{order.firstName ? ',' : ''}</span> {order.firstName}
          </h1>
          <p className="after-lit" style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 620, margin: '0 auto' }} role="status">
            {pending ? (
              <>We're confirming the payment for order <strong style={{ color: 'var(--color-ivory)' }}>{order.orderNumber}</strong>. This usually takes a moment.</>
            ) : (
              <>Your order <strong style={{ color: 'var(--color-ivory)' }}>{order.orderNumber}</strong> is {order.paymentMethod === 'cod' ? 'placed' : 'confirmed'}. We'll email you the details.</>
            )}
          </p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 90, maxWidth: 980 }}>
        <div className="glass" style={{ padding: 'clamp(22px, 3vw, 36px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p className="eyebrow" style={{ margin: 0 }}>What happens next</p>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {steps.map((s, i) => (
              <li key={s.t} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className={`step${s.on ? ' on' : ''}`}><b>{i + 1}</b></span>
                <span className="serif" style={{ fontSize: 22 }}>{s.t}</span>
                {s.d && <span style={{ fontSize: 14, color: 'var(--color-muted)' }}>{s.d}</span>}
              </li>
            ))}
          </ol>
          {order.trackingUrl && (
            <p style={{ margin: 0 }}>
              <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="lnk">Track your parcel</a>
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: '18px 0 0', borderTop: '1px solid rgba(244,237,231,.14)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {order.lines.map((l, i) => (
              <li key={i} className="sum-row">
                <span>
                  {l.name} × {l.quantity}
                  {l.detail && <span style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)' }}>{l.detail}</span>}
                </span>
                {typeof l.total === 'number' && <span>{formatInr(l.total)}</span>}
              </li>
            ))}
            {order.discount > 0 && <li className="sum-row"><span>Discount</span><span>−{formatInr(order.discount)}</span></li>}
            <li className="sum-row"><span>Shipping</span><span>{order.shipping ? formatInr(order.shipping) : 'Free'}</span></li>
            {order.codFee > 0 && <li className="sum-row"><span>COD handling</span><span>{formatInr(order.codFee)}</span></li>}
          </ul>
          <div className="sum-row" style={{ alignItems: 'baseline' }}>
            <span style={{ color: 'var(--color-muted)' }}>
              {items} item{items === 1 ? '' : 's'} · {order.paymentMethod === 'cod' ? 'Cash on delivery' : paid ? 'Paid online' : 'Payment confirming'}
            </span>
            <span className="serif" style={{ fontSize: 28 }}>{formatInr(order.total)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28, justifyContent: 'center' }}>
          <ButtonLink to={paths.home()}>Continue shopping</ButtonLink>
          <ButtonLink to={paths.support()} variant="out">Help &amp; support</ButtonLink>
        </div>
      </section>

      {stories.length > 0 && (
        <section style={{ background: 'var(--color-ink-2)', padding: '90px 0' }}>
          <div className="wrap">
            <p className="eyebrow">From the Journal</p>
            <h2 className="serif" style={{ fontSize: 'clamp(2rem, 4vw, 52px)', fontWeight: 400, margin: '0 0 36px' }}>
              While you <span className="script">wait</span>
            </h2>
            <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
              {stories.map((s) => (
                <Link key={s.slug} to={paths.journal(s.slug)} className="tilt" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {s.heroImage && <img src={s.heroImage} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 20 }} />}
                  <span className="serif" style={{ fontSize: 22, lineHeight: 1.25 }}>{s.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
};
