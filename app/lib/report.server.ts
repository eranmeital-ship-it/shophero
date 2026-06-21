import { createHash } from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import CRO_PLAYBOOK from "../knowledge/cro.md?raw";
import db from "../db.server";
import { complete } from "./llm.server";
import {
  gatherStoreSnapshot,
  gatherCatalogSignals,
  gql,
  resolveKey,
  type Recommendation,
  type StoreSnapshot,
  type CatalogSignals,
} from "./onboarding.server";

/**
 * Cached store report — the cost saver. Deterministic checks (no model) produce
 * scores + findings; ONE model call turns them into a narrative + plan. The whole
 * thing is keyed by a content hash of the store, so when nothing has changed we
 * return the cache for $0. A throttle bounds regen to ~once/day even on busy
 * stores. Every dashboard session reads this instead of calling the model live.
 */

const MIN_REGEN_HOURS = Number(process.env.DRIFT_REPORT_MIN_HOURS ?? 24); // at most once/day, on entry

export interface Score {
  label: string;
  value: number;
  color: string;
}

export type IssueSeverity = "error" | "warning" | "notice";
export interface Issue {
  key: string;
  label: string; // "12 of 50 sampled products have thin or missing descriptions"
  severity: IssueSeverity;
  count: number;
  area: "SEO" | "Content" | "Catalog" | "AEO";
  why: string; // plain-English impact
  fix: string; // short how-it's-fixed
  fixPrompt?: string; // one-click fix instruction for the agent
}

/**
 * One line item in an area's scorecard. Every factor that builds a score is a
 * CheckItem — passing or failing — so the merchant sees the complete picture,
 * not just the deductions. `earned`/`weight` make the math transparent.
 */
export type CheckStatus = "pass" | "warn" | "fail";
export interface CheckItem {
  key: string;
  label: string; // what the check is
  weight: number; // max points this check contributes (area weights sum to 100)
  earned: number; // points actually earned (0..weight)
  status: CheckStatus;
  detail: string; // store-specific current state
  why: string; // why it matters for a high-performing store
  fix?: string; // one-click fix instruction for the agent (when not passing)
}
// Back-compat alias — older code/types referenced `Breakdown`.
export type Breakdown = CheckItem;
export interface ScoreHistoryPoint {
  date: string; // YYYY-MM-DD
  health: number;
  [area: string]: number | string;
}

export interface StoreReport {
  scores: Score[];
  health: number; // overall Site-Health % (0–100)
  breakdowns: Record<string, Breakdown[]>; // per-area: how the score is computed
  history: ScoreHistoryPoint[]; // score over time
  issues: Issue[];
  findings: string[];
  summary: string;
  recommendations: Recommendation[];
  generatedAt: string;
  cached: boolean; // true if served from cache (no model call this time)
}

interface Metrics {
  productCount: number;
  collectionCount: number;
  pageCount: number;
  blogCount: number;
  priceMedian: number;
  sampled: number;
  missingDesc: number;
  fewImages: number;
  missingAlt: number;
  missingSeoTitle: number;
  missingSeoDesc: number;
  dupTitle: number;
  themeName: string;
  latestUpdate: string;
}

function scoreColor(v: number): string {
  return v >= 80 ? "#34c759" : v >= 60 ? "#ff9500" : "#ff3b30";
}
function clamp(n: number): number {
  return Math.max(2, Math.min(100, Math.round(n)));
}

