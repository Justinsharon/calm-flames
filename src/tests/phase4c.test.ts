/**
 * Phase 4C unit tests: pure functions plus a few Express routes that answer before touching
 * Firestore (Firestore is disabled in this config). No mocks except the mailer's HTTP fetch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import type { Product } from '../types';
import { priceCart, computeTotals, productIdsOf } from '../server/quote';
import { parseCoupon, couponDiscount, validateCoupon, LEGACY_COUPONS, normalizeCouponCode } from '../lib/coupons';
import { validateCustomer, normalizePhone, isValidPincode, cleanCustomer } from '../lib/checkoutForm';
import { checkViewToken, hashViewToken, newViewToken, orderSummaryForViewer } from '../server/orderView';
import { getMailer, sendOrderConfirmation, confirmationEmail } from '../server/mailer';
import { matchRoute, paths } from '../lib/routes';
import { lineKey, normalizeLines } from '../lib/cartLines';
import { boxEstimate, boxEligibleProducts } from '../storefront/pages/BuildBoxPage';
import { shippingMessage } from '../storefront/pages/CartPage';
import { readViewToken } from '../storefront/pages/ConfirmedPage';
import type { StoreSettings } from '../lib/storeSettings';

const prod = (id: string, over: Partial<Product> = {}): Product =>
  ({
    id, slug: id, name: id.toUpperCase(), price: 500, priceStatus: 'active', isActive: true, isHistorical: false,
    inStock: true, inventoryStatus: 'in_stock', availableStock: 10, boxEligible: true, categories: [], moods: [], ...over
  }) as Product;

const catalog = new Map<string, Product>([
  ['a', prod('a', { price: 450 })],
  ['b', prod('b', { price: 650 })],
  ['noBox', prod('noBox', { boxEligible: false })],
  ['unpriced', prod('unpriced', { price: 0, priceStatus: 'missing' })],
  ['low', prod('low', { availableStock: 2 })],
  ['unknownStock', prod('unknownStock', { inStock: false, inventoryStatus: 'unknown' as any })]
]);

// Test fixtures only (never real shop values; the owner enters those in Firebase).
const SETTINGS: StoreSettings = {
  freeShippingThreshold: 1500,
  shippingFee: 99,
  codEnabled: true,
  codFee: 49,
  codMaxOrder: 3000,
  buildABox: { sizes: [{ count: 2, price: 300 }, { count: 3, price: 450 }], ribbons: ['Gold', 'Wine'], addOns: [{ name: 'Matchbox', price: 99 }] }
};

describe('priceCart: products and boxes', () => {
  it('prices product lines from the catalogue only', () => {
    const r = priceCart([{ productId: 'a', quantity: 2, price: 1 } as any], catalog, SETTINGS, { checkStock: true });
    expect(r).toMatchObject({ ok: true, subtotal: 900, demand: [{ productId: 'a', quantity: 2 }] });
  });

  it('prices a box as box price + candles + add-ons, × quantity, and expands its demand', () => {
    const r = priceCart(
      [{ kind: 'box', boxSize: 3, productIds: ['a', 'a', 'b'], ribbon: 'Gold', addOns: ['Matchbox'], message: ' For you ', quantity: 2 }, { productId: 'a', quantity: 1 }],
      catalog, SETTINGS, { checkStock: true }
    );
    if (!r.ok) throw new Error(r.error);
    const unit = 450 + 450 + 450 + 650 + 99;
    expect(r.lines[0]).toMatchObject({ kind: 'box', boxSize: 3, boxPrice: 450, unitPrice: unit, totalPrice: unit * 2, ribbon: 'Gold', message: 'For you' });
    expect(r.subtotal).toBe(unit * 2 + 450);
    expect(r.demand).toEqual([{ productId: 'a', quantity: 5 }, { productId: 'b', quantity: 2 }]);
  });

  const box = (over: any = {}) => [{ kind: 'box', boxSize: 2, productIds: ['a', 'b'], quantity: 1, ...over }];
  it.each([
    ['box not configured', box(), { ...SETTINGS, buildABox: undefined }, /Build a Box is not available/],
    ['unknown size', box({ boxSize: 4, productIds: ['a', 'a', 'a', 'a'] }), SETTINGS, /size is not available/],
    ['wrong number of candles', box({ productIds: ['a'] }), SETTINGS, /exactly 2/],
    ['not box-eligible', box({ productIds: ['a', 'noBox'] }), SETTINGS, /cannot go in a gift box/],
    ['unpriced candle', box({ productIds: ['a', 'unpriced'] }), SETTINGS, /verified retail price/],
    ['unknown candle', box({ productIds: ['a', 'nope'] }), SETTINGS, /not available in the active catalogue/],
    ['unknown ribbon', box({ ribbon: 'Purple' }), SETTINGS, /ribbon/],
    ['unknown add-on', box({ addOns: ['Gold leaf'] }), SETTINGS, /add-on/],
    ['repeated add-on', box({ addOns: ['Matchbox', 'Matchbox'] }), SETTINGS, /once/],
    ['message too long', box({ message: 'x'.repeat(301) }), SETTINGS, /300/],
    ['bad box quantity', box({ quantity: 11 }), SETTINGS, /1 to 10/]
  ])('rejects a box: %s', (_n, items, settings, re) => {
    const r = priceCart(items, catalog, settings as StoreSettings, { checkStock: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });

  it('checks stock against the combined demand (box candles + loose candles)', () => {
    const r = priceCart([{ kind: 'box', boxSize: 2, productIds: ['low', 'low'], quantity: 1 }, { productId: 'low', quantity: 1 }], catalog, SETTINGS, { checkStock: true });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Requested 3, available: 2/) });
    // order creation leaves stock to the atomic reservation
    expect(priceCart([{ productId: 'low', quantity: 3 }], catalog, SETTINGS, { checkStock: false }).ok).toBe(true);
    expect(priceCart([{ productId: 'unknownStock', quantity: 1 }], catalog, SETTINGS, { checkStock: true }).ok).toBe(false);
  });

  it('collects every product id (for one Firestore read)', () => {
    expect(productIdsOf([{ productId: 'x', quantity: 1 }, { kind: 'box', productIds: ['y', 'z'] }, null])).toEqual(['x', 'y', 'z']);
  });
});

describe('computeTotals: shipping, coupons, COD', () => {
  it('quotes nothing when shipping is not configured', () => {
    expect(computeTotals(1000, {}, null, undefined)).toMatchObject({ ok: false, status: 503 });
    expect(computeTotals(1000, null, null, undefined)).toMatchObject({ ok: false, status: 503 });
  });
  it('adds shipping under the threshold and ships free at it', () => {
    expect(computeTotals(1000, SETTINGS, null, undefined)).toMatchObject({ ok: true, totals: { shipping: 99, total: 1099, amountToFreeShipping: 500 } });
    expect(computeTotals(1500, SETTINGS, null, undefined)).toMatchObject({ ok: true, totals: { shipping: 0, total: 1500, amountToFreeShipping: 0 } });
  });
  it('applies an active coupon and reports why another one does not apply', () => {
    const pct = parseCoupon('TEN', { type: 'percent', value: 10, minOrder: 500, maxDiscount: 120, active: true });
    expect(computeTotals(2000, SETTINGS, { code: 'TEN', coupon: pct }, undefined)).toMatchObject({ ok: true, totals: { discount: 120, couponCode: 'TEN', total: 1880 } });
    const off = parseCoupon('OFF', { type: 'fixed', value: 150, minOrder: 0, active: false });
    expect(computeTotals(2000, SETTINGS, { code: 'OFF', coupon: off }, undefined)).toMatchObject({ ok: true, totals: { discount: 0, couponCode: '', couponMessage: 'This code is not valid.' } });
    expect(computeTotals(2000, SETTINGS, { code: 'NOPE', coupon: null }, undefined)).toMatchObject({ ok: true, totals: { discount: 0 } });
  });
  it('COD only when enabled with fee and limit, and only under the limit', () => {
    expect(computeTotals(1000, { freeShippingThreshold: 1500, shippingFee: 99 }, null, 'cod')).toMatchObject({ ok: false, error: 'Cash on delivery is not available.' });
    expect(computeTotals(1000, { ...SETTINGS, codEnabled: false }, null, undefined)).toMatchObject({ ok: true, totals: { cod: { available: false } } });
    expect(computeTotals(1000, SETTINGS, null, 'cod')).toMatchObject({ ok: true, totals: { codFee: 49, total: 1148, cod: { available: true, fee: 49 } } });
    expect(computeTotals(2990, SETTINGS, null, 'cod')).toMatchObject({ ok: false, error: expect.stringMatching(/up to ₹3000/) });
    expect(computeTotals(2990, SETTINGS, null, 'razorpay')).toMatchObject({ ok: true, totals: { codFee: 0, cod: { available: false } } });
  });
});

describe('coupons', () => {
  const now = new Date('2026-11-22T00:00:00Z');
  it('parses only well-formed docs', () => {
    expect(parseCoupon('X1', { type: 'percent', value: 10, minOrder: 0, active: true })).toBeNull(); // code too short
    expect(parseCoupon('ABC', { type: 'percent', value: 150, active: true })).toBeNull();
    expect(parseCoupon('ABC', { type: 'bogus', value: 10, active: true })).toBeNull();
    expect(parseCoupon('ABC', { type: 'fixed', value: 100, active: 'yes' })).toMatchObject({ active: false, minOrder: 0 });
  });
  it('enforces expiry, minimum order and cap; never more than the subtotal', () => {
    const c = parseCoupon('ABC', { type: 'percent', value: 50, minOrder: 1000, maxDiscount: 300, active: true, expiresAt: '2026-12-01T00:00:00Z' })!;
    expect(couponDiscount(c, 999, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/₹1000/) });
    expect(couponDiscount(c, 1000, now)).toEqual({ ok: true, discount: 300 });
    expect(couponDiscount(c, 1000, new Date('2026-12-02T00:00:00Z'))).toMatchObject({ ok: false, reason: 'This code has expired.' });
    const big = parseCoupon('BIG', { type: 'fixed', value: 900, minOrder: 0, active: true })!;
    expect(couponDiscount(big, 500, now)).toEqual({ ok: true, discount: 500 });
  });
  it('migrates the two old hard-coded codes as INACTIVE', () => {
    expect(LEGACY_COUPONS.map((c) => c.code)).toEqual(['CALM10', 'FIRSTFLAME']);
    expect(LEGACY_COUPONS.every((c) => c.active === false && validateCoupon(c) === null)).toBe(true);
  });
  it('admin validation reports problems', () => {
    expect(validateCoupon({ code: 'ok', type: 'percent', value: 10, minOrder: 0, active: true })).toMatch(/Code/);
    expect(validateCoupon({ code: 'OK1', type: 'percent', value: 0, minOrder: 0, active: true })).toMatch(/above 0/);
    expect(normalizeCouponCode('  calm10 ')).toBe('CALM10');
  });
});

describe('checkout form validation', () => {
  it('Indian pincode and mobile', () => {
    expect(isValidPincode('411001')).toBe(true);
    for (const bad of ['011001', '41100', '4110011', 'abcdef']) expect(isValidPincode(bad)).toBe(false);
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone('5876543210')).toBeNull();
  });
  it('reports each bad field and cleans the record', () => {
    const e = validateCustomer({ fullName: '', email: 'x@', phone: '123', addressLine1: '', city: '', state: '', pincode: '000000' });
    expect(Object.keys(e).sort()).toEqual(['addressLine1', 'city', 'email', 'fullName', 'phone', 'pincode', 'state']);
    expect(cleanCustomer({ fullName: ' Asha ', email: 'A@B.IN', phone: '98765-43210', addressLine1: 'x', city: 'Pune', state: 'Maharashtra', pincode: '411001', extra: 'drop' }))
      .toEqual({ fullName: 'Asha', email: 'a@b.in', phone: '9876543210', addressLine1: 'x', city: 'Pune', state: 'Maharashtra', pincode: '411001' });
  });
});

describe('order view token', () => {
  it('matches only the issued token', () => {
    const t = newViewToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(checkViewToken(t, hashViewToken(t))).toBe(true);
    expect(checkViewToken(newViewToken(), hashViewToken(t))).toBe(false);
    expect(checkViewToken(undefined, hashViewToken(t))).toBe(false);
    expect(checkViewToken(t, undefined)).toBe(false);
  });
  it('the viewer summary has no contact details or street address', () => {
    const s = orderSummaryForViewer({
      orderNumber: 'TCF-123456', customer: { fullName: 'Asha Rao', email: 'a@b.in', phone: '9876543210', addressLine1: '1 Lane', city: 'Pune', pincode: '411001' },
      lines: [{ kind: 'box', boxSize: 2, contents: [{ productName: 'A' }, { productName: 'B' }], ribbon: 'Gold', quantity: 1, totalPrice: 1400 }],
      trackingUrl: 'javascript:alert(1)', viewTokenHash: 'x'
    });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/a@b\.in|9876543210|1 Lane|viewTokenHash/);
    expect(s).toMatchObject({ firstName: 'Asha', city: 'Pune', trackingUrl: null, lines: [{ name: 'Gift box of 2', detail: 'A, B · Gold ribbon' }] });
  });
  it('the token travels in the URL fragment, not the path or query', () => {
    expect(paths.orderConfirmed('TCF-123456', 'abc')).toBe('/order/TCF-123456/confirmed#t=abc');
    expect(readViewToken('#t=abc%2B', 'TCF-1')).toBe('abc+');
  });
});

describe('routes', () => {
  it('new storefront routes', () => {
    expect(matchRoute('/cart')?.name).toBe('cart');
    expect(matchRoute('/build-a-box')?.name).toBe('buildBox');
    expect(matchRoute('/checkout/')?.name).toBe('checkout');
    expect(matchRoute('/order/TCF-123456/confirmed')).toEqual({ name: 'orderConfirmed', params: { id: 'TCF-123456' } });
    expect(matchRoute('/order/TCF-1')).toBeNull();
  });
  it('POST /api/orders/create refuses every order while CHECKOUT_ENABLED is off', async () => {
    const was = process.env.CHECKOUT_ENABLED;
    delete process.env.CHECKOUT_ENABLED;
    try {
      const res = await request(app).post('/api/orders/create').send({ items: [{ productId: 'a', quantity: 1 }], customer: {}, paymentMethod: 'cod' });
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ checkoutEnabled: false });
    } finally {
      process.env.CHECKOUT_ENABLED = was;
    }
  });
  it('POST /api/orders/create rejects a bad pincode before anything else', async () => {
    const res = await request(app)
      .post('/api/orders/create')
      .send({ items: [{ productId: 'a', quantity: 1 }], paymentMethod: 'cod', customer: { fullName: 'A', email: 'a@b.in', phone: '9876543210', addressLine1: 'x', city: 'y', state: 'z', pincode: '12345' } });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ pincode: 'Enter a 6-digit pincode.' });
  });
  it('GET /api/orders/:id/view answers 404 for malformed ids without a lookup', async () => {
    const res = await request(app).get('/api/orders/..%2Fsecret/view').set('X-Order-Token', 'x'.repeat(32));
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('cart lines and page helpers', () => {
  it('a box line key ignores candle order; fingerprints are canonical', () => {
    const a = { kind: 'box' as const, boxSize: 2, productIds: ['x', 'y'], quantity: 1 };
    expect(lineKey(a)).toBe(lineKey({ ...a, productIds: ['y', 'x'] }));
    expect(normalizeLines([a, { productId: 'p', quantity: 1 }])).toEqual(normalizeLines([{ productId: 'p', quantity: 1 }, { ...a, productIds: ['y', 'x'] }]));
  });
  it('free-shipping line', () => {
    expect(shippingMessage(1000, null)).toBeNull();
    expect(shippingMessage(1000, 1500)).toEqual({ text: "You're ₹500 away from free shipping.", progress: 1000 / 1500 });
    expect(shippingMessage(1500, 1500)).toMatchObject({ text: 'Your order ships free.' });
  });
  it('Build a Box shows only priced, in-stock, box-eligible candles; estimate uses owner prices', () => {
    expect(boxEligibleProducts([...catalog.values()]).map((p) => p.id)).toEqual(['a', 'b', 'low']);
    expect(boxEstimate(SETTINGS.buildABox!, 2, [catalog.get('a')!, catalog.get('b')!], ['Matchbox'])).toBe(300 + 450 + 650 + 99);
    expect(boxEstimate(SETTINGS.buildABox!, 5, [], [])).toBeNull();
  });
});

describe('mailer (env-configured only)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('is off unless MAIL_PROVIDER, key and sender are all set', () => {
    expect(getMailer({})).toBeNull();
    expect(getMailer({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' })).toBeNull();
    expect(getMailer({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.in' })?.name).toBe('resend');
  });
  it('unset: logs and skips without touching Firestore', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await sendOrderConfirmation('TCF-123456', null)).toBe('skipped');
    expect(log).toHaveBeenCalled();
  });
  it('Resend: one POST at the HTTP boundary with the key in a header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const m = getMailer({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'secret-key', MAIL_FROM: 'Shop <o@b.in>' }, fetchMock as any)!;
    await m.send(confirmationEmail({ orderNumber: 'TCF-1', customer: { fullName: '<b>Asha</b> Rao', email: 'a@b.in' }, lines: [], subtotal: 1, total: 1 }));
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: 'Shop <o@b.in>', to: ['a@b.in'], subject: 'Your Calm Flame order TCF-1' });
    expect(body.html).toContain('&lt;b&gt;Asha'); expect(body.html).not.toContain('<b>Asha');
  });
});
