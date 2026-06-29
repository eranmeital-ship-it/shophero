import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import CONTENT_STRATEGY from "../knowledge/content.md?raw";
import db from "../db.server";
import { gql, resolveKey } from "./onboarding.server";
import { buildBrandContext } from "./brand.server";
import { complete } from "./llm.server";
import type { ContentPiece } from "./content-strategy.server";

/**
 * Content Plan — ShopHero drafts the next best article on a cadence; the merchant
 * approves & publishes each day. Generation uses ONE structured model call
 * grounded in the content brain + brand + a gap analysis of existing content.
 * Nothing publishes without the merchant clicking Publish.
 */


export interface ContentDraft {
  title: string;
  bodyHtml: string;
  metaDescription: string;
  topic: string;
}

function isSameDay(a?: Date | null, b: Date = new Date()): boolean {
  return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getPlan(shop: string) {
  return db.contentPlan.findUnique({ where: { shop } });
}

export async function startPlan(shop: string, opts: { perDay: number; days: number; strategy: string }): Promise<void> {
  const data = {
    strategy: opts.strategy || null,
    perDay: Math.max(1, Math.min(2, opts.perDay)),
    days: Math.max(1, Math.min(90, opts.days)),
    publishedCount: 0,
    status: "active",
    draftTitle: null,
    draftBody: null,
    draftMeta: null,
    draftTopic: null,
    draftDate: null,
    startedAt: new Date(),
  };
  await db.contentPlan.upsert({ where: { shop }, create: { shop, ...data }, update: data });
}

export async function setStatus(shop: string, status: "active" | "paused"): Promise<void> {
  await db.contentPlan.update({ where: { shop }, data: { status } }).catch(() => {});
}

/** Toggle auto-publish: when on, the daily draft publishes without manual approval. */
export async function setAutoPublish(shop: string, on: boolean): Promise<void> {
  await db.contentPlan.update({ where: { shop }, data: { autoPublish: on } }).catch(() => {});
}

/** Seed/refresh the plan from a deep content-strategy analysis (the drip queue). */
export async function setStrategy(
  shop: string,
  summary: string,
  pieces: ContentPiece[],
  opts?: { perDay?: number; days?: number },
): Promise<void> {
  const data = {
    strategySummary: summary || null,
    queue: JSON.stringify(pieces),
    perDay: Math.max(1, Math.min(2, opts?.perDay ?? 1)),
    days: Math.max(1, Math.min(90, opts?.days ?? Math.max(7, pieces.length))),
    status: "active",
    startedAt: new Date(),
  };
  await db.contentPlan.upsert({ where: { shop }, create: { shop, publishedCount: 0, ...data }, update: data });
}

/** Existing article titles (to avoid repeats / find gaps) + product types for grounding. */
async function gatherContentContext(admin: AdminApiContext): Promise<{ titles: string[]; types: string[] }> {
  const titles: string[] = [];
  const blogs = await gql<{ blogs?: { nodes?: { articles?: { nodes?: { title?: string }[] } }[] } }>(
    admin,
    `{ blogs(first: 5) { nodes { articles(first: 25) { nodes { title } } } } }`,
  );
  for (const b of blogs?.blogs?.nodes ?? []) for (const a of b.articles?.nodes ?? []) if (a.title) titles.push(a.title);

  const prod = await gql<{ products?: { nodes?: { productType?: string }[] } }>(admin, `{ products(first: 40) { nodes { productType } } }`);
  const types = [...new Set((prod?.products?.nodes ?? []).map((p) => p.productType).filter((t): t is string => !!t))];
  return { titles, types };
}

const GEN_SYSTEM = `You write one AI-answer blog article for a Shopify store — content an AI assistant (ChatGPT, Perplexity) would quote when a shopper asks what to buy — grounded in the strategy below and the Brand Kit. If an ASSIGNED TOPIC is given, write exactly that piece; otherwise pick the single highest-value NEW topic not already covered (buying intent first). Write answer-first: open by directly answering the core question, use question-style <h2> headings, link to the store's REAL products/collections inline, and end with a short 3–4 question FAQ then a soft CTA.
Respond with ONLY JSON, no prose, no code fences:
{"title":"…","topic":"short topic label","metaDescription":"≤155 chars","bodyHtml":"<p>…</p> full article in valid HTML with <h2>/<h3>/<ul>/<p>, an FAQ section, and a closing CTA"}`;

function parseDraft(text: string): ContentDraft | null {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s > 0 || e < t.length - 1) t = t.slice(s, e + 1);
  try {
    const o = JSON.parse(t) as Partial<ContentDraft>;
    if (!o.title || !o.bodyHtml) return null;
    return {
      title: String(o.title),
      bodyHtml: String(o.bodyHtml),
      metaDescription: String(o.metaDescription ?? "").slice(0, 160),
      topic: String(o.topic ?? o.title),
    };
  } catch {
    return null;
  }
}

