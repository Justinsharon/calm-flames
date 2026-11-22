import React, { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { paths } from '../../lib/routes';
import { Button, MatchAvatar } from './ui';

const BENEFITS = [
  ['Favourites, saved', 'Your liked candles follow you to any device.'],
  ['Faster checkout', 'Saved addresses, filled in for you.'],
  ['Order history', 'Track every order in one place.']
];

/** Google sign-in (SignIn.html). Used by the /sign-in page and the header modal. */
export const SignInPanel: React.FC<{ onGuest: () => void; onSignedIn?: () => void; titleId?: string }> = ({ onGuest, onSignedIn, titleId = 'sign-in-title' }) => {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSignedIn?.();
    } catch (e: any) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') setError('Sign-in did not finish. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="glass" style={{ width: '100%', maxWidth: 520, padding: 'clamp(28px, 5vw, 48px)', display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center', alignItems: 'center' }}>
      <span aria-hidden="true" style={{ display: 'inline-block', transform: 'scale(1.7)', margin: '34px 0 22px' }}>
        <MatchAvatar size={44} />
      </span>
      <h1 id={titleId} className="serif" style={{ fontSize: 'clamp(2.2rem, 5vw, 48px)', fontWeight: 400, margin: 0, lineHeight: 1.05 }}>
        Save your <span className="script">favourites</span>
      </h1>
      <p style={{ margin: 0, color: 'var(--color-muted)' }}>Sign in to keep the candles you love and your orders in one place.</p>
      <Button onClick={go} disabled={busy} style={{ width: '100%' }}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.7 7-17.1z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.9-13.6-9.6l-7.8 6C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </Button>
      {error && <p role="alert" style={{ margin: 0, color: '#F3B7AE' }}>{error}</p>}
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', color: 'var(--color-taupe)', fontSize: 13 }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(244,237,231,.18)' }} />or<span style={{ flex: 1, height: 1, background: 'rgba(244,237,231,.18)' }} />
      </div>
      <Button variant="out" onClick={onGuest} style={{ width: '100%' }}>Keep browsing as a guest</Button>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>No account needed to browse or buy.</p>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left', width: '100%' }}>
        {BENEFITS.map(([t, d]) => (
          <li key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--color-rose)', marginTop: 8, flex: 'none' }} />
            <span>
              <strong style={{ display: 'block' }}>{t}</strong>
              <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>{d}</span>
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-taupe)' }}>
        We only use your name and email from Google. <Link to={paths.info('privacy')} className="lnk">Privacy</Link>
      </p>
    </div>
  );
};

/** Header modal version (Escape / backdrop closes; focus moves into the dialog). */
export const SignInModal: React.FC = () => {
  const { isAuthModalOpen, setIsAuthModalOpen, user } = useAuth();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isAuthModalOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsAuthModalOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [isAuthModalOpen, setIsAuthModalOpen]);
  if (!isAuthModalOpen || user) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && setIsAuthModalOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(14,5,7,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div ref={ref} style={{ position: 'relative', width: '100%', maxWidth: 520, margin: 'auto' }}>
        <button type="button" aria-label="Close" onClick={() => setIsAuthModalOpen(false)} className="nav-btn" style={{ position: 'absolute', right: 10, top: 10, zIndex: 2 }}>
          ×
        </button>
        <SignInPanel titleId="sign-in-modal-title" onGuest={() => setIsAuthModalOpen(false)} />
      </div>
    </div>
  );
};
