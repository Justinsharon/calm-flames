import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Check, ArrowRight, ShoppingBag, CreditCard, Truck, AlertCircle, Sparkles, Flame } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { CustomerDetails, OrderRecord } from '../../types';
import { initializeRazorpayPayment, generateOrderId, OrderStorage } from '../../services/paymentService';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import confetti from 'canvas-confetti';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess: (order: OrderRecord) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderSuccess
}) => {
  const { cart, subtotal, shippingFee, totalAmount, discount, appliedCoupon, clearCart, validateCartWithServer } = useCart();
  const { user, profile } = useAuth();

  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: profile?.fullName || '',
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    addressLine1: profile?.savedAddress?.addressLine1 || '',
    addressLine2: profile?.savedAddress?.addressLine2 || '',
    city: profile?.savedAddress?.city || '',
    state: profile?.savedAddress?.state || '',
    pincode: profile?.savedAddress?.pincode || '',
    notes: ''
  });

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);
  const [checkoutAttemptKey, setCheckoutAttemptKey] = useState<string>(() => {
    return 'chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  });

  useEffect(() => {
    if (isOpen && !completedOrder) {
      setCheckoutAttemptKey('chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10));
    }
  }, [isOpen]);

  useEffect(() => {
    if (profile) {
      setCustomer((prev) => ({
        ...prev,
        fullName: prev.fullName || profile.fullName || '',
        email: prev.email || profile.email || user?.email || '',
        phone: prev.phone || profile.phone || '',
        addressLine1: prev.addressLine1 || profile.savedAddress?.addressLine1 || '',
        city: prev.city || profile.savedAddress?.city || '',
        state: prev.state || profile.savedAddress?.state || '',
        pincode: prev.pincode || profile.savedAddress?.pincode || ''
      }));
    }
  }, [profile, user]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomer({
      ...customer,
      [e.target.name]: e.target.value
    });
    setErrorMessage(null);
  };

  const validateForm = () => {
    if (!customer.fullName.trim()) return 'Please enter your full name.';
    if (!customer.email.trim() || !customer.email.includes('@')) return 'Please provide a valid email address.';
    if (!customer.phone.trim() || customer.phone.length < 10) return 'Please provide a valid 10-digit mobile number.';
    if (!customer.addressLine1.trim()) return 'Please enter your delivery street address.';
    if (!customer.city.trim()) return 'Please enter your city.';
    if (!customer.state.trim()) return 'Please select or enter your state.';
    if (!customer.pincode.trim() || customer.pincode.length < 6) return 'Please enter a valid 6-digit postal PIN code.';
    return null;
  };

  const persistOrderToFirestore = async (order: OrderRecord) => {
    try {
      // Write to root orders collection
      const orderRef = doc(db, 'orders', order.orderId);
      await setDoc(orderRef, {
        id: order.orderId,
        orderNumber: order.orderId,
        customerId: user?.uid || 'guest_' + order.orderId,
        items: order.items.map((i) => ({
          productId: i.product.id,
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.price,
          totalPrice: i.product.price * i.quantity
        })),
        subtotal: order.subtotal,
        discount: order.discount,
        shipping: order.shipping,
        tax: 0,
        total: order.total,
        currency: 'INR',
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: 'Order received · Preparing batch',
        shippingAddress: { ...order.customer },
        paymentMethod: order.paymentMethod,
        razorpayPaymentId: order.paymentId || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not persist order to Firestore (local fallback saved):', e);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateForm();
    if (error) {
      setErrorMessage(error);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // Guard against unverified prices or unavailable items
    const invalidItems = cart.filter(
      (i) =>
        i.product.priceStatus === 'missing' ||
        typeof i.product.price !== 'number' ||
        i.product.price <= 0 ||
        (i.product as any).isActive === false ||
        (i.product as any).isHistorical
    );
    if (invalidItems.length > 0) {
      setIsProcessing(false);
      setErrorMessage(
        `${invalidItems.map((i) => i.product.name).join(', ')} is currently unavailable for purchase. Please remove it from your bag to proceed.`
      );
      return;
    }

    // 1. Authoritative Server-Side Cart & Price Validation
    const validation = await validateCartWithServer();
    if (!validation.valid) {
      setIsProcessing(false);
      setErrorMessage(validation.error || 'Cart verification failed with server.');
      return;
    }

    // 2. Authoritative Server Order Creation (Strict: No synthetic orders or client fallback)
    let serverOrderData: any = null;
    try {
      const orderCreateRes = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': checkoutAttemptKey
        },
        body: JSON.stringify({
          idempotencyKey: checkoutAttemptKey,
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          customer,
          paymentMethod,
          couponCode: appliedCoupon
        })
      });
      if (!orderCreateRes.ok) {
        const orderErr = await orderCreateRes.json().catch(() => ({}));
        setIsProcessing(false);
        setErrorMessage(orderErr.error || 'Could not create order with server.');
        return;
      }
      serverOrderData = await orderCreateRes.json();
    } catch (netErr: any) {
      setIsProcessing(false);
      setErrorMessage('Unable to reach server to create order. Please try again later.');
      return;
    }

    if (!serverOrderData || !serverOrderData.orderNumber) {
      setIsProcessing(false);
      setErrorMessage('Server did not return a valid order number.');
      return;
    }

    const verifiedTotal = serverOrderData.amount;
    const newOrderId = serverOrderData.orderNumber;

    if (paymentMethod === 'cod') {
      const order: OrderRecord = {
        orderId: newOrderId,
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }),
        items: [...cart],
        subtotal,
        discount,
        shipping: shippingFee,
        total: verifiedTotal,
        paymentMethod: 'cod',
        customer: { ...customer },
        status: 'CONFIRMED' as any,
        paymentStatus: 'PENDING' as any
      };

      OrderStorage.saveOrder(order);
      await persistOrderToFirestore(order);

      setCompletedOrder(order);
      clearCart();
      setIsProcessing(false);
      onOrderSuccess(order);

      try {
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      } catch {}
      return;
    }

    // 2. Razorpay Payment Initialization
    try {
      if (!serverOrderData.razorpayOrderId) {
        setIsProcessing(false);
        setErrorMessage('Razorpay order creation was not completed by the server.');
        return;
      }

      await initializeRazorpayPayment({
        amount: verifiedTotal,
        customer,
        items: cart,
        razorpayOrderId: serverOrderData.razorpayOrderId,
        onSuccess: async (paymentId, gatewayOrderId, signature) => {
          // Server-side verification
          let isVerified = false;
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: gatewayOrderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature || '',
                order_number: newOrderId,
                expected_amount: verifiedTotal
              })
            });
            if (verifyRes.ok) {
              const vData = await verifyRes.json();
              isVerified = vData.verified === true;
            }
          } catch {}

          const order: OrderRecord = {
            orderId: newOrderId,
            date: new Date().toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            }),
            items: [...cart],
            subtotal,
            discount,
            shipping: shippingFee,
            total: verifiedTotal,
            paymentMethod: 'razorpay',
            paymentId,
            customer: { ...customer },
            status: 'PROCESSING' as any,
            paymentStatus: isVerified ? ('PAID' as any) : ('PENDING' as any)
          };

          OrderStorage.saveOrder(order);
          await persistOrderToFirestore(order);

          setCompletedOrder(order);
          clearCart();
          setIsProcessing(false);
          onOrderSuccess(order);

          try {
            confetti({ particleCount: 60, spread: 80, origin: { y: 0.6 } });
          } catch {}
        },
        onFailure: (errDescription) => {
          setIsProcessing(false);
          setErrorMessage(errDescription || 'Payment was cancelled or could not be completed.');
        }
      });
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Payment service error. You can choose Cash on Delivery.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-base font-serif font-bold text-[#1F1B18] tracking-tight">
              {completedOrder ? 'Order Confirmed' : 'Mindful Checkout'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
          {completedOrder ? (
            /* Order Success View */
            <div className="text-center py-6 space-y-5 animate-in fade-in">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Check className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
                  Thank You, {completedOrder.customer.fullName}
                </span>
                <h4 className="text-2xl sm:text-3xl font-serif text-[#1F1B18]">
                  Your calm is on its way.
                </h4>
                <p className="text-xs sm:text-sm text-[#79716B]">
                  Order Ref: <strong className="text-[#1F1B18]">{completedOrder.orderId}</strong> · Receipt sent to {completedOrder.customer.email}
                </p>
              </div>

              {/* Order Receipt Box */}
              <div className="bg-[#F2ECE1]/70 border border-[#E5DCCE] rounded-2xl p-5 text-left text-xs space-y-3">
                <div className="flex justify-between font-medium text-[#1F1B18] border-b border-[#E5DCCE] pb-2">
                  <span>Shipping To:</span>
                  <span>{completedOrder.customer.city}, {completedOrder.customer.pincode}</span>
                </div>

                <div className="divide-y divide-[#E5DCCE]/50">
                  {completedOrder.items.map((item, idx) => (
                    <div key={idx} className="py-2 flex justify-between text-[#65412E]">
                      <span>{item.quantity} × {item.product.name}</span>
                      <span className="font-semibold font-sans">₹{item.product.price * item.quantity}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#E5DCCE] flex justify-between font-bold text-sm text-[#1F1B18]">
                  <span>Total ({completedOrder.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Razorpay Verified'})</span>
                  <span className="font-sans">₹{completedOrder.total}</span>
                </div>
              </div>

              {/* Phase 3: Section 28 - Before It Arrives Ritual */}
              <div className="bg-white border border-[#DBC4A9] rounded-2xl p-5 text-left space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D18D4D]" />
                  <h5 className="font-serif font-bold text-sm text-[#1F1B18]">
                    Before It Arrives · A 5-Minute Ritual For Tonight
                  </h5>
                </div>
                <p className="text-xs text-[#79716B] leading-relaxed">
                  While our makers pour and prepare your flame, begin preparing your evening space:
                </p>
                <ol className="space-y-1.5 text-xs text-[#65412E] list-decimal pl-4">
                  <li>Dim overhead lights thirty minutes before sleep.</li>
                  <li>Put your phone in another room or face-down.</li>
                  <li>Take four slow counts in through your nose, pause for two, and exhale for six.</li>
                  <li>Pour a cup of warm water or herbal tea and sit quietly for five minutes.</li>
                </ol>
                <div className="pt-2 border-t border-[#E5DCCE] text-[11px] text-[#9E6D47] italic">
                  Centering Mantra: "I allow my sanctuary to begin before my flame even arrives."
                </div>
              </div>

              {/* First Burn Care Card */}
              <div className="bg-[#FAF7F2] border border-[#E5DCCE] rounded-2xl p-4 text-left text-xs text-[#65412E] space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#1F1B18]">
                  <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                  <span>First Burn Guidance</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  When your amber jar arrives, let the candle burn for 2–3 full hours until the melted wax touches all jar edges. This sets the candle's "memory" and prevents tunneling.
                </p>
              </div>

              <p className="text-xs text-[#79716B] max-w-md mx-auto">
                Hand-poured fresh and packed in plastic-free recyclable materials. Tracking updates will be shared via email and SMS.
              </p>

              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 px-6 py-3 text-xs font-medium uppercase tracking-wider text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full transition-all"
              >
                <span>Return to The Calm Flame</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Checkout Form */
            <form onSubmit={handleSubmitOrder} className="space-y-6">
              {/* Order Summary Snapshot */}
              <div className="p-4 bg-[#F2ECE1]/50 border border-[#E5DCCE] rounded-2xl flex items-center justify-between text-xs text-[#65412E]">
                <div>
                  <span className="font-semibold text-[#1F1B18]">Verified Total ({cart.reduce((s, i) => s + i.quantity, 0)} items):</span>
                  <span className="ml-2 font-bold text-sm text-[#1F1B18] font-sans">₹{totalAmount}</span>
                </div>
                <span className="text-[11px] text-[#9E6D47]">
                  {shippingFee === 0 ? 'Free Shipping Included' : '+ ₹99 Shipping'}
                  {discount > 0 && ` · Saved ₹${discount}`}
                </span>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Customer Details Fields */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                  1. Delivery Details
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="fullName"
                      value={customer.fullName}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g. Justin Sharon"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={customer.email}
                      onChange={handleInputChange}
                      required
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#79716B] mb-1">Phone Number (for delivery coordination) *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={customer.phone}
                    onChange={handleInputChange}
                    required
                    placeholder="10-digit mobile number"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#79716B] mb-1">Street Address *</label>
                  <input
                    type="text"
                    name="addressLine1"
                    value={customer.addressLine1}
                    onChange={handleInputChange}
                    required
                    placeholder="House/Flat No., Building, Street Name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">City *</label>
                    <input
                      type="text"
                      name="city"
                      value={customer.city}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g. Mumbai"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">State *</label>
                    <input
                      type="text"
                      name="state"
                      value={customer.state}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g. Maharashtra"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">PIN Code *</label>
                    <input
                      type="text"
                      name="pincode"
                      value={customer.pincode}
                      onChange={handleInputChange}
                      required
                      maxLength={6}
                      placeholder="6 digits"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] text-xs text-[#1F1B18]"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Choice */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                  2. Payment Method
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                      paymentMethod === 'razorpay'
                        ? 'border-[#D18D4D] bg-[#F2ECE1] ring-1 ring-[#D18D4D]'
                        : 'border-[#E5DCCE] bg-[#FAF7F2] hover:bg-[#F2ECE1]/50'
                    }`}
                  >
                    <CreditCard className={`w-5 h-5 mt-0.5 ${paymentMethod === 'razorpay' ? 'text-[#D18D4D]' : 'text-stone-400'}`} />
                    <div>
                      <p className="text-xs font-semibold text-[#1F1B18]">
                        Online via Razorpay
                      </p>
                      <p className="text-[11px] text-[#79716B] mt-0.5">
                        UPI (GPay, PhonePe), Cards & NetBanking
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                      paymentMethod === 'cod'
                        ? 'border-[#D18D4D] bg-[#F2ECE1] ring-1 ring-[#D18D4D]'
                        : 'border-[#E5DCCE] bg-[#FAF7F2] hover:bg-[#F2ECE1]/50'
                    }`}
                  >
                    <Truck className={`w-5 h-5 mt-0.5 ${paymentMethod === 'cod' ? 'text-[#D18D4D]' : 'text-stone-400'}`} />
                    <div>
                      <p className="text-xs font-semibold text-[#1F1B18]">
                        Cash on Delivery (COD)
                      </p>
                      <p className="text-[11px] text-[#79716B] mt-0.5">
                        Pay upon doorstep delivery
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-4 border-t border-[#E5DCCE] space-y-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-4 px-6 bg-[#2A2521] hover:bg-[#4A2F22] disabled:opacity-60 text-white text-xs font-medium uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  {isProcessing ? (
                    <span>Verifying server prices & inventory...</span>
                  ) : paymentMethod === 'razorpay' ? (
                    <>
                      <span>Pay ₹{totalAmount} with Razorpay</span>
                      <ArrowRight className="w-4 h-4 text-[#D18D4D]" />
                    </>
                  ) : (
                    <>
                      <span>Confirm Order (Pay ₹{totalAmount} on Delivery)</span>
                      <ArrowRight className="w-4 h-4 text-[#D18D4D]" />
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-[#79716B]">
                  By confirming, you agree to our Mindful Delivery Policy and 100% Damage-Free Guarantee.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
