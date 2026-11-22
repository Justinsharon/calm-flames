/**
 * Authoritative pricing for a cart (pure: catalogue, settings and coupon are passed in).
 * Used by /api/cart/quote (and the older /api/cart/validate) and /api/orders/create, so the
 * cart page, checkout and the order all quote the same numbers. Prices come only from the
 * Firestore product docs and settings/store; the client never sends a price.
 */
import type { Product } from '../types';
import { hasVerifiedPrice } from '../lib/productMapping';
import {
  type StoreSettings,
  getShippingConfig,
  getCodConfig,
  getBuildABoxConfig,
  computeShipping
} from '../lib/storeSettings';
import { type Coupon, couponDiscount } from '../lib/coupons';
import { type CartLineInput, MAX_BOX_QTY, MAX_LINE_QTY, MAX_LINES, MAX_MESSAGE } from '../lib/cartLines';

export interface PricedProductLine {
  kind: 'product';
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceStatus?: string;
}
export interface PricedBoxLine {
  kind: 'box';
  boxSize: number;
  boxPrice: number;
  contents: { productId: string; productName: string; unitPrice: number }[];
  ribbon: string;
  addOns: { name: string; price: number }[];
  message: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
export type PricedLine = PricedProductLine | PricedBoxLine;

export type QuoteError = { ok: false; status: number; error: string };
export interface PricedCart {
  ok: true;
  lines: PricedLine[];
  /** Units of each product to reserve (box contents included). */
  demand: { productId: string; quantity: number }[];
  subtotal: number;
}

const isQty = (q: unknown, max: number): q is number => typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= max;
const fail = (error: string, status = 400): QuoteError => ({ ok: false, status, error });

/** Every product id mentioned by the lines (to fetch from Firestore in one read). */
export function productIdsOf(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const l of items as any[]) {
    if (l?.kind === 'box' && Array.isArray(l.productIds)) ids.push(...l.productIds.filter((x: unknown) => typeof x === 'string'));
    else if (typeof l?.productId === 'string') ids.push(l.productId);
  }
  return ids;
}

function checkSellable(p: Product | undefined, id: unknown): QuoteError | null {
  if (!p || p.isHistorical) return fail(`Product ${String(id)} is not available in the active catalogue.`);
  if (p.isActive === false) return fail(`${p.name} is no longer available in the active catalogue.`);
  if (!hasVerifiedPrice(p)) return fail(`${p.name} does not have a verified retail price and cannot be ordered.`);
  return null;
}

/**
 * Validate and price the lines. `checkStock` also requires verified stock for the whole demand
 * (the cart quote); order creation leaves stock to the atomic reservation.
 */