/** Deterministic store scan — counts/ratios only, no model. */
async function gatherMetrics(admin: AdminApiContext, snap: StoreSnapshot, signals: CatalogSignals): Promise<Metrics> {
  const sample = await gql<{
    products?: {
      nodes?: {
        title?: string;
        descriptionHtml?: string;
        seo?: { title?: string | null; description?: string | null };
        images?: { nodes?: { altText?: string | null }[] };
      }[];
    };
  }>(
    admin,
    `{ products(first: 50) { nodes { title descriptionHtml seo { title description } images(first: 3) { nodes { altText } } } } }`,
  );
  const nodes = sample?.products?.nodes ?? [];
  const sampled = nodes.length;
  let missingDesc = 0;
  let fewImages = 0;
  let missingAlt = 0;
  let missingSeoTitle = 0;
  let missingSeoDesc = 0;
  const titleSeen = new Map<string, number>();
  for (const n of nodes) {
    if (!n.descriptionHtml || n.descriptionHtml.replace(/<[^>]+>/g, "").trim().length < 20) missingDesc++;
    const imgs = n.images?.nodes ?? [];
    if (imgs.length < 2) fewImages++;
    if (imgs.some((im) => !im.altText || !im.altText.trim())) missingAlt++;
    if (!n.seo?.title || !n.seo.title.trim()) missingSeoTitle++;
    if (!n.seo?.description || !n.seo.description.trim()) missingSeoDesc++;
    const key = (n.seo?.title || n.title || "").trim().toLowerCase();
    if (key) titleSeen.set(key, (titleSeen.get(key) ?? 0) + 1);
  }
  let dupTitle = 0;
  for (const c of titleSeen.values()) if (c > 1) dupTitle += c - 1;

  const latest = await gql<{ products?: { nodes?: { updatedAt?: string }[] } }>(
    admin,
    `{ products(first: 1, sortKey: UPDATED_AT, reverse: true) { nodes { updatedAt } } }`,
  );

  return {
    productCount: snap.productCount ?? sampled,
    collectionCount: snap.collectionCount ?? 0,
    pageCount: snap.pageCount ?? 0,
    blogCount: snap.blogCount ?? 0,
    priceMedian: signals.priceMedian ?? 0,
    sampled,
    missingDesc,
    fewImages,
    missingAlt,
    missingSeoTitle,
    missingSeoDesc,
    dupTitle,
    themeName: snap.themeName ?? "",
    latestUpdate: latest?.products?.nodes?.[0]?.updatedAt ?? "",
  };
}

