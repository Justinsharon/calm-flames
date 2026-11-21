/**
 * Release stale inventory reservations that never became an order (safe to run any time,
 * any number of times). Same logic as POST /api/admin/maintenance/expire-reservations.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run expire-reservations -- [--max-age-minutes=30]
 */
import dotenv from 'dotenv';
import { expireStaleReservations } from '../src/server/reservationExpiry';

dotenv.config({ path: '.env.local' });
dotenv.config();

const arg = process.argv.find((a) => a.startsWith('--max-age-minutes='));
const maxAgeMinutes = arg ? Number(arg.split('=')[1]) : undefined;

expireStaleReservations({ maxAgeMinutes })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.failed.length) process.exitCode = 1;
  })
  .catch((err) => {
    console.error('Reservation expiry failed:', err);
    process.exit(1);
  });
