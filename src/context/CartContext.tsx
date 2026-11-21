import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem } from '../types';
import { auth, db } from '../lib/firebase';
import { doc, getDocs, collection, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  discount: number;
  appliedCoupon: string | null;
  applyCouponCode: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;
  freeShippingThreshold: number;
  amountNeededForFreeShipping: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  validateCartWithServer: () => Promise<{ valid: boolean; error?: string; verifiedTotal?: number }>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'the_calm_flame_cart';
const FREE_SHIPPING_THRESHOLD = 1500;
const STANDARD_SHIPPING_FEE = 99;

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number>(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.warn('Failed to save cart to localStorage', e);
    }
  }, [cart]);

  // Sync with Firestore customer subcollection when auth user changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userCartRef = collection(db, 'customers', user.uid, 'cart');
          const snap = await getDocs(userCartRef);

          if (!snap.empty) {
            const serverItems: CartItem[] = [];
            snap.forEach((d) => {
              const data = d.data();
              if (data.product && data.quantity) {
                serverItems.push({ product: data.product, quantity: data.quantity });
              }
            });

            // Merge local and server items
            setCart((prevLocal) => {
              const merged = [...serverItems];
              for (const locItem of prevLocal) {
                const existing = merged.find((m) => m.product.id === locItem.product.id);
                if (!existing) {
                  merged.push(locItem);
                  // Also write back to userCart
                  setDoc(doc(db, 'customers', user.uid, 'cart', locItem.product.id), {
                    product: locItem.product,
                    quantity: locItem.quantity,
                    updatedAt: new Date().toISOString()
                  }).catch(() => {});
                }
              }
              return merged;
            });
          } else if (cart.length > 0) {
            // Upload current local cart to Firestore
            const batch = writeBatch(db);
            for (const item of cart) {
              const itemRef = doc(db, 'customers', user.uid, 'cart', item.product.id);
              batch.set(itemRef, {
                product: item.product,
                quantity: item.quantity,
                updatedAt: new Date().toISOString()
              });
            }
            batch.commit().catch(() => {});
          }
        } catch (e) {
          console.warn('Could not sync customer cart with Firestore:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const addToCart = (product: Product, quantity: number = 1) => {
    // Strict safety check: Never permit unverified prices or inactive products to enter the cart
    if (
      !product ||
      product.priceStatus === 'missing' ||
      typeof product.price !== 'number' ||
      !Number.isFinite(product.price) ||
      product.price <= 0 ||
      (product as any).isActive === false ||
      (product as any).isHistorical
    ) {
      console.warn(`Product ${product?.name} cannot be added to bag: unverified price or not in active catalogue.`);
      return;
    }

    const safeQty = Math.max(1, Math.min(100, Math.floor(quantity)));

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      let updated: CartItem[];
      if (existing) {
        updated = prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: Math.min(100, item.quantity + safeQty) } : item
        );
      } else {
        updated = [...prev, { product, quantity: safeQty }];
      }

      // Sync to Firestore if user logged in
      if (auth.currentUser) {
        const itemToSave = updated.find((i) => i.product.id === product.id);
        if (itemToSave) {
          setDoc(doc(db, 'customers', auth.currentUser.uid, 'cart', product.id), {
            product: itemToSave.product,
            quantity: itemToSave.quantity,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
      }

      return updated;
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    if (auth.currentUser) {
      deleteDoc(doc(db, 'customers', auth.currentUser.uid, 'cart', productId)).catch(() => {});
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) => {
      const updated = prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item));
      if (auth.currentUser) {
        const item = updated.find((i) => i.product.id === productId);
        if (item) {
          setDoc(doc(db, 'customers', auth.currentUser.uid, 'cart', productId), {
            product: item.product,
            quantity: item.quantity,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
      }
      return updated;
    });
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
    setDiscount(0);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_FEE;
  const totalAmount = Math.max(0, subtotal - discount + shippingFee);
  const amountNeededForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const applyCouponCode = async (code: string): Promise<{ success: boolean; message: string }> => {
    const codeClean = code.trim().toUpperCase();
    if (!codeClean) return { success: false, message: 'Please enter a coupon code.' };

    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          couponCode: codeClean
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.discount > 0) {
          setAppliedCoupon(codeClean);
          setDiscount(data.discount);
          return { success: true, message: `Coupon ${codeClean} applied! Saved ₹${data.discount}.` };
        } else {
          return { success: false, message: 'Coupon code not applicable or minimum order not reached.' };
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        return { success: false, message: errData.error || 'Invalid coupon code.' };
      }
    } catch {
      // Offline fallback
      if (codeClean === 'CALM10' && subtotal >= 500) {
        const disc = Math.round(subtotal * 0.1);
        setAppliedCoupon('CALM10');
        setDiscount(disc);
        return { success: true, message: `Coupon CALM10 applied! Saved ₹${disc}.` };
      }
      return { success: false, message: 'Invalid coupon code.' };
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setDiscount(0);
  };

  const validateCartWithServer = async (): Promise<{ valid: boolean; error?: string; verifiedTotal?: number }> => {
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          couponCode: appliedCoupon
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { valid: false, error: errData.error || 'Cart validation failed.' };
      }

      const verifiedData = await res.json();
      return { valid: true, verifiedTotal: verifiedData.total };
    } catch (e: any) {
      console.warn('Backend validate fallback:', e);
      return { valid: true, verifiedTotal: totalAmount };
    }
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
        shippingFee,
        totalAmount,
        discount,
        appliedCoupon,
        applyCouponCode,
        removeCoupon,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        amountNeededForFreeShipping,
        isCartOpen,
        setIsCartOpen,
        isCheckoutOpen,
        setIsCheckoutOpen,
        validateCartWithServer
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
