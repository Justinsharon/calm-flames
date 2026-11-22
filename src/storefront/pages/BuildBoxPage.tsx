import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { useCart } from '../../context/CartContext';
import type { Product } from '../../types';
import type { BuildABoxSettings } from '../../lib/storeSettings';
import { canAddToCart, formatInr } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { MAX_MESSAGE } from '../../lib/cartLines';
import { useDocumentMeta } from '../hooks/useMotion';
import { PageHero } from '../components/PageHero';
import { Button, EmptyNote } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

/** Candles that may go in a box: priced, active, in stock and marked box-eligible by the owner. */
export function boxEligibleProducts(products: Product[]): Product[] {
  return products.filter((p) => canAddToCart(p) && p.boxEligible === true && p.inventoryStatus === 'in_stock');
}

/**
 * What the customer sees while building (owner-entered prices only). The server re-prices the
 * box from Firestore when it is quoted or ordered; this figure is never sent.
 */
export function boxEstimate(cfg: BuildABoxSettings, size: number, picks: Product[], addOns: string[]): number | null {
  const s = cfg.sizes.find((z) => z.count === size);
  if (!s) return null;
  return s.price + picks.reduce((t, p) => t + p.price, 0) + cfg.addOns.filter((a) => addOns.includes(a.name)).reduce((t, a) => t + a.price, 0);
}

