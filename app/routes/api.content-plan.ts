import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { generateDraft, getPlan, publishDraft, setStatus, startPlan } from "../lib/content-plan.server";

/** Content Plan control: start / generate (daily draft) / publish / regenerate / pause / resume. */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getActivePlan(admin).catch(() => null);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "start") {
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
  }

  return { plan: await getPlan(shop) };
}
