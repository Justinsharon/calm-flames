/** Recently viewed products (this device only; ids, newest first, at most 8). */
const KEY = 'tcf_recently_viewed';
export function readRecentlyViewed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function recordRecentlyViewed(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...readRecentlyViewed().filter((x) => x !== id)].slice(0, 8)));
  } catch {
    /* ignore */
  }
}
/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}
