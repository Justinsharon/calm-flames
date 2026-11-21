# Catalogue migration: run it against the real Firebase project

This copies the product photos into Firebase Storage and writes every product into Firestore
`products` (with an `imageUrl`). It is safe to run more than once: it never overwrites anything
already in Firestore (prices, price status, active flags, photos, stock), and it never invents a
price. The 33 active products are written as `price: 0`, `priceStatus: 'missing'`.

Project: `groovy-patrol-413416` · Firestore database:
`ai-studio-thecalmflamearti-86cdffef-0b22-4392-a1f1-a015f3743f8e` · Storage bucket:
`groovy-patrol-413416.firebasestorage.app` (all taken from `firebase-applet-config.json`).

## Order matters

1. Migrate (steps 1–5).
2. Make yourself admin (step 6).
3. Deploy the security rules (step 7).
4. Only then deploy the new site code. The new storefront shows photos only from `imageUrl`,
   so deploying it before the migration shows products without photos.

**Do not open the currently deployed (old) site while signed in as admin after you start entering
prices.** The old build still runs the old seeding on page load for admins, and it can reset
products to `price: 0` / `priceStatus: 'missing'`. That code is removed on this branch.

## 1. Prerequisites (on your computer)

- Node.js 22 and this repository checked out on the `phase-3-catalogue` branch.
- `npm install`
- Firebase Storage enabled: Firebase console → **Storage** → **Get started** (skip if a bucket
  already appears there).

## 2. Download a service-account key

Firebase console → ⚙ **Project settings** → **Service accounts** → **Generate new private key**.
Save the file **outside** the repository, e.g. `~/keys/calm-flames-admin.json`. Never commit it.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/keys/calm-flames-admin.json"
```

## 3. Dry run (writes nothing)

```bash
npm run migrate:catalog -- --dry-run
```

Check the first line names project `groovy-patrol-413416`, the `ai-studio-…` database and the
`groovy-patrol-413416.firebasestorage.app` bucket. Read any `WARNING:` lines: a product that
already has a price but no price status is listed there and stays **not buyable** until you
confirm its price in the admin dashboard.

## 4. Run the migration

```bash
npm run migrate:catalog
```

Expect on a first run: `Images: 22 uploaded`, `Products: … created`, `Inventory docs created: …`.
Products that already exist only gain the fields they are missing (listed at the end).

## 5. Run it again to confirm nothing changes

```bash
npm run migrate:catalog
```

Expect `Images: 0 uploaded, 22 unchanged` and `0 created, 0 updated`.

## 6. Make yourself admin

Sign up / sign in on the site once with your admin email, then:

```bash
npm run grant-admin -- <your-admin-email>
```

This sets `role: 'admin'` on `customers/{your uid}` (used by the app and Firestore rules) and the
`admin` custom claim (used by Storage rules for photo uploads). **Sign out and back in** afterwards.

## 7. Deploy the security rules

```bash
npx firebase login
```

```bash
npx firebase deploy --config firebase.deploy.json --only firestore,storage --project groovy-patrol-413416
```

`firebase.deploy.json` targets the named `ai-studio-…` database. (`firebase.json` is for the local
emulators only.)

## 8. Check

- Firebase console → Firestore → `products`: 37 documents, each with `imageUrl`.
- Storage → `products/`: 22 photos.
- Open the site (once the new code is deployed): products show photos and "Price Pending".
- Admin dashboard → Products → Edit: set a price, choose **Active (verified retail price)**,
  save. The storefront updates within a second, without a redeploy.

Checkout stays disabled regardless (it also needs `CHECKOUT_ENABLED=true`, which is Phase 4).
