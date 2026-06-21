import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { runAudit } from "../lib/audit.server";

/**
 * Live storefront audit for the Optimize tab. PageSpeed needs a public URL, so
 * we audit the merchant's storefront (https://{shop}). Returns real scores +
 * a ranked issue list.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const result = await runAudit(`https://${session.shop}`);
  return Response.json(result);
}
