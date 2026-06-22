import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import CRO_PLAYBOOK from "../knowledge/cro.md?raw";
import db from "../db.server";
import { decrypt } from "./crypto.server";
import { orderedKeys } from "./key-pool.server";
import { complete } from "./llm.server";

/**
 * Onboarding analysis — the engine behind the multi-step wizard.
 *
 * It (1) reads a lightweight snapshot of the live store, (2) combines it with
 * what the merchant told us about their goals, and (3) produces a ranked list of
 * personalized recommendations. Each recommendation carries a ready-to-run
 * prompt the dashboard can hand straight to the agent.
 *
 * The analysis uses a single cheap Claude call grounded in the CRO playbook. If
 * no key is available or the call fails, a deterministic rules engine produces a
 * solid fallback so onboarding NEVER dead-ends.
 */

export interface Recommendation {
  /** "CRO" | "SEO" | "Speed" | "Content" | "Design" | "AOV" | "Trust" | ... */
  area: string;
  impact: "high" | "med" | "low";
  title: string;
  /** Why it matters for THIS store, in one or two sentences. */
  desc: string;
  /** A concrete instruction the ShopHero agent can execute. */
  prompt: string;
}

/** An estimated revenue leak shown in the onboarding "leak report". */
export interface Leak {
  title: string;
  impactUsd: number; // estimated annual $ recoverable
}

export interface OnboardingAnswers {
  sells?: string;
  goals?: string[];
  audience?: string;
  aov?: string;
  revenue?: string;
  challenge?: string;
  voice?: string;
  admire?: string;
  notes?: string;
}

export interface StoreSnapshot {
  name?: string;
  domain?: string;
  currency?: string;
  productCount?: number;
  collectionCount?: number;
  pageCount?: number;
  blogCount?: number;
  themeName?: string;
  sampleProduct?: { title: string; hasDescription: boolean; images: number; variants: number };
}

// ── Store snapshot ──────────────────────────────────────────────────────────

export async function gql<T>(admin: AdminApiContext, q: string): Promise<T | null> {
  try {
    const r = await admin.graphql(q);
    const { data } = (await r.json()) as { data?: T };
    return data ?? null;
  } catch {
    return null;
  }
}

/** Read-only snapshot of the live store — every query is best-effort. */
export async function gatherStoreSnapshot(admin: AdminApiContext): Promise<StoreSnapshot> {
  const snap: StoreSnapshot = {};

  const shop = await gql<{ shop?: { name?: string; myshopifyDomain?: string; currencyCode?: string } }>(
    admin,
    `{ shop { name myshopifyDomain currencyCode } }`,
  );
  snap.name = shop?.shop?.name;
  snap.domain = shop?.shop?.myshopifyDomain;
  snap.currency = shop?.shop?.currencyCode;

  const counts = await gql<{ productsCount?: { count?: number }; collectionsCount?: { count?: number } }>(
    admin,
    `{ productsCount { count } collectionsCount { count } }`,
  );
  snap.productCount = counts?.productsCount?.count;
  snap.collectionCount = counts?.collectionsCount?.count;

  const pages = await gql<{ pages?: { nodes?: unknown[] } }>(admin, `{ pages(first: 50) { nodes { id } } }`);
  snap.pageCount = pages?.pages?.nodes?.length;

  const blogs = await gql<{ blogs?: { nodes?: unknown[] } }>(admin, `{ blogs(first: 50) { nodes { id } } }`);
  snap.blogCount = blogs?.blogs?.nodes?.length;

  const themes = await gql<{ themes?: { nodes?: { name?: string; role?: string }[] } }>(
    admin,
    `{ themes(first: 20) { nodes { name role } } }`,
  );
  snap.themeName = themes?.themes?.nodes?.find((t) => t.role === "MAIN")?.name;

  const prod = await gql<{
    products?: { nodes?: { title?: string; descriptionHtml?: string; images?: { nodes?: unknown[] }; variants?: { nodes?: unknown[] } }[] };
  }>(
    admin,
    `{ products(first: 1) { nodes { title descriptionHtml images(first: 10) { nodes { id } } variants(first: 10) { nodes { id } } } } }`,
  );
  const p = prod?.products?.nodes?.[0];
  if (p) {
    snap.sampleProduct = {
      title: p.title ?? "",
      hasDescription: !!(p.descriptionHtml && p.descriptionHtml.trim().length > 20),
      images: p.images?.nodes?.length ?? 0,
      variants: p.variants?.nodes?.length ?? 0,
    };
  }

  return snap;
}

