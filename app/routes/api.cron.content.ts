import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { unauthenticated } from "../shopify.server";
import db from "../db.server";
import { getActivePlan, tierAllows } from "../lib/billing.server";
import { generateDraft, publishDraft } from "../lib/content-plan.server";

/**
 * Unattended daily content drip — meant to be hit by a scheduler (Railway cron):
 *   curl -X POST -H "Authorization: Bearer $DRIFT_CRON_SECRET" https://app.shophero.io/api/cron/content
 *
 * For each active content plan not yet drafted today, get an OFFLINE admin
 * client and generate the next article. If the plan is set to auto-publish,
 * it goes live immediately; otherwise it's staged for the merchant to approve.
 * Bounded per invocation; the next tick continues. Content drip is Pro+, so we
 * skip plans whose tier no longer includes it.
 */
const MAX_PER_RUN = Number(process.env.DRIFT_CRON_MAX_SHOPS ?? 50) || 50;

function authorized(request: Request): boolean {
  const secret = process.env.DRIFT_CRON_SECRET;
  if (!secret) return false;
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(bearer), Buffer.from(secret));
}

function isToday(d?: Date | null): boolean {
  if (!d) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const active = await db.contentPlan.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });
  // Only those not already drafted today (generateDraft also guards, but this
  // keeps us from spending an offline-auth on shops with nothing to do).
  const due = active.filter((p) => !isToday(p.draftDate) && !p.draftTitle).slice(0, MAX_PER_RUN);

  const results: { shop: string; drafted: boolean; published: boolean }[] = [];
  for (const row of due) {
    try {
      const { admin } = await unauthenticated.admin(row.shop);
      if (!(await tierAllows(admin, "contentDrip").catch(() => false))) continue; // downgraded → skip
      const plan = await getActivePlan(admin).catch(() => null);
      await generateDraft(admin, row.shop, plan);
      let published = false;
      if (row.autoPublish) {
        const r = await publishDraft(admin, row.shop).catch(() => ({ ok: false }));
        published = !!r.ok;
        if (published) await generateDraft(admin, row.shop, plan); // queue tomorrow's
      }
      results.push({ shop: row.shop, drafted: true, published });
    } catch (e) {
      await db.appEvent
        .create({ data: { shop: row.shop, level: "warn", type: "cron_content", message: `content cron failed: ${e instanceof Error ? e.message : e}`.slice(0, 200) } })
        .catch(() => {});
    }
  }
  return Response.json({ ok: true, ran: results.length, pending: Math.max(0, active.length - due.length), results });
}

export async function action({ request }: ActionFunctionArgs) {
  return run(request);
}
export async function loader({ request }: LoaderFunctionArgs) {
  return run(request);
}
