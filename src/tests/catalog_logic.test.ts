import { describe, it, expect } from 'vitest';
import { validateCommercialUpdate, validateStock, validatePhoto } from '../lib/adminValidation';
import { hasVerifiedPrice, isActiveProduct, productFromDoc } from '../lib/productMapping';

describe('admin catalogue validation (pure, no mocks)', () => {
  it('only allows a priced status with a positive finite price', () => {
    expect(validateCommercialUpdate({ price: 0, priceStatus: 'active', isActive: true })).toMatch(/above ₹0/);
    expect(validateCommercialUpdate({ price: -5, priceStatus: 'missing', isActive: true })).toMatch(/0 or more/);
    expect(validateCommercialUpdate({ price: NaN, priceStatus: 'missing', isActive: true })).toMatch(/0 or more/);
    expect(validateCommercialUpdate({ price: 0, priceStatus: 'missing', isActive: true })).toBeNull();
    expect(validateCommercialUpdate({ price: 650, priceStatus: 'active', isActive: false })).toBeNull();
    expect(validateCommercialUpdate({ price: 650, priceStatus: 'bogus' as any, isActive: true })).toMatch(/must be/);
  });

  it('stock must be a whole number within range', () => {
    expect(validateStock(0)).toBeNull();
    expect(validateStock(25)).toBeNull();
    expect(validateStock(-1)).not.toBeNull();
    expect(validateStock(2.5)).not.toBeNull();
    expect(validateStock(100001)).not.toBeNull();
  });

  it('photos must be JPEG/PNG/WebP up to 5 MB', () => {
    expect(validatePhoto({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validatePhoto({ type: 'image/webp', size: 5 * 1024 * 1024 })).toBeNull();
    expect(validatePhoto({ type: 'image/gif', size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(validatePhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
});

describe('product mapping (pure, no mocks)', () => {
  it('treats a product as priced only with priceStatus active AND price > 0', () => {
    expect(hasVerifiedPrice({ price: 500, priceStatus: 'active' })).toBe(true);
    expect(hasVerifiedPrice({ price: 500, priceStatus: 'missing' })).toBe(false);
    expect(hasVerifiedPrice({ price: 500 })).toBe(false);
    expect(hasVerifiedPrice({ price: 0, priceStatus: 'active' })).toBe(false);
    expect(hasVerifiedPrice({ price: '500', priceStatus: 'active' })).toBe(false);
    expect(hasVerifiedPrice({ price: Infinity, priceStatus: 'active' })).toBe(false);
  });

  it('active means isActive === true and not historical', () => {
    expect(isActiveProduct({ isActive: true })).toBe(true);
    expect(isActiveProduct({ isActive: true, isHistorical: true })).toBe(false);
    expect(isActiveProduct({ isActive: 'true' })).toBe(false);
    expect(isActiveProduct({})).toBe(false);
  });

  it('maps a legacy doc conservatively (no priceStatus -> missing, no imageUrl -> no image)', () => {
    const p = productFromDoc('modak', { name: 'Modak', price: 450, image: '/src/assets/x.jpg', isActive: true });
    expect(p.priceStatus).toBe('missing');
    expect(p.image).toBe('');
    expect(p.needsImageAsset).toBe(true);
    expect(p.inStock).toBe(false);
  });

  it('maps imageUrl and gallery from Firestore', () => {
    const p = productFromDoc('x', { name: 'X', price: 10, priceStatus: 'active', imageUrl: 'u1', galleryImageUrls: ['u1', 'u2'], isActive: true });
    expect(p).toMatchObject({ image: 'u1', galleryImages: ['u1', 'u2'], priceStatus: 'active', price: 10 });
  });
});