export function priceCart(
  items: unknown,
  catalog: Map<string, Product>,
  settings: StoreSettings | null,
  opts: { checkStock: boolean }
): PricedCart | QuoteError {
  if (!Array.isArray(items) || items.length === 0) return fail('Cart is empty or invalid format.');
  if (items.length > MAX_LINES) return fail(`A cart can hold at most ${MAX_LINES} lines.`);

  const lines: PricedLine[] = [];
  const demand = new Map<string, number>();
  const want = (id: string, n: number) => demand.set(id, (demand.get(id) || 0) + n);
  let subtotal = 0;

  for (const raw of items as CartLineInput[]) {
    if (!raw || typeof raw !== 'object') return fail('Invalid item format in order payload.');

    if ((raw as any).kind === 'box') {
      const box = getBuildABoxConfig(settings);
      if (!box) return fail('Build a Box is not available.');
      const l = raw as any;
      const size = box.sizes.find((s) => s.count === l.boxSize);
      if (!size) return fail('That box size is not available.');
      if (!isQty(l.quantity, MAX_BOX_QTY)) return fail(`Invalid quantity for the gift box. Permitted range is 1 to ${MAX_BOX_QTY}.`);
      if (!Array.isArray(l.productIds) || l.productIds.length !== size.count) {
        return fail(`A box of ${size.count} needs exactly ${size.count} candles.`);
      }
      const contents: PricedBoxLine['contents'] = [];
      for (const id of l.productIds) {
        const p = typeof id === 'string' ? catalog.get(id.trim()) : undefined;
        const bad = checkSellable(p, id);
        if (bad) return bad;
        if (p!.boxEligible !== true) return fail(`${p!.name} cannot go in a gift box.`);
        contents.push({ productId: p!.id, productName: p!.name, unitPrice: p!.price });
        want(p!.id, l.quantity);
      }
      let ribbon = '';
      if (l.ribbon !== undefined && l.ribbon !== '') {
        if (typeof l.ribbon !== 'string' || !box.ribbons.includes(l.ribbon)) return fail('That ribbon is not available.');
        ribbon = l.ribbon;
      }
      const addOnNames: unknown[] = Array.isArray(l.addOns) ? l.addOns : l.addOns === undefined ? [] : [null];
      if (new Set(addOnNames).size !== addOnNames.length) return fail('Each add-on can be chosen once.');
      const addOns: PricedBoxLine['addOns'] = [];
      for (const n of addOnNames) {
        const a = box.addOns.find((x) => x.name === n);
        if (!a) return fail('That add-on is not available.');
        addOns.push({ name: a.name, price: a.price });
      }
      const message = typeof l.message === 'string' ? l.message.trim() : '';
      if (l.message !== undefined && typeof l.message !== 'string') return fail('Invalid gift message.');
      if (message.length > MAX_MESSAGE) return fail(`Gift messages can be up to ${MAX_MESSAGE} characters.`);
      const unitPrice = size.price + contents.reduce((s, c) => s + c.unitPrice, 0) + addOns.reduce((s, a) => s + a.price, 0);
      const totalPrice = unitPrice * l.quantity;
      subtotal += totalPrice;
      lines.push({ kind: 'box', boxSize: size.count, boxPrice: size.price, contents, ribbon, addOns, message, quantity: l.quantity, unitPrice, totalPrice });
      continue;
    }

    const l = raw as any;
    if (typeof l.productId !== 'string' || !l.productId.trim()) return fail('Invalid item format in order payload.');
    const p = catalog.get(l.productId.trim());
    const bad = checkSellable(p, l.productId);
    if (bad) return bad;
    if (!isQty(l.quantity, MAX_LINE_QTY)) return fail(`Invalid quantity for ${p!.name}. Permitted range is 1 to ${MAX_LINE_QTY}.`);
    const totalPrice = p!.price * l.quantity;
    subtotal += totalPrice;
    want(p!.id, l.quantity);
    lines.push({ kind: 'product', productId: p!.id, productName: p!.name, quantity: l.quantity, unitPrice: p!.price, totalPrice, priceStatus: p!.priceStatus });
  }

  if (opts.checkStock) {
    for (const [id, n] of demand) {
      const p = catalog.get(id)!;
      if (p.inStock !== true || p.inventoryStatus !== 'in_stock') {
        return fail(`${p.name} does not have verified available stock and cannot be purchased at this time.`);
      }
      if (typeof p.availableStock === 'number' && p.availableStock < n) {
        return fail(`Insufficient stock for ${p.name}. Requested ${n}, available: ${p.availableStock}.`);
      }
    }
  }

  return { ok: true, lines, demand: [...demand].map(([productId, quantity]) => ({ productId, quantity })), subtotal };
}

export interface Totals {
  subtotal: number;
  discount: number;
  couponCode: string;
  couponMessage?: string;
  shipping: number;
  codFee: number;
  total: number;
  /** Amount still needed for free shipping (0 = already free). */
  amountToFreeShipping: number;
  freeShippingThreshold: number;
  cod: { available: boolean; fee?: number; maxOrder?: number; reason?: string };
}

/**
 * Totals from a priced cart. Shipping must be configured (else no totals at all). A bad coupon
 * is not an error: it just gives no discount and a message. COD is checked only when asked for.
 */
export function computeTotals(
  subtotal: number,
  settings: StoreSettings | null,
  coupon: { code: string; coupon: Coupon | null } | null,
  paymentMethod: 'razorpay' | 'cod' | undefined,
  now: Date = new Date()
): { ok: true; totals: Totals } | QuoteError {
  const shippingCfg = getShippingConfig(settings);
  if (!shippingCfg) return fail('Shipping is not configured yet, so totals cannot be calculated. Checkout is unavailable.', 503);
  let discount = 0;
  let couponMessage: string | undefined;
  let couponCode = '';
  if (coupon && coupon.code) {
    const r = couponDiscount(coupon.coupon, subtotal, now);
    if (r.ok) {
      discount = r.discount;
      couponCode = coupon.code;
      couponMessage = `${coupon.code} applied.`;
    } else couponMessage = r.reason;
  }
  const shipping = computeShipping(subtotal, shippingCfg);
  const cod = getCodConfig(settings);
  const beforeCod = Math.max(0, subtotal - discount + shipping);
  const codInfo: Totals['cod'] = !cod
    ? { available: false, reason: 'Cash on delivery is not available.' }
    : beforeCod + cod.codFee > cod.codMaxOrder
      ? { available: false, fee: cod.codFee, maxOrder: cod.codMaxOrder, reason: `Cash on delivery is available for orders up to ₹${cod.codMaxOrder}.` }
      : { available: true, fee: cod.codFee, maxOrder: cod.codMaxOrder };
  if (paymentMethod === 'cod' && !codInfo.available) return fail(codInfo.reason!);
  const codFee = paymentMethod === 'cod' ? cod!.codFee : 0;
  return {
    ok: true,
    totals: {
      subtotal,
      discount,
      couponCode,
      couponMessage,
      shipping,
      codFee,
      total: beforeCod + codFee,
      amountToFreeShipping: Math.max(0, shippingCfg.freeShippingThreshold - subtotal),
      freeShippingThreshold: shippingCfg.freeShippingThreshold,
      cod: codInfo
    }
  };
}
