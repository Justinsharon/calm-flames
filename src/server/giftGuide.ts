/**
 * AI gift guide. Grounded ONLY on active, priced, in-stock products read from Firestore: the
 * model may pick product IDs from that list and write a short reason; names, prices and images
 * always come from the product docs. Unknown IDs from the model are dropped. Without
 * GEMINI_API_KEY (or on any model failure) a deterministic keyword match is used instead.
 */
import type { Product } from '../types';
import { hasVerifiedPrice } from '../lib/productMapping';
import type { GiftGuideResponse, GiftSuggestion } from '../lib/giftGuide';
import { TAXONOMY_SEED_NAMES } from '../lib/taxonomy';

export function giftableProducts(catalog: Record<string, Product> | Product[]): Product[] {
  const list = Array.isArray(catalog) ? catalog : Object.values(catalog);
  return list.filter((p) => p.isActive !== false && !p.isHistorical && hasVerifiedPrice(p) && p.inStock === true && p.inventoryStatus === 'in_stock');
}

const notesOf = (p: Product): string[] => {
  const n: any = (p as any).notes;
  if (!n) return [];
  if (Array.isArray(n)) return n.map(String);
  return [...(n.top || []), ...(n.heart || []), ...(n.base || [])].map(String);
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2);
const STOP = new Set(['for', 'the', 'and', 'with', 'who', 'needs', 'something', 'someone', 'gift', 'gifts', 'gifting', 'candle', 'candles', 'want', 'like', 'that', 'under', 'below', 'my', 'her', 'his', 'them']);
const SYNONYMS: Record<string, string[]> = {
  mother: ['floral', 'rose', 'jasmine', 'mogra', 'peony', 'mothers-day'],
  housewarming: ['housewarming', 'urli', 'centrepiece', 'jar', 'home'],
  diwali: ['diwali', 'festive', 'urli', 'laddoo', 'modak', 'diya'],
  floral: ['floral', 'rose', 'jasmine', 'mogra', 'peony', 'lotus', 'tulip', 'flower', 'bloom'],
  calm: ['calm', 'lavender', 'sandalwood', 'relax', 'sleep', 'vetiver'],
  wedding: ['wedding', 'anniversary', 'rose'],
  birthday: ['birthday']
};

