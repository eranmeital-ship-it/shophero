/**
 * Plan route catalog (client-safe). The decomposition engine MUST map every
 * subtask to one of these routes, so each step runs on the cheapest correct
 * engine instead of one long, pricey agent run. Cost is decided HERE (not by the
 * LLM) so estimates are trustworthy.
 *
 *   free   — deterministic, $0, instant (schema, sections, audit)
 *   direct — cheap Haiku content engine, capped batches (descriptions, SEO…)
 *   agent  — the full agent loop; reserved for open-ended design/structural work
 */
export type PlanEngine = "free" | "direct" | "agent";

export interface PlanRoute {
  key: string;
  label: string;
  engine: PlanEngine;
  estUsd: number; // per-step estimate
  badge: string; // short pill text
  hint: string; // what it does — also fed to the decomposer
}

export const PLAN_ROUTES: PlanRoute[] = [
  { key: "schema", label: "Install structured data (schema)", engine: "free", estUsd: 0, badge: "Free", hint: "Add full JSON-LD schema for SEO + AI assistants. Deterministic, instant." },
  { key: "aeo-audit", label: "Run the AEO Brain audit", engine: "free", estUsd: 0, badge: "Free", hint: "Score AI-readiness and surface the exact gaps to fix." },
  { key: "section-faq", label: "Add an FAQ section", engine: "free", estUsd: 0, badge: "Free", hint: "Insert a theme-matched FAQ that also emits FAQPage rich-result schema." },
  { key: "section-trust", label: "Add trust / social-proof section", engine: "free", estUsd: 0, badge: "Free", hint: "Insert a trust bar, guarantee, stats or testimonials block." },
  { key: "section", label: "Add a high-converting section", engine: "free", estUsd: 0, badge: "Free", hint: "Insert any library section: features, promo, comparison, about, newsletter, logos." },
  { key: "descriptions", label: "Rewrite product descriptions", engine: "direct", estUsd: 0.18, badge: "AI · cheap", hint: "Benefit-led, on-brand descriptions. Cheap engine, batch of up to 20, review before apply." },
  { key: "seo", label: "Optimize product SEO", engine: "direct", estUsd: 0.12, badge: "AI · cheap", hint: "SEO titles + meta descriptions. Cheap engine, batch of up to 20." },
  { key: "alt", label: "Add image alt text", engine: "direct", estUsd: 0.06, badge: "AI · cheap", hint: "Accessibility + SEO alt text for product images. Cheap engine, batch of up to 20." },
  { key: "articles", label: "Write a blog article / buyer guide", engine: "direct", estUsd: 0.05, badge: "AI · cheap", hint: "One SEO/AEO article answering a specific buyer question. Cheap engine." },
  { key: "aeo-targets", label: "Generate AEO citation targets", engine: "direct", estUsd: 0.12, badge: "AI · cheap", hint: "Buyer questions to win + the sources AI cites for them (uses web search)." },
  { key: "agent", label: "Custom build (AI agent)", engine: "agent", estUsd: 0.9, badge: "Agent", hint: "Open-ended theme/store change that no cheaper route covers — e.g. redesign a hero, restructure a page. Use sparingly; it's the priciest route." },
];

export const PLAN_ROUTE_MAP: Record<string, PlanRoute> = Object.fromEntries(PLAN_ROUTES.map((r) => [r.key, r]));

export interface PlanItem {
  id: string;
  title: string;
  detail: string;
  route: string; // PlanRoute key
  estUsd: number;
  prompt?: string; // agent instruction, content scope, or section choice
  status: "todo" | "done" | "skipped";
  shippedAt?: string; // ISO timestamp
  shippedSummary?: string;
  actualUsd?: number;
}

export interface ActionPlanData {
  id: string;
  goal: string;
  status: string;
  items: PlanItem[];
  createdAt: string;
  updatedAt: string;
}

export function planTotals(items: PlanItem[]) {
  const done = items.filter((i) => i.status === "done");
  const todo = items.filter((i) => i.status === "todo");
  return {
    total: items.length,
    done: done.length,
    skipped: items.filter((i) => i.status === "skipped").length,
    estRemaining: todo.reduce((s, i) => s + (i.estUsd || 0), 0),
    estTotal: items.reduce((s, i) => s + (i.estUsd || 0), 0),
    spent: done.reduce((s, i) => s + (i.actualUsd ?? 0), 0),
  };
}
