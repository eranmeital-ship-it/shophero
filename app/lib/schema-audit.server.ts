import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gql } from "./onboarding.server";

/**
 * Schema / AI-Readiness audit. Unlike snapshot tools (SuperSchema et al.) that
 * grade a one-off LLM guess, this grades the LIVE truth:
 *   1. Is our deterministic JSON-LD snippet actually installed in <head>?
 *   2. How complete is the underlying store DATA the schema renders from
 *      (logo, social links, product vendor/SKU/GTIN, review ratings)?
 *   3. Does the schema actually RENDER on the live storefront (we fetch it and
 *      extract the real <script type="application/ld+json"> blocks)?
 * Everything is deterministic — zero AI cost — and the score reflects reality,
 * so fixing a gap permanently raises it (we fix the source, not a snapshot).
 */

export interface SchemaCheck {
  key: string;
  label: string;
  weight: number;
  status: "pass" | "partial" | "fail" | "unknown" | "todo";
  score: number; // earned, 0..weight
  detail: string;
  who: "ai" | "you"; // can ShopHero fix it, or must the merchant?
  how?: string; // guidance for "you" items
  fix?: { label: string; href?: string; action?: string };
}

export interface CoverageRow {
  pageType: string;
  types: string[];
  status: "active" | "inactive";
}

export interface AeoStep {
  key: string;
  title: string;
  subtitle: string;
  intro: string; // the "bible" — Ethan Smith's AEO playbook for this step
  scored: boolean; // false = guided, not auto-measurable (off-site)
  items: SchemaCheck[];
}

export interface SchemaAudit {
  score: number; // 0-100
  grade: "Excellent" | "Good" | "Fair" | "Needs work";
  installed: boolean;
  checks: SchemaCheck[];
  coverage: CoverageRow[];
  steps: AeoStep[];
  live: { verified: boolean; url?: string; detectedTypes?: string[]; note?: string };
}

function gradeFor(score: number): SchemaAudit["grade"] {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs work";
}

// Pull @type values out of every JSON-LD block in an HTML string.
function extractLdTypes(html: string): string[] {
  const types = new Set<string>();
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const json = JSON.parse(m[1].trim());
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
          const t = (node as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          Object.values(node as Record<string, unknown>).forEach(walk);
        }
      };
      walk(json);
    } catch {
      /* ignore an unparseable block */
    }
  }
  return [...types];
}

