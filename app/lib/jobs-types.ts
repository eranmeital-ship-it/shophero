/**
 * Client-safe job constants & pure helpers (no DB, no node builtins). Both the
 * server lib (jobs.server) and React route components import from here, so the
 * browser bundle never pulls in server-only code.
 */

export const JOB_TYPES = {
  bulk_product_pages: { label: "Optimize product pages", unit: "pages", perDay: 50 },
  bulk_descriptions: { label: "Rewrite product descriptions", unit: "descriptions", perDay: 50 },
  bulk_seo: { label: "SEO optimization", unit: "pages", perDay: 50 },
  bulk_mobile: { label: "Mobile optimization", unit: "pages", perDay: 50 },
  content_articles: { label: "Publish articles", unit: "articles", perDay: 3 },
} as const;

export type JobType = keyof typeof JOB_TYPES;

export const ACTIVE_STATUSES = ["scheduled", "running", "paused"] as const;

/** Treat anything bigger than this as "too big to do at once" → schedule it. */
export const INLINE_LIMIT = 50;

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days remaining + projected completion date at the current daily rate. */
export function projectEta(total: number, completed: number, perDay: number): { daysLeft: number; eta: string } {
  const left = Math.max(0, total - completed);
  const daysLeft = perDay > 0 ? Math.ceil(left / perDay) : 0;
  const d = new Date();
  d.setDate(d.getDate() + daysLeft);
  return { daysLeft, eta: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
}

/** Detect a "do it to everything" style request. */
export function isBulkRequest(prompt: string): boolean {
  return /\b(all|every|each|entire|whole catalog|bulk|across (the|my|our) (store|catalog|products|pages))\b/i.test(prompt);
}

/** Map a free-text request to a job type (best-effort). null = can't classify. */
export function classifyBulk(prompt: string): JobType | null {
  const p = prompt.toLowerCase();
  if (/\b(article|blog|post)s?\b/.test(p)) return "content_articles";
  if (/\bdescription/.test(p)) return "bulk_descriptions";
  if (/\b(seo|meta\s?title|meta\s?description|meta\s?tag|title\s?tag)s?\b/.test(p)) return "bulk_seo";
  if (/\bmobile\b/.test(p)) return "bulk_mobile";
  if (/\b(product\s?page|pdp|landing\s?page)s?\b/.test(p)) return "bulk_product_pages";
  if (/\b(product|catalog|collection)/.test(p)) return "bulk_product_pages";
  return null;
}

/** Pull an explicit count from the prompt ("create 50 articles" → 50). */
export function parseCount(prompt: string): number | null {
  const m = prompt.match(/\b(\d{1,5})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
