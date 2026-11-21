# The Calm Flame — project guide for Claude Code

Luxury handcrafted aromatherapy candle store (India, INR). React 19 + Vite 8 + Tailwind 4 frontend,
Express server (`server.ts`), Firebase (Firestore, Auth, Storage), Razorpay payments, Gemini AI features.
Target hosting: Google Cloud Run (same Google project as Firebase).

## Hard rules
- **Never hard-code prices or product images.** Firestore `products` is the single source of truth.
  The storefront reads it, the server prices checkout from it, the admin dashboard edits it.
- **Never invent retail prices.** The owner enters them in Firebase. Unpriced products (`price: 0`,
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
   Six images stay bundled as decorative hero/story/category artwork (`src/data/siteContent.ts`).
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
- **Phase 4 — Go live:** owner enters prices/photos in Firebase; owner sets Razorpay env vars + webhook;
  test payment; enable checkout; deploy to Cloud Run; point thecalmflames.com.
- **Later:** UI polish.

## Commands
- Install: `npm install` (until Phase 1 lands: `bun install`)
- Dev: `npm run dev` (port 3000) · Typecheck: `npm run lint` · Tests: `npm test` · Build: `npm run build`
- Emulator tests: `npm run test:emulator` (Firestore + Storage emulators; needs Java)
- Catalogue migration: `npm run migrate:catalog [-- --dry-run]` · Admin: `npm run grant-admin -- <email>`
  (steps: `docs/catalog-migration.md`) · Rules deploy uses `firebase.deploy.json` (named database)
- Real checkout additionally requires `CHECKOUT_ENABLED=true` (Phase 4 only).
- Env: copy `.env.example` → `.env.local`.
