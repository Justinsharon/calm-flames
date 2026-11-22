import React, { useState } from 'react';
import { useParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { forOccasion, hampers, tileImage, withProducts } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { useDocumentMeta } from '../hooks/useMotion';
import { PageHero, HeroTitle } from '../components/PageHero';
import { ProductGrid } from '../components/ProductCard';
import { OccasionTile } from '../components/Tiles';
import { EmptyNote, MatchAvatar, SectionHead } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

/** Gift guide: placeholder until Phase 4D (no fake chat replies). */
const GiftGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="guide">
      {open && (
        <div className="glass" role="dialog" aria-label="Gift guide" style={{ width: 340, maxWidth: 'calc(100vw - 40px)', background: 'rgba(30,11,15,.94)', boxShadow: '0 40px 90px rgba(0,0,0,.6)', padding: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <MatchAvatar />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block' }}>Gift guide</strong>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--color-muted)' }}>Our gift guide is coming soon. Meanwhile, browse by occasion or our ready hampers.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, border: 0, background: 'rgba(244,237,231,.08)', color: 'var(--color-ivory)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}
      <button type="button" className="guide-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MatchAvatar size={46} />Gift guide
      </button>
    </div>
  );
};

export const GiftingPage: React.FC = () => {
  const { occasion } = useParams();
  const { products, loading } = useCatalog();
  const { occasions, scentFamilies } = useTaxonomy();
  const selected = occasion ? occasions.find((o) => o.slug === occasion) : undefined;
  useDocumentMeta(occasion ? (selected ? `${selected.name} gifts` : 'Page not found') : 'Gifting', selected?.description);
  if (occasion && !selected) return <NotFoundPage />;

  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  const live = withProducts(occasions, products, forOccasion);
  const ready = hampers(products);
  const occasionProducts = selected ? forOccasion(products, selected.slug) : [];
  const heroImage = selected
    ? tileImage(selected, occasionProducts)
    : live[0]
    ? tileImage(live[0], forOccasion(products, live[0].slug))
    : ready.find((p) => p.image)?.image;

  return (
    <>
      <PageHero
        image={heroImage}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Gifting', to: selected ? paths.gifting() : undefined }, ...(selected ? [{ label: selected.name }] : [])]}
        eyebrow={selected ? 'Gifts for the occasion' : 'Shop by occasion'}
        title={selected ? <HeroTitle script={selected.name} after="gifts" /> : <HeroTitle before="The art of" script="gifting" />}
        sub={selected ? selected.description || undefined : 'Hand-wrapped candles and hampers for the moments that matter.'}
        minHeight={540}
      />

      <section className="wrap" style={{ paddingTop: 40 }}>
        <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: '14px 18px', borderRadius: 32, background: 'rgba(92,22,34,.35)' }}>
          <MatchAvatar />
          <span style={{ flex: '1 1 240px' }}>
            <strong>Not sure what to gift?</strong> <span style={{ color: 'var(--color-muted)' }}>Our gift guide is on its way.</span>
          </span>
        </div>
      </section>

      {loading ? (
        <p className="wrap" role="status" style={{ paddingTop: 60, paddingBottom: 110, color: 'var(--color-muted)' }}>Loading…</p>
      ) : selected ? (
        <section className="wrap" style={{ paddingTop: 80, paddingBottom: 110 }}>
          {occasionProducts.length ? <ProductGrid products={occasionProducts} familyNames={familyNames} /> : <EmptyNote>Gifts for {selected.name.toLowerCase()} are being chosen. Please check back soon.</EmptyNote>}
        </section>
      ) : (
        <>
          {live.length > 0 && (
            <section className="wrap" style={{ paddingTop: 80, paddingBottom: 100 }}>
              <SectionHead center eyebrow="Gifting" before="Shop by" script="occasion" />
              <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 20 }}>
                {live.map((o) => <OccasionTile key={o.slug} to={paths.gifting(o.slug)} name={o.name} image={tileImage(o, forOccasion(products, o.slug))} />)}
              </div>
            </section>
          )}
          {ready.length > 0 && (
            <section style={{ background: 'var(--color-ink-2)', marginTop: live.length ? 0 : 80 }}>
              <div className="wrap" style={{ paddingTop: 100, paddingBottom: 110 }}>
                <SectionHead eyebrow="Wrapped and ready to send" before="Ready" script="hampers" />
                <ProductGrid products={ready} familyNames={familyNames} />
              </div>
            </section>
          )}
          {live.length === 0 && ready.length === 0 && (
            <section className="wrap" style={{ paddingTop: 80, paddingBottom: 110 }}>
              <EmptyNote>Our gift edit is being prepared. Please check back soon.</EmptyNote>
            </section>
          )}
        </>
      )}
      <GiftGuide />
    </>
  );
};