// ── AI analysis ─────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are ShopHero's onboarding strategist. Given a snapshot of a Shopify store and the merchant's stated goals, produce a SHORT, ranked list of the highest-leverage opportunities for THIS specific store.

Rules:
- Ground every recommendation in the CRO playbook below — prefer offer, trust, product page, AOV, speed, SEO, and content levers proven to move RPV/PPV.
- Be specific to the store's facts and goals (e.g. "you have 0 blog posts", "your goal is higher AOV"). No generic filler.
- Each recommendation must include a "prompt": a single, concrete instruction the ShopHero agent can execute on the theme or via the Shopify Admin API (products, collections, pages, blogs). Write prompts as direct commands, e.g. "Add trust badges below the add-to-cart button…".
- Rank by impact. Return 8–12 items so the plan feels complete.

Respond with ONLY a JSON object, no prose, no code fences:
{"recommendations":[{"area":"CRO|SEO|Speed|Content|Design|AOV|Trust","impact":"high|med|low","title":"…","desc":"why it matters for this store","prompt":"a concrete instruction for the agent"}]}`;

/** Strip code fences / surrounding prose and parse the first JSON object. */
function safeParseRecs(text: string): Recommendation[] {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start > 0 || end < t.length - 1) t = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(t) as { recommendations?: unknown };
    const list = Array.isArray(obj.recommendations) ? obj.recommendations : [];
    return list
      .map((r) => r as Record<string, unknown>)
      .filter((r) => typeof r.title === "string" && typeof r.prompt === "string")
      .map((r) => ({
        area: String(r.area ?? "CRO"),
        impact: (["high", "med", "low"].includes(String(r.impact)) ? r.impact : "med") as Recommendation["impact"],
        title: String(r.title),
        desc: String(r.desc ?? ""),
        prompt: String(r.prompt),
      }))
      .slice(0, 7);
  } catch {
    return [];
  }
}

export async function resolveKey(shop: string, plan: string | null): Promise<string | undefined> {
  if (plan === "byok") {
    const rec = await db.shopSettings.findUnique({ where: { shop } });
    return rec?.anthropicApiKey ? decrypt(rec.anthropicApiKey) : undefined;
  }
  return orderedKeys()[0] ?? process.env.ANTHROPIC_API_KEY ?? undefined;
}

function describeForPrompt(snapshot: StoreSnapshot, a: OnboardingAnswers): string {
  const lines = [
    `Store: ${snapshot.name ?? "—"} (${snapshot.domain ?? "—"}), currency ${snapshot.currency ?? "—"}.`,
    `Theme: ${snapshot.themeName ?? "—"}.`,
    `Catalog: ${snapshot.productCount ?? "?"} products, ${snapshot.collectionCount ?? "?"} collections, ${snapshot.pageCount ?? "?"} pages, ${snapshot.blogCount ?? 0} blogs.`,
  ];
  if (snapshot.sampleProduct) {
    const sp = snapshot.sampleProduct;
    lines.push(
      `Sample product "${sp.title}": ${sp.hasDescription ? "has" : "MISSING"} description, ${sp.images} images, ${sp.variants} variants.`,
    );
  }
  lines.push("");
  lines.push("What the merchant told us:");
  if (a.sells) lines.push(`- Sells: ${a.sells}`);
  if (a.goals?.length) lines.push(`- Primary goals: ${a.goals.join(", ")}`);
  if (a.audience) lines.push(`- Target audience: ${a.audience}`);
  if (a.aov) lines.push(`- Average order value: ${a.aov}`);
  if (a.revenue) lines.push(`- Monthly revenue: ${a.revenue}`);
  if (a.challenge) lines.push(`- Biggest challenge: ${a.challenge}`);
  if (a.voice) lines.push(`- Brand voice: ${a.voice}`);
  if (a.admire) lines.push(`- Brands they admire: ${a.admire}`);
  if (a.notes) lines.push(`- Other notes: ${a.notes}`);
  return lines.join("\n");
}

async function aiRecommendations(
  snapshot: StoreSnapshot,
  answers: OnboardingAnswers,
  byokKey?: string,
): Promise<{ recs: Recommendation[]; costUsd?: number; inputTokens?: number; outputTokens?: number; model: string }> {
  const res = await complete({
    cachePrefix: CRO_PLAYBOOK,
    system: ANALYSIS_SYSTEM,
    user: describeForPrompt(snapshot, answers),
    maxTokens: 2500,
    tier: "cheap",
    byokKey,
  });
  return { recs: safeParseRecs(res.text), inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd, model: res.model };
}

// ── Deterministic fallback ──────────────────────────────────────────────────

/** Rules-based plan used when AI is unavailable — always returns something. */
export function curatedFallback(snapshot: StoreSnapshot, a: OnboardingAnswers): Recommendation[] {
  const goals = new Set(a.goals ?? []);
  const recs: Recommendation[] = [];

  // Always a strong product-page CRO move.
  recs.push({
    area: "Trust",
    impact: "high",
    title: "Add trust signals at the buy button",
    desc: "Secure-payment, free-returns and shipping-ETA cues directly under add-to-cart reduce hesitation and lift conversion.",
    prompt:
      "Add a row of trust badges (secure payment, free returns, fast shipping) directly below the add-to-cart button on the product page, matching my theme's style.",
  });

  if (goals.has("aov") || (snapshot.sampleProduct && snapshot.sampleProduct.variants <= 1)) {
    recs.push({
      area: "AOV",
      impact: "high",
      title: "Raise average order value with bundles",
      desc: "Multipack/bundle offers and a pre-checked add-on are the fastest way to lift AOV without new traffic.",
      prompt:
        "Propose and set up a simple bundle/multipack offer for my best product (e.g. buy-2-save) and add a complementary add-on section on the product page. Explain any live store changes before making them.",
    });
  }

  if (goals.has("conversions") || goals.has("design")) {
    recs.push({
      area: "Design",
      impact: "high",
      title: "Sharpen the homepage hero",
      desc: "A clear headline (the outcome), a benefit subheadline, the product front-and-center, and one obvious CTA drive more clicks into the funnel.",
      prompt:
        "Redesign my homepage hero: a clear outcome-led headline, a benefit subheadline, the product front and center, and one high-contrast 'Shop now' CTA — matching my color scheme.",
    });
  }

  if (goals.has("speed") || !snapshot.themeName) {
    recs.push({
      area: "Speed",
      impact: "high",
      title: "Speed up the storefront",
      desc: "Every second of load time costs ~7% of conversions; offscreen images are the usual culprit.",
      prompt:
        "Audit my theme for speed and apply the safe wins: lazy-load offscreen images (keep the hero/LCP eager), defer non-critical scripts, and remove unused CSS. Summarize the impact.",
    });
  }

  if (goals.has("seo") || (snapshot.sampleProduct && !snapshot.sampleProduct.hasDescription)) {
    recs.push({
      area: "SEO",
      impact: "med",
      title: "Run an SEO pass",
      desc: "Strong titles, meta descriptions, heading hierarchy and image alt text improve ranking and click-through.",
      prompt:
        "Run a full SEO pass: improve product/page titles and meta descriptions, fix heading hierarchy and image alt text, and add structured data where missing. Show before/after.",
    });
  }

  if (goals.has("content") || (snapshot.blogCount ?? 0) === 0) {
    recs.push({
      area: "Content",
      impact: "med",
      title: "Start a content engine",
      desc: "On-brand, internally-linked blog posts build organic traffic and answer buyer objections before they bounce.",
      prompt:
        "Write 3 on-brand blog posts (800 words each) about topics my customers care about — internally linked, with SEO titles and meta descriptions.",
    });
  }

  // Objection-handling reviews — universally valuable.
  recs.push({
    area: "CRO",
    impact: "med",
    title: "Turn reviews into objection-handlers",
    desc: 'Reviews framed as "At first I thought X, but actually Y" pre-empt the doubts that stop buyers.',
    prompt:
      "Add a reviews section to the product page and highlight objection-handling reviews using the 'at first I thought X, but actually Y' framing. If a reviews source isn't connected, tell me which app to add.",
  });

  return recs.slice(0, 7);
}

// ── Auto-analyze (fill the profile FOR the merchant) ────────────────────────

export interface CatalogSignals {
  productTypes: string[];
  vendors: string[];
  sampleTitles: string[];
  priceMin?: number;
  priceMax?: number;
  priceMedian?: number;
}

export interface AutofillResult {
  fields: { sells?: string; audience?: string; voice?: string; aov?: string };
  goals: string[];
  detected: string[]; // factual bullets shown back to the merchant
  learnings: string[]; // "here's what we already learned" cards
  leaks: Leak[]; // estimated revenue-leak report
  estLow: number; // estimated annual upside range, low
  estHigh: number; // estimated annual upside range, high
  usage?: { inputTokens?: number; outputTokens?: number };
  costUsd?: number;
  model?: string;
}

const nice = (n: number): number => Math.max(0, Math.round(n / 100) * 100);

/**
 * Conservative annual-revenue baseline from catalog signals only (we have no
 * order-read scope). Deliberately cautious: a new or small store likely has
 * little to no sales, so we assume a modest order volume that scales gently with
 * catalog size and cap the result — we'd rather under-promise than show a brand
 * new store a fabricated six-figure number. When the merchant states their real
 * revenue, that value is used instead (see finalizePlan / the action).
 */
function baselineAnnual(snap: StoreSnapshot, signals: CatalogSignals): number {
  const avg = signals.priceMedian ?? 40;
  const pc = snap.productCount ?? signals.sampleTitles.length ?? 10;
  const ordersMo = pc >= 500 ? 200 : pc >= 100 ? 80 : pc >= 20 ? 25 : 8;
  return Math.min(ordersMo * avg * 12, 500_000);
}

/** "Here's what we already learned" — real facts + reasonable inferences. */
function buildLearnings(snap: StoreSnapshot, signals: CatalogSignals, fields: AutofillResult["fields"]): string[] {
  const cur = snap.currency ?? "";
  const L: string[] = [];
  if (fields.sells) L.push(`Sells: ${fields.sells}`);
  if (snap.productCount != null) L.push(`${snap.productCount} products`);
  if (signals.priceMedian) L.push(`Average price ${Math.round(signals.priceMedian)} ${cur}`.trim());
  if (signals.priceMedian)
    L.push(signals.priceMedian >= 80 ? "Premium positioning" : signals.priceMedian >= 35 ? "Mid-market positioning" : "Value positioning");
  L.push(fields.audience ? fields.audience : "Mobile-first audience");
  L.push((snap.blogCount ?? 0) === 0 ? "Limited content strategy" : `${snap.blogCount} content pieces published`);
  L.push((snap.collectionCount ?? 0) <= 2 ? "Collection structure needs optimization" : `${snap.collectionCount} collections`);
  if (snap.sampleProduct && !snap.sampleProduct.hasDescription) L.push("Thin product descriptions");
  if (snap.themeName) L.push(`Theme: ${snap.themeName}`);
  return L;
}

/** Estimated revenue leaks, weighted toward the store's detected weaknesses. */
function buildLeaks(snap: StoreSnapshot, signals: CatalogSignals, base: number): Leak[] {
  const thin = !!(snap.sampleProduct && !snap.sampleProduct.hasDescription);
  const fewImg = !!(snap.sampleProduct && snap.sampleProduct.images < 3);
  const cand: Leak[] = [
    { title: "Product page friction", impactUsd: nice(base * (thin || fewImg ? 0.06 : 0.045)) },
    { title: "Low average order value", impactUsd: nice(base * 0.04) },
    { title: "Missing trust builders", impactUsd: nice(base * 0.032) },
    { title: "SEO opportunity", impactUsd: nice(base * (thin ? 0.034 : 0.025)) },
  ];
  if ((snap.blogCount ?? 0) === 0) cand.push({ title: "Thin content strategy", impactUsd: nice(base * 0.022) });
  if ((snap.collectionCount ?? 0) <= 2) cand.push({ title: "Weak collection structure", impactUsd: nice(base * 0.02) });
  return cand.sort((a, b) => b.impactUsd - a.impactUsd).slice(0, 4);
}

/** Annual revenue midpoint for a stated revenue bucket (0 = unknown). */
export function revenueFromBucket(bucket?: string): number {
  switch (bucket) {
    case "Under $5k/mo":
      return 36000;
    case "$5k–$25k/mo":
      return 180000;
    case "$25k–$100k/mo":
      return 720000;
    case "$100k+/mo":
      return 1800000;
    default:
      return 0;
  }
}

/** Final plan headline numbers, recomputed against the merchant's stated revenue. */
export function finalizePlan(
  recs: Recommendation[],
  revenueAnnual: number,
): { count: number; annualUsd: number; monthlyUsd: number; priority: number } {
  const pct = Math.min(
    0.35,
    recs.reduce((s, r) => s + (r.impact === "high" ? 0.035 : r.impact === "med" ? 0.02 : 0.012), 0),
  );
  const annual = nice((revenueAnnual > 0 ? revenueAnnual : 80000) * pct);
  const high = recs.filter((r) => r.impact === "high").length;
  const priority = Math.max(62, Math.min(98, Math.round(58 + recs.length * 3 + high * 4)));
  return { count: recs.length, annualUsd: annual, monthlyUsd: nice(annual / 12), priority };
}

export async function gatherCatalogSignals(admin: AdminApiContext): Promise<CatalogSignals> {
  const d = await gql<{
    products?: {
      nodes?: {
        title?: string;
        productType?: string;
        vendor?: string;
        priceRangeV2?: { minVariantPrice?: { amount?: string } };
      }[];
    };
  }>(
    admin,
    `{ products(first: 30) { nodes { title productType vendor priceRangeV2 { minVariantPrice { amount } } } } }`,
  );
  const nodes = d?.products?.nodes ?? [];
  const types = new Set<string>();
  const vendors = new Set<string>();
  const titles: string[] = [];
  const prices: number[] = [];
  for (const n of nodes) {
    if (n.productType) types.add(n.productType);
    if (n.vendor) vendors.add(n.vendor);
    if (n.title) titles.push(n.title);
    const mn = Number(n.priceRangeV2?.minVariantPrice?.amount);
    if (Number.isFinite(mn) && mn > 0) prices.push(mn);
  }
  prices.sort((a, b) => a - b);
  return {
    productTypes: [...types],
    vendors: [...vendors],
    sampleTitles: titles.slice(0, 12),
    priceMin: prices[0],
    priceMax: prices[prices.length - 1],
    priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : undefined,
  };
}

/** Estimate an AOV bucket from typical product price (AOV usually runs higher). */
function aovBucket(median?: number): string | undefined {
  if (!median) return undefined;
  const est = median * 1.35;
  if (est < 30) return "Under $30";
  if (est < 60) return "$30–$60";
  if (est < 120) return "$60–$120";
  if (est < 300) return "$120–$300";
  return "$300+";
}

const ALLOWED_GOALS = new Set(["conversions", "aov", "seo", "speed", "design", "content"]);

const AUTOFILL_SYSTEM = `You are ShopHero's store analyst. From the catalog signals below, infer a crisp, confident profile of this Shopify store — it's shown back to the merchant as "here's what we detected," so be specific, not generic.
Respond with ONLY JSON, no prose, no code fences:
{"sells":"one concise line of what they sell","audience":"their likely target customer in a short phrase","voice":"2–4 words of brand voice","goals":["conversions"|"aov"|"seo"|"speed"|"design"|"content", up to 3 most relevant]}`;

async function aiAutofill(
  snap: StoreSnapshot,
  signals: CatalogSignals,
  byokKey?: string,
): Promise<{ fields: AutofillResult["fields"]; goals: string[]; inputTokens?: number; outputTokens?: number; costUsd?: number; model: string }> {
  const ctx = [
    `Shop name: ${snap.name ?? "—"}`,
    `Products: ${snap.productCount ?? signals.sampleTitles.length}`,
    signals.productTypes.length ? `Categories: ${signals.productTypes.join(", ")}` : "",
    signals.vendors.length ? `Brands/vendors: ${signals.vendors.slice(0, 6).join(", ")}` : "",
    signals.sampleTitles.length ? `Sample products: ${signals.sampleTitles.join("; ")}` : "",
    signals.priceMedian ? `Typical price ≈ ${Math.round(signals.priceMedian)} ${snap.currency ?? ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await complete({ system: AUTOFILL_SYSTEM, user: ctx, maxTokens: 500, tier: "cheap", byokKey });

  let parsed: { sells?: unknown; audience?: unknown; voice?: unknown; goals?: unknown } = {};
  try {
    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s > 0 || e < t.length - 1) t = t.slice(s, e + 1);
    parsed = JSON.parse(t);
  } catch {
    /* fall through to whatever parsed */
  }
  const goals = Array.isArray(parsed.goals)
    ? (parsed.goals as unknown[]).map(String).filter((g) => ALLOWED_GOALS.has(g)).slice(0, 3)
    : [];
  return {
    fields: {
      sells: typeof parsed.sells === "string" ? parsed.sells : undefined,
      audience: typeof parsed.audience === "string" ? parsed.audience : undefined,
      voice: typeof parsed.voice === "string" ? parsed.voice : undefined,
    },
    goals,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    costUsd: res.costUsd,
    model: res.model,
  };
}

