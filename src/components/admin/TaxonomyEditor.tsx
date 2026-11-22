import React, { useEffect, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { TAXONOMY_SLUGS, TAXONOMY_SEED_NAMES, type TaxonomyDoc, type TaxonomyKind } from '../../lib/taxonomy';
import { saveTaxonomyDoc, subscribeTaxonomy, uploadTaxonomyHeader, ALLOWED_PHOTO_TYPES } from '../../services/adminCatalogService';

const KINDS: { kind: TaxonomyKind; title: string }[] = [
  { kind: 'collections', title: 'Collections' },
  { kind: 'scentFamilies', title: 'Scent Families' },
  { kind: 'occasions', title: 'Occasions' }
];
const input = 'w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]';

const Row: React.FC<{ kind: TaxonomyKind; slug: string; doc?: TaxonomyDoc; onMessage: (m: string) => void }> = ({ kind, slug, doc, onMessage }) => {
  const [form, setForm] = useState({ name: '', description: '', headerImage: '', sortOrder: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: doc?.name ?? TAXONOMY_SEED_NAMES[kind][slug] ?? slug,
      description: doc?.description ?? '',
      headerImage: doc?.headerImage ?? '',
      sortOrder: doc?.sortOrder ?? TAXONOMY_SLUGS[kind].indexOf(slug)
    });
  }, [doc, kind, slug]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveTaxonomyDoc(kind, slug, { ...form, sortOrder: Number(form.sortOrder) });
      onMessage(`${form.name} saved.`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadTaxonomyHeader(kind, slug, file);
      setForm((f) => ({ ...f, headerImage: url }));
      onMessage('Header image uploaded. Save to apply.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white border border-[#E5DCCE] space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[#79716B]">{slug}</span>
        {!doc && <span className="text-[10px] text-amber-700">Not saved yet (run npm run seed:taxonomy, or save here)</span>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <input aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} col-span-3`} />
        <input aria-label="Sort order" type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={input} />
      </div>
      <textarea aria-label="Description" rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
      <div className="flex items-center gap-2">
        {form.headerImage && <img src={form.headerImage} alt="" className="w-14 h-10 rounded object-cover bg-stone-100" />}
        <input aria-label="Header image URL" placeholder="Header image URL" value={form.headerImage} onChange={(e) => setForm({ ...form, headerImage: e.target.value })} className={input} />
        <label className="p-2 rounded-lg border border-[#DBC4A9] cursor-pointer text-[#79716B]" title="Upload header image">
          <Upload className="w-3.5 h-3.5" />
          <input type="file" accept={ALLOWED_PHOTO_TYPES.join(',')} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <button type="button" onClick={save} disabled={busy} className="px-3 py-2 bg-[#2A2521] text-white text-xs font-semibold rounded-xl flex items-center gap-1 disabled:opacity-60">
          <Save className="w-3.5 h-3.5" />
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
};

export const TaxonomyEditor: React.FC<{ onMessage: (m: string) => void }> = ({ onMessage }) => {
  const [docs, setDocs] = useState<Record<TaxonomyKind, TaxonomyDoc[]>>({ collections: [], scentFamilies: [], occasions: [] });

  useEffect(() => {
    const unsubs = KINDS.map(({ kind }) =>
      subscribeTaxonomy(kind, (list) => setDocs((d) => ({ ...d, [kind]: list })), (e) => onMessage(`Could not load ${kind}: ${e.message}`))
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div className="space-y-6">
      {KINDS.map(({ kind, title }) => (
        <section key={kind} className="space-y-2">
          <h4 className="text-sm font-serif font-bold text-[#1F1B18]">{title}</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {TAXONOMY_SLUGS[kind].map((slug) => (
              <Row key={slug} kind={kind} slug={slug} doc={docs[kind].find((d) => d.slug === slug)} onMessage={onMessage} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
