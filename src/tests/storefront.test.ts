/**
 * Phase 4B unit tests (no Firebase, no mocks): routing, SEO meta, storefront data mapping,
 * page content parsing and the safe markdown renderer.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import request from 'supertest';
import { matchRoute, isApiPath, paths, pageTitle, metaDescription, INFO_PAGE_SLUGS } from '../lib/routes';
import { injectMeta, escapeHtml } from '../server/seo';
import {
  resolveTaxonomy,
  canAddToCart,
  priceLabel,
  productBadge,
  withTag,
  hampers,
  withProducts,
  inCollection,
  commonNotes,
  productSubtitle,
  findProductBySlug,
  relatedProducts,
  priceBuckets,
  filterAndSort,
  sizeOptions,
  tileImage
} from '../lib/storefront';
import { productFromDoc } from '../lib/productMapping';
import { pageFromDoc, splitFaq, sortJournal, readingMinutes, validatePage } from '../lib/pages';
import { Markdown } from '../lib/markdown';
import { app } from '../../server';

const P = (id: string, d: Record<string, any> = {}) =>
  productFromDoc(id, { name: id, isActive: true, price: 0, priceStatus: 'missing', ...d });

describe('routing', () => {
  it('matches every route in the design table', () => {
    expect(matchRoute('/')).toEqual({ name: 'home', params: {} });
    expect(matchRoute('/collections/jar-candles')).toEqual({ name: 'collection', params: { slug: 'jar-candles' } });
    expect(matchRoute('/products/peony-bloom/')).toEqual({ name: 'product', params: { slug: 'peony-bloom' } });
    expect(matchRoute('/scent')?.name).toBe('scent');
    expect(matchRoute('/scent/floral')).toEqual({ name: 'scentFamily', params: { family: 'floral' } });
    expect(matchRoute('/gifting')?.name).toBe('gifting');
    expect(matchRoute('/gifting/wedding')).toEqual({ name: 'occasion', params: { occasion: 'wedding' } });
    expect(matchRoute('/journal')?.name).toBe('journal');
    expect(matchRoute('/journal/slow-mornings')).toEqual({ name: 'article', params: { slug: 'slow-mornings' } });
    for (const s of INFO_PAGE_SLUGS) expect(matchRoute(`/${s}`)).toEqual({ name: 'info', params: { slug: s } });
    expect(matchRoute('/support')?.name).toBe('support');
  });

  it('unknown and out-of-phase paths are 404s; API paths are never the SPA', () => {
    for (const p of ['/nope', '/products', '/collections/a/b', '/account', '/order/TCF-1', '/order/TCF-123456']) expect(matchRoute(p)).toBeNull();
    expect(isApiPath('/api/cart/validate')).toBe(true);
    expect(isApiPath('/apiary')).toBe(false);
  });

  it('builds links that round-trip through the matcher', () => {
    expect(matchRoute(paths.product({ id: 'x', slug: 'rose jar' }))?.params.slug).toBe('rose jar');
    expect(paths.product({ id: 'only-id' })).toBe('/products/only-id');
    expect(matchRoute(paths.collection('jar-candles'))?.name).toBe('collection');
    expect(matchRoute(paths.scent('floral'))?.name).toBe('scentFamily');
    expect(matchRoute(paths.gifting('birthday'))?.name).toBe('occasion');
  });

  it('titles and descriptions', () => {
    expect(pageTitle()).toBe('The Calm Flame · Handcrafted candles from India');
    expect(pageTitle('Peony')).toBe('Peony · The Calm Flame');
    expect(metaDescription('')).toMatch(/Handcrafted candles/);
    const long = metaDescription('word '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(161);
    expect(long.endsWith('…')).toBe(true);
    expect(metaDescription('## **Bold** [link](x)')).toBe('Bold link(x)');
  });
});

describe('server: SPA fallback and meta', () => {
  it('injects escaped title, description and og tags', () => {
    const tpl = '<head><title>Old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /></head>';
    const html = injectMeta(tpl, { status: 200, title: 'Rose <Jar> & "Co"', description: "It's lit", image: 'https://x/y.jpg' });
    expect(html).toContain('<title>Rose &lt;Jar&gt; &amp; &quot;Co&quot;</title>');
    expect(html).toContain('content="It&#39;s lit"');
    expect(html).toContain('<meta property="og:image" content="https://x/y.jpg" />');
    expect(injectMeta(tpl, { status: 200, title: 't', description: 'd', image: 'javascript:x' })).not.toContain('og:image');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('unknown API paths answer JSON 404, not the storefront', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found.' });
  });

  it('newsletter validates email before touching storage', async () => {
    expect((await request(app).post('/api/newsletter').send({ email: 'nope' })).status).toBe(400);
    expect((await request(app).post('/api/newsletter').send({ email: 'a@b.co' })).status).toBe(503); // Firestore disabled in unit tests
  });
});

describe('storefront data mapping', () => {
  const products = [
    P('a', { price: 900, priceStatus: 'active', collection: 'jar-candles', scentFamily: 'floral', tags: ['bestseller'], images: ['a1', 'a2'], notes: { top: ['Rose', 'Neroli'] }, sizeCm: '8 x 10', inStock: true, inventoryStatus: 'in_stock', sortOrder: 2 }),
    P('b', { price: 1500, priceStatus: 'active', collection: 'jar-candles', scentFamily: 'floral', tags: ['New'], notes: { top: ['rose'] }, sizeCm: '10 x 12', sortOrder: 1 }),
    P('c', { collection: 'coconut-shell', scentFamily: 'gourmand', occasions: ['wedding'], primaryCategory: 'Gifting', sortOrder: 0 }),
    P('d', { price: 400, priceStatus: 'active', inventoryStatus: 'out_of_stock', tags: ['Grounded', 'hamper'] })
  ];

  it('unpriced or out-of-stock products are never buyable; price labels never invent a price', () => {
    expect(products.map(canAddToCart)).toEqual([true, true, false, false]);
    expect(priceLabel(products[0])).toBe('₹900');
    expect(priceLabel(products[2])).toBe('Price coming soon');
    expect(priceLabel(P('z', { price: 500, priceStatus: 'missing' }))).toBe('Price coming soon');
  });

  it('badges, tags and hampers come from product data', () => {
    expect(products.map(productBadge)).toEqual(['Bestseller', 'New', null, null]);
    expect(withTag(products, 'bestseller').map((p) => p.id)).toEqual(['a']);
    expect(hampers(products).map((p) => p.id)).toEqual(['c', 'd']);
  });

  it('taxonomy: docs override names; empty groups are dropped; images fall back to products', () => {
    const cols = resolveTaxonomy('collections', [{ slug: 'jar-candles', name: 'Glass Jars', sortOrder: 9, headerImage: 'h.jpg' }]);
    expect(cols).toHaveLength(5);
    expect(cols[cols.length - 1]).toMatchObject({ slug: 'jar-candles', name: 'Glass Jars', headerImage: 'h.jpg' });
    expect(cols[0].name).toBe('Pillar & Sculptural');
    const live = withProducts(cols, products, inCollection);
    expect(live.map((c) => c.slug)).toEqual(['coconut-shell', 'jar-candles']);
    expect(tileImage(live[0], inCollection(products, 'coconut-shell'))).toBeUndefined();
    expect(tileImage({ ...live[1], headerImage: undefined }, inCollection(products, 'jar-candles'))).toBe('a1');
  });

  it('notes, subtitles, lookup and related products', () => {
    expect(commonNotes(products)).toEqual(['Rose', 'Neroli']);
    expect(productSubtitle(products[0], 'Floral')).toBe('Floral · rose, neroli');
    expect(productSubtitle(products[2])).toBe('');
    expect(findProductBySlug(products, 'b')?.id).toBe('b');
    expect(findProductBySlug(products, 'missing')).toBeUndefined();
    expect(relatedProducts(products, products[0]).map((p) => p.id)).toEqual(['b']);
  });

  it('collection filters and sorting', () => {
    const many = [900, 1200, 1500, 2200, 2600, 3100].map((price, i) => P(`p${i}`, { price, priceStatus: 'active', sortOrder: i }));
    const buckets = priceBuckets(many);
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    expect(buckets[0].label).toMatch(/^Under ₹/);
    const firstIds = filterAndSort(many, { price: buckets[0].id }, buckets).map((p) => p.id);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds).not.toContain('p5');
    expect(priceBuckets([products[0]])).toEqual([]);
    expect(sizeOptions(products)).toEqual(['8 x 10', '10 x 12']);
    expect(filterAndSort(products, { size: '8 x 10' }).map((p) => p.id)).toEqual(['a']);
    expect(filterAndSort(products, { inStock: true }).map((p) => p.id)).toEqual(['a']);
    expect(filterAndSort(products, { scentFamily: 'gourmand' }).map((p) => p.id)).toEqual(['c']);
    expect(filterAndSort(products, {}).map((p) => p.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(filterAndSort(products, { sort: 'price-asc' }).map((p) => p.id)).toEqual(['d', 'a', 'b', 'c']); // unpriced last
    expect(filterAndSort(products, { sort: 'price-desc' }).map((p) => p.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('site pages content', () => {
  it('parses docs conservatively and never treats drafts as published', () => {
    expect(pageFromDoc('x', { title: 'T', type: 'bogus' })).toBeNull();
    expect(pageFromDoc('x', { title: 'T', type: 'info', body: 'b' })).toMatchObject({ published: false });
    expect(pageFromDoc('x', { title: 'T', type: 'journal', published: true, heroImage: '' })).toMatchObject({ published: true, heroImage: undefined, body: '' });
  });

  it('FAQ markdown splits into questions; journal sorts featured then newest', () => {
    expect(splitFaq('Intro\n## Where is my order?\nUse **tracking**.\n\n## Refunds?\n5 days\n## Empty\n')).toEqual([
      { question: 'Where is my order?', answer: 'Use **tracking**.' },
      { question: 'Refunds?', answer: '5 days' }
    ]);
    const j = (slug: string, d: any) => pageFromDoc(slug, { type: 'journal', title: slug, published: true, ...d })!;
    expect(sortJournal([j('old', { publishedAt: '2026-01-01' }), j('new', { publishedAt: '2026-06-01' }), j('pin', { featured: true, publishedAt: '2025-01-01' })]).map((p) => p.slug)).toEqual(['pin', 'new', 'old']);
    expect(readingMinutes(j('r', { body: 'w '.repeat(450) }))).toBe(2);
    expect(validatePage({ slug: 'Bad Slug', type: 'info', title: 'x' })).toMatch(/Slug/);
    expect(validatePage({ slug: 'ok', type: 'info', title: 'x', heroImage: 'javascript:alert(1)' })).toMatch(/URL/);
  });

  it('markdown renders the supported subset and never injects HTML or script links', () => {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, {
        source: '## Heading\nHello **bold** and *it* <img src=x onerror=alert(1)>\n\n- one\n- two\n\n> quote\n\n[ok](https://a.b) [bad](javascript:alert(1))'
      })
    );
    expect(html).toContain('<h2 class="md-h">Heading</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>it</em>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote class="md-quote">quote</blockquote>');
    expect(html).toContain('href="https://a.b"');
    expect(html).not.toContain('javascript:');
  });
});
