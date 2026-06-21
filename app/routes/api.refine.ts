import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { resolveKey } from "../lib/onboarding.server";
import { complete } from "../lib/llm.server";
import db from "../db.server";

/**
 * Cheap pre-flight triage for a free-text request. One small model call decides
 * whether to run the (expensive) agent now, or ask the merchant ONE quick
 * clarifying question first. Net cost-saving: a fraction of a cent here avoids
 * misfired agent runs that cost far more. Disable with DRIFT_REFINE=false.
 */
const SYSTEM = `You triage a merchant's store-edit request for ShopHero (an AI that edits Shopify themes, products, collections, pages and content).
Decide if the request is specific enough to execute well, or if ONE quick clarification would materially improve the result. Only ask when it genuinely helps — ambiguous scope, a missing target (which product/page?), or multiple reasonable interpretations. If it's clear enough, do NOT ask.
Respond with ONLY JSON, no prose, no code fences:
{"clear": true}
OR
{"clear": false, "question": "one short question", "options": ["short concrete choice", "…", "…"]}  // 2–4 options, each a brief refinement the merchant can pick`;

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  if (process.env.DRIFT_REFINE === "false") return { clear: true };

  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return { clear: true };

  const plan = await getActivePlan(admin).catch(() => null);
  const byokKey = plan === "byok" ? (await resolveKey(session.shop, plan)) ?? undefined : undefined;

  try {
    const res = await complete({ system: SYSTEM, user: prompt, maxTokens: 220, tier: "cheap", byokKey });
    await db.usageEvent
      .create({ data: { shop: session.shop, plan, model: res.model, kind: "refine", costUsd: res.costUsd, billedUsd: plan === "managed" ? res.costUsd * 3 : 0, inputTokens: res.inputTokens, outputTokens: res.outputTokens } })
      .catch(() => {});

    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s > 0 || e < t.length - 1) t = t.slice(s, e + 1);
    const parsed = JSON.parse(t) as { clear?: boolean; question?: unknown; options?: unknown };
    const options = Array.isArray(parsed.options) ? (parsed.options as unknown[]).map(String).filter(Boolean).slice(0, 4) : [];
    if (parsed.clear === false && typeof parsed.question === "string" && options.length >= 2) {
      return { clear: false, question: parsed.question, options };
    }
    return { clear: true };
  } catch {
    return { clear: true }; // never block on a triage failure
  }
}
