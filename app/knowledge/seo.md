# ShopHero SEO Playbook (deep)

> Consulted for SEO tasks. On-page + technical + content SEO for Shopify. Pair
> with content_strategy for blog work. Honor the Brand Kit.

## Always analyze first
Read the current titles, meta descriptions, headings, alt text, product/collection copy and existing content before changing anything. Fix what's weakest first.

## On-page essentials
- **Title tag:** unique, ≤ ~60 chars, primary keyword near the front, brand at the end.
- **Meta description:** ≤ ~155 chars, benefit + keyword + a soft CTA (drives CTR, not ranking).
- **One H1** per page; logical H2/H3 outline.
- **Image alt text** (descriptive, keyword-aware) + sensible file names.
- **Internal linking:** link content → relevant PDPs/collections with descriptive anchor text.

## Keyword strategy
- Match **intent**: informational (guides), commercial ("best X"), transactional (product/collection). One primary + a few secondary keywords per page.
- **Avoid cannibalization:** don't target the same keyword on multiple pages; map keywords → pages.
- Long-tail for products ("24k gold Jerusalem wall art"), head terms for collections.

## Product pages
- **Unique descriptions** — never manufacturer boilerplate (duplicate-content risk). Keyword in title, H1 and first paragraph.
- Reviews/UGC add fresh content + can power review structured data.
- Complete specs answer buyer + search queries.

## Collections
- Keyword-rich intro copy near the top; internal links to key products.
- Avoid thin/duplicate collections and tag-generated pages that create near-duplicates.

## Technical (Shopify specifics)
- **Structured data:** Product, Article, BreadcrumbList, Organization, and FAQ where relevant (many themes include some — verify/extend).
- **Canonicals:** Shopify exposes products under `/products/x` and `/collections/y/products/x`; ensure the canonical points to `/products/x` to avoid duplicates.
- Clean handles/URLs; fix broken links with 301 redirects; keep the sitemap healthy; ensure pages are crawlable (no accidental noindex).
- **Speed + mobile** are ranking factors — coordinate with speed work.

## Is SEO worth it here? (sanity check first)
SEO is either a top profitable channel or a waste — little middle ground. Lean in when there's **existing demand** (people already Google the category) and decent AOV/margin. Deprioritize if it's a brand-new product nobody searches for, AOV is tiny / margins razor-thin, or the category is rarely searched. Always chase **buyer-intent (bottom-funnel) keywords**, not vanity traffic — ranking #1 for the wrong term earns nothing.

## Keyword research workflow
1. Brainstorm how a buyer would search ("handmade soap", "vegan hot sauce").
2. Pull volumes in **Google Keyword Planner** (free) or Ahrefs/Semrush; in those tools set **difficulty < 35** and filter for **commercial/transactional intent**.
3. Target the **sweet spot: high volume + low competition**; favor **long-tail** ("gluten-free hot sauce for sandwiches") — easier to rank, higher intent.
4. Per page: **one primary + ~2 supporting** keywords. **One primary keyword per page** — never the same term on a product *and* a collection (cannibalization tanks both).
5. **Check the SERP** for the term: collection pages ranking → build a collection; blogs ranking → write a blog; all giant brands → pick an easier term.
6. Map **keyword type → page:** transactional → product/collection pages; informational ("how to / best / why") → blog content.

## On-page placement (where the keywords go)
Primary + supporting keywords belong in: the **title tag**, the **H1**, the **first paragraph + body** (readable, never stuffed), the **meta description** (+ a CTA for click-through), the **URL handle**, and **image alt text**. For multiple images of one product, vary alt by angle ("avocado soap – front", "– back close-up") so they're not duplicates. Set the **homepage title + meta** (with a CTA) too.

## Collection & sub-collection expansion (rank for many terms with the same products)
Don't bet everything on one broad collection ("hoodies"). Create **sub-collections per demand variation** — "men's hoodies", "oversized hoodies", "zip hoodies", "hoodies under $50" — often reusing the same products, just worded to match how people search. You trade one ultra-competitive term for dozens of easier, higher-intent ones. (Also the top pattern for AI citation — see aeo_playbook.)

## Internal linking system (high-leverage, free)
- Blogs link **into money pages** (key collections/products) within the **first 100–200 words**, plus **3–5 links** to related posts later.
- Link **general → specific** (a collection → its sub-collections).
- **Anchor text** = 2–4 descriptive words matching the target ("hair-loss collagen"), never "click here" or the bare brand name.
- Goal: every important page is linked; the site becomes a web that passes authority to money pages and keeps visitors moving toward purchase.

