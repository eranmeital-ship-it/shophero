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
  after: string; // generated HTML (descriptions task)
  // SEO task fields:
  seoTitle?: string;
  metaDescription?: string;
  beforeTitle?: string;
  beforeMeta?: string;
  // Alt-text task fields:
  mediaIds?: string[]; // product image media ids to set the alt on
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
- Output ONLY raw HTML — NO markdown, NO code fences or backticks (never write \`\`\` or \`\`\`html), no <h*> tags, no preamble or sign-off.
- NEVER invent statistics, review counts, or claims. If you don't have a real number, use a qualitative trust line instead (e.g. "Loved by our customers").`;

function stripHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Remove any markdown code fences the model adds (anywhere, not just the ends). */
function cleanHtml(s: string): string {
  return s.replace(/```+\s*html/gi, "").replace(/```+/g, "").trim();
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

type ProductRow = { id: string; title: string; descriptionHtml?: string; seo?: { title?: string; description?: string } };

async function fetchProducts(admin: AdminApiContext, which: string, productId: string | undefined, task: "descriptions" | "seo"): Promise<ProductRow[]> {
  const FIELDS = `id title descriptionHtml seo { title description }`;
  if (which === "A specific product" && productId) {
    const d = await adminGql<{ product?: ProductRow }>(admin, `query($id: ID!){ product(id:$id){ ${FIELDS} } }`, { id: productId });
    return d?.product ? [d.product] : [];
  }
  const d = await adminGql<{ products?: { nodes?: ProductRow[] } }>(
    admin,
    `{ products(first: 50, sortKey: UPDATED_AT, reverse: true) { nodes { ${FIELDS} } } }`,
  );
  const all = d?.products?.nodes ?? [];
  if (which === "All products") return all;
  // default: only the ones that need work for this task
  if (task === "seo") return all.filter((p) => !p.seo?.title?.trim() || !p.seo?.description?.trim());
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
  const products = await fetchProducts(admin, opts.which, opts.productId, "descriptions");
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

const SEO_SYSTEM = `You are an SEO expert for Shopify product pages. For the product, write an optimized SEO page title and meta description.
- "title": ≤ 60 characters, primary keyword near the front, compelling and specific.
- "description": ≤ 155 characters, benefit-led, include the keyword and a soft call to action.
Respond with ONLY a JSON object: {"title":"...","description":"..."} — no markdown, no code fences, no other text. Never invent statistics or claims.`;

function parseSeo(text: string): { title: string; description: string } | null {
  try {
    let s = cleanHtml(text);
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const o = JSON.parse(s) as { title?: unknown; description?: unknown };
    if (typeof o.title === "string" && typeof o.description === "string") {
      return { title: o.title.trim().slice(0, 70), description: o.description.trim().slice(0, 160) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Generate SEO titles + meta descriptions for products (direct cheap calls). */
export async function generateSeo(
  admin: AdminApiContext,
  shop: string,
  opts: GenerateOpts,
): Promise<{ drafts: ContentDraft[]; costUsd: number; total: number }> {
  const brand = await buildBrandContext(shop).catch(() => "");
  const products = await fetchProducts(admin, opts.which, opts.productId, "seo");
  const targets = products.slice(0, MAX_ITEMS);
  const drafts: ContentDraft[] = [];
  let costUsd = 0;

  for (const p of targets) {
    const beforeTitle = p.seo?.title ?? "";
    const beforeMeta = p.seo?.description ?? "";
    const user = [
      `Product: ${p.title}`,
      `Current SEO title: ${beforeTitle || "(none)"}`,
      `Current meta description: ${beforeMeta || "(none)"}`,
      `Product description: ${stripHtml(p.descriptionHtml).slice(0, 500) || "(none)"}`,
      opts.notes ? `Target keywords / notes: ${opts.notes}` : "",
      "",
      "Write the SEO title and meta description now.",
    ].filter(Boolean).join("\n");
    try {
      const res = await complete({ system: SEO_SYSTEM, cachePrefix: brand || undefined, user, maxTokens: 300, tier: "cheap" });
      costUsd += res.costUsd;
      const parsed = parseSeo(res.text);
      if (!parsed) continue;
      drafts.push({
        id: p.id,
        title: p.title,
        before: beforeTitle || beforeMeta ? `${beforeTitle} — ${beforeMeta}` : "(none set)",
        after: "",
        seoTitle: parsed.title,
        metaDescription: parsed.description,
        beforeTitle,
        beforeMeta,
      });
    } catch {
      /* skip */
    }
  }
  return { drafts, costUsd, total: products.length };
}

/** Write approved SEO titles/meta to the live store via the Admin API. */
export async function applySeo(
  admin: AdminApiContext,
  drafts: { id: string; seoTitle?: string; metaDescription?: string }[],
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const d of drafts) {
    const data = await adminGql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
      admin,
      `mutation($input: ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ message } } }`,
      { input: { id: d.id, seo: { title: d.seoTitle ?? "", description: d.metaDescription ?? "" } } },
    );
    if (data?.productUpdate && !(data.productUpdate.userErrors?.length)) applied++;
    else failed++;
  }
  return { applied, failed };
}

const ALT_SYSTEM = `You write concise, descriptive image alt text for SEO and accessibility. Given a product, write ONE natural alt-text phrase (max 120 characters) describing the product image — include the product type and a key visual or feature. Output ONLY the phrase: no quotes, no "image of", no markdown.`;

type MediaRow = { id: string; alt?: string | null };
type ProductMedia = { id: string; title: string; descriptionHtml?: string; media?: { nodes?: MediaRow[] } };

/** Generate alt text for product images that are missing it (direct cheap calls). */
export async function generateAlt(
  admin: AdminApiContext,
  shop: string,
  opts: GenerateOpts,
): Promise<{ drafts: ContentDraft[]; costUsd: number; total: number }> {
  const brand = await buildBrandContext(shop).catch(() => "");
  const MEDIA = `id title descriptionHtml media(first:20){ nodes { ... on MediaImage { id alt } } }`;
  let all: ProductMedia[];
  if (opts.which === "A specific product" && opts.productId) {
    const d = await adminGql<{ product?: ProductMedia }>(admin, `query($id:ID!){ product(id:$id){ ${MEDIA} } }`, { id: opts.productId });
    all = d?.product ? [d.product] : [];
  } else {
    const d = await adminGql<{ products?: { nodes?: ProductMedia[] } }>(admin, `{ products(first:50, sortKey:UPDATED_AT, reverse:true){ nodes { ${MEDIA} } } }`);
    all = d?.products?.nodes ?? [];
  }

  // Products with at least one image; "missing" mode keeps only images lacking alt.
  const onlyMissing = opts.which !== "All product images";
  const candidates = all
    .map((p) => {
      const imgs = (p.media?.nodes ?? []).filter((m) => m && m.id);
      const targetIds = (onlyMissing ? imgs.filter((m) => !m.alt?.trim()) : imgs).map((m) => m.id);
      return { p, targetIds };
    })
    .filter((c) => c.targetIds.length > 0);

  const targets = candidates.slice(0, MAX_ITEMS);
  const drafts: ContentDraft[] = [];
  let costUsd = 0;
  for (const { p, targetIds } of targets) {
    const user = [`Product: ${p.title}`, `Description: ${stripHtml(p.descriptionHtml).slice(0, 300) || "(none)"}`, opts.notes ? `Notes: ${opts.notes}` : "", "", "Write the alt text now."].filter(Boolean).join("\n");
    try {
      const res = await complete({ system: ALT_SYSTEM, cachePrefix: brand || undefined, user, maxTokens: 120, tier: "cheap" });
      costUsd += res.costUsd;
      const alt = cleanHtml(res.text).replace(/^["']|["']$/g, "").slice(0, 120);
      if (!alt) continue;
      drafts.push({ id: p.id, title: p.title, before: `${targetIds.length} image${targetIds.length === 1 ? "" : "s"}`, after: alt, mediaIds: targetIds });
    } catch {
      /* skip */
    }
  }
  return { drafts, costUsd, total: candidates.length };
}

/** Write approved alt text to product images via the Admin API. */
export async function applyAlt(
  admin: AdminApiContext,
  drafts: { mediaIds?: string[]; after: string }[],
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const d of drafts) {
    const files = (d.mediaIds ?? []).map((id) => ({ id, alt: d.after }));
    if (!files.length) continue;
    const data = await adminGql<{ fileUpdate?: { userErrors?: { message: string }[] } }>(
      admin,
      `mutation($files:[FileUpdateInput!]!){ fileUpdate(files:$files){ files{ id } userErrors{ message } } }`,
      { files },
    );
    if (data?.fileUpdate && !(data.fileUpdate.userErrors?.length)) applied += files.length;
    else failed += files.length;
  }
  return { applied, failed };
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
      { input: { id: d.id, descriptionHtml: cleanHtml(d.after) } },
    );
    if (data?.productUpdate && !(data.productUpdate.userErrors?.length)) applied++;
    else failed++;
  }
  return { applied, failed };
}
