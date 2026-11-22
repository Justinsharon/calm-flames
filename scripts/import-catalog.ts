/**
 * Import / update products from a spreadsheet. Dry run by default.
 *
 *   npm run import:catalog -- catalogue.xlsx                       # report only
 *   npm run import:catalog -- catalogue.xlsx --photos ./photos      # report incl. photos
 *   npm run import:catalog -- catalogue.xlsx --photos ./photos --apply
 *
 * Columns: ID, Name, Collection, Price, Stock, Short description, Full description, Scent family,
 * Top notes, Heart notes, Base notes, Burn time, Weight, Size, Ingredients, Tags, Occasions,
 * Box eligible. See docs/catalog-migration.md.
 */
import dotenv from 'dotenv';
import { getAdminDb, getAdminBucket } from '../src/server/firestoreAdmin';
import { importCatalog, readSpreadsheet, formatReport } from './catalog/importCatalog';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const pi = args.indexOf('--photos');
  const photosDir = pi >= 0 ? args[pi + 1] : undefined;
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--photos');
  if (!file) {
    console.error('Usage: npm run import:catalog -- <file.xlsx|file.csv> [--photos <folder>] [--apply]');
    process.exit(1);
  }
  const rows = await readSpreadsheet(file);
  const report = await importCatalog({
    db: getAdminDb(),
    bucket: photosDir ? getAdminBucket() : undefined,
    rows,
    photosDir,
    apply,
    storageEmulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST
  });
  console.log(formatReport(report));
  if (report.counts.error > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
