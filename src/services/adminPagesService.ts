/** Admin writes for `pages` (journal, info, FAQ, contact, care). Enforced by firestore.rules. */
import { collection, deleteDoc, doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { db as appDb, storage as appStorage } from '../lib/firebase';
import { pageFromDoc, validatePage, type SitePage } from '../lib/pages';
import { stripUndefined } from '../lib/productMapping';
import { validatePhoto } from '../lib/adminValidation';

const defaults = () => ({ db: appDb as Firestore, storage: appStorage as FirebaseStorage });

export function subscribeAllPages(onChange: (pages: SitePage[]) => void, onError: (e: Error) => void, { db } = defaults()) {
  return onSnapshot(
    collection(db, 'pages'),
    (snap) => onChange(snap.docs.map((d) => pageFromDoc(d.id, d.data())).filter((p): p is SitePage => Boolean(p))),
    (e) => onError(e)
  );
}

export async function savePage(p: SitePage, { db } = defaults()): Promise<void> {
  const err = validatePage(p);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'pages', p.slug),
    stripUndefined({
      slug: p.slug,
      type: p.type,
      title: p.title.trim(),
      eyebrow: p.eyebrow?.trim() || undefined,
      summary: p.summary?.trim() || undefined,
      body: p.body,
      heroImage: p.heroImage || undefined,
      category: p.category?.trim() || undefined,
      readMinutes: p.readMinutes && p.readMinutes > 0 ? p.readMinutes : undefined,
      productIds: p.productIds && p.productIds.length ? p.productIds : undefined,
      featured: p.featured || undefined,
      published: p.published,
      publishedAt: p.published ? p.publishedAt || now : p.publishedAt,
      updatedAt: now
    } as Record<string, any>)
  );
}

export async function deletePage(slug: string, { db } = defaults()): Promise<void> {
  await deleteDoc(doc(db, 'pages', slug));
}

export async function uploadPageImage(slug: string, file: Blob & { name: string; type: string; size: number }, { storage } = defaults()): Promise<string> {
  const err = validatePhoto(file);
  if (err) throw new Error(err);
  const r = ref(storage, `pages/${slug}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').slice(-60)}`);
  await uploadBytes(r, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  return getDownloadURL(r);
}
