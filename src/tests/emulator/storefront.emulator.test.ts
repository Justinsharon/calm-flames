/**
 * Phase 4B against the Firestore emulator (no mocks): `pages` security rules, newsletter storage,
 * server-side per-URL meta/404 for the SPA.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { app } from '../../../server';
import { getAdminDb } from '../../server/firestoreAdmin';
import { resolveMeta } from '../../server/seo';
import { savePage } from '../../services/adminPagesService';
import { clearFirestore } from './helpers';
import { clientFor, deleteClientApps } from './clientApps';

const ADMIN = { uid: 'admin-uid', admin: true };

beforeEach(async () => {
  await clearFirestore();
  const db = getAdminDb();
  await db.collection('customers').doc('admin-uid').set({ role: 'admin' });
  await db.collection('pages').doc('shipping').set({ slug: 'shipping', type: 'info', title: 'Shipping', body: 'Live text', published: true, summary: 'How we ship' });
  await db.collection('pages').doc('returns').set({ slug: 'returns', type: 'info', title: 'Returns', body: 'Draft', published: false });
  await db.collection('pages').doc('slow-mornings').set({ slug: 'slow-mornings', type: 'journal', title: 'Slow mornings', body: 'x', published: true });
  await db.collection('products').doc('peony-bloom').set({ slug: 'peony-bloom', name: 'Peony <Bloom>', price: 0, priceStatus: 'missing', isActive: true, shortDescription: 'Layered petals', images: ['https://img/p.jpg'] });
  await db.collection('products').doc('jasmine-sage').set({ slug: 'jasmine-sage', name: 'Jasmine', price: 0, priceStatus: 'missing', isActive: false, isHistorical: true });
  await db.collection('collections').doc('jar-candles').set({ slug: 'jar-candles', name: 'Glass Jars', description: 'Poured in glass', sortOrder: 1 });
});
afterAll(async () => {
  await deleteClientApps();
});

describe('pages rules', () => {
  it('visitors read published pages only (queries must filter on published)', async () => {
    const v = clientFor();
    expect((await getDoc(doc(v.db, 'pages', 'shipping'))).data()).toMatchObject({ body: 'Live text' });
    await expect(getDoc(doc(v.db, 'pages', 'returns'))).rejects.toMatchObject({ code: 'permission-denied' });
    const pub = await getDocs(query(collection(v.db, 'pages'), where('published', '==', true), where('type', '==', 'journal')));
    expect(pub.docs.map((d) => d.id)).toEqual(['slow-mornings']);
    await expect(getDocs(collection(v.db, 'pages'))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('only admins write, and documents are validated', async () => {
    await expect(setDoc(doc(clientFor({ uid: 'someone' }).db, 'pages', 'terms'), { slug: 'terms', type: 'info', title: 'T', body: '', published: true }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    const admin = clientFor(ADMIN);
    await savePage({ slug: 'terms', type: 'info', title: 'Terms', body: '## One', published: true }, admin);
    expect((await getAdminDb().collection('pages').doc('terms').get()).data()).toMatchObject({ title: 'Terms', published: true });
    await expect(setDoc(doc(admin.db, 'pages', 'x'), { slug: 'y', type: 'info', title: 'T', body: '', published: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'pages', 'x'), { slug: 'x', type: 'blog', title: 'T', body: '', published: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('newsletter collection is server-only', async () => {
    await expect(getDocs(collection(clientFor(ADMIN).db, 'newsletterSubscribers'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('newsletter endpoint', () => {
  it('stores one record per email, idempotently', async () => {
    expect((await request(app).post('/api/newsletter').send({ email: ' Asha@Example.com ' })).status).toBe(200);
    expect((await request(app).post('/api/newsletter').send({ email: 'asha@example.com' })).status).toBe(200);
    const docs = (await getAdminDb().collection('newsletterSubscribers').get()).docs.map((d) => d.data());
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ email: 'asha@example.com', source: 'storefront' });
  });
});

describe('server meta for storefront URLs', () => {
  it('product, collection, info and journal URLs get their own title/description; unknown ones 404', async () => {
    expect(await resolveMeta('/products/peony-bloom')).toMatchObject({ status: 200, title: 'Peony <Bloom> · The Calm Flame', description: 'Layered petals', image: 'https://img/p.jpg' });
    expect((await resolveMeta('/products/jasmine-sage')).status).toBe(404); // inactive/historical
    expect((await resolveMeta('/products/nope')).status).toBe(404);
    expect(await resolveMeta('/collections/jar-candles')).toMatchObject({ status: 200, title: 'Glass Jars collection · The Calm Flame', description: 'Poured in glass' });
    expect(await resolveMeta('/collections/coconut-shell')).toMatchObject({ status: 200, title: 'Coconut Shell collection · The Calm Flame' });
    expect((await resolveMeta('/collections/tealights')).status).toBe(404);
    expect(await resolveMeta('/shipping')).toMatchObject({ status: 200, title: 'Shipping · The Calm Flame', description: 'How we ship' });
    expect(await resolveMeta('/returns')).toMatchObject({ status: 200, title: 'Returns · The Calm Flame' }); // draft: default text only
    expect((await resolveMeta('/journal/slow-mornings')).title).toBe('Slow mornings · The Calm Flame');
    expect((await resolveMeta('/journal/draft-or-missing')).status).toBe(404);
    expect((await resolveMeta('/scent/oceanic')).status).toBe(404);
    expect((await resolveMeta('/cart')).status).toBe(404);
  });
});
