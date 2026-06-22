import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { checkSpend } from "../lib/spend-guard.server";
import { resolveKey } from "../lib/onboarding.server";
import { complete } from "../lib/llm.server";
import db from "../db.server";

/**
 * Cheap pre-flight triage for a free-text request. One small model call decides
 * whether to run the (expensive) agent now, or ask the merchant ONE quick
 * clarifying question first. Net cost-saving: a fraction of a cent here avoids
 * misfired agent runs that cost far more. Disable with DRIFT_REFINE=false.
 */
const SYSTEM = `You triage a Shopify merchant's request for ShopHero before it runs, and (when needed) ask the BEST few questions to turn a fuzzy ask into a sharp, buildable plan.

ShopHero CAN: edit the theme (any page/section — design, copy, layout, speed), create/edit products, collections, pages, blog posts, navigation, metafields and discount codes; write on-brand copy, SEO and structured data; add ready-made sections (trust, FAQ, comparison, reviews, email signup, etc.); build landing pages.
ShopHero CANNOT directly: send emails or operate Klaviyo/Mailchimp/Shopify Email, run paid ads, or manage real fulfilment/inventory operations.

If the request is already specific enough to build a great result → {"clear": true}.
Otherwise return 1–4 SHORT guided questions that MAXIMIZE understanding of intent and lead to a concrete deliverable. Capture, most-important first:
  1) the GOAL / outcome the merchant actually wants,
  2) the SPECIFICS that change what you build — the offer/incentive, audience, tone/brand feel, must-include points,
  3) WHERE it lives (which page/section) and the scope (one product, a collection, all).

Rules:
- Each question: one short sentence + 2–4 concrete, tappable options in plain words a non-technical merchant understands (they can also type their own).
- Ask the FEWEST questions that materially change the result. NEVER ask a question whose answer wouldn't change what you build, and NEVER ask the merchant to pick a tool/technology.
- If part of the ask is outside ShopHero's scope (e.g. an "email campaign" needs an external tool to SEND), do NOT dead-end with a yes/no capability question. Instead assume ShopHero builds the parts it CAN and ask what's needed to build those well. Example — "welcome email campaign" → ShopHero can write the welcome message, add an email-capture signup section/popup, create a first-order discount, and build a thank-you/landing page; so ask about the incentive, the tone, and where signup lives. (Note: Shopify doesn't allow apps to SEND email via the Admin API — ShopHero plans/writes/captures, the merchant sends from their email tool — but don't make this a question; the build states it.)
- Prefer questions that make the result more on-brand and higher-converting.

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
  // Over a spend cap → skip triage (the actual run is gated by the chat route anyway).
  if (!(await checkSpend(session.shop, plan)).allowed) return { clear: true };
  const byokKey = plan === "byok" ? (await resolveKey(session.shop, plan)) ?? undefined : undefined;

  try {
    const res = await complete({ system: SYSTEM, user: prompt, maxTokens: 500, tier: "cheap", byokKey });
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
        .slice(0, 4);
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
