/**
 * scripts/migrate-catalog.ts against the Firestore + Storage emulators (no mocks).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { migrateCatalog } from '../../../scripts/catalog/migrate';
import { getAdminDb, getAdminBucket } from '../../server/firestoreAdmin';
import { clearFirestore, realFetch } from './helpers';
import { CANONICAL_PRODUCTS, HISTORICAL_PRODUCTS } from '../../../scripts/catalog/canonicalCatalog';

const imagesDir = path.resolve(__dirname, '../../assets/images');

async function clearBucket() {
  const [files] = await getAdminBucket().getFiles({ prefix: 'products/' });
  await Promise.all(files.map((f: any) => f.delete()));
}

function run(dryRun = false) {
  return migrateCatalog({
    db: getAdminDb(),
    bucket: getAdminBucket(),
    imagesDir,
    dryRun,
    storageEmulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST
  });
}

describe('catalogue migration (Firestore + Storage emulators)', () => {
  beforeEach(async () => {
    expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'run via npm run test:emulator').toBeTruthy();
    await clearFirestore();
    await clearBucket();
  });

  it('dry run writes nothing', async () => {
    const report = await run(true);
    expect(report.productsCreated).toHaveLength(37);
    expect((await getAdminDb().collection('products').get()).size).toBe(0);
    const [files] = await getAdminBucket().getFiles({ prefix: 'products/' });
    expect(files).toHaveLength(0);
  });

  it('uploads images, writes all products with imageUrl, keeps unpriced products unpriced', async () => {
    const report = await run();
    expect(report.productsCreated).toHaveLength(37);
    expect(report.inventoryCreated).toHaveLength(37);
    expect(report.imagesUploaded.length).toBeGreaterThan(0);

    const snap = await getAdminDb().collection('products').get();
    expect(snap.size).toBe(37);
    const docs = snap.docs.map((d) => d.data());
    const active = docs.filter((d) => d.isActive === true && !d.isHistorical);
    expect(active).toHaveLength(33);
    // Every active product is unpriced exactly as in the source catalogue
    for (const d of active) {
      expect(d.price).toBe(0);
      expect(d.priceStatus).toBe('missing');
    }
    for (const d of docs) {
      expect(d.imageUrl).toMatch(/\/v0\/b\/.+\/o\/products%2F.+\?alt=media&token=/);
      expect(d.galleryImageUrls[0]).toBe(d.imageUrl);
    }
    // Inventory starts unknown and not purchasable
    const inv = (await getAdminDb().collection('inventory').doc('golden-mogra-jar').get()).data();
    expect(inv).toMatchObject({ status: 'unknown', inStock: false, availableQuantity: 0 });

    // The URL actually serves the uploaded photo
    const res = await realFetch(docs[0].imageUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/jpeg/);
  });

  it('is safe to run twice: second run changes nothing and URLs stay stable', async () => {
    await run();
    const before = (await getAdminDb().collection('products').doc('peony-bloom').get()).data();
    const second = await run();
    expect(second.imagesUploaded).toHaveLength(0);
    expect(second.productsCreated).toHaveLength(0);
    expect(second.productsUpdated).toHaveLength(0);
    expect(second.productsUnchanged).toHaveLength(37);
    expect(second.inventoryCreated).toHaveLength(0);
    const after = (await getAdminDb().collection('products').doc('peony-bloom').get()).data();
    expect(after).toEqual(before);
  });

  it('never overwrites owner edits (price, status, photo, stock) on re-run', async () => {
    await run();
    const db = getAdminDb();
    await db.collection('products').doc('peony-bloom').update({
      price: 899,
      priceStatus: 'active',
      isActive: false,
      imageUrl: 'https://example.com/owner-photo.jpg'
    });
    await db.collection('inventory').doc('peony-bloom').update({ availableQuantity: 7, status: 'in_stock', inStock: true });
    await run();
    expect((await db.collection('products').doc('peony-bloom').get()).data()).toMatchObject({
      price: 899,
      priceStatus: 'active',
      isActive: false,
      imageUrl: 'https://example.com/owner-photo.jpg'
    });
    expect((await db.collection('inventory').doc('peony-bloom').get()).data()).toMatchObject({ availableQuantity: 7 });
  });

  it('sets sortOrder from the original catalogue position, only when missing', async () => {
    const db = getAdminDb();
    // Legacy doc (old seeding) without sortOrder, and one with an owner-chosen order
    await db.collection('products').doc('royal-urli').set({ name: 'Royal Urli', price: 0, isActive: true });
    await db.collection('products').doc('peony-bloom').set({ name: 'Peony Bloom', price: 0, isActive: true, sortOrder: 1 });
    await run();

    const all = (await db.collection('products').get()).docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const order = all.filter((d) => d.id !== 'peony-bloom').sort((a, b) => a.sortOrder - b.sortOrder).map((d) => d.id);
    const expected = [...CANONICAL_PRODUCTS, ...HISTORICAL_PRODUCTS].map((p) => p.id).filter((id) => id !== 'peony-bloom');
    expect(order).toEqual(expected);
    expect(all.find((d) => d.id === 'royal-urli').sortOrder).toBe(CANONICAL_PRODUCTS.findIndex((p) => p.id === 'royal-urli'));
    expect(all.find((d) => d.id === 'peony-bloom').sortOrder).toBe(1); // owner order kept

    // Owner reorders after migration; a re-run never overrides it
    await db.collection('products').doc('royal-urli').update({ sortOrder: 0 });
    await run();
    expect((await db.collection('products').doc('royal-urli').get()).data()!.sortOrder).toBe(0);
    expect((await db.collection('products').doc('peony-bloom').get()).data()!.sortOrder).toBe(1);
  });

  it('fills missing fields on legacy docs without inventing a price status', async () => {
    const db = getAdminDb();
    // Legacy doc as written by the old client-side seeding: price set, no priceStatus, bundled image path
    await db.collection('products').doc('modak').set({ name: 'Modak', price: 450, image: '/assets/modak.jpg', isActive: true });
    const report = await run();
    const modak = (await db.collection('products').doc('modak').get()).data()!;
    expect(modak.price).toBe(450); // kept
    expect(modak.priceStatus).toBe('missing'); // not inferred as active
    expect(modak.imageUrl).toMatch(/products%2Fmodak_candles/);
    expect(report.warnings.some((w) => w.startsWith('modak: has price'))).toBe(true);
  });
});
