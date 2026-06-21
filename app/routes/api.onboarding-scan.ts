import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { autofillProfile } from "../lib/onboarding.server";
import db from "../db.server";

/**
 * Onboarding store scan — reads the merchant's catalog, pricing and storefront
 * and infers their profile FOR them (so the wizard fills itself in). Called via
 * fetcher from the onboarding wizard's "Analyze my store" step.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getActivePlan(admin).catch(() => null);

  const r = await autofillProfile({ admin, shop: session.shop, plan });

  if (r.usage) {
    await db.usageEvent
      .create({
        data: {
          shop: session.shop,
          plan,
          model: r.model ?? null,
          kind: "onboarding_scan",
          costUsd: r.costUsd ?? null,
          billedUsd: plan === "managed" ? (r.costUsd ?? 0) * 3 : 0,
          inputTokens: r.usage.inputTokens ?? null,
          outputTokens: r.usage.outputTokens ?? null,
        },
      })
      .catch(() => {});
  }

  return {
    fields: r.fields,
    goals: r.goals,
    detected: r.detected,
    learnings: r.learnings,
    leaks: r.leaks,
    estLow: r.estLow,
    estHigh: r.estHigh,
  };
}
