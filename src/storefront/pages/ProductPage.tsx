import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { canAddToCart, findProductBySlug, formatInr, productBadge, relatedProducts } from '../../lib/storefront';
import { hasVerifiedPrice } from '../../lib/productMapping';
import { paths } from '../../lib/routes';
import { Markdown } from '../../lib/markdown';
import { useDocumentMeta } from '../hooks/useMotion';
import { usePage } from '../hooks/usePages';
import { ProductGrid } from '../components/ProductCard';
import { Accordion, Button, HeartIcon, MatchAvatar, QtyStepper, SectionHead } from '../components/ui';
import { splitTitle } from './CollectionPage';
import { NotFoundPage } from './NotFoundPage';
import { ProductReviews } from '../components/Reviews';
import { recordRecentlyViewed } from '../lib/recentlyViewed';

export const ProductPage: React.FC = () => {
  const { slug = '' } = useParams();
  const { products, loading } = useCatalog();
  const { collections, scentFamilies } = useTaxonomy();
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  const { toggleWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const { shipping, cod } = useStoreSettings();
  const { page: care } = usePage('candle-care');
  const { page: returnsPage } = usePage('returns');
  const p = findProductBySlug(products, slug);
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(1);
  useEffect(() => {
    setPhoto(0);
    setQty(1);
  }, [slug]);
  useEffect(() => {
    if (p?.id) recordRecentlyViewed(p.id);
  }, [p?.id]);
  useDocumentMeta(p?.name || (loading ? undefined : 'Page not found'), p?.shortDescription || p?.description || p?.tagline);

  if (loading) {
    return <p className="wrap" role="status" style={{ paddingTop: 80, paddingBottom: 200, color: 'var(--color-muted)' }}>Loading…</p>;
  }
  if (!p) return <NotFoundPage />;

  const photos = (p.galleryImages || []).filter(Boolean);
  const main = photos[photo] || p.image;
  const collection = collections.find((c) => c.slug === p.collection);
  const family = scentFamilies.find((f) => f.slug === p.scentFamilySlug);
  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  const priced = hasVerifiedPrice(p);
  const buyable = canAddToCart(p);
  const saved = isInWishlist(p.id);
  const badge = productBadge(p);
  const notes = p.notes || p.scentNotes;
  const noteChips = [
    ...(notes?.top || []).map((n) => ['Top', n]),
    ...(notes?.heart || []).map((n) => ['Heart', n]),
    ...(notes?.base || []).map((n) => ['Base', n])
  ];
  const stats = [
    p.burnTimeHours !== undefined ? [`${p.burnTimeHours} hrs`, 'Burn time'] : p.burnTime ? [p.burnTime, 'Burn time'] : null,
    p.weightGrams !== undefined ? [`${p.weightGrams} g`, 'Weight'] : p.weight ? [p.weight, 'Weight'] : null,
    p.sizeCm ? [`${p.sizeCm} cm`, 'Size'] : p.dimensions ? [p.dimensions, 'Size'] : null
  ].filter(Boolean) as [string, string][];
  const t = splitTitle(p.name);
  const related = relatedProducts(products, p);

  const shippingText = [
    shipping ? (shipping.shippingFee === 0 ? 'Free shipping on every order.' : `Free shipping on orders over ${formatInr(shipping.freeShippingThreshold)}; ${formatInr(shipping.shippingFee)} below that.`) : null,
    cod ? 'Cash on delivery available.' : null
  ].filter(Boolean).join(' ');

  const accordion = [
    p.description ? { title: 'Description', content: <Markdown source={p.description} /> } : null,
    care ? { title: 'How to burn & care', content: <Markdown source={care.body} /> } : null,
    p.ingredients ? { title: 'Ingredients', content: p.ingredients } : null,
    shippingText || returnsPage
      ? {
          title: 'Shipping & returns',
          content: (
            <>
              {shippingText && <p style={{ margin: '0 0 8px' }}>{shippingText}</p>}
              <Link className="lnk" to={paths.info('shipping')}>Shipping</Link>
              {returnsPage && <> · <Link className="lnk" to={paths.info('returns')}>Returns</Link></>}
            </>
          )
        }
      : null
  ].filter(Boolean) as { title: string; content: React.ReactNode }[];

  return (
    <>
      <section className="wrap" style={{ paddingTop: 40, paddingBottom: 90 }}>
        <nav aria-label="Breadcrumb">
          <p className="crumb">
            <Link to={paths.home()}>Home</Link>
            {collection && <> · <Link to={paths.collection(collection.slug)}>{collection.name}</Link></>} · <span aria-current="page">{p.name}</span>
          </p>
        </nav>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 56, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 480px', minWidth: 0 }}>
            <div className="p3">
              <div className="tilt" style={{ borderRadius: 24, overflow: 'hidden', aspectRatio: '1 / 1', background: 'var(--color-ink-2)' }}>
                {main ? (
                  <img src={main} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MatchAvatar size={88} /></span>
                )}
                <span className="shine" aria-hidden="true" />
                {badge && <span className="badge">{badge}</span>}
              </div>
            </div>
            {photos.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 14 }}>
                {photos.map((src, i) => (
                  <button key={src + i} type="button" className={`thumb${i === photo ? ' on' : ''}`} aria-label={`Photo ${i + 1} of ${photos.length}`} aria-pressed={i === photo} onClick={() => setPhoto(i)}>
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {(collection || family) && <p className="eyebrow" style={{ margin: 0 }}>{collection?.name || family?.name}</p>}
            <h1 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(2.6rem, 5vw, 72px)', lineHeight: 1 }}>
              {t.before ? `${t.before} ` : ''}<span className="script" style={{ color: 'var(--color-rose)', fontSize: '1.2em' }}>{t.script}</span>
            </h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              {priced ? (
                <>
                  <span className="serif" style={{ fontSize: 40 }}>{formatInr(p.price)}</span>
                  {p.originalPrice && p.originalPrice > p.price && <s style={{ color: 'var(--color-taupe)' }}>{formatInr(p.originalPrice)}</s>}
                </>
              ) : (
                <span className="serif" style={{ fontSize: 30, color: 'var(--color-muted)' }}>Price coming soon</span>
              )}
              {p.inventoryStatus === 'in_stock' && <span style={{ fontSize: 13, color: 'var(--color-rose)' }}>In stock</span>}
              {p.inventoryStatus === 'out_of_stock' && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Out of stock</span>}
            </div>
            {(p.shortDescription || p.tagline) && <p style={{ margin: 0, color: 'var(--color-ivory-2)', fontSize: 17 }}>{p.shortDescription || p.tagline}</p>}

            {noteChips.length > 0 && (
              <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
                <p className="eyebrow" style={{ marginBottom: 12 }}>Scent notes</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {noteChips.map(([k, n], i) => (
                    <span key={i} className="chip" style={{ cursor: 'default' }}><span style={{ color: 'var(--color-taupe)' }}>{k}</span>{n}</span>
                  ))}
                </div>
              </div>
            )}

            {stats.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 12 }}>
                {stats.map(([v, l]) => (
                  <div key={l} className="stat">
                    <span className="serif" style={{ fontSize: 22, display: 'block', lineHeight: 1.2 }}>{v}</span>
                    <span style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--color-taupe)' }}>{l}</span>
                  </div>
                ))}
              </div>
            )}

            {buyable && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <QtyStepper value={qty} onChange={setQty} label={`Quantity of ${p.name}`} max={typeof p.availableStock === 'number' && p.availableStock > 0 ? Math.min(100, p.availableStock) : 100} />
                <Button
                  style={{ flex: '1 1 200px' }}
                  onClick={() => setAdded(addToCart(p, qty))}
                >
                  Add to cart · {formatInr(p.price * qty)}
                </Button>
                {added && (
                  <p role="status" style={{ margin: 0, flexBasis: '100%', color: 'var(--color-muted)' }}>
                    Added to your cart · <Link to={paths.cart()} className="lnk">View cart</Link>
                  </p>
                )}
              </div>
            )}
            <div>
              <Button variant="out" aria-pressed={saved} onClick={() => toggleWishlist(p.id) === 'sign-in' && navigate(paths.signIn(location.pathname))} style={{ width: '100%' }}>
                <HeartIcon /> {saved ? 'Saved to favourites' : 'Save to favourites'}
              </Button>
            </div>
            <Accordion items={accordion} />
          </div>
        </div>
      </section>

      {/* Reviews: approved only; hidden while there are none (and no review can be written). */}
      <ProductReviews productId={p.id} />

      {related.length > 0 && (
        <section className="wrap" style={{ paddingTop: 60, paddingBottom: 110 }}>
          <SectionHead before="You may also" script="like" />
          <ProductGrid products={related} familyNames={familyNames} />
        </section>
      )}
    </>
  );
};
