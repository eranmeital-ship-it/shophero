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
  status: "pass" | "partial" | "fail" | "unknown";
  score: number; // earned, 0..weight
  detail: string;
  fix?: { label: string; href?: string; action?: string };
}

export interface CoverageRow {
  pageType: string;
  types: string[];
  status: "active" | "inactive";
}

export interface SchemaAudit {
  score: number; // 0-100
  grade: "Excellent" | "Good" | "Fair" | "Needs work";
  installed: boolean;
  checks: SchemaCheck[];
  coverage: CoverageRow[];
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
    `{ products(first: 12) { nodes { handle vendor featuredImage { url } variants(first: 1) { nodes { sku barcode } } rating: metafield(namespace: "reviews", key: "rating") { value } ratingCount: metafield(namespace: "reviews", key: "rating_count") { value } } } }`,
  );
  const products = prodData?.products?.nodes ?? [];
  const total = products.length;
  const frac = (n: number) => (total ? n / total : 0);
  const nVendor = products.filter((p) => p.vendor && p.vendor.trim()).length;
  const nSku = products.filter((p) => p.variants?.nodes?.[0]?.sku).length;
  const nGtin = products.filter((p) => p.variants?.nodes?.[0]?.barcode).length;
  const nRating = products.filter((p) => p.rating?.value).length;

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

  // ── Weighted checklist (weights sum to 100) ────────────────────────────────
  const checks: SchemaCheck[] = [];
  const add = (c: SchemaCheck) => checks.push(c);

  add({
    key: "installed",
    label: "Structured data installed in <head>",
    weight: 30,
    status: installed ? "pass" : "fail",
    score: installed ? 30 : 0,
    detail: installed ? "Our JSON-LD snippet is wired into your theme layout." : "The JSON-LD snippet isn't on your theme yet — nothing is emitted.",
    fix: installed ? undefined : { label: "Install structured data", action: "install" },
  });

  add({
    key: "logo",
    label: "Brand logo (Organization)",
    weight: 8,
    status: hasLogo ? "pass" : "fail",
    score: hasLogo ? 8 : 0,
    detail: hasLogo ? "Your logo is set and included in Organization schema." : "No brand logo set — Google shows it in knowledge panels and AI answers.",
    fix: hasLogo ? undefined : { label: "Add a logo", href: adminUrl("settings/brand") },
  });

  add({
    key: "description",
    label: "Brand description (Organization)",
    weight: 6,
    status: hasDescription ? "pass" : "fail",
    score: hasDescription ? 6 : 0,
    detail: hasDescription ? "Your brand description enriches Organization schema." : "Add a short brand description so AI can summarize who you are.",
    fix: hasDescription ? undefined : { label: "Add a description", href: adminUrl("settings/brand") },
  });

  add({
    key: "social",
    label: "Social profiles (sameAs)",
    weight: 8,
    status: socialCount >= 2 ? "pass" : socialCount === 1 ? "partial" : "fail",
    score: socialCount >= 2 ? 8 : socialCount === 1 ? 4 : 0,
    detail: socialCount > 0 ? `${socialCount} social link${socialCount > 1 ? "s" : ""} connected via sameAs.` : "No social links set — sameAs ties your store to its social/AI identity.",
    fix: socialCount >= 2 ? undefined : { label: "Add social links in theme settings", href: adminUrl("themes") },
  });

  add({
    key: "vendor",
    label: "Product brand / vendor",
    weight: 6,
    status: frac(nVendor) >= 0.9 ? "pass" : nVendor > 0 ? "partial" : "fail",
    score: Math.round(6 * frac(nVendor)),
    detail: total ? `${nVendor}/${total} products have a vendor (maps to Product → brand).` : "No products found to check.",
    fix: frac(nVendor) >= 0.9 ? undefined : { label: "Set product vendors", href: adminUrl("products") },
  });

  add({
    key: "sku",
    label: "Product SKU",
    weight: 6,
    status: frac(nSku) >= 0.9 ? "pass" : nSku > 0 ? "partial" : "fail",
    score: Math.round(6 * frac(nSku)),
    detail: total ? `${nSku}/${total} products have a SKU.` : "No products found to check.",
    fix: frac(nSku) >= 0.9 ? undefined : { label: "Add SKUs to products", href: adminUrl("products") },
  });

  add({
    key: "gtin",
    label: "Product GTIN / barcode",
    weight: 6,
    status: frac(nGtin) >= 0.9 ? "pass" : nGtin > 0 ? "partial" : "fail",
    score: Math.round(6 * frac(nGtin)),
    detail: total ? `${nGtin}/${total} products have a barcode (GTIN unlocks richer shopping results).` : "No products found to check.",
    fix: frac(nGtin) >= 0.9 ? undefined : { label: "Add barcodes to products", href: adminUrl("products") },
  });

  add({
    key: "ratings",
    label: "Product ratings (AggregateRating)",
    weight: 12,
    status: nRating > 0 ? (frac(nRating) >= 0.5 ? "pass" : "partial") : "fail",
    score: Math.round(12 * Math.min(1, frac(nRating) * 1.5)),
    detail: nRating > 0 ? `${nRating}/${total} products have review ratings — shown as star snippets.` : "No review ratings found. Install a reviews app and ShopHero auto-adds star ratings (we read the reviews.rating metafield).",
    fix: nRating > 0 ? undefined : { label: "Add product reviews", href: "https://apps.shopify.com/categories/marketing-and-conversion-social-proof-product-reviews" },
  });

  add({
    key: "faq",
    label: "FAQ schema (FAQPage)",
    weight: 6,
    status: faqPresent ? "pass" : "fail",
    score: faqPresent ? 6 : 0,
    detail: faqPresent ? "Your FAQ section emits FAQPage schema (eligible for FAQ rich results)." : "No FAQ section — adding one emits FAQ rich-result schema and answers AI queries.",
    fix: faqPresent ? undefined : { label: "Add an FAQ section", action: "add-faq" },
  });

  const liveStatus: SchemaCheck["status"] = live.verified ? "pass" : live.note?.includes("password") && installed ? "partial" : "fail";
  add({
    key: "live",
    label: "Verified rendering on live store",
    weight: 12,
    status: liveStatus,
    score: liveStatus === "pass" ? 12 : liveStatus === "partial" ? 6 : 0,
    detail: live.verified
      ? `Confirmed live: ${(live.detectedTypes ?? []).join(", ")}.`
      : live.note ?? "Not verified on the live store yet.",
  });

  const score = Math.round(checks.reduce((s, c) => s + c.score, 0));

  const coverage: CoverageRow[] = [
    { pageType: "Home", types: ["Organization", "WebSite", "SearchAction"], status: installed ? "active" : "inactive" },
    { pageType: "Product", types: ["Product", "Offer", "BreadcrumbList", ...(nRating > 0 ? ["AggregateRating"] : [])], status: installed ? "active" : "inactive" },
    { pageType: "Collection", types: ["CollectionPage", "ItemList", "BreadcrumbList"], status: installed ? "active" : "inactive" },
    { pageType: "Blog article", types: ["BlogPosting", "BreadcrumbList"], status: installed ? "active" : "inactive" },
    { pageType: "Pages", types: ["WebPage"], status: installed ? "active" : "inactive" },
    { pageType: "FAQ", types: ["FAQPage"], status: faqPresent ? "active" : "inactive" },
  ];

  return { score, grade: gradeFor(score), installed, checks, coverage, live };
}
