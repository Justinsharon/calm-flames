import React, { useEffect, useState } from 'react';
import { type SupportRequest, type SupportStatus, setSupportStatus, subscribeSupportRequests, supportPhotoUrl } from '../../services/adminSupportService';

/** Admin → Support: call-back and damaged-item requests from Help & Support. */
export const SupportEditor: React.FC<{ onMessage: (m: string) => void }> = ({ onMessage }) => {
  const [items, setItems] = useState<SupportRequest[]>([]);
  const [filter, setFilter] = useState<SupportStatus | 'all'>('open');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => subscribeSupportRequests(setItems, (e) => setError(e.message)), []);
  const shown = items.filter((r) => filter === 'all' || r.status === filter);
  const openPhoto = async (path: string) => {
    try {
      window.open(await supportPhotoUrl(path), '_blank', 'noopener');
    } catch (e: any) {
      setError(`Could not open the photo: ${e.message}`);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Support requests</h4>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-2 py-1 text-xs rounded-lg border border-[#DBC4A9] bg-white">
          <option value="open">Open ({items.filter((r) => r.status === 'open').length})</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All ({items.length})</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      {shown.length === 0 && <p className="text-xs text-[#79716B]">Nothing here.</p>}
      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="p-4 bg-white border border-[#E5DCCE] rounded-2xl text-xs space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-bold">
                {r.type === 'damaged' ? 'Damaged item' : 'Call-back'} · {r.name} · <a href={`tel:+91${r.phone}`} className="underline">+91 {r.phone}</a>
                {r.email && <> · <a href={`mailto:${r.email}`} className="underline">{r.email}</a></>}
              </span>
              <span className="text-[#79716B]">{new Date(r.createdAt).toLocaleString('en-IN')}</span>
            </div>
            {(r.orderNumber || r.preferredTime) && (
              <p className="text-[#79716B]">{[r.orderNumber && `Order ${r.orderNumber}`, r.preferredTime && `Best time: ${r.preferredTime}`].filter(Boolean).join(' · ')}</p>
            )}
            <p className="whitespace-pre-wrap text-[#1F1B18]">{r.message}</p>
            <div className="flex flex-wrap gap-3 items-center">
              {r.photo && (
                <button type="button" className="underline text-[#9E6D47] font-semibold" onClick={() => openPhoto(r.photo!.path)}>
                  View photo ({Math.round(r.photo.size / 1024)} KB)
                </button>
              )}
              <label className="flex items-center gap-1">
                Status
                <select
                  value={r.status}
                  onChange={(e) =>
                    setSupportStatus(r.id, e.target.value as SupportStatus)
                      .then(() => onMessage(`Request marked ${e.target.value.replace('_', ' ')}.`))
                      .catch((err) => setError(err.message))
                  }
                  className="px-2 py-1 rounded-lg border border-[#DBC4A9] bg-[#FAF7F2]"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
