import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { GIFT_GUIDE_MAX_INPUT, GIFT_GUIDE_QUICK_REPLIES, type GiftGuideResponse } from '../../lib/giftGuide';
import { formatInr } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { MatchAvatar } from './ui';

type Msg = { from: 'you'; text: string } | { from: 'guide'; text: string; result?: GiftGuideResponse };

/**
 * Gift guide (Gifting.html): floating button + panel. Suggestions come from /api/gift-guide,
 * which picks only from active, priced, in-stock products in Firestore.
 */
export const GiftGuide: React.FC<{ open: boolean; setOpen: (o: boolean) => void }> = ({ open, setOpen }) => {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'guide', text: "Hi! I can help you find the right candle gift. Who is it for, and what's the occasion?" }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => open && e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  const ask = async (q: string) => {
    const message = q.trim().slice(0, GIFT_GUIDE_MAX_INPUT);
    if (!message || busy) return;
    setMsgs((m) => [...m, { from: 'you', text: message }]);
    setText('');
    setBusy(true);
    try {
      const r = await fetch('/api/gift-guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'The gift guide is resting. Please try again in a moment.');
      const result = d as GiftGuideResponse;
      setMsgs((m) => [
        ...m,
        result.suggestions.length
          ? { from: 'guide', text: 'Here are a few I think they would love:', result }
          : { from: 'guide', text: "I couldn't find a candle in stock for that right now. Try another idea, or browse by occasion below." }
      ]);
    } catch (e: any) {
      setMsgs((m) => [...m, { from: 'guide', text: e?.message || 'Something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="guide">
      {open && (
        <div
          className="glass"
          role="dialog"
          aria-label="Gift guide"
          style={{ width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(640px, calc(100vh - 120px))', background: 'rgba(30,11,15,.96)', boxShadow: '0 40px 90px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(244,237,231,.12)' }}>
            <MatchAvatar />
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block' }}>Gift guide</strong>
              <span style={{ fontSize: 12, color: 'var(--color-taupe)' }}>Suggests only candles we have in stock</span>
            </span>
            <button type="button" aria-label="Close gift guide" onClick={() => setOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, border: 0, background: 'rgba(244,237,231,.08)', color: 'var(--color-ivory)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div ref={listRef} aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === 'you' ? 'flex-end' : 'stretch', maxWidth: m.from === 'you' ? '85%' : '100%' }}>
                <p style={{ margin: 0, padding: '10px 14px', borderRadius: 16, fontSize: 14, background: m.from === 'you' ? 'var(--color-ivory)' : 'rgba(244,237,231,.07)', color: m.from === 'you' ? 'var(--color-wine-deep)' : 'var(--color-ivory)' }}>{m.text}</p>
                {m.from === 'guide' && m.result && (
                  <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {m.result.suggestions.map((s) => (
                      <li key={s.productId} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10, borderRadius: 14, border: '1px solid rgba(244,237,231,.14)' }}>
                        {s.image ? <img src={s.image} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flex: 'none' }} /> : <span style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--color-ink-2)', flex: 'none' }} />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="serif" style={{ fontSize: 18, display: 'block', lineHeight: 1.2 }}>{s.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{formatInr(s.price)}</span>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>{s.reason}</span>
                          <Link to={paths.product({ id: s.productId, slug: s.slug })} className="lnk" style={{ fontSize: 13 }} onClick={() => setOpen(false)}>View</Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-taupe)' }}>Thinking…</p>}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid rgba(244,237,231,.12)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {GIFT_GUIDE_QUICK_REPLIES.map((q) => (
                <button key={q} type="button" className="chip" style={{ flex: 'none', minHeight: 34, fontSize: 12 }} disabled={busy} onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void ask(text);
              }}
            >
              <label htmlFor="guide-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Describe who the gift is for</label>
              <input id="guide-input" ref={inputRef} className="in" style={{ flex: 1, minWidth: 0, minHeight: 44 }} maxLength={GIFT_GUIDE_MAX_INPUT} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. my sister, loves jasmine" />
              <button type="submit" className="chip on" disabled={busy || !text.trim()}>Send</button>
            </form>
          </div>
        </div>
      )}
      <button type="button" className="guide-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MatchAvatar size={46} />
        Gift guide
      </button>
    </div>
  );
};
