import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Job } from "@prisma/client";
import db from "../db.server";
import { getActivePlan } from "./billing.server";
import { runBulkContentBatch } from "./content-gen.server";
import { todayKey, type JobType } from "./jobs.server";

/**
 * Scheduled-job runner. Advances a due bulk job by ONE daily batch using the
 * cheap, direct content engine (Haiku) — NOT the agent — so background work is
 * inexpensive and reliable. Cursor-paginated for exact, resumable coverage of a
 * large catalog: each run picks up exactly where the last left off.
 *
 * Auto-running is consented (the merchant explicitly scheduled the bulk job).
 * Only product-METADATA jobs auto-run (descriptions, SEO) — they write product
 * fields, not theme files, so there's nothing to stage/approve. Disable with
 * DRIFT_JOBS_AUTORUN=false.
 */
const AUTORUN = process.env.DRIFT_JOBS_AUTORUN !== "false"; // on by default
const AUTO_TYPES: JobType[] = ["bulk_descriptions", "bulk_seo"];

function taskFor(type: JobType): "descriptions" | "seo" | null {
  if (type === "bulk_descriptions") return "descriptions";
  if (type === "bulk_seo") return "seo";
  return null;
}

/** Run one daily batch for a specific job. Returns a short status for the UI/log. */
export async function runJobBatch(shop: string, job: Job, admin: AdminApiContext): Promise<{ examined: number; applied: number; done: boolean } | null> {
  const type = job.type as JobType;
  const task = taskFor(type);
  if (!task) return null; // non-content jobs don't auto-run yet

  const left = job.total - job.completed;
  if (left <= 0) {
    await db.job.update({ where: { id: job.id }, data: { status: "done" } }).catch(() => {});
    return { examined: 0, applied: 0, done: true };
  }

  let params: { cursor?: string | null; prompt?: string } = {};
  try { params = job.params ? JSON.parse(job.params) : {}; } catch { params = {}; }
  const batch = Math.min(job.perDay, left);
  const today = todayKey();

  try {
    await db.job.update({ where: { id: job.id }, data: { status: "running" } });
    const r = await runBulkContentBatch(admin, shop, task, batch, params.cursor ?? null);
    const completed = Math.min(job.total, job.completed + r.examined);
    const done = completed >= job.total || !r.hasNext;
    await db.job.update({
      where: { id: job.id },
      data: {
        completed,
        doneToday: r.examined,
        lastRunOn: today,
        status: done ? "done" : "scheduled",
        params: JSON.stringify({ ...params, cursor: r.nextCursor }),
      },
    });
    if (r.costUsd > 0) {
      const plan = await getActivePlan(admin).catch(() => null);
      await db.usageEvent
        .create({ data: { shop, plan, kind: "job", costUsd: r.costUsd, billedUsd: plan === "managed" ? r.costUsd * 3 : 0 } })
        .catch(() => {});
    }
    await db.appEvent
      .create({ data: { shop, level: "info", type: "job_progress", message: `${job.title}: examined +${r.examined}, updated ${r.applied} (${completed}/${job.total})` } })
      .catch(() => {});
    return { examined: r.examined, applied: r.applied, done };
  } catch (err) {
    await db.job
      .update({ where: { id: job.id }, data: { status: "scheduled", error: String(err instanceof Error ? err.message : err).slice(0, 300) } })
      .catch(() => {});
    return null;
  }
}

/** On-entry tick: advance the oldest content job not yet run today. */
export async function advanceDueJobs(shop: string, admin: AdminApiContext): Promise<void> {
  if (!AUTORUN) return;
  const today = todayKey();
  const job = await db.job.findFirst({
    where: { shop, status: { in: ["scheduled", "running"] }, type: { in: AUTO_TYPES }, NOT: { lastRunOn: today } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return;
  await runJobBatch(shop, job, admin);
}

/** Merchant-initiated "run the next batch now" for a specific job. */
export async function runJobNow(shop: string, jobId: string, admin: AdminApiContext): Promise<{ examined: number; applied: number; done: boolean } | null> {
  const job = await db.job.findFirst({ where: { id: jobId, shop, status: { in: ["scheduled", "running"] } } });
  if (!job) return null;
  return runJobBatch(shop, job, admin);
}
