import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, Sparkles, ShieldCheck, Tag } from 'lucide-react';
import { useCart } from '../../context/CartContext';

interface CartDrawerProps {
  onExplore: () => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  onExplore,
  onProceedToCheckout
}) => {
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    subtotal,
    shippingFee,
    totalAmount,
    discount,
    appliedCoupon,
    applyCouponCode,
    removeCoupon,
    freeShippingThreshold,
    amountNeededForFreeShipping,
    shippingConfigured
  } = useCart();

  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  if (!isCartOpen) return null;

  const freeShippingProgress = freeShippingThreshold
    ? Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))
    : 0;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsApplyingCoupon(true);
    setCouponFeedback(null);
    const result = await applyCouponCode(couponInput);
    setIsApplyingCoupon(false);
    setCouponFeedback(result.message);
    if (result.success) {
      setCouponInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#FAF7F2] border-l border-[#E5DCCE] shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/60">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#D18D4D]" />
              <h3 className="text-base font-serif font-bold text-[#1F1B18] tracking-tight">
                Your Mindful Bag ({cart.reduce((s, i) => s + i.quantity, 0)})
              </h3>
            </div>
            <button
              onClick={() => setIsCartOpen(false)}
              className="p-1 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Mindful Shipping Progress Indicator (hidden until shipping is configured) */}
          {shippingConfigured && (
          <div className="px-6 py-3 bg-[#F2ECE1]/40 border-b border-[#E5DCCE] text-xs">
            {amountNeededForFreeShipping > 0 ? (
              <p className="text-[#65412E] mb-1.5 font-medium">
                Add <span className="font-bold text-[#1F1B18]">₹{amountNeededForFreeShipping}</span> more for Free Shipping
              </p>
            ) : (
              <p className="text-emerald-800 font-semibold mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                You've unlocked Free Mindful Shipping!
              </p>
            )}
            <div className="w-full bg-[#E5DCCE] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#D18D4D] h-full rounded-full transition-all duration-500"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
          )}

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-[#E5DCCE]/70">
            {cart.length > 0 ? (
              cart.map((item) => (
                <div key={item.product.id} className="py-4 flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#F2ECE1] border border-[#E5DCCE] shrink-0">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-serif font-bold text-[#1F1B18] truncate">
                        {item.product.name}
                      </h4>
                      <span className="text-xs font-semibold text-[#1F1B18] font-sans">
                        ₹{item.product.price * item.quantity}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#79716B]">
                      {item.product.weight} · {item.product.scentFamily}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      {/* Quantity Stepper */}
                      <div className="flex items-center border border-[#DBC4A9] rounded-lg bg-[#FAF7F2] p-0.5">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#4A2F22] hover:bg-[#F2ECE1] rounded text-xs font-bold"
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-xs font-medium text-[#1F1B18] font-sans">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#4A2F22] hover:bg-[#F2ECE1] rounded text-xs font-bold"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      {/* Remove item */}
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              /* Empty Cart Experience */
              <div className="py-16 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#F2ECE1] border border-[#DBC4A9] flex items-center justify-center text-[#9E6D47]">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-serif text-[#1F1B18]">
                    Your cart is empty
                  </h4>
                  <p className="text-xs text-[#79716B] max-w-xs mx-auto">
                    Add some candles to get started.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    onExplore();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full transition-colors"
                >
                  <span>Continue Shopping</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Coupon Code Section */}
          {cart.length > 0 && (
            <div className="px-6 py-3 border-t border-[#E5DCCE] bg-[#FAF7F2] space-y-2">
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Coupon <strong>{appliedCoupon}</strong> (-₹{discount})</span>
                  </div>
                  <button
                    onClick={removeCoupon}
                    className="text-stone-400 hover:text-rose-600 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Coupon Code (e.g. CALM10)"
                      className="flex-1 px-3 py-1.5 text-xs border border-[#DBC4A9] rounded-lg bg-white uppercase placeholder:normal-case focus:outline-none focus:border-[#D18D4D]"
                    />
                    <button
                      type="submit"
                      disabled={isApplyingCoupon}
                      className="px-3.5 py-1.5 bg-[#2A2521] text-white text-xs font-medium rounded-lg hover:bg-[#4A2F22] disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                  {couponFeedback && (
                    <p className="text-[11px] text-[#9E6D47]">{couponFeedback}</p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Footer Subtotal & Checkout Call to Action */}
          {cart.length > 0 && (
            <div className="p-6 border-t border-[#E5DCCE] bg-[#F2ECE1]/40 space-y-3">
              <div className="space-y-1.5 text-xs text-[#65412E]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#1F1B18] font-sans">₹{subtotal}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span>Coupon Discount</span>
                    <span className="font-semibold font-sans">-₹{discount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Mindful Shipping</span>
                  <span className="font-semibold text-[#1F1B18] font-sans">
                    {!shippingConfigured ? 'To be confirmed' : shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#1F1B18] pt-2 border-t border-[#E5DCCE]">
                  <span>Total</span>
                  <span className="font-sans">₹{totalAmount}</span>
                </div>
              </div>

              {cart.some((i) => i.product.priceStatus === 'missing' || !i.product.price || i.product.price <= 0) ? (
                <div className="space-y-2">
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    One or more items in your bag do not have a verified retail price and cannot be purchased online. Please remove them to proceed.
                  </div>
                  <button
                    disabled
                    className="w-full py-3.5 px-4 bg-stone-300 text-stone-500 text-xs font-medium uppercase tracking-wider rounded-xl cursor-not-allowed"
                  >
                    <span>Checkout Unavailable</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    onProceedToCheckout();
                  }}
                  className="w-full py-3.5 px-4 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-medium uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
                >
                  <span>Continue to checkout</span>
                  <ArrowRight className="w-4 h-4 text-[#D18D4D]" />
                </button>
              )}

              <div className="flex items-center justify-center gap-2 text-[10px] text-[#79716B] pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#9E6D47]" />
                <span>Protected by Razorpay & 100% Mindful Safe Delivery</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
