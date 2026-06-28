import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import CONTENT_STRATEGY from "../knowledge/content.md?raw";
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

// ── Blog articles (Write Content) ─────────────────────────────────────────────

async function gatherArticleContext(admin: AdminApiContext): Promise<{ titles: string[]; types: string[] }> {
  const titles: string[] = [];
  const b = await adminGql<{ blogs?: { nodes?: { articles?: { nodes?: { title?: string }[] } }[] } }>(admin, `{ blogs(first:5){ nodes { articles(first:25){ nodes { title } } } } }`);
  for (const blog of b?.blogs?.nodes ?? []) for (const a of blog.articles?.nodes ?? []) if (a.title) titles.push(a.title);
  const p = await adminGql<{ products?: { nodes?: { productType?: string }[] } }>(admin, `{ products(first:40){ nodes { productType } } }`);
  const types = [...new Set((p?.products?.nodes ?? []).map((x) => x.productType).filter((t): t is string => !!t))];
  return { titles, types };
}

/** Suggest the 5 most useful NEW article topics for this store (grounded, no repeats). */
export async function suggestTopics(admin: AdminApiContext): Promise<{ topics: string[]; costUsd: number; model: string }> {
  const { titles, types } = await gatherArticleContext(admin);
  const user = [
    types.length ? `The store sells: ${types.join(", ")}.` : "A Shopify store.",
    titles.length ? `Already published (suggest NEW, non-overlapping topics): ${titles.slice(0, 40).join("; ")}.` : "No articles published yet.",
    "",
    "Suggest the 5 MOST useful blog article topics for THIS store — answer-engine first: real questions shoppers ask an AI before buying (how to choose, X vs Y, best for <use-case>, is X worth it, care/sizing/compatibility). Buyer-intent, fill real gaps.",
  ].join("\n");
  const SYS = `You suggest AI-answer blog topics for a Shopify store — the kind ChatGPT/Perplexity quote when a shopper asks what to buy. Favor question/buying-guide/comparison titles over generic listicles. Respond with ONLY a JSON array of exactly 5 short topic strings — no prose, no code fences.`;
  try {
    const res = await complete({ system: SYS, user, maxTokens: 300, tier: "cheap" });
    let t = cleanHtml(res.text);
    const a = t.indexOf("[");
    const b = t.lastIndexOf("]");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    const arr = JSON.parse(t) as unknown;
    const topics = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
    return { topics, costUsd: res.costUsd, model: res.model };
  } catch {
    return { topics: [], costUsd: 0, model: "" };
  }
}

export interface CampaignEmail { subject: string; preview: string; body: string; send: string }

/** Write a short, on-brand email campaign series grounded in the real catalog.
 * ShopHero can't SEND email, so this produces paste-ready copy for the merchant's
 * ESP (Klaviyo/Shopify Email/etc.) — the on-store assets (signup section,
 * discount, thank-you page) are built separately by the campaign kit. */
export async function generateEmailCampaign(
  admin: AdminApiContext,
  shop: string,
  opts: { goal: string; incentive: string; tone?: string; count?: number },
): Promise<{ emails: CampaignEmail[]; costUsd: number; model: string }> {
  const n = Math.max(1, Math.min(5, opts.count ?? 4));
  const brand = await buildBrandContext(shop).catch(() => "");
  const p = await adminGql<{ products?: { nodes?: { title?: string; onlineStoreUrl?: string; priceRangeV2?: { minVariantPrice?: { amount?: string; currencyCode?: string } } }[] } }>(
    admin,
    `{ products(first: 6, sortKey: BEST_SELLING) { nodes { title onlineStoreUrl priceRangeV2 { minVariantPrice { amount currencyCode } } } } }`,
  );
  const products = (p?.products?.nodes ?? [])
    .map((x) => `${x.title}${x.priceRangeV2?.minVariantPrice?.amount ? ` (${x.priceRangeV2.minVariantPrice.currencyCode ?? ""} ${x.priceRangeV2.minVariantPrice.amount})` : ""}`)
    .filter(Boolean)
    .slice(0, 6);

  const SYS = `You write a ${n}-email "${opts.goal}" series for a Shopify store, grounded in the Brand Kit voice and the REAL products listed. Each email: a punchy subject (≤60 chars), preview text (≤90 chars), and a plain-text body with one clear call-to-action. Incentive to use where relevant: ${opts.incentive || "none — lead with value, no discount"}. Tone: ${opts.tone || "match the brand"}. Reference real products by name; NEVER invent reviews, ratings, stats or claims. Use {first_name|default:"there"} for the name.
Respond with ONLY JSON, no prose, no code fences: {"emails":[{"subject":"…","preview":"…","body":"…","send":"when to send, e.g. 'Immediately' / 'Day 2'"}]}`;
  const user = `Products: ${products.join("; ") || "(none found)"}\n\nWrite the ${n}-email series now.`;
  try {
    const res = await complete({ system: SYS, cachePrefix: brand || undefined, user, maxTokens: 2600, tier: "cheap" });
    let t = cleanHtml(res.text);
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    const parsed = JSON.parse(t) as { emails?: CampaignEmail[] };
    const emails = (parsed.emails ?? [])
      .map((e) => ({ subject: String(e.subject ?? "").trim(), preview: String(e.preview ?? "").trim(), body: String(e.body ?? "").trim(), send: String(e.send ?? "").trim() }))
      .filter((e) => e.subject && e.body)
      .slice(0, n);
    return { emails, costUsd: res.costUsd, model: res.model };
  } catch {
    return { emails: [], costUsd: 0, model: "" };
  }
}

