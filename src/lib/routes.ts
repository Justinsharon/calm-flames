/**
 * Storefront route table (docs/design/DESIGN.md → "Pages and routes"). Pure: shared by the React
 * router, the Express server (index.html fallback + per-URL <title>/description) and tests.
 */
import { matchPath } from 'react-router';

export const INFO_PAGE_SLUGS = ['our-story', 'shipping', 'returns', 'privacy', 'terms', 'corporate'] as const;
export type InfoPageSlug = (typeof INFO_PAGE_SLUGS)[number];

export const INFO_PAGE_TITLES: Record<InfoPageSlug, string> = {
  'our-story': 'Our Story',
  shipping: 'Shipping',
  returns: 'Returns',
  privacy: 'Privacy',
  terms: 'Terms',
  corporate: 'Corporate gifting'
};

export type RouteName =
  | 'home'
  | 'collection'
  | 'product'
  | 'scent'
  | 'scentFamily'
  | 'gifting'
  | 'occasion'
  | 'journal'
  | 'article'
  | 'info'
  | 'support'
  | 'cart'
  | 'buildBox'
  | 'checkout'
  | 'orderConfirmed'
  | 'signIn'
  | 'account';

/** Order matters only for readability: patterns do not overlap. */
export const ROUTES: { name: RouteName; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'collection', path: '/collections/:slug' },
  { name: 'product', path: '/products/:slug' },
  { name: 'scent', path: '/scent' },
  { name: 'scentFamily', path: '/scent/:family' },
  { name: 'gifting', path: '/gifting' },
  { name: 'occasion', path: '/gifting/:occasion' },
  { name: 'journal', path: '/journal' },
  { name: 'article', path: '/journal/:slug' },
  ...INFO_PAGE_SLUGS.map((s) => ({ name: 'info' as const, path: `/${s}` })),
  { name: 'support', path: '/support' },
  { name: 'cart', path: '/cart' },
  { name: 'buildBox', path: '/build-a-box' },
  { name: 'checkout', path: '/checkout' },
  { name: 'orderConfirmed', path: '/order/:id/confirmed' },
  { name: 'signIn', path: '/sign-in' },
  { name: 'account', path: '/account' }
];

export interface RouteMatch {
  name: RouteName;
  params: Record<string, string>;
}

/** Match a pathname to a storefront route; null = 404. Trailing slashes are tolerated. */
export function matchRoute(pathname: string): RouteMatch | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const r of ROUTES) {
    const m = matchPath({ path: r.path, end: true }, clean);
    if (m) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.params)) {
        if (typeof v !== 'string') continue;
        try {
          params[k] = decodeURIComponent(v);
        } catch {
          params[k] = v; // malformed %-escape: keep as-is (it will simply not match any doc)
        }
      }
      if (r.name === 'info') params.slug = clean.slice(1);
      return { name: r.name, params };
    }
  }
  return null;
}

/** API paths are never served the SPA. */
export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

// ---- link builders ----
export const paths = {
  home: () => '/',
  collection: (slug: string) => `/collections/${encodeURIComponent(slug)}`,
  product: (p: { slug?: string; id: string }) => `/products/${encodeURIComponent(p.slug || p.id)}`,
  scent: (family?: string) => (family ? `/scent/${encodeURIComponent(family)}` : '/scent'),
  gifting: (occasion?: string) => (occasion ? `/gifting/${encodeURIComponent(occasion)}` : '/gifting'),
  journal: (slug?: string) => (slug ? `/journal/${encodeURIComponent(slug)}` : '/journal'),
  info: (slug: InfoPageSlug) => `/${slug}`,
  support: () => '/support',
  cart: () => '/cart',
  buildBox: () => '/build-a-box',
  checkout: () => '/checkout',
  signIn: (next?: string) => (next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'),
  account: (tab?: 'favourites' | 'orders' | 'addresses') => (tab ? `/account?tab=${tab}` : '/account'),
  /** The view token goes in the #fragment: never sent to the server in the URL or logged. */
  orderConfirmed: (orderNumber: string, token?: string) =>
    `/order/${encodeURIComponent(orderNumber)}/confirmed${token ? `#t=${encodeURIComponent(token)}` : ''}`
};

export const SITE_NAME = 'The Calm Flame';
export const DEFAULT_DESCRIPTION =
  "Handcrafted candles rooted in India's botanical heritage. Natural wax and pure botanicals, poured by hand in small batches.";

export function pageTitle(title?: string): string {
  return title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} · Handcrafted candles from India`;
}

/** Plain-text description, trimmed to ~160 characters on a word boundary. */
export function metaDescription(text?: string | null): string {
  const t = (text || '').replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return DEFAULT_DESCRIPTION;
  if (t.length <= 160) return t;
  const cut = t.slice(0, 157);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 120))}…`;
}
