import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, CustomerDetails, OrderRecord, CartItem, InventoryReservationRecord, ReservationStatus } from '../types';

export interface InventoryRecord {
  productId: string;
  sku: string;
  inStock?: boolean;
  status?: 'in_stock' | 'out_of_stock' | 'unknown';
  quantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  lowStockThreshold?: number;
  updatedAt: string;
}

export interface CouponRecord {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minimumOrderValue: number;
  maximumDiscount?: number;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
}

/**
 * Fetch inventory levels
 */
export async function fetchInventory(): Promise<InventoryRecord[]> {
  try {
    const invRef = collection(db, 'inventory');
    const snapshot = await getDocs(invRef);
    const records: InventoryRecord[] = [];
    snapshot.forEach((d) => {
      records.push({ productId: d.id, ...d.data() } as InventoryRecord);
    });
    return records;
  } catch (error) {
    return [];
  }
}

/**
 * Fetch a specific durable reservation by ID
 */
export async function fetchInventoryReservation(
  reservationId: string
): Promise<InventoryReservationRecord | null> {
  try {
    const resRef = doc(db, 'inventoryReservations', reservationId);
    const snap = await getDoc(resRef);
    if (!snap.exists()) return null;
    return snap.data() as InventoryReservationRecord;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch all orders (Admin or specific user)
 */
export async function fetchOrders(customerId?: string): Promise<OrderRecord[]> {
  try {
    const ordersRef = collection(db, 'orders');
    let q = query(ordersRef, orderBy('createdAt', 'desc'));
    if (customerId) {
      q = query(ordersRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
    }
    const snapshot = await getDocs(q);
    const orders: OrderRecord[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      orders.push({
        id: d.id,
        orderId: data.orderNumber || data.orderId || d.id,
        orderNumber: data.orderNumber || d.id,
        customerId: data.customerId,
        date: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : data.date || 'Recent',
        items: data.items || [],
        subtotal: data.subtotal || 0,
        discount: data.discount || 0,
        shipping: data.shipping || 0,
        total: data.total || 0,
        paymentMethod: data.paymentMethod || 'razorpay',
        paymentId: data.razorpayPaymentId || data.paymentId || '',
        customer: data.shippingAddress || data.customer || { fullName: 'Customer', email: '', phone: '', addressLine1: '', city: '', state: '', pincode: '' },
        status: data.status || 'CONFIRMED',
        paymentStatus: data.paymentStatus || 'PAID',
        fulfillmentStatus: data.fulfillmentStatus || 'Processing'
      });
    });
    return orders;
  } catch (error) {
    // If composite index is pending or rule applies, fallback gracefully
    console.warn('Orders query fallback:', error);
    try {
      const ordersRef = collection(db, 'orders');
      const snapshot = await getDocs(ordersRef);
      const orders: OrderRecord[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!customerId || data.customerId === customerId) {
          orders.push({
            id: d.id,
            orderId: data.orderNumber || data.orderId || d.id,
            orderNumber: data.orderNumber || d.id,
            customerId: data.customerId,
            date: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : data.date || 'Recent',
            items: data.items || [],
            subtotal: data.subtotal || 0,
            discount: data.discount || 0,
            shipping: data.shipping || 0,
            total: data.total || 0,
            paymentMethod: data.paymentMethod || 'razorpay',
            paymentId: data.razorpayPaymentId || data.paymentId || '',
            customer: data.shippingAddress || data.customer || { fullName: 'Customer', email: '', phone: '', addressLine1: '', city: '', state: '', pincode: '' },
            status: data.status || 'CONFIRMED',
            paymentStatus: data.paymentStatus || 'PAID',
            fulfillmentStatus: data.fulfillmentStatus || 'Processing'
          });
        }
      });
      return orders.sort((a, b) => (b.date > a.date ? 1 : -1));
    } catch (e2) {
      return [];
    }
  }
}

/**
 * Update order status (Admin only)
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderRecord['status'],
  fulfillmentStatus?: string
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    const docRef = doc(db, 'orders', orderId);
    await updateDoc(docRef, {
      status,
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Validate and apply a coupon code
 */
export async function validateCoupon(code: string, currentSubtotal: number): Promise<{ valid: boolean; discount: number; message: string }> {
  try {
    const codeClean = code.trim().toUpperCase();
    const docRef = doc(db, 'coupons', codeClean);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { valid: false, discount: 0, message: 'Invalid coupon code.' };
    }

    const coupon = docSnap.data() as CouponRecord;
    if (!coupon.isActive) {
      return { valid: false, discount: 0, message: 'This coupon has expired.' };
    }

    if (currentSubtotal < coupon.minimumOrderValue) {
      return {
        valid: false,
        discount: 0,
        message: `Minimum order value for ${coupon.code} is ₹${coupon.minimumOrderValue}.`
      };
    }

    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round((currentSubtotal * coupon.value) / 100);
      if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
        discount = coupon.maximumDiscount;
      }
    } else {
      discount = coupon.value;
    }

    return {
      valid: true,
      discount,
      message: `Coupon ${coupon.code} applied successfully!`
    };
  } catch (e) {
    return { valid: false, discount: 0, message: 'Could not validate coupon.' };
  }
}
