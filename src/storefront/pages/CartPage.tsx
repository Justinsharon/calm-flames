import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useCart, type CartLine } from '../../context/CartContext';
import { useCatalog } from '../../context/CatalogContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { canAddToCart, formatInr, productSubtitle, relatedProducts } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { MAX_BOX_QTY, MAX_MESSAGE } from '../../lib/cartLines';
import { useDocumentMeta } from '../hooks/useMotion';
import { ProductGrid } from '../components/ProductCard';
import { Button, ButtonLink, QtyStepper, SectionHead } from '../components/ui';

/** Free-shipping line under the title (no box). Shown only when shipping is configured. */
export function shippingMessage(subtotal: number, threshold: number | null): { text: string; progress: number } | null {
  if (threshold === null || subtotal <= 0) return null;
  if (threshold === 0 || subtotal >= threshold) return { text: 'Your order ships free.', progress: 1 };
  return { text: `You're ${formatInr(threshold - subtotal)} away from free shipping.`, progress: Math.max(0, Math.min(1, subtotal / threshold)) };
}

const Line: React.FC<{ line: CartLine; total?: number; familyNames: Record<string, string> }> = ({ line, total, familyNames }) => {
  const { setQuantity, removeLine } = useCart();
  const title = line.kind === 'box' ? `Gift box of ${line.input.boxSize}` : line.product.name;
  const image = line.kind === 'box' ? line.products.find((p) => p.image)?.image : line.product.image;
  const sub =
    line.kind === 'box'
      ? [line.products.map((p) => p.name).join(', '), line.input.ribbon && `${line.input.ribbon} ribbon`, ...(line.input.addOns || [])].filter(Boolean).join(' · ')
      : productSubtitle(line.product, line.product.scentFamilySlug ? familyNames[line.product.scentFamilySlug] : undefined);
  const max = line.kind === 'box' ? MAX_BOX_QTY : typeof line.product.availableStock === 'number' && line.product.availableStock > 0 ? Math.min(100, line.product.availableStock) : 100;
  return (
    <li className="glass cart-line">
      {line.kind === 'product' ? (
        <Link to={paths.product(line.product)} aria-hidden="true" tabIndex={-1}>
          {image ? <img src={image} alt="" /> : <span className="noimg" />}
        </Link>
      ) : image ? (
        <img src={image} alt="" />
      ) : (
        <span className="noimg" />
      )}
      <div className="meta">
        {line.kind === 'product' ? (
          <Link to={paths.product(line.product)} className="serif" style={{ fontSize: 22, textDecoration: 'none', lineHeight: 1.2 }}>
            {title}
          </Link>
        ) : (
          <span className="serif" style={{ fontSize: 22, lineHeight: 1.2 }}>{title}</span>
        )}
        {sub && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{sub}</span>}
        {line.kind === 'box' && line.input.message && <span style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>“{line.input.message}”</span>}
      </div>
      <div className="acts">
        <QtyStepper value={line.quantity} max={max} onChange={(n) => setQuantity(line.key, n)} label={`Quantity of ${title}`} />
        <span style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{total !== undefined ? formatInr(total) : '…'}</span>
        <button type="button" className="lnk" onClick={() => removeLine(line.key)} aria-label={`Remove ${title}`} style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
          Remove
        </button>
      </div>
    </li>
  );
};

