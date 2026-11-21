/**
 * Pure (SDK-free) mapping between Firestore `products/{id}` documents and the storefront `Product`
 * type. Shared by the browser, the server and the migration script so all three agree on what
 * "priced", "active" and "buyable" mean.
 */
import type { Product, BrandCategoryKey, MoodKey } from '../types';

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
  const image: string = d.imageUrl || '';
  const gallery: string[] =
    Array.isArray(d.galleryImageUrls) && d.galleryImageUrls.length > 0
      ? d.galleryImageUrls
      : image
      ? [image]
      : [];
  return {
    id,
    slug: d.slug || id,
    name: d.name || id,
    tagline: d.tagline,
    price,
    originalPrice: d.originalPrice ?? d.compareAtPrice,
    priceStatus: hasVerifiedPrice({ price, priceStatus: d.priceStatus }) ? 'active' : 'missing',
    primaryCategory: d.primaryCategory,
    subcategory: d.subcategory,
    collections: d.collections,
    tags: d.tags,
    weight: d.weight,
    dimensions: d.dimensions,
    fragrance: d.fragrance,
    burnTime: d.burnTime,
    scentFamily: d.scentFamily,
    shortDescription: d.shortDescription,
    longDescription: d.longDescription,
    howItFeels: d.howItFeels,
    scentNotes: d.scentNotes,
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
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : undefined
  };
}

/** Remove `undefined` values (Firestore rejects them). */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
