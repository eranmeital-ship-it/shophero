import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getActivePlan } from "../lib/billing.server";
import { generateDescriptions, applyDescriptions, type ContentDraft } from "../lib/content-gen.server";

/**
 * Direct content generation/apply — bypasses the agent loop for commodity content
 * (fast + cheap + reliable). op=generate returns before/after drafts for review;
 * op=apply writes the approved ones to the live store.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const task = String(form.get("task") ?? "descriptions");

  if (task !== "descriptions") {
    return Response.json({ error: "Unsupported content task" }, { status: 400 });
  }

  if (op === "generate") {
    const { drafts, costUsd, total } = await generateDescriptions(admin, session.shop, {
      which: String(form.get("which") ?? "Products with thin/missing descriptions"),
      productId: String(form.get("productId") ?? "") || undefined,
      tone: String(form.get("tone") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
    });
    // Meter the generation cost (billed 3x on managed) for the Usage view.
    const plan = await getActivePlan(admin).catch(() => null);
    if (costUsd > 0) {
      await db.usageEvent
        .create({ data: { shop: session.shop, plan, kind: "content", costUsd, billedUsd: plan === "managed" ? costUsd * 3 : 0 } })
        .catch(() => {});
    }
    return Response.json({ drafts, total });
  }

  if (op === "apply") {
    let drafts: { id: string; after: string }[] = [];
    try {
      drafts = (JSON.parse(String(form.get("drafts") ?? "[]")) as ContentDraft[]).map((d) => ({ id: d.id, after: d.after }));
    } catch {
      return Response.json({ error: "Invalid drafts" }, { status: 400 });
    }
    if (!drafts.length) return Response.json({ applied: 0, failed: 0 });
    const res = await applyDescriptions(admin, drafts);
    await db.appEvent
      .create({ data: { shop: session.shop, level: "info", type: "content", message: `Applied ${res.applied} product description(s)` } })
      .catch(() => {});
    return Response.json(res);
  }

  return Response.json({ error: "Unknown op" }, { status: 400 });
}