function heuristicAutofill(snap: StoreSnapshot, signals: CatalogSignals): { fields: AutofillResult["fields"]; goals: string[] } {
  const sells = signals.productTypes.length
    ? signals.productTypes.slice(0, 3).join(", ")
    : snap.name
      ? `products from ${snap.name}`
      : undefined;
  const goals: string[] = [];
  if ((snap.blogCount ?? 0) === 0) goals.push("content");
  if (snap.sampleProduct && !snap.sampleProduct.hasDescription) goals.push("seo");
  goals.push("conversions");
  return { fields: { sells }, goals: [...new Set(goals)].slice(0, 3) };
}

function buildDetected(snap: StoreSnapshot, signals: CatalogSignals): string[] {
  const out: string[] = [];
  const cur = snap.currency ?? "";
  if (snap.productCount != null)
    out.push(
      `📦 ${snap.productCount} product${snap.productCount === 1 ? "" : "s"}${signals.productTypes.length ? ` across ${signals.productTypes.slice(0, 3).join(", ")}` : ""}`,
    );
  if (signals.priceMin != null && signals.priceMax != null)
    out.push(
      `💵 Prices ${Math.round(signals.priceMin)}–${Math.round(signals.priceMax)} ${cur}${signals.priceMedian ? ` (typical ≈ ${Math.round(signals.priceMedian)})` : ""}`,
    );
  if (snap.themeName) out.push(`🎨 Theme "${snap.themeName}"`);
  out.push(`📝 ${snap.blogCount ?? 0} blog post${(snap.blogCount ?? 0) === 1 ? "" : "s"} · ${snap.pageCount ?? 0} page${(snap.pageCount ?? 0) === 1 ? "" : "s"}`);
  if (snap.sampleProduct && !snap.sampleProduct.hasDescription) out.push(`⚠️ Thin or missing product descriptions`);
  if (snap.sampleProduct && snap.sampleProduct.images < 3) out.push(`⚠️ Products with too few images`);
  return out;
}

