/** Help & Support (browser): send the request, then (optionally) its photo with the one-time ticket. */
export const MAX_SUPPORT_PHOTO = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side check (the server checks size and the actual image bytes again). */
export function checkSupportPhoto(f: { type: string; size: number }): string | null {
  if (!TYPES.includes(f.type)) return 'Photos must be JPG, PNG or WebP.';
  if (f.size <= 0 || f.size > MAX_SUPPORT_PHOTO) return 'Photos can be up to 5 MB.';
  return null;
}

export async function sendSupportRequest(body: Record<string, unknown>): Promise<{ id: string; uploadTicket?: string }> {
  const r = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'We could not send your request.');
  return d;
}

export async function uploadSupportPhoto(id: string, ticket: string, file: Blob & { type: string; size: number }): Promise<void> {
  const err = checkSupportPhoto(file);
  if (err) throw new Error(err);
  const r = await fetch(`/api/support/${encodeURIComponent(id)}/photo`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-Upload-Ticket': ticket }, body: file });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || 'The photo could not be uploaded.');
  }
}
