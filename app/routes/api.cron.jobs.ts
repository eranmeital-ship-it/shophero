import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import db from "../db.server";
import { todayKey, ACTIVE_STATUSES } from "../lib/jobs.server";
import { runJobBatch } from "../lib/job-runner.server";
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
const MAX_SHOPS_PER_RUN = Number(process.env.DRIFT_CRON_MAX_SHOPS ?? 25) || 25;

function authorized(request: Request): boolean {
  const secret = process.env.DRIFT_CRON_SECRET;
  if (!secret) return false; // disabled until a secret is configured
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const qs = url.searchParams.get("key") ?? "";
  return bearer === secret || qs === secret;
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = todayKey();
  // Distinct shops with a due content job (not yet advanced today).
  const due = await db.job.findMany({
    where: { status: { in: [...ACTIVE_STATUSES.filter((s) => s !== "paused")] }, type: { in: AUTO_TYPES }, NOT: { lastRunOn: today } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const shops = [...new Set(due.map((j) => j.shop))].slice(0, MAX_SHOPS_PER_RUN);

  const results: { shop: string; job: string; examined: number; applied: number; done: boolean }[] = [];
  for (const shop of shops) {
    const job = due.find((j) => j.shop === shop);
    if (!job) continue;
    try {
      const { admin } = await unauthenticated.admin(shop);
      const r = await runJobBatch(shop, job, admin);
      if (r) results.push({ shop, job: job.title, ...r });
    } catch (e) {
      await db.appEvent
        .create({ data: { shop, level: "warn", type: "cron_job", message: `cron run failed: ${e instanceof Error ? e.message : e}`.slice(0, 200) } })
        .catch(() => {});
    }
  }
  return Response.json({ ok: true, ranShops: results.length, pendingShops: Math.max(0, [...new Set(due.map((j) => j.shop))].length - shops.length), results });
}

// Accept POST (preferred) and GET (some schedulers only do GET).
export async function action({ request }: ActionFunctionArgs) {
  return run(request);
}
export async function loader({ request }: LoaderFunctionArgs) {
  return run(request);
}
