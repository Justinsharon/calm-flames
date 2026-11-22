/**
 * Realtime taxonomy docs (collections, scentFamilies, occasions), resolved for display.
 * Public read per firestore.rules. Before the docs are seeded, built-in slug names are used.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TaxonomyDoc, TaxonomyKind } from '../lib/taxonomy';
import { resolveTaxonomy, type TaxonomyItem } from '../lib/storefront';

interface TaxonomyContextType {
  collections: TaxonomyItem[];
  scentFamilies: TaxonomyItem[];
  occasions: TaxonomyItem[];
  loading: boolean;
}

const empty = (): TaxonomyContextType => ({
  collections: resolveTaxonomy('collections', []),
  scentFamilies: resolveTaxonomy('scentFamilies', []),
  occasions: resolveTaxonomy('occasions', []),
  loading: true
});

const TaxonomyContext = createContext<TaxonomyContextType>(empty());

export const TaxonomyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docs, setDocs] = useState<Record<TaxonomyKind, TaxonomyDoc[]>>({ collections: [], scentFamilies: [], occasions: [] });
  const [loaded, setLoaded] = useState<Set<TaxonomyKind>>(new Set());

  useEffect(() => {
    const kinds: TaxonomyKind[] = ['collections', 'scentFamilies', 'occasions'];
    const unsubs = kinds.map((kind) =>
      onSnapshot(
        collection(db, kind),
        (snap) => {
          setDocs((d) => ({ ...d, [kind]: snap.docs.map((x) => ({ ...(x.data() as TaxonomyDoc), slug: x.id })) }));
          setLoaded((s) => new Set(s).add(kind));
        },
        (err) => {
          console.warn(`Could not load ${kind}; using built-in names:`, err);
          setLoaded((s) => new Set(s).add(kind));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = useMemo<TaxonomyContextType>(
    () => ({
      collections: resolveTaxonomy('collections', docs.collections),
      scentFamilies: resolveTaxonomy('scentFamilies', docs.scentFamilies),
      occasions: resolveTaxonomy('occasions', docs.occasions),
      loading: loaded.size < 3
    }),
    [docs, loaded]
  );
  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
};

export function useTaxonomy(): TaxonomyContextType {
  return useContext(TaxonomyContext);
}
