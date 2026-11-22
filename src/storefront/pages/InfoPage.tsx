import React from 'react';
import { Link, useLocation } from 'react-router';
import { INFO_PAGE_SLUGS, INFO_PAGE_TITLES, paths, type InfoPageSlug } from '../../lib/routes';
import { Markdown } from '../../lib/markdown';
import { useDocumentMeta } from '../hooks/useMotion';
import { usePage, usePublishedPages } from '../hooks/usePages';
import { PageHero, HeroTitle } from '../components/PageHero';
import { EmptyNote } from '../components/ui';
import { splitTitle } from './CollectionPage';

/**
 * One template for /our-story, /shipping, /returns, /privacy, /terms, /corporate.
 * Text comes only from the owner's published `pages/{slug}` doc; until then the page says so
 * (no placeholder policy wording is ever shown).
 */
export const InfoPage: React.FC = () => {
  const slug = useLocation().pathname.replace(/^\/|\/$/g, '') as InfoPageSlug;
  const { page, loading } = usePage(slug);
  const { pages: published } = usePublishedPages('info');
  const title = page?.title || INFO_PAGE_TITLES[slug] || 'Information';
  useDocumentMeta(title, page?.summary || page?.body);
  const t = splitTitle(title);
  const publishedSlugs = new Set(published.map((p) => p.slug));

  return (
    <>
      <PageHero
        image={page?.heroImage}
        crumbs={[{ label: 'Home', to: paths.home() }, { label: title }]}
        eyebrow={page?.eyebrow || 'Help & info'}
        title={<HeroTitle before={t.before} script={t.script} />}
        sub={page?.summary}
        minHeight={460}
      />
      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 110 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start' }}>
          <nav aria-label="Information pages" className="glass" style={{ flex: '1 1 220px', position: 'sticky', top: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {INFO_PAGE_SLUGS.filter((s) => s === slug || publishedSlugs.has(s)).map((s) => (
              <Link key={s} to={paths.info(s)} aria-current={s === slug ? 'page' : undefined}
                style={{ padding: '10px 14px', borderRadius: 12, textDecoration: 'none', fontSize: 15, background: s === slug ? 'rgba(244,237,231,.1)' : undefined }}>
                {published.find((p) => p.slug === s)?.title || INFO_PAGE_TITLES[s]}
              </Link>
            ))}
            <Link to={paths.support()} style={{ padding: '10px 14px', borderRadius: 12, textDecoration: 'none', fontSize: 15 }}>Help &amp; Support</Link>
          </nav>
          <div style={{ flex: '999 1 560px', minWidth: 0 }}>
            {loading ? (
              <p role="status" style={{ color: 'var(--color-muted)' }}>Loading…</p>
            ) : page ? (
              <article className="glass" style={{ padding: 'clamp(26px, 3.5vw, 44px)' }}>
                <Markdown source={page.body} />
              </article>
            ) : (
              <EmptyNote>This page is being written. For anything urgent, visit <Link className="lnk" to={paths.support()}>Help &amp; Support</Link>.</EmptyNote>
            )}
          </div>
        </div>
      </section>
    </>
  );
};
