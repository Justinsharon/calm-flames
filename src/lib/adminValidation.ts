/** Pure validators for admin catalogue edits (shared by the dashboard and tests). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface CommercialUpdate {
  price: number;
  priceStatus: 'active' | 'missing';
  isActive: boolean;
  name?: string;
  tagline?: string;
  /** Storefront position (lower first). */
  sortOrder?: number;
}

/** Validate an admin price edit. Returns an error message, or null when valid. */
export function validateCommercialUpdate(u: CommercialUpdate): string | null {
  if (typeof u.price !== 'number' || !Number.isFinite(u.price) || u.price < 0) {
    return 'Price must be a number of 0 or more.';
  }
  if (u.priceStatus !== 'active' && u.priceStatus !== 'missing') {
    return 'Price status must be "active" or "missing".';
  }
  if (u.priceStatus === 'active' && u.price <= 0) {
    return 'A product can only be marked priced (active) with a price above ₹0.';
  }
  if (u.sortOrder !== undefined && (!Number.isInteger(u.sortOrder) || u.sortOrder < 0 || u.sortOrder > 100000)) {
    return 'Sort order must be a whole number between 0 and 100000.';
  }
  return null;
}

/** Validate an admin stock edit. */
export function validateStock(n: number): string | null {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100000) {
    return 'Stock must be a whole number between 0 and 100000.';
  }
  return null;
}

export function validatePhoto(file: { type: string; size: number }): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return 'Photo must be a JPEG, PNG or WebP image.';
  if (file.size > MAX_PHOTO_BYTES) return 'Photo must be 5 MB or smaller.';
  return null;
}

// ---- Phase 4a: product details, taxonomy ----
import {
  COLLECTION_SLUGS,
  SCENT_FAMILY_SLUGS,
  OCCASION_SLUGS,
  PRODUCT_BADGE_TAGS,
  LEGACY_SCENT_TO_SLUG,
  isOneOf
} from './taxonomy';

/** Editor values for the Phase 4a fields. `null` = clear the field. */
export interface ProductDetailsUpdate {
  collection: string | null;
  scentFamily: string | null;
  notes: { top: string[]; heart: string[]; base: string[] } | null;
  burnTimeHours: number | null;
  weightGrams: number | null;
  sizeCm: string | null;
  ingredients: string | null;
  shortDescription: string | null;
  description: string | null;
  badges: string[];
  occasions: string[];
  boxEligible: boolean;
  mrp: number | null;
}

export function splitList(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateProductDetails(u: ProductDetailsUpdate): string | null {
  if (u.collection !== null && !isOneOf(COLLECTION_SLUGS, u.collection)) return 'Unknown collection.';
  if (u.scentFamily !== null && !isOneOf(SCENT_FAMILY_SLUGS, u.scentFamily) && !(u.scentFamily in LEGACY_SCENT_TO_SLUG)) {
    return 'Unknown scent family.';
  }
  for (const k of ['burnTimeHours', 'weightGrams', 'mrp'] as const) {
    const v = u[k];
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return `${k} must be a number of 0 or more.`;
  }
  if (u.sizeCm !== null && u.sizeCm.length > 40) return 'Size is too long (max 40 characters).';
  if (u.ingredients !== null && u.ingredients.length > 2000) return 'Ingredients are too long.';
  if (u.shortDescription !== null && u.shortDescription.length > 500) return 'Short description is too long (max 500).';
  if (u.description !== null && u.description.length > 5000) return 'Description is too long (max 5000).';
  if (!u.badges.every((b) => isOneOf(PRODUCT_BADGE_TAGS, b))) return 'Unknown tag.';
  if (!u.occasions.every((o) => isOneOf(OCCASION_SLUGS, o))) return 'Unknown occasion.';
  return null;
}

export function validateTaxonomyEdit(t: { name: string; description: string; headerImage: string; sortOrder: number }): string | null {
  if (!t.name.trim() || t.name.length > 80) return 'Name is required (max 80 characters).';
  if (t.description.length > 2000) return 'Description is too long (max 2000).';
  if (t.headerImage && !/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(t.headerImage)) return 'Header image must be a URL.';
  if (!Number.isInteger(t.sortOrder) || t.sortOrder < 0) return 'Sort order must be a whole number of 0 or more.';
  return null;
}
