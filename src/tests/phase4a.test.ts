/**
 * Phase 4a unit tests (no Firebase, no mocks): import parsing/diffing, spreadsheet reading,
 * store-settings gating, product mapping of the new fields, startup feature status.
 */
import { describe, it, expect } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { parseImportRow, diffRow, readSpreadsheet, IMPORT_COLUMNS } from '../../scripts/catalog/importCatalog';
import {
  parseStoreSettings,
  getShippingConfig,
  getCodConfig,
  getBuildABoxConfig,
  computeShipping,
  validateStoreSettings
} from '../lib/storeSettings';
import { productFromDoc } from '../lib/productMapping';
import { validateProductDetails, validateTaxonomyEdit } from '../lib/adminValidation';
import { featureStatus } from '../../server';

const row = (cells: Record<string, string>) => parseImportRow(cells as any, 2);

describe('import: row parsing', () => {
  it('parses a full row, accepting names or slugs', () => {
    const r = row({
      ID: 'rose-jar', Name: 'Rose Jar', Collection: 'Jar Candles', Price: '₹1,299', Stock: '12',
      'Short description': 'Short', 'Full description': 'Long', 'Scent family': 'Spicy & Resinous',
      'Top notes': 'rose, bergamot', 'Heart notes': 'oud', 'Base notes': 'amber; musk', 'Burn time': '40 hours',
      Weight: '0.2 kg', Size: '8 x 10 cm', Ingredients: 'soy wax', Tags: 'Bestseller, new', Occasions: 'Wedding, housewarming',
      'Box eligible': 'Yes'
    });
    expect(r.errors).toEqual([]);
    expect(r.stock).toBe(12);
    expect(r.fields).toEqual({
      name: 'Rose Jar', collection: 'jar-candles', price: 1299, shortDescription: 'Short', description: 'Long',
      scentFamily: 'spicy-resinous', notesTop: ['rose', 'bergamot'], notesHeart: ['oud'], notesBase: ['amber', 'musk'],
      burnTimeHours: 40, weightGrams: 200, sizeCm: '8 x 10', ingredients: 'soy wax', badges: ['bestseller', 'new'],
      occasions: ['wedding', 'housewarming'], boxEligible: true
    });
  });

  it('blank cells set nothing', () => {
    const r = row({ ID: 'rose-jar' });
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual({});
    expect(r.stock).toBeUndefined();
  });

  it('reports every invalid cell', () => {
    const r = row({
      ID: 'Bad ID!', Collection: 'tealights', Price: 'abc', Stock: '2.5', 'Scent family': 'oceanic',
      Tags: 'sale', Occasions: 'diwali', 'Box eligible': 'maybe', 'Burn time': 'long'
    });
    expect(r.errors).toHaveLength(9);
  });
});

describe('import: diff', () => {
  const parsed = (cells: Record<string, string>) => row({ ID: 'p', ...cells });

  it('price > 0 makes it buyable, 0 unbuyable; blank price never touches price', () => {
    expect(diffRow(parsed({ Price: '899' }), { price: 0, priceStatus: 'missing' }).updates).toEqual({ price: 899, priceStatus: 'active' });
    expect(diffRow(parsed({ Price: '0' }), { price: 899, priceStatus: 'active' }).updates).toEqual({ price: 0, priceStatus: 'missing' });
    expect(diffRow(parsed({ Name: 'X' }), { name: 'Y', price: 899, priceStatus: 'active' }).updates).toEqual({ name: 'X' });
  });

  it('unchanged values produce no changes; partial notes keep the others; legacy tags kept', () => {
    expect(diffRow(parsed({ Name: 'Same' }), { name: 'Same' }).changes).toEqual([]);
    expect(diffRow(parsed({ 'Heart notes': 'oud' }), { notes: { top: ['rose'], heart: ['jasmine'] } }).updates).toEqual({
      notes: { top: ['rose'], heart: ['oud'] }
    });
    expect(diffRow(parsed({ Tags: 'new' }), { tags: ['Grounded', 'bestseller'] }).updates).toEqual({ tags: ['Grounded', 'new'] });
  });
});

describe('import: reading spreadsheets', () => {
  it('reads .csv and .xlsx with flexible header case', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcf-import-'));
    const csv = path.join(dir, 'c.csv');
    fs.writeFileSync(csv, 'id,NAME,price,Top Notes\npeony-bloom,Peony,650,"rose, peony"\n,,,\n');
    const rows = await readSpreadsheet(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ID: 'peony-bloom', Name: 'Peony', Price: '650', 'Top notes': 'rose, peony' });

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Catalogue');
    ws.addRow([...IMPORT_COLUMNS]);
    ws.addRow(['peony-bloom', 'Peony', 'jar-candles', 650, 5]);
    const xlsx = path.join(dir, 'c.xlsx');
    await wb.xlsx.writeFile(xlsx);
    const rows2 = await readSpreadsheet(xlsx);
    expect(rows2[0]).toMatchObject({ ID: 'peony-bloom', Price: '650', Stock: '5', Collection: 'jar-candles' });
    await expect(readSpreadsheet(path.join(dir, 'x.txt'))).rejects.toThrow(/Unsupported/);
  });
});

