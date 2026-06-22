import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getActivePlan } from "../lib/billing.server";
import { resolveKey } from "../lib/onboarding.server";
import { generateAeoTargets } from "../lib/aeo-targets.server";

/**
 * AEO Brain — Step 3 citation-target generator. Produces the buyer-question
 * list + the ranked sources AI cites for them. Opt-in (a few cents); metered to
 * the Usage view like other content generation.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getActivePlan(admin).catch(() => null);
  const byokKey = plan === "byok" ? (await resolveKey(session.shop, plan)) ?? undefined : undefined;

  try {
    const targets = await generateAeoTargets(admin, byokKey);
    if (targets.costUsd > 0) {
      await db.usageEvent
        .create({ data: { shop: session.shop, plan, kind: "aeo-targets", costUsd: targets.costUsd, billedUsd: plan === "managed" ? targets.costUsd * 3 : 0 } })
        .catch(() => {});
    }
    return Response.json({ ok: true, targets });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Generation failed." }, { status: 500 });
  }
}
