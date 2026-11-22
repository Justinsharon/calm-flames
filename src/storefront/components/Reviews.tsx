import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { type ProductReview, getApprovedReviews, reviewEligibility, submitReview } from '../../services/reviewsService';
import { Button, SectionHead } from './ui';

const Stars: React.FC<{ n: number }> = ({ n }) => (
  <span aria-label={`${n} out of 5`} style={{ color: 'var(--color-rose)', letterSpacing: 2 }}>
    {'★'.repeat(n)}
    <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - n)}</span>
  </span>
);

/**
 * Approved reviews only; the section is hidden while there are none. Signed-in verified buyers
 * (server-recorded purchase) can write one; it stays pending until the owner approves it.
 */
export const ProductReviews: React.FC<{ productId: string }> = ({ productId }) => {
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [eligible, setEligible] = useState<'can' | 'reviewed' | 'not-buyer'>('not-buyer');
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');

  useEffect(() => {
    getApprovedReviews(productId).then(setReviews).catch(() => setReviews([]));
  }, [productId]);
  useEffect(() => {
    if (user) reviewEligibility(user.uid, productId).then(setEligible).catch(() => setEligible('not-buyer'));
    else setEligible('not-buyer');
  }, [user, productId]);

  if (reviews.length === 0 && eligible !== 'can' && state !== 'sent') return null;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="wrap" style={{ paddingTop: 60 }} aria-label="Reviews">
      <SectionHead eyebrow={reviews.length ? `${avg.toFixed(1)} · ${reviews.length} review${reviews.length === 1 ? '' : 's'}` : undefined} before="Kind" script="words" />
      {reviews.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {reviews.map((r) => (
            <li key={r.id} className="glass" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Stars n={r.rating} />
              {r.title && <strong>{r.title}</strong>}
              <p style={{ margin: 0 }}>{r.body}</p>
              <span style={{ fontSize: 13, color: 'var(--color-taupe)' }}>{r.authorName} · Verified buyer</span>
            </li>
          ))}
        </ul>
      )}
      {state === 'sent' ? (
        <p role="status" style={{ color: 'var(--color-muted)' }}>Thank you. Your review will appear once we've read it.</p>
      ) : eligible === 'can' && user ? (
        open ? (
          <form
            className="glass"
            style={{ padding: 22, display: 'grid', gap: 14, maxWidth: 640 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setState('busy');
              try {
                await submitReview({ uid: user.uid, productId, authorName: (profile?.fullName || '').split(/\s+/)[0] || 'Customer', rating, body });
                setState('sent');
              } catch {
                setState('error');
              }
            }}
          >
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
              <legend className="lab" style={{ float: 'left', marginRight: 10 }}>Rating</legend>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`chip${rating >= n ? ' on' : ''}`} aria-pressed={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}>
                  ★
                </button>
              ))}
            </fieldset>
            <label className="lab">
              Your review
              <textarea className="in" rows={4} maxLength={2000} required value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            {state === 'error' && <p role="alert" className="field-err">Could not send your review. Please try again.</p>}
            <div><Button type="submit" disabled={state === 'busy' || !body.trim()}>Send review</Button></div>
          </form>
        ) : (
          <Button variant="out" onClick={() => setOpen(true)}>Write a review</Button>
        )
      ) : null}
    </section>
  );
};