/** Scan the store and infer the profile fields FOR the merchant. */
export async function autofillProfile(opts: { admin: AdminApiContext; shop: string; plan: string | null }): Promise<AutofillResult> {
  const [snap, signals] = await Promise.all([gatherStoreSnapshot(opts.admin), gatherCatalogSignals(opts.admin)]);
  const byokKey = opts.plan === "byok" ? (await resolveKey(opts.shop, opts.plan)) ?? undefined : undefined;

  let base: { fields: AutofillResult["fields"]; goals: string[]; inputTokens?: number; outputTokens?: number; costUsd?: number; model?: string };
  if (opts.plan !== "byok" || byokKey) {
    try {
      base = await aiAutofill(snap, signals, byokKey);
    } catch (e) {
      console.warn("[onboarding] autofill AI failed, using heuristics:", e instanceof Error ? e.message : e);
      base = heuristicAutofill(snap, signals);
    }
  } else {
    base = heuristicAutofill(snap, signals);
  }

  const fields = { ...base.fields, aov: aovBucket(signals.priceMedian) };
  const annual = baselineAnnual(snap, signals);
  return {
    fields,
    goals: base.goals,
    detected: buildDetected(snap, signals),
    learnings: buildLearnings(snap, signals, fields),
    leaks: buildLeaks(snap, signals, annual),
    estLow: nice(annual * 0.08),
    estHigh: nice(annual * 0.22),
    usage: base.inputTokens != null ? { inputTokens: base.inputTokens, outputTokens: base.outputTokens } : undefined,
    costUsd: base.costUsd,
    model: base.model,
  };
}

