import React, { useState } from 'react';
import { GiftGuide } from '../components/GiftGuide';
import { useParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { forOccasion, hampers, tileImage, withProducts } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { useDocumentMeta } from '../hooks/useMotion';
import { PageHero, HeroTitle } from '../components/PageHero';
import { ProductGrid } from '../components/ProductCard';
import { OccasionTile } from '../components/Tiles';
import { Button, EmptyNote, MatchAvatar, SectionHead } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

export const GiftingPage: React.FC = () => {
  const { occasion } = useParams();
  const [guideOpen, setGuideOpen] = useState(false);
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
            <strong>Not sure what to gift?</strong> <span style={{ color: 'var(--color-muted)' }}>Tell our gift guide who it's for.</span>
          </span>
          <Button variant="out" onClick={() => setGuideOpen(true)}>Ask the gift guide</Button>
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
      <GiftGuide open={guideOpen} setOpen={setGuideOpen} />
    </>
  );
};
