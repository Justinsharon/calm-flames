import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalog } from './CatalogContext';
import { hasVerifiedPrice } from '../lib/productMapping';
import type { Product } from '../types';
import { type CartLineInput, type BoxLineInput, lineKey, MAX_BOX_QTY, MAX_LINE_QTY } from '../lib/cartLines';
import { auth, db } from '../lib/firebase';
import { doc, getDocs, collection, setDoc, deleteDoc } from 'firebase/firestore';

/**
 * The cart holds product lines and gift-box lines (one line = one box with its candles).
 * Only ids and quantities are stored; what is shown comes from the LIVE catalogue, and every
 * money figure comes from the server quote (/api/cart/quote). Nothing is priced here.
 */
export type CartLine =
  | { key: string; kind: 'product'; input: CartLineInput; product: Product; quantity: number }
  | { key: string; kind: 'box'; input: BoxLineInput; products: Product[]; quantity: number };

/** Server quote (see src/server/quote.ts). */
export interface CartQuote {
  items: { kind: 'product' | 'box'; totalPrice: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  couponCode: string;
  couponMessage?: string;
  shipping: number;
  codFee: number;
  total: number;
  amountToFreeShipping: number;
  freeShippingThreshold: number;
  cod: { available: boolean; fee?: number; maxOrder?: number; reason?: string };
  checkoutEnabled: boolean;
}

interface CartContextType {
  lines: CartLine[];
  /** Lines as sent to the server. */
  inputs: CartLineInput[];
  addToCart: (product: Product, quantity?: number) => boolean;
  addBox: (box: Omit<BoxLineInput, 'kind' | 'quantity'>, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  totalItems: number;
  giftMessage: string;
  setGiftMessage: (m: string) => void;
  couponCode: string;
  setCouponCode: (c: string) => void;
  quote: CartQuote | null;
  quoteError: string | null;
  quoting: boolean;
  /** Re-quote now (optionally for a payment method, which changes COD fee). */
  requote: (paymentMethod?: 'razorpay' | 'cod') => Promise<CartQuote | null>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_STORAGE_KEY = 'the_calm_flame_cart_v2';
const LEGACY_STORAGE_KEY = 'the_calm_flame_cart';
const GIFT_KEY = 'the_calm_flame_gift_message';

function readStored(): CartLineInput[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      return sanitize(Array.isArray(old) ? old.map((i: any) => ({ productId: i?.product?.id, quantity: i?.quantity })) : []);
    }
  } catch {
    /* unavailable storage */
  }
  return [];
}

/** Keep only well-formed lines (storage can hold anything). */
export function sanitize(raw: unknown): CartLineInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLineInput[] = [];
  for (const l of raw as any[]) {
    if (l?.kind === 'box') {
      if (Number.isInteger(l.boxSize) && Array.isArray(l.productIds) && l.productIds.every((x: unknown) => typeof x === 'string') && Number.isInteger(l.quantity) && l.quantity > 0) {
        out.push({ kind: 'box', boxSize: l.boxSize, productIds: l.productIds, ribbon: typeof l.ribbon === 'string' ? l.ribbon : undefined, addOns: Array.isArray(l.addOns) ? l.addOns.filter((a: unknown) => typeof a === 'string') : [], message: typeof l.message === 'string' ? l.message : undefined, quantity: Math.min(MAX_BOX_QTY, l.quantity) });
      }
    } else if (typeof l?.productId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0) {
      out.push({ productId: l.productId, quantity: Math.min(MAX_LINE_QTY, l.quantity) });
    }
  }
  return out;
}

