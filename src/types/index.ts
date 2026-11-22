export type MoodKey = 'calm' | 'grounded' | 'uplifted' | 'sleepy' | 'sensual';

export type BrandCategoryKey =
  | 'aromatherapy-candles'
  | 'ritual-collection'
  | 'gifting'
  | 'shop-by-mood'
  | 'shop-by-scent';

export type InventoryStatus = 'in_stock' | 'out_of_stock' | 'unknown';

export type ScentFamily = 'Floral' | 'Woody' | 'Citrus' | 'Earthy' | 'Spiced';

export type OrderStatus =
  | 'CREATING'
  | 'RESERVED'
  | 'PAYMENT_PENDING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFUNDED'
  | 'RECONCILIATION_REQUIRED'
  | 'EXPIRED';

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type ReservationStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';

export interface InventoryReservationRecord {
  reservationId: string;
  orderNumber: string;
  items: { productId: string; quantity: number }[];
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  releasedAt?: string;
  consumedAt?: string;
}

export interface IdempotencyRecord {
  idempotencyKey: string;
  clientKey?: string;
  orderNumber: string;
  reservationId: string;
  claimGeneration?: number;
  claimToken?: string;
  status: 'CREATING' | 'RESERVED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'FAILED' | 'RECONCILIATION_REQUIRED';
  payloadHash: string;
  amount: number;
  razorpayOrderId?: string | null;
  reconciliationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScentNotes {
  top?: string[];
  heart?: string[];
  base?: string[];
}

export interface CandleRitual {
  bestTime?: string;
  setTheMood?: string;
  steps: string[];
  mantra?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  price: number;
  originalPrice?: number;
  priceStatus?: 'active' | 'missing';
  primaryCategory?: 'Aromatherapy Candles' | 'Ritual Collection' | 'Gifting';
  subcategory?: string;
  collections?: string[];
  tags?: string[];
  weight?: string;
  dimensions?: string;
  fragrance?: string;
  burnTime?: string;
  scentFamily?: ScentFamily;
  shortDescription?: string;
  longDescription?: string;
  howItFeels?: string[];
  scentNotes?: ScentNotes;
  ritual?: CandleRitual;
  image: string;
  galleryImages?: string[];
  waxType?: string;
  wickType?: string;
  vessel?: string;
  customisation?: string;
  inStock?: boolean;
  inventoryStatus?: InventoryStatus;
  availableStock?: number;
  featured?: boolean;
  needsImageAsset?: boolean;
  isActive?: boolean;
  isHistorical?: boolean;
  categories: BrandCategoryKey[];
  moods: MoodKey[];
  matchReasons?: Record<string, string>;
  sortOrder?: number;
  // ---- Phase 4a (optional; see src/lib/productMapping.ts) ----
  collection?: import('../lib/taxonomy').CollectionSlug;
  scentFamilySlug?: import('../lib/taxonomy').ScentFamilySlug;
  notes?: { top?: string[]; heart?: string[]; base?: string[] };
  burnTimeHours?: number;
  weightGrams?: number;
  sizeCm?: string;
  ingredients?: string;
  description?: string;
  /** All photos in order ([0] main, [1] hover). */
  images?: string[];
  occasions?: import('../lib/taxonomy').OccasionSlug[];
  boxEligible?: boolean;
  mrp?: number;
}

export interface BrandCategoryItem {
  id: BrandCategoryKey;
  title: string;
  subtitle: string;
  image: string;
  description: string;
  associatedProductIds: string[];
  actionType: 'filter' | 'mood' | 'scent' | 'discovery';
}

export interface MoodDiscoveryItem {
  id: MoodKey;
  label: string;
  quote: string;
  subtext: string;
  colorBg: string;
  accentColor: string;
  recommendedProductId: string;
  personalizedMessage: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CustomerDetails {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  notes?: string;
}

export interface OrderRecord {
  id?: string;
  orderId: string;
  orderNumber?: string;
  customerId?: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount?: number;
  shipping: number;
  tax?: number;
  total: number;
  currency?: string;
  paymentMethod: 'razorpay' | 'cod';
  paymentId?: string;
  razorpayOrderId?: string;
  customer: CustomerDetails;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus?: string;
  /** Priced lines as stored by the server (products and gift boxes). */
  lines?: { kind: 'product' | 'box'; productId?: string; productName?: string; boxSize?: number; contents?: { productName: string }[]; ribbon?: string; addOns?: { name: string }[]; message?: string; quantity: number; totalPrice: number }[];
  giftMessage?: string | null;
  codFee?: number;
  trackingUrl?: string | null;
}

export interface QuizState {
  currentStep: number;
  feeling: string;
  moment: string;
  scentPreference: string;
  intensity: string;
}
