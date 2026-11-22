/** Razorpay Checkout (browser). The key ID comes from the server's order response (public). */
declare global {
  interface Window {
    Razorpay?: any;
  }
}

export type RazorpayMethod = 'upi' | 'card' | 'netbanking';

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export interface RazorpayResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/** Resolves with the payment response, or rejects with a customer-readable message. */
export async function payWithRazorpay(opts: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  orderNumber: string;
  method: RazorpayMethod;
  prefill: { name: string; email: string; contact: string };
}): Promise<RazorpayResult> {
  if (!(await loadScript())) throw new Error('The payment window could not load. Check your connection and try again.');
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: 'INR',
      name: 'The Calm Flame',
      description: `Order ${opts.orderNumber}`,
      prefill: { ...opts.prefill, method: opts.method },
      theme: { color: '#7B1E2E' },
      handler: (r: RazorpayResult) => {
        if (r?.razorpay_payment_id && r.razorpay_order_id && r.razorpay_signature) resolve(r);
        else reject(new Error('The payment could not be confirmed. If money left your account, contact us with your order number.'));
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Your items are held for a short while; you can try again.')) }
    });
    rzp.on('payment.failed', (r: any) => reject(new Error(r?.error?.description || 'The payment did not go through.')));
    rzp.open();
  });
}
