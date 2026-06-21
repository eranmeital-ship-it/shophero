# ShopHero Product Page Kit

> The section library for building high-converting product pages (PDPs). Loaded on
> demand when the merchant asks to build/rebuild a product page. Use it WITH the
> CRO playbook: cro_playbook = the principles, page_kit = the concrete sections to
> assemble. Always honor the Brand Kit (voice, colors, fonts, do/don'ts).

## How to build a page (process)
1. Read the target product (title, description, price, variants, images, type) via the Shopify tool.
2. Pick the sections below that fit this product (not all are needed). Order them for conversion (see "Recommended order").
3. **Reuse the theme's existing sections/blocks first** — most OS 2.0 themes already have rich-text, icon/column, image-with-text, collapsible-content, and product sections. Add a section *instance* + its settings/blocks in `templates/product.json` (or the relevant product template). Only create a new `sections/*.liquid` (with a proper `{% schema %}`) when the theme has nothing close.
4. Write copy grounded in the CRO playbook + Brand Kit. Rich-text settings must be HTML with top-level `<p>/<ul>/<ol>/<h*>`.
5. Reuse existing `color_scheme` settings — never invent a new palette. Keep edits minimal and valid. Keep all changes in the working copy (they go live only on Apply).
6. Summarize what you added and which theme-editor settings the merchant can tweak.

## Recommended order (top → bottom)
1. Media gallery + buy box (title, price, rating, variants, quantity, **Add to cart**) — above the fold
2. Trust badge row (directly under add-to-cart)
3. Icon guarantees
4. Reasons to buy
5. Key features
6. Comparison table
7. Social proof / reviews
8. FAQ (collapsible)
9. Image-with-text story blocks
10. Bundle / cross-sell

## The sections

### 1. Trust badge row — *under the add-to-cart*
Why: payment/returns/shipping cues at the buy button cut checkout hesitation (CRO #1 lever).
Content: 3–4 short items — "Secure checkout", "Free 30-day returns", "Ships in 2–5 days", "Money-back guarantee". Use only true claims; pull real policy where possible.

### 2. Icon guarantees
Why: scannable benefit/assurance row; reduces perceived risk.
Content: 3–4 icon + 2–4 word label (e.g. ✓ Authentic · ✓ Handmade · ✓ Ships worldwide · ✓ 5-year warranty). Reuse the theme's icon/column or multicolumn section.

### 3. Reasons to buy
Why: benefit-led bullets convert better than feature lists; answer "why this, why now".
Content: 3–5 short benefit statements (outcome-first), each one line, optionally with an icon.

### 4. Product key features
Why: informs without clutter; supports the buying decision.
Content: a compact feature/spec grid (material, size, care, what's included). Skimmable; short labels.

### 5. Comparison table
Why: frames you against the generic alternative; justifies premium pricing.
Content: rows of attributes (quality, materials, guarantee, support) with ✓/✗ for "This product" vs "Typical alternative". Keep honest and specific.

### 6. Social proof
Why: people buy what others buy; numbers + faces beat copy.
Content: rating + review count near the title; a "joined by N+ happy customers" line; optional recent-purchase nudge. Only use real numbers — if none exist, tell the merchant to connect a reviews app rather than inventing them.

### 7. Reviews
Why: the strongest proof; objection-handling reviews pre-empt doubts.
Content: a reviews section showing rating, count, and photos. Highlight "at first I thought X, but actually Y" style reviews. If no reviews source is connected, add the section structure and tell the merchant which app to install — never fabricate reviews.

### 8. FAQ / collapsible content
Why: handles objections inline and keeps the page light (accordion).
Content: 4–6 Q&A built from real objections (shipping, sizing/fit, returns, materials, care). Reuse the theme's collapsible-content section.

### 9. Image-with-text story blocks
Why: shows the product in context, builds desire and brand story.
Content: 1–3 alternating image/text blocks — benefit or story per block, each with one clear point. Reuse the theme's image-with-text section.

### 10. Bundle / cross-sell
Why: lifts AOV (price-chunking / "yes loop").
Content: a "frequently bought together" or "complete the set" prompt with a complementary product. Theme-side presentation only — actual cart bundles may need an app; tell the merchant if so.

### Optional: sticky add-to-cart (mobile)
Why: every-second-of-scroll the buy button is one tap away → more conversions.
Content: a small sticky bar on mobile with product name, price, and Add to cart. Implement with minimal CSS/JS; keep the hero/LCP image eager. Never alter checkout.

### Optional: announcement / marquee text
Why: communicates the offer (free shipping, sale) without stealing attention.
Content: a thin scrolling or static bar with one message linking to the offer.

## Proven high-converting PDP patterns (studied from top DTC stores)
Apply the ones that fit the product. Use ONLY true claims/numbers — never fabricate reviews, ratings, scarcity, or "as seen on".

### Buy-box anatomy (above the fold), in order
- Title, then **star rating + review count** right under it (linked to reviews).
- One-line **benefit subhead** (the outcome).
- The **offer block** (below) — the single biggest lever.
- **Variant / quantity / subscription selector.**
- **Price with strikethrough MSRP + “% OFF” + “you save $X.”**
- Big **high-contrast CTA stating the action + price** ("BUY NOW – $19.99"); first-person/benefit CTAs convert well ("Yes, I want this!").
- **Free-shipping / guarantee line** directly under the CTA.
- **Trust row:** secure-checkout + payment/security badges, money-back guarantee.

### Offer architecture — pick the model that fits
- **Consumables → subscription-first:** "Subscribe & Save" as the *default selected* option with escalating discounts (e.g. 1-mo 20% / 3-mo 25% / 6-mo 30%), a **"MOST POPULAR"** tag on the middle tier, "pause/cancel anytime"; one-time purchase de-emphasized below.
- **Bundleable goods → quantity tiers:** Buy 1/2/4/6/12 with escalating % off, a **pre-selected "MOST POPULAR / BEST VALUE"** tier, "BEST DEAL" on the top tier, and **free shipping unlocked** at higher quantities. Show per-unit price + total + savings.
- **Value stacking → free gifts:** visibly show the bonuses unlocked with the order ("4 FREE gifts", each a small card with its $ value) + "order by [date] for free gifts".
- **Order bump / pre-checked add-on:** a complementary add-on in the buy box, pre-checked, at a discount ("Add 2 extra pillowcases $44 ~~$61~~").
- **Pre-applied discount:** surface "X% OFF COUPON APPLIED" / auto-applied savings so the deal feels live.

### Honest urgency & scarcity (only when true)
Countdown to a real sale end, "ships by [date]", "X left at this price", a genuinely out-of-stock tier. Never fake timers or stock.

### Social proof (real only)
Big real numbers ("1,500,000+ protected", "35,000+ reviews", "10,000+ sold/month", "trusted by 23,000+"); rating + count near the title; verified-buyer reviews **with photos**; before/after (beauty/health); UGC; an expert/authority endorsement (dermatologist, specialist, etc.).

### Trust signals
"AS SEEN ON" press logos (real); money-back guarantee badge; free shipping & returns; third-party/lab testing; certifications + a **free-from icon row** (dairy-free, gluten-free, etc.); origin ("Made in USA").

### Copy
Benefit-led outcome headline + checkmark benefit bullets (with real stats where available); problem→solution framing; handle objections inline ("This is NOT a subscription", "no harsh stimulants").

### Below the fold (long-form), in order
how-it-works steps → feature/ingredient deep-dive (specifics + dosages) → comparison table (you vs the typical alternative) → results timeline → reviews → FAQ accordion.

### Mobile
Keep the buy box, offer and CTA prominent when stacked; add a **sticky add-to-cart** bar; swatches and tiers must be tap-friendly.

## Guardrails
- Never invent reviews, ratings, "X people bought", or guarantees you can't back up — propose the structure and name the app/setup if data is missing.
- Never publish, change the live theme, or touch checkout. Stage everything for Apply.
- Match the Brand Kit; reuse existing color schemes, fonts, and sections; keep the page fast (lazy-load offscreen images).
