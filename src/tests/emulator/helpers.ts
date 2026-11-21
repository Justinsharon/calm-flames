import crypto from 'crypto';
import { getAdminDb } from '../../server/firestoreAdmin';

export const PRODUCT = 'jumbo-tealight-mogra';

export async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.FIREBASE_PROJECT_ID || 'demo-calm-flames';
  const res = await realFetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
}

export const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export async function seedInventory(available: number, reserved = 0) {
  await getAdminDb().collection('inventory').doc(PRODUCT).set({
    productId: PRODUCT,
    quantity: available + reserved,
    availableQuantity: available,
    reservedQuantity: reserved,
    inStock: available > 0,
    status: available > 0 ? 'in_stock' : 'out_of_stock',
  });
}

export async function getData(collection: string, id: string) {
  return (await getAdminDb().collection(collection).doc(id).get()).data();
}

export async function listIds(collection: string) {
  return (await getAdminDb().collection(collection).get()).docs.map((d) => d.id);
}

export async function listDocs(collection: string) {
  return (await getAdminDb().collection(collection).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const inventory = () => getData('inventory', PRODUCT);

export function idempDocIdFor(key: string) {
  return 'order_' + crypto.createHash('sha256').update(key).digest('hex');
}

/** Make an idempotency claim or event lease look abandoned (older than the 60s lease). */
export const STALE_TIME = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();

export function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