export const CartPage: React.FC = () => {
  useDocumentMeta('Your cart', 'Your cart at The Calm Flame.');
  const { lines, giftMessage, setGiftMessage, quote, quoteError, quoting, couponCode, setCouponCode } = useCart();
  const { products, loading } = useCatalog();
  const { cod, buildABox } = useStoreSettings();
  const { scentFamilies } = useTaxonomy();
  const [codeDraft, setCodeDraft] = useState(couponCode);
  const familyNames = useMemo(() => Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name])), [scentFamilies]);

  // Totals are always the server's. Before the first quote, nothing is shown as a number.
  const ship = quote ? shippingMessage(quote.subtotal, quote.freeShippingThreshold) : null;
  const suggestions = useMemo(() => {
    const first = lines.find((l) => l.kind === 'product');
    const inCart = new Set(lines.flatMap((l) => (l.kind === 'product' ? [l.product.id] : l.products.map((p) => p.id))));
    const base = first?.kind === 'product' ? relatedProducts(products, first.product, 12) : products;
    return base.filter((p) => canAddToCart(p) && !inCart.has(p.id)).slice(0, 4);
  }, [lines, products]);

  if (!loading && lines.length === 0) {
    return (
      <section className="wrap" style={{ paddingTop: 150, paddingBottom: 110, minHeight: '60vh' }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2.6rem, 6vw, 80px)', fontWeight: 400, margin: '0 0 16px', lineHeight: 1 }}>
          Your <span className="script">cart</span>
        </h1>
        <p style={{ color: 'var(--color-muted)', margin: '0 0 28px' }}>Your cart is empty.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ButtonLink to={paths.home()}>Explore candles</ButtonLink>
          {buildABox && <ButtonLink to={paths.buildBox()} variant="out">Build a box</ButtonLink>}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="wrap" style={{ paddingTop: 150, paddingBottom: 80 }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2.6rem, 6vw, 80px)', fontWeight: 400, margin: '0 0 14px', lineHeight: 1 }}>
          Your <span className="script">cart</span>
        </h1>
        {ship && (
          <div style={{ maxWidth: 520, margin: '0 0 36px' }}>
            <p style={{ margin: '0 0 10px', color: 'var(--color-muted)' }}>{ship.text}</p>
            <span className="bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${ship.progress})` }} />
            </span>
          </div>
        )}
        <div className="two-col" style={{ marginTop: ship ? 0 : 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="Items in your cart">
              {lines.map((l, i) => (
                <Line key={l.key} line={l} total={quote?.items[i]?.totalPrice} familyNames={familyNames} />
              ))}
            </ul>
            <label className="lab" style={{ marginTop: 8 }}>
              Gift message (optional)
              <textarea className="in" rows={3} maxLength={MAX_MESSAGE} value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} placeholder="We'll handwrite it on a card." />
            </label>
            {buildABox && (
              <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '22px 26px' }}>
                <div>
                  <p className="serif" style={{ fontSize: 24, margin: 0 }}>
                    Make it a <span className="script">gift box?</span>
                  </p>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>Choose candles for a hand-wrapped box.</p>
                </div>
                <ButtonLink to={paths.buildBox()} variant="out">Build a box</ButtonLink>
              </div>
            )}
          </div>

          <aside className="glass" aria-label="Order summary" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Order summary</p>
            {quoteError ? (
              <p role="alert" style={{ margin: 0, color: '#F3B7AE' }}>{quoteError}</p>
            ) : (
              <div aria-live="polite" aria-busy={quoting} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p className="sum-row"><span>Subtotal</span><span>{quote ? formatInr(quote.subtotal) : '…'}</span></p>
                {quote && quote.discount > 0 && <p className="sum-row"><span>Discount ({quote.couponCode})</span><span>−{formatInr(quote.discount)}</span></p>}
                <p className="sum-row"><span>Shipping</span><span>{quote ? (quote.shipping === 0 ? 'Free' : formatInr(quote.shipping)) : '…'}</span></p>
                <p className="sum-row" style={{ color: 'var(--color-muted)' }}><span>GST</span><span>Included</span></p>
              </div>
            )}
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                setCouponCode(codeDraft.trim().toUpperCase());
              }}
            >
              <label htmlFor="coupon" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Coupon code</label>
              <input id="coupon" className="in" style={{ flex: 1, minWidth: 0 }} placeholder="Coupon code" value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} autoComplete="off" />
              {couponCode ? (
                <button type="button" className="chip" onClick={() => { setCouponCode(''); setCodeDraft(''); }}>Remove</button>
              ) : (
                <button type="submit" className="chip" disabled={!codeDraft.trim()}>Apply</button>
              )}
            </form>
            {couponCode && quote?.couponMessage && (
              <p role="status" style={{ margin: 0, fontSize: 13, color: quote.discount > 0 ? 'var(--color-muted)' : '#F3B7AE' }}>{quote.couponMessage}</p>
            )}
            <p className="serif sum-row" style={{ fontSize: 26, marginTop: 6 }}>
              <span>Total</span>
              <span>{quote ? formatInr(quote.total) : '…'}</span>
            </p>
            {quote && !quoteError ? <ButtonLink to={paths.checkout()}>Checkout</ButtonLink> : <Button disabled>Checkout</Button>}
            <Link to={paths.home()} className="lnk" style={{ textAlign: 'center' }}>Continue shopping</Link>
            <p style={{ margin: 0, fontSize: 12, letterSpacing: '.08em', color: 'var(--color-taupe)', textAlign: 'center' }}>
              UPI · Cards · Netbanking{cod ? ' · Cash on delivery' : ''}
            </p>
          </aside>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section style={{ background: 'var(--color-ink-2)', padding: '90px 0' }}>
          <div className="wrap">
            <SectionHead eyebrow="Often bought together" before="Complete the" script="ritual" />
            <ProductGrid products={suggestions} familyNames={familyNames} />
          </div>
        </section>
      )}
    </>
  );
};
