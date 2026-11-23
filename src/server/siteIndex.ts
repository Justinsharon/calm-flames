/**
 * Search-engine surface. Only the public host (PUBLIC_SITE_URL, e.g. https://thecalmflames.com)
 * may be indexed: every other host (Cloud Run *.run.app, staging, previews) gets
 * `robots.txt: Disallow: /` and an `X-Robots-Tag: noindex` header on every response.
 */
import type { Request, Response, NextFunction } from 'express';
import { getAdminDb } from './firestoreAdmin';
import { productFromDoc, isActiveProduct, hasVerifiedPrice } from '../lib/productMapping';
import { pageFromDoc } from '../lib/pages';
import { INFO_PAGE_SLUGS, paths } from '../lib/routes';
import { COLLECTION_SLUGS, SCENT_FAMILY_SLUGS, OCCASION_SLUGS } from '../lib/taxonomy';
import type { Product } from '../types';

/** Normalised public origin ("https://thecalmflames.com"), or null when unset/invalid. */
export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const u = new URL(String(env.PUBLIC_SITE_URL || ''));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Is this request for the indexable public site? (Unset PUBLIC_SITE_URL = nothing is indexable.) */
export function isPublicHost(hostHeader: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const origin = publicOrigin(env);
  if (!origin || !hostHeader) return false;
  return new URL(origin).host.toLowerCase() === hostHeader.toLowerCase();
}

/**
 * The host the visitor used. Behind Firebase Hosting the custom domain arrives in
 * X-Forwarded-Host; directly on Cloud Run it is Host. (A client can spoof X-Forwarded-Host on the
 * run.app URL, but that only changes its own response; crawlers never send it.)
 */
export function requestHost(req: Pick<Request, 'headers'>): string {
  const fwd = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return (fwd || String(req.headers.host || '')).toLowerCase();
}

/** www.<public host> → 301 to the public apex (same path and query). */
export function redirectWwwToApex(req: Request, res: Response, next: NextFunction) {
  const origin = publicOrigin();
  const host = requestHost(req);
  if (origin && host === `www.${new URL(origin).host.toLowerCase()}`) return res.redirect(301, origin + req.originalUrl);
  next();
}

export function noindexOutsidePublicHost(req: Request, res: Response, next: NextFunction) {
  if (!isPublicHost(requestHost(req))) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

export function robotsTxt(publicHost: boolean, origin: string | null): string {
  if (!publicHost || !origin) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /account',
    'Disallow: /sign-in',
    'Disallow: /order/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    ''
  ].join('\n');
}

const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export function sitemapXml(origin: string, entries: { path: string; lastmod?: string }[]): string {
  const seen = new Set<string>();
  const urls = entries
    .filter((e) => !seen.has(e.path) && seen.add(e.path))
    .map((e) => `  <url><loc>${xmlEsc(origin + e.path)}</loc>${e.lastmod && !Number.isNaN(Date.parse(e.lastmod)) ? `<lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * Sitemap paths from Firestore: home + hubs, collections / scent families / occasions that have at
 * least one active product, every active product, published journal stories and info pages.
 */
export async function sitemapEntries(): Promise<{ path: string; lastmod?: string }[]> {
  const db = getAdminDb();
  const [prodSnap, pageSnap] = await Promise.all([db.collection('products').where('isActive', '==', true).get(), db.collection('pages').where('published', '==', true).get()]);
  const products = prodSnap.docs.map((d) => ({ p: productFromDoc(d.id, d.data()), updated: d.data().updatedAt as string | undefined })).filter(({ p }) => isActiveProduct(p));
  const out: { path: string; lastmod?: string }[] = [{ path: '/' }, { path: paths.scent() }, { path: paths.gifting() }, { path: paths.journal() }, { path: paths.support() }];
  const has = (pred: (p: Product) => boolean) => products.some(({ p }) => pred(p));
  for (const c of COLLECTION_SLUGS) if (has((p) => p.collection === c)) out.push({ path: paths.collection(c) });
  for (const f of SCENT_FAMILY_SLUGS) if (has((p) => p.scentFamilySlug === f)) out.push({ path: paths.scent(f) });
  for (const o of OCCASION_SLUGS) if (has((p) => (p.occasions || []).includes(o))) out.push({ path: paths.gifting(o) });
  for (const { p, updated } of products) out.push({ path: paths.product(p), lastmod: updated });
  for (const d of pageSnap.docs) {
    const pg = pageFromDoc(d.id, d.data());
    if (!pg?.published) continue;
    const lastmod = d.data().updatedAt;
    if (pg.type === 'journal') out.push({ path: paths.journal(pg.slug), lastmod });
    else if (pg.type === 'info' && (INFO_PAGE_SLUGS as readonly string[]).includes(pg.slug)) out.push({ path: `/${pg.slug}`, lastmod });
  }
  return out;
}

/** schema.org Product, only for active products with a verified price. */
export function productJsonLd(p: Product, canonicalUrl: string): Record<string, unknown> | null {
  if (!isActiveProduct(p) || !hasVerifiedPrice(p)) return null;
  const images = [p.image, ...(p.galleryImages || [])].filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x));
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.id,
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      price: p.price.toFixed(2),
      priceCurrency: 'INR',
      availability: p.inventoryStatus === 'in_stock' && p.inStock === true ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    }
  };
  if (images.length) ld.image = [...new Set(images)];
  const desc = p.shortDescription || p.description;
  if (desc) ld.description = String(desc).slice(0, 500);
  ld.brand = { '@type': 'Brand', name: 'The Calm Flame' };
  return ld;
}
