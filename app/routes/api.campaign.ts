import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getActivePlan } from "../lib/billing.server";
import { enforceSpend } from "../lib/spend-guard.server";
import { rateLimitResponse } from "../lib/rate-limit.server";
import { generateEmailCampaign } from "../lib/content-gen.server";

/**
 * Email-campaign kit — generates a paste-ready, brand-grounded email series.
 * ShopHero can't SEND email, so this returns copy for the merchant's ESP; the
 * on-store assets (signup section, discount, thank-you page) are built by the
 * campaign panel via the existing section/agent flows. Metered like content.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const limited = rateLimitResponse(session.shop, 12, 60_000);
  if (limited) return limited;
  const plan = await getActivePlan(admin).catch(() => null);
  const blocked = await enforceSpend(session.shop, plan);
  if (blocked) return blocked;

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Bad request." }, { status: 400 });
  const goal = String(form.get("goal") ?? "Welcome new subscribers");
  const incentive = String(form.get("incentive") ?? "");
  const tone = String(form.get("tone") ?? "") || undefined;
  const count = Number(form.get("count") ?? 4) || 4;

  try {
    const { emails, costUsd, model } = await generateEmailCampaign(admin, session.shop, { goal, incentive, tone, count });
    if (costUsd > 0) {
      await db.usageEvent.create({ data: { shop: session.shop, plan, model, kind: "campaign", costUsd, billedUsd: plan === "managed" ? costUsd * 3 : 0 } }).catch(() => {});
    }
    if (!emails.length) return Response.json({ error: "Couldn't generate the series — try again." }, { status: 422 });
    return Response.json({ ok: true, emails });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Generation failed." }, { status: 500 });
  }
}
