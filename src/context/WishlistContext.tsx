import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { addFavourite, clearLocalWishlist, mergeLocalFavourites, readLocalWishlist, removeFavourite } from '../services/accountService';

/**
 * Favourites live in the account (customers/{uid}/wishlist). Guests who tap a heart are sent to
 * sign in; the product is remembered for this tab and saved right after sign-in. Any wishlist
 * kept on this device by the old storefront is merged into the account once, then cleared.
 */
interface WishlistContextType {
  wishlist: string[];
  isInWishlist: (productId: string) => boolean;
  /** Signed in: toggles. Guest: returns 'sign-in' (caller sends them to sign in). */
  toggleWishlist: (productId: string) => 'added' | 'removed' | 'sign-in';
  loading: boolean;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);
export const PENDING_FAVOURITE_KEY = 'tcf_pending_favourite';

export function rememberPendingFavourite(productId: string) {
  try {
    sessionStorage.setItem(PENDING_FAVOURITE_KEY, productId);
  } catch {
    /* ignore */
  }
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setWishlist([]);
      return;
    }
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const local = readLocalWishlist();
        let pending: string | null = null;
        try {
          pending = sessionStorage.getItem(PENDING_FAVOURITE_KEY);
          sessionStorage.removeItem(PENDING_FAVOURITE_KEY);
        } catch {
          /* ignore */
        }
        const merged = await mergeLocalFavourites(user.uid, pending ? [...local, pending] : local);
        clearLocalWishlist();
        if (live) setWishlist(merged);
      } catch (e) {
        console.warn('Could not load favourites:', e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);

  const isInWishlist = useCallback((id: string) => wishlist.includes(id), [wishlist]);

  const toggleWishlist = (id: string): 'added' | 'removed' | 'sign-in' => {
    if (!user) {
      rememberPendingFavourite(id);
      return 'sign-in';
    }
    if (wishlist.includes(id)) {
      setWishlist((w) => w.filter((x) => x !== id));
      removeFavourite(user.uid, id).catch(() => setWishlist((w) => [...w, id]));
      return 'removed';
    }
    setWishlist((w) => [...w, id]);
    addFavourite(user.uid, id).catch(() => setWishlist((w) => w.filter((x) => x !== id)));
    return 'added';
  };

  return <WishlistContext.Provider value={{ wishlist, isInWishlist, toggleWishlist, loading }}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
  const c = useContext(WishlistContext);
  if (!c) throw new Error('useWishlist must be used within a WishlistProvider');
  return c;
};
