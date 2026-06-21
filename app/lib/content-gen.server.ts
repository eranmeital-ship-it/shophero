import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { complete } from "./llm.server";
import { buildBrandContext } from "./brand.server";

/**
 * Direct content generation — NO agent loop. For commodity content (product
 * descriptions, etc.) a single cheap model call per item is far faster, cheaper,
 * and more reliable than the full agentic Claude Code loop. The merchant reviews
 * before/after and approves; we then write via the Admin API.
 */

export interface ContentDraft {
  id: string; // product gid
  title: string;
  before: string; // current description (plain text)
  after: string; // generated HTML
}

const MAX_ITEMS = 20; // interactive cap; bulk-everything routes to scheduled jobs

// 5-part, benefit-led, scannable — output is clean Shopify-ready HTML.
const DESC_SYSTEM = `You are an expert Shopify product copywriter. Write a product description as clean HTML using EXACTLY this structure, in order:
1. <p><strong>One-line headline benefit</strong></p>
2. <p>1–2 sentences naming the problem it solves.</p>
3. <ul> with 3–5 <li> feature bullets, each STARTING with a relevant emoji.</ul>
4. <p>One sentence on who it's for.</p>
5. <p>A short trust callout (e.g. "Made with…", "Backed by a … guarantee", "Loved by customers").</p>

Rules:
- Benefit-led, concrete, skimmable. Match the brand voice if one is provided.
- Output ONLY the HTML — no markdown, no <h*> tags, no preamble or sign-off.
- NEVER invent statistics, review counts, or claims. If you don't have a real number, use a qualitative trust line instead (e.g. "Loved by our customers").`;

function stripHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip a markdown code fence the model sometimes wraps the HTML in. */
function cleanHtml(s: string): string {
  return s.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function adminGql<T>(admin: AdminApiContext, query: string, variables?: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await admin.graphql(query, variables ? { variables } : undefined);
    const j = (await r.json()) as { data?: T };
    return j.data ?? null;
  } catch {
    return null;
  }
}

type ProductRow = { id: string; title: string; descriptionHtml?: string };

async function fetchProducts(admin: AdminApiContext, which: string, productId?: string): Promise<ProductRow[]> {
  if (which === "A specific product" && productId) {
    const d = await adminGql<{ product?: ProductRow }>(
      admin,
      `query($id: ID!){ product(id:$id){ id title descriptionHtml } }`,
      { id: productId },
    );
    return d?.product ? [d.product] : [];
  }
  const d = await adminGql<{ products?: { nodes?: ProductRow[] } }>(
    admin,
    `{ products(first: 50, sortKey: UPDATED_AT, reverse: true) { nodes { id title descriptionHtml } } }`,
  );
  const all = d?.products?.nodes ?? [];
  if (which === "All products") return all;
  // default: products with thin/missing descriptions
  return all.filter((p) => stripHtml(p.descriptionHtml).length < 60);
}

export interface GenerateOpts {
  which: string;
  productId?: string;
  tone?: string;
  notes?: string;
}

/** Generate new descriptions for the targeted products (direct cheap calls). */
export async function generateDescriptions(
  admin: AdminApiContext,
  shop: string,
  opts: GenerateOpts,
): Promise<{ drafts: ContentDraft[]; costUsd: number; total: number }> {
  const brand = await buildBrandContext(shop).catch(() => "");
  const products = await fetchProducts(admin, opts.which, opts.productId);
  const targets = products.slice(0, MAX_ITEMS);
  const drafts: ContentDraft[] = [];
  let costUsd = 0;

  for (const p of targets) {
    const before = stripHtml(p.descriptionHtml);
    const user = [
      `Product title: ${p.title}`,
      `Current description: ${before || "(none)"}`,
      opts.tone ? `Tone: ${opts.tone}` : "",
      opts.notes ? `Must include / notes: ${opts.notes}` : "",
      "",
      "Write the new description now.",
    ].filter(Boolean).join("\n");
    try {
      const res = await complete({ system: DESC_SYSTEM, cachePrefix: brand || undefined, user, maxTokens: 700, tier: "cheap" });
      costUsd += res.costUsd;
      drafts.push({ id: p.id, title: p.title, before, after: cleanHtml(res.text) });
    } catch {
      /* skip this one; others continue */
    }
  }
  return { drafts, costUsd, total: products.length };
}

/** Write approved descriptions to the live store via the Admin API. */
export async function applyDescriptions(
  admin: AdminApiContext,
  drafts: { id: string; after: string }[],
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const d of drafts) {
    const data = await adminGql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
      admin,
      `mutation($input: ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ message } } }`,
      { input: { id: d.id, descriptionHtml: d.after } },
    );
    if (data?.productUpdate && !(data.productUpdate.userErrors?.length)) applied++;
    else failed++;
  }
  return { applied, failed };
}
