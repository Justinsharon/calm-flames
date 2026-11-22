/**
 * Editable site content in Firestore `pages/{slug}` (journal stories, info pages, FAQ, contact,
 * candle care). Written by the owner in Admin → Pages. Nothing is shown until `published` is true,
 * so no placeholder or sample text ever reaches the storefront.
 */
export type PageType = 'journal' | 'info' | 'faq' | 'contact' | 'care';

export interface SitePage {
  slug: string;
  type: PageType;
  title: string;
  eyebrow?: string;
  summary?: string;
  /** Markdown (see src/lib/markdown.tsx for the supported subset). */
  body: string;
  heroImage?: string;
  category?: string;
  readMinutes?: number;
  /** Product IDs featured in a journal story ("Candles in this story"). */
  productIds?: string[];
  featured?: boolean;
  published: boolean;
  publishedAt?: string;
  sortOrder?: number;
}

/** Fixed slugs for non-journal content. */
export const SPECIAL_PAGE_SLUGS: Record<Exclude<PageType, 'journal' | 'info'>, string> = {
  faq: 'faq',
  contact: 'contact',
  care: 'candle-care'
};

const PAGE_TYPES: PageType[] = ['journal', 'info', 'faq', 'contact', 'care'];

export function pageFromDoc(slug: string, d: Record<string, any> | undefined): SitePage | null {
  if (!d || typeof d.title !== 'string' || !PAGE_TYPES.includes(d.type)) return null;
  return {
    slug,
    type: d.type,
    title: d.title,
    eyebrow: typeof d.eyebrow === 'string' ? d.eyebrow : undefined,
    summary: typeof d.summary === 'string' ? d.summary : undefined,
    body: typeof d.body === 'string' ? d.body : '',
    heroImage: typeof d.heroImage === 'string' && d.heroImage ? d.heroImage : undefined,
    category: typeof d.category === 'string' && d.category ? d.category : undefined,
    readMinutes: typeof d.readMinutes === 'number' && d.readMinutes > 0 ? d.readMinutes : undefined,
    productIds: Array.isArray(d.productIds) ? d.productIds.filter((x: unknown) => typeof x === 'string') : [],
    featured: d.featured === true,
    published: d.published === true,
    publishedAt: typeof d.publishedAt === 'string' ? d.publishedAt : undefined,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : undefined
  };
}

/** Newest first; featured story first. */
export function sortJournal(pages: SitePage[]): SitePage[] {
  return [...pages].sort(
    (a, b) =>
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      (b.publishedAt || '').localeCompare(a.publishedAt || '') ||
      a.title.localeCompare(b.title)
  );
}

/** Rough reading time when the editor did not set one. */
export function readingMinutes(p: SitePage): number {
  return p.readMinutes ?? Math.max(1, Math.round(p.body.split(/\s+/).filter(Boolean).length / 200));
}

/**
 * FAQ markdown → question/answer pairs: each `## Question` heading starts an item and the text
 * until the next heading is the answer.
 */
export function splitFaq(markdown: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  let cur: { question: string; lines: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) {
      if (cur) out.push({ question: cur.question, answer: cur.lines.join('\n').trim() });
      cur = { question: m[1], lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ question: cur.question, answer: cur.lines.join('\n').trim() });
  return out.filter((q) => q.question && q.answer);
}

export function validatePage(p: Partial<SitePage>): string | null {
  if (!p.slug || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.slug)) return 'Slug must be lowercase letters, digits and hyphens.';
  if (!p.type || !PAGE_TYPES.includes(p.type)) return 'Unknown page type.';
  if (!p.title || !p.title.trim() || p.title.length > 160) return 'Title is required (max 160 characters).';
  if ((p.body || '').length > 50000) return 'Body is too long.';
  if ((p.summary || '').length > 400) return 'Summary is too long (max 400).';
  if (p.heroImage && !/^https?:\/\//.test(p.heroImage)) return 'Hero image must be a URL.';
  return null;
}
