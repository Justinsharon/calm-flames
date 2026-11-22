import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { useCatalog } from '../../context/CatalogContext';
import { useCart } from '../../context/CartContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { canAddToCart, formatInr } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { INDIAN_STATES } from '../../lib/checkoutForm';
import { type AccountOrder, type SavedAddress, deleteAddress, getAddresses, getMyOrders, saveAddress } from '../../services/accountService';
import { useDocumentMeta } from '../hooks/useMotion';
import { ProductGrid } from '../components/ProductCard';
import { Button, ButtonLink, EmptyNote, SectionHead } from '../components/ui';
import { readRecentlyViewed } from '../lib/recentlyViewed';

type Tab = 'favourites' | 'orders' | 'addresses';
const TABS: { id: Tab; label: string }[] = [
  { id: 'favourites', label: 'Favourites' },
  { id: 'orders', label: 'Orders' },
  { id: 'addresses', label: 'Addresses' }
];
const STATUS_LABEL: Record<string, string> = {
  PAYMENT_PENDING: 'Placed',
  RESERVED: 'Placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Not completed',
  FAILED: 'Not completed',
  RECONCILIATION_REQUIRED: 'Being checked'
};

const BLANK = { id: undefined as string | undefined, label: '', fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', isDefault: false };

const AddressForm: React.FC<{ initial?: SavedAddress; onDone: () => void; uid: string; first: boolean }> = ({ initial, onDone, uid, first }) => {
  const [f, setF] = useState(initial ? { ...BLANK, ...initial } : { ...BLANK, isDefault: first });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof BLANK, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="lab">
      {label}
      <input className="in" value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: k === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value })} {...extra} />
    </label>
  );
  return (
    <form
      className="glass"
      style={{ padding: 24, display: 'grid', gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await saveAddress(uid, f as any);
          onDone();
        } catch (err: any) {
          setError(err?.message || 'Could not save the address.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {field('label', 'Label (optional, e.g. Home)', { maxLength: 40 })}
      {field('fullName', 'Full name', { autoComplete: 'name' })}
      {field('phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
      {field('pincode', 'Pincode', { inputMode: 'numeric', autoComplete: 'postal-code' })}
      {field('addressLine1', 'Address', { autoComplete: 'address-line1' })}
      {field('addressLine2', 'Landmark, apartment (optional)', { autoComplete: 'address-line2' })}
      {field('city', 'City', { autoComplete: 'address-level2' })}
      <label className="lab">
        State
        <select className="in" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} /> Use as my default address at checkout
      </label>
      {error && <p role="alert" className="field-err">{error}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</Button>
        <Button variant="out" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
};

export const AccountPage: React.FC = () => {
  useDocumentMeta('Your account', 'Your favourites, orders and saved addresses.');
  const { user, profile, loading, signOut, isAdmin } = useAuth();
  const { wishlist } = useWishlist();
  const { getProductById } = useCatalog();
  const { addToCart } = useCart();
  const { scentFamilies } = useTaxonomy();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'favourites') as Tab;
  const [orders, setOrders] = useState<AccountOrder[] | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const { openAdmin } = useOutletContext<{ openAdmin: () => void }>();
  const [note, setNote] = useState<string | null>(null);
  const familyNames = useMemo(() => Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name])), [scentFamilies]);

  useEffect(() => {
    if (!loading && !user) navigate(paths.signIn('/account'), { replace: true });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    if (tab === 'orders' && orders === null) getMyOrders(user.uid).then(setOrders).catch(() => setOrders([]));
    if (tab === 'addresses' && addresses === null) getAddresses(user.uid).then(setAddresses).catch(() => setAddresses([]));
  }, [user, tab, orders, addresses]);

  const favProducts = wishlist.map((id) => getProductById(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const buyable = favProducts.filter(canAddToCart);
  const recent = readRecentlyViewed().map((id) => getProductById(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)).slice(0, 4);

  if (!user || !profile) return <div style={{ minHeight: '80vh' }} />;
  const first = profile.fullName.split(/\s+/)[0] || 'there';
  const reloadAddresses = () => getAddresses(user.uid).then(setAddresses).catch(() => setAddresses([]));

  return (
    <>
      <section className="wrap" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 36 }}>
          <span className="serif" aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 32, border: '1px solid rgba(235,201,191,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
            {first.charAt(0).toUpperCase()}
          </span>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <p className="eyebrow" style={{ margin: '0 0 6px', overflowWrap: 'anywhere' }}>Signed in with Google · {profile.email}</p>
            <h1 className="serif" style={{ fontSize: 'clamp(2.4rem, 5vw, 64px)', fontWeight: 400, margin: 0, lineHeight: 1.05 }}>
              Hello, <span className="script">{first}</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {isAdmin && <Button variant="out" onClick={openAdmin}>Admin</Button>}
            <button type="button" className="lnk" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => signOut().then(() => navigate(paths.home()))}>
              Sign out
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Your account" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`chip${tab === t.id ? ' on' : ''}`}
              onClick={() => setParams({ tab: t.id }, { replace: true })}
            >
              {t.label}
              {t.id === 'favourites' ? ` (${favProducts.length})` : ''}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'favourites' &&
            (favProducts.length === 0 ? (
              <div className="glass" style={{ padding: 36, textAlign: 'center' }}>
                <p className="script" style={{ fontSize: 38, margin: 0 }}>Nothing saved yet</p>
                <p style={{ color: 'var(--color-muted)' }}>Tap the heart on any candle to keep it here.</p>
                <ButtonLink to={paths.home()}>Explore candles</ButtonLink>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>Saved to your account, on every device.</p>
                  {buyable.length > 0 && (
                    <Button
                      onClick={() => {
                        buyable.forEach((p) => addToCart(p, 1));
                        setNote(`${buyable.length} added to your cart.`);
                      }}
                    >
                      Add all to cart
                    </Button>
                  )}
                </div>
                {note && <p role="status" style={{ color: 'var(--color-muted)' }}>{note} <Link to={paths.cart()} className="lnk">View cart</Link></p>}
                <ProductGrid products={favProducts} familyNames={familyNames} />
              </>
            ))}

          {tab === 'orders' &&
            (orders === null ? (
              <p style={{ color: 'var(--color-muted)' }}>Loading your orders…</p>
            ) : orders.length === 0 ? (
              <EmptyNote>No orders yet. Orders you place while signed in appear here.</EmptyNote>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {orders.map((o) => (
                  <li key={o.orderNumber} className="glass" style={{ padding: '18px 22px', display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'center' }}>
                    <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <span className="serif" style={{ fontSize: 22, display: 'block' }}>{o.orderNumber}</span>
                      <span style={{ fontSize: 14, color: 'var(--color-muted)' }}>
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        {o.summary ? ` · ${o.summary}` : ''}
                      </span>
                    </span>
                    <span>{STATUS_LABEL[o.status] || o.status}</span>
                    <span style={{ fontWeight: 700 }}>{formatInr(o.total)}</span>
                    {o.trackingUrl ? (
                      <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="lnk">Track →</a>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--color-taupe)' }}>Tracking link when shipped</span>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'addresses' &&
            (addresses === null ? (
              <p style={{ color: 'var(--color-muted)' }}>Loading…</p>
            ) : editing ? (
              <AddressForm
                uid={user.uid}
                first={addresses.length === 0}
                initial={editing === 'new' ? undefined : editing}
                onDone={() => {
                  setEditing(null);
                  void reloadAddresses();
                }}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {addresses.map((a) => (
                  <div key={a.id} className="glass" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p className="eyebrow" style={{ margin: 0 }}>{[a.label, a.isDefault && 'Default'].filter(Boolean).join(' · ') || 'Address'}</p>
                    <p style={{ margin: 0 }}>
                      {a.fullName}
                      <br />
                      {a.addressLine1}
                      {a.addressLine2 ? `, ${a.addressLine2}` : ''}
                      <br />
                      {a.city} {a.pincode}, {a.state}
                      <br />
                      +91 {a.phone}
                    </p>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <button type="button" className="lnk" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setEditing(a)}>Edit</button>
                      <button
                        type="button"
                        className="lnk"
                        style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
                        onClick={() => deleteAddress(user.uid, a.id).then(reloadAddresses)}
                        aria-label={`Remove address for ${a.fullName}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="glass opt" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 140 }} onClick={() => setEditing('new')}>
                  + Add a new address
                </button>
              </div>
            ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section style={{ background: 'var(--color-ink-2)', padding: '90px 0' }}>
          <div className="wrap">
            <SectionHead before="Recently" script="viewed" />
            <ProductGrid products={recent} familyNames={familyNames} />
          </div>
        </section>
      )}
    </>
  );
};
