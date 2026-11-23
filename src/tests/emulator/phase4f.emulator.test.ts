/**
 * Phase 4f against the Firestore emulator: emails are sent once per order (fake in-memory mailer
 * object, no network), and the search-engine surface (robots, sitemap, canonical, JSON-LD,
 * noindex) with real Express routes and real Firestore data. No other mocks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server';
import { getAdminDb } from '../../server/firestoreAdmin';
import { sendOrderAlert, sendOrderConfirmation, sendShippedEmail, type Mailer, type MailMessage } from '../../server/mailer';
import { setTrackingAndNotify } from '../../server/orderAdmin';
import { resolveMeta, injectMeta } from '../../server/seo';
import { sitemapEntries } from '../../server/siteIndex';
import { clearFirestore, getData } from './helpers';

const sent: MailMessage[] = [];
const fake: Mailer = { name: 'test', send: async (m) => void sent.push(m) };
const ORDER = {
  orderNumber: 'TCF-424242', total: 1148, subtotal: 1000, shipping: 99, codFee: 49, paymentMethod: 'cod', giftMessage: 'Happy Diwali',
  customer: { fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', addressLine1: '1 Lane', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  lines: [{ kind: 'product', productId: 'peony', productName: 'Peony Bloom', quantity: 1, totalPrice: 1000 }]
};

beforeEach(async () => {
  await clearFirestore();
  sent.length = 0;
  await getAdminDb().collection('orders').doc(ORDER.orderNumber).set(ORDER);
});

describe('order emails are sent once per order', () => {
  it('new-order alert goes to ORDER_NOTIFY_EMAIL once; unset = skipped', async () => {
    expect(await sendOrderAlert(ORDER.orderNumber, {}, fake)).toBe('skipped');
    const env = { ORDER_NOTIFY_EMAIL: 'shop@example.com' };
    const results = await Promise.all([1, 2, 3].map(() => sendOrderAlert(ORDER.orderNumber, env, fake)));
    expect(results.filter((r) => r === 'sent')).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'shop@example.com', subject: 'New order TCF-424242 · ₹1,148 · Cash on delivery' });
    expect(sent[0].text).toContain('Peony Bloom × 1');
    expect(sent[0].text).toContain('Gift message: Happy Diwali');
    expect(await getData('orders', ORDER.orderNumber)).toMatchObject({ orderAlertEmail: { status: 'sent' } });
    // the customer confirmation is a separate kind, also once
    expect(await sendOrderConfirmation(ORDER.orderNumber, fake)).toBe('sent');
    expect(await sendOrderConfirmation(ORDER.orderNumber, fake)).toBe('duplicate');
    expect(sent.map((m) => m.to)).toEqual(['shop@example.com', 'asha@example.com']);
  });

  it('shipped email: none without a link; once on the first saved link; editing the link sends nothing new', async () => {
    expect(await sendShippedEmail(ORDER.orderNumber, fake)).toBe('duplicate'); // no tracking link yet
    expect(await setTrackingAndNotify(ORDER.orderNumber, 'javascript:alert(1)', fake)).toMatchObject({ ok: false, status: 400 });
    const first = await setTrackingAndNotify(ORDER.orderNumber, 'https://track.example/1', fake);
    expect(first).toEqual({ ok: true, trackingUrl: 'https://track.example/1', email: 'sent' });
    expect(sent[0]).toMatchObject({ to: 'asha@example.com', subject: 'Your Calm Flame order TCF-424242 has shipped' });
    expect(sent[0].text).toContain('https://track.example/1');
    expect(await setTrackingAndNotify(ORDER.orderNumber, 'https://track.example/2', fake)).toMatchObject({ ok: true, email: 'duplicate' });
    expect(await setTrackingAndNotify(ORDER.orderNumber, '', fake)).toMatchObject({ ok: true, trackingUrl: null, email: 'not-sent' });
    expect(sent).toHaveLength(1);
    expect(await setTrackingAndNotify('TCF-000000', 'https://track.example/1', fake)).toMatchObject({ ok: false, status: 404 });
  });

  it('a failed send is recorded and can be retried; the endpoint needs an admin token', async () => {
    const down: Mailer = { name: 'down', send: async () => { throw new Error('provider down'); } };
    await getAdminDb().collection('orders').doc(ORDER.orderNumber).update({ trackingUrl: 'https://track.example/9' });
    expect(await sendShippedEmail(ORDER.orderNumber, down)).toBe('failed');
    expect(await getData('orders', ORDER.orderNumber)).toMatchObject({ shippedEmail: { status: 'failed', error: 'provider down' } });
    expect(await sendShippedEmail(ORDER.orderNumber, fake)).toBe('sent');
    expect((await request(app).post('/api/admin/orders/TCF-424242/tracking').send({ trackingUrl: 'https://x.example' })).status).toBe(401);
    expect((await request(app).post('/api/admin/orders/TCF-424242/tracking').set('Authorization', 'Bearer nope').send({})).status).toBe(401);
  });
});

describe('SEO: only the public host is indexable', () => {
  const PUBLIC = 'thecalmflames.com';
  beforeEach(async () => {
    process.env.PUBLIC_SITE_URL = `https://${PUBLIC}`;
    const db = getAdminDb();
    await db.collection('products').doc('peony-bloom').set({ name: 'Peony Bloom', slug: 'peony-bloom', price: 650, priceStatus: 'active', isActive: true, collection: 'jar-candles', scentFamily: 'floral', scentFamilySlug: 'floral', occasions: ['birthday'], inStock: true, inventoryStatus: 'in_stock', images: ['https://cdn.example/p.jpg'], shortDescription: 'Peony </script><script>alert(1)</script>', updatedAt: '2026-11-20T00:00:00Z' });
    await db.collection('products').doc('urli').set({ name: 'Urli', slug: 'urli', price: 0, priceStatus: 'missing', isActive: true });
    await db.collection('products').doc('hidden').set({ name: 'Hidden', slug: 'hidden', price: 900, priceStatus: 'active', isActive: false });
    await db.collection('pages').doc('first-burn').set({ slug: 'first-burn', type: 'journal', title: 'First burn', body: 'x', published: true });
    await db.collection('pages').doc('draft').set({ slug: 'draft', type: 'journal', title: 'Draft', body: 'x', published: false });
    await db.collection('pages').doc('shipping').set({ slug: 'shipping', type: 'info', title: 'Shipping', body: 'x', published: true });
    await db.collection('pages').doc('faq').set({ slug: 'faq', type: 'faq', title: 'FAQ', body: 'x', published: true });
  });
  afterEach(() => {
    delete process.env.PUBLIC_SITE_URL;
  });

  it('robots.txt: allow + sitemap on the public host; Disallow everything elsewhere', async () => {
    const pub = await request(app).get('/robots.txt').set('Host', PUBLIC);
    expect(pub.text).toContain('Allow: /');
    expect(pub.text).toContain('Sitemap: https://thecalmflames.com/sitemap.xml');
    expect(pub.headers['x-robots-tag']).toBeUndefined();
    for (const host of ['calm-flames-staging-abc-el.a.run.app', 'www.thecalmflames.com', 'localhost:3000']) {
      const r = await request(app).get('/robots.txt').set('Host', host);
      expect(r.text).toBe('User-agent: *\nDisallow: /\n');
      expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    delete process.env.PUBLIC_SITE_URL; // unset = nothing is indexable
    expect((await request(app).get('/robots.txt').set('Host', PUBLIC)).text).toBe('User-agent: *\nDisallow: /\n');
  });

  it('www redirects permanently to the apex, keeping path and query', async () => {
    const r = await request(app).get('/products/peony-bloom?ref=ig').set('Host', `www.${PUBLIC}`);
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('https://thecalmflames.com/products/peony-bloom?ref=ig');
    expect((await request(app).get('/robots.txt').set('Host', PUBLIC)).status).toBe(200);
  });

  it('behind Firebase Hosting the custom domain arrives as X-Forwarded-Host', async () => {
    const r = await request(app).get('/robots.txt').set('Host', 'calm-flames-abc-el.a.run.app').set('X-Forwarded-Host', PUBLIC);
    expect(r.text).toContain('Sitemap:');
    expect(r.headers['x-robots-tag']).toBeUndefined();
    const w = await request(app).get('/').set('Host', 'calm-flames-abc-el.a.run.app').set('X-Forwarded-Host', `www.${PUBLIC}`);
    expect(w.status).toBe(301);
  });

  it('every response off the public host carries X-Robots-Tag: noindex (APIs too)', async () => {
    const r = await request(app).get('/api/checkout/readiness').set('Host', 'staging.example.run.app');
    expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
    const p = await request(app).get('/api/checkout/readiness').set('Host', PUBLIC);
    expect(p.headers['x-robots-tag']).toBeUndefined();
  });

  it('sitemap.xml lists home, hubs, live collections/families/occasions, active products and published pages only', async () => {
    const r = await request(app).get('/sitemap.xml').set('Host', PUBLIC);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/xml/);
    const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://thecalmflames.com', ''));
    expect(locs).toEqual(expect.arrayContaining(['/', '/scent', '/gifting', '/journal', '/support', '/collections/jar-candles', '/scent/floral', '/gifting/birthday', '/products/peony-bloom', '/products/urli', '/journal/first-burn', '/shipping']));
    for (const no of ['/products/hidden', '/journal/draft', '/faq', '/collections/pillar-sculptural', '/cart', '/checkout']) expect(locs).not.toContain(no);
    expect(r.text).toContain('<lastmod>2026-11-20</lastmod>');
    expect((await request(app).get('/sitemap.xml').set('Host', 'staging.run.app')).status).toBe(404);
    expect((await sitemapEntries()).length).toBe(locs.length);
  });

  it('canonical URL + product JSON-LD only for priced, active products; JSON is script-safe', async () => {
    const tpl = '<html><head><title>x</title><meta name="description" content="" /><meta property="og:title" content="" /><meta property="og:description" content="" /></head><body></body></html>';
    const peony = await resolveMeta('/products/peony-bloom');
    const html = injectMeta(tpl, peony, { canonicalUrl: 'https://thecalmflames.com/products/peony-bloom' });
    expect(html).toContain('<link rel="canonical" href="https://thecalmflames.com/products/peony-bloom" />');
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]);
    expect(ld).toMatchObject({ '@type': 'Product', name: 'Peony Bloom', image: ['https://cdn.example/p.jpg'], offers: { price: '650.00', priceCurrency: 'INR', availability: 'https://schema.org/InStock', url: 'https://thecalmflames.com/products/peony-bloom' } });
    expect(html.match(/<\/script>/g)).toHaveLength(1); // the description's </script> was escaped
    const urli = injectMeta(tpl, await resolveMeta('/products/urli'), { canonicalUrl: 'https://thecalmflames.com/products/urli' });
    expect(urli).not.toContain('application/ld+json'); // unpriced: no Product markup
    expect(urli).toContain('rel="canonical"');
    expect(injectMeta(tpl, await resolveMeta('/products/hidden'), { canonicalUrl: 'https://thecalmflames.com/products/hidden' })).not.toContain('canonical'); // 404
  });
});
