/**
 * Server-side <title> / meta description / Open Graph tags for shareable storefront URLs.
 * The SPA renders the page; this only makes links previewable and indexable. Unknown routes
 * and unknown products/collections get HTTP 404 (the SPA shows its 404 page).
 */
import { matchRoute, pageTitle, metaDescription, INFO_PAGE_TITLES, type InfoPageSlug, DEFAULT_DESCRIPTION } from '../lib/routes';
import { getAdminDb } from './firestoreAdmin';
import { productJsonLd } from './siteIndex';
import { productFromDoc, isActiveProduct } from '../lib/productMapping';
import { pageFromDoc } from '../lib/pages';
import { TAXONOMY_SEED_NAMES, isOneOf, COLLECTION_SLUGS, SCENT_FAMILY_SLUGS, OCCASION_SLUGS, type TaxonomyKind } from '../lib/taxonomy';

export interface PageMeta {
  status: number;
  title: string;
  description: string;
  image?: string;
  /** Set on product pages (for JSON-LD). */
  product?: import('../types').Product;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Replace title/description/og tags in the built index.html (pure). */
export function injectMeta(template: string, meta: PageMeta, opts: { canonicalUrl?: string } = {}): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`);
  if (meta.image && /^https?:\/\//.test(meta.image)) {
    html = html.replace('</head>', `    <meta property="og:image" content="${escapeHtml(meta.image)}" />\n  </head>`);
  }
  if (opts.canonicalUrl && meta.status === 200) {
    const c = escapeHtml(opts.canonicalUrl);
    html = html.replace('</head>', `    <link rel="canonical" href="${c}" />\n    <meta property="og:url" content="${c}" />\n  </head>`);
  }
  if (meta.product && meta.status === 200) {
    const ld = productJsonLd(meta.product, opts.canonicalUrl || '');
    if (ld) {
      if (!opts.canonicalUrl) {
        delete ld.url;
        delete (ld.offers as any).url;
      }
      // JSON inside <script>: escape "<" so no value can close the tag.
      const json = JSON.stringify(ld).replace(/</g, '\\u003c');
      html = html.replace('</head>', `    <script type="application/ld+json">${json}</script>\n  </head>`);
    }
  }
  return html;
}

async function taxonomyMeta(kind: TaxonomyKind, slug: string, allowed: readonly string[], suffix: string): Promise<PageMeta> {
  if (!isOneOf(allowed, slug)) return { status: 404, title: pageTitle('Page not found'), description: DEFAULT_DESCRIPTION };
  let name = TAXONOMY_SEED_NAMES[kind][slug];
  let description = '';
  let image: string | undefined;
  try {
    const d = (await getAdminDb().collection(kind).doc(slug).get()).data();
    if (d?.name) name = d.name;
    if (d?.description) description = d.description;
    if (d?.headerImage) image = d.headerImage;
  } catch {
    /* fall back to built-in name */
  }
  return { status: 200, title: pageTitle(`${name}${suffix}`), description: metaDescription(description), image };
}

export async function resolveMeta(pathname: string): Promise<PageMeta> {
  const m = matchRoute(pathname);
  const notFound: PageMeta = { status: 404, title: pageTitle('Page not found'), description: DEFAULT_DESCRIPTION };
  if (!m) return notFound;
  const base = (title?: string, description?: string): PageMeta => ({ status: 200, title: pageTitle(title), description: metaDescription(description) });
  try {
    switch (m.name) {
      case 'home':
        return base();
      case 'product': {
        const db = getAdminDb();
        const slug = m.params.slug;
        let snap = (await db.collection('products').where('slug', '==', slug).limit(1).get()).docs[0];
        if (!snap) {
          const byId = await db.collection('products').doc(slug).get();
          if (byId.exists) snap = byId as any;
        }
        if (!snap) return notFound;
        const p = productFromDoc(snap.id, snap.data()!);
        if (!isActiveProduct(p)) return notFound;
        return { status: 200, title: pageTitle(p.name), description: metaDescription(p.shortDescription || p.description || p.tagline), image: p.image || undefined, product: p };
      }
      case 'collection':
        return taxonomyMeta('collections', m.params.slug, COLLECTION_SLUGS, ' collection');
      case 'scent':
        return base('Shop by Scent');
      case 'scentFamily':
        return taxonomyMeta('scentFamilies', m.params.family, SCENT_FAMILY_SLUGS, ' scents');
      case 'gifting':
        return base('Gifting');
      case 'occasion':
        return taxonomyMeta('occasions', m.params.occasion, OCCASION_SLUGS, ' gifts');
      case 'journal':
        return base('Journal');
      case 'article':
      case 'info': {
        const slug = m.params.slug;
        const page = pageFromDoc(slug, (await getAdminDb().collection('pages').doc(slug).get()).data());
        if (m.name === 'article' && (!page || !page.published || page.type !== 'journal')) return notFound;
        if (page && page.published) return { status: 200, title: pageTitle(page.title), description: metaDescription(page.summary || page.body), image: page.heroImage };
        return base(INFO_PAGE_TITLES[slug as InfoPageSlug]);
      }
      case 'support':
        return base('Help & Support');
      case 'cart':
        return base('Your cart');
      case 'checkout':
        return base('Checkout');
      case 'signIn':
        return base('Sign in', 'Sign in with Google to keep your favourites and orders in one place.');
      case 'account':
        return base('Your account');
      case 'orderConfirmed':
        // Never reveal anything about the order in the HTML (the page loads it with its token).
        return base('Order confirmed');
      case 'buildBox': {
        // Hidden until the owner configures it in settings/store.
        const snap = await getAdminDb().collection('settings').doc('store').get();
        const { getBuildABoxConfig, parseStoreSettings } = await import('../lib/storeSettings');
        if (!getBuildABoxConfig(parseStoreSettings(snap.exists ? snap.data() : {}))) return notFound;
        return base('Build a Box', 'Choose a box, fill it with the candles you love, and we wrap it by hand with a handwritten note.');
      }
    }
  } catch {
    // Firestore unreachable: serve the page with default tags rather than failing.
    return base();
  }
  return base();
}