## Speed & engagement (ranking factors)
- **Speed:** remove unused apps (biggest culprit), compress/lazy-load images, use **lightweight video embeds** (not raw YouTube iframes); check Shopify's **store speed report**.
- **Engagement:** bounces hurt rankings — keep pages useful, skimmable and on-intent (snappy homepage: image + one line + CTA, not two long paragraphs).

## Technical setup checklist
- Submit the auto-generated **`/sitemap.xml` to Google Search Console**.
- Pick ONE canonical domain (**www vs non-www**) and 301-redirect the other (Shopify usually does this) so authority isn't split.
- Clean handles, fix broken links with 301s, no accidental noindex, mobile-friendly.

## Avoid
Keyword stuffing (Google penalizes it), hidden text, thin/duplicate content, manufacturer copy, ignoring mobile, orphan pages, ranking for no-intent terms, a split domain, and a slow site bloated with unused apps.

## Technical SEO audit checklist (detect → why it matters → how to fix)
Run through these the way a professional crawler (Semrush/Screaming Frog) does. For each, find the affected pages, explain the impact in plain English, then fix. Group by severity.

**Errors (fix first — they directly hurt ranking/indexing):**
- **Missing or duplicate title tags** — search engines can't tell pages apart; duplicates split ranking and risk being filtered. Fix: a unique, ≤60-char, keyword-front title per page.
- **Missing meta descriptions / duplicates** — hurts click-through (Google writes its own snippet). Fix: a unique ≤155-char benefit+keyword+CTA description per page.
- **Missing / empty / multiple H1** — breaks heading hierarchy and topical signal. Fix: exactly one descriptive H1 per page.
- **Duplicate H1 == title** — wasted keyword opportunity, looks over-optimized. Fix: differentiate them.
- **Duplicate content (>85% identical)** — Google indexes one and may drop the rest. Fix: rel="canonical" to the primary, 301 dupes, or make copy unique (never manufacturer boilerplate).
- **Broken internal links / 4xx pages** — dead ends for users and crawlers, leaked link equity. Fix: repair or 301-redirect.
- **Large HTML size (>2 MB) / uncompressed pages** — slow load → lower ranking + worse UX. Fix: trim inline scripts/styles, enable compression (overlaps speed_playbook).

**Warnings (fix next):**
- **Images missing alt text** — lost image-search ranking + accessibility + weaker AEO signals. Fix: descriptive, keyword-aware alt per image (vary by angle).
- **Low word count (<200) / low text-to-HTML ratio (<10%)** — thin content ranks poorly. Fix: expand with genuinely useful, on-intent copy.
- **Missing / mis-set hreflang & lang** — wrong language version shown for multi-market stores. Fix: correct lang on <html> and hreflang with absolute 200-status URLs.
- **Links with no / non-descriptive anchor text** — lost internal-link signal. Fix: 2–4 word descriptive anchors to money pages.

**Notices (polish):**
- **Missing sitemap.xml / not in robots.txt** — Shopify auto-generates `/sitemap.xml`; verify it's submitted to Search Console and referenced in robots.txt.
- **Pages with only one / no incoming internal links (orphans)** — hard to discover. Fix: add internal links from related content.
- **Blocked resources / pages blocked from crawling** — verify nothing important is disallowed.

Reality check: even billion-dollar stores carry huge SEO debt (a top brand's crawl showed 1,600+ errors), so there is almost always high-impact, fixable work here. Always report issues as a ranked list (issue · # of pages · why · fix), fix the errors first, and tie fixes back to revenue.

## Off-page / link building (advise — ShopHero can't build links)
Backlinks = other sites pointing to yours; Google reads them as trust. **Quality + relevance beat quantity** (a Time link ≫ random directories). Recommend:
- **Foundational links:** social profiles, business/niche directories, and a **Google Business Profile** (helps local SEO + discoverability).
- **Gift guides:** pitch publishers to include the product in seasonal/holiday roundups.
- **PR / own publicity:** pitch bloggers & journalists a genuine story (no costly agency needed); target relevant publications; lead with a compelling brand narrative.
- **Partnerships:** value-exchange with non-competing sites in the niche.
ShopHero does all on-page/technical; off-site outreach is the merchant's action.
