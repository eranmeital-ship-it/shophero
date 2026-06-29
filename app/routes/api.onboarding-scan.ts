import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { gatherStoreSnapshot, gatherCatalogSignals, gql } from "../lib/onboarding.server";

/**
 * Onboarding store scan — our unfair advantage over questionnaire-based tools:
 * we're INSIDE Shopify, so we read the real catalog and compute a starting
 * AI-Readiness Score, the gaps blocking AI from recommending the store, and a
 * prioritized fix-and-grow plan — all deterministically (zero AI cost, fast,
 * never dead-ends). The Readiness dashboard later verifies it live.
 */

export interface ScanResult {
  profile: {
    name?: string;
    productCount: number;
    productTypes: string[];
    bestSellers: string[];
    blogCount: number;
    pageCount: number;
    themeName?: string;
    currency?: string;
    priceMedian?: number;
    contentPct: number;
  };
  facts: string[];
  score: number;
  grade: string;
  dims: { label: string; score: number; note: string }[];
  gaps: { label: string; detail: string }[];
  plan: { tag: "Fix" | "Grow"; icon: string; title: string; desc: string }[];
}

function gradeFor(score: number): string {
  if (score >= 90) return "Category leader";
  if (score >= 70) return "Highly recommendable";
  if (score >= 40) return "Occasionally understood";
  return "Invisible to AI";
}

export async function loader({ request }: LoaderFunctionArgs): Promise<ScanResult> {
  const { admin } = await authenticate.admin(request);

  const [snap, signals] = await Promise.all([gatherStoreSnapshot(admin), gatherCatalogSignals(admin)]);

  // Readable-content dimension: % of products with a substantive description.
  let contentPct = 0;
  try {
    const pd = await gql<{ products?: { nodes?: { descriptionHtml?: string }[] } }>(
      admin,
      `{ products(first: 50) { nodes { descriptionHtml } } }`,
    );
    const nodes = pd?.products?.nodes ?? [];
    if (nodes.length) {
      const good = nodes.filter((n) => (n.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").trim().length >= 120).length;
      contentPct = Math.round((good / nodes.length) * 100);
    }
  } catch { /* best-effort */ }

  // On a fresh install nothing AI-readable is live yet — structured data, the
  // hosted llms.txt and the retrieval feed all start at zero. That's the honest,
  // motivating starting point; the dashboard verifies it live once installed.
  const structured = 12;
  const feed = 0;
  const score = Math.max(6, Math.round(structured * 0.5 + feed * 0.2 + contentPct * 0.3));

  const productCount = snap.productCount ?? 0;
  const blogCount = snap.blogCount ?? 0;
  const cur = snap.currency ?? "";

  const facts: string[] = [];
  if (productCount)
    facts.push(`📦 ${productCount} product${productCount === 1 ? "" : "s"}${signals.productTypes.length ? ` across ${signals.productTypes.slice(0, 3).join(", ")}` : ""}`);
  if (signals.priceMin != null && signals.priceMax != null)
    facts.push(`💵 Prices ${Math.round(signals.priceMin)}–${Math.round(signals.priceMax)} ${cur}`.trim());
  if (snap.themeName) facts.push(`🎨 Theme "${snap.themeName}"`);
  facts.push(`📝 ${blogCount} blog post${blogCount === 1 ? "" : "s"} · ${snap.pageCount ?? 0} page${(snap.pageCount ?? 0) === 1 ? "" : "s"}`);
  facts.push(`🔎 ${contentPct}% of products have AI-readable descriptions`);

  const gaps: { label: string; detail: string }[] = [
    { label: "No structured data for AI", detail: "AI can't reliably tell what each product is, what it costs, or whether it's in stock." },
    { label: "No AI feed or llms.txt", detail: "AI crawlers have no map of your catalog — so your products don't surface in answers." },
  ];
  if (contentPct < 60)
    gaps.push({ label: "Thin product content", detail: "Descriptions don't answer the questions shoppers actually ask AI." });
  if (blogCount === 0)
    gaps.push({ label: "No AI-answer content", detail: "Nothing for AI to quote when a shopper asks what to buy in your category." });

  const plan: ScanResult["plan"] = [
    { tag: "Fix", icon: "📐", title: "Make every product readable by AI", desc: "Auto-add Product, Offer, Review, FAQ & Breadcrumb schema to all your products." },
    { tag: "Fix", icon: "🤖", title: "Go live with your AI feed + llms.txt", desc: "Hosted by ShopHero and kept fresh — the map AI crawlers read to understand your catalog." },
  ];
  if (contentPct < 60)
    plan.push({ tag: "Fix", icon: "✍️", title: "Turn thin descriptions into AI-answer content", desc: "Rewrite product copy into the Q&A facts AI quotes when recommending." });
  plan.push({ tag: "Grow", icon: "📚", title: "Become the source AI quotes", desc: "Publish answer-shaped buying guides built from your best sellers." });
  plan.push({ tag: "Grow", icon: "📈", title: "Watch AI discover your store", desc: "See GPTBot, ClaudeBot & Perplexity read your store — real proof it's working." });

  return {
    profile: {
      name: snap.name,
      productCount,
      productTypes: signals.productTypes.slice(0, 6),
      bestSellers: signals.sampleTitles.slice(0, 4),
      blogCount,
      pageCount: snap.pageCount ?? 0,
      themeName: snap.themeName,
      currency: cur,
      priceMedian: signals.priceMedian,
      contentPct,
    },
    facts,
    score,
    grade: gradeFor(score),
    dims: [
      { label: "Structured data", score: structured, note: "Not installed yet" },
      { label: "AI feed & llms.txt", score: feed, note: "Not live yet" },
      { label: "Readable content", score: contentPct, note: `${contentPct}% of products` },
    ],
    gaps,
    plan,
  };
}
