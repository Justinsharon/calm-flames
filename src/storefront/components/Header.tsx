import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { inCollection, withProducts } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { PersonIcon, Wordmark } from './ui';

/**
 * Header: wordmark · Menu · account · Cart (n). Overlays the hero on pages with one, solid
 * elsewhere. Menu opens a glass panel (Collections | Explore); closes on Escape, outside click
 * and navigation, and returns focus to the Menu button.
 */
export const Header: React.FC<{ variant: 'overlay' | 'solid' }> = ({ variant }) => {
  const [open, setOpen] = useState(false);
  const { totalItems } = useCart();
  const { buildABox } = useStoreSettings();
  const { user, profile, setIsAuthModalOpen, setIsAccountOpen } = useAuth();
  const { setIsWishlistOpen } = useWishlist();
  const { products } = useCatalog();
  const { collections } = useTaxonomy();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const liveCollections = withProducts(collections, products, inCollection);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const initial = (profile?.fullName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <header className={`site-header ${variant}`}>
      <Link to={paths.home()} aria-label="The Calm Flame, home" style={{ textDecoration: 'none' }}>
        <Wordmark />
      </Link>
      <nav aria-label="Main" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <button ref={btnRef} type="button" className="nav-btn" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <button
          type="button"
          className="nav-btn"
          aria-label={user ? 'Your account' : 'Sign in'}
          onClick={() => (user ? setIsAccountOpen(true) : setIsAuthModalOpen(true))}
        >
          {user ? <span className="avatar-initial">{initial}</span> : <PersonIcon />}
        </button>
        <Link to={paths.cart()} className="nav-btn" aria-label={`Cart, ${totalItems} item${totalItems === 1 ? '' : 's'}`} style={{ textDecoration: 'none' }}>
          Cart ({totalItems})
        </Link>
      </nav>
      {open && (
        <div ref={panelRef} id="site-menu" className="glass menu-panel" role="dialog" aria-label="Site menu">
          {liveCollections.length > 0 && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Collections</p>
              {liveCollections.map((c) => (
                <Link key={c.slug} to={paths.collection(c.slug)}>{c.name}</Link>
              ))}
            </div>
          )}
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Explore</p>
            <Link to={paths.scent()}>Shop by Scent</Link>
            <Link to={paths.gifting()}>Gifting</Link>
            {buildABox && <Link to={paths.buildBox()}>Build a Box</Link>}
            <Link to={paths.journal()}>Journal</Link>
            <Link to={paths.info('our-story')}>Our Story</Link>
            <Link to={paths.support()}>Help &amp; Support</Link>
            <button type="button" className="menu-link" onClick={() => (user ? setIsWishlistOpen(true) : setIsAuthModalOpen(true))}>
              {user ? 'Favourites' : 'Sign in · Favourites'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
