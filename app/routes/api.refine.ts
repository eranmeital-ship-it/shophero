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
If the request is already specific enough to execute well, return {"clear": true}.
If it is vague, broad, or missing key details (e.g. "make my homepage nicer", "improve my store", "add trust", "make it convert better"), return 1–3 SHORT guided questions that pin down: WHAT to change, WHERE (which page/section), and the STYLE or scope. Order them most-important first; each gets 2–4 concrete, tappable options a non-technical merchant understands. Ask the FEWEST questions needed — never over-ask a mostly-clear request.
Respond with ONLY JSON, no prose, no code fences:
{"clear": true}
OR
{"clear": false, "questions": [ {"question": "short question", "options": ["concrete choice", "…", "…"]}, … ]}`;

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
    const parsed = JSON.parse(t) as { clear?: boolean; question?: unknown; options?: unknown; questions?: unknown };
    // New multi-question shape.
    if (parsed.clear === false && Array.isArray(parsed.questions)) {
      const questions = (parsed.questions as unknown[])
        .map((q) => q as { question?: unknown; options?: unknown })
        .map((q) => ({
          question: typeof q.question === "string" ? q.question : "",
          options: Array.isArray(q.options) ? (q.options as unknown[]).map(String).filter(Boolean).slice(0, 4) : [],
        }))
        .filter((q) => q.question && q.options.length >= 2)
        .slice(0, 3);
      if (questions.length) return { clear: false, questions };
    }
    // Back-compat single-question shape.
    const options = Array.isArray(parsed.options) ? (parsed.options as unknown[]).map(String).filter(Boolean).slice(0, 4) : [];
    if (parsed.clear === false && typeof parsed.question === "string" && options.length >= 2) {
      return { clear: false, questions: [{ question: parsed.question, options }] };
    }
    return { clear: true };
  } catch {
    return { clear: true }; // never block on a triage failure
  }
}
