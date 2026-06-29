import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Job } from "@prisma/client";
import db from "../db.server";
import { getActivePlan } from "./billing.server";
import { checkSpend } from "./spend-guard.server";
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
const AUTO_TYPES: JobType[] = ["bulk_descriptions", "bulk_seo", "bulk_product_pages", "bulk_mobile"];

function taskFor(type: JobType): "descriptions" | "seo" | "product_pages" | "mobile" | null {
  if (type === "bulk_descriptions") return "descriptions";
  if (type === "bulk_seo") return "seo";
  if (type === "bulk_product_pages") return "product_pages";
  if (type === "bulk_mobile") return "mobile";
  return null;
}

/** Run one daily batch for a specific job. Returns a short status for the UI/log. */
export async function runJobBatch(shop: string, job: Job, admin: AdminApiContext): Promise<{ examined: number; applied: number; done: boolean } | null> {
  const type = job.type as JobType;
  const task = taskFor(type);
  if (!task) return null; // non-content jobs don't auto-run yet

  let params: { cursor?: string | null; prompt?: string } = {};
  try { params = job.params ? JSON.parse(job.params) : {}; } catch { params = {}; }
  const today = todayKey();

  // Respect the spend caps — background batches are real spend too. If over a
  // cap, pause for the day (lastRunOn) and resume tomorrow without burning more.
  const plan = await getActivePlan(admin).catch(() => null);
  if (!(await checkSpend(shop, plan)).allowed) {
    await db.job.update({ where: { id: job.id }, data: { status: "scheduled", lastRunOn: today } }).catch(() => {});
    return null;
  }

  try {
    const r = await runBulkContentBatch(admin, shop, task, job.perDay, params.cursor ?? null);
    // Transient page-fetch failure — back off to the next day, don't mark done.
    if (!r.ok) {
      await db.job.update({ where: { id: job.id }, data: { status: "scheduled", lastRunOn: today, error: "Couldn't reach the catalog this run; will retry next batch." } }).catch(() => {});
      return null;
    }
    // Completion is driven by the CURSOR (the source of truth), not the frozen
    // total — so a grown/shrunk catalog can't strand or prematurely end the job.
    const examinedTotal = job.completed + r.examined;
    const done = !r.hasNext;
    await db.job.update({
      where: { id: job.id },
      data: {
        completed: done ? Math.max(job.total, examinedTotal) : examinedTotal,
        doneToday: r.examined,
        lastRunOn: today,
        status: done ? "done" : "scheduled",
        error: null,
        params: JSON.stringify({ ...params, cursor: r.nextCursor }),
      },
    });
    if (r.costUsd > 0) {
      await db.usageEvent
        .create({ data: { shop, plan, kind: "job", costUsd: r.costUsd, billedUsd: plan === "managed" ? r.costUsd * 3 : 0 } })
        .catch(() => {});
    }
    await db.appEvent
      .create({ data: { shop, level: "info", type: "job_progress", message: `${job.title}: examined +${r.examined}, updated ${r.applied}${done ? " — done" : ""}` } })
      .catch(() => {});
    return { examined: r.examined, applied: r.applied, done };
  } catch (err) {
    // Back off to next day on hard failure so we don't hot-loop the same job.
    await db.job
      .update({ where: { id: job.id }, data: { status: "scheduled", lastRunOn: today, error: String(err instanceof Error ? err.message : err).slice(0, 300) } })
      .catch(() => {});
    return null;
  }
}

/**
 * Atomically claim a job for today's run (prevents the chat-tick and the cron
 * from double-processing the same job). Returns the claimed job or null if it
 * was already claimed/advanced today.
 */
async function claimJob(jobId: string, today: string): Promise<Job | null> {
  const res = await db.job.updateMany({
    where: { id: jobId, status: { in: ["scheduled", "running"] }, NOT: { lastRunOn: today } },
    data: { status: "running", lastRunOn: today },
  });
  if (res.count !== 1) return null;
  return db.job.findUnique({ where: { id: jobId } });
}

/** On-entry tick: advance the oldest content job not yet run today. */
export async function advanceDueJobs(shop: string, admin: AdminApiContext): Promise<void> {
  if (!AUTORUN) return;
  const today = todayKey();
  const candidate = await db.job.findFirst({
    where: { shop, status: { in: ["scheduled", "running"] }, type: { in: AUTO_TYPES }, NOT: { lastRunOn: today } },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return;
  const job = await claimJob(candidate.id, today); // claim resets lastRunOn — restore for the worker
  if (!job) return;
  await runJobBatch(shop, { ...job, lastRunOn: null }, admin);
}

/** Merchant-initiated "run the next batch now" for a specific job (no daily gate). */
export async function runJobNow(shop: string, jobId: string, admin: AdminApiContext): Promise<{ examined: number; applied: number; done: boolean } | null> {
  const job = await db.job.findFirst({ where: { id: jobId, shop, status: { in: ["scheduled", "running"] } } });
  if (!job) return null;
  return runJobBatch(shop, job, admin);
}

/** Claim + run a specific candidate job (used by the cron, which already filtered to due jobs). */
export async function claimAndRun(shop: string, jobId: string, admin: AdminApiContext): Promise<{ examined: number; applied: number; done: boolean } | null> {
  const today = todayKey();
  const job = await claimJob(jobId, today);
  if (!job) return null;
  return runJobBatch(shop, { ...job, lastRunOn: null }, admin);
}
