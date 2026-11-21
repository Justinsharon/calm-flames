/**
 * Core of scripts/migrate-catalog.ts (kept separate so the emulator tests can run it).
 *
 * Safe to run any number of times:
 *  - Images: uploaded to Storage at `products/<file>` only if missing or changed (MD5 compared);
 *    an existing download token is reused, so URLs stay stable between runs.
 *  - Products: a missing doc is created in full. An existing doc only gets fields it does not
 *    have yet; nothing already in Firestore is overwritten (owner-entered prices, priceStatus,
 *    active flags, photos uploaded from the admin dashboard, stock mirrors...).
 *  - Inventory: `inventory/{id}` is created (status unknown, 0 available) only if missing.
 *  - Prices: written exactly as in the source catalogue. Unpriced products stay
 *    `price: 0, priceStatus: 'missing'`. No price is ever invented.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CANONICAL_PRODUCTS,
  HISTORICAL_PRODUCTS,
  type CanonicalProduct
} from '../../src/data/canonicalCatalog';
import { PRODUCT_IMAGE_FILES } from './productImages';
import { stripUndefined, type ProductDoc } from '../../src/lib/productMapping';

export interface BucketLike {
  name: string;
  file(path: string): any;
}

export interface MigrationOptions {
  db: Firestore;
  bucket: BucketLike;
  imagesDir: string;
  dryRun?: boolean;
  log?: (msg: string) => void;
  /** Only used to build download URLs when running against the Storage emulator. */
  storageEmulatorHost?: string;
}

export interface MigrationReport {
  imagesUploaded: string[];
  imagesUnchanged: string[];
  productsCreated: string[];
  productsUpdated: { id: string; fieldsAdded: string[] }[];
  productsUnchanged: string[];
  inventoryCreated: string[];
  warnings: string[];
}

function md5Base64(buf: Buffer): string {
  return crypto.createHash('md5').update(buf).digest('base64');
}