function hashOf(m: Metrics): string {
  const key = JSON.stringify([
    m.productCount, m.collectionCount, m.pageCount, m.blogCount,
    Math.round(m.priceMedian), m.missingDesc, m.fewImages, m.missingAlt,
    m.missingSeoTitle, m.missingSeoDesc, m.dupTitle, m.themeName, m.latestUpdate,
  ]);
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** The itemized audit ledger (Semrush-style): each issue with severity, count, why, and a one-click fix. */
function buildIssues(m: Metrics): Issue[] {
  const s = m.sampled || 1;
  const out: Issue[] = [];
  const ofSample = (n: number) => `${n} of ${m.sampled} sampled products`;

  if (m.dupTitle > 0)
    out.push({
      key: "dup-titles", severity: "error", count: m.dupTitle, area: "SEO",
      label: `${m.dupTitle} duplicate product/SEO titles`,
      why: "Duplicate titles split ranking signals and confuse search engines about which page to show.",
      fix: "Write a unique, keyword-front title for each.",
      fixPrompt: "Find products with duplicate or identical SEO titles and rewrite each to be unique, ≤60 characters, with the primary keyword near the front. Update via the Shopify Admin API.",
    });
  if (m.missingSeoTitle > 0)
    out.push({
      key: "missing-seo-title", severity: "error", count: m.missingSeoTitle, area: "SEO",
      label: `${ofSample(m.missingSeoTitle)} have no SEO title`,
      why: "Without a set title tag, Google guesses — costing rankings and click-through.",
      fix: "Generate a unique ≤60-char title with the main keyword.",
      fixPrompt: "Write unique, keyword-optimized SEO page titles (≤60 chars) for the products missing one, and update them via the Shopify Admin API.",
    });
  if (m.missingDesc > 0)
    out.push({
      key: "thin-desc", severity: "error", count: m.missingDesc, area: "SEO",
      label: `${ofSample(m.missingDesc)} have thin or missing descriptions`,
      why: "Thin/duplicate copy ranks poorly and doesn't sell; manufacturer copy risks duplicate-content penalties.",
      fix: "Rewrite unique, benefit-led, keyword-aware descriptions.",
      fixPrompt: "Rewrite the product descriptions that are thin, empty, or manufacturer boilerplate — unique, benefit-led, keyword-aware, with the keyword in the first paragraph. Call page_kit first and update via the Shopify Admin API.",
    });
  if (m.missingSeoDesc > 0)
    out.push({
      key: "missing-meta", severity: "warning", count: m.missingSeoDesc, area: "SEO",
      label: `${ofSample(m.missingSeoDesc)} have no meta description`,
      why: "A weak/blank meta description lowers click-through from search results.",
      fix: "Write a ≤155-char benefit + keyword + CTA description.",
      fixPrompt: "Write compelling meta descriptions (≤155 chars, benefit + keyword + soft CTA) for the products missing one, and update via the Shopify Admin API.",
    });
  if (m.missingAlt > 0)
    out.push({
      key: "missing-alt", severity: "warning", count: m.missingAlt, area: "AEO",
      label: `${ofSample(m.missingAlt)} have images without alt text`,
      why: "Missing alt text loses image-search traffic, hurts accessibility, and weakens AI-agent readability.",
      fix: "Add descriptive, keyword-aware alt text per image.",
      fixPrompt: "Add descriptive, keyword-aware alt text to product images that are missing it (vary by angle), via the Shopify Admin API.",
    });
  if (m.fewImages > 0)
    out.push({
      key: "few-images", severity: "warning", count: m.fewImages, area: "Catalog",
      label: `${ofSample(m.fewImages)} have fewer than 2 images`,
      why: "Sparse imagery lowers buyer confidence and conversion.",
      fix: "Add more angles/lifestyle shots (merchant action).",
    });
  if (m.pageCount === 0)
    out.push({
      key: "no-pages", severity: "warning", count: 1, area: "Content",
      label: "No content pages (About / FAQ)",
      why: "No pages to build trust, answer objections, or feed AI agents context.",
      fix: "Create an About and FAQ page.",
      fixPrompt: "Create a strong About page and an FAQ page tailored to this store, then stage them for approval.",
    });
  if (m.blogCount === 0)
    out.push({
      key: "no-blog", severity: "notice", count: 1, area: "Content",
      label: "No blog content",
      why: "Missing an organic-traffic and trust channel that also earns internal links.",
      fix: "Start a buyer-intent blog (content plan).",
      fixPrompt: "Plan a buyer-intent blog: propose 5 high-intent article topics tied to my products, each with a primary keyword and the money page it links to.",
    });
  if (m.collectionCount <= 1)
    out.push({
      key: "thin-collections", severity: "notice", count: 1, area: "Catalog",
      label: "Thin collection structure",
      why: "Weak navigation and fewer ranking entry points for category searches.",
      fix: "Add demand-based sub-collections.",
      fixPrompt: "Suggest and create demand-based collections / sub-collections for my catalog (e.g. by use-case, price, attribute) to capture more search intent.",
    });
  return out;
}

const SEV_PENALTY: Record<IssueSeverity, number> = { error: 9, warning: 4, notice: 1 };
/** Site-Health % — starts at 100, penalized by issue severity (Semrush-style headline number). */
function healthFrom(issues: Issue[]): number {
  const penalty = issues.reduce((a, i) => a + SEV_PENALTY[i.severity], 0);
  return Math.max(20, Math.min(100, 100 - penalty));
}

// Reusable one-click fix instructions for gap factors.
const FIX_DESC = "Rewrite the thin or missing product descriptions — unique, benefit-led, keyword-aware, keyword in the first line. Call page_kit first, update via the Shopify Admin API.";
const FIX_PAGES = "Create an About page and an FAQ page tailored to my store, then stage them for approval.";
const FIX_BLOG = "Plan a buyer-intent blog: propose 5 high-intent article topics tied to my products, each with a primary keyword and the money page it links to.";
const FIX_IMAGES = "List the products that have fewer than 2 images and suggest the shots to add for each.";
const FIX_COLLECTIONS = "Create demand-based collections / sub-collections to improve navigation and capture more search intent.";
const FIX_ALT = "Add descriptive, keyword-aware alt text to product images that are missing it (vary it by angle/use), via the Shopify Admin API.";
const FIX_SEO_TITLE = "Write unique, keyword-optimized SEO page titles (≤60 chars, primary keyword near the front) for the products missing one, and update them via the Shopify Admin API.";
const FIX_META = "Write compelling meta descriptions (≤155 chars, benefit + keyword + soft CTA) for the products missing one, and update them via the Shopify Admin API.";
const FIX_DUP = "Find products with duplicate or identical SEO titles and rewrite each to be unique, ≤60 chars, with the primary keyword near the front, via the Shopify Admin API.";

/**
 * Build a CheckItem. `frac` is 0..1 — the share of the weight earned (1 = perfect).
 * Status: pass when essentially perfect, fail at/under half credit, warn between.
 */
function check(
  o: { key: string; label: string; weight: number; frac: number; pass: string; gap: string; why: string; fix?: string },
): CheckItem {
  const frac = Math.max(0, Math.min(1, o.frac));
  const status: CheckStatus = frac >= 0.999 ? "pass" : frac <= 0.5 ? "fail" : "warn";
  return {
    key: o.key,
    label: o.label,
    weight: o.weight,
    earned: Math.round(o.weight * frac),
    status,
    detail: status === "pass" ? o.pass : o.gap,
    why: o.why,
    fix: status === "pass" ? undefined : o.fix,
  };
}

/**
 * The scorecard engine. Each area is a weighted checklist (weights sum to 100);
 * the area score is the sum of earned points. Every factor is visible — passing
 * or failing — so a merchant can work the gaps one by one and watch the number move.
 */
function buildChecklists(m: Metrics): Record<string, CheckItem[]> {
  const s = m.sampled || 1;
  const ratioOk = (missing: number) => 1 - missing / s; // 1 = all good
  const of = (n: number) => `${n} of ${m.sampled} sampled products`;
  const all = "All sampled products";

  const SEO: CheckItem[] = [
    check({ key: "seo-title", label: "SEO title tags set", weight: 25, frac: ratioOk(m.missingSeoTitle),
      pass: `${all} have a custom SEO title.`, gap: `${of(m.missingSeoTitle)} have no SEO title — Google is guessing.`,
      why: "The title tag is the single strongest on-page ranking signal and drives click-through from results.", fix: FIX_SEO_TITLE }),
    check({ key: "seo-desc", label: "Rich product descriptions", weight: 20, frac: ratioOk(m.missingDesc),
      pass: `${all} have substantial, unique copy.`, gap: `${of(m.missingDesc)} have thin or missing descriptions.`,
      why: "Unique, keyword-rich copy is what ranks product pages; thin or manufacturer copy risks duplicate-content penalties.", fix: FIX_DESC }),
    check({ key: "seo-meta", label: "Meta descriptions set", weight: 18, frac: ratioOk(m.missingSeoDesc),
      pass: `${all} have a meta description.`, gap: `${of(m.missingSeoDesc)} have no meta description.`,
      why: "The meta description is your ad copy in search results — a blank one quietly lowers click-through.", fix: FIX_META }),
    check({ key: "seo-dup", label: "Unique titles (no duplicates)", weight: 12, frac: m.dupTitle > 0 ? 0 : 1,
      pass: "No duplicate titles detected.", gap: `${m.dupTitle} duplicate product/SEO titles.`,
      why: "Duplicate titles split ranking signals across pages and confuse Google about which to show.", fix: FIX_DUP }),
    check({ key: "seo-alt", label: "Image alt text", weight: 8, frac: ratioOk(m.missingAlt),
      pass: `${all} have alt text on images.`, gap: `${of(m.missingAlt)} have images without alt text.`,
      why: "Alt text wins image-search traffic and adds keyword context to every product page.", fix: FIX_ALT }),
    check({ key: "seo-pages", label: "Indexable content pages", weight: 9, frac: m.pageCount > 0 ? 1 : 0,
      pass: `${m.pageCount} content page(s) live.`, gap: "No About/FAQ pages — missing keyword surface and internal links.",
      why: "About/FAQ pages add indexable keyword surface and internal links that lift the whole domain.", fix: FIX_PAGES }),
    check({ key: "seo-blog", label: "Blog for long-tail search", weight: 8, frac: m.blogCount > 0 ? 1 : 0,
      pass: `${m.blogCount} blog article(s) published.`, gap: "No blog — no engine for informational and long-tail rankings.",
      why: "A blog is how you rank for the informational searches buyers make before they're ready to buy.", fix: FIX_BLOG }),
  ];

  const Content: CheckItem[] = [
    check({ key: "c-pages", label: "About & FAQ pages", weight: 22, frac: m.pageCount > 0 ? 1 : 0,
      pass: `${m.pageCount} content page(s) live.`, gap: "No About/FAQ pages to build trust and answer objections.",
      why: "Trust pages convert hesitant buyers and pre-empt the objections that kill a sale.", fix: FIX_PAGES }),
    check({ key: "c-blog", label: "Blog established (5+ articles)", weight: 38, frac: Math.min(1, m.blogCount / 5),
      pass: `${m.blogCount} blog articles — strong momentum.`, gap: `${m.blogCount} blog article(s) — aim for 5+ to build momentum.`,
      why: "Regular buyer-intent articles compound into a durable, free organic-traffic channel.", fix: FIX_BLOG }),
    check({ key: "c-collections", label: "Collection landing pages", weight: 25, frac: Math.min(1, m.collectionCount / 3),
      pass: `${m.collectionCount} collections organize the catalog.`, gap: `Only ${m.collectionCount} collection(s) — thin category structure.`,
      why: "Collection pages are content landing zones that rank for category searches and help shoppers browse.", fix: FIX_COLLECTIONS }),
    check({ key: "c-depth", label: "Catalog depth for content", weight: 15, frac: Math.min(1, m.productCount / 10),
      pass: `${m.productCount} products give plenty to write about.`, gap: `${m.productCount} product(s) — a fuller catalog supports more content.`,
      why: "Enough products to support category pages, internal linking, and comparison articles." }),
  ];

  const Catalog: CheckItem[] = [
    check({ key: "cat-images", label: "Multiple product images (2+)", weight: 35, frac: ratioOk(m.fewImages),
      pass: `${all} have 2+ images.`, gap: `${of(m.fewImages)} have fewer than 2 images.`,
      why: "Multiple angles and lifestyle shots are the #1 on-page driver of product conversion.", fix: FIX_IMAGES }),
    check({ key: "cat-alt", label: "Image alt text", weight: 18, frac: ratioOk(m.missingAlt),
      pass: `${all} have alt text on images.`, gap: `${of(m.missingAlt)} have images without alt text.`,
      why: "Alt text powers image search and accessibility, and helps AI read your photos.", fix: FIX_ALT }),
    check({ key: "cat-collections", label: "Collection structure", weight: 27, frac: Math.min(1, m.collectionCount / 3),
      pass: `${m.collectionCount} collections — clear browsing paths.`, gap: `Only ${m.collectionCount} collection(s) — shoppers can't browse by category.`,
      why: "A clear collection structure helps shoppers find products and adds ranking entry points.", fix: FIX_COLLECTIONS }),
    check({ key: "cat-breadth", label: "Catalog breadth", weight: 20, frac: Math.min(1, m.productCount / 10),
      pass: `${m.productCount} products give shoppers real choice.`, gap: `${m.productCount} product(s) — a fuller range lifts AOV and time-on-site.`,
      why: "A fuller catalog gives shoppers reasons to stay, compare, and buy more per visit." }),
  ];

  // AI-agent readiness (AEO): the machine-readable signals an AI shopping agent
  // (ChatGPT, Claude, Gemini, Perplexity) needs to confidently compare & recommend you.
  const AiReady: CheckItem[] = [
    check({ key: "ai-desc", label: "Rich, structured descriptions", weight: 22, frac: ratioOk(m.missingDesc),
      pass: `${all} have substantial descriptions to read.`, gap: `${of(m.missingDesc)} have thin or missing descriptions.`,
      why: "AI shopping agents read your description text to understand, compare, and recommend products — thin copy makes you invisible to them.", fix: FIX_DESC }),
    check({ key: "ai-seo-title", label: "Clear product titles", weight: 14, frac: ratioOk(m.missingSeoTitle),
      pass: `${all} have an explicit title.`, gap: `${of(m.missingSeoTitle)} have no explicit SEO title.`,
      why: "The title is the primary label an agent uses to know what a product is and when to surface it.", fix: FIX_SEO_TITLE }),
    check({ key: "ai-alt", label: "Descriptive image alt text", weight: 14, frac: ratioOk(m.missingAlt),
      pass: `${all} have alt text agents can read.`, gap: `${of(m.missingAlt)} have images without alt text.`,
      why: "Agents and multimodal models rely on alt text to know what each photo shows and match it to shopper queries.", fix: FIX_ALT }),
    check({ key: "ai-meta", label: "Machine-readable summaries", weight: 12, frac: ratioOk(m.missingSeoDesc),
      pass: `${all} have a concise summary.`, gap: `${of(m.missingSeoDesc)} have no meta description.`,
      why: "Meta descriptions are the short, structured summary agents quote when they recommend you.", fix: FIX_META }),
    check({ key: "ai-images", label: "Multiple product images", weight: 10, frac: ratioOk(m.fewImages),
      pass: `${all} have 2+ images.`, gap: `${of(m.fewImages)} have fewer than 2 images.`,
      why: "Multiple angles give multimodal AI the visual detail it needs to trust and surface a product.", fix: FIX_IMAGES }),
    check({ key: "ai-pages", label: "Context pages (About/FAQ)", weight: 12, frac: m.pageCount > 0 ? 1 : 0,
      pass: `${m.pageCount} context page(s) for agents to cite.`, gap: "No About/FAQ pages — agents have no shipping, returns, or brand context.",
      why: "Agents pull shipping, returns, and brand facts from your About/FAQ pages to answer buyer questions confidently.", fix: FIX_PAGES }),
    check({ key: "ai-dup", label: "Unambiguous titles", weight: 8, frac: m.dupTitle > 0 ? 0 : 1,
      pass: "No duplicate titles detected.", gap: `${m.dupTitle} duplicate titles make products ambiguous.`,
      why: "Duplicate titles make it unclear which product to surface, so agents tend to skip all of them.", fix: FIX_DUP }),
    check({ key: "ai-blog", label: "Comparison / buyer-intent content", weight: 8, frac: m.blogCount > 0 ? 1 : 0,
      pass: `${m.blogCount} article(s) agents can cite.`, gap: "No comparison or buyer-intent articles for agents to cite.",
      why: "Comparison and buyer-intent articles are exactly what AI agents reference when recommending a store.", fix: FIX_BLOG }),
  ];

  return { SEO, Content, Catalog, "AI Ready": AiReady };
}

function scoreFromChecklist(items: CheckItem[]): number {
  return clamp(items.reduce((a, i) => a + i.earned, 0));
}

function deterministic(m: Metrics): { scores: Score[]; findings: string[]; breakdowns: Record<string, CheckItem[]> } {
  const breakdowns = buildChecklists(m);
  const scores: Score[] = Object.entries(breakdowns).map(([label, items]) => {
    const value = scoreFromChecklist(items);
    return { label, value, color: scoreColor(value) };
  });
  const aiReady = scores.find((x) => x.label === "AI Ready")?.value ?? 0;

  const findings: string[] = [];
  if (m.missingDesc > 0) findings.push(`${m.missingDesc} of ${m.sampled} sampled products have thin or missing descriptions`);
  if (m.fewImages > 0) findings.push(`${m.fewImages} of ${m.sampled} sampled products have fewer than 2 images`);
  if (m.blogCount === 0) findings.push("No blog content — missing an organic traffic + trust channel");
  if (m.pageCount === 0) findings.push("No content pages (About/FAQ) to build trust and handle objections");
  if (m.collectionCount <= 1) findings.push("Thin collection structure — weak catalog navigation");
  if (aiReady < 70) findings.push("Limited AI-agent readiness — product data/attributes aren't structured enough for AI shopping agents to compare and recommend");
  if (!findings.length) findings.push("No major structural issues detected — focus on conversion polish");
  return { scores, findings, breakdowns };
}


const REPORT_SYSTEM = `You are ShopHero's store analyst. Given a store's metrics and deterministic findings, write a SHORT report for the merchant.
Ground every recommendation in the CRO playbook below; be specific to this store's numbers; prefer offer, trust, product-page, AOV, SEO, content and speed levers.
Each recommendation's "prompt" must be a concrete instruction the ShopHero agent can run on the theme or via the Shopify Admin API.
Respond with ONLY JSON, no prose, no code fences:
{"summary":"ONE short, punchy sentence (max ~22 words) naming the single biggest opportunity — no stats dumps","recommendations":[{"area":"CRO|SEO|Speed|Content|Design|AOV|Trust","impact":"high|med|low","title":"…","desc":"why it matters for this store","prompt":"a concrete instruction"}]}`;

function safeParse(text: string): { summary: string; recommendations: Recommendation[] } {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s > 0 || e < t.length - 1) t = t.slice(s, e + 1);
  try {
    const obj = JSON.parse(t) as { summary?: unknown; recommendations?: unknown };
    const list = Array.isArray(obj.recommendations) ? obj.recommendations : [];
    const recommendations = list
      .map((r) => r as Record<string, unknown>)
      .filter((r) => typeof r.title === "string" && typeof r.prompt === "string")
      .map((r) => ({
        area: String(r.area ?? "CRO"),
        impact: (["high", "med", "low"].includes(String(r.impact)) ? r.impact : "med") as Recommendation["impact"],
        title: String(r.title),
        desc: String(r.desc ?? ""),
        prompt: String(r.prompt),
      }))
      .slice(0, 12);
    return { summary: typeof obj.summary === "string" ? obj.summary : "", recommendations };
  } catch {
    return { summary: "", recommendations: [] };
  }
}