// ── Orchestration + persistence ─────────────────────────────────────────────

export async function runOnboardingAnalysis(opts: {
  admin: AdminApiContext;
  shop: string;
  plan: string | null;
  answers: OnboardingAnswers;
}): Promise<{
  snapshot: StoreSnapshot;
  recommendations: Recommendation[];
  usage?: { inputTokens?: number; outputTokens?: number };
  costUsd?: number;
  model?: string;
}> {
  const snapshot = await gatherStoreSnapshot(opts.admin);
  const byokKey = opts.plan === "byok" ? (await resolveKey(opts.shop, opts.plan)) ?? undefined : undefined;

  let recommendations: Recommendation[] = [];
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  let costUsd: number | undefined;
  let model: string | undefined;

  if (opts.plan !== "byok" || byokKey) {
    try {
      const ai = await aiRecommendations(snapshot, opts.answers, byokKey);
      recommendations = ai.recs;
      usage = { inputTokens: ai.inputTokens, outputTokens: ai.outputTokens };
      costUsd = ai.costUsd;
      model = ai.model;
    } catch (e) {
      console.warn("[onboarding] AI analysis failed, using curated plan:", e instanceof Error ? e.message : e);
    }
  }

  if (recommendations.length === 0) recommendations = curatedFallback(snapshot, opts.answers);

  return { snapshot, recommendations, usage, costUsd, model };
}

export function getShopProfile(shop: string) {
  return db.shopProfile.findUnique({ where: { shop } });
}

export async function saveOnboarding(opts: {
  shop: string;
  answers: OnboardingAnswers;
  snapshot: StoreSnapshot;
  recommendations: Recommendation[];
}): Promise<void> {
  const now = new Date();
  const goals = JSON.stringify(opts.answers.goals ?? []);
  const data = JSON.stringify({ answers: opts.answers, snapshot: opts.snapshot });
  const recommendations = JSON.stringify(opts.recommendations);
  await db.shopProfile.upsert({
    where: { shop: opts.shop },
    create: { shop: opts.shop, onboardedAt: now, dataConsentAt: now, goals, data, recommendations },
    update: { onboardedAt: now, dataConsentAt: now, goals, data, recommendations },
  });
}

/** Parse the stored recommendations for the dashboard (safe on bad/empty data). */
export function parseRecommendations(profile: { recommendations: string | null } | null): Recommendation[] {
  if (!profile?.recommendations) return [];
  try {
    const list = JSON.parse(profile.recommendations) as unknown;
    return Array.isArray(list) ? (list as Recommendation[]) : [];
  } catch {
    return [];
  }
}
