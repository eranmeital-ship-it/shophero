import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getActivePlan } from "../lib/billing.server";
import { resolveKey } from "../lib/onboarding.server";
import { decomposeGoal } from "../lib/plan-decompose.server";
import { getCurrentPlan, createPlan, updatePlanItem, archivePlan } from "../lib/plan.server";
import type { PlanItem } from "../lib/plan-routes";

/**
 * Action-plan API:
 *   op=get      → current plan (or null)
 *   op=decompose→ break a goal into a routed checklist + persist it (metered)
 *   op=update   → patch one item (mark shipped / skipped, record cost)
 *   op=archive  → archive the current plan
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const op = String(form.get("op") ?? "get");

  if (op === "get") {
    return Response.json({ ok: true, plan: await getCurrentPlan(shop) });
  }

  if (op === "decompose") {
    const goal = String(form.get("goal") ?? "").trim();
    if (!goal) return Response.json({ error: "Tell me the goal first." }, { status: 400 });
    const plan = await getActivePlan(admin).catch(() => null);
    const byokKey = plan === "byok" ? (await resolveKey(shop, plan)) ?? undefined : undefined;
    try {
      const { items, costUsd } = await decomposeGoal(admin, goal, byokKey);
      if (!items.length) return Response.json({ error: "Couldn't break that goal down — try rephrasing it." }, { status: 422 });
      if (costUsd > 0) {
        await db.usageEvent.create({ data: { shop, plan, kind: "plan", costUsd, billedUsd: plan === "managed" ? costUsd * 3 : 0 } }).catch(() => {});
      }
      return Response.json({ ok: true, plan: await createPlan(shop, goal, items) });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Decompose failed." }, { status: 500 });
    }
  }

  if (op === "update") {
    const planId = String(form.get("planId") ?? "");
    const itemId = String(form.get("itemId") ?? "");
    const patch: Partial<PlanItem> = {};
    const status = String(form.get("status") ?? "");
    if (status === "todo" || status === "done" || status === "skipped") patch.status = status;
    if (patch.status === "done") {
      patch.shippedAt = new Date().toISOString();
      const summary = String(form.get("summary") ?? "").trim();
      if (summary) patch.shippedSummary = summary;
      const actualUsd = Number(form.get("actualUsd"));
      if (!Number.isNaN(actualUsd) && actualUsd >= 0) patch.actualUsd = actualUsd;
    }
    if (patch.status === "todo") {
      patch.shippedAt = undefined;
      patch.shippedSummary = undefined;
      patch.actualUsd = undefined;
    }
    const updated = await updatePlanItem(shop, planId, itemId, patch);
    return Response.json({ ok: !!updated, plan: updated });
  }

  if (op === "archive") {
    await archivePlan(shop, String(form.get("planId") ?? ""));
    return Response.json({ ok: true, plan: null });
  }

  return Response.json({ error: "Unknown op" }, { status: 400 });
}
