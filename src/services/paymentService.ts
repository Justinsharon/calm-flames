import { CustomerDetails, CartItem, OrderRecord } from '../types';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface PaymentOptions {
  amount: number; // in INR
  customer: CustomerDetails;
  items: CartItem[];
  razorpayOrderId?: string;
  onSuccess: (paymentId: string, orderId: string, signature?: string) => void;
  onFailure: (error: string) => void;
}

/**
 * Isolated Razorpay Integration Layer
 * Structured for Phase 1 and clean Phase 2 transition:
 * Phase 2 will point createOrderEndpoint to /api/create-order or Cloud Functions.
 */
export async function initializeRazorpayPayment(options: PaymentOptions): Promise<void> {
  const { amount, customer, razorpayOrderId, onSuccess, onFailure } = options;

  // Check if Razorpay script is loaded in browser
  if (typeof window !== 'undefined' && !window.Razorpay) {
    // Attempt dynamic script load if not yet present
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      onFailure('Razorpay payment gateway failed to load. Please check your connection or choose Pay on Delivery.');
      return;
    }
  }

  // Phase 1 Razorpay Key Identifier:
  // Must be configured in environment. Do not fabricate payments.
  const razorpayKey = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID;
  if (!razorpayKey) {
    onFailure('Razorpay gateway is not configured with an active merchant key. Online checkout is temporarily disabled.');
    return;
  }

  try {
    const razorpayOptions: any = {
      key: razorpayKey,
      amount: Math.round(amount * 100), // amount in lowest currency unit (paise)
      currency: 'INR',
      name: 'The Calm Flame',
      description: 'Mindful Candle Ritual & Wellness Order',
      image: '/favicon.ico',
      order_id: razorpayOrderId,
      prefill: {
        name: customer.fullName,
        email: customer.email,
        contact: customer.phone
      },
      notes: {
        shipping_city: customer.city,
        shipping_state: customer.state,
        shipping_pincode: customer.pincode
      },
      theme: {
        color: '#2A2521'
      },
      handler: function (response: any) {
        // Successful payment captured by Razorpay SDK
        const paymentId = response.razorpay_payment_id;
        const orderId = response.razorpay_order_id;
        const signature = response.razorpay_signature;

        if (!paymentId || !orderId || !signature) {
          onFailure('Payment was processed by gateway but required authenticity credentials were not provided. Order cannot be verified.');
          return;
        }

        (onSuccess as any)(paymentId, orderId, signature);
      },
      modal: {
        ondismiss: function () {
          onFailure('Payment checkout modal was closed.');
        }
      }
    };

    const rzp = new window.Razorpay(razorpayOptions);
    rzp.on('payment.failed', function (response: any) {
      const errorMsg = response.error?.description || 'Payment failed with your bank or UPI provider.';
      onFailure(errorMsg);
    });

    rzp.open();
  } catch (err: any) {
    console.error('Razorpay initialization exception:', err);
    onFailure(err?.message || 'Could not launch Razorpay checkout.');
  }
}

/**
 * Loads the Razorpay checkout script if not yet ready in the DOM
 */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Generates an authentic formatted Order ID for The Calm Flame
 */
export function generateOrderId(): string {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `TCF-${randomSuffix}`;
}

/**
 * Saves and retrieves orders from localStorage (Phase 1 client persistence,
 * structured to be easily migrated to Firebase Firestore in Phase 2)
 */
export const OrderStorage = {
  saveOrder(order: OrderRecord): void {
    try {
      const existing = OrderStorage.getOrders();
      const updated = [order, ...existing];
      localStorage.setItem('the_calm_flame_orders', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save order locally:', e);
    }
  },

  getOrders(): OrderRecord[] {
    try {
      const data = localStorage.getItem('the_calm_flame_orders');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
};
