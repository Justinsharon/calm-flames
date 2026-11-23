/**
 * Go-live readiness (pure): turns facts gathered read-only from Firestore / env / Google APIs into
 * a list of checks. Nothing here writes anything.
 */
import { hasVerifiedPrice } from '../../src/lib/productMapping';
import { getShippingConfig, getCodConfig, getBuildABoxConfig, type StoreSettings } from '../../src/lib/storeSettings';

export type Level = 'ok' | 'warn' | 'block' | 'info';
export interface Check {
  level: Level;
  area: string;
  message: string;
}
export interface Facts {
  products: { id: string; name: string; price?: number; priceStatus?: string; isActive?: boolean; isHistorical?: boolean }[];
  inventory: Record<string, { availableQuantity?: number; status?: string } | undefined>;
  settings: StoreSettings | null;
  /** Secret/env names that exist (values are never read into the report). */
  present: Record<string, boolean>;
  checkoutEnabledEnv: boolean;
  liveReadiness?: { checkoutEnabled: boolean; status: string } | { error: string };
  rulesReleases?: { name: string; updateTime: string }[] | { error: string };
  admins: number;
  publicSiteUrl?: string;
}

const SECRETS_FOR_CHECKOUT = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const OPTIONAL = ['MAINTENANCE_SECRET', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'MAIL_PROVIDER', 'ORDER_NOTIFY_EMAIL', 'SUPPORT_NOTIFY_EMAIL', 'PUBLIC_SITE_URL'];

export function buildReport(f: Facts): Check[] {
  const out: Check[] = [];
  const active = f.products.filter((p) => p.isActive !== false && !p.isHistorical);
  const unpriced = active.filter((p) => !hasVerifiedPrice(p));
  out.push(
    unpriced.length === 0 && active.length > 0
      ? { level: 'ok', area: 'Prices', message: `All ${active.length} active products have a verified price.` }
      : { level: 'block', area: 'Prices', message: `${unpriced.length} of ${active.length} active products have no verified price${unpriced.length ? `: ${unpriced.slice(0, 12).map((p) => p.name || p.id).join(', ')}${unpriced.length > 12 ? ', …' : ''}` : ''}.` }
  );
  const inStock = active.filter((p) => (f.inventory[p.id]?.availableQuantity ?? 0) > 0 && f.inventory[p.id]?.status === 'in_stock');
  const noRecord = active.filter((p) => !f.inventory[p.id]);
  out.push({
    level: inStock.length === 0 ? 'block' : noRecord.length || inStock.length < active.length ? 'warn' : 'ok',
    area: 'Stock',
    message: `${inStock.length} of ${active.length} active products in stock${noRecord.length ? `; ${noRecord.length} without an inventory record` : ''}.`
  });
  const ship = getShippingConfig(f.settings);
  out.push(ship ? { level: 'ok', area: 'Shipping', message: `Shipping ₹${ship.shippingFee}, free from ₹${ship.freeShippingThreshold}.` } : { level: 'block', area: 'Shipping', message: 'settings/store has no shipping fee + free-shipping threshold (no totals can be quoted).' });
  const cod = getCodConfig(f.settings);
  out.push({ level: 'info', area: 'COD', message: cod ? `On: fee ₹${cod.codFee}, up to ₹${cod.codMaxOrder}.` : 'Off.' });
  out.push({ level: 'info', area: 'Build a Box', message: getBuildABoxConfig(f.settings) ? 'Configured.' : 'Not configured (page hidden).' });
  const missing = SECRETS_FOR_CHECKOUT.filter((s) => !f.present[s]);
  out.push(missing.length ? { level: 'block', area: 'Razorpay', message: `Missing: ${missing.join(', ')}.` } : { level: 'ok', area: 'Razorpay', message: 'Key ID, key secret and webhook secret present.' });
  out.push({ level: 'info', area: 'Optional', message: OPTIONAL.map((s) => `${s} ${f.present[s] ? '✓' : '–'}`).join(' · ') });
  out.push({ level: f.admins > 0 ? 'ok' : 'warn', area: 'Admin', message: `${f.admins} admin account(s).` });
  if (!f.publicSiteUrl) out.push({ level: 'warn', area: 'SEO', message: 'PUBLIC_SITE_URL not set: every host is noindex and there is no sitemap.' });
  else out.push({ level: 'ok', area: 'SEO', message: `Indexable host: ${f.publicSiteUrl}` });
  if (f.rulesReleases) {
    if ('error' in f.rulesReleases) out.push({ level: 'warn', area: 'Rules', message: `Could not read rules releases (${f.rulesReleases.error}).` });
    else for (const r of f.rulesReleases) out.push({ level: 'info', area: 'Rules', message: `${r.name} last deployed ${r.updateTime}` });
  }
  out.push({ level: 'info', area: 'Checkout switch', message: `CHECKOUT_ENABLED in this shell: ${f.checkoutEnabledEnv ? 'true' : 'not set'}.` });
  if (f.liveReadiness) {
    out.push('error' in f.liveReadiness ? { level: 'warn', area: 'Live service', message: `Readiness unreachable: ${f.liveReadiness.error}` } : { level: 'info', area: 'Live service', message: `checkoutEnabled=${f.liveReadiness.checkoutEnabled} (${f.liveReadiness.status})` });
  }
  return out;
}

export function formatReport(checks: Check[]): string {
  const icon: Record<Level, string> = { ok: 'OK   ', warn: 'WARN ', block: 'BLOCK', info: 'INFO ' };
  const lines = checks.map((c) => `${icon[c.level]}  ${c.area.padEnd(16)} ${c.message}`);
  const blocks = checks.filter((c) => c.level === 'block').length;
  lines.push('', blocks ? `Not ready: ${blocks} blocking item(s). Nothing was changed.` : 'No blocking items. Nothing was changed; turning checkout on is still your decision (CHECKOUT_ENABLED).');
  return lines.join('\n');
}
