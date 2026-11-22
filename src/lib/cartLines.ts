/**
 * Cart lines as sent to the server (/api/cart/quote, /api/orders/create). Shared by client and
 * server. A box is ONE line holding its size, chosen candles, ribbon, add-ons and note; the
 * server re-validates and prices it (the client never sends a price).
 */
export interface ProductLineInput {
  kind?: 'product';
  productId: string;
  quantity: number;
}
export interface BoxLineInput {
  kind: 'box';
  /** Number of candles (must match a size in settings/store.buildABox). */
  boxSize: number;
  /** One entry per slot (a candle may repeat). */
  productIds: string[];
  ribbon?: string;
  addOns?: string[];
  message?: string;
  quantity: number;
}
export type CartLineInput = ProductLineInput | BoxLineInput;

export const MAX_LINE_QTY = 100;
export const MAX_BOX_QTY = 10;
export const MAX_LINES = 50;
export const MAX_MESSAGE = 300;

export const isBoxLine = (l: CartLineInput): l is BoxLineInput => (l as BoxLineInput).kind === 'box';

/** Stable key for a line (same box contents = same line). */
export function lineKey(l: CartLineInput): string {
  if (!isBoxLine(l)) return `p:${l.productId}`;
  return `b:${l.boxSize}:${[...l.productIds].sort().join(',')}:${l.ribbon || ''}:${[...(l.addOns || [])].sort().join(',')}:${l.message || ''}`;
}

/** Canonical form for idempotency fingerprints. */
export function normalizeLines(lines: CartLineInput[]): unknown[] {
  return lines
    .map((l) =>
      isBoxLine(l)
        ? {
            kind: 'box',
            boxSize: l.boxSize,
            productIds: [...l.productIds].map(String).sort(),
            ribbon: l.ribbon || '',
            addOns: [...(l.addOns || [])].sort(),
            message: (l.message || '').trim(),
            quantity: l.quantity
          }
        : { productId: String(l.productId).trim(), quantity: Number(l.quantity) }
    )
    .sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
