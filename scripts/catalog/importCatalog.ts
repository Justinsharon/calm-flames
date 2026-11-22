/**
 * Catalogue import (scripts/import-catalog.ts). Reads an .xlsx or .csv, matches rows to
 * Firestore `products/{ID}` and reports or applies the changes.
 *
 * Safety rules:
 *  - Dry run unless `apply` is set.
 *  - A blank cell never changes anything (no field is ever cleared by an import).
 *  - Prices come only from the file's Price cell: a price > 0 makes the product buyable
 *    (priceStatus 'active'); 0 makes it unbuyable ('missing'). No other code path sets a price.
 *  - New products are created hidden (isActive: false) until activated in the admin dashboard.
 *  - A row with any error is skipped entirely.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COLLECTION_SLUGS,
  SCENT_FAMILY_SLUGS,
  OCCASION_SLUGS,
  PRODUCT_BADGE_TAGS,
  TAXONOMY_SEED_NAMES,
  isOneOf,
  type TaxonomyKind
} from '../../src/lib/taxonomy';
import type { BucketLike } from './migrate';
import { downloadUrl } from './migrate';

export const IMPORT_COLUMNS = [
  'ID', 'Name', 'Collection', 'Price', 'Stock', 'Short description', 'Full description', 'Scent family',
  'Top notes', 'Heart notes', 'Base notes', 'Burn time', 'Weight', 'Size', 'Ingredients', 'Tags',
  'Occasions', 'Box eligible'
] as const;

export type RawRow = Record<string, string>;

/** Fields an import row can set on products/{id}. Undefined = blank cell = leave alone. */
export interface RowFields {
  name?: string;
  collection?: string;
  price?: number;
  shortDescription?: string;
  description?: string;
  scentFamily?: string;
  notesTop?: string[];
  notesHeart?: string[];
  notesBase?: string[];
  burnTimeHours?: number;
  weightGrams?: number;
  sizeCm?: string;
  ingredients?: string;
  badges?: string[];
  occasions?: string[];
  boxEligible?: boolean;
}

export interface ParsedRow {
  rowNumber: number;
  id: string;
  fields: RowFields;
  stock?: number;
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Normalise header names (case / spacing insensitive) to the canonical column names. */
export function normaliseRow(raw: Record<string, unknown>): RawRow {
  const byKey = new Map(IMPORT_COLUMNS.map((c) => [norm(c), c]));
  const out: RawRow = {};
  for (const [k, v] of Object.entries(raw)) {
    const col = byKey.get(norm(k));
    if (col) out[col] = v === null || v === undefined ? '' : String(v).trim();
  }
  return out;
}

function list(cell: string): string[] {
  return cell.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean);
}

function slugFor(kind: TaxonomyKind, allowed: readonly string[], value: string): string | null {
  const v = norm(value);
  for (const slug of allowed) {
    if (v === slug || v === norm(TAXONOMY_SEED_NAMES[kind][slug] || '') || v === slug.replace(/-/g, ' ')) return slug;
  }
  return null;
}

