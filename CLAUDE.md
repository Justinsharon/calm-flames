# The Calm Flame — project guide for Claude Code

Luxury handcrafted aromatherapy candle store (India, INR). React 19 + Vite 8 + Tailwind 4 frontend,
Express server (`server.ts`), Firebase (Firestore, Auth, Storage), Razorpay payments, Gemini AI features.
Target hosting: Google Cloud Run (same Google project as Firebase).

## Hard rules
- **Never hard-code prices or product images.** Firestore `products` is the single source of truth.
  The storefront reads it, the server prices checkout from it, the admin dashboard edits it.
- **Never invent retail prices** (or shipping/COD/box prices in `settings/store`). The owner enters them in Firebase. Unpriced products (`price: 0`,
  `priceStatus: 'missing'`) must not be purchasable.
- **Checkout stays disabled** (`/api/checkout/readiness` → `checkoutEnabled: false`) until Phase 4.
- **No secrets in code or git.** Razorpay, Gemini and service-account credentials come from env vars only.
- Do not redesign the UI or change branding unless asked.
- After every change run: `npm run lint && npm test && npm run build`. Report honestly which tests use
  mocks vs the Firestore emulator.
- Commit in small, described steps. Do not push to `main` without the owner asking.

## Known critical issues (audit, Nov 2026)
1. `npm install` fails: `esbuild@^0.25` conflicts with Vite 8 (needs ^0.27). Bun works; npm must work for Cloud Run.
2. Server uses the **client** Firebase SDK unauthenticated; Firestore rules deny its order/inventory writes.
   Must move to `firebase-admin` with a service account / Cloud Run default credentials.
3. ~~Storefront reads static product data.~~ Fixed in Phase 3 (`CatalogContext`, realtime Firestore).
4. ~~Server validates prices against the static catalogue.~~ Fixed in Phase 3 (`src/server/catalogService.ts`).
5. ~~Product images bundled; admin cannot upload photos.~~ Fixed in Phase 3 (Storage + admin upload).
   One image stays bundled as the decorative home hero (`src/data/siteContent.ts`).
6. 33 of 37 products unpriced (owner to fill in Firebase).
7. ~~`App.tsx` seeds the catalogue on every visitor load.~~ Fixed in Phase 3 (`scripts/migrate-catalog.ts`).
8. Phase 1.2.2 gaps in `server.ts`: `payment.failed` skips amount/currency checks when absent (~L1244, ~L1446);
   orphaned mapping `setDoc` outside a transaction (~L556); unfenced fallback `updateDoc` (~L570, ~L575).
9. 6 tests time out hitting live Firestore; concurrency tests assert validation, not final DB state.
10. ~~Admin email hard-coded.~~ Fixed in Phase 3: role from `customers/{uid}.role` (+ `admin` claim for Storage).
11. ~~`/api/payments/verify` writes order status without the claim check.~~ Fixed in Phase 3b
    (`src/server/orderTransitions.ts`: one transaction re-checks order state + creation claim).
12. ~~Stale reservations never expire.~~ Fixed in Phase 3b (`src/server/reservationExpiry.ts`;
    `POST /api/admin/maintenance/expire-reservations` or `npm run expire-reservations`).
    **Phase 4:** schedule it (Cloud Scheduler, see `docs/reservation-expiry.md`).
    Phase 3c: the same sweep expires abandoned Razorpay `PAYMENT_PENDING` orders (`src/server/orderExpiry.ts`)
    after checking Razorpay; late payments on `EXPIRED` orders go to `RECONCILIATION_REQUIRED` (`PAID_AFTER_EXPIRY`).

## Phases
- **Phase 1 — Foundations:** fix npm install; migrate server to firebase-admin; add Firestore emulator
  test setup (`firebase.json`, `npm run test:emulator`); fix the 6 failing tests.
- **Phase 2 — Payment hardening (1.2.2):** close the four gaps in issue 8; add emulator-backed concurrency
  tests that assert final order/event/inventory state.
- **Phase 3 — Live catalogue:** storefront + server read products from Firestore; images in Firebase Storage
  (URL stored on product doc); admin dashboard can edit price/stock/photo; one-time migration script
  `scripts/migrate-catalog.ts`; remove seeding from `App.tsx`; admin role from Firestore.
