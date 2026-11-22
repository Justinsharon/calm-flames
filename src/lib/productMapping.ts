/**
 * Pure (SDK-free) mapping between Firestore `products/{id}` documents and the storefront `Product`
 * type. Shared by the browser, the server and the migration script so all three agree on what
 * "priced", "active" and "buyable" mean.
 */
import type { Product, BrandCategoryKey, MoodKey } from '../types';
import {
  COLLECTION_SLUGS,
  SCENT_FAMILY_SLUGS,
  OCCASION_SLUGS,
  LEGACY_SCENT_TO_SLUG,
  SLUG_TO_LEGACY_SCENT,
  isOneOf,
  type CollectionSlug,
  type ScentFamilySlug,
  type OccasionSlug
} from './taxonomy';

export interface ScentNotesDoc {
  top?: string[];
  heart?: string[];
  base?: string[];
}

/** Shape of a document in Firestore `products/{id}` (single source of truth for the catalogue). */
export interface ProductDoc {
  id: string;
  slug: string;
  name: string;
  sku?: string;
  /** Display order in the storefront (lower first). */
  sortOrder?: number;
  tagline?: string;
  price: number;
  originalPrice?: number;
  priceStatus: 'active' | 'missing';
  primaryCategory?: Product['primaryCategory'];
  subcategory?: string;
  collections?: string[];
  tags?: string[];
  weight?: string;
  dimensions?: string;
  fragrance?: string;
  burnTime?: string;
  scentFamily?: Product['scentFamily'];
  shortDescription?: string;
  longDescription?: string;
  howItFeels?: string[];
  customisation?: string;
  featured?: boolean;
  isActive: boolean;
  isHistorical?: boolean;
  categories: BrandCategoryKey[];
  moods: MoodKey[];
  /** Mirrors of the authoritative `inventory/{id}` doc, kept in sync by the admin dashboard. */
  inStock?: boolean;
  inventoryStatus?: Product['inventoryStatus'];
  availableStock?: number;
  /** Firebase Storage download URL of the main photo. */
  imageUrl?: string;
  galleryImageUrls?: string[];
  /** Storage object path of the main photo (e.g. `products/<file>.jpg`). */
  imageStoragePath?: string;

