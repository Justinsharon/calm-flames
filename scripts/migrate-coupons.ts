/**
 * Move the two formerly hard-coded coupons (CALM10, FIRSTFLAME) into Firestore `coupons/`,
 * INACTIVE. Create-only and re-runnable. The owner turns them on in Admin → Coupons.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run migrate:coupons -- [--dry-run]
 */
import dotenv from 'dotenv';
import { getAdminDb } from '../src/server/firestoreAdmin';
import { migrateCoupons } from './catalog/migrateCoupons';

dotenv.config({ path: '.env.local' });
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
migrateCoupons(getAdminDb(), { dryRun })
  .then((r) => {
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Created (inactive) ${r.created.length}: ${r.created.join(', ') || '-'}`);
    console.log(`Already present (left untouched) ${r.existing.length}: ${r.existing.join(', ') || '-'}`);
  })
  .catch((err) => {
    console.error('migrate-coupons failed:', err);
    process.exit(1);
  });
