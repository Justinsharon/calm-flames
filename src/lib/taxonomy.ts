/**
 * Fixed taxonomy slugs for the product data model. The editable details (name, description,
 * header image, sort order) live in Firestore docs `collections/{slug}`, `scentFamilies/{slug}`
 * and `occasions/{slug}`; these lists only define which slugs exist. Keep in sync with
 * firestore.rules.
 */
export const COLLECTION_SLUGS = [
  'pillar-sculptural',
  'jar-candles',
  'coconut-shell',
  'urli-centrepieces',
  'floral-bouquets'
] as const;
export type CollectionSlug = (typeof COLLECTION_SLUGS)[number];

export const SCENT_FAMILY_SLUGS = [
  'indian-botanical',
  'floral',
  'gourmand',
  'spicy-resinous',
  'luxury-woody',
  'fresh-citrus'
] as const;
export type ScentFamilySlug = (typeof SCENT_FAMILY_SLUGS)[number];

export const OCCASION_SLUGS = ['christmas', 'birthday', 'wedding', 'housewarming', 'corporate'] as const;
export type OccasionSlug = (typeof OCCASION_SLUGS)[number];

/** Merchandising badges allowed in `tags` by the import script and the admin editor. */
export const PRODUCT_BADGE_TAGS = ['bestseller', 'new', 'limited'] as const;
export type ProductBadgeTag = (typeof PRODUCT_BADGE_TAGS)[number];

export type TaxonomyKind = 'collections' | 'scentFamilies' | 'occasions';
export const TAXONOMY_SLUGS: Record<TaxonomyKind, readonly string[]> = {
  collections: COLLECTION_SLUGS,
  scentFamilies: SCENT_FAMILY_SLUGS,
  occasions: OCCASION_SLUGS
};

/** Shape of a taxonomy doc, e.g. `collections/jar-candles`. */
export interface TaxonomyDoc {
  slug: string;
  name: string;
  description?: string;
  headerImage?: string;
  sortOrder: number;
}

/**
 * Display names used only to seed the taxonomy docs once (scripts/seed-taxonomy.ts). After that
 * the owner edits them in the admin dashboard. Descriptions and header images start empty.
 */
export const TAXONOMY_SEED_NAMES: Record<TaxonomyKind, Record<string, string>> = {
  collections: {
    'pillar-sculptural': 'Pillar & Sculptural',
    'jar-candles': 'Jar Candles',
    'coconut-shell': 'Coconut Shell',
    'urli-centrepieces': 'Urli Centrepieces',
    'floral-bouquets': 'Floral Bouquets'
  },
  scentFamilies: {
    'indian-botanical': 'Indian Botanical',
    floral: 'Floral',
    gourmand: 'Gourmand',
    'spicy-resinous': 'Spicy & Resinous',
    'luxury-woody': 'Luxury Woody',
    'fresh-citrus': 'Fresh Citrus'
  },
  occasions: {
    christmas: 'Christmas',
    birthday: 'Birthday',
    wedding: 'Wedding',
    housewarming: 'Housewarming',
    corporate: 'Corporate'
  }
};

/**
 * Existing products store `scentFamily` as a display label ('Floral', 'Woody', ...) used by the
 * current storefront filter. New products store a slug. Both are accepted; these maps translate.
 */
export const LEGACY_SCENT_TO_SLUG: Record<string, ScentFamilySlug | undefined> = {
  Floral: 'floral',
  Woody: 'luxury-woody',
  Citrus: 'fresh-citrus',
  Spiced: 'spicy-resinous',
  Earthy: undefined
};
export const SLUG_TO_LEGACY_SCENT: Record<ScentFamilySlug, 'Floral' | 'Woody' | 'Citrus' | 'Spiced' | undefined> = {
  floral: 'Floral',
  'luxury-woody': 'Woody',
  'fresh-citrus': 'Citrus',
  'spicy-resinous': 'Spiced',
  'indian-botanical': undefined,
  gourmand: undefined
};

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}
