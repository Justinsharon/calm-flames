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