export function downloadUrl(bucketName: string, objectPath: string, token: string, emulatorHost?: string): string {
  const base = emulatorHost ? `http://${emulatorHost}` : 'https://firebasestorage.googleapis.com';
  return `${base}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

/** Upload (if needed) and return the stable download URL for one image file. */
async function ensureImage(
  opts: MigrationOptions,
  fileName: string,
  report: MigrationReport
): Promise<{ url: string; storagePath: string }> {
  const localPath = path.join(opts.imagesDir, fileName);
  if (!fs.existsSync(localPath)) throw new Error(`Image file not found: ${localPath}`);
  const buf = fs.readFileSync(localPath);
  const localMd5 = md5Base64(buf);
  const storagePath = `products/${fileName}`;
  const file = opts.bucket.file(storagePath);

  const [exists] = await file.exists();
  let token: string | undefined;
  if (exists) {
    const [meta] = await file.getMetadata();
    token = meta?.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
    if (meta?.md5Hash === localMd5 && token) {
      report.imagesUnchanged.push(fileName);
      return { url: downloadUrl(opts.bucket.name, storagePath, token, opts.storageEmulatorHost), storagePath };
    }
  }

  token = token || crypto.randomUUID();
  if (!opts.dryRun) {
    await file.save(buf, {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token }
      }
    });
  }
  report.imagesUploaded.push(fileName);
  return { url: downloadUrl(opts.bucket.name, storagePath, token, opts.storageEmulatorHost), storagePath };
}

export function buildProductDoc(
  cp: CanonicalProduct,
  images: { url: string; storagePath: string }[],
  now: string,
  sortOrder: number
): ProductDoc {
  return stripUndefined({
    sortOrder,
    id: cp.id,
    slug: cp.slug,
    name: cp.name,
    sku: `TCF-${cp.id.toUpperCase().replace(/-/g, '')}`,
    tagline: cp.tagline,
    price: cp.price,
    originalPrice: cp.originalPrice,
    priceStatus: cp.priceStatus,
    primaryCategory: cp.primaryCategory,
    subcategory: cp.subcategory,
    collections: cp.collections,
    tags: cp.tags,
    weight: cp.weight,
    dimensions: cp.dimensions,
    fragrance: cp.fragrance,
    burnTime: cp.burnTime,
    scentFamily: cp.scentFamily,
    shortDescription: cp.shortDescription,
    longDescription: cp.longDescription,
    howItFeels: cp.howItFeels,
    customisation: cp.customisation,
    featured: cp.featured ?? false,
    isActive: cp.isActive,
    isHistorical: cp.isHistorical ?? false,
    categories: cp.categories,
    moods: cp.moods,
    inStock: false,
    inventoryStatus: 'unknown',
    imageUrl: images[0]?.url,
    galleryImageUrls: images.map((i) => i.url),
    imageStoragePath: images[0]?.storagePath,
    createdAt: now,
    updatedAt: now
  } as ProductDoc);
}

export async function migrateCatalog(opts: MigrationOptions): Promise<MigrationReport> {
  const log = opts.log || (() => {});
  const report: MigrationReport = {
    imagesUploaded: [],
    imagesUnchanged: [],
    productsCreated: [],
    productsUpdated: [],
    productsUnchanged: [],
    inventoryCreated: [],
    warnings: []
  };

  const all = [...CANONICAL_PRODUCTS, ...HISTORICAL_PRODUCTS];

  // 1. Images (each file once, even when shared by several products)
  const urlByFile = new Map<string, { url: string; storagePath: string }>();
  for (const cp of all) {
    const files = PRODUCT_IMAGE_FILES[cp.id];
    if (!files || files.length === 0) {
      report.warnings.push(`${cp.id}: no image mapping; product will have no photo.`);
      continue;
    }
    for (const f of files) {
      if (!urlByFile.has(f)) urlByFile.set(f, await ensureImage(opts, f, report));
    }
  }
  log(`Images: ${report.imagesUploaded.length} uploaded, ${report.imagesUnchanged.length} unchanged.`);

  // 2. Products + inventory
  const now = new Date().toISOString();
  for (const [index, cp] of all.entries()) {
    const images = (PRODUCT_IMAGE_FILES[cp.id] || []).map((f) => urlByFile.get(f)!);
    const desired = buildProductDoc(cp, images, now, index);
    const productRef = opts.db.collection('products').doc(cp.id);
    const inventoryRef = opts.db.collection('inventory').doc(cp.id);

    await opts.db.runTransaction(async (tx) => {
      const [snap, invSnap] = await Promise.all([tx.get(productRef), tx.get(inventoryRef)]);

      if (!snap.exists) {
        if (!opts.dryRun) tx.set(productRef, desired);
        report.productsCreated.push(cp.id);
      } else {
        const existing = snap.data() || {};
        const additions: Record<string, any> = {};
        for (const [k, v] of Object.entries(desired)) {
          if (k === 'createdAt' || k === 'updatedAt') continue;
          if (existing[k] !== undefined) continue;
          if (k === 'priceStatus' && typeof existing.price === 'number' && existing.price > 0) {
            report.warnings.push(
              `${cp.id}: has price ₹${existing.price} but no priceStatus. Set priceStatus to 'missing' ` +
                `(not buyable). Confirm the price in the admin dashboard to make it buyable.`
            );
          }
          additions[k] = v;
        }
        if (Object.keys(additions).length > 0) {
          if (!opts.dryRun) tx.update(productRef, { ...additions, updatedAt: now });
          report.productsUpdated.push({ id: cp.id, fieldsAdded: Object.keys(additions) });
        } else {
          report.productsUnchanged.push(cp.id);
        }
        if (existing.priceStatus === 'active' && !(typeof existing.price === 'number' && existing.price > 0)) {
          report.warnings.push(`${cp.id}: priceStatus is 'active' but price is not positive; it is not buyable.`);
        }
      }

      if (!invSnap.exists) {
        if (!opts.dryRun) {
          tx.set(inventoryRef, {
            productId: cp.id,
            sku: desired.sku,
            inStock: false,
            status: 'unknown',
            quantity: 0,
            availableQuantity: 0,
            reservedQuantity: 0,
            updatedAt: now
          });
        }
        report.inventoryCreated.push(cp.id);
      }
    });
  }

  log(
    `Products: ${report.productsCreated.length} created, ${report.productsUpdated.length} updated ` +
      `(missing fields only), ${report.productsUnchanged.length} unchanged. ` +
      `Inventory docs created: ${report.inventoryCreated.length}.`
  );
  for (const w of report.warnings) log(`WARNING: ${w}`);
  return report;
}
