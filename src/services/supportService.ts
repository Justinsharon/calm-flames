/** Help & Support (browser): optional photo goes to Storage support/{uuid}/, then the server saves the request. */
import { ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { storage as appStorage } from '../lib/firebase';

export const MAX_SUPPORT_PHOTO = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Client-side check (storage.rules and the server check again). */
export function checkSupportPhoto(f: { type: string; size: number }): string | null {
  if (!EXT[f.type]) return 'Photos must be JPG, PNG or WebP.';
  if (f.size <= 0 || f.size > MAX_SUPPORT_PHOTO) return 'Photos can be up to 5 MB.';
  return null;
}

export async function uploadSupportPhoto(file: Blob & { type: string; size: number }, storage: FirebaseStorage = appStorage as FirebaseStorage): Promise<string> {
  const err = checkSupportPhoto(file);
  if (err) throw new Error(err);
  const id = crypto.randomUUID();
  const path = `support/${id}/photo.${EXT[file.type]}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return path;
}