async function fetchHtml(url: string): Promise<{ html?: string; passwordProtected?: boolean; error?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "ShopHero-SchemaAudit/1.0" }, redirect: "follow" });
    clearTimeout(t);
    const html = await res.text();
    const finalUrl = res.url || url;
    if (/\/password(\?|$)/i.test(finalUrl) || /name=["']password["']|Enter store using password|store is password protected/i.test(html)) {
      return { passwordProtected: true };
    }
    return { html };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface ProductNode {
  handle?: string;
  vendor?: string;
  descriptionHtml?: string | null;
  featuredImage?: { url?: string } | null;
  variants?: { nodes?: { sku?: string | null; barcode?: string | null }[] };
  rating?: { value?: string } | null;
  ratingCount?: { value?: string } | null;
}

export async function auditSchema(admin: AdminApiContext, dir: string): Promise<SchemaAudit> {
  // 1. Installed? — snippet referenced from the layout head.
  let installed = false;
  try {
    const layout = await readFile(path.join(dir, "layout", "theme.liquid"), "utf8");
    installed = layout.includes("sh-structured-data");
  } catch {
    /* layout unreadable → treat as not installed */
  }

  // FAQ section present (it emits FAQPage)?
  let faqPresent = false;
  try {
    await readFile(path.join(dir, "sections", "sh-faq.liquid"), "utf8");
    faqPresent = true;
  } catch {
    /* no FAQ section */
  }

  // Social links live in theme settings, not the Admin API.
  let socialCount = 0;
  try {
    const raw = await readFile(path.join(dir, "config", "settings_data.json"), "utf8");
    const matches = raw.match(/"social_[a-z]+_link"\s*:\s*"([^"]+)"/gi) ?? [];
    socialCount = matches.length;
  } catch {
    /* no settings file */
  }

  // 2. Live store data.
  const shopData = await gql<{ shop?: { name?: string; myshopifyDomain?: string; primaryDomain?: { url?: string }; brand?: { logo?: { image?: { url?: string } } | null; shortDescription?: string | null } } }>(
    admin,
    `{ shop { name myshopifyDomain primaryDomain { url } brand { logo { image { url } } shortDescription } } }`,
  );
  const shop = shopData?.shop;
  const storeHandle = (shop?.myshopifyDomain ?? "").replace(/\.myshopify\.com$/i, "");
  const adminUrl = (p: string) => (storeHandle ? `https://admin.shopify.com/store/${storeHandle}/${p}` : undefined);

  const hasLogo = !!shop?.brand?.logo?.image?.url;
  const hasDescription = !!(shop?.brand?.shortDescription && shop.brand.shortDescription.trim());

  const prodData = await gql<{ products?: { nodes?: ProductNode[] } }>(
    admin,
    `{ products(first: 12) { nodes { handle vendor descriptionHtml featuredImage { url } variants(first: 1) { nodes { sku barcode } } rating: metafield(namespace: "reviews", key: "rating") { value } ratingCount: metafield(namespace: "reviews", key: "rating_count") { value } } } }`,
  );
  const products = prodData?.products?.nodes ?? [];
  const total = products.length;
  const frac = (n: number) => (total ? n / total : 0);
  const nVendor = products.filter((p) => p.vendor && p.vendor.trim()).length;
  const nSku = products.filter((p) => p.variants?.nodes?.[0]?.sku).length;
  const nGtin = products.filter((p) => p.variants?.nodes?.[0]?.barcode).length;
  const nRating = products.filter((p) => p.rating?.value).length;
  const nDesc = products.filter((p) => (p.descriptionHtml ?? "").replace(/<[^>]*>/g, "").trim().length >= 120).length;

  // Published answer content (blog articles) — long-tail AEO surface.
  const blogData = await gql<{ blogs?: { nodes?: { articlesCount?: { count?: number } }[] } }>(
    admin,
    `{ blogs(first: 10) { nodes { articlesCount { count } } } }`,
  );
  const articleCount = (blogData?.blogs?.nodes ?? []).reduce((s, b) => s + (b.articlesCount?.count ?? 0), 0);

  // 3. Live verification — fetch the storefront and extract real JSON-LD.
  const storeUrl = shop?.primaryDomain?.url;
  const live: SchemaAudit["live"] = { verified: false, url: storeUrl };
  if (storeUrl) {
    const home = await fetchHtml(storeUrl);
    if (home.passwordProtected) {
      live.note = "Your storefront is password-protected, so we can't verify live yet — it'll verify automatically once the store is public.";
    } else if (home.html) {
      const types = new Set(extractLdTypes(home.html));
      const sampleHandle = products[0]?.handle;
      if (sampleHandle) {
        const prod = await fetchHtml(`${storeUrl.replace(/\/$/, "")}/products/${sampleHandle}`);
        if (prod.html) extractLdTypes(prod.html).forEach((t) => types.add(t));
      }
      live.detectedTypes = [...types];
      live.verified = types.has("Organization") || types.has("Product") || types.has("WebSite");
      if (!live.verified) live.note = "We couldn't detect JSON-LD on the live page — make sure the structured-data change is published.";
    } else {
      live.note = home.error ? `Couldn't reach the storefront (${home.error}).` : "Couldn't reach the storefront.";
    }
  } else {
    live.note = "No published storefront domain found yet.";
  }

  // ── Scored checklist — Steps 1 & 2 (auto-measurable). Weights sum to 100. ──
  const liveStatus: SchemaCheck["status"] = live.verified ? "pass" : live.note?.includes("password") && installed ? "partial" : "fail";

  const foundation: SchemaCheck[] = [
    {
      key: "installed", label: "Structured data installed in <head>", weight: 24, who: "ai",
      status: installed ? "pass" : "fail", score: installed ? 24 : 0,
      detail: installed ? "Your JSON-LD snippet is wired into the theme layout — Organization, WebSite, Product, Breadcrumbs, Collection, Article all emit." : "The JSON-LD snippet isn't on your theme yet — nothing is emitted. One click and we add it.",
      fix: installed ? undefined : { label: "Install schema for me", action: "install" },
    },
    {
      key: "logo", label: "Brand logo (Organization)", weight: 6, who: "you",
      status: hasLogo ? "pass" : "fail", score: hasLogo ? 6 : 0,
      detail: hasLogo ? "Your logo is set and included in Organization schema." : "No brand logo set — Google and AI show it in knowledge panels and answers.",
      how: "In Shopify admin → Settings → Brand, upload your logo. Then come back and hit Re-scan.",
      fix: hasLogo ? undefined : { label: "Open Brand settings", href: adminUrl("settings/brand") },
    },
    {
      key: "description", label: "Brand description (Organization)", weight: 5, who: "you",
      status: hasDescription ? "pass" : "fail", score: hasDescription ? 5 : 0,
      detail: hasDescription ? "Your brand description enriches Organization schema." : "Add a short brand description so AI can summarize who you are.",
      how: "Shopify admin → Settings → Brand → 'Short description'. Then Re-scan.",
      fix: hasDescription ? undefined : { label: "Open Brand settings", href: adminUrl("settings/brand") },
    },
    {
      key: "social", label: "Social profiles (sameAs)", weight: 7, who: "you",
      status: socialCount >= 2 ? "pass" : socialCount === 1 ? "partial" : "fail", score: socialCount >= 2 ? 7 : socialCount === 1 ? 3 : 0,
      detail: socialCount > 0 ? `${socialCount} social link${socialCount > 1 ? "s" : ""} connected via sameAs — this ties your store to its social/AI identity.` : "No social links set — sameAs links your store to its known profiles, a strong authority signal.",
      how: "Theme editor → Theme settings → Social media. Add at least your Instagram + one more, then Re-scan.",
      fix: socialCount >= 2 ? undefined : { label: "Open theme settings", href: adminUrl("themes") },
    },
    {
      key: "vendor", label: "Product brand / vendor", weight: 5, who: "you",
      status: frac(nVendor) >= 0.9 ? "pass" : nVendor > 0 ? "partial" : "fail", score: Math.round(5 * frac(nVendor)),
      detail: total ? `${nVendor}/${total} products have a vendor (maps to Product → brand in schema).` : "No products to check yet.",
      how: "Open a product in Shopify admin and set the 'Vendor' field. Then Re-scan.",
      fix: frac(nVendor) >= 0.9 ? undefined : { label: "Open Products", href: adminUrl("products") },
    },
    {
      key: "sku", label: "Product SKU", weight: 5, who: "you",
      status: frac(nSku) >= 0.9 ? "pass" : nSku > 0 ? "partial" : "fail", score: Math.round(5 * frac(nSku)),
      detail: total ? `${nSku}/${total} products have a SKU.` : "No products to check yet.",
      how: "Product → Variants → set SKU under Inventory. Then Re-scan.",
      fix: frac(nSku) >= 0.9 ? undefined : { label: "Open Products", href: adminUrl("products") },
    },
    {
      key: "gtin", label: "Product GTIN / barcode", weight: 5, who: "you",
      status: frac(nGtin) >= 0.9 ? "pass" : nGtin > 0 ? "partial" : "fail", score: Math.round(5 * frac(nGtin)),
      detail: total ? `${nGtin}/${total} products have a barcode (GTIN unlocks richer shopping results).` : "No products to check yet.",
      how: "Product → Variants → Barcode (ISBN, UPC, GTIN). Then Re-scan.",
      fix: frac(nGtin) >= 0.9 ? undefined : { label: "Open Products", href: adminUrl("products") },
    },
    {
      key: "ratings", label: "Product ratings (AggregateRating)", weight: 7, who: "you",
      status: nRating > 0 ? (frac(nRating) >= 0.5 ? "pass" : "partial") : "fail", score: Math.round(7 * Math.min(1, frac(nRating) * 1.5)),
      detail: nRating > 0 ? `${nRating}/${total} products have review ratings — shown as star snippets in search & AI.` : "No review ratings found. Install a reviews app — ShopHero auto-adds star ratings (we read the reviews.rating metafield, no extra setup).",
      how: "Install a reviews app (Judge.me, Loox, or Shopify Product Reviews). Once it writes the reviews.rating metafield, Re-scan and ratings light up automatically.",
      fix: nRating > 0 ? undefined : { label: "Browse reviews apps", href: "https://apps.shopify.com/categories/marketing-and-conversion-social-proof-product-reviews" },
    },
    {
      key: "live", label: "Verified rendering on your live store", weight: 10, who: "ai",
      status: liveStatus, score: liveStatus === "pass" ? 10 : liveStatus === "partial" ? 5 : 0,
      detail: live.verified ? `Confirmed live: ${(live.detectedTypes ?? []).join(", ")}.` : live.note ?? "Not verified on the live store yet — publish your changes, then Re-scan.",
    },
  ];

  const answers: SchemaCheck[] = [
    {
      key: "faq", label: "FAQ schema (FAQPage)", weight: 8, who: "ai",
      status: faqPresent ? "pass" : "fail", score: faqPresent ? 8 : 0,
      detail: faqPresent ? "Your FAQ section emits FAQPage schema — eligible for FAQ rich results and quoted directly by AI assistants." : "No FAQ yet. The #1 AEO move: answer the exact questions buyers ask. We'll add a theme-matched FAQ that also emits FAQ schema.",
      fix: faqPresent ? undefined : { label: "Add an FAQ for me", action: "add-faq" },
    },
    {
      key: "descriptions", label: "Rich product descriptions", weight: 10, who: "ai",
      status: frac(nDesc) >= 0.8 ? "pass" : nDesc > 0 ? "partial" : "fail", score: Math.round(10 * frac(nDesc)),
      detail: total ? `${nDesc}/${total} products have a substantial description. LLMs answer "does it have X?" from your copy — thin descriptions get skipped.` : "No products to check yet.",
      fix: frac(nDesc) >= 0.8 ? undefined : { label: "Write descriptions for me", action: "write-descriptions" },
    },
    {
      key: "answers", label: "Published answer content (blog / guides)", weight: 8, who: "ai",
      status: articleCount >= 5 ? "pass" : articleCount > 0 ? "partial" : "fail", score: articleCount >= 5 ? 8 : articleCount > 0 ? 4 : 0,
      detail: articleCount > 0 ? `${articleCount} article${articleCount === 1 ? "" : "s"} published. The long tail of AI prompts (~60 words, hyper-specific) is won by pages that answer those exact questions.` : "No articles yet. Buyers ask AI ultra-specific questions — guides & comparisons that answer them get cited.",
      fix: articleCount >= 5 ? undefined : { label: "Write answer content for me", action: "write-content" },
    },
  ];

  const score = Math.round([...foundation, ...answers].reduce((s, c) => s + c.score, 0));

  // ── Steps 3 & 4 — guided (off-site can't be auto-measured; you drive it). ──
  const offsite: SchemaCheck[] = [
    {
      key: "prompts", label: "Build your target question list", weight: 0, who: "you", status: "todo", score: 0,
      detail: "AI assistants turn keywords into questions. Win the questions that buyers actually ask about your category.",
      how: "Take your money keywords (or a competitor's paid-search terms), ask ChatGPT to rewrite them as buyer questions, and keep the 10–20 that match what you sell. ShopHero can also turn your products into a starter list.",
      fix: { label: "Generate a starter list", action: "write-content" },
    },
    {
      key: "citations", label: "Find where AI already gets its answers", weight: 0, who: "you", status: "todo", score: 0,
      detail: "In LLMs only the specific URLs cited for your target prompts matter — not generic domain authority. Find them, then get mentioned there.",
      how: "Paste your target questions into ChatGPT & Gemini and note which pages they cite (use scraped data, not API). For most stores the recurring sources are Reddit, YouTube, affiliate roundups and niche blogs.",
    },
    {
      key: "mentions", label: "Earn mentions on those sources", weight: 0, who: "you", status: "todo", score: 0,
      detail: "It's mentions, not links: your brand named in a bulleted/numbered list on a cited page is what wins. Early-stage stores can win fast here — you can get cited within days.",
      how: "Get your store named on the recurring sources: answer relevant Reddit threads honestly, get into 'best X' roundups, seed a YouTube review, pitch affiliate/blog lists. Aim to be one named option among several.",
      fix: { label: "Open Reddit", href: "https://www.reddit.com/" },
    },
  ];

  const verify: SchemaCheck[] = [
    {
      key: "verify-tool", label: "Validate in Google's Rich Results Test", weight: 0, who: "you", status: "todo", score: 0,
      detail: "Confirm Google parses your schema cleanly — zero errors means you're eligible for rich results.",
      how: "Open the validators below with your live URL, fix any errors, then Re-scan here.",
      fix: live.url ? { label: "Open Rich Results Test", href: `https://search.google.com/test/rich-results?url=${encodeURIComponent(live.url)}` } : undefined,
    },
    {
      key: "experiment", label: "Track & experiment", weight: 0, who: "you", status: "todo", score: 0,
      detail: "AEO is hard to test — the winners run experiments and reproduce what works. Re-scan after each change and watch which prompts start citing you.",
      how: "Check your target questions in ChatGPT/Gemini every couple of weeks. When you start getting cited, double down on whatever you changed.",
    },
  ];

  const steps: AeoStep[] = [
    {
      key: "foundation", title: "Foundation", subtitle: "Make your store machine-readable",
      intro: "AI can only recommend what it can read. Per Ethan Smith's playbook, the only technical things that actually move the needle are schema markup, internal links, and a page bots can render — that's it. ShopHero handles the schema automatically; the rest is filling in your real product data.",
      scored: true, items: foundation,
    },
    {
      key: "answers", title: "Answers", subtitle: "Answer the questions buyers actually ask",
      intro: "This is where SEO and AEO overlap — and most AEO wins come from doing this well 'for free'. The average AI prompt is ~60 words and hyper-specific, so the store with a page that answers that exact question wins. FAQs, rich descriptions and guides are your surface area.",
      scored: true, items: answers,
    },
    {
      key: "offsite", title: "Citations", subtitle: "Get mentioned where AI looks (off-site)",
      intro: "The one thing that's genuinely different from SEO: LLMs cite mentions, not links — and only the specific URLs that show up for your prompts. This work is yours to drive (we guide it), but early-stage stores can win here in days, not years.",
      scored: false, items: offsite,
    },
    {
      key: "verify", title: "Verify", subtitle: "Validate, then keep testing",
      intro: "Confirm everything parses, then treat AEO as an experiment loop. Re-scan after each change to watch your score climb and your live coverage fill in.",
      scored: false, items: verify,
    },
  ];

  const checks = [...foundation, ...answers];

  const coverage: CoverageRow[] = [
    { pageType: "Home", types: ["Organization", "WebSite", "SearchAction"], status: installed ? "active" : "inactive" },
    { pageType: "Product", types: ["Product", "Offer", "BreadcrumbList", ...(nRating > 0 ? ["AggregateRating"] : [])], status: installed ? "active" : "inactive" },
    { pageType: "Collection", types: ["CollectionPage", "ItemList", "BreadcrumbList"], status: installed ? "active" : "inactive" },
    { pageType: "Blog article", types: ["BlogPosting", "BreadcrumbList"], status: installed ? "active" : "inactive" },
    { pageType: "Pages", types: ["WebPage"], status: installed ? "active" : "inactive" },
    { pageType: "FAQ", types: ["FAQPage"], status: faqPresent ? "active" : "inactive" },
  ];

  return { score, grade: gradeFor(score), installed, checks, coverage, steps, live };
}
