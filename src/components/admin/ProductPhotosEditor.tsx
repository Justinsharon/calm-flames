import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, Upload } from 'lucide-react';
import { addProductPhotos, setProductImages, ALLOWED_PHOTO_TYPES } from '../../services/adminCatalogService';

interface Props {
  productId: string;
  images: string[];
  onMessage: (msg: string) => void;
}

/** Ordered photo list: [0] = main photo, [1] = hover photo. Every change saves immediately. */
export const ProductPhotosEditor: React.FC<Props> = ({ productId, images, onMessage }) => {
  const [list, setList] = useState<string[]>(images);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setList(images), [images]);

  const save = async (next: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await setProductImages(productId, next);
      setList(next);
      onMessage('Photos saved.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await addProductPhotos(productId, list, Array.from(files));
      setList(next);
      onMessage(`${files.length} photo(s) uploaded.`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-[11px] font-medium text-[#79716B] mb-1">Photos (first = main, second = hover)</label>
      <div className="flex flex-wrap gap-2">
        {list.map((url, i) => (
          <div key={url + i} className="w-20 space-y-1">
            <div className="relative">
              <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover bg-stone-100 border border-[#E5DCCE]" />
              {i < 2 && (
                <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[#1F1B18]/80 text-white text-[9px]">
                  {i === 0 ? 'Main' : 'Hover'}
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier" className="p-1 text-stone-500 disabled:opacity-30">
                <ArrowLeft className="w-3 h-3" />
              </button>
              <button type="button" disabled={busy} onClick={() => save(list.filter((_, k) => k !== i))} aria-label="Remove photo" className="p-1 text-rose-600 disabled:opacity-30">
                <Trash2 className="w-3 h-3" />
              </button>
              <button type="button" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move later" className="p-1 text-stone-500 disabled:opacity-30">
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        <label className={`w-20 h-20 rounded-lg border border-dashed border-[#DBC4A9] flex flex-col items-center justify-center text-[10px] text-[#79716B] cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4 mb-1" />
          {busy ? 'Saving…' : 'Add'}
          <input type="file" multiple accept={ALLOWED_PHOTO_TYPES.join(',')} disabled={busy} className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
      </div>
      <p className="text-[10px] text-[#79716B] mt-1">JPEG, PNG or WebP, up to 5 MB each. Removing a photo here does not delete the file.</p>
      {error && <p role="alert" className="text-[11px] text-rose-700 mt-1">{error}</p>}
    </div>
  );
};