function parseMoney(cell: string): number | null {
  const n = Number(cell.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function firstNumber(cell: string): number | null {
  const m = cell.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function parseImportRow(raw: RawRow, rowNumber: number): ParsedRow {
  const errors: string[] = [];
  const fields: RowFields = {};
  const id = (raw['ID'] || '').trim();
  if (!id) errors.push('ID is required.');
  else if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) errors.push(`ID "${id}" must be lowercase letters, digits and hyphens.`);

  const cell = (c: (typeof IMPORT_COLUMNS)[number]) => (raw[c] ?? '').trim();

  if (cell('Name')) fields.name = cell('Name');
  if (cell('Collection')) {
    const s = slugFor('collections', COLLECTION_SLUGS, cell('Collection'));
    if (s) fields.collection = s;
    else errors.push(`Unknown collection "${cell('Collection')}" (use one of: ${COLLECTION_SLUGS.join(', ')}).`);
  }
  if (cell('Price')) {
    const p = parseMoney(cell('Price'));
    if (p === null) errors.push(`Price "${cell('Price')}" is not a number.`);
    else fields.price = p;
  }
  let stock: number | undefined;
  if (cell('Stock')) {
    const n = Number(cell('Stock'));
    if (!Number.isInteger(n) || n < 0 || n > 100000) errors.push(`Stock "${cell('Stock')}" must be a whole number 0-100000.`);
    else stock = n;
  }
  if (cell('Short description')) {
    if (cell('Short description').length > 500) errors.push('Short description is longer than 500 characters.');
    else fields.shortDescription = cell('Short description');
  }
  if (cell('Full description')) {
    if (cell('Full description').length > 5000) errors.push('Full description is longer than 5000 characters.');
    else fields.description = cell('Full description');
  }
  if (cell('Scent family')) {
    const s = slugFor('scentFamilies', SCENT_FAMILY_SLUGS, cell('Scent family'));
    if (s) fields.scentFamily = s;
    else errors.push(`Unknown scent family "${cell('Scent family')}" (use one of: ${SCENT_FAMILY_SLUGS.join(', ')}).`);
  }
  if (cell('Top notes')) fields.notesTop = list(cell('Top notes'));
  if (cell('Heart notes')) fields.notesHeart = list(cell('Heart notes'));
  if (cell('Base notes')) fields.notesBase = list(cell('Base notes'));
  if (cell('Burn time')) {
    const n = firstNumber(cell('Burn time'));
    if (n === null) errors.push(`Burn time "${cell('Burn time')}" has no number of hours.`);
    else fields.burnTimeHours = n;
  }
  if (cell('Weight')) {
    const n = firstNumber(cell('Weight'));
    if (n === null) errors.push(`Weight "${cell('Weight')}" has no number.`);
    else fields.weightGrams = /kg/i.test(cell('Weight')) ? n * 1000 : n;
  }
  if (cell('Size')) {
    const s = cell('Size').replace(/\s*cm\s*$/i, '');
    if (s.length > 40) errors.push('Size is longer than 40 characters.');
    else fields.sizeCm = s;
  }
  if (cell('Ingredients')) fields.ingredients = cell('Ingredients');
  if (cell('Tags')) {
    const tags = list(cell('Tags')).map((t) => t.toLowerCase());
    const bad = tags.filter((t) => !isOneOf(PRODUCT_BADGE_TAGS, t));
    if (bad.length) errors.push(`Unknown tag(s) ${bad.join(', ')} (use: ${PRODUCT_BADGE_TAGS.join(', ')}).`);
    else fields.badges = [...new Set(tags)];
  }
  if (cell('Occasions')) {
    const out: string[] = [];
    for (const o of list(cell('Occasions'))) {
      const s = slugFor('occasions', OCCASION_SLUGS, o);
      if (s) out.push(s);
      else errors.push(`Unknown occasion "${o}" (use: ${OCCASION_SLUGS.join(', ')}).`);
    }
    fields.occasions = [...new Set(out)];
  }
  if (cell('Box eligible')) {
    const v = norm(cell('Box eligible'));
    if (['yes', 'y', 'true', '1'].includes(v)) fields.boxEligible = true;
    else if (['no', 'n', 'false', '0'].includes(v)) fields.boxEligible = false;
    else errors.push(`Box eligible "${cell('Box eligible')}" must be yes or no.`);
  }
  return { rowNumber, id, fields, stock, errors };
}

/** Read .xlsx (first worksheet) or .csv into header-keyed rows. */
export async function readSpreadsheet(file: string): Promise<RawRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ext = path.extname(file).toLowerCase();
  let ws: any;
  if (ext === '.xlsx') {
    await wb.xlsx.readFile(file);
    ws = wb.worksheets[0];
  } else if (ext === '.csv') {
    ws = await wb.csv.readFile(file, { parserOptions: { trim: true } } as any);
  } else {
    throw new Error(`Unsupported file type "${ext}" (use .xlsx or .csv).`);
  }
  if (!ws) return [];
  const cellText = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
      if ('text' in v) return String(v.text);
      if ('result' in v) return cellText(v.result);
      if (v instanceof Date) return v.toISOString();
    }
    return String(v);
  };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c: any, col: number) => (headers[col] = cellText(c.value).trim()));
  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: Record<string, string> = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const t = cellText(row.getCell(col).value).trim();
      if (t) any = true;
      raw[h] = t;
    });
    if (any) rows.push({ ...normaliseRow(raw), __row: String(r) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
export interface PhotoPlan {
  files: { file: string; index: number; storagePath: string; md5: string; ext: string }[];
}

const PHOTO_RE = /^(.+)-(\d+)\.(jpe?g|png|webp)$/i;
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Photos named <ID>-1.jpg, <ID>-2.jpg … grouped by ID, in number order. */
export function scanPhotos(dir: string): Map<string, PhotoPlan> {
  const out = new Map<string, PhotoPlan>();
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(PHOTO_RE);
    if (!m) continue;
    const [, id, n, extRaw] = m;
    const ext = extRaw.toLowerCase();
    const buf = fs.readFileSync(path.join(dir, name));
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const plan = out.get(id) || { files: [] };
    plan.files.push({
      file: path.join(dir, name),
      index: Number(n),
      ext,
      md5,
      // content-addressed: same photo -> same path, so re-runs don't re-upload or change URLs
      storagePath: `products/${id}/import-${Number(n)}-${md5.slice(0, 12)}.${ext}`
    });
    out.set(id, plan);
  }
  for (const p of out.values()) p.files.sort((a, b) => a.index - b.index);
  return out;
}

async function uploadPhoto(bucket: BucketLike, f: PhotoPlan['files'][number], emulatorHost?: string): Promise<string> {
  const obj = bucket.file(f.storagePath);
  const [exists] = await obj.exists();
  let token: string | undefined;
  if (exists) {
    const [meta] = await obj.getMetadata();
    token = meta?.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
  }
  if (!exists || !token) {
    token = token || crypto.randomUUID();
    const buf = fs.readFileSync(f.file);
    if (buf.length > 5 * 1024 * 1024) throw new Error(`${path.basename(f.file)} is larger than 5 MB.`);
    await obj.save(buf, {
      resumable: false,
      contentType: CONTENT_TYPES[f.ext],
      metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } }
    });
  }
  return downloadUrl(bucket.name, f.storagePath, token, emulatorHost);
}