- **Phase 3b/3c (done):** fenced payment verify, stale-reservation sweeper, abandoned-payment expiry.
- **Phase 4a — Hosting + data model (done on `phase-4a-hosting-data`):** Dockerfile + Cloud Run staging
  (`docs/deploy.md`, service `calm-flames-staging`, asia-south1, secrets from Secret Manager, all optional);
  product fields v2 (collection, scentFamily slug, notes, burnTimeHours, weightGrams, sizeCm, ingredients,
  description, images[], tags, occasions, boxEligible, mrp); taxonomy docs `collections/`, `scentFamilies/`,
  `occasions/`; `settings/store` (no defaults: unset = feature hidden; shipping unset = no totals);
  admin editors; `scripts/import-catalog.ts`.
- **Phase 4B — Design pages (on `phase-4b-design-pages`):** new storefront from `docs/design/` with real URLs
  (`src/lib/routes.ts`, react-router; server serves index.html with per-URL title/meta, 404s unknown paths).
  Home, Collection, Product, Scent, Gifting, Journal, Info, Support, 404. Content (journal, info pages, FAQ,
  contact, care) lives in Firestore `pages` (Admin → Pages & Journal; only published docs are public).
- **Phase 4C — Cart, box, checkout (on `phase-4c-cart-box-checkout`):** `/cart`, `/build-a-box` (hidden until
  `settings/store.buildABox`), `/checkout` ('Opening soon' unless `CHECKOUT_ENABLED=true` and readiness passes),
  `/order/:id/confirmed` (needs the view token from order creation). One server quote (`src/server/quote.ts`)
  prices products and boxes; coupons in Firestore `coupons/` (admin-only, `npm run migrate:coupons` adds the old
  two INACTIVE); `/api/orders/create` refuses orders unless `CHECKOUT_ENABLED=true`. Confirmation email:
  `MAIL_PROVIDER=resend` + `RESEND_API_KEY` + `MAIL_FROM` (unset = log and skip). Local previews can point the
  storefront at the emulator with `VITE_FIRESTORE_EMULATOR_HOST`.
- **Phase 4D — Accounts, gift guide, support (on `phase-4d-accounts-guide-support`):** Google-only sign-in
  (`/sign-in` + modal), `/account` (Favourites in `customers/{uid}/wishlist`, Orders by `customerId`, saved
  `addresses`), checkout prefill + ID token links orders to accounts. Gift guide `POST /api/gift-guide` (Gemini
  over active/priced/in-stock products only; keyword fallback without `GEMINI_API_KEY`). Help & Support:
  `POST /api/orders/lookup` (number + phone), `POST /api/support` (photo in Storage `support/{uuid}/`),
  Admin → Support; optional `SUPPORT_NOTIFY_EMAIL`. Reviews: verified buyers only (server-written
  `customers/{uid}/purchases`), pending until approved. Rewards, rituals, moodInteractions, analyticsEvents
  removed; per-IP rate limits on public POSTs (`src/server/rateLimit.ts`; tests set `RATE_LIMIT_DISABLED=1`).
- **Phase 4 — Go live:** owner enters prices/photos/settings in Firebase; owner sets Razorpay env vars +
  webhook; test payment; enable checkout; deploy to Cloud Run; point thecalmflames.com.
- **Later:** UI polish.

## Commands
- Install: `npm install`
- Dev: `npm run dev` (port 3000) · Typecheck: `npm run lint` · Tests: `npm test`
- Build: `npm run build` (Vite storefront → `dist/`, bundled server → `dist-server/server.js`) · Prod: `npm start`
- Container: `Dockerfile` (Node 22, listens on `$PORT`); deploy steps in `docs/deploy.md`
- Emulator tests: `npm run test:emulator` (Firestore + Storage emulators; needs Java)
- Catalogue migration: `npm run migrate:catalog [-- --dry-run]` · Admin: `npm run grant-admin -- <email>`
  (steps: `docs/catalog-migration.md`) · Rules deploy uses `firebase.deploy.json` (named database)
- Catalogue import: `npm run import:catalog -- <file.xlsx|.csv> [--photos <dir>] [--apply]` (dry run by default)
- Taxonomy seed (create-only): `npm run seed:taxonomy`
- Maintenance sweep: `npm run expire-reservations` (also `POST /api/admin/maintenance/expire-reservations`)
- Real checkout additionally requires `CHECKOUT_ENABLED=true` (Phase 4 only) and shipping set in `settings/store`.
- Env: copy `.env.example` → `.env.local`.
