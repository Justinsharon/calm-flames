import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { HERO_ASSET } from '../../data/siteContent';
import { useDocumentMeta } from '../hooks/useMotion';
import { SignInPanel } from '../components/SignInPanel';
import { safeNext } from '../lib/recentlyViewed';
import { PENDING_FAVOURITE_KEY } from '../../context/WishlistContext';

export const SignInPage: React.FC = () => {
  useDocumentMeta('Sign in', 'Sign in with Google to keep your favourites and orders in one place.');
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'), '/account');

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading, next, navigate]);

  return (
    <section className="hero" style={{ minHeight: '100vh' }}>
      <div className="hero-media" aria-hidden="true">
        <img className="drift" src={HERO_ASSET} alt="" />
      </div>
      <div className="hero-fade" aria-hidden="true" style={{ background: 'rgba(20,8,11,.72)' }} />
      <div className="wrap" style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingBottom: 60 }}>
        <SignInPanel
          onGuest={() => {
            try {
              sessionStorage.removeItem(PENDING_FAVOURITE_KEY);
            } catch {
              /* ignore */
            }
            navigate(safeNext(params.get('next'), '/'));
          }}
        />
      </div>
    </section>
  );
};