const ARTICLE_SYSTEM = `You write one AI-answer blog article for a Shopify store — content an AI assistant (ChatGPT, Claude, Perplexity) would quote when a shopper asks what to buy. Grounded in the content strategy below and the Brand Kit. Genuinely helpful, on-brand, buyer-intent.
Write it answer-first: open by directly answering the core question in 1–2 sentences, then back it up. Use question-style <h2> headings, <h3>/<ul>/<p>, short skimmable paragraphs, and link to the store's REAL products/collections inline (use the actual handles/URLs you're given — never invent links). End the body with a short FAQ: 3–4 <h3> questions each followed by a one-paragraph answer (this feeds FAQ rich results), then a soft CTA.
The store renders the article TITLE automatically above the body, so do NOT repeat the title as a heading in the body — start the body with the direct answer.
Respond in EXACTLY this format and nothing else (no JSON, no code fences):
TITLE: <the article title, one line>
META: <meta description, ≤155 chars, one line>
BODY:
<the full article as valid HTML — multiple lines are fine, NO title heading>
Never invent statistics.`;

export async function generateArticles(
  admin: AdminApiContext,
  shop: string,
  opts: { count?: number; topic?: string; notes?: string },
): Promise<{ drafts: ContentDraft[]; costUsd: number; total: number }> {
  const n = Math.max(1, Math.min(5, opts.count ?? 1));
  const [{ titles, types }, brand] = await Promise.all([gatherArticleContext(admin), buildBrandContext(shop).catch(() => "")]);
  const used = [...titles];
  const drafts: ContentDraft[] = [];
  let costUsd = 0;
  for (let i = 0; i < n; i++) {
    const user = [
      types.length ? `The store sells: ${types.join(", ")}.` : "",
      opts.topic ? `Write about: ${opts.topic}.` : "Pick the single highest-value NEW buyer-intent topic that fills a gap.",
      opts.notes ? `Notes: ${opts.notes}.` : "",
      used.length ? `Do NOT repeat these titles: ${used.slice(0, 45).join("; ")}.` : "",
      brand ? `\n${brand}` : "",
      "",
      "Write the article now.",
    ].filter(Boolean).join("\n");
    try {
      const res = await complete({ cachePrefix: CONTENT_STRATEGY, system: ARTICLE_SYSTEM, user, maxTokens: 2600, tier: "cheap" });
      costUsd += res.costUsd;
      const raw = res.text.replace(/^```(?:html|json)?/i, "").replace(/```$/i, "").trim();
      // Newline-safe delimited format (the old JSON-with-embedded-HTML broke parsing
      // whenever the body had literal newlines). Fall back to legacy JSON if present.
      let title = raw.match(/^TITLE:\s*(.+)$/im)?.[1]?.trim();
      let metaDescription = raw.match(/^META:\s*(.+)$/im)?.[1]?.trim();
      let body = raw.match(/^BODY:\s*([\s\S]+)$/im)?.[1]?.trim();
      if (!title || !body) {
        try {
          const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
          if (a >= 0 && b > a) {
            const o = JSON.parse(raw.slice(a, b + 1)) as { title?: string; metaDescription?: string; bodyHtml?: string };
            title = title || o.title;
            metaDescription = metaDescription || o.metaDescription;
            body = body || o.bodyHtml;
          }
        } catch { /* fall through */ }
      }
      if (!title || !body) continue;
      // Defensively drop a leading heading that just repeats the title — the theme
      // renders the title itself, so otherwise it shows twice.
      const norm = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      body = body.replace(/^\s*<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>\s*/i, (m, inner: string) => (norm(inner) === norm(title!) ? "" : m));
      used.push(title);
      drafts.push({ id: `article-${i}`, title, before: opts.topic || "new article", after: cleanHtml(body), metaDescription: String(metaDescription ?? "").slice(0, 160) });
    } catch {
      /* skip */
    }
  }
  return { drafts, costUsd, total: n };
}

