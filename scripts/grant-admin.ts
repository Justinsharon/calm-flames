/**
 * Make (or stop making) a signed-up user an admin.
 *
 *   npm run grant-admin -- owner@example.com
 *   npm run grant-admin -- owner@example.com --revoke
 *
 * Sets role "admin" | "customer" on Firestore customers/{uid} (read by the app and firestore.rules)
 * and the matching `admin` custom claim (read by storage.rules). The user must sign out and back
 * in once afterwards so their ID token picks up the claim.
 */
import dotenv from 'dotenv';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '../src/server/firestoreAdmin';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    console.error('Usage: npm run grant-admin -- <email> [--revoke]');
    process.exit(1);
  }
  const auth = getAuth(getAdminApp());
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}), admin: !revoke };
  await auth.setCustomUserClaims(user.uid, claims);
  await getAdminDb()
    .collection('customers')
    .doc(user.uid)
    .set({ role: revoke ? 'customer' : 'admin', email: user.email, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`${revoke ? 'Revoked admin from' : 'Granted admin to'} ${email} (uid ${user.uid}). Ask them to sign out and back in.`);
}

main().catch((err) => {
  console.error('grant-admin failed:', err);
  process.exit(1);
});
