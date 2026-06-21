# ShopHero AEO Playbook — Optimize for AI Shopping Agents

> Consulted for "Optimize for AI agents" tasks. **AEO = Agent Engine Optimization**:
> getting your store recommended by AI shopping assistants. Pair with seo_playbook
> + content_strategy. Honor the Brand Kit. Use ONLY accurate data — never fabricate
> reviews, ratings, attributes, or claims.

## Why this matters
Buying is shifting from Google search to AI agents (OpenAI, Anthropic, Google, Amazon, Apple, Shopify). The progression: SEO (rank in Google) → ASO (rank in app stores) → **AEO (get recommended by AI shopping agents)**. Agents don't read banners or ads — they read structured, machine-readable signals and recommend the product/brand they trust. The future buyer prompt isn't a few keywords — it's "buy the best gift for my dad under $200."

## Analyze first
Audit the store's current state before changing anything: product titles/descriptions, structured data (schema), attributes/metafields, review surfacing, FAQs, shipping/returns/warranty clarity, comparison content, and recommendation-matching keywords. Fix the weakest, highest-impact gaps first.

## The levers (what agents weigh)
1. **Rich product data** — descriptive titles + complete descriptions (features, specs, dimensions, materials, origin, warranty, shipping). Pattern: a bare title like "Wireless Headphones" → "Wireless Noise-Cancelling Headphones – 40h Battery – Memory-Foam Over-Ear – Travel Case Included." Lead with what it is, key specs and the buyer benefit.
2. **Structured-data schema** — Product, Offer, Review / AggregateRating, FAQ, Organization, BreadcrumbList. Critical for agents (they read schema, not pixels). Implement or extend it in the theme.
3. **Machine-readable attributes** — material, finish, made-in, style, dimensions, gift type, mounting, edition, etc. Store as **metafields** and render a spec table. Agents compare attributes instantly.
4. **AI-readable FAQs** — per product, answer: who it's for, what problem it solves, how it compares, common objections, materials, shipping time. Use FAQ schema.
5. **Trust & reviews (machine-readable)** — surface rating + count prominently; agents weight review count, quality, recency and sentiment (a product with 1,200 reviews @ 4.7 can beat 2 reviews @ 4.8). *Collecting* reviews needs a reviews app — advise the merchant.
6. **Clear shipping / returns / warranty** — explicit delivery times, return window, warranty, manufacturing time. Agents rank certainty over marketing.
7. **Comparison content** — "X vs Y" pages (e.g. metal vs printed wall art, luxury vs standard gifts) help agents answer buying questions.
8. **Recommendation-prompt keywords** — weave natural buyer phrasing into copy (e.g. "gift for a new parent", "anniversary gift under $100", "durable everyday backpack", "office desk accessory") so agents match how people actually ask.

## What ShopHero does vs advises
- **Directly (theme + Admin API):** query-style product titles; fact-rich descriptions; attribute **metafields** + spec tables; **Google product category** + specific tags; structured-data schema (Product/FAQ/Review) in the theme; self-contained FAQ sections; comparison & buying-guide pages; **use-case sub-collections**; **footer brand statements**; shipping/returns/warranty copy; recommendation-matching keywords. (It can also flag products missing GTINs/attributes.)
- **Advise (merchant action / app / off-site):** install the **Shopify Knowledge Base app**; register **GTINs/UPCs**; set up product feeds (Google Merchant / Meta); collect reviews at scale (reviews app); build brand authority + third-party mentions (Reddit, YouTube, press — agents trust consensus); adopt Shopify's official AI-shopping infrastructure as it ships.

