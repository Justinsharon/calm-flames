import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SignInModal } from './components/SignInPanel';
import { matchRoute, paths } from '../lib/routes';
import { AdminDashboard } from '../components/admin/AdminDashboard';

/**
 * Every storefront route: header (overlaying the hero, or solid on product, cart, checkout,
 * order and 404 pages),
 * the page, the footer. Wishlist, auth, account and admin stay the existing drawers and
 * modals for now (their redesign is Phase 4D); they render outside `.sf` so the dark theme
 * styles don't leak into them.
 */
export const StorefrontLayout: React.FC = () => {
  const location = useLocation();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const match = matchRoute(location.pathname);
  const variant = !match || ['product', 'cart', 'checkout', 'orderConfirmed', 'account'].includes(match.name) ? 'solid' : 'overlay';

  // New page: start at the top (but keep in-page #anchors working).
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <>
      <div className="sf">
        <a href="#main" className="btn btn-pri" style={{ position: 'absolute', left: 12, top: -80, zIndex: 100 }} onFocus={(e) => (e.currentTarget.style.top = '12px')} onBlur={(e) => (e.currentTarget.style.top = '-80px')}>
          Skip to content
        </a>
        <Header variant={variant} />
        <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
          <Outlet context={{ openAdmin: () => setIsAdminOpen(true) }} />
        </main>
        <Footer />
        <SignInModal />
      </div>

      <AdminDashboard isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
    </>
  );
};
