/**
 * One-time (and re-runnable) catalogue migration: product photos -> Firebase Storage,
 * products -> Firestore `products` with `imageUrl`.
 *
 * Usage (see README "Catalogue migration"):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npx tsx scripts/migrate-catalog.ts --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npx tsx scripts/migrate-catalog.ts
 *
 * Env: FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID, FIREBASE_STORAGE_BUCKET override the values in
 * firebase-applet-config.json. Works against emulators when FIRESTORE_EMULATOR_HOST /
 * FIREBASE_STORAGE_EMULATOR_HOST are set.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { migrateCatalog } from './catalog/migrate';
import { getAdminDb, getAdminBucket, storageBucketName } from '../src/server/firestoreAdmin';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = getAdminDb();
  const bucket = getAdminBucket();
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Migrating catalogue to project "${process.env.FIREBASE_PROJECT_ID || '(from config)'}", ` +
      `database "${(db as any).databaseId || '(default)'}", bucket "${storageBucketName()}"`
  );
  const report = await migrateCatalog({
    db,
    bucket,
    imagesDir: path.resolve(__dirname, '../src/assets/images'),
    dryRun,
    log: (m) => console.log(m),
    storageEmulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST
  });
  if (report.productsUpdated.length) {
    console.log('Fields added to existing products:');
    for (const u of report.productsUpdated) console.log(`  ${u.id}: ${u.fieldsAdded.join(', ')}`);
  }
  console.log(dryRun ? 'Dry run complete. Nothing was written.' : 'Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
