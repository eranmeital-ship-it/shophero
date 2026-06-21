import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { commitBaseline, restoreToVersion } from "../lib/workspace.server";
import { pushWorkspaceChanges } from "../lib/theme.server";
import db from "../db.server";

/**
 * Roll the dev theme back to a previous restore point. Mirrors api.apply: bring
 * the working copy to the target snapshot, push the differing files to the dev
 * theme, then commit a new baseline so history stays linear (and roll-forward
 * works). Never touches the live theme.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };

  const form = await request.formData();
  const sha = String(form.get("sha") ?? "");
  if (!sha) return Response.json({ error: "Missing version id" }, { status: 400 });

  const { themeId, dir } = await ensureReady(ctx);

  try {
    const toPush = await restoreToVersion(dir, sha);
    if (toPush.length) await pushWorkspaceChanges(ctx, themeId, dir, toPush);
    await commitBaseline(dir, `rolled back to ${sha.slice(0, 7)}`);
    await db.appEvent
      .create({ data: { shop: session.shop, level: "info", type: "rollback", message: `Rolled back to ${sha.slice(0, 7)} (${toPush.length} file(s))` } })
      .catch(() => {});
    return Response.json({ restored: toPush.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.appEvent
      .create({ data: { shop: session.shop, level: "error", type: "rollback_error", message } })
      .catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}