/** Short stable id for a Firestore cart doc. */
function docIdFor(l: CartLineInput): string {
  if (l.kind !== 'box') return l.productId;
  let h = 5381;
  for (const ch of lineKey(l)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `box_${h.toString(36)}`;
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inputs, setInputs] = useState<CartLineInput[]>(readStored);
  const [giftMessage, setGiftMessageState] = useState<string>(() => {
    try {
      return localStorage.getItem(GIFT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [couponCode, setCouponCode] = useState('');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const { getProductById, loading: catalogLoading, error: catalogError } = useCatalog();

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(inputs));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [inputs]);

  const setGiftMessage = (m: string) => {
    setGiftMessageState(m);
    try {
      localStorage.setItem(GIFT_KEY, m);
    } catch {
      /* ignore */
    }
  };

  // Signed-in customers: merge the saved cart once, then mirror changes (best effort).
  const syncedUid = useRef<string | null>(null);
  useEffect(() => {
    return auth.onAuthStateChanged(async (user) => {
      syncedUid.current = null;
      if (!user) return;
      try {
        const snap = await getDocs(collection(db, 'customers', user.uid, 'cart'));
        const saved = sanitize(
          snap.docs.map((d) => {
            const x = d.data() as any;
            return x.line ?? (x.product?.id ? { productId: x.product.id, quantity: x.quantity } : null);
          })
        );
        setInputs((local) => {
          const merged = [...saved];
          for (const l of local) if (!merged.some((m) => lineKey(m) === lineKey(l))) merged.push(l);
          for (const l of merged) setDoc(doc(db, 'customers', user.uid, 'cart', docIdFor(l)), { line: l, updatedAt: new Date().toISOString() }).catch(() => {});
          return merged;
        });
        syncedUid.current = user.uid;
      } catch (e) {
        console.warn('Could not sync the saved cart:', e);
      }
    });
  }, []);
  const mirror = (l: CartLineInput, removed = false) => {
    const uid = syncedUid.current;
    if (!uid) return;
    const ref = doc(db, 'customers', uid, 'cart', docIdFor(l));
    (removed ? deleteDoc(ref) : setDoc(ref, { line: l, updatedAt: new Date().toISOString() })).catch(() => {});
  };

  // Live view of the stored lines; lines whose products are gone or unpriced are not shown.
  const lines = useMemo<CartLine[]>(() => {
    if (catalogLoading || catalogError) return [];
    const out: CartLine[] = [];
    for (const l of inputs) {
      if (l.kind === 'box') {
        const products = l.productIds.map((id) => getProductById(id));
        if (products.every((p): p is Product => Boolean(p) && hasVerifiedPrice(p!))) out.push({ key: lineKey(l), kind: 'box', input: l, products, quantity: l.quantity });
      } else {
        const p = getProductById(l.productId);
        if (p && hasVerifiedPrice(p)) out.push({ key: lineKey(l), kind: 'product', input: l, product: p, quantity: l.quantity });
      }
    }
    return out;
  }, [inputs, catalogLoading, catalogError, getProductById]);
  const liveInputs = useMemo(() => lines.map((l) => l.input), [lines]);

  const addToCart = (product: Product, quantity = 1): boolean => {
    if (!product || !hasVerifiedPrice(product) || product.isActive === false || product.isHistorical) return false;
    const n = Math.max(1, Math.min(MAX_LINE_QTY, Math.floor(quantity)));
    setInputs((prev) => {
      const i = prev.findIndex((l) => l.kind !== 'box' && l.productId === product.id);
      const next = [...prev];
      if (i >= 0) next[i] = { ...next[i], quantity: Math.min(MAX_LINE_QTY, next[i].quantity + n) };
      else next.push({ productId: product.id, quantity: n });
      mirror(next[i >= 0 ? i : next.length - 1]);
      return next;
    });
    return true;
  };

  const addBox = (box: Omit<BoxLineInput, 'kind' | 'quantity'>, quantity = 1) => {
    const line: BoxLineInput = { kind: 'box', ...box, message: box.message?.trim() || undefined, quantity: Math.max(1, Math.min(MAX_BOX_QTY, quantity)) };
    setInputs((prev) => {
      const i = prev.findIndex((l) => lineKey(l) === lineKey(line));
      const next = [...prev];
      if (i >= 0) next[i] = { ...next[i], quantity: Math.min(MAX_BOX_QTY, next[i].quantity + line.quantity) };
      else next.push(line);
      mirror(next[i >= 0 ? i : next.length - 1]);
      return next;
    });
  };

  const removeLine = (key: string) =>
    setInputs((prev) => {
      const l = prev.find((x) => lineKey(x) === key);
      if (l) mirror(l, true);
      return prev.filter((x) => lineKey(x) !== key);
    });

  const setQuantity = (key: string, quantity: number) => {
    if (quantity <= 0) return removeLine(key);
    setInputs((prev) =>
      prev.map((l) => {
        if (lineKey(l) !== key) return l;
        const next = { ...l, quantity: Math.min(l.kind === 'box' ? MAX_BOX_QTY : MAX_LINE_QTY, Math.floor(quantity)) };
        mirror(next);
        return next;
      })
    );
  };

  const clearCart = () => {
    for (const l of inputs) mirror(l, true);
    setInputs([]);
    setCouponCode('');
    setGiftMessage('');
  };

  const requote = useCallback(
    async (paymentMethod?: 'razorpay' | 'cod'): Promise<CartQuote | null> => {
      if (liveInputs.length === 0) {
        setQuote(null);
        setQuoteError(null);
        return null;
      }
      setQuoting(true);
      try {
        const res = await fetch('/api/cart/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: liveInputs, couponCode: couponCode || undefined, paymentMethod })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setQuote(null);
          setQuoteError(data.error || 'We could not price your cart right now.');
          return null;
        }
        setQuote(data);
        setQuoteError(null);
        return data;
      } catch {
        setQuote(null);
        setQuoteError('We could not reach the shop to price your cart. Please try again.');
        return null;
      } finally {
        setQuoting(false);
      }
    },
    [liveInputs, couponCode]
  );

  // Re-quote whenever the lines or the coupon change (small debounce for the qty stepper).
  useEffect(() => {
    const t = setTimeout(() => void requote(), 250);
    return () => clearTimeout(t);
  }, [requote]);

  const totalItems = lines.reduce((s, l) => s + (l.kind === 'box' ? l.quantity : l.quantity), 0);

  return (
    <CartContext.Provider
      value={{
        lines,
        inputs: liveInputs,
        addToCart,
        addBox,
        setQuantity,
        removeLine,
        clearCart,
        totalItems,
        giftMessage,
        setGiftMessage,
        couponCode,
        setCouponCode,
        quote,
        quoteError,
        quoting,
        requote
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};
