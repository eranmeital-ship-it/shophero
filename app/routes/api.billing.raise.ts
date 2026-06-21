import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { raiseUsageCap } from "../lib/billing.server";

/**
 * Raise the merchant's monthly usage limit (+one limit's worth) and redirect to
 * Shopify's approval page. Triggered from the dashboard banner when usage hits
 * the cap — the only point in the flow that needs the merchant to approve.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
  const url = await raiseUsageCap(admin, returnUrl);
  if (!url) return redirect("/app");
  return redirect(url);
}
