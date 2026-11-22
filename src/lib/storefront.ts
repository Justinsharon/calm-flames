/**
 * Pure storefront data mapping. Everything shown on the new site is derived here from Firestore
 * data (products via CatalogContext, taxonomy docs, pages). No sample data; empty in = empty out,
 * and callers hide a section when its list is empty.
 */
import type { Product } from '../types';
import { hasVerifiedPrice } from './productMapping';
import {
  COLLECTION_SLUGS,
  SCENT_FAMILY_SLUGS,
  OCCASION_SLUGS,
  TAXONOMY_SEED_NAMES,
  type TaxonomyDoc,
  type TaxonomyKind
} from './taxonomy';

export interface TaxonomyItem {
  slug: string;
  name: string;
  description: string;
  headerImage?: string;
  sortOrder: number;
}

/**
 * Taxonomy for display: the fixed slugs, with name/description/image from the Firestore docs.
 * Before the docs are seeded, the slug's built-in name is used (no description, no image).
 */
export function resolveTaxonomy(kind: TaxonomyKind, docs: TaxonomyDoc[]): TaxonomyItem[] {
  const slugs: readonly string[] = kind === 'collections' ? COLLECTION_SLUGS : kind === 'scentFamilies' ? SCENT_FAMILY_SLUGS : OCCASION_SLUGS;
  return slugs
    .map((slug, i) => {
      const d = docs.find((x) => x.slug === slug);
      return {
        slug,
        name: d?.name?.trim() || TAXONOMY_SEED_NAMES[kind][slug] || slug,
        description: d?.description?.trim() || '',
        headerImage: d?.headerImage || undefined,
        sortOrder: typeof d?.sortOrder === 'number' ? d.sortOrder : i
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---- prices ----
export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** Unpriced products never get an Add to cart button; out-of-stock ones neither. */
export function canAddToCart(p: Product): boolean {
  return hasVerifiedPrice(p) && p.isActive !== false && !p.isHistorical && p.inventoryStatus !== 'out_of_stock';
}

export function priceLabel(p: Product): string {
  return hasVerifiedPrice(p) ? formatInr(p.price) : 'Price coming soon';
}

// ---- product groupings ----
export const BADGE_LABELS: Record<string, string> = { bestseller: 'Bestseller', new: 'New', limited: 'Limited' };

/** First merchandising badge on a product (bestseller > new > limited). */
export function productBadge(p: Product): string | null {
  const tags = (p.tags || []).map((t) => t.toLowerCase());
  for (const b of ['bestseller', 'new', 'limited']) if (tags.includes(b)) return BADGE_LABELS[b];
  return null;
}

export function withTag(products: Product[], tag: string): Product[] {
  return products.filter((p) => (p.tags || []).some((t) => t.toLowerCase() === tag));
}

export function inCollection(products: Product[], slug: string): Product[] {
  return products.filter((p) => p.collection === slug);
}

export function inScentFamily(products: Product[], slug: string): Product[] {
  return products.filter((p) => p.scentFamilySlug === slug);
}

export function forOccasion(products: Product[], slug: string): Product[] {
  return products.filter((p) => (p.occasions || []).includes(slug as any));
}

/** Ready hampers: tagged `hamper`, or catalogued as Gifting / Hampers. */
export function hampers(products: Product[]): Product[] {
  return products.filter(
    (p) =>
      (p.tags || []).some((t) => t.toLowerCase() === 'hamper' || t.toLowerCase() === 'hampers') ||
      p.primaryCategory === 'Gifting' ||
      (p.subcategory || '').toLowerCase() === 'hampers'
  );
}

/** Only taxonomy entries that have at least one live product. */
export function withProducts<T extends { slug: string }>(items: T[], products: Product[], pick: (ps: Product[], slug: string) => Product[]): T[] {
  return items.filter((i) => pick(products, i.slug).length > 0);
}

/** Image for a taxonomy tile: its own header image, else the first product photo in it. */
export function tileImage(item: TaxonomyItem, products: Product[]): string | undefined {
  return item.headerImage || products.find((p) => p.image)?.image || undefined;
}

/** Most common top/heart notes across products (for scent chips and the botanicals strip). */
export function commonNotes(products: Product[], limit = 4): string[] {
  const counts = new Map<string, { n: number; label: string }>();
  for (const p of products) {
    const n = p.notes || p.scentNotes;
    for (const note of [...(n?.top || []), ...(n?.heart || [])]) {
      const label = note.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const cur = counts.get(key);
      counts.set(key, { n: (cur?.n || 0) + 1, label: cur?.label || label });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, limit).map((c) => c.label);
}

/** "Floral · rose, neroli" style subtitle from real fields only. */
export function productSubtitle(p: Product, familyName?: string): string {
  const notes = (p.notes?.top || p.scentNotes?.top || []).slice(0, 2).map((n) => n.toLowerCase());
  const parts = [familyName || p.scentFamily, notes.join(', ')].filter(Boolean);
  return parts.join(' · ');
}

export function findProductBySlug(products: Product[], slug: string): Product | undefined {
  const s = decodeURIComponent(slug);
  return products.find((p) => p.slug === s) || products.find((p) => p.id === s);
}

/** Same collection first, then same scent family; never the product itself. */
export function relatedProducts(products: Product[], p: Product, limit = 4): Product[] {
  const others = products.filter((x) => x.id !== p.id);
  const same = others.filter((x) => p.collection && x.collection === p.collection);
  const fam = others.filter((x) => p.scentFamilySlug && x.scentFamilySlug === p.scentFamilySlug && !same.includes(x));
  return [...same, ...fam].slice(0, limit);
}

// ---- collection filters ----
export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';

export interface ProductFilters {
  price?: string; // bucket id from priceBuckets()
  scentFamily?: string;
  size?: string;
  inStock?: boolean;
  sort?: SortKey;
}

export interface PriceBucket {
  id: string;
  label: string;
  min: number;
  max: number; // inclusive upper bound; Infinity for the last
}

/**
 * Price ranges derived from the prices actually in the list (thirds, rounded to ₹100).
 * Empty when fewer than two products are priced, so the filter hides itself.
 */
export function priceBuckets(products: Product[]): PriceBucket[] {
  const prices = products.filter(hasVerifiedPrice).map((p) => p.price).sort((a, b) => a - b);
  if (prices.length < 2 || prices[0] === prices[prices.length - 1]) return [];
  const round = (n: number) => Math.max(100, Math.round(n / 100) * 100);
  const a = round(prices[Math.floor(prices.length / 3)]);
  const b = round(prices[Math.floor((prices.length * 2) / 3)]);
  const cuts = [...new Set([a, b])].sort((x, y) => x - y);
  const buckets: PriceBucket[] = [];
  let lo = 0;
  for (const c of cuts) {
    buckets.push({ id: `${lo}-${c}`, label: lo === 0 ? `Under ${formatInr(c)}` : `${formatInr(lo)} – ${formatInr(c)}`, min: lo, max: c - 0.01 });
    lo = c;
  }
  buckets.push({ id: `${lo}-up`, label: `${formatInr(lo)} and above`, min: lo, max: Infinity });
  return buckets;
}

export function sizeOptions(products: Product[]): string[] {
  return [...new Set(products.map((p) => p.sizeCm).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export function filterAndSort(products: Product[], f: ProductFilters, buckets: PriceBucket[] = priceBuckets(products)): Product[] {
  let list = products;
  if (f.price) {
    const b = buckets.find((x) => x.id === f.price);
    if (b) list = list.filter((p) => hasVerifiedPrice(p) && p.price >= b.min && p.price <= b.max);
  }
  if (f.scentFamily) list = list.filter((p) => p.scentFamilySlug === f.scentFamily);
  if (f.size) list = list.filter((p) => p.sizeCm === f.size);
  if (f.inStock) list = list.filter((p) => p.inStock === true && p.inventoryStatus === 'in_stock');
  const byOrder = (a: Product, b: Product) =>
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
  const sorted = [...list];
  switch (f.sort) {
    case 'price-asc':
    case 'price-desc': {
      const dir = f.sort === 'price-asc' ? 1 : -1;
      // unpriced always last
      sorted.sort((a, b) => {
        const pa = hasVerifiedPrice(a), pb = hasVerifiedPrice(b);
        if (pa !== pb) return pa ? -1 : 1;
        return pa ? dir * (a.price - b.price) || byOrder(a, b) : byOrder(a, b);
      });
      break;
    }
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort(byOrder);
  }
  return sorted;
}
