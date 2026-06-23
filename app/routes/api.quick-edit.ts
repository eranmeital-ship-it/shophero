import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { ensureAssetInWorkspace } from "../lib/theme.server";
import { generateQuickCss, applyQuickCss } from "../lib/quick-edit.server";
import { getActivePlan } from "../lib/billing.server";
import { enforceSpend } from "../lib/spend-guard.server";
import { rateLimitResponse } from "../lib/rate-limit.server";
import { resolveKey } from "../lib/onboarding.server";
import db from "../db.server";

/**
 * Fast, cheap click-to-edit: one structured LLM call turns the instruction into
 * a scoped CSS rule (staged for approval). Style-only — returns {unsupported:true}
 * for text/structure changes so the client falls back to the agent.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };

  const form = await request.formData();
  const selector = String(form.get("selector") ?? "").trim();
  const instruction = String(form.get("instruction") ?? "").trim();
  if (!selector || !instruction) return Response.json({ error: "Missing selector or instruction" }, { status: 400 });

  const plan = await getActivePlan(admin).catch(() => null);
  const limited = rateLimitResponse(session.shop, 30, 60_000);
  if (limited) return limited;
  const blocked = await enforceSpend(session.shop, plan);
  if (blocked) return blocked;
  const byokKey = plan === "byok" ? (await resolveKey(session.shop, plan)) ?? undefined : undefined;

  const gen = await generateQuickCss({
    selector,
    tag: String(form.get("tag") ?? "div"),
    text: String(form.get("text") ?? ""),
    sectionType: String(form.get("sectionType") ?? ""),
    instruction,
    byokKey,
  });

  // Always meter the (tiny) LLM cost.
  if (gen.costUsd > 0) {
    await db.usageEvent
      .create({ data: { shop: session.shop, plan, model: gen.model, kind: "quick-edit", costUsd: gen.costUsd, billedUsd: plan === "managed" ? gen.costUsd * 3 : 0 } })
      .catch(() => {});
  }

  if (gen.unsupported) {
    return Response.json({ unsupported: true, summary: gen.summary, costUsd: gen.costUsd, model: gen.model });
  }

  const { themeId, dir } = await ensureReady(ctx);
  await ensureAssetInWorkspace(ctx, themeId, dir, "layout/theme.liquid").catch(() => null);
  const files = await applyQuickCss(dir, gen.css);
  await db.appEvent
    .create({ data: { shop: session.shop, level: "info", type: "command", message: `Visual edit: ${instruction}`.slice(0, 200) } })
    .catch(() => {});

  return Response.json({ ok: true, summary: gen.summary, css: gen.css, files, costUsd: gen.costUsd, model: gen.model });
}
