/**
 * One-time (re-runnable, create-only) seed of the 5 collections, 6 scent families and 5 occasions.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run seed:taxonomy -- [--dry-run]
 */
import dotenv from 'dotenv';
import { getAdminDb } from '../src/server/firestoreAdmin';
import { seedTaxonomy } from './catalog/seedTaxonomy';

dotenv.config({ path: '.env.local' });
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
seedTaxonomy(getAdminDb(), { dryRun })
  .then((r) => {
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Created ${r.created.length}: ${r.created.join(', ') || '-'}`);
    console.log(`Already present (left untouched) ${r.existing.length}: ${r.existing.join(', ') || '-'}`);
  })
  .catch((err) => {
    console.error('seed-taxonomy failed:', err);
    process.exit(1);
  });
