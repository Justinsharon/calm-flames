import { useEffect, useRef, useState } from 'react';
import { pageTitle, metaDescription } from '../../lib/routes';

/** True when the visitor asked the OS for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Pointer position over an element, normalised to -1..1, for parallax/tilt. Uses
 * requestAnimationFrame and only produces transforms. Off for reduced motion and touch screens.
 */
export function usePointerParallax<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || (window.matchMedia && window.matchMedia('(hover: none)').matches)) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1;
        const y = ((e.clientY - r.top) / Math.max(r.height, 1)) * 2 - 1;
        setPos((p) => (Math.abs(p.x - x) > 0.04 || Math.abs(p.y - y) > 0.04 ? { x, y } : p));
      });
    };
    const onLeave = () => setPos({ x: 0, y: 0 });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);
  return { ref, pos, active: !reduced };
}

/** Per-page <title> and meta description (the server also sets them for first load). */
export function useDocumentMeta(title?: string, description?: string | null) {
  useEffect(() => {
    document.title = pageTitle(title);
    const d = metaDescription(description);
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', d);
  }, [title, description]);
}