  // ---- Phase 4a fields (all optional; older docs work without them) ----
  /** One of the 5 collection slugs (`collections/{slug}` taxonomy doc). */
  collection?: CollectionSlug;
  // `scentFamily` above may hold a legacy label ('Floral') or a new slug ('luxury-woody').
  notes?: ScentNotesDoc;
  burnTimeHours?: number;
  weightGrams?: number;
  /** Free text, e.g. "8 x 10". */
  sizeCm?: string;
  ingredients?: string;
  description?: string;
  /** Storage download URLs; [0] = main photo, [1] = hover photo. Kept in sync with imageUrl. */
  images?: string[];
  occasions?: OccasionSlug[];
  boxEligible?: boolean;
  /** Printed MRP (optional). Never used as the selling price. */
  mrp?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A product is buyable only with an explicit active price status AND a positive finite price. */
export function hasVerifiedPrice(p: { price?: unknown; priceStatus?: unknown }): boolean {
  return (
    p.priceStatus === 'active' &&
    typeof p.price === 'number' &&
    Number.isFinite(p.price) &&
    p.price > 0
  );
}

/** Active storefront product (not deactivated, not historical). */
export function isActiveProduct(p: { isActive?: unknown; isHistorical?: unknown }): boolean {
  return p.isActive === true && !p.isHistorical;
}

/** Convert a Firestore product document into the storefront `Product` shape. */
export function productFromDoc(id: string, d: Record<string, any>): Product {
  const price = typeof d.price === 'number' && Number.isFinite(d.price) ? d.price : 0;

  // Photos: new `images[]` wins; otherwise the Phase 3 imageUrl / galleryImageUrls.
  const images: string[] = Array.isArray(d.images) ? d.images.filter((u: unknown) => typeof u === 'string' && u) : [];
  const legacyMain: string = d.imageUrl || '';
  const image: string = images[0] || legacyMain;
  const gallery: string[] =
    images.length > 0
      ? images
      : Array.isArray(d.galleryImageUrls) && d.galleryImageUrls.length > 0
      ? d.galleryImageUrls
      : image
      ? [image]
      : [];

  // Scent family: accept a legacy label or a new slug; expose both forms.
  let scentFamilySlug: ScentFamilySlug | undefined;
  let scentFamilyLabel: Product['scentFamily'];
  if (isOneOf(SCENT_FAMILY_SLUGS, d.scentFamily)) {
    scentFamilySlug = d.scentFamily;
    scentFamilyLabel = SLUG_TO_LEGACY_SCENT[d.scentFamily];
  } else if (typeof d.scentFamily === 'string') {
    scentFamilyLabel = d.scentFamily as Product['scentFamily'];
    scentFamilySlug = LEGACY_SCENT_TO_SLUG[d.scentFamily];
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const burnTimeHours = num(d.burnTimeHours);
  const weightGrams = num(d.weightGrams);
  const mrp = num(d.mrp);
  const notes = d.notes && typeof d.notes === 'object' ? (d.notes as ScentNotesDoc) : undefined;
  const occasions = Array.isArray(d.occasions) ? d.occasions.filter((o: unknown) => isOneOf(OCCASION_SLUGS, o)) : [];

  return {
    id,
    slug: d.slug || id,
    name: d.name || id,
    tagline: d.tagline,
    price,
    originalPrice: d.originalPrice ?? d.compareAtPrice ?? (mrp !== undefined && mrp > price ? mrp : undefined),
    priceStatus: hasVerifiedPrice({ price, priceStatus: d.priceStatus }) ? 'active' : 'missing',
    primaryCategory: d.primaryCategory,
    subcategory: d.subcategory,
    collections: d.collections,
    tags: d.tags,
    weight: d.weight ?? (weightGrams !== undefined ? `${weightGrams}g` : undefined),
    dimensions: d.dimensions ?? (d.sizeCm ? `${d.sizeCm} cm` : undefined),
    fragrance: d.fragrance,
    burnTime: d.burnTime ?? (burnTimeHours !== undefined ? `${burnTimeHours} hours` : undefined),
    scentFamily: scentFamilyLabel,
    shortDescription: d.shortDescription,
    longDescription: d.longDescription ?? d.description,
    howItFeels: d.howItFeels,
    scentNotes: d.scentNotes ?? (notes ? { top: notes.top, heart: notes.heart, base: notes.base } : undefined),
    ritual: d.ritual,
    image,
    galleryImages: gallery,
    waxType: d.waxType,
    wickType: d.wickType,
    vessel: d.vessel,
    customisation: d.customisation,
    inStock: d.inStock === true,
    inventoryStatus: d.inventoryStatus ?? 'unknown',
    availableStock: d.availableStock ?? d.stock,
    featured: d.featured ?? d.isFeatured ?? false,
    needsImageAsset: !image,
    isActive: d.isActive === true,
    isHistorical: Boolean(d.isHistorical),
    categories: Array.isArray(d.categories) ? d.categories : [],
    moods: Array.isArray(d.moods) ? d.moods : [],
    matchReasons: d.matchReasons || {},
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : undefined,
    // Phase 4a
    collection: isOneOf(COLLECTION_SLUGS, d.collection) ? d.collection : undefined,
    scentFamilySlug,
    notes,
    burnTimeHours,
    weightGrams,
    sizeCm: typeof d.sizeCm === 'string' ? d.sizeCm : undefined,
    ingredients: typeof d.ingredients === 'string' ? d.ingredients : undefined,
    description: d.description ?? d.longDescription,
    images: gallery,
    occasions,
    boxEligible: d.boxEligible === true,
    mrp
  };
}

/** Remove `undefined` values (Firestore rejects them). */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