export const BuildBoxPage: React.FC = () => {
  useDocumentMeta('Build a Box', 'Choose a box, fill it with the candles you love, and we wrap it by hand with a handwritten note.');
  const { buildABox: cfg, loading: settingsLoading } = useStoreSettings();
  const { products, loading } = useCatalog();
  const { addBox } = useCart();
  const navigate = useNavigate();
  const eligible = useMemo(() => boxEligibleProducts(products), [products]);
  const byId = useMemo(() => new Map(eligible.map((p) => [p.id, p])), [eligible]);

  const [size, setSize] = useState<number | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [ribbon, setRibbon] = useState('');
  const [addOns, setAddOns] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  if (!cfg) return loading || settingsLoading ? <div style={{ minHeight: '80vh' }} /> : <NotFoundPage />;

  const current = size ?? cfg.sizes[0].count;
  const chosen = picks.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  const full = chosen.length === current;
  const total = boxEstimate(cfg, current, chosen, addOns);
  const step = !size ? 0 : !full ? 1 : 2;
  const countOf = (id: string) => picks.filter((x) => x === id).length;

  const chooseSize = (n: number) => {
    setSize(n);
    setPicks((p) => p.slice(0, n));
  };
  const add = (id: string) => {
    if (!size) setSize(current);
    setPicks((p) => (p.length < current ? [...p, id] : p));
  };
  const removeOne = (id: string) =>
    setPicks((p) => {
      const i = p.lastIndexOf(id);
      return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
    });

  const hero = eligible.find((p) => p.image)?.image;

  return (
    <>
      <PageHero
        image={hero}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Build a Box' }]}
        eyebrow="Three steps · wrapped by hand"
        title={<>Build your <span className="script">gift box</span></>}
        sub="Choose a box, fill it with the candles you love, and we'll wrap it with a handwritten note."
        minHeight={480}
      />

      <section className="wrap" style={{ paddingTop: 48 }}>
        <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 40px', display: 'flex', flexWrap: 'wrap', gap: '14px 28px' }} aria-label="Steps">
          {['Choose a box', 'Fill it', 'Finish it'].map((t, i) => (
            <li key={t} className={`step${step >= i ? ' on' : ''}`} aria-current={step === i ? 'step' : undefined}>
              <b>{i + 1}</b>
              {t}
            </li>
          ))}
        </ol>

        <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 40px)', fontWeight: 400, margin: '0 0 20px' }}>
          1 · Choose a <span className="script">box</span>
        </h2>
        <div role="radiogroup" aria-label="Box size" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {cfg.sizes.map((s, i) => {
            const img = eligible[i % Math.max(1, eligible.length)]?.image;
            return (
              <button key={s.count} type="button" role="radio" aria-checked={current === s.count && size !== null} className="glass opt" onClick={() => chooseSize(s.count)} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {img && <img src={img} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }} />}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="serif" style={{ fontSize: 22 }}>Box of {s.count}</span>
                  <span style={{ fontWeight: 700 }}>+ {formatInr(s.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 64 }}>
        <div className="two-col">
          <div style={{ minWidth: 0 }}>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 40px)', fontWeight: 400, margin: '0 0 20px' }}>
              2 · Fill <span className="script">it</span>
            </h2>
            {loading ? null : eligible.length === 0 ? (
              <EmptyNote>No candles are available for gift boxes right now.</EmptyNote>
            ) : (
              <ul className="pick-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {eligible.map((p) => {
                  const n = countOf(p.id);
                  return (
                    <li key={p.id} className={`glass pick${n ? ' on' : ''}`}>
                      {p.image ? <img src={p.image} alt="" /> : <span className="noimg" />}
                      <span className="serif" style={{ fontSize: 19, lineHeight: 1.2 }}>{p.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{formatInr(p.price)}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          {n > 0 && (
                            <button type="button" className="chip" onClick={() => removeOne(p.id)} aria-label={`Remove one ${p.name}`}>
                              − {n}
                            </button>
                          )}
                          <button type="button" className={`chip${n ? ' on' : ''}`} disabled={full} onClick={() => add(p.id)} aria-label={`Add ${p.name} to the box`}>
                            {n ? '+' : 'Add'}
                          </button>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="glass" aria-label="Your box" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Your box</p>
            {chosen.length > 0 && (
              <div className="box-stack" aria-hidden="true" style={{ height: 260 }}>
                {chosen.slice(-3).map((p, i) => (p.image ? <img key={`${p.id}${i}`} className={`b${i + 1}`} src={p.image} alt="" /> : null))}
              </div>
            )}
            <p className="serif" style={{ fontSize: 22, margin: 0 }} aria-live="polite">
              Box of {current} · {chosen.length} of {current} chosen
            </p>
            <span className="bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${chosen.length / current})` }} />
            </span>
            {chosen.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chosen.map((p, i) => (
                  <li key={`${p.id}-${i}`} className="chip" style={{ cursor: 'default' }}>{p.name}</li>
                ))}
              </ul>
            )}
            <p className="sum-row" style={{ fontWeight: 700 }}>
              <span>Box total</span>
              <span>{total !== null ? formatInr(total) : '…'}</span>
            </p>
          </aside>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 110 }}>
        <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 40px)', fontWeight: 400, margin: '0 0 20px' }}>
          3 · Finish <span className="script">it</span>
        </h2>
        <div className="glass" style={{ padding: 'clamp(20px, 3vw, 36px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <label className="lab">
            Gift message
            <textarea className="in" rows={3} maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="We'll handwrite it on a card." />
          </label>
          {cfg.ribbons.length > 0 && (
            <div>
              <p className="lab" id="ribbon-label" style={{ margin: '0 0 10px' }}>Ribbon</p>
              <div role="radiogroup" aria-labelledby="ribbon-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cfg.ribbons.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={ribbon === r} className={`chip${ribbon === r ? ' on' : ''}`} onClick={() => setRibbon(ribbon === r ? '' : r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {cfg.addOns.length > 0 && (
            <div>
              <p className="lab" style={{ margin: '0 0 10px' }}>Add-ons</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cfg.addOns.map((a) => {
                  const on = addOns.includes(a.name);
                  return (
                    <button key={a.name} type="button" aria-pressed={on} className={`chip${on ? ' on' : ''}`} onClick={() => setAddOns(on ? addOns.filter((x) => x !== a.name) : [...addOns, a.name])}>
                      + {a.name} · {formatInr(a.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <Button
              disabled={!full}
              onClick={() => {
                addBox({ boxSize: current, productIds: picks, ribbon: ribbon || undefined, addOns, message });
                navigate(paths.cart());
              }}
            >
              {full ? `Add box to cart · ${total !== null ? formatInr(total) : ''}` : `Choose ${current - chosen.length} more`}
            </Button>
            <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>{[ribbon && `${ribbon} ribbon`, message.trim() && 'handwritten note'].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
      </section>
    </>
  );
};
