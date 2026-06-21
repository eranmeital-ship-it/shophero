import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { getCachedReport, getOrBuildReport } from "../lib/report.server";

/** Fast read: the cached report only (never calls the model). */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const report = await getCachedReport(session.shop).catch(() => null);
  return { report };
}

/**
 * Build/refresh the report. Regenerates the AI narrative only if the store
 * changed (content hash) and the throttle window passed — or `force=1` (the
 * "Refresh" button). Safe to call on every dashboard mount: unchanged = $0.
 * This is also the endpoint a daily cron would hit.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getActivePlan(admin).catch(() => null);
  const form = await request.formData().catch(() => null);
  const force = form?.get("force") === "1";
  const report = await getOrBuildReport(admin, session.shop, plan, { force }).catch(() => null);
  return { report };
}
