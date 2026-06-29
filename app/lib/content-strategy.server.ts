import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { gql } from "./onboarding.server";
import { complete } from "./llm.server";

/**
 * Content-strategy analyzer — the "tool" behind the constant content drip.
 * Deep-reads the store (best sellers, categories, existing content, gaps) and
 * produces a PRIORITIZED plan of AI-answer pieces mapped to the shop's real
 * products/collections. The content drip then works through this queue on a
 * cadence, so the store keeps gaining SEO/AEO depth without manual planning.
 */

export interface ContentPiece {
  title: string;
  angle: string;        // one line on what it covers / why it wins
  target: string;       // product or collection handle it links to, or "general"
  intent: "buying" | "research" | "support" | "brand";
  priority: number;     // 1 (highest) .. 3
}

const SYS = `You are an ecommerce content strategist. From a store's best sellers, categories and existing articles, produce a PRIORITIZED content plan of AI-answer pieces — the kind an AI assistant (ChatGPT, Perplexity) quotes when a shopper asks what to buy, each mapped to the store's REAL products/collections.

Cover a healthy mix:
- best-seller buying guides ("is X worth it", "who X is for")
- category "how to choose / best <category> for <use-case>" guides
- comparisons (X vs Y, or vs the common alternative)
- use-case & gift guides
- care / sizing / compatibility / FAQ support content
- a few general brand/SEO pieces (about, materials, sustainability — only if it fits)

Rules: ground every piece in the REAL products/collections given (use their handles for "target"); do NOT repeat topics already covered by the existing titles; buying intent first; titles should read like questions or guides a shopper would search/ask. Prefer evergreen titles WITHOUT a year; if a year genuinely helps, use ONLY the current year given below — never a past year.

Respond with ONLY JSON, no prose, no code fences:
{"summary":"2-sentence strategy for this store","pieces":[{"title":"…","angle":"…","target":"<handle or 'general'>","intent":"buying|research|support|brand","priority":1}]}
12–16 pieces, highest priority first.`;

interface Ctx {
  shop?: { name?: string; description?: string };
  bestSellers?: { nodes?: { title?: string; handle?: string; productType?: string }[] };
  collections?: { nodes?: { title?: string; handle?: string }[] };
}

/** Generate ONE fresh AI-answer piece to swap into the calendar (avoids given titles). */
export async function suggestReplacement(
  admin: AdminApiContext,
  shop: string,
  byokKey: string | undefined,
  avoid: string[],
): Promise<ContentPiece | null> {
  const ctx = await gql<Ctx>(
    admin,
    `{ shop { name } bestSellers: products(first: 15, sortKey: BEST_SELLING) { nodes { title handle productType } } collections(first: 12, sortKey: TITLE) { nodes { title handle } } }`,
  );
  const sellers = (ctx?.bestSellers?.nodes ?? []).filter((p) => p.title);
  const colls = (ctx?.collections?.nodes ?? []).filter((c) => c.title);
  const user = [
    `Current year: ${new Date().getFullYear()} (use this year if any, never a past one).`,
    `Store: ${ctx?.shop?.name ?? shop}`,
    sellers.length ? `Best sellers: ${sellers.map((p) => `${p.title} [${p.handle}]`).join("; ")}` : "",
    colls.length ? `Collections: ${colls.map((c) => `${c.title} [${c.handle}]`).join("; ")}` : "",
    avoid.length ? `Do NOT repeat any of these: ${avoid.slice(0, 40).join("; ")}` : "",
    "Suggest ONE new AI-answer article — a buying guide, comparison, use-case or support piece a shopper would ask AI before buying.",
  ].filter(Boolean).join("\n");
  const SYS_ONE = `You are an ecommerce content strategist. Respond with ONLY one JSON object, no prose, no code fences:
{"title":"…","angle":"…","target":"<product/collection handle or 'general'>","intent":"buying|research|support|brand","priority":1}`;
  try {
    const res = await complete({ system: SYS_ONE, user, maxTokens: 300, tier: "cheap", byokKey });
    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    const p = JSON.parse(t);
    if (!p?.title) return null;
    return {
      title: String(p.title).slice(0, 160),
      angle: String(p.angle ?? "").slice(0, 240),
      target: String(p.target ?? "general").slice(0, 120),
      intent: (["buying", "research", "support", "brand"].includes(String(p.intent)) ? p.intent : "research") as ContentPiece["intent"],
      priority: Math.min(3, Math.max(1, Number(p.priority) || 2)),
    };
  } catch { return null; }
}

export async function analyzeContentStrategy(
  admin: AdminApiContext,
  shop: string,
  byokKey?: string,
): Promise<{ summary: string; pieces: ContentPiece[]; costUsd: number; model: string }> {
  const ctx = await gql<Ctx>(
    admin,
    `{
      shop { name description }
      bestSellers: products(first: 25, sortKey: BEST_SELLING) { nodes { title handle productType } }
      collections(first: 20, sortKey: TITLE) { nodes { title handle } }
    }`,
  );
  // Existing articles (avoid repeats).
  const blogs = await gql<{ blogs?: { nodes?: { articles?: { nodes?: { title?: string }[] } }[] } }>(
    admin, `{ blogs(first: 5) { nodes { articles(first: 40) { nodes { title } } } } }`);
  const existing = (blogs?.blogs?.nodes ?? []).flatMap((b) => (b.articles?.nodes ?? []).map((a) => a.title)).filter(Boolean) as string[];

  const sellers = (ctx?.bestSellers?.nodes ?? []).filter((p) => p.title);
  const colls = (ctx?.collections?.nodes ?? []).filter((c) => c.title);
  const user = [
    `Current year: ${new Date().getFullYear()} (use this year if any, never a past one).`,
    `Store: ${ctx?.shop?.name ?? shop}`,
    ctx?.shop?.description ? `About: ${ctx.shop.description.replace(/<[^>]+>/g, " ").slice(0, 300)}` : "",
    sellers.length ? `Best sellers (most to least): ${sellers.map((p) => `${p.title} [${p.handle}]${p.productType ? ` (${p.productType})` : ""}`).join("; ")}` : "",
    colls.length ? `Collections: ${colls.map((c) => `${c.title} [${c.handle}]`).join("; ")}` : "",
    existing.length ? `Already published (do NOT repeat): ${existing.slice(0, 50).join("; ")}` : "No articles published yet.",
  ].filter(Boolean).join("\n");

  const res = await complete({ system: SYS, user, maxTokens: 1600, tier: "cheap", byokKey });

  let parsed: { summary?: string; pieces?: ContentPiece[] } = {};
  try {
    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    parsed = JSON.parse(t);
  } catch { parsed = {}; }

  const pieces: ContentPiece[] = (Array.isArray(parsed.pieces) ? parsed.pieces : [])
    .map((p) => ({
      title: String(p?.title ?? "").slice(0, 160),
      angle: String(p?.angle ?? "").slice(0, 240),
      target: String(p?.target ?? "general").slice(0, 120),
      intent: (["buying", "research", "support", "brand"].includes(String(p?.intent)) ? p.intent : "research") as ContentPiece["intent"],
      priority: Math.min(3, Math.max(1, Number(p?.priority) || 2)),
    }))
    .filter((p) => p.title)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 20);

  return { summary: String(parsed.summary ?? "").slice(0, 400), pieces, costUsd: res.costUsd, model: res.model };
}
