import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan, getActiveTier } from "../lib/billing.server";
import { enforceSpend } from "../lib/spend-guard.server";
import { rateLimitResponse } from "../lib/rate-limit.server";
import { resolveKey } from "../lib/onboarding.server";
import { analyzeContentStrategy } from "../lib/content-strategy.server";
import { generateDraft, getPlan, publishDraft, setAutoPublish, setStatus, setStrategy, startPlan } from "../lib/content-plan.server";
import db from "../db.server";

/** Content Plan control: analyze / start / generate / publish / regenerate / pause / resume. */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getActivePlan(admin).catch(() => null);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // The content engine is available on every tier (Starter = 1 article/week,
  // Pro+ = daily) — but it requires an active subscription.
  const GATED = new Set(["analyze", "start", "generate", "regenerate", "autopublish"]);
  if (GATED.has(intent) && !(await getActiveTier(admin).catch(() => null))) {
    return { plan: await getPlan(shop), error: "Start a ShopHero plan to build your content engine.", upgrade: true };
  }

  if (intent === "analyze") {
    // Deep shop analysis → a prioritized AI-answer content plan (the drip queue).
    const limited = rateLimitResponse(shop, 10, 60_000);
    if (limited) return limited;
    const blocked = await enforceSpend(shop, plan);
    if (blocked) return blocked;
    const byokKey = plan === "byok" ? (await resolveKey(shop, plan)) ?? undefined : undefined;
    const res = await analyzeContentStrategy(admin, shop, byokKey);
    if (res.costUsd > 0) {
      await db.usageEvent.create({ data: { shop, plan, model: res.model, kind: "content_strategy", costUsd: res.costUsd, billedUsd: plan === "managed" ? res.costUsd * 3 : 0 } }).catch(() => {});
    }
    await setStrategy(shop, res.summary, res.pieces, { perDay: Number(form.get("perDay") ?? 1), days: Number(form.get("days") ?? 0) || undefined });
    await generateDraft(admin, shop, plan, true); // draft the top piece right away
    return { plan: await getPlan(shop), summary: res.summary, pieces: res.pieces };
  } else if (intent === "start") {
    await startPlan(shop, {
      perDay: Number(form.get("perDay") ?? 1),
      days: Number(form.get("days") ?? 30),
      strategy: String(form.get("strategy") ?? ""),
    });
    await generateDraft(admin, shop, plan, true);
  } else if (intent === "generate") {
    await generateDraft(admin, shop, plan);
  } else if (intent === "regenerate") {
    await generateDraft(admin, shop, plan, true);
  } else if (intent === "publish") {
    const r = await publishDraft(admin, shop);
    if (!r.ok) return { plan: await getPlan(shop), error: r.error };
    await generateDraft(admin, shop, plan); // queue the next one if still due today? (no — once/day)
  } else if (intent === "pause") {
    await setStatus(shop, "paused");
  } else if (intent === "resume") {
    await setStatus(shop, "active");
    await generateDraft(admin, shop, plan);
  } else if (intent === "autopublish") {
    // "Approve all / auto-publish": future daily drafts go live without manual
    // approval. Turning it on also publishes any draft already waiting.
    const on = String(form.get("value") ?? "") === "on";
    await setAutoPublish(shop, on);
    if (on) {
      await generateDraft(admin, shop, plan); // make sure today's draft exists
      await publishDraft(admin, shop).catch(() => ({ ok: false }));
      await generateDraft(admin, shop, plan); // queue the next
    }
  }

  return { plan: await getPlan(shop) };
}