// ---------------------------------------------------------------------------
export type RowStatus = 'new' | 'updated' | 'unchanged' | 'error';
export interface RowReport {
  rowNumber: number;
  id: string;
  status: RowStatus;
  changes: string[];
  errors: string[];
}
export interface ImportReport {
  applied: boolean;
  rows: RowReport[];
  counts: Record<RowStatus, number>;
  unmatchedPhotoIds: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const BADGES = PRODUCT_BADGE_TAGS as readonly string[];

/** Compute the product-doc updates for one row against the existing doc (pure). */
export function diffRow(row: ParsedRow, existing: Record<string, any> | null): { updates: Record<string, any>; changes: string[] } {
  const f = row.fields;
  const u: Record<string, any> = {};
  const setIf = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (!existing || !same(existing[key], value)) u[key] = value;
  };
  setIf('name', f.name);
  setIf('collection', f.collection);
  if (f.price !== undefined) {
    setIf('price', f.price);
    setIf('priceStatus', f.price > 0 ? 'active' : 'missing');
  }
  setIf('shortDescription', f.shortDescription);
  setIf('description', f.description);
  setIf('scentFamily', f.scentFamily);
  if (f.notesTop || f.notesHeart || f.notesBase) {
    const cur = (existing?.notes as Record<string, string[]>) || {};
    const next = { ...cur };
    if (f.notesTop) next.top = f.notesTop;
    if (f.notesHeart) next.heart = f.notesHeart;
    if (f.notesBase) next.base = f.notesBase;
    setIf('notes', next);
  }
  setIf('burnTimeHours', f.burnTimeHours);
  setIf('weightGrams', f.weightGrams);
  setIf('sizeCm', f.sizeCm);
  setIf('ingredients', f.ingredients);
  if (f.badges) {
    const legacy = (Array.isArray(existing?.tags) ? existing!.tags : []).filter((t: string) => !BADGES.includes(t));
    setIf('tags', [...legacy, ...f.badges]);
  }
  setIf('occasions', f.occasions);
  setIf('boxEligible', f.boxEligible);
  const changes = Object.keys(u).map((k) => (k === 'notes' ? 'notes' : k));
  return { updates: u, changes };
}

export interface ImportOptions {
  db: Firestore;
  bucket?: BucketLike;
  rows: RawRow[];
  photosDir?: string;
  apply?: boolean;
  storageEmulatorHost?: string;
}