/** Generate the next draft for the plan (one model call). Returns the plan row. */
export async function generateDraft(admin: AdminApiContext, shop: string, plan: string | null, force = false) {
  const row = await getPlan(shop);
  if (!row || row.status !== "active") return row;
  if (row.publishedCount >= row.days * row.perDay) {
    return db.contentPlan.update({ where: { shop }, data: { status: "done" } });
  }
  // Don't regenerate if there's already a pending draft, or we generated today (unless forced).
  if (!force && (row.draftTitle || isSameDay(row.draftDate))) return row;

  const byokKey = plan === "byok" ? (await resolveKey(shop, plan)) ?? undefined : undefined;
  if (plan === "byok" && !byokKey) return row;

  // The deep content-strategy queue drives the drip: write the top planned piece.
  let assigned: ContentPiece | null = null;
  try { const q = JSON.parse(row.queue || "[]") as ContentPiece[]; if (q.length) assigned = q[0]; } catch { /* no queue */ }

  const [{ titles, types }, brand] = await Promise.all([gatherContentContext(admin), buildBrandContext(shop)]);
  const userMsg = [
    `Current year is ${new Date().getFullYear()} — never reference a past year as current; prefer evergreen phrasing.`,
    types.length ? `The store sells: ${types.join(", ")}.` : "",
    row.strategySummary ? `Content strategy: ${row.strategySummary}` : row.strategy ? `Content focus: ${row.strategy}.` : "",
    assigned
      ? `ASSIGNED TOPIC — write this exact piece:\nTitle: ${assigned.title}\nAngle: ${assigned.angle}\nLink to: ${assigned.target && assigned.target !== "general" ? `/collections/${assigned.target} and/or /products/${assigned.target}` : "the most relevant products/collections"}`
      : "",
    titles.length ? `Already published (do NOT repeat): ${titles.slice(0, 40).join("; ")}.` : "No articles published yet.",
    brand ? `\n${brand}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await complete({ cachePrefix: CONTENT_STRATEGY, system: GEN_SYSTEM, user: userMsg, maxTokens: 2600, tier: "cheap", byokKey });
    const draft = parseDraft(res.text);
    if (!draft) return row;

    await db.usageEvent
      .create({ data: { shop, plan, model: res.model, kind: "content_plan", costUsd: res.costUsd, billedUsd: plan === "managed" ? res.costUsd * 3 : 0, inputTokens: res.inputTokens, outputTokens: res.outputTokens } })
      .catch(() => {});

    return db.contentPlan.update({
      where: { shop },
      data: { draftTitle: draft.title, draftBody: draft.bodyHtml, draftMeta: draft.metaDescription, draftTopic: assigned?.title ?? draft.topic, draftDate: new Date() },
    });
  } catch (e) {
    console.warn("[content-plan] generation failed:", e instanceof Error ? e.message : e);
    return row;
  }
}

/** Publish the current draft as a live blog article (merchant-approved). */
export async function publishDraft(admin: AdminApiContext, shop: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getPlan(shop);
  if (!row?.draftTitle || !row.draftBody) return { ok: false, error: "No draft to publish." };

  // Find or create a blog to publish into.
  let blogId: string | undefined;
  const blogs = await gql<{ blogs?: { nodes?: { id: string }[] } }>(admin, `{ blogs(first: 1) { nodes { id } } }`);
  blogId = blogs?.blogs?.nodes?.[0]?.id;
  if (!blogId) {
    const r = await admin.graphql(`mutation { blogCreate(blog: { title: "News" }) { blog { id } userErrors { message } } }`);
    const { data } = (await r.json()) as { data?: { blogCreate?: { blog?: { id?: string }; userErrors?: { message: string }[] } } };
    blogId = data?.blogCreate?.blog?.id;
    if (!blogId) return { ok: false, error: data?.blogCreate?.userErrors?.[0]?.message ?? "Couldn't create a blog." };
  }

  const r = await admin.graphql(
    `mutation Create($article: ArticleCreateInput!) {
      articleCreate(article: $article) { article { id } userErrors { field message } }
    }`,
    {
      variables: {
        article: {
          blogId,
          title: row.draftTitle,
          body: row.draftBody,
          summary: row.draftMeta || undefined,
          isPublished: true,
          author: { name: "ShopHero" },
        },
      },
    },
  );
  const { data } = (await r.json()) as { data?: { articleCreate?: { article?: { id?: string }; userErrors?: { field: string[]; message: string }[] } } };
  const errs = data?.articleCreate?.userErrors ?? [];
  if (errs.length || !data?.articleCreate?.article?.id) {
    return { ok: false, error: errs.map((e) => e.message).join(", ") || "Publish failed." };
  }

  // Consume the planned piece from the strategy queue (it just went live).
  let queue = row.queue;
  try {
    const q = JSON.parse(row.queue || "[]") as ContentPiece[];
    if (q.length) queue = JSON.stringify(q.filter((p) => p.title !== (row.draftTopic ?? row.draftTitle)).length === q.length ? q.slice(1) : q.filter((p) => p.title !== (row.draftTopic ?? row.draftTitle)));
  } catch { /* keep as-is */ }

  const count = row.publishedCount + 1;
  const done = count >= row.days * row.perDay;
  await db.contentPlan.update({
    where: { shop },
    data: { publishedCount: count, status: done ? "done" : "active", queue, draftTitle: null, draftBody: null, draftMeta: null, draftTopic: null },
  });
  await db.appEvent.create({ data: { shop, level: "info", type: "content_publish", message: `Published article: ${row.draftTitle}` } }).catch(() => {});
  return { ok: true };
}
