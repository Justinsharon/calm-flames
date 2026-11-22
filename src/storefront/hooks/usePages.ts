/**
 * Published site content from Firestore `pages`. Only `published == true` docs are readable by
 * visitors (firestore.rules), so queries always filter on it.
 */
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { pageFromDoc, sortJournal, type PageType, type SitePage } from '../../lib/pages';

export function usePublishedPages(type: PageType): { pages: SitePage[]; loading: boolean } {
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'pages'), where('published', '==', true), where('type', '==', type));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => pageFromDoc(d.id, d.data())).filter((p): p is SitePage => Boolean(p && p.published));
        setPages(type === 'journal' ? sortJournal(list) : list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setLoading(false);
      },
      () => {
        setPages([]);
        setLoading(false);
      }
    );
  }, [type]);
  return { pages, loading };
}

/** One published page by slug (null when missing or unpublished). */
export function usePage(slug: string | undefined): { page: SitePage | null; loading: boolean } {
  const [page, setPage] = useState<SitePage | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!slug) {
      setPage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, 'pages', slug),
      (snap) => {
        const p = snap.exists() ? pageFromDoc(snap.id, snap.data()) : null;
        setPage(p && p.published ? p : null);
        setLoading(false);
      },
      () => {
        // unpublished docs are not readable by visitors: treat as missing
        setPage(null);
        setLoading(false);
      }
    );
  }, [slug]);
  return { page, loading };
}