export function parseBudget(message: string): number | null {
  const m = /(?:under|below|less than|within|upto|up to|<)\s*(?:rs\.?|inr|₹)?\s*([\d,]{2,7})/i.exec(message);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function haystack(p: Product): string {
  const a: any = p;
  return [p.name, a.collection, a.scentFamilySlug, a.scentFamily, ...(a.tags || []), ...(a.occasions || []), ...notesOf(p), a.shortDescription, a.description].filter(Boolean).join(' ').toLowerCase();
}

/** Deterministic: keyword (+synonym) overlap, within budget; ties by sort order then price. */
export function fallbackSuggestions(message: string, products: Product[], limit = 3): GiftSuggestion[] {
  const budget = parseBudget(message);
  const pool = budget ? products.filter((p) => p.price <= budget) : products;
  const terms = new Set<string>();
  for (const w of words(message)) {
    if (STOP.has(w) || /^\d/.test(w)) continue;
    terms.add(w);
    for (const [k, syn] of Object.entries(SYNONYMS)) if (w.startsWith(k)) syn.forEach((x) => terms.add(x));
  }
  const scored = pool.map((p) => {
    const h = haystack(p);
    const hits = [...terms].filter((t) => h.includes(t));
    return { p, hits, score: hits.length };
  });
  scored.sort((a, b) => b.score - a.score || ((a.p as any).sortOrder ?? 999) - ((b.p as any).sortOrder ?? 999) || a.p.price - b.p.price);
  return scored.slice(0, limit).map(({ p, hits }) => toSuggestion(p, fallbackReason(p, hits, budget)));
}

/**
 * Reason built only from the product's own fields: notes, scent family, collection and the
 * occasion it is tagged for (the one the shopper asked about first), plus the budget if given.
 */
export function fallbackReason(p: Product, hits: string[], budget: number | null): string {
  const a: any = p;
  const names = TAXONOMY_SEED_NAMES as any;
  const notes = notesOf(p).slice(0, 3);
  const family = a.scentFamilySlug ? names.scentFamilies?.[a.scentFamilySlug] : undefined;
  const collection = a.collection ? names.collections?.[a.collection] : undefined;
  const occ: string[] = Array.isArray(a.occasions) ? a.occasions : [];
  const occasion = occ.find((o) => hits.some((h) => o.includes(h) || h.includes(o))) || occ[0];
  const occasionName = occasion ? names.occasions?.[occasion] || occasion.replace(/-/g, ' ') : undefined;
  const bits: string[] = [];
  if (notes.length) bits.push(`${notes.length > 1 ? `${notes.slice(0, -1).join(', ')} and ${notes[notes.length - 1]}` : notes[0]} notes`);
  if (family) bits.push(`from the ${family} family`);
  if (collection) bits.push(`in our ${collection} collection`);
  let out = bits.length ? bits.join(', ') : '';
  if (occasionName) out = out ? `${out}. Made for ${occasionName.toLowerCase()} gifting` : `Made for ${occasionName.toLowerCase()} gifting`;
  if (budget) out = out ? `${out}, within your ₹${budget.toLocaleString('en-IN')} budget` : `Within your ₹${budget.toLocaleString('en-IN')} budget`;
  if (!out) out = hits.length ? `Matches what you asked for (${hits.slice(0, 2).join(', ')})` : 'A well-loved choice from our studio';
  return `${out.charAt(0).toUpperCase()}${out.slice(1)}.`;
}

function toSuggestion(p: Product, reason: string): GiftSuggestion {
  return { productId: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image || undefined, reason: reason.slice(0, 220) };
}

export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** One Gemini call over the grounded list. Throws on any transport/format problem. */
export async function geminiSuggestions(message: string, products: Product[], apiKey: string, fetchImpl: typeof fetch = fetch): Promise<GiftSuggestion[]> {
  const byId = new Map(products.map((p) => [p.id, p]));
  const list = products.slice(0, 80).map((p) => ({
    id: p.id,
    name: p.name,
    priceInr: p.price,
    notes: notesOf(p).slice(0, 6),
    occasions: (p as any).occasions || [],
    collection: (p as any).collection || undefined,
    about: String((p as any).shortDescription || (p as any).description || '').slice(0, 160) || undefined
  }));
  const prompt = [
    'You are the gift guide for The Calm Flame, a handcrafted candle shop in India.',
    'Choose 2 or 3 products for the shopper ONLY from the PRODUCTS list (use their exact "id").',
    'Never mention a product, price or discount that is not in the list. Respect any budget the shopper gives.',
    'Give each a warm reason of at most 25 words based only on its listed notes, occasions or description.',
    `PRODUCTS: ${JSON.stringify(list)}`,
    `SHOPPER: ${JSON.stringify(message)}`
  ].join('\n');
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { suggestions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { productId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['productId', 'reason'] } } },
          required: ['suggestions']
        }
      }
    })
  });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((x: any) => x?.text || '').join('') || '';
  const parsed = JSON.parse(text);
  const out: GiftSuggestion[] = [];
  const budget = parseBudget(message);
  for (const s of Array.isArray(parsed?.suggestions) ? parsed.suggestions : []) {
    const p = typeof s?.productId === 'string' ? byId.get(s.productId) : undefined;
    if (!p || out.some((o) => o.productId === p.id)) continue; // never an invented product
    if (budget && p.price > budget) continue;
    const reason = typeof s.reason === 'string' && s.reason.trim() ? s.reason.trim().replace(/\s+/g, ' ') : fallbackReason(p, [], budget);
    out.push(toSuggestion(p, reason));
    if (out.length === 3) break;
  }
  return out;
}

export async function suggestGifts(message: string, catalog: Record<string, Product>, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<GiftGuideResponse> {
  const products = giftableProducts(catalog);
  if (products.length === 0) return { source: 'fallback', suggestions: [] };
  if (env.GEMINI_API_KEY) {
    try {
      const ai = await geminiSuggestions(message, products, env.GEMINI_API_KEY, fetchImpl);
      if (ai.length >= 2) return { source: 'ai', suggestions: ai };
    } catch (e: any) {
      console.warn('Gift guide: Gemini unavailable, using the keyword match:', e?.message || e);
    }
  }
  return { source: 'fallback', suggestions: fallbackSuggestions(message, products) };
}
