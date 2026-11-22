# The Calm Flame · Design reference

The approved wireframe (Nov 2026) for the new storefront. Phase 4B–4D build the real site from this.
Live, clickable version: https://claude.ai/artifact/3t1T7AM92jj4rfwsmvJJ9o (press Play on Home).

## What is in this folder

- `wireframe/*.html`: one file per page, exported from the design canvas. Treat the **markup and CSS as the
  spec** and the logic as a mock. They use design-tool syntax you should not copy: `{{hole}}` values,
  `<sc-if>` / `<sc-for>`, `class Component extends DCLogic`, and `/_blob/<id>` image paths.
- `reference.css`: every class the wireframe uses, in one file. Port the values into Tailwind 4 theme
  tokens and React components; don't ship this file as-is.

## Hard rules (from CLAUDE.md, repeated because the wireframe breaks them on purpose)

- **All prices, names, photos, descriptions, stock and reviews in the wireframe are sample data.** Nothing
  from it goes live. Products, prices and photos come only from Firestore and Storage.
- Reviews render only from real, approved review records. With none, the section is hidden.
- Policy wording, the WhatsApp number (+91 90000 00000), emails and the order number (TCF-10482) are placeholders.
- Shipping threshold, shipping fee, COD fee and Build a Box prices come from `settings/store`; when unset,
  the dependent UI is hidden, never filled with a default.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| wine | `#7B1E2E` | accents, avatar, gradients |
| wine-deep | `#5C1622` | text on ivory buttons, glass tints |
| ink | `#1E0B0F` | page background |
| ink-2 | `#2A1015` | alternate section band |
| ink-3 | `#140608` | footer |
| ivory | `#F4EDE7` | main text, primary button fill |
| ivory-2 | `#F3E6E1` | body copy on dark |
| rose | `#EBC9BF` | script accents, active states, links |
| muted | `#E0C9C3` | secondary text, eyebrows |
| taupe | `#C9A396` | tertiary text, crumbs |
| match-stick | `#2C2E14` → `#4A4C24` | matchstick gradient |
| flame | `#FFFBE6` → `#FFE27A` → `#F7C443` → `#EFA62E` | match flame radial |

Fonts (Google Fonts): **Pinyon Script** (script accents, one or two words per heading),
**Cormorant Garamond** 400/500 + italic (headings, product names, prices on detail pages),
**Nunito** 400/600/700 (body, buttons, labels). Eyebrows: 12px, 0.3em tracking, uppercase, muted.

Glass: `background: rgba(244,237,231,.06); border: 1px solid rgba(244,237,231,.14); backdrop-filter: blur(40px) saturate(1.2); border-radius: 24px`.

## Components (class in reference.css → React component)

- **Header** (`header()` in every page): wordmark left; right side = Menu button, account icon (person
  outline; signed in = rose circle with initial), Cart (n). Overlays the hero photo on pages with a hero, solid
  on Cart / Checkout / Product / Account. **Menu** opens a glass panel: Collections (5) | Explore (Scent,
  Gifting, Build a Box, Journal, Our Story, Help & Support, Sign in · Favourites). No pill bar, no announcement bar.
- **Page hero** (`pagehero`): full-bleed photo, slow drift + mouse parallax, bottom fade to ink, crumb,
  eyebrow, serif heading with one script word, one-line sub.
- **Buttons**: `.hx-btn.hx-pri` (ivory fill, wine text) and `.hx-btn.hx-out` (outline, transparent background:
  set `background: none` on `<button>`s or they render browser grey).
- **3D tilt card** `.t3` (+ `.shine` sweep on hover, `.p3` perspective parent). Labels stay flat (no translateZ):
  in perspective they drift and overflow.
- **Arch tile** `.arch` (collections), **occasion tile** (3:4 photo, script name), **product card** `.card3`
  (hover swaps to the second photo, glass heart top-right, Add to cart slides up; always visible on mobile).
- **Chips** `.chip3` (scent family with round photo), `.chipf` filter chip, `.chipf.on` selected.
- **Floating stack** `.box3` (Build a Box visual).
- **Accordion** `.acc` (product details: Description, How to burn & care, Ingredients, Shipping & returns; + rotates to ×).
- **Qty stepper** `.qty`, **thumb gallery** `.thumb`, **progress bar** `.bar`, **step indicator** `.step3`.
- **Matchstick** `.match` (order confirmed: spark → flame ignites → flicker → glow, then the thank-you fades in)
  and **mini match avatar** `.buddy-av` + `.mm-*` (gift guide, sign-in). This replaces every flame icon.
- **Gift guide** `.buddy`: floating button bottom-right on Gifting; opens a chat panel with quick replies.

Motion: transform/opacity only; every animation is disabled under `prefers-reduced-motion` (see the media
queries at the end of reference.css). Visible focus ring: 2px ivory, 3px offset.

## Pages and routes

| Wireframe file | Route | Notes |
| --- | --- | --- |
| Main.html | `/` | Hero → trust strip → Collections → Bestsellers → Build a Box → Shop by Scent → Gifting → Our story → Reviews → Journal → Join the Ritual → footer |
| Category.html | `/collections/:slug` | 5 collections, same layout; filter bar (price, scent family, size, in stock, sort) |
| Product.html | `/products/:slug` | gallery + thumbs, accordion details, qty, Add to cart, Add to a gift box, Save to favourites, pincode check |
| Scent.html | `/scent` and `/scent/:family` | 6 families, feature panel, candles in the family, signature blends with % bars |
| BuildBox.html | `/build-a-box` | choose size → fill → ribbon/add-ons/message → one cart line priced on the server |
| Gifting.html | `/gifting` and `/gifting/:occasion` | occasions: Christmas, Birthday, Wedding, Housewarming, Corporate; ready hampers; gift guide (no Build a Box here) |
| Cart.html | `/cart` | free-shipping line under the title (no box), qty, remove, gift message, summary |
| Checkout.html | `/checkout` | contact, address, payment (UPI / card / netbanking / COD), summary; guest checkout allowed |
| Confirmed.html | `/order/:id/confirmed` | matchstick animation, next steps |
| Journal.html | `/journal`, `/journal/:slug` | featured story, filters, article page |
| Info.html | `/our-story`, `/shipping`, `/returns`, `/privacy`, `/terms`, `/corporate` | one template, side nav |
| Support.html | `/support` | search, topics, track order, FAQ, contact, call-back form with photo |
| SignIn.html | `/sign-in` (also as a modal) | Continue with Google only; guests can browse and buy |
| Favourites.html | `/account` | tabs: Favourites, Orders, Addresses; recently viewed |

The current app has no URL routing (one page plus modals). The new site needs real routes so product and
collection links can be shared and indexed, with Express serving `index.html` for every non-API path.
