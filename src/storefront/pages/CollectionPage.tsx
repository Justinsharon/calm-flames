import React, { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import {
  filterAndSort,
  inCollection,
  inScentFamily,
  priceBuckets,
  sizeOptions,
  tileImage,
  withProducts,
  type SortKey
} from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { useDocumentMeta } from '../hooks/useMotion';
import { PageHero, HeroTitle } from '../components/PageHero';
import { ProductGrid } from '../components/ProductCard';
import { ArchTile } from '../components/Tiles';
import { EmptyNote, SectionHead } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'name', label: 'Name A–Z' }
];

/** Splits "Jar Candles" into "Jar" + script "Candles" for the hero title. */
export function splitTitle(name: string): { before?: string; script: string } {
  const words = name.split(' ');
  if (words.length === 1) return { script: name };
  return { before: words.slice(0, -1).join(' '), script: words[words.length - 1] };
}

export const CollectionPage: React.FC = () => {
  const { slug = '' } = useParams();
  const { products, loading } = useCatalog();
  const { collections, scentFamilies } = useTaxonomy();
  const [params, setParams] = useSearchParams();
  const collection = collections.find((c) => c.slug === slug);
  useDocumentMeta(collection ? `${collection.name} collection` : 'Page not found', collection?.description);

  const all = useMemo(() => inCollection(products, slug), [products, slug]);
  const buckets = useMemo(() => priceBuckets(all), [all]);
  const families = scentFamilies.filter((f) => inScentFamily(all, f.slug).length > 0);
  const sizes = sizeOptions(all);
  const filters = {
    price: params.get('price') || undefined,
    scentFamily: params.get('scent') || undefined,
    size: params.get('size') || undefined,
    inStock: params.get('stock') === '1',
    sort: (params.get('sort') as SortKey) || 'featured'
  };
  const shown = filterAndSort(all, filters, buckets);
  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  const others = withProducts(collections, products, inCollection).filter((c) => c.slug !== slug);

  const set = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (!collection) return <NotFoundPage />;
  const t = splitTitle(collection.name);

  return (
    <>
      <PageHero
        image={tileImage(collection, all)}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Collections' }, { label: collection.name }]}
        eyebrow={`Collection${all.length ? ` · ${all.length} piece${all.length === 1 ? '' : 's'}` : ''}`}
        title={<HeroTitle before={t.before} script={t.script} />}
        sub={collection.description || undefined}
        minHeight={560}
      />

      {all.length > 0 && (
        <section className="wrap" style={{ paddingTop: 40 }}>
          <div className="glass" role="group" aria-label="Filter and sort" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 16px', position: 'relative', zIndex: 5 }}>
            <span className="eyebrow" style={{ margin: '0 8px 0 6px' }}>Filter</span>
            {buckets.length > 0 && (
              <select className={`chip${filters.price ? ' on' : ''}`} aria-label="Price" value={filters.price || ''} onChange={(e) => set('price', e.target.value || undefined)}>
                <option value="">Price</option>
                {buckets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            )}
            {families.length > 1 && (
              <select className={`chip${filters.scentFamily ? ' on' : ''}`} aria-label="Scent family" value={filters.scentFamily || ''} onChange={(e) => set('scent', e.target.value || undefined)}>
                <option value="">Scent family</option>
                {families.map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
              </select>
            )}
            {sizes.length > 1 && (
              <select className={`chip${filters.size ? ' on' : ''}`} aria-label="Size" value={filters.size || ''} onChange={(e) => set('size', e.target.value || undefined)}>
                <option value="">Size</option>
                {sizes.map((s) => <option key={s} value={s}>{s} cm</option>)}
              </select>
            )}
            <button type="button" className={`chip${filters.inStock ? ' on' : ''}`} aria-pressed={filters.inStock} onClick={() => set('stock', filters.inStock ? undefined : '1')}>
              In stock
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-muted)' }} aria-live="polite">
              {shown.length} candle{shown.length === 1 ? '' : 's'}
            </span>
            <select className="chip" aria-label="Sort" value={filters.sort} onChange={(e) => set('sort', e.target.value === 'featured' ? undefined : e.target.value)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
            </select>
          </div>
        </section>
      )}

      <section className="wrap" style={{ paddingTop: 48, paddingBottom: 110 }}>
        {loading ? (
          <p role="status" style={{ color: 'var(--color-muted)' }}>Loading the collection…</p>
        ) : all.length === 0 ? (
          <EmptyNote>New pieces for this collection are on their way.</EmptyNote>
        ) : shown.length === 0 ? (
          <EmptyNote>No candles match these filters.</EmptyNote>
        ) : (
          <ProductGrid products={shown} familyNames={familyNames} />
        )}
      </section>

      {others.length > 0 && (
        <section style={{ background: 'var(--color-ink-2)' }}>
          <div className="wrap" style={{ paddingTop: 100, paddingBottom: 100 }}>
            <SectionHead eyebrow="Keep browsing" before="Explore other" script="collections" />
            <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 26 }}>
              {others.map((c) => (
                <ArchTile key={c.slug} to={paths.collection(c.slug)} name={c.name} image={tileImage(c, inCollection(products, c.slug))} cta="" />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
};
