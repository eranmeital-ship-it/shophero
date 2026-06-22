import Anthropic from "@anthropic-ai/sdk";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { orderedKeys } from "./key-pool.server";
import { complete } from "./llm.server";
import { gql } from "./onboarding.server";

/**
 * AEO citation-target generator (Step 3 of the AEO Brain). Turns the store into
 * an actionable off-site worklist, following Ethan Smith's playbook:
 *   1. Transform the catalog into the specific buyer QUESTIONS people ask AI.
 *   2. Find the recurring SOURCES that AI assistants cite for those questions
 *      (Reddit, YouTube, roundups, niche blogs) — grounded with live web search
 *      where available, so you know exactly where to earn a mention.
 * Deliberately opt-in (costs a few cents); the caller meters + approves first.
 */

export interface AeoQuestion {
  q: string;
  intent: string; // comparison | use-case | feature | best-for | how-to | trust
}
export interface AeoSource {
  source: string;
  type: string; // Reddit | YouTube | Roundup | Blog | Marketplace | Forum | Press
  why: string;
  action: string;
  url?: string;
}
export interface AeoTargets {
  category: string;
  questions: AeoQuestion[];
  sources: AeoSource[];
  grounded: boolean; // true if sources were grounded with live web search
  costUsd: number;
  model: string;
}

function anthropicKey(byokKey?: string): string | undefined {
  return byokKey ?? orderedKeys()[0] ?? process.env.ANTHROPIC_API_KEY ?? undefined;
}

function parseJsonBlock(text: string): unknown {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

interface CtxNode {
  shop?: { name?: string };
  products?: { nodes?: { title?: string; productType?: string; vendor?: string }[] };
  collections?: { nodes?: { title?: string }[] };
}

export async function generateAeoTargets(admin: AdminApiContext, byokKey?: string): Promise<AeoTargets> {
  const ctx = await gql<CtxNode>(
    admin,
    `{ shop { name } products(first: 8) { nodes { title productType vendor } } collections(first: 6) { nodes { title } } }`,
  );
  const name = ctx?.shop?.name ?? "this store";
  const products = (ctx?.products?.nodes ?? []).map((p) => p.title).filter(Boolean).slice(0, 8);
  const types = [...new Set((ctx?.products?.nodes ?? []).map((p) => p.productType).filter(Boolean))];
  const collections = (ctx?.collections?.nodes ?? []).map((c) => c.title).filter(Boolean).slice(0, 6);
  const category = types[0] || collections[0] || "ecommerce";
  const storeContext = `Store: ${name}\nCategory: ${category}\nProduct types: ${types.join(", ") || "n/a"}\nSample products: ${products.join("; ") || "n/a"}\nCollections: ${collections.join(", ") || "n/a"}`;

  let costUsd = 0;
  let model = "";

  // ── 1. Buyer questions (cheap, deterministic-ish) ──────────────────────────
  const qSystem = `You are an answer-engine-optimization strategist. Given a store, output the specific buyer QUESTIONS real people ask AI assistants (ChatGPT, Gemini) when researching this kind of purchase. Favor long-tail, hyper-specific questions (~8-18 words) about use-cases, "best X for [situation]", features/materials, comparisons, sizing/fit, gifting and trust — the kind that win in AI search. Avoid generic head terms.
Respond with ONLY JSON, no prose: {"questions":[{"q":"...","intent":"comparison|use-case|feature|best-for|how-to|trust"}]} with exactly 12 items.`;
  let questions: AeoQuestion[] = [];
  try {
    const r = await complete({ system: qSystem, user: storeContext, maxTokens: 900, tier: "cheap", byokKey });
    costUsd += r.costUsd;
    model = r.model;
    const parsed = parseJsonBlock(r.text) as { questions?: AeoQuestion[] };
    questions = (parsed.questions ?? [])
      .map((x) => ({ q: String(x.q ?? "").trim(), intent: String(x.intent ?? "use-case").trim() }))
      .filter((x) => x.q)
      .slice(0, 12);
  } catch {
    questions = [];
  }

  // ── 2. Cited sources — grounded with live web search if possible ───────────
  const key = anthropicKey(byokKey);
  let sources: AeoSource[] = [];
  let grounded = false;
  const sourcePrompt = `For an online store in the "${category}" space (examples: ${products.slice(0, 5).join("; ") || category}), buyers ask AI assistants questions like:
${questions.slice(0, 8).map((q) => `- ${q.q}`).join("\n")}

Use web search to find the recurring SOURCES that AI assistants (ChatGPT, Gemini, Perplexity) actually cite when answering questions like these for this product category — the specific subreddits, YouTube channels/videos, "best ${category}" roundup articles, niche blogs, forums or marketplaces where brands in this category get mentioned. Prefer real, currently-live URLs.
Return the 8 highest-leverage targets, ranked. End your reply with ONLY this JSON (no other text after it):
{"sources":[{"source":"site/thread name","type":"Reddit|YouTube|Roundup|Blog|Marketplace|Forum|Press","why":"why AI cites it / why it matters","action":"one concrete step to earn a mention here","url":"https://..."}]}`;

  if (key) {
    try {
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 } as unknown as Anthropic.Tool],
        messages: [{ role: "user", content: sourcePrompt }],
      });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const inTok = msg.usage?.input_tokens ?? 0;
      const outTok = msg.usage?.output_tokens ?? 0;
      const searches = (msg.usage as { server_tool_use?: { web_search_requests?: number } })?.server_tool_use?.web_search_requests ?? 0;
      costUsd += (inTok / 1e6) * 3 + (outTok / 1e6) * 15 + searches * 0.01; // sonnet + $10/1k searches
      model = "claude-sonnet-4-6 + web_search";
      const parsed = parseJsonBlock(text) as { sources?: AeoSource[] };
      sources = (parsed.sources ?? []).map((s) => ({
        source: String(s.source ?? "").trim(),
        type: String(s.type ?? "Blog").trim(),
        why: String(s.why ?? "").trim(),
        action: String(s.action ?? "").trim(),
        url: s.url ? String(s.url).trim() : undefined,
      })).filter((s) => s.source).slice(0, 8);
      grounded = sources.length > 0;
    } catch {
      sources = [];
    }
  }

  // Fallback: knowledge-based source list (no live grounding).
  if (!sources.length) {
    try {
      const r = await complete({
        system: `You are an AEO strategist. For the given store category, list the 8 recurring SOURCE TYPES that AI assistants tend to cite (Reddit, YouTube, "best of" roundups, niche blogs, forums, marketplaces). Be specific to the category where you can (name likely subreddits, known roundup sites). Respond with ONLY JSON: {"sources":[{"source":"...","type":"...","why":"...","action":"...","url":"..."}]} (url optional).`,
        user: storeContext,
        maxTokens: 1100,
        tier: "cheap",
        byokKey,
      });
      costUsd += r.costUsd;
      if (!model) model = r.model;
      const parsed = parseJsonBlock(r.text) as { sources?: AeoSource[] };
      sources = (parsed.sources ?? []).map((s) => ({
        source: String(s.source ?? "").trim(),
        type: String(s.type ?? "Blog").trim(),
        why: String(s.why ?? "").trim(),
        action: String(s.action ?? "").trim(),
        url: s.url ? String(s.url).trim() : undefined,
      })).filter((s) => s.source).slice(0, 8);
    } catch {
      sources = [];
    }
  }

  return { category, questions, sources, grounded, costUsd, model };
}
