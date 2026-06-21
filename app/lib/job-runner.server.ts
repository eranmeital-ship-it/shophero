import db from "../db.server";
import { runAgentTurn } from "./agent.server";
import { ensureReady } from "./bootstrap.server";
import { JOB_TYPES, todayKey, remainingToday, type JobType } from "./jobs.server";
import type { AdminCtx } from "./shopify-tools.server";

/**
 * On-entry daily runner. Advances ONE due job by its daily batch when a merchant
 * uses the app. Off by default (DRIFT_JOBS_AUTORUN=true to enable) because it
 * runs LIVE mutations — only live-mutation-safe job types auto-run; theme-based
 * jobs (product-page redesigns) still need per-apply approval.
 *
 * NOTE (phase 3): batches rely on the agent skipping already-done items. For
 * exact, resumable progress we'll add per-item tracking (a JobItem table) before
 * enabling this in production.
 */
const AUTORUN = process.env.DRIFT_JOBS_AUTORUN === "true";
const AUTO_TYPES: JobType[] = ["bulk_descriptions", "bulk_seo"];

function batchPrompt(type: JobType, n: number): string {
  switch (type) {
    case "bulk_descriptions":
      return `Improve the product descriptions for up to ${n} products that still have weak, thin, or manufacturer-style copy. Call page_kit first, honor the brand voice, and update each via the Shopify Admin API (productUpdate). Only change ones that clearly need it; do fewer if fewer need work. Keep each concise.`;
    case "bulk_seo":
      return `Optimize SEO for up to ${n} products that have a weak or missing SEO title / meta description. Call seo_playbook first, then update each via the Shopify Admin API. Only improve ones that need it.`;
    default:
      return `Process up to ${n} items for this task.`;
  }
}

export async function advanceDueJobs(shop: string, ctx: AdminCtx): Promise<void> {
  if (!AUTORUN) return;
  const today = todayKey();

  const job = await db.job.findFirst({
    where: { shop, status: { in: ["scheduled", "running"] }, type: { in: AUTO_TYPES }, NOT: { lastRunOn: today } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return;

  const left = job.total - job.completed;
  if (left <= 0) {
    await db.job.update({ where: { id: job.id }, data: { status: "done" } }).catch(() => {});
    return;
  }
  const rem = await remainingToday(shop, job.type as JobType);
  const batch = Math.min(job.perDay, left, rem);
  if (batch <= 0) return;

  try {
    await db.job.update({ where: { id: job.id }, data: { status: "running" } });
    const { dir } = await ensureReady(ctx);
    await runAgentTurn({ cwd: dir, prompt: batchPrompt(job.type as JobType, batch), shop, admin: ctx, allowMutations: true });

    const completed = Math.min(job.total, job.completed + batch);
    await db.job.update({
      where: { id: job.id },
      data: { completed, doneToday: batch, lastRunOn: today, status: completed >= job.total ? "done" : "scheduled" },
    });
    await db.appEvent
      .create({ data: { shop, level: "info", type: "job_progress", message: `${job.title}: +${batch} today (${completed}/${job.total})` } })
      .catch(() => {});
  } catch (err) {
    await db.job
      .update({ where: { id: job.id }, data: { status: "error", error: String(err instanceof Error ? err.message : err).slice(0, 300) } })
      .catch(() => {});
  }
}
