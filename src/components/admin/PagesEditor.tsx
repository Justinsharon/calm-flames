import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { deletePage, savePage, subscribeAllPages, uploadPageImage } from '../../services/adminPagesService';
import { SPECIAL_PAGE_SLUGS, validatePage, type PageType, type SitePage } from '../../lib/pages';
import { INFO_PAGE_SLUGS, INFO_PAGE_TITLES } from '../../lib/routes';
import { ALLOWED_PHOTO_TYPES } from '../../lib/adminValidation';

const input = 'w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]';
const label = 'block text-[11px] font-medium text-[#79716B] mb-1';

/** Fixed pages the storefront links to; journal stories are added freely. */
const FIXED: { slug: string; type: PageType; title: string; hint: string }[] = [
  ...INFO_PAGE_SLUGS.map((s) => ({ slug: s, type: 'info' as PageType, title: INFO_PAGE_TITLES[s], hint: `/${s}` })),
  { slug: SPECIAL_PAGE_SLUGS.faq, type: 'faq', title: 'FAQ', hint: 'Help & Support. Start each question with "## "' },
  { slug: SPECIAL_PAGE_SLUGS.contact, type: 'contact', title: 'Contact details', hint: 'Help & Support → Talk to us' },
  { slug: SPECIAL_PAGE_SLUGS.care, type: 'care', title: 'How to burn & care', hint: 'Product page accordion' }
];

const blank = (slug: string, type: PageType, title = ''): SitePage => ({ slug, type, title, body: '', published: false, productIds: [] });

/**
 * Admin → Pages & Journal. Nothing appears on the storefront until "Published" is ticked.
 * Body is Markdown: ## heading, **bold**, *italic*, - lists, > quote, [link](https://…).
 */
export const PagesEditor: React.FC<{ onMessage: (m: string) => void }> = ({ onMessage }) => {
  const [pages, setPages] = useState<SitePage[]>([]);
  const [editing, setEditing] = useState<SitePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeAllPages(setPages, (e) => onMessage(`Could not load pages: ${e.message}`)), []);

  const open = (slug: string, type: PageType, title: string) => {
    setEditing(pages.find((p) => p.slug === slug) || blank(slug, type, title));
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    const problem = validatePage(editing);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await savePage(editing);
      onMessage(`"${editing.title}" saved${editing.published ? ' and published' : ' as a draft'}.`);
      setEditing(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const journal = pages.filter((p) => p.type === 'journal');
  const status = (slug: string) => {
    const p = pages.find((x) => x.slug === slug);
    return p ? (p.published ? 'Published' : 'Draft') : 'Not written';
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Site pages</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIXED.map((f) => (
            <button key={f.slug} type="button" onClick={() => open(f.slug, f.type, f.title)} className="p-3 rounded-xl bg-white border border-[#E5DCCE] text-left text-xs flex justify-between items-center">
              <span><strong className="block text-[#1F1B18]">{f.title}</strong><span className="text-[#79716B]">{f.hint}</span></span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${status(f.slug) === 'Published' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>{status(f.slug)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Journal stories</h4>
          <button type="button" onClick={() => { setEditing(blank('', 'journal')); setError(null); }} className="text-[11px] text-[#9E6D47] flex items-center gap-1"><Plus className="w-3 h-3" />New story</button>
        </div>
        {journal.length === 0 && <p className="text-xs text-[#79716B]">No stories yet.</p>}
        {journal.map((p) => (
          <button key={p.slug} type="button" onClick={() => setEditing(p)} className="w-full p-3 rounded-xl bg-white border border-[#E5DCCE] text-left text-xs flex justify-between">
            <span><strong className="text-[#1F1B18]">{p.title}</strong> <span className="text-[#79716B]">/journal/{p.slug}</span></span>
            <span>{p.published ? 'Published' : 'Draft'}</span>
          </button>
        ))}
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[#FAF7F2] p-6 rounded-3xl border border-[#E5DCCE] max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-3">
            <h4 className="font-serif font-bold text-base text-[#1F1B18]">{editing.title || 'New story'}</h4>
            {editing.type === 'journal' && (
              <div><label className={label}>URL slug (/journal/…)</label><input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className={input} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Title</label><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={input} /></div>
              <div><label className={label}>Eyebrow (optional)</label><input value={editing.eyebrow || ''} onChange={(e) => setEditing({ ...editing, eyebrow: e.target.value })} className={input} /></div>
            </div>
            <div><label className={label}>Summary (shown under the title and in search results)</label><input value={editing.summary || ''} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} className={input} /></div>
            {editing.type === 'journal' && (
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label}>Category</label><input value={editing.category || ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={input} /></div>
                <div><label className={label}>Read time (min)</label><input type="number" min={0} value={editing.readMinutes || ''} onChange={(e) => setEditing({ ...editing, readMinutes: Number(e.target.value) || undefined })} className={input} /></div>
                <label className="flex items-center gap-2 text-xs mt-5"><input type="checkbox" checked={Boolean(editing.featured)} onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} />Featured</label>
              </div>
            )}
            {editing.type === 'journal' && (
              <div><label className={label}>Product IDs in this story (comma separated)</label><input value={(editing.productIds || []).join(', ')} onChange={(e) => setEditing({ ...editing, productIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={input} /></div>
            )}
            {(editing.type === 'journal' || editing.type === 'info') && (
              <div className="flex items-center gap-2">
                {editing.heroImage && <img src={editing.heroImage} alt="" className="w-16 h-10 rounded object-cover" />}
                <input placeholder="Hero image URL" value={editing.heroImage || ''} onChange={(e) => setEditing({ ...editing, heroImage: e.target.value })} className={input} />
                <label className="p-2 rounded-lg border border-[#DBC4A9] cursor-pointer" title="Upload hero image">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" className="hidden" accept={ALLOWED_PHOTO_TYPES.join(',')} onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !editing.slug) return setError('Set the slug before uploading an image.');
                    try { setEditing({ ...editing, heroImage: await uploadPageImage(editing.slug, f) }); } catch (err: any) { setError(err?.message || String(err)); }
                  }} />
                </label>
              </div>
            )}
            <div><label className={label}>Body (Markdown)</label><textarea rows={14} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className={`${input} font-mono`} /></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />Published (visible on the website)</label>
            {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
            <div className="flex justify-between pt-3 border-t border-[#E5DCCE]">
              {pages.some((p) => p.slug === editing.slug) && editing.type === 'journal' ? (
                <button type="button" onClick={async () => { if (confirm('Delete this story?')) { await deletePage(editing.slug); setEditing(null); } }} className="text-xs text-rose-700 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Delete</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-xs text-[#79716B]">Cancel</button>
                <button type="button" onClick={save} disabled={busy} className="px-5 py-2 bg-[#2A2521] text-white text-xs font-semibold rounded-xl flex items-center gap-1 disabled:opacity-60"><Save className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
