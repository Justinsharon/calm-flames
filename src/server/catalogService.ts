/**
 * Server-side catalogue reads (firebase-admin). Firestore `products` is the only price source
 * for cart validation, order creation, checkout readiness and the AI endpoints.
 * Reads are not cached so an admin price change applies to the very next request.
 * Any read failure throws: callers must fail closed (never fall back to static data).
 */
import { getAdminDb } from './firestoreAdmin';
import { productFromDoc } from '../lib/productMapping';
import type { Product } from '../types';

export class CatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Product catalogue unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CatalogUnavailableError';
  }
}

/** Look up products by ID (active or not). Missing IDs are absent from the map. */
export async function getProductsByIds(ids: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
  const result = new Map<string, Product>();
  if (unique.length === 0) return result;
  try {
    const db = getAdminDb();
    const snaps = await db.getAll(...unique.map((id) => db.collection('products').doc(id)));
    for (const s of snaps) if (s.exists) result.set(s.id, productFromDoc(s.id, s.data()!));
    return result;
  } catch (e) {
    throw new CatalogUnavailableError(e);
  }
}

/** All active, non-historical products keyed by ID. */
export async function getActiveCatalog(): Promise<Record<string, Product>> {
  try {
    const snap = await getAdminDb().collection('products').where('isActive', '==', true).get();
    const out: Record<string, Product> = {};
    for (const d of snap.docs) {
      const p = productFromDoc(d.id, d.data());
      if (p.isActive && !p.isHistorical) out[p.id] = p;
    }
    return out;
  } catch (e) {
    throw new CatalogUnavailableError(e);
  }
}
