import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { matchRoute, paths } from '../lib/routes';
import { useCart } from '../context/CartContext';
import { CartDrawer } from '../components/cart/CartDrawer';
import { CheckoutModal } from '../components/checkout/CheckoutModal';
import { WishlistDrawer } from '../components/wishlist/WishlistDrawer';
import { AuthModal } from '../components/auth/AuthModal';
import { CustomerAccountDrawer } from '../components/account/CustomerAccountDrawer';
import { AdminDashboard } from '../components/admin/AdminDashboard';

/**
 * Every storefront route: header (overlaying the hero, or solid on product / 404 pages),
 * the page, the footer. Cart, wishlist, auth, account and admin stay the existing drawers and
 * modals for now (their redesign is Phase 4C/4D); they render outside `.sf` so the dark theme
 * styles don't leak into them.
 */
export const StorefrontLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isCheckoutOpen, setIsCheckoutOpen } = useCart();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const match = matchRoute(location.pathname);
  const variant = !match || match.name === 'product' ? 'solid' : 'overlay';

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
          <Outlet />
        </main>
        <Footer />
      </div>

      <CartDrawer onExplore={() => navigate(paths.home())} onProceedToCheckout={() => setIsCheckoutOpen(true)} />
      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} onOrderSuccess={() => {}} />
      <WishlistDrawer onExplore={() => navigate(paths.home())} onSelectProduct={(p) => navigate(paths.product(p))} />
      <AuthModal />
      <CustomerAccountDrawer onOpenAdmin={() => setIsAdminOpen(true)} onExploreProducts={() => navigate(paths.home())} />
      <AdminDashboard isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
    </>
  );
};