export async function importCatalog(opts: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = { applied: Boolean(opts.apply), rows: [], counts: { new: 0, updated: 0, unchanged: 0, error: 0 }, unmatchedPhotoIds: [] };
  const photos = opts.photosDir ? scanPhotos(opts.photosDir) : new Map<string, PhotoPlan>();
  const seen = new Set<string>();
  const now = new Date().toISOString();

  const parsed = opts.rows.map((r, i) => parseImportRow(r, Number(r.__row) || i + 2));
  const ids = new Set(parsed.map((p) => p.id));
  report.unmatchedPhotoIds = [...photos.keys()].filter((id) => !ids.has(id)).sort();

  for (const row of parsed) {
    const errors = [...row.errors];
    if (row.id && seen.has(row.id)) errors.push(`Duplicate ID "${row.id}" (an earlier row already uses it).`);
    seen.add(row.id);

    const productRef = row.id ? opts.db.collection('products').doc(row.id) : null;
    const existing = productRef && errors.length === 0 ? (await productRef.get()).data() || null : null;
    if (!existing && errors.length === 0 && !row.fields.name) errors.push('New product needs a Name.');

    const photoPlan = photos.get(row.id);
    if (photoPlan && !opts.bucket) errors.push('Photos found but no Storage bucket configured.');
    if (photoPlan && photoPlan.files.some((f) => fs.statSync(f.file).size > 5 * 1024 * 1024)) {
      errors.push('A photo is larger than 5 MB.');
    }

    if (errors.length > 0) {
      report.rows.push({ rowNumber: row.rowNumber, id: row.id, status: 'error', changes: [], errors });
      report.counts.error++;
      continue;
    }

    const { changes } = diffRow(row, existing);
    // photos: compare expected storage paths with the current images
    const existingImages: string[] = Array.isArray(existing?.images) ? existing!.images : [];
    const photosChange =
      photoPlan &&
      (existingImages.length !== photoPlan.files.length ||
        photoPlan.files.some((f, i) => !String(existingImages[i] || '').includes(encodeURIComponent(f.storagePath))));
    if (photosChange) changes.push(`images (${photoPlan!.files.length} photo${photoPlan!.files.length === 1 ? '' : 's'})`);

    const invRef = opts.db.collection('inventory').doc(row.id);
    if (row.stock !== undefined) {
      const inv = (await invRef.get()).data();
      if (!inv || inv.availableQuantity !== row.stock || inv.status === 'unknown') changes.push('stock');
    }

    const status: RowStatus = !existing ? 'new' : changes.length ? 'updated' : 'unchanged';
    report.rows.push({ rowNumber: row.rowNumber, id: row.id, status, changes, errors: [] });
    report.counts[status]++;
    if (!opts.apply || status === 'unchanged') continue;

    // ---- apply ----
    let imageUrls: string[] | undefined;
    if (photosChange) {
      imageUrls = [];
      for (const f of photoPlan!.files) imageUrls.push(await uploadPhoto(opts.bucket!, f, opts.storageEmulatorHost));
    }

    await opts.db.runTransaction(async (tx) => {
      const snap = await tx.get(productRef!);
      const invSnap = row.stock !== undefined ? await tx.get(invRef) : null;
      const cur = snap.exists ? snap.data()! : null;
      const { updates } = diffRow(row, cur); // recompute against the transaction's read
      if (imageUrls) {
        updates.images = imageUrls;
        updates.imageUrl = imageUrls[0];
        updates.galleryImageUrls = imageUrls;
      }
      if (row.stock !== undefined) {
        const reserved = invSnap?.exists ? Number(invSnap.data()!.reservedQuantity) || 0 : 0;
        const st = row.stock > 0 ? 'in_stock' : 'out_of_stock';
        tx.set(
          invRef,
          { productId: row.id, availableQuantity: row.stock, reservedQuantity: reserved, quantity: row.stock + reserved, inStock: row.stock > 0, status: st, updatedAt: now },
          { merge: true }
        );
        updates.inStock = row.stock > 0;
        updates.inventoryStatus = st;
        updates.availableStock = row.stock;
      }
      if (!cur) {
        tx.set(productRef!, {
          id: row.id,
          slug: row.id,
          price: 0,
          priceStatus: 'missing',
          isActive: false, // hidden until activated in the admin dashboard
          isHistorical: false,
          categories: [],
          moods: [],
          inStock: false,
          inventoryStatus: 'unknown',
          createdAt: now,
          ...updates,
          updatedAt: now
        });
        if (row.stock === undefined) {
          tx.set(invRef, { productId: row.id, availableQuantity: 0, reservedQuantity: 0, quantity: 0, inStock: false, status: 'unknown', updatedAt: now }, { merge: true });
        }
      } else if (Object.keys(updates).length) {
        tx.update(productRef!, { ...updates, updatedAt: now });
      }
    });
  }
  return report;
}

export function formatReport(r: ImportReport): string {
  const lines: string[] = [];
  lines.push(r.applied ? 'APPLIED changes:' : 'DRY RUN (nothing written). Re-run with --apply to write:');
  for (const row of r.rows) {
    const label = row.status.toUpperCase().padEnd(9);
    const detail = row.status === 'error' ? row.errors.join(' | ') : row.changes.join(', ') || '-';
    lines.push(`  row ${String(row.rowNumber).padEnd(4)} ${row.id.padEnd(32)} ${label} ${detail}`);
  }
  lines.push(`Summary: ${r.counts.new} new, ${r.counts.updated} updated, ${r.counts.unchanged} unchanged, ${r.counts.error} errors.`);
  if (r.unmatchedPhotoIds.length) lines.push(`Photos with no matching row (ignored): ${r.unmatchedPhotoIds.join(', ')}`);
  return lines.join('\n');
}
