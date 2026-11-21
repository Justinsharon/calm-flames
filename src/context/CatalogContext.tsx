/**
 * Live product catalogue from Firestore `products` (the single source of truth).
 * Uses a realtime listener so price / stock / photo / active changes made in the admin
 * dashboard appear on the storefront without a redeploy or reload.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { productFromDoc } from '../lib/productMapping';
import { Product } from '../types';

interface CatalogContextType {
  /** Active, non-historical products in display order. */
  products: Product[];
  loading: boolean;
  error: string | null;
  getProductById: (id: string) => Product | undefined;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function sortProducts(list: Product[]): Product[] {
  return [...list].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
  );
}

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Rules only allow public reads of active products, so the query must filter on isActive.
    const q = query(collection(db, 'products'), where('isActive', '==', true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const live = snapshot.docs
          .map((d) => productFromDoc(d.id, d.data()))
          .filter((p) => p.isActive && !p.isHistorical);
        setProducts(sortProducts(live));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Could not load the product catalogue from Firestore:', err);
        setError('We could not load the collection right now. Please refresh in a moment.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const value = useMemo<CatalogContextType>(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return { products, loading, error, getProductById: (id) => byId.get(id) };
  }, [products, loading, error]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export function useCatalog(): CatalogContextType {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within a CatalogProvider');
  return ctx;
}
