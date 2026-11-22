import React from 'react';
import { Link, useParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { commonNotes, inScentFamily, tileImage, withProducts } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { useDocumentMeta, usePointerParallax } from '../hooks/useMotion';
import { PageHero, HeroTitle } from '../components/PageHero';
import { ProductGrid } from '../components/ProductCard';
import { ScentChip } from '../components/Tiles';
import { EmptyNote } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

/**
 * /scent and /scent/:family. Families come from the taxonomy docs; only families with live
 * products are listed. "Signature blends" (recipes with %) is not rendered: there is no data
 * source for blend recipes yet.
 */
export const ScentPage: React.FC = () => {
  const { family } = useParams();
  const { products, loading } = useCatalog();
  const { scentFamilies } = useTaxonomy();
  const tilt = usePointerParallax<HTMLDivElement>();
  const live = withProducts(scentFamilies, products, inScentFamily);
  const unknown = family && !scentFamilies.some((f) => f.slug === family);
  const selected = family ? scentFamilies.find((f) => f.slug === family) : live[0];
  useDocumentMeta(family ? (selected ? `${selected.name} scents` : 'Page not found') : 'Shop by Scent', selected?.description);
  if (unknown) return <NotFoundPage />;

  const inFamily = selected ? inScentFamily(products, selected.slug) : [];
  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  const heroImage = live[0] ? tileImage(live[0], inScentFamily(products, live[0].slug)) : undefined;

  return (
    <>
      <PageHero
        image={heroImage}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Shop by Scent', to: family ? paths.scent() : undefined }, ...(family && selected ? [{ label: selected.name }] : [])]}
        eyebrow="Fragrance families"
        title={<HeroTitle before="Shop by" script="Scent" />}
        sub="Every candle is made from real essential oils and botanicals. Start with how you want the room to feel."
      />

      {loading ? (
        <p className="wrap" role="status" style={{ paddingTop: 48, paddingBottom: 110, color: 'var(--color-muted)' }}>Loading…</p>
      ) : live.length === 0 ? (
        <section className="wrap" style={{ paddingTop: 48, paddingBottom: 110 }}>
          <EmptyNote>Our scent families are being catalogued. Please check back soon.</EmptyNote>
        </section>
      ) : (
        <>
          <section className="wrap" style={{ paddingTop: 48 }}>
            <nav aria-label="Scent families" className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {live.map((f) => {
                const ps = inScentFamily(products, f.slug);
                return <ScentChip key={f.slug} to={paths.scent(f.slug)} name={f.name} notes={commonNotes(ps, 3)} image={tileImage(f, ps)} active={selected?.slug === f.slug} />;
              })}
            </nav>
          </section>

          {selected && (
            <section className="wrap" style={{ paddingTop: 56, paddingBottom: 90, perspective: 1000 }}>
              <div
                ref={tilt.ref}
                className="glass"
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'center', padding: 'clamp(28px, 4vw, 56px)',
                  background: 'linear-gradient(135deg, rgba(123,30,46,.5), rgba(92,22,34,.2))',
                  transform: `translate3d(${(tilt.pos.x * 12).toFixed(1)}px,0,0) rotateY(${(tilt.pos.x * 3).toFixed(2)}deg) rotateX(${(tilt.pos.y * -2).toFixed(2)}deg)`,
                  transition: 'transform 1s var(--ease-soft)'
                }}
              >
                <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                  <p className="eyebrow">{inFamily.length} candle{inFamily.length === 1 ? '' : 's'}</p>
                  <h2 className="serif" style={{ margin: '0 0 18px', fontWeight: 400, fontSize: 'clamp(2.6rem, 5vw, 72px)', lineHeight: 1 }}>
                    <span className="script" style={{ color: 'var(--color-rose)', fontSize: '1.15em' }}>{selected.name}</span>
                  </h2>
                  {selected.description && <p style={{ margin: '0 0 14px', fontSize: 18, color: 'var(--color-ivory-2)', maxWidth: 480 }}>{selected.description}</p>}
                  {commonNotes(inFamily, 5).length > 0 && (
                    <p style={{ margin: 0, fontSize: 13, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-taupe)' }}>{commonNotes(inFamily, 5).join(' · ')}</p>
                  )}
                </div>
                {tileImage(selected, inFamily) && (
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <img src={tileImage(selected, inFamily)} alt="" style={{ width: '100%', height: 340, objectFit: 'cover', borderRadius: '200px 200px 18px 18px', boxShadow: '0 40px 70px -20px rgba(0,0,0,.7)' }} />
                  </div>
                )}
              </div>
            </section>
          )}

          {selected && (
            <section className="wrap" style={{ paddingBottom: 110 }}>
              <h2 className="h-section" style={{ marginBottom: 40, fontSize: 'clamp(2.2rem, 4vw, 56px)' }}>
                <span className="script accent" style={{ fontSize: '1.2em' }}>{selected.name}</span> candles
              </h2>
              {inFamily.length ? <ProductGrid products={inFamily} familyNames={familyNames} /> : <EmptyNote>No candles in this family yet. <Link className="lnk" to={paths.scent()}>See all scents</Link></EmptyNote>}
            </section>
          )}
        </>
      )}
    </>
  );
};
