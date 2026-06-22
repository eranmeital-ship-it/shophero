import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { unauthenticated } from "../shopify.server";
import db from "../db.server";
import { todayKey } from "../lib/jobs.server";
import { claimAndRun } from "../lib/job-runner.server";
import type { JobType } from "../lib/jobs-types";

/**
 * Unattended daily job runner — meant to be hit by a scheduler (Railway cron):
 *   curl -X POST -H "Authorization: Bearer $DRIFT_CRON_SECRET" https://app.shophero.io/api/cron/jobs
 *
 * Auth is a shared secret (no Shopify session in a cron context). For each shop
 * with a content job not yet run today, it gets an OFFLINE admin client and
 * advances one daily batch. Caps how many shops it processes per invocation so a
 * single run stays bounded; the next tick continues.
 */
const AUTO_TYPES: JobType[] = ["bulk_descriptions", "bulk_seo"];
const MAX_JOBS_PER_RUN = Number(process.env.DRIFT_CRON_MAX_SHOPS ?? 50) || 50;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false; // length isn't secret-leaking here
  return timingSafeEqual(ab, bb);
}

function authorized(request: Request): boolean {
  const secret = process.env.DRIFT_CRON_SECRET;
  if (!secret) return false; // disabled until a secret is configured
  // Header only — never the query string (it leaks into proxy/access logs).
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return !!bearer && safeEqual(bearer, secret);
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = todayKey();
  // All due content jobs (not yet advanced today) — every job, across shops, so a
  // shop with two jobs doesn't starve. Bounded per run; the next tick continues.
  const dueAll = await db.job.findMany({
    where: { status: { in: ["scheduled", "running"] }, type: { in: AUTO_TYPES }, NOT: { lastRunOn: today } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const due = dueAll.slice(0, MAX_JOBS_PER_RUN);

  // One offline admin client per shop, reused across that shop's jobs.
  const admins = new Map<string, Awaited<ReturnType<typeof unauthenticated.admin>>["admin"]>();
  const results: { shop: string; job: string; examined: number; applied: number; done: boolean }[] = [];
  for (const job of due) {
    try {
      let admin = admins.get(job.shop);
      if (!admin) {
        admin = (await unauthenticated.admin(job.shop)).admin;
        admins.set(job.shop, admin);
      }
      const r = await claimAndRun(job.shop, job.id, admin); // atomic claim guards against double-runs
      if (r) results.push({ shop: job.shop, job: job.title, ...r });
    } catch (e) {
      await db.appEvent
        .create({ data: { shop: job.shop, level: "warn", type: "cron_job", message: `cron run failed: ${e instanceof Error ? e.message : e}`.slice(0, 200) } })
        .catch(() => {});
    }
  }
  return Response.json({ ok: true, ranJobs: results.length, pendingJobs: Math.max(0, dueAll.length - due.length), results });
}

// Accept POST (preferred) and GET (some schedulers only do GET).
export async function action({ request }: ActionFunctionArgs) {
  return run(request);
}
export async function loader({ request }: LoaderFunctionArgs) {
  return run(request);
}
