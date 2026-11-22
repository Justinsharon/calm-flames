import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { saveStoreSettings } from '../../services/adminCatalogService';
import { validateStoreSettings, type StoreSettings } from '../../lib/storeSettings';
import { splitList } from '../../lib/adminValidation';

const input = 'w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]';
const label = 'block text-[11px] font-medium text-[#79716B] mb-1';

interface Form {
  freeShippingThreshold: string;
  shippingFee: string;
  codEnabled: boolean;
  codFee: string;
  codMaxOrder: string;
  boxEnabled: boolean;
  sizes: { count: string; price: string }[];
  ribbons: string;
  addOns: { name: string; price: string }[];
}

const str = (n?: number) => (n === undefined ? '' : String(n));
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

function toForm(s: StoreSettings): Form {
  return {
    freeShippingThreshold: str(s.freeShippingThreshold),
    shippingFee: str(s.shippingFee),
    codEnabled: s.codEnabled === true,
    codFee: str(s.codFee),
    codMaxOrder: str(s.codMaxOrder),
    boxEnabled: Boolean(s.buildABox),
    sizes: (s.buildABox?.sizes || []).map((z) => ({ count: String(z.count), price: String(z.price) })),
    ribbons: (s.buildABox?.ribbons || []).join(', '),
    addOns: (s.buildABox?.addOns || []).map((a) => ({ name: a.name, price: String(a.price) }))
  };
}

/** Blank fields are saved as unset, so the feature that needs them stays hidden. */
export function settingsFromForm(f: Form): StoreSettings {
  const out: StoreSettings = {};
  const fst = num(f.freeShippingThreshold);
  const sf = num(f.shippingFee);
  if (fst !== undefined) out.freeShippingThreshold = fst;
  if (sf !== undefined) out.shippingFee = sf;
  out.codEnabled = f.codEnabled;
  const cf = num(f.codFee);
  const cm = num(f.codMaxOrder);
  if (cf !== undefined) out.codFee = cf;
  if (cm !== undefined) out.codMaxOrder = cm;
  if (f.boxEnabled) {
    out.buildABox = {
      sizes: f.sizes.map((z) => ({ count: Number(z.count), price: Number(z.price) })),
      ribbons: splitList(f.ribbons),
      addOns: f.addOns.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), price: Number(a.price) }))
    };
  }
  return out;
}

export const StoreSettingsEditor: React.FC<{ onMessage: (m: string) => void }> = ({ onMessage }) => {
  const { settings, shipping, cod, buildABox } = useStoreSettings();
  const [form, setForm] = useState<Form>(toForm(settings));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(toForm(settings)), [settings]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = settingsFromForm(form);
    const problem = validateStoreSettings(next);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveStoreSettings(next);
      onMessage('Store settings saved. The storefront updates automatically.');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const Status: React.FC<{ on: boolean }> = ({ on }) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
      {on ? 'On' : 'Off (hidden)'}
    </span>
  );

  return (
    <form onSubmit={save} className="space-y-5 max-w-2xl">
      <p className="text-xs text-[#79716B]">
        Leave a field blank to keep it unset. Features that depend on unset values are hidden from customers, and
        checkout cannot quote totals until shipping is set.
      </p>

      <section className="p-4 rounded-2xl bg-white border border-[#E5DCCE] space-y-3">
        <div className="flex justify-between items-center"><h5 className="text-sm font-serif font-bold">Shipping</h5><Status on={Boolean(shipping)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Free shipping from (₹)</label><input type="number" min={0} value={form.freeShippingThreshold} onChange={(e) => setForm({ ...form, freeShippingThreshold: e.target.value })} className={input} /></div>
          <div><label className={label}>Shipping fee below that (₹)</label><input type="number" min={0} value={form.shippingFee} onChange={(e) => setForm({ ...form, shippingFee: e.target.value })} className={input} /></div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-white border border-[#E5DCCE] space-y-3">
        <div className="flex justify-between items-center"><h5 className="text-sm font-serif font-bold">Cash on delivery</h5><Status on={Boolean(cod)} /></div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.codEnabled} onChange={(e) => setForm({ ...form, codEnabled: e.target.checked })} />Offer cash on delivery</label>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>COD fee (₹)</label><input type="number" min={0} value={form.codFee} onChange={(e) => setForm({ ...form, codFee: e.target.value })} className={input} /></div>
          <div><label className={label}>Max COD order (₹)</label><input type="number" min={0} value={form.codMaxOrder} onChange={(e) => setForm({ ...form, codMaxOrder: e.target.value })} className={input} /></div>
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-white border border-[#E5DCCE] space-y-3">
        <div className="flex justify-between items-center"><h5 className="text-sm font-serif font-bold">Build-a-box</h5><Status on={Boolean(buildABox)} /></div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.boxEnabled} onChange={(e) => setForm({ ...form, boxEnabled: e.target.checked, sizes: form.sizes.length ? form.sizes : [{ count: '', price: '' }] })} />Enable build-a-box</label>
        {form.boxEnabled && (
          <>
            <span className={label}>Box sizes</span>
            {form.sizes.map((z, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-center">
                <input aria-label="Candles per box" placeholder="Candles" type="number" min={1} value={z.count} onChange={(e) => setForm({ ...form, sizes: form.sizes.map((x, k) => (k === i ? { ...x, count: e.target.value } : x)) })} className={`${input} col-span-2`} />
                <input aria-label="Box price" placeholder="Price ₹" type="number" min={0} value={z.price} onChange={(e) => setForm({ ...form, sizes: form.sizes.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)) })} className={`${input} col-span-2`} />
                <button type="button" aria-label="Remove size" onClick={() => setForm({ ...form, sizes: form.sizes.filter((_, k) => k !== i) })} className="text-rose-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, sizes: [...form.sizes, { count: '', price: '' }] })} className="text-[11px] text-[#9E6D47] flex items-center gap-1"><Plus className="w-3 h-3" />Add size</button>
            <div><label className={label}>Ribbons (comma separated)</label><input value={form.ribbons} onChange={(e) => setForm({ ...form, ribbons: e.target.value })} className={input} /></div>
            <span className={label}>Add-ons</span>
            {form.addOns.map((a, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-center">
                <input aria-label="Add-on name" placeholder="Name" value={a.name} onChange={(e) => setForm({ ...form, addOns: form.addOns.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} className={`${input} col-span-2`} />
                <input aria-label="Add-on price" placeholder="Price ₹" type="number" min={0} value={a.price} onChange={(e) => setForm({ ...form, addOns: form.addOns.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)) })} className={`${input} col-span-2`} />
                <button type="button" aria-label="Remove add-on" onClick={() => setForm({ ...form, addOns: form.addOns.filter((_, k) => k !== i) })} className="text-rose-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, addOns: [...form.addOns, { name: '', price: '' }] })} className="text-[11px] text-[#9E6D47] flex items-center gap-1"><Plus className="w-3 h-3" />Add add-on</button>
          </>
        )}
      </section>

      {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className="px-5 py-2 bg-[#2A2521] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 disabled:opacity-60">
        <Save className="w-3.5 h-3.5" />
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
};
