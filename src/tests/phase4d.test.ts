/** Phase 4D unit tests (no Firestore, no network). */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../server/rateLimit';
import { fallbackSuggestions, giftableProducts, parseBudget } from '../server/giftGuide';
import { validateSupport, sniffImage } from '../server/support';
import { productIdsOfOrder } from '../server/purchases';
import { checkSupportPhoto } from '../services/supportService';
import { safeNext } from '../storefront/lib/recentlyViewed';
import { matchRoute, paths } from '../lib/routes';
import type { Product } from '../types';

const p = (id: string, over: Partial<Product> & Record<string, any> = {}) =>
  ({ id, slug: id, name: id, price: 500, priceStatus: 'active', isActive: true, isHistorical: false, inStock: true, inventoryStatus: 'in_stock', categories: [], moods: [], ...over }) as Product;

describe('rate limiter', () => {
  it('allows max per window per client, then 429 with Retry-After', async () => {
    const was = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = '0';
    try {
      const a = express();
      a.post('/x', rateLimit({ name: 'unit', windowMs: 60_000, max: 2 }), (_q, r) => r.json({ ok: true }));
      expect((await request(a).post('/x')).status).toBe(200);
      expect((await request(a).post('/x')).status).toBe(200);
      const third = await request(a).post('/x');
      expect(third.status).toBe(429);
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      process.env.RATE_LIMIT_DISABLED = was;
    }
  });
});

describe('gift guide fallback', () => {
  const list = [
    p('peony', { name: 'Peony Bloom', notes: { top: ['peony', 'rose'] } as any }),
    p('urli', { name: 'Royal Urli', price: 2450, occasions: ['housewarming'] as any }),
    p('unpriced', { price: 0, priceStatus: 'missing' }),
    p('out', { inStock: false, inventoryStatus: 'out_of_stock' })
  ];
  it('grounds on active, priced, in-stock products only', () => {
    expect(giftableProducts(list).map((x) => x.id)).toEqual(['peony', 'urli']);
  });
  it('matches keywords and synonyms, honours a budget, uses real fields for the reason', () => {
    const g = giftableProducts(list);
    expect(fallbackSuggestions('a housewarming gift', g)[0].productId).toBe('urli');
    const floral = fallbackSuggestions('for my mother', g)[0];
    expect(floral).toMatchObject({ productId: 'peony', price: 500, reason: 'Peony and rose notes.' });
    expect(fallbackSuggestions('under ₹1,000', g).map((s) => s.productId)).toEqual(['peony']);
    expect(parseBudget('below Rs. 1,500 please')).toBe(1500);
    const rich = p('jar', { name: 'Lotus Jar', notes: { top: ['lotus'], heart: ['jasmine'], base: ['sandalwood'] } as any, scentFamilySlug: 'floral' as any, collection: 'jar-candles' as any, occasions: ['birthday', 'housewarming'] as any });
    expect(fallbackSuggestions('housewarming', [rich])[0].reason).toBe('Lotus, jasmine and sandalwood notes, from the Floral family, in our Jar Candles collection. Made for housewarming gifting.');
    expect(fallbackSuggestions('under 2000', [p('bare', { name: 'Bare' })])[0].reason).toBe('Within your ₹2,000 budget.');
    expect(parseBudget('anything')).toBeNull();
  });
});

describe('support validation', () => {
  const ok = { type: 'callback', name: 'Asha', phone: '+91 98765 43210', message: 'Please call' };
  it('accepts and cleans a valid request', () => {
    expect(validateSupport({ ...ok, email: 'A@B.IN', orderNumber: 'tcf-123456' })).toEqual({ ok: true, value: { type: 'callback', name: 'Asha', phone: '9876543210', message: 'Please call', email: 'a@b.in', orderNumber: 'TCF-123456' } });
  });
  it.each([
    [{ ...ok, type: 'refund' }, /what you need/],
    [{ ...ok, phone: '555' }, /mobile/],
    [{ ...ok, email: 'nope' }, /email/],
    [{ ...ok, type: 'damaged' }, /order number/],
    [{ ...ok, message: '' }, /how we can help/],
    [{ ...ok, withPhoto: 'yes' }, /photo/]
  ])('rejects %#', (b, re) => {
    const r = validateSupport(b);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
  it('photo paths and client-side photo checks', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(checkSupportPhoto({ type: 'image/gif', size: 10 })).toMatch(/JPG/);
    expect(checkSupportPhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
    expect(checkSupportPhoto({ type: 'image/jpeg', size: 1000 })).toBeNull();
  });
});

describe('accounts', () => {
  it('sign-in only returns to same-site paths', () => {
    expect(safeNext('/products/peony')).toBe('/products/peony');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', null, '']) expect(safeNext(bad as any, '/account')).toBe('/account');
  });
  it('routes and links', () => {
    expect(matchRoute('/sign-in')?.name).toBe('signIn');
    expect(matchRoute('/account')?.name).toBe('account');
    expect(paths.signIn('/products/a b')).toBe('/sign-in?next=%2Fproducts%2Fa%20b');
    expect(paths.account('orders')).toBe('/account?tab=orders');
  });
  it('purchases cover product lines and box contents', () => {
    expect(productIdsOfOrder({ lines: [{ kind: 'product', productId: 'a' }, { kind: 'box', contents: [{ productId: 'b' }, { productId: 'a' }] }], items: [{ productId: 'c' }] }).sort()).toEqual(['a', 'b', 'c']);
  });
});
