/**
 * `settings/store` (Firestore): shop-wide commercial settings entered by the owner.
 * Nothing here has a default: an unset or invalid value means the dependent feature is OFF and
 * hidden (shipping-dependent checkout, COD, build-a-box). Never invent values.
 */
export interface BoxSize {
  count: number;
  price: number;
}
export interface BoxAddOn {
  name: string;
  price: number;
}
export interface BuildABoxSettings {
  sizes: BoxSize[];
  ribbons: string[];
  addOns: BoxAddOn[];
}
export interface StoreSettings {
  freeShippingThreshold?: number;
  shippingFee?: number;
  codEnabled?: boolean;
  codFee?: number;
  codMaxOrder?: number;
  buildABox?: BuildABoxSettings;
}

const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/** Keep only well-formed fields (anything malformed is treated as unset). */
export function parseStoreSettings(raw: unknown): StoreSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: StoreSettings = {};
  if (isMoney(r.freeShippingThreshold)) out.freeShippingThreshold = r.freeShippingThreshold;
  if (isMoney(r.shippingFee)) out.shippingFee = r.shippingFee;
  if (typeof r.codEnabled === 'boolean') out.codEnabled = r.codEnabled;
  if (isMoney(r.codFee)) out.codFee = r.codFee;
  if (isMoney(r.codMaxOrder) && r.codMaxOrder > 0) out.codMaxOrder = r.codMaxOrder;
  const b = r.buildABox;
  if (b && typeof b === 'object' && Array.isArray(b.sizes)) {
    const sizes = b.sizes.filter((s: any) => s && isPositiveInt(s.count) && isMoney(s.price) && s.price > 0);
    if (sizes.length > 0 && sizes.length === b.sizes.length) {
      const ribbons = Array.isArray(b.ribbons) ? b.ribbons.filter((x: any) => typeof x === 'string' && x.trim()) : [];
      const addOns = Array.isArray(b.addOns)
        ? b.addOns.filter((a: any) => a && typeof a.name === 'string' && a.name.trim() && isMoney(a.price))
        : [];
      out.buildABox = { sizes, ribbons, addOns };
    }
  }
  return out;
}

export interface ShippingConfig {
  freeShippingThreshold: number;
  shippingFee: number;
}
/** Shipping needs BOTH values. Null = not configured = no totals can be quoted. */
export function getShippingConfig(s: StoreSettings | null | undefined): ShippingConfig | null {
  if (!s || !isMoney(s.freeShippingThreshold) || !isMoney(s.shippingFee)) return null;
  return { freeShippingThreshold: s.freeShippingThreshold, shippingFee: s.shippingFee };
}

export function computeShipping(subtotal: number, cfg: ShippingConfig): number {
  if (subtotal <= 0) return 0;
  return subtotal >= cfg.freeShippingThreshold ? 0 : cfg.shippingFee;
}

export interface CodConfig {
  codFee: number;
  codMaxOrder: number;
}
/** COD is available only when explicitly enabled AND its fee and order limit are set. */
export function getCodConfig(s: StoreSettings | null | undefined): CodConfig | null {
  if (!s || s.codEnabled !== true || !isMoney(s.codFee) || !isMoney(s.codMaxOrder) || s.codMaxOrder <= 0) return null;
  return { codFee: s.codFee, codMaxOrder: s.codMaxOrder };
}

export function getBuildABoxConfig(s: StoreSettings | null | undefined): BuildABoxSettings | null {
  return s?.buildABox && s.buildABox.sizes.length > 0 ? s.buildABox : null;
}

/** Validation for the admin editor (stricter than parsing: reports what is wrong). */
export function validateStoreSettings(s: StoreSettings): string | null {
  const money: (keyof StoreSettings)[] = ['freeShippingThreshold', 'shippingFee', 'codFee', 'codMaxOrder'];
  for (const k of money) {
    const v = s[k];
    if (v !== undefined && !isMoney(v)) return `${k} must be a number of 0 or more.`;
  }
  if ((s.freeShippingThreshold === undefined) !== (s.shippingFee === undefined)) {
    return 'Set both the free-shipping threshold and the shipping fee (or neither).';
  }
  if (s.codEnabled && (s.codFee === undefined || !s.codMaxOrder)) {
    return 'To enable cash on delivery, also set the COD fee and a maximum COD order value above 0.';
  }
  if (s.buildABox) {
    if (!Array.isArray(s.buildABox.sizes) || s.buildABox.sizes.length === 0) return 'Build-a-box needs at least one size.';
    for (const z of s.buildABox.sizes) {
      if (!isPositiveInt(z.count) || !isMoney(z.price) || z.price <= 0) return 'Each box size needs a whole-number count and a price above 0.';
    }
    for (const a of s.buildABox.addOns || []) {
      if (!a.name?.trim() || !isMoney(a.price)) return 'Each add-on needs a name and a price of 0 or more.';
    }
  }
  return null;
}
