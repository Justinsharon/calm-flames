/**
 * Read-only go-live readiness report. Changes nothing.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=… npm run golive:check -- [--url https://calm-flames-….run.app]
 *
 * Reads: Firestore products, inventory, settings/store, admin count (firebase-admin);
 * which secrets exist (Secret Manager names via gcloud if available, else this shell's env —
 * never their values); rules release dates (Firebase Rules API); optional live /api/checkout/readiness.
 */
import dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import { getAdminApp, getAdminDb, storageBucketName } from '../src/server/firestoreAdmin';
import { parseStoreSettings } from '../src/lib/storeSettings';
import firebaseConfig from '../firebase-applet-config.json';
import { buildReport, formatReport, type Facts } from './golive/report';

dotenv.config({ path: '.env.local' });
dotenv.config();

const NAMES = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MAINTENANCE_SECRET', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'MAIL_PROVIDER', 'ORDER_NOTIFY_EMAIL', 'SUPPORT_NOTIFY_EMAIL', 'PUBLIC_SITE_URL'];

function secretManagerNames(): Set<string> | null {
  try {
    const out = execFileSync('gcloud', ['secrets', 'list', '--format=value(name)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 });
    return new Set(out.split('\n').map((l) => l.trim().split('/').pop()!).filter(Boolean));
  } catch {
    return null;
  }
}

async function rulesReleases(projectId: string): Promise<Facts['rulesReleases']> {
  try {
    const cred: any = (getAdminApp().options as any).credential;
    const token = (await cred.getAccessToken()).access_token;
    const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const d: any = await r.json();
    const db = (firebaseConfig as any).firestoreDatabaseId;
    const bucket = storageBucketName();
    return (d.releases || [])
      .filter((x: any) => /cloud\.firestore|firebase\.storage/.test(x.name))
      .filter((x: any) => !db || !x.name.includes('cloud.firestore') || x.name.endsWith(`/${db}`) || x.name.endsWith('cloud.firestore'))
      .filter((x: any) => !x.name.includes('firebase.storage') || x.name.endsWith(`/${bucket}`))
      .map((x: any) => ({ name: x.name.split('/releases/')[1] || x.name, updateTime: x.updateTime }));
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}

(async () => {
  const urlArg = process.argv.indexOf('--url');
  const liveUrl = urlArg > 0 ? process.argv[urlArg + 1] : undefined;
  const db = getAdminDb();
  const [prods, inv, settings, admins] = await Promise.all([
    db.collection('products').get(),
    db.collection('inventory').get(),
    db.collection('settings').doc('store').get(),
    db.collection('customers').where('role', '==', 'admin').get()
  ]);
  const sm = secretManagerNames();
  const present = Object.fromEntries(NAMES.map((n) => [n, Boolean(process.env[n]) || Boolean(sm?.has(n))]));
  let liveReadiness: Facts['liveReadiness'];
  if (liveUrl) {
    try {
      const r = await fetch(`${liveUrl.replace(/\/$/, '')}/api/checkout/readiness`, { signal: AbortSignal.timeout(15000) });
      liveReadiness = await r.json();
    } catch (e: any) {
      liveReadiness = { error: e?.message || String(e) };
    }
  }
  const facts: Facts = {
    products: prods.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    inventory: Object.fromEntries(inv.docs.map((d) => [d.id, d.data() as any])),
    settings: settings.exists ? parseStoreSettings(settings.data()) : null,
    present,
    checkoutEnabledEnv: process.env.CHECKOUT_ENABLED === 'true',
    liveReadiness,
    rulesReleases: await rulesReleases(process.env.FIREBASE_PROJECT_ID || (firebaseConfig as any).projectId),
    admins: admins.size,
    publicSiteUrl: process.env.PUBLIC_SITE_URL
  };
  console.log(`Secrets checked in: ${sm ? 'Secret Manager (names only) + this shell' : 'this shell only (gcloud not available)'}\n`);
  console.log(formatReport(buildReport(facts)));
  process.exit(0);
})().catch((e) => {
  console.error('golive:check failed (nothing was changed):', e?.message || e);
  process.exit(1);
});