function parseReportRow(row: { scores: string | null; health?: number | null; breakdowns?: string | null; history?: string | null; issues?: string | null; findings: string | null; summary: string | null; recommendations: string | null; generatedAt: Date } | null): StoreReport | null {
  if (!row) return null;
  const j = <T,>(s: string | null | undefined, fb: T): T => {
    if (!s) return fb;
    try { return JSON.parse(s) as T; } catch { return fb; }
  };
  const scores = j<Score[]>(row.scores, []);
  const fallbackHealth = scores.length ? Math.round(scores.reduce((a, s) => a + s.value, 0) / scores.length) : 0;
  return {
    scores,
    health: typeof row.health === "number" ? row.health : fallbackHealth,
    breakdowns: j<Record<string, Breakdown[]>>(row.breakdowns, {}),
    history: j<ScoreHistoryPoint[]>(row.history, []),
    issues: j<Issue[]>(row.issues, []),
    findings: j<string[]>(row.findings, []),
    summary: row.summary ?? "",
    recommendations: j<Recommendation[]>(row.recommendations, []),
    generatedAt: row.generatedAt.toISOString(),
    cached: true,
  };
}

/** DB-only read for fast dashboard render (never calls the model). */
export async function getCachedReport(shop: string): Promise<StoreReport | null> {
  const row = await db.storeReport.findUnique({ where: { shop } });
  return parseReportRow(row);
}

