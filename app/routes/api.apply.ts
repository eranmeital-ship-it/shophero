import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { changedFiles, commitBaseline } from "../lib/workspace.server";
import { pushWorkspaceChanges } from "../lib/theme.server";

/**
 * The approval gate. Only when the merchant clicks "Apply" do the agent's local
 * edits get pushed to the dev (working) theme. After a successful push we commit
 * a new baseline so the next turn's diff starts clean. There is no publish path:
 * changes never reach the live theme from Drift.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };

  const { themeId, dir } = await ensureReady(ctx);

  const pending = await changedFiles(dir);
  if (pending.length === 0) {
    return Response.json({ applied: 0, message: "Nothing to apply" });
  }

  const applied = await pushWorkspaceChanges(ctx, themeId, dir, pending);
  await commitBaseline(dir, `applied ${applied} file(s) to dev theme`);

  return Response.json({ applied });
}
