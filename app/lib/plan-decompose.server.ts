import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { complete } from "./llm.server";
import { gql } from "./onboarding.server";
import { PLAN_ROUTES, PLAN_ROUTE_MAP, type PlanItem } from "./plan-routes";

/**
 * Goal → routed checklist. One cheap LLM call breaks a big goal into small,
 * single-purpose subtasks, each mapped to exactly one route from the catalog.
 * Routing is CONSTRAINED (the model can only pick known routes) and cost is
 * attached from the catalog server-side — so the plan is cheap, predictable and
 * always executable, instead of one long pricey agent run.
 */

// Routes a plan STEP may use. Exclude the meta "tools" (aeo-audit, aeo-targets):
// they open their own multi-step optimizers, so as a checklist step "Run" would
// teleport the merchant out of their plan. Steps must be concrete build actions.
const STEP_ROUTES = PLAN_ROUTES.filter((r) => r.key !== "aeo-audit" && r.key !== "aeo-targets");
const ROUTE_LINES = STEP_ROUTES.map((r) => `- ${r.key} (${r.engine}, ~$${r.estUsd.toFixed(2)}): ${r.hint}`).join("\n");

const SYSTEM = `You are a Shopify growth strategist. Break the merchant's GOAL into an ORDERED checklist of small, single-purpose subtasks they can run one at a time.

Rules:
- Choose EXACTLY ONE route per subtask, from this catalog (use the route KEY verbatim):
${ROUTE_LINES}
- EVERY step must be a CONCRETE BUILD action that changes the store — install, add, write, create, redesign, optimize. NEVER produce an "audit", "analyze", "review", "score", "check" or "identify gaps" step: the analysis is already done, the checklist IS the result. The first step should already be building something.
- Prefer the CHEAPEST correct route. Use "free" deterministic routes whenever they cover the need, then the cheap "direct" routes. Only use "agent" for genuinely open-ended design/structural work no other route covers — never for things a direct/free route already does.
- Split bulk work into batches the engines can actually handle (e.g. product descriptions run ~20 at a time → if the store is large, add a couple of batches, not one giant step).
- Keep it to 4–9 well-sequenced subtasks, each directly serving the goal. Foundation/quick wins first.
- For each subtask write a "prompt": for "agent" a concrete agent instruction; for content routes (descriptions/seo/alt/articles) the scope (e.g. "products missing descriptions"); for section routes the section to add; for "free" routes a short note. Keep prompts to one sentence.

Respond with ONLY JSON, no prose, no code fences:
{"items":[{"title":"short imperative title","detail":"one line on why / what it does","route":"<route key>","prompt":"one sentence"}]}`;

interface CtxNode {
  shop?: { name?: string };
  productsCount?: { count?: number };
  products?: { nodes?: { productType?: string }[] };
  collections?: { nodes?: { title?: string }[] };
}

let _id = 0;
function nextId(): string {
  _id = (_id + 1) % 1e6;
  return `pi_${_id.toString(36)}_${(_id * 2654435761 % 1e9).toString(36)}`;
}

export async function decomposeGoal(
  admin: AdminApiContext,
  goal: string,
  byokKey?: string,
): Promise<{ items: PlanItem[]; costUsd: number; model: string }> {
  const ctx = await gql<CtxNode>(
    admin,
    `{ shop { name } productsCount { count } products(first: 20) { nodes { productType } } collections(first: 8) { nodes { title } } }`,
  );
  const productCount = ctx?.productsCount?.count ?? 0;
  const types = [...new Set((ctx?.products?.nodes ?? []).map((p) => p.productType).filter(Boolean))].slice(0, 6);
  const collections = (ctx?.collections?.nodes ?? []).map((c) => c.title).filter(Boolean).slice(0, 6);
  const storeContext = `Store: ${ctx?.shop?.name ?? "store"}\nProducts: ${productCount}\nProduct types: ${types.join(", ") || "n/a"}\nCollections: ${collections.join(", ") || "n/a"}\n\nGOAL: ${goal}`;

  const res = await complete({ system: SYSTEM, user: storeContext, maxTokens: 1200, tier: "cheap", byokKey });

  let parsed: { items?: { title?: string; detail?: string; route?: string; prompt?: string }[] } = {};
  try {
    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    parsed = JSON.parse(t);
  } catch {
    parsed = {};
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: PlanItem[] = rawItems
    .map((it) => {
      let route = PLAN_ROUTE_MAP[String(it.route ?? "")] ? String(it.route) : "agent";
      // Safety: the meta "tools" are never plan steps (they'd teleport out of the
      // plan). Remap a stray pick to the concrete build it implies.
      if (route === "aeo-audit" || route === "aeo-targets") route = "schema";
      const meta = PLAN_ROUTE_MAP[route];
      return {
        id: nextId(),
        title: String(it.title ?? meta.label).slice(0, 120),
        detail: String(it.detail ?? meta.hint).slice(0, 240),
        route,
        estUsd: meta.estUsd,
        prompt: it.prompt ? String(it.prompt).slice(0, 400) : undefined,
        status: "todo" as const,
      };
    })
    .filter((it) => it.title)
    .slice(0, 10);

  return { items, costUsd: res.costUsd, model: res.model };
}