/**
 * Return the report, regenerating the AI narrative only when the store changed
 * (hash) and the throttle window has passed — or when forced. Otherwise $0.
 */
export async function getOrBuildReport(
  admin: AdminApiContext,
  shop: string,
  plan: string | null,
  opts: { force?: boolean } = {},
): Promise<StoreReport> {
  const [snap, signals] = await Promise.all([gatherStoreSnapshot(admin), gatherCatalogSignals(admin)]);
  const metrics = await gatherMetrics(admin, snap, signals);
  const hash = hashOf(metrics);
  const { scores, findings, breakdowns } = deterministic(metrics);
  const issues = buildIssues(metrics);
  const health = healthFrom(issues);

  const existing = await db.storeReport.findUnique({ where: { shop } });
  const ageHours = existing ? (Date.now() - existing.generatedAt.getTime()) / 3.6e6 : Infinity;
  const changed = !existing || existing.hash !== hash;
  const shouldRegen = opts.force || (changed && ageHours >= MIN_REGEN_HOURS) || !existing;

  // Append today's snapshot to the score history (one point per day, last 60 kept).
  const today = new Date().toISOString().slice(0, 10);
  const prevHistory: ScoreHistoryPoint[] = existing?.history ? (() => { try { return JSON.parse(existing.history!); } catch { return []; } })() : [];
  const point: ScoreHistoryPoint = { date: today, health };
  for (const s of scores) point[s.label] = s.value;
  const history = [...prevHistory.filter((p) => p.date !== today), point].slice(-60);
  const historyJson = JSON.stringify(history);
  const breakdownsJson = JSON.stringify(breakdowns);

  if (!shouldRegen && existing) {
    // Refresh the cheap deterministic layer, keep the cached AI narrative.
    const updated = await db.storeReport.update({
      where: { shop },
      data: { scores: JSON.stringify(scores), findings: JSON.stringify(findings), health, issues: JSON.stringify(issues), breakdowns: breakdownsJson, history: historyJson },
    });
    return { ...parseReportRow(updated)!, cached: true };
  }

  // Regenerate the AI narrative.
  let summary = "";
  let recommendations: Recommendation[] = [];
  let model: string | undefined;
  let costUsd: number | undefined;

  const byokKey = plan === "byok" ? (await resolveKey(shop, plan)) ?? undefined : undefined;
  if (plan !== "byok" || byokKey) {
    try {
      const ctx = [
        `Store: ${snap.name ?? "—"} · theme "${metrics.themeName || "—"}"`,
        `Catalog: ${metrics.productCount} products, ${metrics.collectionCount} collections, ${metrics.pageCount} pages, ${metrics.blogCount} blogs`,
        metrics.priceMedian ? `Typical price ≈ ${Math.round(metrics.priceMedian)} ${snap.currency ?? ""}` : "",
        `Sampled ${metrics.sampled} products: ${metrics.missingDesc} missing descriptions, ${metrics.fewImages} with <2 images`,
        "",
        "Deterministic findings:",
        ...findings.map((f) => `- ${f}`),
      ].filter(Boolean).join("\n");

      const res = await complete({ cachePrefix: CRO_PLAYBOOK, system: REPORT_SYSTEM, user: ctx, maxTokens: 2200, tier: "cheap", byokKey });
      const parsed = safeParse(res.text);
      summary = parsed.summary;
      recommendations = parsed.recommendations;
      model = res.model;
      costUsd = res.costUsd;

      await db.usageEvent
        .create({
          data: {
            shop,
            plan,
            model: res.model,
            kind: "report",
            costUsd: res.costUsd,
            billedUsd: plan === "managed" ? res.costUsd * 3 : 0,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
          },
        })
        .catch(() => {});
    } catch (e) {
      console.warn("[report] AI narrative failed, keeping deterministic only:", e instanceof Error ? e.message : e);
    }
  }

  // Keep prior narrative if the model call failed but we had one before.
  if (!recommendations.length && existing) {
    const prev = parseReportRow(existing);
    if (prev) {
      summary = prev.summary;
      recommendations = prev.recommendations;
    }
  }

  const data = {
    hash,
    scores: JSON.stringify(scores),
    health,
    issues: JSON.stringify(issues),
    breakdowns: breakdownsJson,
    history: historyJson,
    findings: JSON.stringify(findings),
    summary,
    recommendations: JSON.stringify(recommendations),
    model: model ?? null,
    costUsd: costUsd ?? null,
    generatedAt: new Date(),
  };
  await db.storeReport.upsert({ where: { shop }, create: { shop, ...data }, update: data });

  return { scores, health, breakdowns, history, issues, findings, summary, recommendations, generatedAt: data.generatedAt.toISOString(), cached: false };
}
