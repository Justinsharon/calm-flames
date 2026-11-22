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

---

# Importing / updating products from a spreadsheet

`npm run import:catalog` reads an **.xlsx** (first sheet) or **.csv** and updates Firestore
`products`, matched on the **ID** column. It is a **dry run by default**: it prints what it would
do per row and writes nothing until you add `--apply`.

## Columns

`ID, Name, Collection, Price, Stock, Short description, Full description, Scent family, Top notes,
Heart notes, Base notes, Burn time, Weight, Size, Ingredients, Tags, Occasions, Box eligible`

| Column | Accepts |
|---|---|
| ID | lowercase letters, digits, hyphens (the product's Firestore ID, e.g. `peony-bloom`) |
| Collection | `pillar-sculptural`, `jar-candles`, `coconut-shell`, `urli-centrepieces`, `floral-bouquets` (or their names) |
| Price | rupees, e.g. `899` or `₹1,299`. **> 0 makes the product buyable**; `0` makes it unbuyable |
| Stock | whole number of units available (reserved units in open checkouts are kept) |
| Scent family | `indian-botanical`, `floral`, `gourmand`, `spicy-resinous`, `luxury-woody`, `fresh-citrus` (or names) |
| Top / Heart / Base notes | comma-separated |
| Burn time | hours, e.g. `40` or `40 hours` |
| Weight | grams, e.g. `200`, `200g` or `0.2 kg` |
| Size | free text in cm, e.g. `8 x 10` |
| Tags | `bestseller`, `new`, `limited` (comma-separated) |
| Occasions | `christmas`, `birthday`, `wedding`, `housewarming`, `corporate` |
| Box eligible | `yes` / `no` |

## Rules

- **A blank cell never changes anything.** To clear a field, use the admin dashboard.
- **Prices only come from the Price column.** Nothing else sets a price.
- **New IDs create hidden products** (`isActive: false`). Activate them in the admin dashboard.
- **A row with any error is skipped entirely**; the other rows still apply.
- Duplicate IDs in the file: the later row is reported as an error.

## Photos

Put photos in one folder named `<ID>-1.jpg`, `<ID>-2.jpg`, … (`.jpg`, `.jpeg`, `.png`, `.webp`, up
to 5 MB). `-1` becomes the main photo, `-2` the hover photo. For a product with photos in the
folder, the product's photo list is **replaced** by those files, in number order. Products with no
photos in the folder are not touched. Re-running with the same files uploads nothing new.

## Run it

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/keys/calm-flames-admin.json"
```

```bash
npm run import:catalog -- catalogue.xlsx --photos ./photos
```

Read the report: every row is `NEW`, `UPDATED` (with the fields that change), `UNCHANGED` or
`ERROR` (with the reason). When it looks right:

```bash
npm run import:catalog -- catalogue.xlsx --photos ./photos --apply
```

Running the same file again should report every row `UNCHANGED`.

## Taxonomy (collections, scent families, occasions)

Create the 5 collections, 6 scent families and 5 occasions once (existing ones are never touched),
then edit names, descriptions and header images in Admin → Collections & Scents:

```bash
npm run seed:taxonomy
```
