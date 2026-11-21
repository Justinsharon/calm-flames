import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../types';
import { useCatalog } from './CatalogContext';
import { auth, db } from '../lib/firebase';
import { doc, getDocs, collection, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

interface WishlistContextType {
  wishlist: string[];
  wishlistProducts: Product[];
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  isWishlistOpen: boolean;
  setIsWishlistOpen: (open: boolean) => void;
  lastFeedback: { message: string; visible: boolean } | null;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

const WISHLIST_STORAGE_KEY = 'the_calm_flame_wishlist';

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const { products } = useCatalog();
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ message: string; visible: boolean } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch (e) {
      console.warn('Failed to save wishlist', e);
    }
  }, [wishlist]);

  // Sync with Firestore upon authentication change
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userWishlistRef = collection(db, 'customers', user.uid, 'wishlist');
          const snap = await getDocs(userWishlistRef);

          if (!snap.empty) {
            const serverIds: string[] = [];
            snap.forEach((d) => serverIds.push(d.id));

            setWishlist((prevLocal) => {
              const merged = Array.from(new Set([...serverIds, ...prevLocal]));
              // Upload missing local items to server
              for (const locId of prevLocal) {
                if (!serverIds.includes(locId)) {
                  setDoc(doc(db, 'customers', user.uid, 'wishlist', locId), {
                    productId: locId,
                    addedAt: new Date().toISOString()
                  }).catch(() => {});
                }
              }
              return merged;
            });
          } else if (wishlist.length > 0) {
            // Upload local wishlist to Firestore
            const batch = writeBatch(db);
            for (const id of wishlist) {
              const itemRef = doc(db, 'customers', user.uid, 'wishlist', id);
              batch.set(itemRef, {
                productId: id,
                addedAt: new Date().toISOString()
              });
            }
            batch.commit().catch(() => {});
          }
        } catch (e) {
          console.warn('Could not sync wishlist with Firestore:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const toggleWishlist = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    const prodName = product ? product.name : 'Candle';

    setWishlist((prev) => {
      const exists = prev.includes(productId);
      let updated: string[];
      if (exists) {
        setLastFeedback({ message: `Removed ${prodName} from saved rituals`, visible: true });
        updated = prev.filter((id) => id !== productId);
        if (auth.currentUser) {
          deleteDoc(doc(db, 'customers', auth.currentUser.uid, 'wishlist', productId)).catch(() => {});
        }
      } else {
        setLastFeedback({ message: `Saved ${prodName} to your ritual sanctuary`, visible: true });
        updated = [...prev, productId];
        if (auth.currentUser) {
          setDoc(doc(db, 'customers', auth.currentUser.uid, 'wishlist', productId), {
            productId,
            addedAt: new Date().toISOString()
          }).catch(() => {});
        }
      }
      return updated;
    });

    setTimeout(() => {
      setLastFeedback((prev) => (prev ? { ...prev, visible: false } : null));
    }, 2800);
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  // Resolved against the live catalogue, so saved items always show current price/photo.
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        wishlistProducts,
        toggleWishlist,
        isInWishlist,
        isWishlistOpen,
        setIsWishlistOpen,
        lastFeedback
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
