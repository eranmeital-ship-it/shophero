import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { discardChanges } from "../lib/workspace.server";
import { withShopLock } from "../lib/shop-lock.server";

/**
 * Discard the currently staged (not-yet-applied) theme edits. The counterpart to
 * /api/apply — lets the merchant reject a proposed change before it touches the
 * working theme.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  await withShopLock(session.shop, async () => {
    const { dir } = await ensureReady(ctx);
    await discardChanges(dir);
  });
  return Response.json({ discarded: true });
}