describe('settings/store gating', () => {
  it('unset settings switch every dependent feature off', () => {
    const s = parseStoreSettings(undefined);
    expect(getShippingConfig(s)).toBeNull();
    expect(getCodConfig(s)).toBeNull();
    expect(getBuildABoxConfig(s)).toBeNull();
  });

  it('shipping needs both values; COD needs enabled + fee + limit; malformed values are dropped', () => {
    expect(getShippingConfig(parseStoreSettings({ freeShippingThreshold: 1000 }))).toBeNull();
    expect(getShippingConfig(parseStoreSettings({ freeShippingThreshold: 1000, shippingFee: -5 }))).toBeNull();
    const ship = getShippingConfig(parseStoreSettings({ freeShippingThreshold: 1000, shippingFee: 60 }))!;
    expect([computeShipping(0, ship), computeShipping(999, ship), computeShipping(1000, ship)]).toEqual([0, 60, 0]);
    expect(getCodConfig(parseStoreSettings({ codEnabled: true, codFee: 40 }))).toBeNull();
    expect(getCodConfig(parseStoreSettings({ codEnabled: false, codFee: 40, codMaxOrder: 5000 }))).toBeNull();
    expect(getCodConfig(parseStoreSettings({ codEnabled: true, codFee: 40, codMaxOrder: 5000 }))).toEqual({ codFee: 40, codMaxOrder: 5000 });
    expect(getBuildABoxConfig(parseStoreSettings({ buildABox: { sizes: [{ count: 3, price: 0 }] } }))).toBeNull();
    expect(getBuildABoxConfig(parseStoreSettings({ buildABox: { sizes: [{ count: 3, price: 1200 }], ribbons: ['red'], addOns: [] } })))
      .toEqual({ sizes: [{ count: 3, price: 1200 }], ribbons: ['red'], addOns: [] });
  });

  it('admin validation explains what is wrong', () => {
    expect(validateStoreSettings({ freeShippingThreshold: 1000 })).toMatch(/both/);
    expect(validateStoreSettings({ codEnabled: true })).toMatch(/COD fee/);
    expect(validateStoreSettings({ buildABox: { sizes: [], ribbons: [], addOns: [] } })).toMatch(/at least one size/);
    expect(validateStoreSettings({})).toBeNull();
  });
});

describe('product mapping of Phase 4a fields (backwards compatible)', () => {
  it('images[] wins over the Phase 3 fields; legacy docs still map', () => {
    expect(productFromDoc('a', { images: ['u1', 'u2'], imageUrl: 'old' })).toMatchObject({ image: 'u1', galleryImages: ['u1', 'u2'] });
    expect(productFromDoc('a', { imageUrl: 'old', galleryImageUrls: ['old', 'g'] })).toMatchObject({ image: 'old', images: ['old', 'g'] });
  });

  it('scent family: slug and legacy label both work', () => {
    expect(productFromDoc('a', { scentFamily: 'luxury-woody' })).toMatchObject({ scentFamilySlug: 'luxury-woody', scentFamily: 'Woody' });
    expect(productFromDoc('a', { scentFamily: 'Floral' })).toMatchObject({ scentFamilySlug: 'floral', scentFamily: 'Floral' });
    expect(productFromDoc('a', { scentFamily: 'gourmand' })).toMatchObject({ scentFamilySlug: 'gourmand', scentFamily: undefined });
  });

  it('new fields feed the existing display fields; mrp is never the selling price', () => {
    const p = productFromDoc('a', {
      price: 500, priceStatus: 'active', mrp: 650, burnTimeHours: 40, weightGrams: 200, sizeCm: '8 x 10',
      notes: { top: ['rose'] }, description: 'Long', occasions: ['wedding', 'diwali'], boxEligible: true, collection: 'jar-candles'
    });
    expect(p).toMatchObject({
      price: 500, originalPrice: 650, burnTime: '40 hours', weight: '200g', dimensions: '8 x 10 cm',
      scentNotes: { top: ['rose'] }, longDescription: 'Long', occasions: ['wedding'], boxEligible: true, collection: 'jar-candles'
    });
    expect(productFromDoc('a', { price: 500, priceStatus: 'active', mrp: 400 }).originalPrice).toBeUndefined();
    expect(productFromDoc('a', { price: 0, priceStatus: 'missing', mrp: 650 })).toMatchObject({ price: 0, priceStatus: 'missing' });
  });

  it('product-details and taxonomy validation', () => {
    const base = {
      collection: null, scentFamily: null, notes: null, burnTimeHours: null, weightGrams: null, sizeCm: null,
      ingredients: null, shortDescription: null, description: null, badges: [], occasions: [], boxEligible: false, mrp: null
    };
    expect(validateProductDetails(base)).toBeNull();
    expect(validateProductDetails({ ...base, scentFamily: 'Earthy' })).toBeNull(); // legacy label kept
    expect(validateProductDetails({ ...base, collection: 'tealights' })).toMatch(/collection/);
    expect(validateProductDetails({ ...base, badges: ['sale'] })).toMatch(/tag/);
    expect(validateProductDetails({ ...base, mrp: -1 })).toMatch(/mrp/);
    expect(validateTaxonomyEdit({ name: '', description: '', headerImage: '', sortOrder: 0 })).toMatch(/Name/);
    expect(validateTaxonomyEdit({ name: 'Jar', description: '', headerImage: 'javascript:x', sortOrder: 0 })).toMatch(/URL/);
  });
});

describe('startup feature status (all secrets optional)', () => {
  it('reports every feature off with no secrets and never includes values', () => {
    const off = featureStatus({});
    expect(off.every((f) => !f.on)).toBe(true);
    const on = featureStatus({
      RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w', GEMINI_API_KEY: 'g',
      MAINTENANCE_SECRET: 'm'.repeat(16)
    });
    expect(on.filter((f) => f.on)).toHaveLength(4); // checkout stays off
    expect(JSON.stringify(on)).not.toMatch(/"s"|mmmm/);
  });
});
