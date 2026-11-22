import React from 'react';
import { Product } from '../../types';
import {
  COLLECTION_SLUGS,
  SCENT_FAMILY_SLUGS,
  OCCASION_SLUGS,
  PRODUCT_BADGE_TAGS,
  TAXONOMY_SEED_NAMES,
  isOneOf
} from '../../lib/taxonomy';
import { splitList, type ProductDetailsUpdate } from '../../lib/adminValidation';

/** Editor form state (strings for inputs; blank = clear the field). */
export interface DetailsForm {
  collection: string;
  scentFamily: string;
  notesTop: string;
  notesHeart: string;
  notesBase: string;
  burnTimeHours: string;
  weightGrams: string;
  sizeCm: string;
  ingredients: string;
  shortDescription: string;
  description: string;
  badges: string[];
  occasions: string[];
  boxEligible: boolean;
  mrp: string;
}

export function detailsFormFromProduct(p: Product): DetailsForm {
  const n = p.notes || p.scentNotes || {};
  return {
    collection: p.collection || '',
    // A legacy label with a slug equivalent ('Floral') is shown as that slug and saved as it on
    // the next save; one without ('Earthy') is kept as-is until changed.
    scentFamily: p.scentFamilySlug || p.scentFamily || '',
    notesTop: (n.top || []).join(', '),
    notesHeart: (n.heart || []).join(', '),
    notesBase: (n.base || []).join(', '),
    burnTimeHours: p.burnTimeHours !== undefined ? String(p.burnTimeHours) : '',
    weightGrams: p.weightGrams !== undefined ? String(p.weightGrams) : '',
    sizeCm: p.sizeCm || '',
    ingredients: p.ingredients || '',
    shortDescription: p.shortDescription || '',
    description: p.description || '',
    badges: (p.tags || []).filter((t) => (PRODUCT_BADGE_TAGS as readonly string[]).includes(t)),
    occasions: p.occasions || [],
    boxEligible: p.boxEligible === true,
    mrp: p.mrp !== undefined ? String(p.mrp) : ''
  };
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export function detailsUpdateFromForm(f: DetailsForm): ProductDetailsUpdate {
  const top = splitList(f.notesTop);
  const heart = splitList(f.notesHeart);
  const base = splitList(f.notesBase);
  return {
    collection: f.collection || null,
    scentFamily: f.scentFamily || null,
    notes: top.length || heart.length || base.length ? { top, heart, base } : null,
    burnTimeHours: numOrNull(f.burnTimeHours),
    weightGrams: numOrNull(f.weightGrams),
    sizeCm: f.sizeCm.trim() || null,
    ingredients: f.ingredients.trim() || null,
    shortDescription: f.shortDescription.trim() || null,
    description: f.description.trim() || null,
    badges: f.badges,
    occasions: f.occasions,
    boxEligible: f.boxEligible,
    mrp: numOrNull(f.mrp)
  };
}

const input = 'w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]';
const label = 'block text-[11px] font-medium text-[#79716B] mb-1';

export const ProductDetailsFields: React.FC<{ form: DetailsForm; onChange: (f: DetailsForm) => void }> = ({ form, onChange }) => {
  const set = (patch: Partial<DetailsForm>) => onChange({ ...form, ...patch });
  const toggle = (key: 'badges' | 'occasions', v: string) =>
    set({ [key]: form[key].includes(v) ? form[key].filter((x) => x !== v) : [...form[key], v] } as Partial<DetailsForm>);
  const legacyScent = form.scentFamily && !isOneOf(SCENT_FAMILY_SLUGS, form.scentFamily);

  return (
    <div className="space-y-3 border-t border-[#E5DCCE] pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Collection</label>
          <select value={form.collection} onChange={(e) => set({ collection: e.target.value })} className={input}>
            <option value="">— None —</option>
            {COLLECTION_SLUGS.map((s) => (
              <option key={s} value={s}>{TAXONOMY_SEED_NAMES.collections[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Scent Family</label>
          <select value={form.scentFamily} onChange={(e) => set({ scentFamily: e.target.value })} className={input}>
            <option value="">— None —</option>
            {legacyScent && <option value={form.scentFamily}>{form.scentFamily} (current)</option>}
            {SCENT_FAMILY_SLUGS.map((s) => (
              <option key={s} value={s}>{TAXONOMY_SEED_NAMES.scentFamilies[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>Top notes</label>
          <input value={form.notesTop} onChange={(e) => set({ notesTop: e.target.value })} placeholder="comma separated" className={input} />
        </div>
        <div>
          <label className={label}>Heart notes</label>
          <input value={form.notesHeart} onChange={(e) => set({ notesHeart: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Base notes</label>
          <input value={form.notesBase} onChange={(e) => set({ notesBase: e.target.value })} className={input} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={label}>Burn time (h)</label>
          <input type="number" min={0} value={form.burnTimeHours} onChange={(e) => set({ burnTimeHours: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Weight (g)</label>
          <input type="number" min={0} value={form.weightGrams} onChange={(e) => set({ weightGrams: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Size (cm)</label>
          <input value={form.sizeCm} onChange={(e) => set({ sizeCm: e.target.value })} placeholder="e.g. 8 x 10" className={input} />
        </div>
        <div>
          <label className={label}>MRP (₹, optional)</label>
          <input type="number" min={0} value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Short description</label>
        <input value={form.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} className={input} />
      </div>
      <div>
        <label className={label}>Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={input} />
      </div>
      <div>
        <label className={label}>Ingredients</label>
        <textarea rows={2} value={form.ingredients} onChange={(e) => set({ ingredients: e.target.value })} className={input} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#1F1B18]">
        <span className="text-[11px] font-medium text-[#79716B] w-full">Tags</span>
        {PRODUCT_BADGE_TAGS.map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.badges.includes(t)} onChange={() => toggle('badges', t)} />
            {t}
          </label>
        ))}
        <label className="flex items-center gap-1.5 ml-auto">
          <input type="checkbox" checked={form.boxEligible} onChange={(e) => set({ boxEligible: e.target.checked })} />
          Build-a-box eligible
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#1F1B18]">
        <span className="text-[11px] font-medium text-[#79716B] w-full">Occasions</span>
        {OCCASION_SLUGS.map((o) => (
          <label key={o} className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.occasions.includes(o)} onChange={() => toggle('occasions', o)} />
            {TAXONOMY_SEED_NAMES.occasions[o]}
          </label>
        ))}
      </div>
    </div>
  );
};