/** Publish approved articles to the store's blog (creating a blog if needed). */
export async function publishArticles(
  admin: AdminApiContext,
  shop: string,
  drafts: { title: string; after: string; metaDescription?: string }[],
): Promise<{ applied: number; failed: number; links: { title: string; adminUrl: string }[] }> {
  let blogId: string | undefined = (await adminGql<{ blogs?: { nodes?: { id: string }[] } }>(admin, `{ blogs(first:1){ nodes { id } } }`))?.blogs?.nodes?.[0]?.id;
  if (!blogId) {
    blogId = (await adminGql<{ blogCreate?: { blog?: { id?: string } } }>(admin, `mutation{ blogCreate(blog:{title:"News"}){ blog{ id } userErrors{ message } } }`))?.blogCreate?.blog?.id;
  }
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  const links: { title: string; adminUrl: string }[] = [];
  let applied = 0;
  let failed = 0;
  if (!blogId) return { applied: 0, failed: drafts.length, links };
  for (const d of drafts) {
    const data = await adminGql<{ articleCreate?: { article?: { id?: string }; userErrors?: { message: string }[] } }>(
      admin,
      `mutation($a: ArticleCreateInput!){ articleCreate(article:$a){ article{ id } userErrors{ message } } }`,
      { a: { blogId, title: d.title, body: cleanHtml(d.after), summary: d.metaDescription || undefined, isPublished: true, author: { name: "ShopHero" } } },
    );
    const id = data?.articleCreate?.article?.id;
    if (id && !(data?.articleCreate?.userErrors?.length)) {
      applied++;
      const num = id.match(/\/(\d+)$/)?.[1] ?? "";
      links.push({ title: d.title, adminUrl: `https://admin.shopify.com/store/${storeHandle}/content/articles/${num}` });
    } else {
      failed++;
    }
  }
  return { applied, failed, links };
}

/** Write approved descriptions to the live store via the Admin API. */
/**
 * One scheduled-job batch, cursor-paginated for exact, resumable coverage of a
 * large catalog. Walks products in stable ID order from `cursor`, generates +
 * applies fixes ONLY for items that still need work (cheap engine), and reports
 * the next cursor so the daily runner picks up exactly where it left off.
 */
export async function runBulkContentBatch(
  admin: AdminApiContext,
  shop: string,
  task: "descriptions" | "seo",
  limit: number,
  cursor?: string | null,
): Promise<{ ok: boolean; examined: number; applied: number; costUsd: number; nextCursor: string | null; hasNext: boolean }> {
  const brand = await buildBrandContext(shop).catch(() => "");
  const n = Math.max(1, Math.min(100, limit));
  const d = await adminGql<{ products?: { nodes?: ProductRow[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } }>(
    admin,
    `query($n:Int!,$after:String){ products(first:$n, after:$after, sortKey: ID){ nodes { id title descriptionHtml seo { title description } } pageInfo { hasNextPage endCursor } } }`,
    { n, after: cursor ?? null },
  );
  // Null `products` means the page fetch itself failed (throttle/transient) — do
  // NOT treat that as end-of-catalog, or we'd mark the job done having done nothing.
  if (!d?.products) return { ok: false, examined: 0, applied: 0, costUsd: 0, nextCursor: cursor ?? null, hasNext: true };
  const nodes = d.products.nodes ?? [];
  const pageInfo = d.products.pageInfo;
  let applied = 0;
  let costUsd = 0;

  for (const p of nodes) {
    try {
      if (task === "descriptions") {
        if (stripHtml(p.descriptionHtml).length >= 60) continue; // already substantial
        const before = stripHtml(p.descriptionHtml);
        const user = `Product title: ${p.title}\nCurrent description: ${before || "(none)"}\n\nWrite the new description now.`;
        const res = await complete({ system: DESC_SYSTEM, cachePrefix: brand || undefined, user, maxTokens: 700, tier: "cheap" });
        costUsd += res.costUsd;
        const r = await applyDescriptions(admin, [{ id: p.id, after: cleanHtml(res.text) }]);
        applied += r.applied;
      } else {
        if (p.seo?.title?.trim() && p.seo?.description?.trim()) continue; // already set
        const user = `Product: ${p.title}\nCurrent SEO title: ${p.seo?.title || "(none)"}\nCurrent meta description: ${p.seo?.description || "(none)"}\nProduct description: ${stripHtml(p.descriptionHtml).slice(0, 500) || "(none)"}\n\nWrite the SEO title and meta description now.`;
        const res = await complete({ system: SEO_SYSTEM, cachePrefix: brand || undefined, user, maxTokens: 300, tier: "cheap" });
        costUsd += res.costUsd;
        const parsed = parseSeo(res.text);
        if (parsed) {
          const r = await applySeo(admin, [{ id: p.id, seoTitle: parsed.title, metaDescription: parsed.description }]);
          applied += r.applied;
        }
      }
    } catch {
      /* skip this product; the batch continues */
    }
  }
  return { ok: true, examined: nodes.length, applied, costUsd, nextCursor: pageInfo?.endCursor ?? null, hasNext: !!pageInfo?.hasNextPage };
}

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