## How AI shopping differs from Google (don't optimize the wrong thing)
Google crawls pages, backlinks and domain authority and ranks a list. AI shopping agents evaluate **product DATA, not website design** (homepage hero, fonts, fancy layouts don't matter to them). Each platform reads differently:
- **ChatGPT** pulls from the **Shopify catalog** — a structured product database (titles, descriptions, attributes, pricing, reviews, policies).
- **Perplexity** does real-time web search + live indexed content.
- **Google AI mode / AI overviews** use both structured feeds *and* crawling.
- **Copilot** has its own approach.
So treat the store as a **database of rich product data** an agent moves through — not a set of pretty pages.

## Priority #1 — the product feed (a "golden record")
This is the single biggest lever; everything else is secondary until it's right. Aim for **99%+ attribute completeness** (every fillable field filled accurately for every product) — industry research links that to **~3–4× higher AI visibility**, and audits have found agents **ignore ~40% of inventory** when attributes/identifiers are missing. Field by field:
- **Titles** must match how a real person asks: "Women's lightweight merino wool hiking socks – medium" — NOT "Alpine Collection Explorer Series." The agent matches the title to the shopper's query.
- **Descriptions** = extractable facts: materials, dimensions, weight, care, who it's for, the problem it solves, how it compares. Every fact is a match point; every gap is one a competitor fills.
- **Identifiers** — GTIN / UPC / MPN / SKU. Agents use these to verify a product is real and cross-reference it. Missing GTIN → treated as unverifiable; advise the merchant to get one.
- **Metafields** — where most stores fall short: fabric composition, country of origin, size charts, compatibility, warranty. More structured attributes = more questions an agent can confidently answer.
- **Google product category** — assign one to every product (drives Google AI mode).
- **Tags** — specific & descriptive ("cotton, unisex, heavyweight, oversized fit"), never generic ("apparel, new arrival").

## The Shopify Knowledge Base app (advise the merchant to install)
Shopify's free **Knowledge Base** app is a **structured data feed straight to AI shopping platforms** (not a customer-facing FAQ page). Load it with verified brand facts — return/shipping policies, sizing, brand story, product care — and AI agents get your verified answer instead of guessing. Bonus: it shows the **actual questions shoppers ask AI about your store** (free market research). ShopHero can't install it for them — tell them to install it, fill every section, and correct the auto-generated facts.

## On-page tactics that actually move AI citations
- **Footer brand statements** — the fastest on-page win: 2–3 clear factual sentences in the site footer (what you sell, who you serve, what makes you different). It's on every page, so every URL becomes a brand-identity signal (tests saw first AI citation in ~14 days).
- **Self-contained FAQ answers** — structured FAQs on product/collection pages, each a **complete, quotable 2–3 sentence answer** (shipping, returns, sizing, compatibility). Don't write paragraphs that need surrounding context.
- **Lead every section with the answer** — the first 1–2 sentences under each H2 should be a standalone quotable fact; agents often extract only a section's opening text. State the core fact, then elaborate.

## Content that gets cited
A study of ~768k AI citations found **over half came from product pages, comparison content, and buying guides** — not blogs, news, or the homepage. So:
- **Use-case specificity wins:** split broad collections into specific pages ("mineral sunscreen for sensitive skin", "for dry skin") — same products, intent-matched language. Boosts both AI citation and long-tail SEO.
- **Comparison & buying-guide content** ("you vs alternative", "best [product] for [use case]", buying guides) is exactly what agents quote.

## What does NOT work (don't waste time)
- **Image alt-text / filenames alone** → no measurable impact on AI citations (still do them for humans/accessibility).
- **llm.txt files** → no measurable impact in testing.
- **Schema markup** helps **Google AI mode / AI overviews** but has little/no impact on ChatGPT/Perplexity/Copilot — still worth it for Google: Product schema (offers: price, availability, brand, aggregate rating), FAQ schema, Review schema. Don't believe "schema gets you cited everywhere."

## Diagnostic — test it in 60 seconds
Open ChatGPT or Perplexity and type a real pre-purchase question for the store ("best organic baby blankets under $60", "stainless mug that keeps coffee hot 12 hours"). If the store isn't in the results, it's a **data problem**, not a traffic or branding problem.

## Priority order (do these first)
1. Install the Shopify **Knowledge Base** app and fill every section.
2. Audit the **top ~20 products to 99% attribute completeness** (titles, descriptions, GTINs, metafields, Google category, tags).
3. Add **2–3 factual brand statements to the footer**.
4. **Check titles against real customer language** (test in ChatGPT/Perplexity; rewrite mismatches).
5. Add a **structured FAQ** (5–7 short self-contained Q&As) to top collection pages.
The window is open now because most brands haven't started; agents develop preferences toward the stores that consistently give them the best data, on a channel growing ~7× year-over-year.

## The mindset
Shift the question from "What does my store say about itself?" to "What does the internet say about my store, and can an AI confidently recommend it?" The brands AI trusts — not the brands with the best ads — will win the agent-driven sales.

## Guardrails
Only structure data that's true. Never invent reviews, ratings, attributes, or guarantees. Keep everything on-brand.
