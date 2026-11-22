import React, { useEffect, useState } from 'react';
import { type Coupon, normalizeCouponCode, validateCoupon } from '../../lib/coupons';
import { deleteCoupon, saveCoupon, subscribeCoupons } from '../../services/adminCouponsService';

interface Form {
  code: string;
  type: 'percent' | 'fixed';
  value: string;
  minOrder: string;
  maxDiscount: string;
  active: boolean;
  expiresAt: string;
}
const BLANK: Form = { code: '', type: 'percent', value: '', minOrder: '0', maxDiscount: '', active: false, expiresAt: '' };

const toForm = (c: Coupon): Form => ({
  code: c.code,
  type: c.type,
  value: String(c.value),
  minOrder: String(c.minOrder),
  maxDiscount: c.maxDiscount !== undefined ? String(c.maxDiscount) : '',
  active: c.active,
  expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : ''
});

export function formToCoupon(f: Form): Coupon {
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  return {
    code: normalizeCouponCode(f.code),
    type: f.type,
    value: num(f.value),
    minOrder: f.minOrder.trim() === '' ? 0 : num(f.minOrder),
    maxDiscount: f.type === 'percent' && f.maxDiscount.trim() !== '' ? num(f.maxDiscount) : undefined,
    active: f.active,
    // End of the chosen day, India time.
    expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59+05:30`).toISOString() : undefined
  };
}

/** Admin → Coupons. Codes are applied by the server only; nothing here is shown to shoppers. */
export const CouponsEditor: React.FC<{ onMessage: (m: string) => void }> = ({ onMessage }) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<Form>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeCoupons(setCoupons, (e) => setError(e.message)), []);

  const save = async () => {
    const c = formToCoupon(form);
    const err = validateCoupon(c);
    if (err) return setError(err);
    if (!editing && coupons.some((x) => x.code === c.code)) return setError(`${c.code} already exists. Edit it instead.`);
    setBusy(true);
    try {
      await saveCoupon(c);
      onMessage(`Coupon ${c.code} saved${c.active ? ' (active)' : ' (inactive)'}.`);
      setForm(BLANK);
      setEditing(null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not save the coupon.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2 text-xs rounded-lg border border-[#DBC4A9] bg-white';
  const label = 'block text-[11px] font-medium text-[#79716B] mb-1';
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Coupons</h4>
        <span className="text-xs text-[#79716B]">Applied by the server at checkout · inactive codes do nothing</span>
      </div>

      <div className="overflow-x-auto bg-white border border-[#E5DCCE] rounded-2xl">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#FAF7F2] text-[#79716B]">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Discount</th>
              <th className="py-3 px-4">Min order</th>
              <th className="py-3 px-4">Expires</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5DCCE]">
            {coupons.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 px-4 text-[#79716B]">No coupons yet. Run <code>npm run migrate:coupons</code> to add CALM10 and FIRSTFLAME (inactive), or create one below.</td>
              </tr>
            )}
            {coupons.map((c) => (
              <tr key={c.code}>
                <td className="py-3 px-4 font-mono font-bold">{c.code}</td>
                <td className="py-3 px-4">{c.type === 'percent' ? `${c.value}%${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}` : `₹${c.value}`}</td>
                <td className="py-3 px-4">₹{c.minOrder}</td>
                <td className="py-3 px-4">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : '—'}</td>
                <td className="py-3 px-4">
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-full text-[10px] font-bold ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}
                    onClick={() => saveCoupon({ ...c, active: !c.active }).then(() => onMessage(`${c.code} ${c.active ? 'turned off' : 'turned on'}.`)).catch((e) => setError(e.message))}
                    aria-label={`${c.code} is ${c.active ? 'active' : 'inactive'}; switch`}
                  >
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="py-3 px-4 text-right space-x-3">
                  <button type="button" className="text-[11px] text-[#9E6D47] font-semibold hover:underline" onClick={() => { setForm(toForm(c)); setEditing(c.code); setError(null); }}>Edit</button>
                  <button
                    type="button"
                    className="text-[11px] text-red-700 font-semibold hover:underline"
                    onClick={() => {
                      if (window.confirm(`Delete coupon ${c.code}?`)) deleteCoupon(c.code).then(() => onMessage(`${c.code} deleted.`)).catch((e) => setError(e.message));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-white border border-[#E5DCCE] rounded-2xl space-y-3">
        <h5 className="text-xs font-bold">{editing ? `Edit ${editing}` : 'New coupon'}</h5>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label><span className={label}>Code</span><input className={input} value={form.code} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
          <label>
            <span className={label}>Type</span>
            <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Form['type'] })}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed ₹ off</option>
            </select>
          </label>
          <label><span className={label}>{form.type === 'percent' ? 'Percent (1–100)' : 'Amount ₹'}</span><input className={input} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
          <label><span className={label}>Minimum order ₹</span><input className={input} inputMode="decimal" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} /></label>
          {form.type === 'percent' && (
            <label><span className={label}>Max discount ₹ (optional)</span><input className={input} inputMode="decimal" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} /></label>
          )}
          <label><span className={label}>Expires (optional)</span><input className={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs mt-5"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label>
        </div>
        {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-[#2A2521] text-white text-xs font-bold disabled:opacity-50">{editing ? 'Save changes' : 'Create coupon'}</button>
          {editing && <button type="button" onClick={() => { setForm(BLANK); setEditing(null); setError(null); }} className="px-4 py-2 rounded-xl border border-[#DBC4A9] text-xs">Cancel</button>}
        </div>
      </div>
    </div>
  );
};
