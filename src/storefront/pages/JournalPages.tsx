import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { readingMinutes } from '../../lib/pages';
import { paths } from '../../lib/routes';
import { Markdown } from '../../lib/markdown';
import { useDocumentMeta } from '../hooks/useMotion';
import { usePage, usePublishedPages } from '../hooks/usePages';
import { PageHero, HeroTitle } from '../components/PageHero';
import { ProductGrid } from '../components/ProductCard';
import { EmptyNote } from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

export const JournalPage: React.FC = () => {
  useDocumentMeta('Journal', 'Slow living, scent and the botanical heritage behind every candle.');
  const { pages, loading } = usePublishedPages('journal');
  const [params, setParams] = useSearchParams();
  const cat = params.get('category') || '';
  const categories = [...new Set(pages.map((p) => p.category).filter((c): c is string => Boolean(c)))];
  const list = cat ? pages.filter((p) => p.category === cat) : pages;
  const [featured, ...rest] = list;

  return (
    <>
      <PageHero
        image={pages.find((p) => p.heroImage)?.heroImage}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Journal' }]}
        eyebrow="Stories & rituals"
        title={<HeroTitle before="The" script="Journal" />}
        sub="Slow living, scent and the botanical heritage behind every candle."
      />
      {categories.length > 1 && (
        <section className="wrap" style={{ paddingTop: 48 }}>
          <div role="group" aria-label="Filter stories" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" className={`chip${!cat ? ' on' : ''}`} aria-pressed={!cat} onClick={() => setParams({}, { replace: true })}>All</button>
            {categories.map((c) => (
              <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setParams({ category: c }, { replace: true })}>{c}</button>
            ))}
          </div>
        </section>
      )}
      <section className="wrap" style={{ paddingTop: 40, paddingBottom: 110 }}>
        {loading ? (
          <p role="status" style={{ color: 'var(--color-muted)' }}>Loading…</p>
        ) : !featured ? (
          <EmptyNote>Our first stories are being written.</EmptyNote>
        ) : (
          <>
            <Link to={paths.journal(featured.slug)} className="glass tilt" style={{ display: 'flex', flexWrap: 'wrap', overflow: 'hidden', padding: 0, marginBottom: 36 }}>
              {featured.heroImage && <img src={featured.heroImage} alt="" style={{ flex: '1 1 480px', minWidth: 0, height: 420, objectFit: 'cover', display: 'block' }} />}
              <span style={{ flex: '1 1 340px', padding: 'clamp(28px, 4vw, 56px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
                <span className="eyebrow" style={{ margin: 0 }}>{['Featured', featured.category, `${readingMinutes(featured)} min read`].filter(Boolean).join(' · ')}</span>
                <span className="serif" style={{ fontSize: 'clamp(2rem, 4vw, 44px)', lineHeight: 1.1 }}>{featured.title}</span>
                {featured.summary && <span style={{ color: 'var(--color-muted)' }}>{featured.summary}</span>}
                <span className="lnk">Read the story →</span>
              </span>
              <span className="shine" aria-hidden="true" />
            </Link>
            {rest.length > 0 && (
              <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
                {rest.map((s) => (
                  <Link key={s.slug} to={paths.journal(s.slug)} className="tilt" style={{ borderRadius: 18 }}>
                    <div style={{ overflow: 'hidden', borderRadius: 18, position: 'relative', background: 'var(--color-ink-2)', height: 250 }}>
                      {s.heroImage && <img src={s.heroImage} alt="" loading="lazy" style={{ width: '100%', height: 250, objectFit: 'cover', display: 'block' }} />}
                      <span className="shine" aria-hidden="true" />
                    </div>
                    <span style={{ display: 'block', paddingTop: 16, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                      {[s.category, `${readingMinutes(s)} min`].filter(Boolean).join(' · ')}
                    </span>
                    <span className="serif" style={{ display: 'block', fontSize: 27, lineHeight: 1.2, marginTop: 6 }}>{s.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
};

export const ArticlePage: React.FC = () => {
  const { slug } = useParams();
  const { page, loading } = usePage(slug);
  const { products } = useCatalog();
  const { scentFamilies } = useTaxonomy();
  const article = page && page.type === 'journal' ? page : null;
  useDocumentMeta(article?.title || (loading ? 'Journal' : 'Page not found'), article?.summary || article?.body);
  if (loading) return <p className="wrap" role="status" style={{ paddingTop: 160, paddingBottom: 200, color: 'var(--color-muted)' }}>Loading…</p>;
  if (!article) return <NotFoundPage />;
  const featured = (article.productIds || []).map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  return (
    <>
      <PageHero
        image={article.heroImage}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Journal', to: paths.journal() }, { label: article.title }]}
        eyebrow={[article.category, `${readingMinutes(article)} min read`].filter(Boolean).join(' · ')}
        title={article.title}
        sub={article.summary}
      />
      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 110 }}>
        <article style={{ maxWidth: 820, margin: '0 auto' }}>
          <Markdown source={article.body} />
          {featured.length > 0 && (
            <>
              <h2 className="serif" style={{ fontWeight: 400, fontSize: 32, margin: '48px 0 24px' }}>
                Candles in this <span className="script" style={{ color: 'var(--color-rose)' }}>story</span>
              </h2>
              <ProductGrid products={featured} familyNames={familyNames} />
            </>
          )}
        </article>
      </section>
    </>
  );
};
