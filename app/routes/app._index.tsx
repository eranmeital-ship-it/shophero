import { useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { redirect } from "react-router";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { authenticate } from "../shopify.server";
import { ensureReady, isReady, startBootstrap, bootstrapState } from "../lib/bootstrap.server";
import { getActivePlan, getCycleUsage } from "../lib/billing.server";
import { workspaceDir } from "../lib/workspace.server";
import { getShopProfile, parseRecommendations, revenueFromBucket, type Recommendation } from "../lib/onboarding.server";
import { getCachedReport } from "../lib/report.server";
import { getPlan } from "../lib/content-plan.server";
import { SECTION_LIBRARY, SECTION_TARGETS } from "../lib/section-library";
import { PLAN_ROUTE_MAP, planTotals, type ActionPlanData, type PlanItem } from "../lib/plan-routes";
import { PDP_BLUEPRINTS, PDP_BLUEPRINT_MAP, PDP_CHECKLIST } from "../lib/pdp-templates";
import type { SchemaAudit } from "../lib/schema-audit.server";
import { Tour, type TourStep } from "../components/tour";
import "../styles/shophero.css";

type Handles = { product?: string; collection?: string; page?: string; blog?: string; article?: string };

const TYPE_LABEL: Record<string, string> = {
  index: "Home", product: "Product", collection: "Collection", "list-collections": "Collections",
  page: "Page", blog: "Blog", article: "Article", cart: "Cart", search: "Search", "404": "404 / Not found",
  "customers/login": "Login", "customers/register": "Register", "customers/account": "Account", "customers/order": "Order",
};
const TYPE_ORDER = ["index", "product", "collection", "list-collections", "page", "blog", "article", "cart", "search", "404", "customers/login", "customers/register", "customers/account", "customers/order"];

// Map a theme template (type + optional suffix) to a previewable storefront path.
// Alternate templates (product.bold.json) preview via ?view=<suffix>.
function templatePath(type: string, suffix: string, h: Handles): string | null {
  const v = suffix ? `?view=${suffix}` : "";
  switch (type) {
    case "index": return `/${v}`;
    case "product": return h.product ? `/products/${h.product}${v}` : null;
    case "collection": return h.collection ? `/collections/${h.collection}${v}` : null;
    case "list-collections": return `/collections${v}`;
    case "page": return h.page ? `/pages/${h.page}${v}` : null;
    case "blog": return h.blog ? `/blogs/${h.blog}${v}` : null;
    case "article": return h.blog && h.article ? `/blogs/${h.blog}/${h.article}${v}` : null;
    case "cart": return `/cart${v}`;
    case "search": return `/search${v}`;
    case "404": return `/__shophero_404${v}`;
    case "customers/login": return `/account/login${v}`;
    case "customers/register": return `/account/register${v}`;
    case "customers/account": return `/account${v}`;
    default: return null; // password, gift_card, etc. — not previewable here
  }
}

// Discover the theme's template files from the local workspace.
async function listTemplates(dir: string): Promise<{ type: string; suffix: string }[]> {
  const out: { type: string; suffix: string }[] = [];
  const parse = (name: string, prefix = "") => {
    const m = name.match(/^([^.]+)(?:\.(.+))?\.(json|liquid)$/);
    if (m) out.push({ type: prefix + m[1], suffix: m[2] ?? "" });
  };
  let entries;
  try {
    entries = await readdir(path.join(dir, "templates"), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name === "customers") {
      try {
        for (const f of await readdir(path.join(dir, "templates", "customers"))) parse(f, "customers/");
      } catch { /* none */ }
    } else if (e.isFile()) {
      parse(e.name);
    }
  }
  return out;
}

type PreviewItem = { key: string; label: string; url: string };
type PreviewGroup = { type: string; label: string; items: PreviewItem[] };

// Two-level preview list: page type → its template variants, for any theme.
async function buildPreviews(admin: AdminApiContext, shop: string, themeId: number): Promise<PreviewGroup[]> {
  const t = (p: string) => `https://${shop}${p}${p.includes("?") ? "&" : "?"}preview_theme_id=${themeId}`;
  const h: Handles = {};
  try {
    const r = await admin.graphql(`{ products(first:1){nodes{handle}} collections(first:1){nodes{handle}} }`);
    const { data } = (await r.json()) as { data?: { products?: { nodes?: { handle: string }[] }; collections?: { nodes?: { handle: string }[] } } };
    h.product = data?.products?.nodes?.[0]?.handle;
    h.collection = data?.collections?.nodes?.[0]?.handle;
  } catch { /* ignore */ }
  try {
    const r = await admin.graphql(`{ pages(first:1){nodes{handle}} }`);
    const { data } = (await r.json()) as { data?: { pages?: { nodes?: { handle: string }[] } } };
    h.page = data?.pages?.nodes?.[0]?.handle;
  } catch { /* ignore */ }
  try {
    const r = await admin.graphql(`{ blogs(first:1){nodes{handle articles(first:1){nodes{handle}}}} }`);
    const { data } = (await r.json()) as { data?: { blogs?: { nodes?: { handle: string; articles?: { nodes?: { handle: string }[] } }[] } } };
    const blog = data?.blogs?.nodes?.[0];
    h.blog = blog?.handle;
    h.article = blog?.articles?.nodes?.[0]?.handle;
  } catch { /* ignore */ }

  let templates = await listTemplates(workspaceDir(shop));
  if (templates.length === 0) {
    // Workspace not pulled yet — fall back to the standard OS 2.0 set.
    templates = ["index", "product", "collection", "page", "blog", "article", "cart", "search", "404"].map((type) => ({ type, suffix: "" }));
  }

  const groups = new Map<string, PreviewGroup>();
  for (const { type, suffix } of templates) {
    const p = templatePath(type, suffix, h);
    if (!p) continue;
    const g = groups.get(type) ?? { type, label: TYPE_LABEL[type] ?? type, items: [] };
    g.items.push({ key: `${type}.${suffix || "default"}`, label: suffix || "Default", url: t(p) });
    groups.set(type, g);
  }

  const ordered = [...groups.values()].sort(
    (a, b) => ((TYPE_ORDER.indexOf(a.type) + 1 || 99)) - ((TYPE_ORDER.indexOf(b.type) + 1 || 99)),
  );
  ordered.forEach((g) => g.items.sort((a, b) => (a.label === "Default" ? -1 : 1) - (b.label === "Default" ? -1 : 1)));
  return ordered;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const activePlan = await getActivePlan(admin);
  if (!activePlan) {
    const url = new URL(request.url);
    return redirect(`/app/pricing?${url.searchParams.toString()}`);
  }

  // Onboarding gate: first-run merchants build a personalized plan before the editor.
  const profile = await getShopProfile(session.shop);
  if (!profile?.onboardedAt) {
    const url = new URL(request.url);
    return redirect(`/app/onboarding?${url.searchParams.toString()}`);
  }

  // Annual revenue (from onboarding) → used to estimate plan upside.
  let revenueAnnual = 0;
  try {
    const d = profile?.data ? (JSON.parse(profile.data) as { answers?: { revenue?: string } }) : null;
    revenueAnnual = revenueFromBucket(d?.answers?.revenue);
  } catch { /* ignore */ }

  const cycle = await getCycleUsage(admin, session.shop).catch(() => null);
  const base = {
    shop: session.shop,
    activePlan,
    recommendations: parseRecommendations(profile),
    report: await getCachedReport(session.shop).catch(() => null),
    revenueAnnual,
    plan: await getPlan(session.shop).catch(() => null),
    usageThisCycle: cycle?.consumed ?? 0, // $ billed this cycle (persists across reloads)
  };

  // Theme setup duplicates the whole live theme into our working copy — slow on
  // first run (Shopify rate-limits asset reads). Run it in the BACKGROUND and show
  // a "getting ready" screen that polls, so we never hold the request long enough
  // to trip an embedded-app timeout. It can also fail (e.g. Shopify requires a
  // theme-write exemption / custom-app token) — in that case show the access gate.
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const nullTheme = { name: null as string | null, copiedAt: null as string | null };
  const errState = bootstrapState(session.shop);
  if (errState?.status === "error") {
    const msg = errState.error ?? "";
    const kind = /themeFilesUpsert|write_themes|exemption|Access denied|ACCESS_DENIED/i.test(msg) ? "access" : "setup";
    return { ...base, themeId: 0, previews: [] as PreviewGroup[], themeError: kind, preparing: false, themeInfo: nullTheme };
  }

  if (!(await isReady(session.shop))) {
    startBootstrap(ctx);
    return { ...base, themeId: 0, previews: [] as PreviewGroup[], themeError: null as null | string, preparing: true, themeInfo: nullTheme };
  }

  // Ready (or self-heals quickly) — load the editor.
  try {
    const { themeId, themeName, themeCopiedAt } = await ensureReady(ctx);
    const previews = await buildPreviews(admin, session.shop, themeId);
    return { ...base, themeId, previews, themeError: null as null | string, preparing: false, themeInfo: { name: themeName, copiedAt: themeCopiedAt } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[app] theme setup failed — serving dashboard in limited mode:", msg);
    const kind = /themeFilesUpsert|write_themes|exemption|Access denied|ACCESS_DENIED/i.test(msg) ? "access" : "setup";
    return { ...base, themeId: 0, previews: [] as PreviewGroup[], themeError: kind, preparing: false, themeInfo: nullTheme };
  }
}

interface Deliverable { type: string; title?: string; adminUrl: string; storeUrl?: string }
interface ContentDraft { id: string; title: string; before: string; after: string; seoTitle?: string; metaDescription?: string; beforeTitle?: string; beforeMeta?: string; mediaIds?: string[] }
interface Msg { role: "user" | "assistant"; text: string; tools?: string[]; cost?: number; model?: string; deliverables?: Deliverable[] }
interface Billing { consumed: number; included: number; balanceUsed: number; cap: number; covered: number; needsCapRaise: boolean }
interface Version { sha: string; date: string; label: string; files: number }
interface Selection { name: string; sectionType: string; sectionId: string; selector: string; tag: string; text: string; html: string }
interface AuditIssue { key: string; label: string; severity: "error" | "warning" | "notice"; count: number; area: string; why: string; fix: string; fixPrompt?: string }
interface Breakdown { key?: string; label?: string; weight?: number; earned?: number; status?: "pass" | "warn" | "fail"; detail?: string; why?: string; fix?: string; factor?: string; points?: number }
interface HistoryPoint { date: string; health: number; [area: string]: number | string }
interface ReportData { scores: Score[]; health?: number; breakdowns?: Record<string, Breakdown[]>; history?: HistoryPoint[]; issues?: AuditIssue[]; findings: string[]; summary: string; recommendations: Recommendation[]; generatedAt: string; cached: boolean }
interface PlanData { strategy: string | null; perDay: number; days: number; publishedCount: number; status: string; draftTitle: string | null; draftBody: string | null; draftMeta: string | null; draftTopic: string | null }
interface ChatData { assistantText?: string; toolEvents?: string[]; pending?: string[]; error?: string; costUsd?: number; usage?: { inputTokens?: number; outputTokens?: number }; model?: string; proposedMutations?: { summary: string }[]; deliverables?: Deliverable[]; billing?: Billing }
interface ApplyData { applied: number; message?: string; error?: string; version?: string; pending?: string[]; total?: number }

// Merchant pays 3x our raw API cost (markup baked into the displayed price).
const MARKUP = 3;

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// Shown on the first-run "getting ready" screen while the theme copies in the bg.
const PREP_MSGS = [
  "Connecting to your store…",
  "Making a safe working copy of your theme…",
  "Copying your theme files…",
  "Setting up version history so every change is reversible…",
  "Almost there…",
];

// Guided walkthrough — welcome popup, then spotlight coach-marks.
const TOUR_STEPS: TourStep[] = [
  { title: "Welcome to ShopHero", body: "Your AI growth team — trained on conversion data from millions of stores. In about 30 seconds, let me show you how to turn this into more sales.", cta: "Show me how it works →" },
  { target: "tools", title: "One-click power tools", body: "Each tool runs on a brain we trained to outperform generic AI. It analyzes YOUR store first, then does the work — building product pages, SEO, content, conversions, AI-agent readiness and more. Click one and pick your options." },
  { target: "composer", title: "…or just ask", body: "Type anything in plain English — “make my product page convert better” — and ShopHero plans it, does it, and shows you the result before it goes live." },
  { target: "modes", title: "Edit & Optimize", body: "Edit builds or changes anything across your store. Optimize gives you a ranked, one-tap fix list from a live audit of your storefront." },
  { target: "plan", title: "Your growth plan", body: "Your personalized, ranked opportunities — pulled from a scan of your store and millions of high-converting ones. Tap any one to do it in a single click." },
  { target: "scores", title: "Live store health", body: "Speed, SEO, content, catalog and AI-Ready scores update as you improve. “AI-Ready” tracks how recommendable your store is to AI shopping agents — the next frontier." },
  { target: "preview", title: "Live preview — fully safe", body: "Every change shows here first. Switch pages and devices, review a visual diff, then Apply. Roll back anytime from version history — nothing goes live without you." },
  { target: "header", title: "Usage, history & help", body: "Up here you'll find your AI usage, version history (🕘) to undo anything, and the ? to replay this tour. To make ShopHero even smarter, open Brand Kit and Brains in the left app menu and feed it your brand and best practices. That's it — go make more sales! 🚀" },
];

// Friendly labels + relative time for the version-history drawer.
// Turn a raw agent tool event ("Read /data/.../settings_data.json") into a
// friendly, human status ("Reading settings_data.json") for the live loader.
function friendlyStep(t: string): string {
  const m = t.match(/^(\w+)\s*(.*)$/);
  const verb = (m?.[1] ?? "").toLowerCase();
  const arg = (m?.[2] ?? "").trim();
  const file = arg ? (arg.split("/").filter(Boolean).pop() ?? "") : "";
  switch (verb) {
    case "read": return file ? `Reading ${file}` : "Reading your theme";
    case "write": return file ? `Writing ${file}` : "Writing changes";
    case "edit": return file ? `Editing ${file}` : "Editing your theme";
    case "bash": return "Running a task";
    case "grep":
    case "glob": return "Searching your theme";
    default: return t;
  }
}

function prettyLabel(s: string): string {
  if (/^rolled back/i.test(s)) return "Rolled back";
  if (/auto-saved/i.test(s)) return "Auto-saved (before rollback)";
  if (/baseline|pulled/i.test(s)) return "Original theme";
  return s; // the change summary or applied file list — show as-is
}
function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const QUICK_ACTIONS: { emoji: string; label: string; genius?: boolean; taskId: string }[] = [
  { emoji: "✨", label: "Improve My Store", genius: true, taskId: "store-manager" },
  { emoji: "🚀", label: "Build PDP", genius: true, taskId: "build-pdp" },
  { emoji: "🔍", label: "SEO Optimize", genius: true, taskId: "seo-genius" },
  { emoji: "📈", label: "Boost Conversions", genius: true, taskId: "cro-boost" },
  { emoji: "🛡️", label: "Trust Builder", taskId: "trust-builder" },
  { emoji: "✍️", label: "Rewrite Descriptions", taskId: "bulk-descriptions" },
  { emoji: "🖼️", label: "Alt Text", taskId: "alt-text" },
  { emoji: "📱", label: "Mobile Optimize", taskId: "mobile-opt" },
  { emoji: "⚡", label: "Speed Boost", taskId: "speed-boost" },
  { emoji: "🏷️", label: "Launch Campaign", taskId: "launch-campaign" },
  { emoji: "📝", label: "Write Content", taskId: "write-content" },
  { emoji: "📅", label: "Content Plan", taskId: "content-plan" },
  { emoji: "🤖", label: "AI Agent Ready", genius: true, taskId: "aeo" },
  { emoji: "🎨", label: "Redesign Hero", taskId: "redesign-hero" },
  { emoji: "🧩", label: "Add Section", taskId: "add-section" },
  { emoji: "🧠", label: "AEO Brain", genius: true, taskId: "structured-data" },
  { emoji: "🖼️", label: "Stock Images", taskId: "stock-images" },
];

// Rough BILLED cost + time estimate per task, shown before running so nothing is a
// surprise. It's deliberately conservative (you're only charged for actual usage).
const TASK_ESTIMATE: Record<string, { usd: number; secs: number }> = {
  "store-manager": { usd: 2.0, secs: 180 },
  "build-pdp": { usd: 1.2, secs: 120 },
  "seo-genius": { usd: 0.6, secs: 60 },
  "cro-boost": { usd: 0.8, secs: 90 },
  "trust-builder": { usd: 0.45, secs: 50 },
  "bulk-descriptions": { usd: 0.6, secs: 70 },
  "alt-text": { usd: 0.3, secs: 40 },
  "mobile-opt": { usd: 0.6, secs: 70 },
  "speed-boost": { usd: 0.5, secs: 60 },
  "launch-campaign": { usd: 0.7, secs: 90 },
  "write-content": { usd: 0.4, secs: 60 },
  "content-plan": { usd: 0.3, secs: 45 },
  "aeo": { usd: 0.7, secs: 80 },
  "redesign-hero": { usd: 0.9, secs: 90 },
};
function taskEstimate(id: string): { usd: number; secs: number } {
  return TASK_ESTIMATE[id] ?? { usd: 0.5, secs: 60 };
}
function fmtSecs(s: number): string {
  return s >= 60 ? `~${Math.round(s / 60)} min` : `~${s}s`;
}

// ── Task launcher: clicking a quick action opens a setup panel (asks the right
// questions), then "Go" compiles answers into the agent prompt. ──────────────
type ProductLite = { id: string; title: string; handle: string; image?: string; price?: string };
type TaskValues = Record<string, unknown>;
type TaskField =
  | { type: "product"; key: string; label: string; required?: boolean }
  | { type: "text" | "textarea"; key: string; label: string; placeholder?: string }
  | { type: "select"; key: string; label: string; options: string[] }
  | { type: "multiselect"; key: string; label: string; options: string[]; default?: string[] };
interface TaskConfig {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  intro?: string[]; // optional "what is this / why it matters" explainer paragraphs
  scoreLabel?: string; // which store-report score to show at the top (by label)
  areas?: string[]; // report recommendation areas relevant to this tool
  fields: TaskField[];
  build: (v: TaskValues) => string;
}

const sval = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const aval = (x: unknown) => (Array.isArray(x) ? (x as string[]) : []);

const TASKS: Record<string, TaskConfig> = {
  "store-manager": {
    id: "store-manager",
    emoji: "✨",
    title: "Improve my store",
    desc: "Run your ranked opportunities in one go.",
    areas: [],
    fields: [],
    build: () => "",
  },
  "content-plan": {
    id: "content-plan",
    emoji: "📅",
    title: "Content Plan",
    desc: "ShopHero drafts the best next article on a schedule. You review and publish each day.",
    areas: ["Content", "SEO"],
    fields: [],
    build: () => "",
  },
  "build-pdp": {
    id: "build-pdp",
    emoji: "🚀",
    title: "Build a high-converting product page",
    desc: "Pick the product and the sections to include. ShopHero assembles a proven, on-brand page and stages it for your approval.",
    scoreLabel: "Catalog",
    areas: ["CRO", "Trust", "AOV", "Design"],
    fields: [
      { type: "product", key: "product", label: "Which product?", required: true },
      {
        type: "multiselect",
        key: "sections",
        label: "Sections to include",
        options: ["Trust badges", "Icon guarantees", "Reasons to buy", "Key features", "Comparison table", "Social proof", "Reviews", "FAQ", "Image-with-text story", "Bundle / cross-sell", "Sticky add-to-cart"],
        default: ["Trust badges", "Icon guarantees", "Reasons to buy", "Key features", "Comparison table", "FAQ", "Image-with-text story"],
      },
      { type: "textarea", key: "notes", label: "Anything specific? (optional)", placeholder: "e.g. emphasize the 24K gold finish, target gift buyers" },
    ],
    build: (v) => {
      const p = v.product as ProductLite | null;
      const sections = aval(v.sections).join(", ") || "the proven set";
      const notes = sval(v.notes);
      return `Build a high-converting product page for the product "${p?.title}" (handle: ${p?.handle}). Read this product first, then call page_kit and cro_playbook and assemble these sections: ${sections}. Use on-brand copy from my Brand Kit.${notes ? ` Notes: ${notes}.` : ""} Reuse my theme's existing sections and color scheme, keep it fast, never invent reviews or claims, and stage everything for my approval. Summarize the sections you added.`;
    },
  },
  "alt-text": {
    id: "alt-text",
    emoji: "🖼️",
    title: "Image Alt Text",
    desc: "Descriptive alt text for product images — better SEO and accessibility.",
    areas: ["SEO"],
    fields: [],
    build: () => "",
  },
  "add-section": {
    id: "add-section",
    emoji: "🧩",
    title: "Add a Section",
    desc: "Insert a polished, ready-made section into your theme.",
    areas: [],
    fields: [],
    build: () => "",
  },
  "structured-data": {
    id: "structured-data",
    emoji: "🧬",
    title: "Structured Data (AEO)",
    desc: "Add JSON-LD so Google and AI agents can read your store.",
    areas: ["SEO"],
    fields: [],
    build: () => "",
  },
  "stock-images": {
    id: "stock-images",
    emoji: "🖼️",
    title: "Stock Images",
    desc: "Search license-clean photos and add them to your Shopify Files.",
    areas: [],
    fields: [],
    build: () => "",
  },
  "seo-genius": {
    id: "seo-genius",
    emoji: "🔍",
    title: "1-Click SEO Optimization",
    desc: "Choose what to accomplish and which pages to optimize. ShopHero fixes them and shows before/after.",
    scoreLabel: "SEO",
    areas: ["SEO"],
    fields: [
      {
        type: "multiselect",
        key: "pages",
        label: "Which pages to optimize?",
        options: ["Homepage", "Products", "Collections", "Blog & articles", "Other pages"],
        default: ["Homepage", "Products", "Collections"],
      },
      {
        type: "multiselect",
        key: "improve",
        label: "What do you want to accomplish?",
        options: ["Titles & meta descriptions", "Heading hierarchy", "Image alt text", "Structured data", "Internal linking"],
        default: ["Titles & meta descriptions", "Image alt text", "Structured data"],
      },
      { type: "product", key: "product", label: "Focus on one product? (optional)" },
      { type: "textarea", key: "notes", label: "Target keywords / notes (optional)", placeholder: "e.g. focus on ‘Jewish wedding gifts’" },
    ],
    build: (v) => {
      const pages = aval(v.pages).join(", ") || "the whole store";
      const improve = aval(v.improve).join(", ") || "titles, meta descriptions, headings, alt text, structured data and internal linking";
      const p = v.product as ProductLite | null;
      const notes = sval(v.notes);
      return `Run a 1-click SEO optimization. Pages to optimize: ${pages}.${p ? ` Focus especially on the product "${p.title}" (handle: ${p.handle}).` : ""} Improve: ${improve}.${notes ? ` Target keywords/notes: ${notes}.` : ""} Show before/after for each change and stage everything for my approval.`;
    },
  },
  "speed-boost": {
    id: "speed-boost",
    emoji: "⚡",
    title: "Speed Boost",
    desc: "Pick the safe speed wins to apply. ShopHero applies them and summarizes the impact.",
    areas: ["Speed"],
    fields: [
      {
        type: "multiselect",
        key: "fixes",
        label: "What to optimize?",
        options: ["Lazy-load offscreen images", "Defer non-critical scripts", "Remove unused CSS/sections", "Preload key fonts"],
        default: ["Lazy-load offscreen images", "Defer non-critical scripts", "Remove unused CSS/sections"],
      },
      { type: "textarea", key: "notes", label: "Anything to avoid? (optional)", placeholder: "e.g. don't touch the hero video" },
    ],
    build: (v) => {
      const fixes = aval(v.fixes).join(", ") || "the safe wins";
      const notes = sval(v.notes);
      return `Audit my theme for storefront speed. First call speed_playbook, then apply: ${fixes} (keep the hero/LCP image eager — never lazy-load/defer above-fold assets or tracking pixels).${notes ? ` Constraints: ${notes}.` : ""} Summarize what changed, the expected Core Web Vitals impact, and any merchant actions (e.g. uninstall unused apps, recompress images). Stage for approval.`;
    },
  },
  "launch-campaign": {
    id: "launch-campaign",
    emoji: "🏷️",
    title: "Launch a campaign",
    desc: "Create a collection, homepage feature, announcement bar and an announcement post.",
    areas: ["CRO", "Content", "AOV"],
    fields: [
      { type: "text", key: "occasion", label: "Occasion / name", placeholder: "e.g. Summer Sale, Hanukkah Gift Guide" },
      { type: "textarea", key: "details", label: "Details (offer, products, dates)", placeholder: "e.g. 20% off all framed art, ends Aug 31" },
    ],
    build: (v) => {
      const occasion = sval(v.occasion) || "Sale";
      const details = sval(v.details);
      return `Launch a "${occasion}" campaign: create a matching collection, a homepage feature section, an announcement bar linking to it, and a short announcement blog post.${details ? ` Details: ${details}.` : ""} Explain any live-store changes before making them and stage theme changes for my approval.`;
    },
  },
  "write-content": {
    id: "write-content",
    emoji: "📝",
    title: "Write content",
    desc: "On-brand blog posts with SEO titles, meta descriptions and internal links.",
    scoreLabel: "Content",
    areas: ["Content", "SEO"],
    fields: [
      { type: "select", key: "count", label: "How many posts?", options: ["1", "3", "5"] },
      { type: "text", key: "topics", label: "Topics (optional)", placeholder: "e.g. caring for gold art, gift ideas" },
    ],
    build: (v) => {
      const count = sval(v.count) || "3";
      const topics = sval(v.topics);
      return `Plan and write ${count} blog posts for my store. First call content_strategy, then read my existing blog posts, products and collections to find the highest-value content GAPS${topics ? ` (the merchant suggested: ${topics})` : ""}. Choose topics that bring the most value to THIS store (buying intent first), then write each post on-brand (~800–1200 words) with an SEO title, meta description, and internal links to the relevant products/collections. Show the topic plan first, then the posts.`;
    },
  },
  "aeo": {
    id: "aeo",
    emoji: "🤖",
    title: "Optimize for AI Agents (AEO)",
    desc: "Get your store ready to be recommended by AI shopping agents — the next frontier after Google.",
    intro: [
      "Shopping is shifting from search engines to AI agents. SEO got you ranked in Google; ASO ranked apps; now AEO — Agent Engine Optimization — gets you recommended by AI shopping assistants (OpenAI, Google, Amazon, Apple, Shopify).",
      "Soon a buyer won't type a few keywords — they'll ask their assistant: “Buy the best gift for my dad under $200.” The brand the AI trusts wins the sale — not the one with the flashiest ads.",
      "Agents ignore banners. They weigh structured product data, rich attributes, reviews, trust signals, clear shipping/returns, comparison content and brand reputation — all machine-readable.",
      "ShopHero gets you ready: perfect product data + attributes, full structured-data schema, AI-readable FAQs, comparison pages and recommendation-matching copy — so when agents start buying, your store is the one they confidently recommend.",
    ],
    scoreLabel: "AI Ready",
    areas: ["SEO", "Trust", "Content"],
    fields: [
      {
        type: "multiselect",
        key: "levers",
        label: "What to optimize for AI agents?",
        options: ["Rich product data & titles", "Structured data (schema)", "Machine-readable attributes", "AI-readable FAQs", "Comparison content", "Trust & reviews surfacing", "Clear shipping/returns/warranty", "Recommendation-prompt keywords"],
        default: ["Rich product data & titles", "Structured data (schema)", "Machine-readable attributes", "AI-readable FAQs"],
      },
      { type: "select", key: "scope", label: "Apply to", options: ["A specific product", "All products", "Whole store"] },
      { type: "product", key: "product", label: "Product (if scoped to one)" },
      { type: "textarea", key: "notes", label: "Anything specific? (optional)", placeholder: "e.g. emphasize premium materials, limited editions, gifting" },
    ],
    build: (v) => {
      const levers = aval(v.levers).join(", ") || "the full AEO checklist";
      const scope = sval(v.scope) || "A specific product";
      const p = v.product as ProductLite | null;
      const where = scope === "A specific product" && p ? `the product "${p.title}" (handle: ${p.handle})` : scope.toLowerCase();
      const notes = sval(v.notes);
      return `Optimize ${where} for AI shopping agents (AEO). First call aeo_playbook, analyze my current product data, schema, attributes, FAQs and policies, then improve: ${levers}. Use only accurate data — never fabricate reviews, ratings or claims. Implement structured data in the theme, rich attributes via metafields, and AI-readable FAQ + comparison content where relevant.${notes ? ` Notes: ${notes}.` : ""} For anything ShopHero can't do directly (collecting reviews, product feeds, off-site mentions), tell me the exact next step. Stage everything for my approval.`;
    },
  },
  "redesign-hero": {
    id: "redesign-hero",
    emoji: "🎨",
    title: "Redesign the homepage hero",
    desc: "A premium, modern hero with a clear value proposition and strong CTA.",
    areas: ["Design", "CRO"],
    fields: [{ type: "textarea", key: "direction", label: "Style direction (optional)", placeholder: "e.g. luxurious, dark + gold, big lifestyle image" }],
    build: (v) => {
      const direction = sval(v.direction);
      return `Redesign my homepage hero to feel premium and modern — a clear outcome-led value proposition, refined typography, and a strong high-contrast CTA — matching my color scheme and Brand Kit.${direction ? ` Direction: ${direction}.` : ""} Stage for approval.`;
    },
  },
  "cro-boost": {
    id: "cro-boost",
    emoji: "📈",
    title: "Conversion Rate Booster",
    desc: "Find what's hurting conversions — weak CTAs, missing trust, layout, offers — and fix it.",
    areas: ["CRO", "Trust", "AOV", "Design"],
    fields: [
      { type: "multiselect", key: "where", label: "Where to focus?", options: ["Homepage", "Product pages", "Collections", "Cart"], default: ["Product pages", "Homepage"] },
      { type: "multiselect", key: "focus", label: "What to improve?", options: ["Stronger CTAs", "Trust signals", "Product layout", "Offers & urgency", "Mobile"], default: ["Stronger CTAs", "Trust signals", "Product layout"] },
      { type: "textarea", key: "notes", label: "Anything specific? (optional)", placeholder: "e.g. our hero CTA gets ignored" },
    ],
    build: (v) => {
      const where = aval(v.where).join(", ") || "the storefront";
      const focus = aval(v.focus).join(", ") || "CTAs, trust, layout and offers";
      const notes = sval(v.notes);
      return `Run a conversion-rate pass on ${where}. Call cro_playbook AND page_kit first (use the proven buy-box, offer architecture, social-proof and trust patterns), then improve: ${focus}.${notes ? ` Notes: ${notes}.` : ""} Use only true claims/numbers — never fabricate reviews or scarcity. Apply on-brand changes, explain any live-store changes before making them, and stage everything for my approval.`;
    },
  },
  "trust-builder": {
    id: "trust-builder",
    emoji: "🛡️",
    title: "Trust Builder",
    desc: "Add the trust elements that lift conversion — badges, guarantees, shipping info, reviews placement.",
    areas: ["Trust", "CRO"],
    fields: [
      { type: "multiselect", key: "elements", label: "What to add?", options: ["Trust badges", "Money-back guarantee", "Shipping & returns info", "Secure-checkout cues", "Reviews placement"], default: ["Trust badges", "Shipping & returns info", "Reviews placement"] },
      { type: "multiselect", key: "where", label: "Where?", options: ["Product pages", "Homepage", "Cart"], default: ["Product pages"] },
      { type: "product", key: "product", label: "Focus on one product? (optional)" },
      { type: "textarea", key: "notes", label: "Notes (optional)", placeholder: "e.g. we offer 30-day returns, free shipping over $50" },
    ],
    build: (v) => {
      const elements = aval(v.elements).join(", ") || "trust badges, guarantees and shipping info";
      const where = aval(v.where).join(", ") || "the product pages";
      const p = v.product as ProductLite | null;
      const notes = sval(v.notes);
      return `Add trust-building elements (${elements}) to ${where}${p ? ` (focus on "${p.title}", handle: ${p.handle})` : ""}. Call cro_playbook + page_kit and use only true claims — never invent reviews or guarantees.${notes ? ` Details: ${notes}.` : ""} Match my Brand Kit and stage for approval.`;
    },
  },
  "bulk-descriptions": {
    id: "bulk-descriptions",
    emoji: "✍️",
    title: "Rewrite Product Descriptions",
    desc: "Rewrite descriptions to be benefit-led, on-brand and SEO-friendly. Live product changes need your approval.",
    areas: ["SEO", "CRO", "Content"],
    fields: [
      { type: "select", key: "which", label: "Which products?", options: ["Products with thin/missing descriptions", "All products", "A specific product"] },
      { type: "product", key: "product", label: "Product (if just one)" },
      { type: "textarea", key: "notes", label: "Tone / must-include (optional)", placeholder: "e.g. emphasize craftsmanship, mention 24K gold" },
    ],
    build: (v) => {
      const which = sval(v.which) || "Products with thin/missing descriptions";
      const p = v.product as ProductLite | null;
      const target = which === "A specific product" && p ? `the product "${p.title}" (handle: ${p.handle})` : which.toLowerCase();
      const notes = sval(v.notes);
      return `Rewrite product descriptions for ${target}: benefit-led, on-brand (use my Brand Kit voice), skimmable and SEO-friendly. Work in batches and PROPOSE the product updates for my approval before applying — these are live store changes.${notes ? ` Tone/must-include: ${notes}.` : ""} Summarize what you changed.`;
    },
  },
  "mobile-opt": {
    id: "mobile-opt",
    emoji: "📱",
    title: "Mobile Optimization",
    desc: "Fix the mobile experience — spacing, tap targets, image sizes, navigation, sticky add-to-cart.",
    areas: ["Design", "CRO", "Speed"],
    fields: [
      { type: "multiselect", key: "fixes", label: "What to fix?", options: ["Spacing & layout", "Button / tap sizes", "Image sizing", "Navigation", "Sticky add-to-cart"], default: ["Spacing & layout", "Button / tap sizes", "Sticky add-to-cart"] },
      { type: "multiselect", key: "pages", label: "Which pages?", options: ["Homepage", "Product pages", "Collections", "Cart"], default: ["Homepage", "Product pages"] },
      { type: "textarea", key: "notes", label: "Notes (optional)", placeholder: "e.g. the menu is hard to tap on phones" },
    ],
    build: (v) => {
      const fixes = aval(v.fixes).join(", ") || "spacing, tap targets, image sizing and navigation";
      const pages = aval(v.pages).join(", ") || "the storefront";
      const notes = sval(v.notes);
      return `Optimize the MOBILE experience on ${pages}: ${fixes}. Use responsive theme CSS only (don't change desktop), keep it fast.${notes ? ` Notes: ${notes}.` : ""} Stage for approval.`;
    },
  },
};

// Health scores + ranked optimization checklist. Illustrative for now — wire to
// a Lighthouse / theme-audit pass to make them live (see notes).
type Score = { label: string; value: number; color: string };
type Issue = { area: string; impact: "high" | "med" | "low"; title: string; desc: string; prompt: string };
const DEVICE_W: Record<string, string> = { desktop: "100%", tablet: "820px", mobile: "400px" };

// Placeholder scores shown until the live PageSpeed audit (Optimize tab) returns.
const SCORES: Score[] = [
  { label: "Speed", value: 62, color: "#ff3b30" },
  { label: "SEO", value: 81, color: "#34c759" },
  { label: "A11y", value: 88, color: "#34c759" },
];

const ISSUES: Issue[] = [
  { area: "Speed", impact: "high", title: "Hero image isn't lazy-loaded", desc: "Large offscreen images load eagerly and delay first paint. Defer them (keep the hero/LCP eager) to cut load time.", prompt: "Lazy-load offscreen images in my theme while keeping the hero/LCP image eager, and defer non-critical scripts. Summarize the changes and expected impact." },
  { area: "CRO", impact: "high", title: "No trust badges near add-to-cart", desc: "Payment, returns and shipping badges below the buy button reduce checkout hesitation and lift conversion.", prompt: "Add trust badges (secure payment, free returns, fast shipping) directly below the add-to-cart button on the product page, matching my theme style." },
  { area: "SEO", impact: "med", title: "Product images missing alt text", desc: "Descriptive alt text improves accessibility and image search ranking.", prompt: "Add descriptive, keyword-aware alt text to product and section images across the theme." },
  { area: "CRO", impact: "med", title: "Homepage CTA blends in", desc: "A higher-contrast, benefit-led hero button lifts click-through to the catalog.", prompt: "Make the homepage hero CTA higher-contrast and benefit-led, matching my color scheme." },
  { area: "Speed", impact: "low", title: "Unused CSS in the theme", desc: "Trimming unused styles and sections shrinks the payload.", prompt: "Find and safely remove unused CSS and unused sections in my theme." },
];

const impactClass = (i: string) => (i === "high" ? "sh-impact-high" : i === "med" ? "sh-impact-med" : "sh-impact-low");

export default function Index() {
  const { shop, previews, activePlan, recommendations, report: initialReport, revenueAnnual, plan: initialPlan, themeError, preparing, themeInfo, usageThisCycle } = useLoaderData<typeof loader>();

  // First-run theme setup runs in the background — poll until it's ready and
  // rotate reassuring messages so the wait feels intentional, not stuck.
  const [prepMsg, setPrepMsg] = useState(0);
  useEffect(() => {
    if (!preparing) return;
    const reload = setTimeout(() => window.location.reload(), 4500);
    const rotate = setInterval(() => setPrepMsg((m) => m + 1), 1600);
    return () => { clearTimeout(reload); clearInterval(rotate); };
  }, [preparing]);
  const planFetcher = useFetcher<{ plan: PlanData | null; error?: string }>();
  const [plan, setPlan] = useState<PlanData | null>((initialPlan as PlanData | null) ?? null);
  const [planReview, setPlanReview] = useState(false);
  const planForm = useState({ perDay: "1", days: "30", strategy: "" });
  const [planSetup, setPlanSetup] = planForm;
  const reportFetcher = useFetcher<{ report: ReportData | null }>();
  const [report, setReport] = useState<ReportData | null>((initialReport as ReportData | null) ?? null);
  // Optimization-meter movement: snapshot scores before a task, show ▲/▼ deltas after.
  const [scoreDeltas, setScoreDeltas] = useState<Record<string, number>>({});
  const prevScoresRef = useRef<Record<string, number>>({});
  // Which score's detail panel is open (breakdown + history + checklist).
  const [activeScore, setActiveScore] = useState<string | null>(null);
  // Prefer the cached store report's recommendations; fall back to onboarding's.
  const recs: Recommendation[] = report?.recommendations?.length ? report.recommendations : recommendations ?? [];
  const apply = useFetcher<ApplyData>();
  const raise = useFetcher();
  const history = useFetcher<{ versions: Version[] }>();
  const restoreFetcher = useFetcher<{ restored?: number; error?: string }>();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"edit" | "optimize">("edit");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  // The plan item currently being executed — auto-marked shipped when its change is accepted/applied.
  const [runningPlanItem, setRunningPlanItem] = useState<{ planId: string; itemId: string; estUsd: number; label: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  // Direct content generation (no agent) — descriptions task.
  const contentFetcher = useFetcher<{ drafts?: ContentDraft[]; total?: number; costUsd?: number; applied?: number; failed?: number; error?: string; links?: { title: string; adminUrl: string }[] }>();
  const suggestFetcher = useFetcher<{ topics?: string[] }>();
  const [contentDrafts, setContentDrafts] = useState<ContentDraft[] | null>(null);
  const [contentCost, setContentCost] = useState(0);
  const [contentSkip, setContentSkip] = useState<Set<string>>(new Set());
  const [descWhich, setDescWhich] = useState("Products with thin/missing descriptions");
  const [descNotes, setDescNotes] = useState("");
  const [articleCount, setArticleCount] = useState("1");
  const [articleTopic, setArticleTopic] = useState("");
  // Section library insert.
  const sectionFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const [sectionTarget, setSectionTarget] = useState("index");
  const [sectionVariant, setSectionVariant] = useState<string>("");
  const [input, setInput] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [approval, setApproval] = useState<{ summary: string }[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [thinking, setThinking] = useState(false);
  const [live, setLive] = useState<{ text: string; tools: string[] }>({ text: "", tools: [] });
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewSrc, setPreviewSrc] = useState(previews[0]?.items[0]?.url ?? "");
  const [pageLabel, setPageLabel] = useState(previews[0]?.label ?? "Home");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageBtnRef = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringSha, setRestoringSha] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [refining, setRefining] = useState(false);
  const [clarify, setClarify] = useState<{ original: string; questions: { question: string; options: string[] }[]; step: number; answers: string[] } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [embedReady, setEmbedReady] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editText, setEditText] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const storefrontOrigin = (() => { try { return new URL(previewSrc).origin; } catch { return ""; } })();
  const [activeTask, setActiveTask] = useState<TaskConfig | null>(null);
  const [taskValues, setTaskValues] = useState<TaskValues>({});
  const [taskSearch, setTaskSearch] = useState("");
  const productsFetcher = useFetcher<{ products: ProductLite[] }>();
  const [diff, setDiff] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });
  const [audit, setAudit] = useState<{ status: "idle" | "loading" | "done" | "error"; scores: Score[]; issues: Issue[]; note?: string }>({ status: "idle", scores: [], issues: [] });
  const scroller = useRef<HTMLDivElement>(null);

  const applying = apply.state !== "idle";
  // Cycle usage from the DB (persists across reloads) + this session's live spend.
  const sessionBilled = messages.reduce((s, m) => s + (m.cost ?? 0), 0) * MARKUP;
  const usageDisplay = (usageThisCycle ?? 0) + sessionBilled;
  // Real site-speed comes from the live PageSpeed audit (the report layer can't measure it).
  const speedFromAudit = audit.status === "done" ? audit.scores.find((s) => s.label === "Speed") : undefined;
  const liveScores = report?.scores?.length
    ? speedFromAudit
      ? [...report.scores, speedFromAudit]
      : report.scores
    : audit.status === "done" && audit.scores.length
      ? audit.scores
      : SCORES;
  // Always show a Speed ring; if not yet audited it's a placeholder (clicking opens the detail / runs the audit).
  const ringScores: (Score & { pending?: boolean })[] = liveScores.some((s) => s.label === "Speed")
    ? liveScores
    : [...liveScores, { label: "Speed", value: 0, color: "#c9ced6", pending: true }];
  const liveIssues = report?.recommendations?.length
    ? report.recommendations
    : audit.status === "done" && audit.issues.length
      ? audit.issues
      : recs.length
        ? recs
        : ISSUES;
  const reportBusy = reportFetcher.state !== "idle";
  function refreshReport() {
    reportFetcher.submit({ force: "1" }, { method: "post", action: "/api/report" });
  }

  // First-run walkthrough (per browser, per shop). Replayable from the “?” button.
  useEffect(() => {
    try {
      if (!localStorage.getItem(`sh_tour_${shop}`)) setTourOpen(true);
    } catch { /* storage blocked */ }
  }, [shop]);
  function finishTour() {
    setTourOpen(false);
    try { localStorage.setItem(`sh_tour_${shop}`, "1"); } catch { /* ignore */ }
  }

  // On app entry only: refresh the report if it's missing or older than ~1 day.
  // No background/cron — away costs nothing; multiple entries/day cost nothing
  // (the engine also throttles to once/day). The model only runs when the store
  // actually changed. Manual Refresh always forces a rebuild.
  useEffect(() => {
    const stale = !report || Date.now() - new Date(report.generatedAt).getTime() > 864e5;
    if (stale) reportFetcher.submit({}, { method: "post", action: "/api/report" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const r = reportFetcher.data?.report;
    if (!r) return;
    setReport(r);
    // If we snapshotted scores before a task, surface how each meter moved.
    const prev = prevScoresRef.current;
    if (Object.keys(prev).length && r.scores?.length) {
      const d: Record<string, number> = {};
      for (const s of r.scores) {
        const before = prev[s.label];
        if (typeof before === "number" && s.value !== before) d[s.label] = s.value - before;
      }
      prevScoresRef.current = {};
      if (Object.keys(d).length) {
        setScoreDeltas(d);
        setTimeout(() => setScoreDeltas({}), 7000);
      }
    }
  }, [reportFetcher.data]);

  // Content Plan: on entry, generate today's draft if the plan is active and none is pending.
  useEffect(() => {
    if (plan?.status === "active" && !plan.draftTitle) {
      planFetcher.submit({ intent: "generate" }, { method: "post", action: "/api/content-plan" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (planFetcher.data && "plan" in planFetcher.data) {
      setPlan(planFetcher.data.plan);
      if (!planFetcher.data.plan?.draftTitle) setPlanReview(false);
    }
  }, [planFetcher.data]);
  const planAction = (intent: string, extra: Record<string, string> = {}) =>
    planFetcher.submit({ intent, ...extra }, { method: "post", action: "/api/content-plan" });
  const planBusy = planFetcher.state !== "idle";

  // Run a real PageSpeed/Lighthouse audit the first time Optimize is opened — but
  // skip it when the cached report already provides scores + recommendations.
  useEffect(() => {
    if (mode !== "optimize" || audit.status !== "idle" || report?.recommendations?.length) return;
    setAudit((a) => ({ ...a, status: "loading" }));
    fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setAudit({ status: "done", scores: d.scores ?? [], issues: d.issues ?? [], note: d.note }))
      .catch((e) => setAudit({ status: "error", scores: [], issues: [], note: e instanceof Error ? e.message : String(e) }));
  }, [mode, audit.status]);

  useEffect(() => {
    if (apply.state !== "idle" || !apply.data) return;
    const d = apply.data;
    if (d.applied > 0) {
      // Some/all applied — keep any failed files staged for discard/retry.
      setPending(d.pending ?? []);
      setFrameKey((k) => k + 1);
      let msg = `✓ Applied ${d.applied}${d.total && d.total !== d.applied ? ` of ${d.total}` : ""} change(s) to your theme${d.version ? ` (${d.version})` : ""}.`;
      if (d.error) msg += ` ⚠️ ${d.error}`;
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
      shipRunningItem(); // a staged change was accepted → mark its plan item shipped
    } else if (d.error || d.message !== "Nothing to apply") {
      // Nothing applied — keep the change staged so the merchant can discard/retry.
      if (d.pending) setPending(d.pending);
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ Couldn't apply this change. ${d.error ?? ""}`.trim() }]);
    }
  }, [apply.state, apply.data]);

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [messages, thinking, live]);

  // Gate: a staged change must be accepted or discarded before starting another.
  function blockedByChange(): boolean {
    if (pending.length > 0) {
      setGateMsg("Please accept or discard the staged change before starting a new one.");
      return true;
    }
    return false;
  }
  // Clear the gate notice once the staged change is resolved.
  useEffect(() => { if (pending.length === 0) setGateMsg(null); }, [pending]);

  async function discardStaged() {
    setDiscarding(true);
    try {
      await fetch("/api/discard", { method: "post" });
      setPending([]);
      setGateMsg(null);
      setRunningPlanItem(null); // abandoned change → don't auto-ship the armed plan item
      setMessages((m) => [...m, { role: "assistant", text: "↩︎ Change discarded — nothing was applied to your theme." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "⚠️ Couldn't discard the change. Please try again." }]);
    } finally {
      setDiscarding(false);
    }
  }

  function send() {
    const text = input.trim();
    if (!text || thinking || refining) return;
    if (blockedByChange()) return;
    setInput("");
    // Answering an open guided question → record it and advance.
    if (clarify) {
      answerClarify(text);
      return;
    }
    // Already-detailed prompts skip triage (saves the call); short/vague ones get it.
    if (text.split(/\s+/).length > 25) {
      void runChat(text, false);
      return;
    }
    void refineThenRun(text);
  }

  // Cheap pre-flight: run now if clear, else open a short guided-question wizard.
  async function refineThenRun(text: string) {
    setRefining(true);
    try {
      const fd = new FormData();
      fd.set("prompt", text);
      const r = await fetch("/api/refine", { method: "post", body: fd });
      const d = (await r.json()) as { clear?: boolean; questions?: { question: string; options: string[] }[] };
      if (d && d.clear === false && Array.isArray(d.questions) && d.questions.length) {
        setClarify({ original: text, questions: d.questions, step: 0, answers: [] });
      } else {
        void runChat(text, false);
      }
    } catch {
      void runChat(text, false);
    } finally {
      setRefining(false);
    }
  }
  // Record an answer to the current guided question; advance or run when done.
  function answerClarify(answer: string) {
    if (!clarify) return;
    const answers = [...clarify.answers, answer];
    const next = clarify.step + 1;
    if (next >= clarify.questions.length) {
      const detail = clarify.questions.map((q, i) => `${q.question} ${answers[i]}`).join("; ");
      const original = clarify.original;
      setClarify(null);
      void runChat(`${original} — ${detail}`, false);
    } else {
      setClarify({ ...clarify, step: next, answers });
    }
  }
  function pickClarify(option: string) {
    if (!clarify || thinking) return;
    answerClarify(option);
  }
  // Skip the rest of the questions and run with whatever's been answered so far.
  function skipClarify() {
    if (!clarify) return;
    const { original, questions, answers } = clarify;
    setClarify(null);
    const detail = answers.length ? ` — ${questions.slice(0, answers.length).map((q, i) => `${q.question} ${answers[i]}`).join("; ")}` : "";
    void runChat(`${original}${detail}`, false);
  }

  function approveMutations() {
    if (thinking) return;
    void runChat("Approved — apply the store changes you proposed.", true);
  }

  // From an Optimize-checklist card → jump to Edit and run the fix.
  function fixIssue(prompt: string) {
    if (blockedByChange()) return;
    setMode("edit");
    if (!thinking) void runChat(prompt, false);
  }

  const AREA_INFO: Record<string, { what: string; why: string }> = {
    SEO: {
      what: "How findable you are on Google — title tags, meta descriptions, unique copy, and indexable content.",
      why: "Organic search is the cheapest, highest-intent traffic there is. Stores that nail on-page SEO compound free traffic month over month instead of renting it from ads.",
    },
    Content: {
      what: "The editorial depth of your store — About/FAQ pages, blog articles, and collection landing pages.",
      why: "Content is what earns trust, answers objections, and pulls in buyers before they're ready to purchase. It's the moat top stores build that competitors can't copy overnight.",
    },
    Catalog: {
      what: "The richness of your product catalog — imagery, alt text, collection structure, and breadth.",
      why: "Rich product pages and clear browsing paths are the #1 on-site driver of conversion and average order value. Thin catalogs leak sales at the moment of decision.",
    },
    "AI Ready": {
      what: "How well AI shopping agents (ChatGPT, Claude, Gemini, Perplexity) can read, understand, and recommend your store.",
      why: "Buyers increasingly ask an AI to shop for them. If your products aren't machine-readable, the agent recommends a competitor — and you never even appear. This is the next search box, and most stores are invisible in it.",
    },
    Speed: {
      what: "How fast your storefront loads, measured live by Google Lighthouse.",
      why: "Every 1s of delay cuts conversions and bounces shoppers. Speed is both a direct revenue lever and a confirmed Google ranking factor.",
    },
  };

  const STATUS_META: Record<string, { icon: string; color: string }> = {
    pass: { icon: "✓", color: "#1c7c3a" },
    warn: { icon: "!", color: "#b46b00" },
    fail: { icon: "✗", color: "#b3261e" },
  };

  function renderScoreDetail(label: string) {
    const isSpeed = label === "Speed";
    const score = ringScores.find((s) => s.label === label);
    const value = score && !("pending" in score && score.pending) ? score.value : null;
    const info = AREA_INFO[label] ?? { what: "", why: "" };

    // Normalize the checklist (handles legacy cached breakdowns gracefully).
    const items = (report?.breakdowns?.[label] ?? [])
      .filter((b) => b.status) // new checklist shape only; legacy rows lack status
      .map((b) => ({
        label: b.label ?? b.factor ?? "",
        status: b.status as "pass" | "warn" | "fail",
        earned: b.earned ?? 0,
        weight: b.weight ?? 0,
        detail: b.detail ?? "",
        why: b.why ?? "",
        fix: b.fix,
      }))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "fail" ? -1 : b.status === "fail" ? 1 : a.status === "warn" ? -1 : 1));

    const speedItems = isSpeed && audit.status === "done"
      ? audit.issues.filter((i) => i.area === "Speed").map((i) => ({ label: i.title, status: "fail" as const, earned: 0, weight: 0, detail: i.desc, why: "", fix: i.prompt }))
      : [];
    const list = isSpeed ? speedItems : items;
    const passCount = list.filter((i) => i.status === "pass").length;
    const gaps = list.filter((i) => i.status !== "pass");

    const series = (report?.history ?? []).map((p) => Number(p[label] ?? 0)).filter((n) => Number.isFinite(n));
    const delta = series.length >= 2 ? series[series.length - 1] - series[0] : null;

    const status =
      value == null ? { label: "Not measured", color: "#98a1ad" }
      : value >= 80 ? { label: "Strong", color: "#34c759" }
      : value >= 60 ? { label: "Needs polish", color: "#ff9500" }
      : value >= 40 ? { label: "Needs work", color: "#ff9500" }
      : { label: "Critical", color: "#ff3b30" };

    const summary = isSpeed
      ? audit.status === "done"
        ? `Speed is ${status.label.toLowerCase()} (${value}/100). ${gaps.length ? `${gaps.length} issue${gaps.length === 1 ? "" : "s"} to fix.` : "No major issues."}`
        : "Run a speed audit on a public storefront to measure this."
      : value == null
        ? "Refresh your report to compute this score and the full checklist."
        : `${label} is ${status.label.toLowerCase()} at ${value}/100 — ${passCount} of ${list.length} checks passing. ${gaps.length ? `Biggest lift: ${gaps[0].label.replace(/\s*\(.*\)/, "").toLowerCase()}.` : "Everything's in place — keep it up."}`;

    const spark = (() => {
      if (series.length < 2) return null;
      const max = Math.max(...series, 1), min = Math.min(...series, 0);
      const W = 260, H = 44, n = series.length;
      const pts = series.map((v, i) => `${(i / (n - 1)) * W},${H - ((v - min) / Math.max(1, max - min)) * (H - 8) - 4}`).join(" ");
      return (
        <svg width="100%" height="48" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <polyline points={pts} fill="none" stroke={score?.color ?? "#0a84ff"} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        </svg>
      );
    })();

    const renderRow = (it: typeof list[number], i: number) => {
      const sm = STATUS_META[it.status];
      return (
        <div key={i} className={`sh-check sh-check-${it.status}`}>
          <div className="sh-check-icon" style={{ color: sm.color, borderColor: sm.color }}>{sm.icon}</div>
          <div className="sh-check-body">
            <div className="sh-check-top">
              <span className="sh-check-label">{it.label}</span>
              {it.weight > 0 && <span className="sh-check-pts">{it.earned}/{it.weight} pts</span>}
            </div>
            {it.detail && <div className="sh-check-detail">{it.detail}</div>}
            {it.why && <div className="sh-check-why">{it.why}</div>}
            {it.fix && it.status !== "pass" && (
              <button className="sh-issue-fix sh-check-fix" disabled={thinking} onClick={() => fixIssue(it.fix!)}>Fix this →</button>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="sh-detail">
        <div className="sh-detail-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="sh-detail-title">{label}</span>
            {value != null && <span className="sh-detail-score" style={{ color: score!.color }}>{value}</span>}
            <span className="sh-detail-status" style={{ color: status.color, background: `${status.color}1f` }}>{status.label}</span>
          </div>
          <button className="sh-detail-x" onClick={() => setActiveScore(null)} aria-label="Close">×</button>
        </div>

        <p className="sh-detail-desc">{info.what}</p>
        {info.why && (
          <div className="sh-detail-why"><span className="sh-detail-why-k">Why it matters</span> {info.why}</div>
        )}
        <div className="sh-detail-summary">{summary}</div>

        {/* over time */}
        <div className="sh-detail-section">
          <div className="sh-detail-h">
            Score over time
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? "sh-delta-up" : "sh-delta-down"}> {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since you started</span>
            )}
          </div>
          {spark ?? <p className="sh-detail-empty">{isSpeed ? "Speed history isn't tracked yet." : "Not enough history yet — a new point is saved on each scan, so you'll watch this climb as you fix items below."}</p>}
        </div>

        {/* the checklist — every factor that builds the score */}
        <div className="sh-detail-section">
          <div className="sh-detail-h">
            {isSpeed ? "What's slowing you down" : `Scorecard — ${passCount}/${list.length} passing`}
          </div>
          {list.length ? (
            <div className="sh-checklist">{list.map(renderRow)}</div>
          ) : isSpeed ? (
            <p className="sh-detail-empty">{audit.status === "done" ? "No major speed issues flagged. ✅ Measured live by Google Lighthouse." : "Run a speed audit (needs a public storefront — password-protected dev stores can't be measured)."}</p>
          ) : (
            <p className="sh-detail-empty">
              No scorecard cached yet. <button className="sh-linkbtn" onClick={refreshReport} disabled={reportBusy}>Refresh report</button> to compute it.
            </p>
          )}
        </div>
      </div>
    );
  }

  function choosePage(label: string, url: string) {
    setPageLabel(label);
    setPreviewSrc(url);
    setMenuPos(null);
    setExpanded(null);
  }

  function togglePageMenu() {
    if (menuPos) return setMenuPos(null);
    const r = pageBtnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, left: r.left });
  }

  function openDiff() {
    setDrawerOpen(true);
    setDiff({ loading: true, text: "" });
    fetch("/api/diff")
      .then((r) => r.json())
      .then((d) => setDiff({ loading: false, text: d.diff ?? "" }))
      .catch(() => setDiff({ loading: false, text: "Couldn't load the diff." }));
  }

  // Apply with a human label: the agent's last summary line → the restore point.
  function applyChanges() {
    const lastAi = [...messages].reverse().find((m) => m.role === "assistant");
    const summary = (lastAi?.text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean)
      ?.replace(/[*_#`]/g, "")
      .slice(0, 140) ?? "";
    apply.submit({ summary }, { method: "post", action: "/api/apply" });
  }

  function openHistory() {
    setHistoryOpen(true);
    history.load("/api/versions");
  }

  // ── Click-to-edit bridge (postMessage to/from the injected storefront script) ──
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = (e.data ?? {}) as { type?: string } & Partial<Selection>;
      if (d.type === "shophero:ready") setEmbedReady(true);
      else if (d.type === "shophero:select") {
        setSelection(d as Selection);
        setEditText("");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Tell the injected script to enter/leave edit mode whenever the toggle or frame changes.
  useEffect(() => {
    const win = frameRef.current?.contentWindow;
    if (!win || !storefrontOrigin) return;
    win.postMessage({ type: editMode ? "shophero:enable" : "shophero:disable" }, storefrontOrigin);
  }, [editMode, storefrontOrigin, frameKey, previewSrc]);

  function onFrameLoad() {
    const win = frameRef.current?.contentWindow;
    if (!win || !storefrontOrigin) return;
    win.postMessage({ type: "shophero:ping" }, storefrontOrigin);
    if (editMode) win.postMessage({ type: "shophero:enable" }, storefrontOrigin);
  }

  function submitEdit() {
    if (!selection || !editText.trim() || thinking) return;
    const s = selection;
    const prompt =
      `On-page visual edit. The merchant clicked this element in the live preview:\n` +
      `- Element: ${s.name} (<${s.tag}>)\n` +
      `- Section type: ${s.sectionType || "unknown"} (wrapper id "${s.sectionId}")\n` +
      `- CSS path: ${s.selector}\n` +
      `- Current content: "${s.text}"\n` +
      `- HTML snippet: ${s.html}\n\n` +
      `Requested change: ${editText.trim()}\n\n` +
      `Locate the matching section/block in the theme files and make ONLY this change.`;
    setSelection(null);
    setEditMode(false);
    setMode("edit");
    void runChat(prompt, false);
  }

  // ── Task launcher ──────────────────────────────────────────────────────────
  function openTask(id: string, keepPlanRun = false) {
    if (blockedByChange()) return;
    const t = TASKS[id];
    if (!t) return;
    // Opening a task that ISN'T part of a plan-item run clears any stale arm, so
    // a later unrelated "Accept" can't falsely mark a plan item shipped.
    if (!keepPlanRun) setRunningPlanItem(null);
    setContentDrafts(null);
    setContentSkip(new Set());
    setDescWhich(
      id === "seo-genius" ? "Products with missing SEO"
      : id === "alt-text" ? "Products with images missing alt text"
      : "Products with thin/missing descriptions",
    );
    setDescNotes("");
    setArticleCount("1");
    setArticleTopic("");
    setSectionKey(null);
    setSectionTarget("index");
    setSectionVariant("");
    if (id === "write-content") {
      suggestFetcher.submit({ op: "suggest", task: "articles" }, { method: "post", action: "/api/content" });
    }
    if (id === "structured-data") {
      setAeoStep(0);
      runAudit();
    }
    if (id === "store-manager") {
      setGoalInput("");
      loadPlan();
      setActiveTask(t);
      return;
    }
    const init: TaskValues = {};
    for (const f of t.fields) {
      if (f.type === "multiselect") init[f.key] = f.default ?? [];
      else if (f.type === "select") init[f.key] = f.options[0];
      else if (f.type === "product") init[f.key] = null;
      else init[f.key] = "";
    }
    setTaskValues(init);
    setTaskSearch("");
    setActiveTask(t);
    if (t.fields.some((f) => f.type === "product") && !productsFetcher.data) productsFetcher.load("/api/products");
  }
  const setField = (key: string, value: unknown) => setTaskValues((v) => ({ ...v, [key]: value }));
  const toggleMulti = (key: string, opt: string) =>
    setTaskValues((v) => {
      const cur = aval(v[key]);
      return { ...v, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
  const taskReady = () => !!activeTask && activeTask.fields.every((f) => !(f.type === "product" && f.required) || !!taskValues[f.key]);
  // ── Direct content generation (descriptions): fast, cheap, no agent loop ──
  const contentBusy = contentFetcher.state !== "idle";
  const contentTaskType = (): "descriptions" | "seo" | "alt" | "articles" =>
    activeTask?.id === "seo-genius" ? "seo"
    : activeTask?.id === "alt-text" ? "alt"
    : activeTask?.id === "write-content" ? "articles"
    : "descriptions";
  function genContent() {
    setContentDrafts(null);
    setContentSkip(new Set());
    const t = contentTaskType();
    const payload: Record<string, string> = { op: "generate", task: t, notes: descNotes };
    if (t === "articles") {
      payload.count = articleCount;
      payload.topic = articleTopic;
    } else {
      payload.which = descWhich;
    }
    contentFetcher.submit(payload, { method: "post", action: "/api/content" });
  }
  function applyDrafts() {
    const keep = (contentDrafts ?? []).filter((d) => !contentSkip.has(d.id));
    if (!keep.length) return;
    contentFetcher.submit(
      { op: "apply", task: contentTaskType(), drafts: JSON.stringify(keep) },
      { method: "post", action: "/api/content" },
    );
  }
  // Deterministic JSON-LD structured data.
  const schemaFetcher = useFetcher<{ ok?: boolean; error?: string; alreadyPresent?: boolean }>();
  const schemaBusy = schemaFetcher.state !== "idle";
  const auditFetcher = useFetcher<{ ok?: boolean; audit?: SchemaAudit; error?: string }>();
  const auditBusy = auditFetcher.state !== "idle";
  const schemaAudit = auditFetcher.data?.audit;
  const [aeoStep, setAeoStep] = useState(0);
  const targetsFetcher = useFetcher<{ ok?: boolean; targets?: import("../lib/aeo-targets.server").AeoTargets; error?: string }>();
  const targetsBusy = targetsFetcher.state !== "idle";
  const aeoTargets = targetsFetcher.data?.targets;
  function genTargets() {
    targetsFetcher.submit({ op: "generate" }, { method: "post", action: "/api/aeo-targets" });
  }

  // ── Routed action plan (the persistent checklist behind "Improve my store") ─
  const roadmapFetcher = useFetcher<{ ok?: boolean; plan?: ActionPlanData | null; error?: string }>();
  const actionPlan = roadmapFetcher.data?.plan ?? null;
  const planBusyState = roadmapFetcher.state !== "idle";
  const [goalInput, setGoalInput] = useState("");
  function loadPlan() { roadmapFetcher.submit({ op: "get" }, { method: "post", action: "/api/plan" }); }
  function buildPlan(goal: string) {
    const g = goal.trim();
    if (!g) return;
    roadmapFetcher.submit({ op: "decompose", goal: g }, { method: "post", action: "/api/plan" });
  }
  function markPlanItem(item: PlanItem, status: "done" | "skipped" | "todo") {
    if (!actionPlan) return;
    const body: Record<string, string> = { op: "update", planId: actionPlan.id, itemId: item.id, status };
    if (status === "done") { body.summary = PLAN_ROUTE_MAP[item.route]?.label ?? item.title; body.actualUsd = String(item.estUsd); }
    roadmapFetcher.submit(body, { method: "post", action: "/api/plan" });
  }
  function archivePlanGoal() {
    if (!actionPlan) return;
    setGoalInput("");
    roadmapFetcher.submit({ op: "archive", planId: actionPlan.id }, { method: "post", action: "/api/plan" });
  }
  // When the change a plan item produced is accepted/applied, mark it shipped (date + cost).
  function shipRunningItem(summary?: string) {
    const r = runningPlanItem;
    if (!r) return;
    setRunningPlanItem(null);
    roadmapFetcher.submit(
      { op: "update", planId: r.planId, itemId: r.itemId, status: "done", summary: summary ?? r.label, actualUsd: String(r.estUsd) },
      { method: "post", action: "/api/plan" },
    );
  }
  // Route a plan item to the cheapest correct engine, then drop into that task.
  // Routes that stage/apply a store change arm auto-ship; informational ones don't.
  function runPlanItem(item: PlanItem) {
    if (blockedByChange()) return; // resolve any pending change before starting a new step
    const arm = () => actionPlan && setRunningPlanItem({ planId: actionPlan.id, itemId: item.id, estUsd: item.estUsd, label: PLAN_ROUTE_MAP[item.route]?.label ?? item.title });
    switch (item.route) {
      case "schema": arm(); addStructuredData(); break;
      case "aeo-audit": openTask("structured-data"); break;
      case "aeo-targets": openTask("structured-data"); setAeoStep(2); setTimeout(() => genTargets(), 50); break;
      case "section-faq": arm(); openTask("add-section", true); setSectionKey("sh-faq"); setSectionVariant("bordered"); break;
      case "section-trust": arm(); openTask("add-section", true); setSectionKey("sh-trust-bar"); setSectionVariant("inline"); break;
      case "section": arm(); openTask("add-section", true); break;
      case "pdp-template": arm(); openTask("build-pdp", true); break;
      case "descriptions": arm(); openTask("bulk-descriptions", true); break;
      case "seo": arm(); openTask("seo-genius", true); break;
      case "alt": arm(); openTask("alt-text", true); break;
      case "articles": arm(); openTask("write-content", true); break;
      case "agent": default:
        arm();
        setActiveTask(null);
        if (item.prompt) void runChat(item.prompt, false);
        break;
    }
  }
  function runAudit() {
    auditFetcher.submit({ op: "audit" }, { method: "post", action: "/api/structured-data" });
  }
  function addStructuredData() {
    schemaFetcher.submit({}, { method: "post", action: "/api/structured-data" });
  }
  function applyAuditFix(fix: NonNullable<SchemaAudit["checks"][number]["fix"]>) {
    if (fix.href) { window.open(fix.href, "_blank", "noopener"); return; }
    if (fix.action === "install") { addStructuredData(); return; }
    if (fix.action === "add-faq") { openTask("add-section"); setSectionKey("sh-faq"); setSectionVariant("bordered"); return; }
    if (fix.action === "write-descriptions") { openTask("bulk-descriptions"); return; }
    if (fix.action === "write-content") { openTask("write-content"); return; }
    if (fix.action === "gen-targets") { genTargets(); return; }
  }
  useEffect(() => {
    if (schemaFetcher.state !== "idle" || !schemaFetcher.data?.ok) return;
    if (schemaFetcher.data.alreadyPresent) {
      setMessages((m) => [...m, { role: "assistant", text: "✓ Structured data is already set up on your theme." }]);
    } else {
      setPending((p) => [...new Set([...p, "snippets/sh-structured-data.liquid", "layout/theme.liquid"])]);
      setMessages((m) => [...m, { role: "assistant", text: "✓ Added the full JSON-LD schema set (Organization, WebSite + search, Product, Breadcrumbs, Collection, Article, FAQ). Accept to publish — then re-run the audit to verify it live." }]);
    }
    runAudit(); // refresh the score after install
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaFetcher.state, schemaFetcher.data]);

  const sectionBusy = sectionFetcher.state !== "idle";
  function insertSectionAction() {
    if (!sectionKey) return;
    sectionFetcher.submit({ key: sectionKey, target: sectionTarget, variant: sectionVariant }, { method: "post", action: "/api/section" });
  }
  useEffect(() => {
    if (sectionFetcher.state !== "idle" || !sectionFetcher.data?.ok) return;
    const name = SECTION_LIBRARY.find((s) => s.key === sectionKey)?.name ?? "section";
    const targetLabel = SECTION_TARGETS.find((t) => t.template === sectionTarget)?.label ?? sectionTarget;
    setActiveTask(null);
    setPending((p) => [...new Set([...p, `sections/${sectionKey}.liquid`, `templates/${sectionTarget}.json`])]);
    setMessages((m) => [...m, { role: "assistant", text: `✓ Added the ${name} section to your ${targetLabel}. Preview it in the panel, then Accept to publish.` }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFetcher.state, sectionFetcher.data]);

  // Stock images — search a connected provider + import to Shopify Files.
  interface StockImg { id: string; thumb: string; full: string; alt: string; photographer: string; photographerUrl: string; downloadLocation?: string }
  const stockSearchFetcher = useFetcher<{ images?: StockImg[]; provider?: string; error?: string }>();
  const stockImportFetcher = useFetcher<{ ok?: boolean; id?: string; error?: string }>();
  const [stockQuery, setStockQuery] = useState("");
  const [stockImported, setStockImported] = useState<Set<string>>(new Set());
  const [stockImporting, setStockImporting] = useState<string | null>(null);
  const stockSearching = stockSearchFetcher.state !== "idle";
  function searchStockImages() {
    const q = stockQuery.trim();
    if (!q) return;
    stockSearchFetcher.submit({ op: "search", q }, { method: "post", action: "/api/stock-images" });
  }
  function importStockImage(img: StockImg) {
    setStockImporting(img.id);
    stockImportFetcher.submit(
      { op: "import", full: img.full, alt: img.alt, downloadLocation: img.downloadLocation ?? "" },
      { method: "post", action: "/api/stock-images" },
    );
  }
  useEffect(() => {
    if (stockImportFetcher.state !== "idle" || !stockImportFetcher.data) return;
    const id = stockImporting;
    setStockImporting(null);
    if (stockImportFetcher.data.ok && id) setStockImported((s) => new Set([...s, id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockImportFetcher.state, stockImportFetcher.data]);

  // PDP blueprints — apply a best-practice product-page section stack in one pass.
  const pdpFetcher = useFetcher<{ ok?: boolean; error?: string; files?: string[] }>();
  const pdpBusy = pdpFetcher.state !== "idle";
  const [pdpBlueprint, setPdpBlueprint] = useState<string>(PDP_BLUEPRINTS[0].key);
  function applyPdpBlueprint() {
    pdpFetcher.submit({ blueprint: pdpBlueprint }, { method: "post", action: "/api/pdp-template" });
  }
  useEffect(() => {
    if (pdpFetcher.state !== "idle" || !pdpFetcher.data?.ok) return;
    const bp = PDP_BLUEPRINT_MAP[pdpBlueprint];
    setActiveTask(null);
    setPending((p) => [...new Set([...p, ...(pdpFetcher.data?.files ?? [])])]);
    setMessages((m) => [...m, { role: "assistant", text: `✓ Applied the ${bp?.name ?? "PDP"} layout (${bp?.sections.length ?? 0} sections) to your product template. Preview it, then Accept to publish.` }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdpFetcher.state, pdpFetcher.data]);

  function toggleSkip(id: string) {
    setContentSkip((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  useEffect(() => {
    if (contentFetcher.state !== "idle" || !contentFetcher.data) return;
    const d = contentFetcher.data;
    if (d.drafts) {
      setContentDrafts(d.drafts);
      setContentCost(d.costUsd ?? 0);
    } else if (typeof d.applied === "number") {
      setContentDrafts(null);
      setActiveTask(null);
      const articles = !!d.links;
      const deliverables = (d.links ?? []).map((l) => ({ type: "article", title: l.title, adminUrl: l.adminUrl }));
      setMessages((m) => [...m, {
        role: "assistant",
        text: `✓ ${articles ? "Published" : "Applied"} ${d.applied} ${articles ? "blog article" : "update"}${d.applied === 1 ? "" : "s"}${d.failed ? ` · ${d.failed} failed` : ""}.`,
        deliverables: deliverables.length ? deliverables : undefined,
      }]);
      shipRunningItem(); // content was applied/published → mark its plan item shipped
      reportFetcher.submit({}, { method: "post", action: "/api/report" }); // re-score
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentFetcher.state, contentFetcher.data]);

  function runTask() {
    if (!activeTask || !taskReady() || thinking) return;
    if (blockedByChange()) return;
    let prompt = activeTask.build(taskValues);
    // Ground every task in the store's real, already-scanned facts so the agent
    // targets actual issues (and the brand kit/memory ride along via the system
    // prompt) — the most accurate data per request, for free.
    if (report?.findings?.length) {
      prompt += `\n\nContext from my latest store scan (use what's relevant): ${report.findings.slice(0, 6).join("; ")}.`;
    }
    if (activeTask.id === "mobile-opt") setDevice("mobile"); // preview the work where it matters
    setActiveTask(null);
    setMode("edit");
    void runChat(prompt, false);
  }

  function renderStoreManager() {
    const recs = report?.recommendations ?? [];
    const quickGoals = recs.slice(0, 4).map((r) => r.title);
    const decomposing = planBusyState && !actionPlan;
    const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

    // No plan yet → goal input + quick-start chips from the store report.
    if (!actionPlan) {
      return (
        <div className="sh-task">
          <div className="sh-task-head">
            <div>
              <div className="sh-task-title">✨ Improve my store</div>
              <div className="sh-task-desc">Tell me a goal. I'll break it into a checklist of small steps — each routed to the cheapest engine that does it right — that you run one by one. Your progress, costs and what shipped are saved here.</div>
            </div>
            <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
          </div>
          <div className="sh-task-body">
            {roadmapFetcher.data?.error && <div className="sh-err">{roadmapFetcher.data.error}</div>}
            <div className="sh-task-field">
              <label className="sh-task-label">What do you want to achieve?</label>
              <textarea className="sh-ob-input" rows={3} placeholder="e.g. Get my store ready for AI shopping assistants · Make my homepage convert better · Rebuild my product pages"
                value={goalInput} onChange={(e) => setGoalInput(e.target.value)} disabled={decomposing} />
            </div>
            {quickGoals.length > 0 && (
              <div>
                <div className="sh-audit-h">Or start from a ranked opportunity</div>
                <div className="sh-plan-chips">
                  {quickGoals.map((g, i) => (
                    <button key={i} className="sh-plan-chip" disabled={decomposing} onClick={() => { setGoalInput(g); buildPlan(g); }}>{g}</button>
                  ))}
                </div>
              </div>
            )}
            {decomposing && <div className="sh-opt-loading"><div className="sh-spinner" /> Breaking your goal into a routed plan…</div>}
          </div>
          <div className="sh-task-est">
            <span>Planning cost <strong>~$0.01</strong> · a few seconds</span>
            <span className="sh-task-est-note">Each step then shows its own cost before you run it.</span>
          </div>
          <div className="sh-task-foot">
            <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
            <button className="sh-btn sh-btn-primary" disabled={!goalInput.trim() || decomposing} onClick={() => buildPlan(goalInput)}>{decomposing ? "Building…" : "Build my plan →"}</button>
          </div>
        </div>
      );
    }

    // Have a plan → the persistent routed checklist.
    const t = planTotals(actionPlan.items);
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">✨ {actionPlan.goal}</div>
            <div className="sh-task-desc">Your roadmap — run each step one at a time. Progress, cost and what shipped are saved automatically.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {roadmapFetcher.data?.error && <div className="sh-err">{roadmapFetcher.data.error}</div>}
          <div className="sh-plan-prog">
            <div className="sh-plan-prog-top">
              <strong>{t.done}/{t.total} done</strong>
              <span>{t.spent > 0 ? `$${t.spent.toFixed(2)} spent · ` : ""}~${t.estRemaining.toFixed(2)} left</span>
            </div>
            <div className="sh-plan-bar"><span style={{ width: `${pct}%` }} /></div>
          </div>

          <div className="sh-plan-list">
            {actionPlan.items.map((item, i) => {
              const route = PLAN_ROUTE_MAP[item.route];
              const engine = route?.engine ?? "agent";
              return (
                <div key={item.id} className={`sh-plan-item is-${item.status}`}>
                  <span className="sh-plan-num">{item.status === "done" ? "✓" : item.status === "skipped" ? "–" : i + 1}</span>
                  <div className="sh-plan-main">
                    <div className="sh-plan-itop">
                      <span className="sh-plan-ititle">{item.title}</span>
                      <span className={`sh-plan-badge e-${engine}`}>{route?.badge ?? "Agent"}</span>
                      <span className="sh-plan-cost">{item.estUsd > 0 ? `~$${item.estUsd.toFixed(2)}` : "Free"}</span>
                    </div>
                    <div className="sh-plan-idetail">{item.detail}</div>
                    {item.status === "done" && (
                      <div className="sh-plan-shipped">✓ Shipped {fmtDate(item.shippedAt)}{item.actualUsd != null ? ` · $${item.actualUsd.toFixed(2)}` : ""}{item.shippedSummary ? ` · ${item.shippedSummary}` : ""}</div>
                    )}
                    {item.status !== "done" && (
                      <div className="sh-plan-actions">
                        <button className="sh-plan-run" disabled={planBusyState} onClick={() => runPlanItem(item)}>Run →</button>
                        <button className="sh-plan-mini" disabled={planBusyState} onClick={() => markPlanItem(item, "done")}>Mark shipped</button>
                        {item.status !== "skipped"
                          ? <button className="sh-plan-mini" disabled={planBusyState} onClick={() => markPlanItem(item, "skipped")}>Skip</button>
                          : <button className="sh-plan-mini" disabled={planBusyState} onClick={() => markPlanItem(item, "todo")}>Undo skip</button>}
                      </div>
                    )}
                    {item.status === "done" && (
                      <div className="sh-plan-actions"><button className="sh-plan-mini" disabled={planBusyState} onClick={() => markPlanItem(item, "todo")}>Reopen</button></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" onClick={archivePlanGoal}>New goal</button>
          <button className="sh-btn sh-btn-primary" onClick={() => setActiveTask(null)}>{pct === 100 ? "Done 🎉" : "Close"}</button>
        </div>
      </div>
    );
  }

  function renderContentPlanSetup() {
    const total = plan ? plan.days * plan.perDay : 0;
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">📅 Content Plan</div>
            <div className="sh-task-desc">ShopHero drafts the best next article for your store. You review and publish each day — nothing goes live without your approval.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {plan ? (
            <>
              <div className="sh-sm-summary">
                <div><div className="sh-sm-num">{plan.publishedCount}</div><div className="sh-sm-lbl">published</div></div>
                <div><div className="sh-sm-num">{total}</div><div className="sh-sm-lbl">in this plan</div></div>
                <span className={`sh-cp-badge sh-cp-${plan.status}`} style={{ marginLeft: "auto" }}>{plan.status}</span>
              </div>
              {plan.strategy && <p className="sh-task-desc" style={{ marginTop: 12 }}>Focus: {plan.strategy}</p>}
              <div className="sh-cp-controls">
                {plan.draftTitle ? (
                  <button className="sh-btn sh-btn-primary" onClick={() => { setActiveTask(null); setPlanReview(true); }}>Review today's article →</button>
                ) : plan.status === "active" ? (
                  <button className="sh-btn sh-btn-primary" disabled={planBusy} onClick={() => planAction("generate")}>{planBusy ? "Drafting…" : "Draft next article"}</button>
                ) : null}
                {plan.status === "active" ? (
                  <button className="sh-btn sh-btn-ghost" disabled={planBusy} onClick={() => planAction("pause")}>Pause plan</button>
                ) : plan.status === "paused" ? (
                  <button className="sh-btn sh-btn-ghost" disabled={planBusy} onClick={() => planAction("resume")}>Resume plan</button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="sh-ob-row">
                <label className="sh-ob-field"><span>Articles per day</span>
                  <select className="sh-ob-input" value={planSetup.perDay} onChange={(e) => setPlanSetup((s) => ({ ...s, perDay: e.target.value }))}>
                    <option value="1">1 / day</option><option value="2">2 / day</option>
                  </select>
                </label>
                <label className="sh-ob-field"><span>Duration</span>
                  <select className="sh-ob-input" value={planSetup.days} onChange={(e) => setPlanSetup((s) => ({ ...s, days: e.target.value }))}>
                    <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
                  </select>
                </label>
              </div>
              <label className="sh-ob-field"><span>Topic strategy (optional)</span>
                <textarea className="sh-ob-input sh-ob-textarea" rows={3} placeholder="e.g. buying guides + care tips for our gold art; target gift buyers" value={planSetup.strategy} onChange={(e) => setPlanSetup((s) => ({ ...s, strategy: e.target.value }))} />
              </label>
              <p className="sh-ob-fineprint">ShopHero analyzes your existing content + catalog, then drafts the highest-value new article. You approve &amp; publish each day.</p>
            </>
          )}
        </div>
        <div className="sh-task-foot">
          {plan ? (
            <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Close</button>
          ) : (
            <>
              <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
              <button className="sh-btn sh-btn-primary" disabled={planBusy} onClick={() => { planAction("start", { perDay: planSetup.perDay, days: planSetup.days, strategy: planSetup.strategy }); setActiveTask(null); }}>
                {planBusy ? "Starting…" : "Start plan →"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderDraftReview() {
    if (!plan?.draftTitle) return null;
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">📅 Today's article</div>
            <div className="sh-task-desc">Review, then publish it live to your blog.{plan.draftTopic ? ` Topic: ${plan.draftTopic}` : ""}</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setPlanReview(false)}>✕</button>
        </div>
        <div className="sh-task-body">
          <article className="sh-cp-article">
            <h1 className="sh-cp-title">{plan.draftTitle}</h1>
            {plan.draftMeta && <p className="sh-cp-meta">{plan.draftMeta}</p>}
            <div className="sh-cp-body" dangerouslySetInnerHTML={{ __html: plan.draftBody ?? "" }} />
          </article>
          {planFetcher.data?.error && <div className="sh-ob-error" style={{ marginTop: 12 }}>{planFetcher.data.error}</div>}
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" disabled={planBusy} onClick={() => planAction("regenerate")}>{planBusy ? "…" : "Regenerate"}</button>
          <button className="sh-btn sh-btn-primary" disabled={planBusy} onClick={() => planAction("publish")}>{planBusy ? "Publishing…" : "Publish & go live →"}</button>
        </div>
      </div>
    );
  }

  function renderSchemaTask() {
    const a = schemaAudit;
    const gradeKey = a ? a.grade.replace(/\s+/g, "").toLowerCase() : "";
    const ringColor = a ? (a.score >= 90 ? "#16a34a" : a.score >= 70 ? "#0a84ff" : a.score >= 50 ? "#f5a623" : "#e0245e") : "#0a84ff";
    const statusIcon = (s: string) => (s === "pass" ? "✓" : s === "partial" ? "◐" : s === "todo" ? "→" : s === "unknown" ? "•" : "✕");
    const steps = a?.steps ?? [];
    const stepIdx = Math.min(aeoStep, Math.max(0, steps.length - 1));
    const step = steps[stepIdx];
    const stepProgress = (s: typeof step) => (s && s.scored ? `${s.items.filter((i) => i.status === "pass").length}/${s.items.length}` : "guided");
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">🧠 AEO Brain — AI Visibility Optimizer</div>
            <div className="sh-task-desc">A guided process (not one click) to make AI assistants — ChatGPT, Gemini, AI Mode, Perplexity — find, trust and recommend your store. We fix what we can automatically; the rest we hand you with clear steps. Built on Ethan Smith's SEO/AEO playbook.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {auditBusy && !a && <div className="sh-audit-load">Analyzing your store &amp; live schema…</div>}
          {auditFetcher.data?.error && <div className="sh-err">{auditFetcher.data.error}</div>}
          {a && (
            <>
              <div className="sh-audit-top">
                <div className="sh-ring" style={{ ["--val" as string]: a.score, ["--c" as string]: ringColor } as React.CSSProperties}>
                  <span className="sh-ring-num">{a.score}</span>
                </div>
                <div className="sh-audit-meta">
                  <div className={`sh-audit-grade sh-audit-grade--${gradeKey}`}>{a.grade}</div>
                  <div className="sh-audit-sub">AI-Readiness score · {a.installed ? "schema installed" : "not installed yet"}</div>
                  <div className={`sh-audit-live ${a.live.verified ? "ok" : "warn"}`}>
                    {a.live.verified ? `✓ Verified live: ${(a.live.detectedTypes ?? []).join(", ")}` : (a.live.note ?? "Not verified live yet")}
                  </div>
                </div>
              </div>

              <div className="sh-aeo-steps">
                {steps.map((s, i) => (
                  <button key={s.key} className={`sh-aeo-step${i === stepIdx ? " is-active" : ""}`} onClick={() => setAeoStep(i)}>
                    <span className="sh-aeo-step-n">{i + 1}</span>
                    <span className="sh-aeo-step-t">{s.title}</span>
                    <span className="sh-aeo-step-p">{stepProgress(s)}</span>
                  </button>
                ))}
              </div>

              {step && (
                <>
                  <div className="sh-aeo-intro">
                    <div className="sh-aeo-intro-h">{step.subtitle}</div>
                    <p>{step.intro}</p>
                  </div>

                  <div className="sh-audit-checks">
                    {step.items.map((c) => (
                      <div key={c.key} className={`sh-audit-check ${c.status}`}>
                        <span className="sh-audit-ci">{statusIcon(c.status)}</span>
                        <span className="sh-audit-cb">
                          <span className="sh-audit-cl">
                            {c.label}
                            <span className={`sh-aeo-who ${c.who}`}>{c.who === "ai" ? "AI fixes" : "You"}</span>
                            {step.scored && c.weight > 0 && <span className="sh-audit-cw">+{c.weight}</span>}
                          </span>
                          <span className="sh-audit-cd">{c.detail}</span>
                          {c.who === "you" && c.status !== "pass" && c.how && <span className="sh-aeo-how">{c.how}</span>}
                        </span>
                        {c.fix && c.status !== "pass" && (
                          <button className={`sh-audit-fix${c.who === "ai" ? " is-ai" : ""}`} onClick={() => applyAuditFix(c.fix!)}>{c.fix.label} {c.fix.href ? "↗" : "→"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {step.key === "foundation" && (
                    <div>
                      <div className="sh-audit-h">Schema coverage by page</div>
                      <div className="sh-audit-cov">
                        {a.coverage.map((row) => (
                          <div key={row.pageType} className={`sh-audit-covrow ${row.status}`}>
                            <span className="sh-audit-covpage">{row.status === "active" ? "✓" : "○"} {row.pageType}</span>
                            <span className="sh-audit-covtypes">{row.types.join(" · ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.key === "offsite" && (
                    <div className="sh-aeo-targets">
                      {targetsBusy && <div className="sh-audit-load">Generating your questions &amp; finding the sources AI cites… (~20s)</div>}
                      {targetsFetcher.data?.error && <div className="sh-err">{targetsFetcher.data.error}</div>}
                      {!targetsBusy && !aeoTargets && (
                        <button className="sh-aeo-gen" onClick={genTargets}>
                          ✨ Generate my citation targets <span>~$0.10 · finds your questions + where to earn mentions</span>
                        </button>
                      )}
                      {aeoTargets && (
                        <>
                          <div className="sh-audit-h">Questions to win {aeoTargets.category && `· ${aeoTargets.category}`}</div>
                          <div className="sh-aeo-qs">
                            {aeoTargets.questions.map((q, i) => (
                              <div key={i} className="sh-aeo-q"><span className="sh-aeo-qtag">{q.intent}</span>{q.q}</div>
                            ))}
                          </div>
                          <div className="sh-audit-h">Where to earn mentions {aeoTargets.grounded ? "· live web results" : "· AI-suggested (verify in ChatGPT)"}</div>
                          <div className="sh-aeo-srcs">
                            {aeoTargets.sources.map((s, i) => (
                              <div key={i} className="sh-aeo-src">
                                <div className="sh-aeo-src-top">
                                  <span className={`sh-aeo-srctype t-${s.type.toLowerCase().replace(/[^a-z]/g, "")}`}>{s.type}</span>
                                  <span className="sh-aeo-srcname">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.source} ↗</a> : s.source}</span>
                                </div>
                                {s.why && <div className="sh-aeo-srcwhy">{s.why}</div>}
                                {s.action && <div className="sh-aeo-srcact">▶ {s.action}</div>}
                              </div>
                            ))}
                          </div>
                          <button className="sh-btn sh-btn-ghost" disabled={targetsBusy} onClick={genTargets} style={{ alignSelf: "flex-start" }}>↻ Regenerate</button>
                        </>
                      )}
                    </div>
                  )}

                  {step.key === "verify" && a.live.url && (
                    <div className="sh-audit-tools">
                      <a href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(a.live.url)}`} target="_blank" rel="noopener noreferrer">Google Rich Results Test ↗</a>
                      <a href={`https://validator.schema.org/#url=${encodeURIComponent(a.live.url)}`} target="_blank" rel="noopener noreferrer">Schema.org validator ↗</a>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {schemaFetcher.data?.error && <div className="sh-err">{schemaFetcher.data.error}</div>}
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" disabled={stepIdx === 0} onClick={() => setAeoStep(Math.max(0, stepIdx - 1))}>← Back</button>
          <button className="sh-btn sh-btn-ghost" disabled={auditBusy} onClick={runAudit}>{auditBusy ? "Scanning…" : "↻ Re-scan"}</button>
          {stepIdx < steps.length - 1
            ? <button className="sh-btn sh-btn-primary" onClick={() => setAeoStep(stepIdx + 1)}>Next: {steps[stepIdx + 1]?.title} →</button>
            : <button className="sh-btn sh-btn-primary" onClick={() => setActiveTask(null)}>Done</button>}
        </div>
      </div>
    );
  }

  function renderStockTask() {
    const data = stockSearchFetcher.data;
    const images = data?.images ?? [];
    const noKey = data?.error?.includes("Settings");
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">🖼️ Stock Images</div>
            <div className="sh-task-desc">Search license-clean photos and add them straight to your Shopify Files — then use them in the theme editor, sections or product media.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {noKey ? (
            <div className="sh-empty" style={{ textAlign: "center", padding: "20px 0" }}>
              <p>Connect a free stock-photo account first.</p>
              <button className="sh-btn sh-btn-primary" style={{ marginTop: 10 }} onClick={() => navigate("/app/settings")}>Open Settings →</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="sh-ob-input" style={{ flex: 1 }} placeholder="Search photos — e.g. minimalist desk, coffee, skincare"
                  value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchStockImages(); }} />
                <button className="sh-btn sh-btn-primary" disabled={stockSearching || !stockQuery.trim()} onClick={searchStockImages}>{stockSearching ? "Searching…" : "Search"}</button>
              </div>
              {data?.error && !noKey && <div className="sh-err">{data.error}</div>}
              {stockImportFetcher.data?.error && <div className="sh-err">{stockImportFetcher.data.error}</div>}
              {images.length > 0 && (
                <>
                  <div className="sh-stock-grid">
                    {images.map((img) => {
                      const done = stockImported.has(img.id);
                      const busy = stockImporting === img.id;
                      return (
                        <div key={img.id} className="sh-stock-cell">
                          <img src={img.thumb} alt={img.alt} loading="lazy" />
                          <div className="sh-stock-overlay">
                            <button className="sh-stock-add" disabled={busy || done} onClick={() => importStockImage(img)}>
                              {done ? "✓ In Files" : busy ? "Adding…" : "Add to Files"}
                            </button>
                            {img.photographer && <a className="sh-stock-cred" href={img.photographerUrl} target="_blank" rel="noopener noreferrer">{img.photographer}</a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sh-task-desc">Imported photos appear under <strong>Content → Files</strong> in Shopify and in the theme editor&apos;s image pickers. Credit the photographer where shown ({data?.provider === "unsplash" ? "Unsplash" : "Pexels"} license).</div>
                </>
              )}
              {data && images.length === 0 && !data.error && <div className="sh-empty">No photos found — try a different search.</div>}
            </>
          )}
        </div>
        <div className="sh-task-est">
          <span>Est. cost <strong>$0.00</strong></span>
          <span className="sh-task-est-note">Free via your connected provider. Importing copies the photo into your Shopify Files.</span>
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Close</button>
        </div>
      </div>
    );
  }

  function renderPdpTask() {
    const bp = PDP_BLUEPRINT_MAP[pdpBlueprint];
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">🚀 Build a high-converting product page</div>
            <div className="sh-task-desc">Apply a proven PDP layout instantly — a best-practice stack of theme-matched sections, added to your product template in one step. Based on the 2026 PDP playbook. $0, no AI.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {pdpFetcher.data?.error && <div className="sh-err">{pdpFetcher.data.error}</div>}
          <div className="sh-pdp-blueprints">
            {PDP_BLUEPRINTS.map((b) => (
              <button key={b.key} className={`sh-pdp-bp${pdpBlueprint === b.key ? " is-sel" : ""}`} onClick={() => setPdpBlueprint(b.key)}>
                <div className="sh-pdp-bp-top"><span className="sh-pdp-bp-emoji">{b.emoji}</span><span className="sh-pdp-bp-name">{b.name}</span><span className="sh-pdp-bp-n">{b.sections.length} sections</span></div>
                <div className="sh-pdp-bp-desc">{b.description}</div>
              </button>
            ))}
          </div>
          {bp && (
            <div>
              <div className="sh-audit-h">This layout adds, in order</div>
              <div className="sh-pdp-stack">
                {bp.sections.map((s, i) => (
                  <span key={i} className="sh-pdp-chip">{i + 1}. {SECTION_LIBRARY.find((x) => x.key === s.key)?.name ?? s.key}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="sh-audit-h">Best-practice checklist (17 elements)</div>
            <div className="sh-pdp-check">
              {PDP_CHECKLIST.map((c, i) => (
                <div key={i} className={`sh-pdp-citem ${c.auto ? "auto" : "manual"}`}>
                  <span className="sh-pdp-cmark">{c.auto ? "✓" : "○"}</span>
                  <span>{c.label}</span>
                  <span className="sh-pdp-ctag">{c.auto ? "Added" : "In your theme"}</span>
                </div>
              ))}
            </div>
            <div className="sh-task-desc" style={{ marginTop: 8 }}>“In your theme” items live in your product section (photos, title, price, variants, Add-to-Cart, sticky bar). Use the editor or ask the AI for those — this layout handles everything below the buy box.</div>
          </div>
        </div>
        <div className="sh-task-est">
          <span>Est. cost <strong>$0.00</strong> · instant</span>
          <span className="sh-task-est-note">Theme-matched sections, staged for your approval.</span>
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
          <button className="sh-btn sh-btn-primary" disabled={pdpBusy} onClick={applyPdpBlueprint}>{pdpBusy ? "Applying…" : `Apply ${bp?.name ?? "layout"} →`}</button>
        </div>
      </div>
    );
  }

  function renderSectionTask() {
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">🧩 Add a Section</div>
            <div className="sh-task-desc">Pick a polished, ready-made section. It's inserted into your theme (staged) — preview, then Accept to publish. No AI cost.</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          <div className="sh-seclib">
            {SECTION_LIBRARY.map((s) => (
              <button key={s.key} className={`sh-seccard${sectionKey === s.key ? " is-sel" : ""}`} onClick={() => { setSectionKey(s.key); setSectionVariant(s.variants?.[0]?.value ?? ""); }}>
                <span className="sh-seccard-emoji">{s.emoji}</span>
                <span className="sh-seccard-body">
                  <span className="sh-seccard-name">{s.name}{s.variants ? <span className="sh-seccard-tag">{s.variants.length} styles</span> : null}</span>
                  <span className="sh-seccard-desc">{s.description}</span>
                </span>
              </button>
            ))}
          </div>
          {(() => {
            const sel = SECTION_LIBRARY.find((s) => s.key === sectionKey);
            if (!sel?.variants) return null;
            return (
              <>
                <label className="sh-label" style={{ marginTop: 14 }}>Design</label>
                <div className="sh-variant-row">
                  {sel.variants.map((v) => (
                    <button key={v.value} className={`sh-variant${sectionVariant === v.value ? " is-sel" : ""}`} onClick={() => setSectionVariant(v.value)}>{v.label}</button>
                  ))}
                </div>
              </>
            );
          })()}
          <label className="sh-label" style={{ marginTop: 14 }}>Add to</label>
          <select className="sh-ob-input" value={sectionTarget} onChange={(e) => setSectionTarget(e.target.value)} disabled={sectionBusy}>
            {SECTION_TARGETS.map((t) => <option key={t.template} value={t.template}>{t.label}</option>)}
          </select>
          {sectionFetcher.data?.error && <div className="sh-err" style={{ marginTop: 10 }}>{sectionFetcher.data.error}</div>}
        </div>
        <div className="sh-task-est">
          <span>Est. cost <strong>$0.00</strong> · instant</span>
          <span className="sh-task-est-note">Ready-made section — no AI generation. Staged for your approval.</span>
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
          <button className="sh-btn sh-btn-primary" disabled={!sectionKey || sectionBusy} onClick={insertSectionAction}>{sectionBusy ? "Adding…" : "Add section →"}</button>
        </div>
      </div>
    );
  }

  function renderContentTask(mode: "descriptions" | "seo" | "alt" | "articles") {
    const keepCount = (contentDrafts ?? []).filter((d) => !contentSkip.has(d.id)).length;
    const reviewing = !!contentDrafts;
    const isSeo = mode === "seo";
    const isAlt = mode === "alt";
    const isArticles = mode === "articles";
    const META = {
      descriptions: { title: "✍️ Rewrite Product Descriptions", desc: "Fast, on-brand descriptions written directly (no waiting on the agent). Review the before/after, then publish.", noun: "description", unit: "product", perItem: 0.04, writing: "Writing descriptions…", empty: "No products needed rewriting — they already have solid descriptions. ✅", btn: "Write descriptions →", which: ["Products with thin/missing descriptions", "All products"], notesLabel: "Tone / must-include (optional)", notesPh: "e.g. emphasize craftsmanship, mention free shipping" },
      seo: { title: "🔍 SEO Titles & Meta", desc: "Optimized SEO page titles + meta descriptions, written directly (no agent wait). Review before/after, then publish.", noun: "SEO update", unit: "product", perItem: 0.02, writing: "Writing SEO…", empty: "No products needed SEO — they're already optimized. ✅", btn: "Write SEO →", which: ["Products with missing SEO", "All products"], notesLabel: "Target keywords / notes (optional)", notesPh: "e.g. focus on 'beginner snowboards'" },
      alt: { title: "🖼️ Image Alt Text", desc: "Descriptive alt text for product images (SEO + accessibility), written directly. Review, then apply.", noun: "image alt update", unit: "product", perItem: 0.02, writing: "Writing alt text…", empty: "All your product images already have alt text. ✅", btn: "Write alt text →", which: ["Products with images missing alt text", "All product images"], notesLabel: "Notes (optional)", notesPh: "e.g. include the color and material" },
      articles: { title: "📝 Write Blog Posts", desc: "On-brand, SEO-optimized blog articles written directly. Pick a topic (or use a suggestion), then publish to your blog.", noun: "article", unit: "article", perItem: 0.05, writing: "Writing articles…", empty: "Couldn't generate the article — please try again.", btn: "Write articles →", which: [], notesLabel: "Notes (optional)", notesPh: "e.g. keep it under 600 words; link to the snowboard collection" },
    }[mode];
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">{META.title}</div>
            <div className="sh-task-desc">{META.desc}</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>

        <div className="sh-task-body">
          {!reviewing ? (
            <>
              {isArticles ? (
                <>
                  <label className="sh-label">How many articles?</label>
                  <select className="sh-ob-input" value={articleCount} onChange={(e) => setArticleCount(e.target.value)} disabled={contentBusy}>
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                  </select>
                  <label className="sh-label" style={{ marginTop: 12 }}>Topic (optional)</label>
                  <input className="sh-ob-input" value={articleTopic} onChange={(e) => setArticleTopic(e.target.value)} placeholder="e.g. How to choose a beginner snowboard" disabled={contentBusy} />
                  {(suggestFetcher.data?.topics?.length ?? 0) > 0 && (
                    <div className="sh-topic-chips">
                      <span className="sh-topic-lbl">Suggested for your store — tap to use:</span>
                      {suggestFetcher.data!.topics!.map((tp, i) => (
                        <button key={i} className="sh-topic-chip" onClick={() => setArticleTopic(tp)} disabled={contentBusy}>{tp}</button>
                      ))}
                    </div>
                  )}
                  {suggestFetcher.state !== "idle" && !suggestFetcher.data && <div className="sh-topic-loading"><div className="sh-spinner" /> Finding the best topics for your store…</div>}
                </>
              ) : (
                <>
                  <label className="sh-label">Which products?</label>
                  <select className="sh-ob-input" value={descWhich} onChange={(e) => setDescWhich(e.target.value)} disabled={contentBusy}>
                    {META.which.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </>
              )}
              <label className="sh-label" style={{ marginTop: 12 }}>{META.notesLabel}</label>
              <textarea className="sh-ob-input sh-ob-textarea" rows={isArticles ? 2 : 3} value={descNotes} onChange={(e) => setDescNotes(e.target.value)} placeholder={META.notesPh} disabled={contentBusy} />
              {contentFetcher.data?.error && <div className="sh-err" style={{ marginTop: 10 }}>{contentFetcher.data.error}</div>}
              {contentBusy && <div className="sh-opt-loading" style={{ marginTop: 14 }}><div className="sh-spinner" /> {META.writing} ({isArticles ? "this can take a moment" : "a few seconds per product"})</div>}
            </>
          ) : contentDrafts!.length === 0 ? (
            <div className="sh-opt-loading">{META.empty}</div>
          ) : (
            <div className="sh-draft-list">
              <p className="sh-task-desc">Wrote {contentDrafts!.length} {META.noun}{contentDrafts!.length === 1 ? "" : "s"} · total cost <strong>~${(contentCost * MARKUP).toFixed(2)}</strong>. Untick any you don't want, then publish (publishing is free).</p>
              {contentDrafts!.map((d) => {
                const skipped = contentSkip.has(d.id);
                return (
                  <div key={d.id} className={`sh-draft${skipped ? " sh-draft-skip" : ""}`}>
                    <div className="sh-draft-head">
                      <strong>{d.title}</strong>
                      <button className="sh-linkbtn" onClick={() => toggleSkip(d.id)}>{skipped ? "Include" : "Skip"}</button>
                    </div>
                    {isSeo ? (
                      <div className="sh-draft-after">
                        <div className="sh-seo-row"><span className="sh-seo-k">Title</span> {d.seoTitle}</div>
                        <div className="sh-seo-row"><span className="sh-seo-k">Meta</span> {d.metaDescription}</div>
                      </div>
                    ) : isAlt ? (
                      <div className="sh-draft-after">
                        <div className="sh-seo-row"><span className="sh-seo-k">Alt</span> {d.after}</div>
                        <div className="sh-seo-row"><span className="sh-seo-k">Images</span> {d.before}</div>
                      </div>
                    ) : (
                      <div className="sh-draft-after" dangerouslySetInnerHTML={{ __html: d.after.replace(/```+\s*html/gi, "").replace(/```+/g, "").trim() }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!reviewing ? (
          <>
            <div className="sh-task-est">
              <span>Est. cost <strong>~${META.perItem.toFixed(2)} / {META.unit}</strong> · a few seconds each</span>
              <span className="sh-task-est-note">Direct generation — billed only for what's used. Live changes need your approval.</span>
            </div>
            <div className="sh-task-foot">
              <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
              <button className="sh-btn sh-btn-primary" disabled={contentBusy} onClick={genContent}>{contentBusy ? "Writing…" : META.btn}</button>
            </div>
          </>
        ) : (
          <div className="sh-task-foot">
            <button className="sh-btn sh-btn-ghost" onClick={() => { setContentDrafts(null); setContentSkip(new Set()); }}>Back</button>
            <button className="sh-btn sh-btn-primary" disabled={contentBusy || keepCount === 0} onClick={applyDrafts}>
              {contentBusy ? "Publishing…" : `Publish ${keepCount} ${META.noun}${keepCount === 1 ? "" : "s"} →`}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderTaskPanel() {
    if (!activeTask) return null;
    if (activeTask.id === "store-manager") return renderStoreManager();
    if (activeTask.id === "content-plan") return renderContentPlanSetup();
    if (activeTask.id === "bulk-descriptions") return renderContentTask("descriptions");
    if (activeTask.id === "seo-genius") return renderContentTask("seo");
    if (activeTask.id === "alt-text") return renderContentTask("alt");
    if (activeTask.id === "write-content") return renderContentTask("articles");
    if (activeTask.id === "add-section") return renderSectionTask();
    if (activeTask.id === "structured-data") return renderSchemaTask();
    if (activeTask.id === "build-pdp") return renderPdpTask();
    if (activeTask.id === "stock-images") return renderStockTask();
    const products = productsFetcher.data?.products ?? [];
    const loadingProducts = productsFetcher.state !== "idle" && !productsFetcher.data;
    const q = taskSearch.toLowerCase();
    const filtered = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;
    const taskScore = activeTask.scoreLabel ? (report?.scores ?? []).find((s) => s.label === activeTask!.scoreLabel) : undefined;
    const taskOpps = activeTask.areas?.length ? (report?.recommendations ?? []).filter((r) => activeTask!.areas!.includes(r.area)).slice(0, 3) : [];
    return (
      <div className="sh-task">
        <div className="sh-task-head">
          <div>
            <div className="sh-task-title">{activeTask.emoji} {activeTask.title}</div>
            <div className="sh-task-desc">{activeTask.desc}</div>
          </div>
          <button className="sh-icon-btn" onClick={() => setActiveTask(null)}>✕</button>
        </div>
        <div className="sh-task-body">
          {activeTask.intro && activeTask.intro.length > 0 && (
            <div className="sh-task-intro">
              <div className="sh-task-intro-kicker">Why this matters</div>
              {activeTask.intro.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
          {(taskScore || taskOpps.length > 0 || (reportBusy && !report)) && (
            <div className="sh-task-state">
              {taskScore && (
                <div className="sh-task-score">
                  <div className="sh-task-score-top">
                    <span>Current {taskScore.label} score</span>
                    <strong style={{ color: taskScore.color }}>{taskScore.value}</strong>
                  </div>
                  <div className="sh-score-track"><div className="sh-score-fill" style={{ width: `${taskScore.value}%`, background: taskScore.color }} /></div>
                </div>
              )}
              {taskOpps.length > 0 && (
                <div className="sh-task-opps">
                  <div className="sh-task-opps-h">Opportunities we found</div>
                  {taskOpps.map((o, i) => (
                    <div key={i} className="sh-task-opp">
                      <span className={`sh-impact ${impactClass(o.impact)}`}>{o.impact}</span>
                      <span>{o.title}</span>
                    </div>
                  ))}
                </div>
              )}
              {reportBusy && !report && <div className="sh-task-opps-h">Analyzing your store…</div>}
            </div>
          )}
          {activeTask.fields.map((f) => (
            <div key={f.key} className="sh-task-field">
              <label className="sh-task-label">{f.label}</label>
              {f.type === "product" ? (
                <div>
                  <input className="sh-ob-input" placeholder="Search products…" value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
                  {loadingProducts ? (
                    <div className="sh-opt-loading"><div className="sh-spinner" /> Loading products…</div>
                  ) : (
                    <div className="sh-task-plist">
                      {filtered.map((p) => {
                        const sel = (taskValues[f.key] as ProductLite | null)?.id === p.id;
                        return (
                          <button type="button" key={p.id} className={`sh-task-pitem${sel ? " is-sel" : ""}`} onClick={() => setField(f.key, p)}>
                            {p.image ? <img src={p.image} alt="" /> : <div className="sh-task-pimg" />}
                            <span className="sh-task-pname">{p.title}</span>
                            {p.price && <span className="sh-task-pprice">{p.price}</span>}
                            {sel && <span className="sh-task-pcheck">✓</span>}
                          </button>
                        );
                      })}
                      {!filtered.length && <div className="sh-empty-cell">No products found.</div>}
                    </div>
                  )}
                </div>
              ) : f.type === "textarea" ? (
                <textarea className="sh-ob-input sh-ob-textarea" rows={3} placeholder={f.placeholder} value={(taskValues[f.key] as string) ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
              ) : f.type === "text" ? (
                <input className="sh-ob-input" placeholder={f.placeholder} value={(taskValues[f.key] as string) ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
              ) : f.type === "select" ? (
                <select className="sh-ob-input" value={sval(taskValues[f.key])} onChange={(e) => setField(f.key, e.target.value)}>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "multiselect" ? (
                <div className="sh-ob-goals">
                  {f.options.map((o) => (
                    <button type="button" key={o} className={`sh-ob-goal${aval(taskValues[f.key]).includes(o) ? " is-on" : ""}`} onClick={() => toggleMulti(f.key, o)}>{o}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="sh-task-est">
          <span>Est. cost <strong>~${taskEstimate(activeTask.id).usd.toFixed(2)}</strong> · {fmtSecs(taskEstimate(activeTask.id).secs)}</span>
          <span className="sh-task-est-note">Rough estimate — you're billed only for what's actually used.</span>
        </div>
        <div className="sh-task-foot">
          <button className="sh-btn sh-btn-ghost" onClick={() => setActiveTask(null)}>Cancel</button>
          <button className="sh-btn sh-btn-primary" disabled={!taskReady() || thinking} onClick={runTask}>
            Run · ~${taskEstimate(activeTask.id).usd.toFixed(2)}
          </button>
        </div>
      </div>
    );
  }
  function restore(sha: string) {
    setRestoringSha(sha);
    restoreFetcher.submit({ sha }, { method: "post", action: "/api/restore" });
  }

  // After a restore: refresh the preview, clear staged state, reload the list.
  useEffect(() => {
    if (restoreFetcher.state === "idle" && restoreFetcher.data && restoringSha) {
      setRestoringSha(null);
      if (restoreFetcher.data.restored != null) {
        setFrameKey((k) => k + 1);
        setPending([]);
        history.load("/api/versions");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreFetcher.state, restoreFetcher.data]);

  async function runChat(prompt: string, approve: boolean) {
    setMessages((m) => [
      ...m,
      { role: "user", text: approve ? "✓ Approved — apply the store changes." : prompt },
    ]);
    setApproval([]);
    setThinking(true);
    setLive({ text: "", tools: [] });

    const fd = new FormData();
    fd.set("prompt", prompt);
    if (approve) fd.set("allowMutations", "1");

    try {
      const res = await fetch("/api/chat", { method: "post", body: fd });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let tools: string[] = [];
      let text = "";
      let done: ChatData | null = null;
      let errored: string | null = null;

      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as ChatData & { type: string; value?: string; error?: string };
          if (ev.type === "tool") {
            tools = [...tools, ev.value ?? ""];
            setLive({ text, tools });
          } else if (ev.type === "text") {
            text += ev.value ?? "";
            setLive({ text, tools });
          } else if (ev.type === "done") {
            done = ev;
          } else if (ev.type === "error") {
            errored = ev.error ?? "Something went wrong.";
          }
        }
      }

      if (errored) {
        setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${errored}` }]);
      } else if (done) {
        const summary = (done!.assistantText ?? "").trim();
        const staged = (done!.pending?.length ?? 0) + (done!.proposedMutations?.length ?? 0);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            // Never fall back to the raw streamed thinking — it's a messy blob.
            text: summary || (staged ? "✓ Done — review the staged changes below to approve them." : "✓ Done."),
            tools: done!.toolEvents ?? tools,
            cost: done!.costUsd,
            model: done!.model,
            deliverables: done!.deliverables,
          },
        ]);
        setPending(done.pending ?? []);
        setApproval(done!.proposedMutations ?? []);
        setBilling(done.billing ?? null);
        // Snapshot the meters, then cheaply re-score ($0, deterministic) so the
        // merchant sees how this task moved their optimization scores.
        prevScoresRef.current = Object.fromEntries(liveScores.map((s) => [s.label, s.value]));
        reportFetcher.submit({}, { method: "post", action: "/api/report" });
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `⚠️ ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setThinking(false);
      setLive({ text: "", tools: [] });
    }
  }

  // First-run theme setup is still copying in the background — friendly loader.
  if (preparing) {
    return (
      <div className="sh-shell">
        <div className="sh-prep">
          <div className="sh-prep-card">
            <div className="sh-spinner sh-prep-spinner" />
            <h1>Getting your store ready…</h1>
            <p className="sh-prep-msg">{PREP_MSGS[prepMsg % PREP_MSGS.length]}</p>
            <p className="sh-prep-sub">
              We're making a safe working copy of your theme so ShopHero can build and preview
              changes without ever touching your live store. This one-time setup takes about a minute.
            </p>
            <div className="sh-prep-hint">You can keep this open — it continues automatically.</div>
          </div>
        </div>
      </div>
    );
  }

  // Theme setup failed (e.g. Shopify theme-write exemption / custom-app token
  // missing). Show a clear, actionable state instead of crashing the dashboard.
  if (themeError) {
    return (
      <div className="sh-shell">
        <div className="sh-theme-gate">
          <div className="sh-theme-gate-card">
            <div className="sh-theme-gate-icon">🎨</div>
            <h1>One step left: theme access</h1>
            <p>
              ShopHero is connected to <strong>{shop}</strong>, but Shopify hasn't granted it
              permission to edit your theme yet. Everything else is ready — we just need theme
              access to build and preview changes safely.
            </p>
            <div className="sh-theme-gate-steps">
              <div className="sh-theme-gate-step"><span>1</span><div>In your store admin, open <strong>Settings → Apps and sales channels → Develop apps</strong> and create (or open) a custom app with the <strong>write_themes</strong> and <strong>read_themes</strong> scopes.</div></div>
              <div className="sh-theme-gate-step"><span>2</span><div>Install it and copy the <strong>Admin API access token</strong> (<code>shpat_…</code>).</div></div>
              <div className="sh-theme-gate-step"><span>3</span><div>Paste it into ShopHero under <strong>Settings → Theme editing access</strong>, then reload this page.</div></div>
            </div>
            <p className="sh-theme-gate-note">
              For a full App Store launch, request Shopify's theme-write exemption instead — then no per-store token is needed.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="sh-btn sh-btn-primary" onClick={() => navigate("/app/settings")}>Open Settings →</button>
              <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#eef1f5)", color: "var(--sh-ink)" }} onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sh-shell">
      {tourOpen && <Tour steps={TOUR_STEPS} onClose={finishTour} />}

      {/* ---------------- Left: control panel ---------------- */}
      <div className="sh-panel">
        {/* Top zone (~30%): brand, modes, health */}
        <div className="sh-top">
          <div className="sh-header">
            <div className="sh-brand" title="ShopHero edits a safe, unpublished copy of your theme — your live store is never touched until you approve.">
              <div className="sh-brand-mark sh-brand-mark-theme">🎨</div>
              <div>
                <div className="sh-brand-name">{themeInfo?.name || "Working copy"}</div>
                <div className="sh-brand-shop">
                  Safe working copy{themeInfo?.copiedAt ? ` · copied ${new Date(themeInfo.copiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </div>
              </div>
            </div>
            <div className="sh-header-right" data-tour="header">
              <div className="sh-hr-stack">
                <span className="sh-pill sh-pill-sm" title="AI usage this session — drawn from your monthly allowance ($15 included, then $50 auto top-ups)">
                  Usage <strong>${usageDisplay.toFixed(2)}</strong>
                </span>
                <span className="sh-pill sh-pill-sm">{activePlan === "managed" ? "Managed AI" : "BYOK"}</span>
              </div>
              <div className="sh-hr-stack">
                <button className="sh-icon-btn sh-icon-btn-sm" title="How it works" onClick={() => setTourOpen(true)}>?</button>
                <button className="sh-icon-btn sh-icon-btn-sm" title="Version history" onClick={openHistory}>🕘</button>
              </div>
              {activePlan === "byok" && (
                <button className="sh-icon-btn" title="Settings" onClick={() => navigate("/app/settings")}>⚙</button>
              )}
            </div>
          </div>

          <div className="sh-modes" role="tablist" data-tour="modes">
            <button className={`sh-mode${mode === "edit" ? " is-active" : ""}`} onClick={() => setMode("edit")} role="tab">
              Edit
            </button>
            <button className={`sh-mode${mode === "optimize" ? " is-active" : ""}`} onClick={() => setMode("optimize")} role="tab">
              Optimize
            </button>
            <div className={`sh-mode-ind${mode === "optimize" ? " is-right" : ""}`} />
          </div>

          {mode === "optimize" && report?.health != null && (
            <div className="sh-health-overall">
              <div className="sh-health-overall-top">
                <span className="sh-health-overall-lbl">Site Health</span>
                <span
                  className="sh-health-overall-pct"
                  style={{ color: report.health >= 80 ? "#34c759" : report.health >= 60 ? "#ff9500" : "#ff3b30" }}
                >
                  {report.health}%
                </span>
              </div>
              <div className="sh-health-overall-track">
                <div
                  className="sh-health-overall-fill"
                  style={{ width: `${report.health}%`, background: report.health >= 80 ? "#34c759" : report.health >= 60 ? "#ff9500" : "#ff3b30" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ===================== EDIT MODE ===================== */}
        {mode === "edit" && (
          <>
            <div className="sh-quick" data-tour="tools">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  className={`sh-chip${a.genius ? " sh-genius" : ""}`}
                  onClick={() => openTask(a.taskId)}
                  title={a.label}
                >
                  <span className="sh-chip-emoji">{a.emoji}</span>
                  {a.label}
                </button>
              ))}
            </div>

            <div ref={scroller} className="sh-transcript" data-tour="plan">
              {messages.length === 0 && !thinking && (
                recs.length > 0 ? (
                  <div className="sh-plan">
                    <div className="sh-plan-head">
                      <h2>⚡ Your growth plan</h2>
                      <p>Your biggest wins, ranked by impact and ready to ship — pulled from a scan of your store and millions of high-converting ones. Tap one to fix it in a click, or ask for anything.</p>
                    </div>
                    {recs.map((r) => (
                      <div key={r.title} className="sh-plan-card">
                        <div className="sh-plan-top">
                          <span className="sh-issue-area">{r.area}</span>
                          <span className={`sh-impact ${impactClass(r.impact)}`}>{r.impact}</span>
                        </div>
                        <div className="sh-issue-title" style={{ marginTop: 6 }}>{r.title}</div>
                        <div className="sh-issue-desc">{r.desc}</div>
                        <button className="sh-issue-fix" disabled={thinking} onClick={() => fixIssue(r.prompt)}>
                          Start →
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sh-empty">
                    <h2>What should we build today?</h2>
                    <p>
                      Ask for anything across your store — theme, products, collections,
                      pages, blogs, SEO — or tap a shortcut above. Switch to{" "}
                      <strong>Optimize</strong> for ranked, one-tap improvements.
                    </p>
                  </div>
                )
              )}

              {messages.map((m, i) => (
                <div key={i} className={`sh-msg ${m.role === "user" ? "sh-msg-user" : "sh-msg-ai"}`}>
                  <div>{m.text}</div>
                  {m.tools && m.tools.length > 0 && (
                    <div className="sh-meta">
                      <span className="sh-tools">{m.tools.map(friendlyStep).join("  ·  ")}</span>
                    </div>
                  )}
                  {m.deliverables && m.deliverables.length > 0 && (
                    <div className="sh-deliver-list">
                      {m.deliverables.map((d, di) => (
                        <div key={di} className="sh-deliver">
                          <span className="sh-deliver-name">
                            {d.type === "article" ? "📝" : d.type === "page" ? "📄" : d.type === "product" ? "🛍️" : d.type === "collection" ? "🗂️" : "✦"}{" "}
                            {d.title || d.type}
                          </span>
                          <span className="sh-deliver-links">
                            {d.storeUrl && <a href={d.storeUrl} target="_blank" rel="noreferrer">View on store ↗</a>}
                            <a href={d.adminUrl} target="_blank" rel="noreferrer">Open in admin ↗</a>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {thinking && (
                <div className="sh-loader">
                  <div className="sh-loader-bar" />
                  <div className="sh-loader-text">
                    <span className="sh-dot" /> {live.tools.length || live.text ? "Working on your store…" : "Thinking…"}
                  </div>
                  {live.tools.length > 0 && (
                    <div className="sh-steps">
                      {live.tools.slice(-5).map((t, i) => (
                        <div key={`${i}-${t}`} className="sh-step">↳ {friendlyStep(t)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {plan?.status === "active" && plan.draftTitle && !planReview && (
              <div className="sh-bar sh-bar-approve">
                <span className="sh-bar-label">
                  📅 <strong>Publish your daily article:</strong> {plan.draftTitle}
                </span>
                <button className="sh-btn sh-btn-go" onClick={() => setPlanReview(true)}>Review &amp; publish</button>
              </div>
            )}

            {billing?.needsCapRaise && (
              <div className="sh-bar sh-bar-approve">
                <span className="sh-bar-label">
                  ⚠️ You've reached your <strong>${billing.cap}/mo</strong> usage limit. Raise it to keep going — it's just a cap, you're only billed for what you use.
                </span>
                <raise.Form method="post" action="/api/billing/raise">
                  <button className="sh-btn sh-btn-go" type="submit" disabled={raise.state !== "idle"}>
                    {raise.state !== "idle" ? "Redirecting…" : "Raise my limit"}
                  </button>
                </raise.Form>
              </div>
            )}

            {approval.length > 0 && (
              <div className="sh-bar sh-bar-approve">
                <span className="sh-bar-label">
                  ⚠️ <strong>{approval.length}</strong> live store change(s) need approval:{" "}
                  {approval.map((p) => p.summary).join(", ")}
                </span>
                <button className="sh-btn sh-btn-go" disabled={thinking} onClick={approveMutations}>
                  Approve &amp; run
                </button>
              </div>
            )}

            {pending.length > 0 && (
              <div className="sh-bar sh-bar-apply">
                <span className="sh-bar-label">
                  <strong>{pending.length}</strong> change(s) staged — accept or discard to continue
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="sh-btn"
                    style={{ background: "linear-gradient(180deg,#fff,#eef1f5)", color: "var(--sh-ink)" }}
                    onClick={openDiff}
                  >
                    View
                  </button>
                  <button
                    className="sh-btn sh-btn-discard"
                    disabled={applying || discarding}
                    onClick={discardStaged}
                  >
                    {discarding ? "Discarding…" : "Discard"}
                  </button>
                  <button
                    className="sh-btn sh-btn-primary"
                    disabled={applying || discarding}
                    onClick={applyChanges}
                  >
                    {applying ? "Accepting…" : "Accept change"}
                  </button>
                </div>
              </div>
            )}

            {gateMsg && <div className="sh-gate-msg">⚠️ {gateMsg}</div>}

            {refining && (
              <div className="sh-refining"><span className="sh-dot" /> Refining your request…</div>
            )}

            {clarify && (
              <div className="sh-clarify">
                {clarify.questions.length > 1 && (
                  <div className="sh-clarify-progress">
                    <span className="sh-clarify-step">Quick question {clarify.step + 1} of {clarify.questions.length}</span>
                    <div className="sh-clarify-dots">
                      {clarify.questions.map((_, i) => <span key={i} className={`sh-clarify-dot${i <= clarify.step ? " on" : ""}`} />)}
                    </div>
                  </div>
                )}
                <div className="sh-clarify-q">🤔 {clarify.questions[clarify.step].question}</div>
                <div className="sh-clarify-opts">
                  {clarify.questions[clarify.step].options.map((o, i) => (
                    <button key={i} className="sh-clarify-opt" disabled={thinking} onClick={() => pickClarify(o)}>{o}</button>
                  ))}
                </div>
                <div className="sh-clarify-hint">…or type your own answer below · <button className="sh-linkbtn" onClick={skipClarify}>skip &amp; go</button></div>
              </div>
            )}

            <div className="sh-composer" data-tour="composer">
              <textarea
                className="sh-textarea"
                value={input}
                placeholder={clarify ? "Type your answer…" : "Ask ShopHero to change anything in your store…"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className="sh-send" onClick={send} disabled={thinking || refining}>
                {thinking || refining ? "…" : "Send"}
              </button>
            </div>
          </>
        )}

        {/* ===================== OPTIMIZE MODE ===================== */}
        {mode === "optimize" && (
          <div className="sh-optimize">
            {report ? (
              <div className="sh-report-head">
                {report.summary && <p className="sh-opt-lead">{report.summary}</p>}
                <div className="sh-report-meta">
                  <span>
                    {reportBusy ? "Refreshing…" : `Updated ${relTime(report.generatedAt)}`}
                    {report.cached && !reportBusy ? " · cached ($0)" : ""}
                  </span>
                  <button className="sh-report-refresh" disabled={reportBusy} onClick={refreshReport}>
                    ↻ Refresh report
                  </button>
                </div>
              </div>
            ) : (
              <p className="sh-opt-lead">
                {reportBusy ? "Building your store report…" : "Your store report, ranked by impact. Each fix runs through the same preview → approve flow as a normal edit."}
              </p>
            )}

            {audit.status === "loading" ? (
              <div className="sh-opt-loading">
                <div className="sh-spinner" />
                Auditing your storefront with Lighthouse…
              </div>
            ) : (
              <>
                <div className="sh-rings">
                  {ringScores.map((s) => {
                    const delta = scoreDeltas[s.label];
                    const pending = "pending" in s && s.pending;
                    const isActive = activeScore === s.label;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        className={`sh-ring-wrap${isActive ? " is-active" : ""}`}
                        onClick={() => setActiveScore(isActive ? null : s.label)}
                        title={`See ${s.label} breakdown`}
                      >
                        <div className="sh-ring" style={{ ["--val" as string]: pending ? 0 : s.value, ["--c" as string]: s.color } as React.CSSProperties}>
                          <span className="sh-ring-num">{pending ? "—" : s.value}</span>
                        </div>
                        <span className="sh-ring-lbl">
                          {s.label}
                          {delta ? (
                            <span className="sh-score-delta" style={{ color: delta > 0 ? "#34c759" : "#ff3b30" }}>
                              {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {report?.issues?.length ? (
                  <div className="sh-audit">
                    <div className="sh-audit-head">
                      <span>Full audit · {report.issues.length} issue{report.issues.length === 1 ? "" : "s"}</span>
                      {report?.health != null && (
                        <span style={{ color: report.health >= 80 ? "#34c759" : report.health >= 60 ? "#ff9500" : "#ff3b30", fontWeight: 800 }}>
                          {report.health}% healthy
                        </span>
                      )}
                    </div>
                    {report.issues.map((it) => (
                      <div key={it.key} className="sh-audit-row">
                        <span className={`sh-sev sh-sev-${it.severity}`}>{it.severity}</span>
                        <div className="sh-audit-info">
                          <div className="sh-audit-label">{it.label}</div>
                          <div className="sh-audit-why">{it.why}</div>
                        </div>
                        {it.fixPrompt ? (
                          <button className="sh-issue-fix" disabled={thinking} onClick={() => fixIssue(it.fixPrompt!)}>Fix →</button>
                        ) : (
                          <span className="sh-audit-manual">manual</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="sh-issues">
                  {liveIssues.map((issue) => (
                    <div key={issue.title} className="sh-issue">
                      <div className="sh-issue-top">
                        <span className="sh-issue-area">{issue.area}</span>
                        <span className={`sh-impact ${impactClass(issue.impact)}`}>{issue.impact}</span>
                      </div>
                      <div className="sh-issue-title" style={{ marginTop: 6 }}>{issue.title}</div>
                      <div className="sh-issue-desc">{issue.desc}</div>
                      <button className="sh-issue-fix" disabled={thinking} onClick={() => fixIssue(issue.prompt)}>
                        Fix it →
                      </button>
                    </div>
                  ))}
                </div>

                {audit.note && <div className="sh-opt-note">{audit.note} Showing sample opportunities below until a public storefront can be audited.</div>}
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Right: live preview (or task setup panel) ---------------- */}
      <div className="sh-preview">
        {planReview ? renderDraftReview() : activeTask ? renderTaskPanel() : (activeScore && mode === "optimize") ? renderScoreDetail(activeScore) : (
        <div className="sh-preview-frame" data-tour="preview">
          <div className="sh-preview-bar">
            <div className="sh-traffic"><span /><span /><span /></div>
            <div className="sh-preview-controls">
              <button ref={pageBtnRef} className="sh-pagebtn" onClick={togglePageMenu} title="Preview page">
                {pageLabel} <span className="sh-pagebtn-caret">▾</span>
              </button>
              <button
                className={`sh-editbtn${editMode ? " is-active" : ""}`}
                title="Click-to-edit on page"
                onClick={() => setEditMode((v) => !v)}
              >
                ✏️ {editMode ? "Editing" : "Edit on page"}
              </button>
              <div className="sh-devices">
                {(["desktop", "tablet", "mobile"] as const).map((d) => (
                  <button
                    key={d}
                    className={`sh-dev-btn${device === d ? " is-active" : ""}`}
                    title={d}
                    onClick={() => setDevice(d)}
                  >
                    {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "▯"}
                  </button>
                ))}
              </div>
            </div>
            <a className="sh-open-link" href={previewSrc} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          </div>
          <div className="sh-stage">
            <iframe
              ref={frameRef}
              key={`${frameKey}-${previewSrc}`}
              title="preview"
              src={previewSrc}
              onLoad={onFrameLoad}
              className={`sh-iframe${device !== "desktop" ? " sh-framed" : ""}`}
              style={{ width: DEVICE_W[device] }}
            />
            {editMode && !embedReady && (
              <div className="sh-editmode-hint">
                Turn on the <strong>ShopHero Editor</strong> app embed in your theme (Customize → App embeds) to edit on the page.
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* ---------------- Page selector menu ---------------- */}
      {menuPos && (
        <>
          <div className="sh-menu-backdrop" onClick={() => { setMenuPos(null); setExpanded(null); }} />
          <div className="sh-menu" style={{ top: menuPos.top, left: menuPos.left }}>
            {previews.map((g) =>
              g.items.length === 1 ? (
                <button key={g.type} className="sh-menu-item" onClick={() => choosePage(g.label, g.items[0].url)}>
                  <span>{g.label}</span>
                </button>
              ) : (
                <div key={g.type}>
                  <button className="sh-menu-item" onClick={() => setExpanded(expanded === g.type ? null : g.type)}>
                    <span>{g.label}</span>
                    <span className="sh-menu-caret">{expanded === g.type ? "▾" : "›"}</span>
                  </button>
                  {expanded === g.type &&
                    g.items.map((it) => (
                      <button
                        key={it.key}
                        className="sh-menu-item sh-menu-sub"
                        onClick={() => choosePage(`${g.label} · ${it.label}`, it.url)}
                      >
                        <span>{it.label}</span>
                      </button>
                    ))}
                </div>
              ),
            )}
          </div>
        </>
      )}

      {/* ---------------- Click-to-edit popup ---------------- */}
      {selection && (
        <>
          <div className="sh-backdrop" onClick={() => setSelection(null)} />
          <div className="sh-edit-pop">
            <div className="sh-edit-pop-name">✏️ {selection.name}</div>
            {selection.text && <div className="sh-edit-pop-text">“{selection.text.slice(0, 90)}{selection.text.length > 90 ? "…" : ""}”</div>}
            <textarea
              className="sh-ob-input sh-ob-textarea"
              rows={3}
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitEdit(); } }}
              placeholder="What would you like to change here? e.g. make this button green and say ‘Shop the sale’"
            />
            <div className="sh-edit-pop-actions">
              <button className="sh-btn sh-btn-ghost" onClick={() => setSelection(null)}>Cancel</button>
              <button className="sh-btn sh-btn-primary" disabled={!editText.trim() || thinking} onClick={submitEdit}>Make change</button>
            </div>
          </div>
        </>
      )}

      {/* ---------------- History drawer ---------------- */}
      {historyOpen && (
        <>
          <div className="sh-backdrop" onClick={() => setHistoryOpen(false)} />
          <aside className="sh-drawer">
            <div className="sh-drawer-head">
              <span className="sh-drawer-title">🕘 Version history</span>
              <button className="sh-icon-btn" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            <div className="sh-drawer-body">
              <p className="sh-hist-note">
                Each point is a theme state you applied. Restoring brings your dev theme back to it —
                your current state is saved first, so it&apos;s reversible.
              </p>
              {history.state !== "idle" && !history.data ? (
                <div className="sh-opt-loading"><div className="sh-spinner" /> Loading history…</div>
              ) : history.data?.versions?.length ? (
                <div className="sh-hist">
                  {history.data.versions.map((v, i, arr) => {
                    const ver = arr.length - 1 - i; // oldest commit = baseline = v1.0
                    const isBaseline = ver === 0;
                    return (
                    <div key={v.sha} className="sh-hist-item">
                      <div className="sh-hist-main">
                        <div className="sh-hist-label">
                          <span className="sh-hist-ver">v1.{ver}</span>
                          {isBaseline ? "Original copy (duplicated)" : prettyLabel(v.label)}
                          {i === 0 && <span className="sh-hist-current">Latest</span>}
                        </div>
                        <div className="sh-hist-meta">
                          {new Date(v.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {relTime(v.date)} · {v.files} file{v.files === 1 ? "" : "s"}
                        </div>
                      </div>
                      {i !== 0 && (
                        <button
                          className="sh-btn"
                          style={{ background: "linear-gradient(180deg,#fff,#eef1f5)", color: "var(--sh-ink)" }}
                          disabled={!!restoringSha}
                          onClick={() => restore(v.sha)}
                        >
                          {restoringSha === v.sha ? "Restoring…" : "Restore"}
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "var(--sh-ink-soft)", fontSize: 13 }}>
                  No history yet — apply a change to create your first restore point.
                </p>
              )}
              {restoreFetcher.data?.error && <div className="sh-ob-error" style={{ marginTop: 12 }}>{restoreFetcher.data.error}</div>}
            </div>
          </aside>
        </>
      )}

      {/* ---------------- Diff drawer ---------------- */}
      {drawerOpen && (
        <>
          <div className="sh-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="sh-drawer">
            <div className="sh-drawer-head">
              <span className="sh-drawer-title">&lt;/&gt; Pending changes</span>
              <button className="sh-icon-btn" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            <div className="sh-drawer-body">
              {diff.loading ? (
                <div className="sh-opt-loading"><div className="sh-spinner" /> Loading diff…</div>
              ) : diff.text.trim() ? (
                <div className="sh-diff">
                  {diff.text.split("\n").map((ln, i) => {
                    const cls = ln.startsWith("diff --git") || ln.startsWith("+++") || ln.startsWith("---")
                      ? "sh-diff-file"
                      : ln.startsWith("@@")
                        ? "sh-diff-hunk"
                        : ln.startsWith("+")
                          ? "sh-diff-add"
                          : ln.startsWith("-")
                            ? "sh-diff-del"
                            : "";
                    return <div key={i} className={`sh-diff-line ${cls}`}>{ln || " "}</div>;
                  })}
                </div>
              ) : (
                <p style={{ color: "var(--sh-ink-soft)", fontSize: 13 }}>No changes to show.</p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
