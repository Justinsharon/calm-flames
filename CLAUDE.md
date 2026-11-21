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
3. Storefront reads `src/data/products.ts` (static). `fetchLiveProducts()` exists but is never used.
4. Server validates prices against `src/data/canonicalCatalog.ts` (static), not Firestore.
5. Product images are bundled from `src/assets/images`; admin cannot upload photos.
6. 33 of 37 products unpriced (owner to fill in Firebase).
7. `App.tsx` calls `seedInitialCatalogIfNeeded()` on every visitor load — move to an admin-only script.
8. Phase 1.2.2 gaps in `server.ts`: `payment.failed` skips amount/currency checks when absent (~L1244, ~L1446);
   orphaned mapping `setDoc` outside a transaction (~L556); unfenced fallback `updateDoc` (~L570, ~L575).
9. 6 tests time out hitting live Firestore; concurrency tests assert validation, not final DB state.
10. Admin email hard-coded in `src/context/AuthContext.tsx`.

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
- Env: copy `.env.example` → `.env.local`.
