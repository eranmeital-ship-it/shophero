import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { buildRings, verifyEdges } from "../lib/link-exchange.server";

/**
 * Link Network maintenance — scheduler-driven (Railway cron):
 *   curl -X POST -H "Authorization: Bearer $DRIFT_CRON_SECRET" https://app.shophero.io/api/cron/links
 * Matches new members into 3-way rings and verifies existing links are still live.
 */
function authorized(request: Request): boolean {
  const secret = process.env.DRIFT_CRON_SECRET;
  if (!secret) return false;
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(bearer), Buffer.from(secret));
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rings = await buildRings().catch((e) => ({ error: String(e) }));
  const verify = await verifyEdges().catch((e) => ({ error: String(e) }));
  return Response.json({ ok: true, rings, verify });
}

export async function action({ request }: ActionFunctionArgs) {
  return run(request);
}
export async function loader({ request }: LoaderFunctionArgs) {
  return run(request);
}
