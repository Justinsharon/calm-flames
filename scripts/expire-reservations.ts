/**
 * Maintenance sweep (safe to run any time, any number of times). Same logic as
 * POST /api/admin/maintenance/expire-reservations:
 *  1. expires abandoned PAYMENT_PENDING orders with no captured/authorized Razorpay payment
 *     (needs RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; without them those orders are skipped), then
 *  2. releases stale reservations that never became an order.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run expire-reservations -- [--max-age-minutes=30] [--order-max-age-minutes=30]
 */
import dotenv from 'dotenv';
import { expireStaleReservations } from '../src/server/reservationExpiry';
import { expireAbandonedOrders } from '../src/server/orderExpiry';

dotenv.config({ path: '.env.local' });
dotenv.config();

function numArg(name: string): number | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : undefined;
}

async function main() {
  const abandonedOrders = await expireAbandonedOrders({ maxAgeMinutes: numArg('order-max-age-minutes') });
  const reservations = await expireStaleReservations({ maxAgeMinutes: numArg('max-age-minutes') });
  console.log(JSON.stringify({ abandonedOrders, reservations }, null, 2));
  if (abandonedOrders.failed.length || reservations.failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Maintenance sweep failed:', err);
  process.exit(1);
});
