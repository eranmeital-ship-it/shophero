import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getActivePlan } from "../lib/billing.server";
import { enforceSpend } from "../lib/spend-guard.server";
import { generateDescriptions, applyDescriptions, generateSeo, applySeo, generateAlt, applyAlt, generateArticles, publishArticles, suggestTopics, type ContentDraft } from "../lib/content-gen.server";

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

  if (task !== "descriptions" && task !== "seo" && task !== "alt" && task !== "articles") {
    return Response.json({ error: "Unsupported content task" }, { status: 400 });
  }

  // Gate every LLM-spending op behind the spend caps (apply only writes to the store).
  const plan = await getActivePlan(admin).catch(() => null);
  if (op === "suggest" || op === "generate") {
    const blocked = await enforceSpend(session.shop, plan);
    if (blocked) return blocked;
  }

  // Topic suggestions for the article writer.
  if (op === "suggest") {
    const { topics, costUsd, model } = await suggestTopics(admin);
    if (costUsd > 0) {
      await db.usageEvent.create({ data: { shop: session.shop, plan, model, kind: "content", costUsd, billedUsd: plan === "managed" ? costUsd * 3 : 0 } }).catch(() => {});
    }
    return Response.json({ topics });
  }

  if (op === "generate") {
    const genOpts = {
      which: String(form.get("which") ?? ""),
      productId: String(form.get("productId") ?? "") || undefined,
      tone: String(form.get("tone") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
    };
    const { drafts, costUsd, total } =
      task === "seo" ? await generateSeo(admin, session.shop, genOpts)
      : task === "alt" ? await generateAlt(admin, session.shop, genOpts)
      : task === "articles" ? await generateArticles(admin, session.shop, { count: Number(form.get("count") ?? 1) || 1, topic: String(form.get("topic") ?? "") || undefined, notes: genOpts.notes })
      : await generateDescriptions(admin, session.shop, genOpts);
    // Meter the generation cost (billed 3x on managed) for the Usage view.
    if (costUsd > 0) {
      await db.usageEvent
        .create({ data: { shop: session.shop, plan, kind: "content", costUsd, billedUsd: plan === "managed" ? costUsd * 3 : 0 } })
        .catch(() => {});
    }
    return Response.json({ drafts, total, costUsd });
  }

  if (op === "apply") {
    let drafts: ContentDraft[] = [];
    try {
      drafts = JSON.parse(String(form.get("drafts") ?? "[]")) as ContentDraft[];
    } catch {
      return Response.json({ error: "Invalid drafts" }, { status: 400 });
    }
    if (!drafts.length) return Response.json({ applied: 0, failed: 0 });
    if (task === "articles") {
      const res = await publishArticles(admin, session.shop, drafts.map((d) => ({ title: d.title, after: d.after, metaDescription: d.metaDescription })));
      await db.appEvent
        .create({ data: { shop: session.shop, level: "info", type: "content", message: `Published ${res.applied} blog article(s)` } })
        .catch(() => {});
      return Response.json(res);
    }
    const res =
      task === "seo" ? await applySeo(admin, drafts.map((d) => ({ id: d.id, seoTitle: d.seoTitle, metaDescription: d.metaDescription })))
      : task === "alt" ? await applyAlt(admin, drafts.map((d) => ({ mediaIds: d.mediaIds, after: d.after })))
      : await applyDescriptions(admin, drafts.map((d) => ({ id: d.id, after: d.after })));
    const label = task === "seo" ? "product SEO update(s)" : task === "alt" ? "image alt text update(s)" : "product description(s)";
    await db.appEvent
      .create({ data: { shop: session.shop, level: "info", type: "content", message: `Applied ${res.applied} ${label}` } })
      .catch(() => {});
    return Response.json(res);
  }

  return Response.json({ error: "Unknown op" }, { status: 400 });
}
