import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { changedFiles, commitFiles, commitCount } from "../lib/workspace.server";
import { pushWorkspaceChanges, renameTheme } from "../lib/theme.server";

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

  // Label the restore point with WHAT changed: prefer the agent's plain-English
  // summary (sent by the client), else fall back to the changed file names.
  const form = await request.formData().catch(() => null);
  const summary = String(form?.get("summary") ?? "").trim();
  const fileList = pending.length <= 4 ? pending.join(", ") : `${pending.slice(0, 3).join(", ")} +${pending.length - 3} more`;
  const label = (summary || `Applied ${fileList}`).slice(0, 200);

  // Push each file independently (JSON validated locally first). One bad file —
  // e.g. an invalid section-group JSON the agent generated → "missing required key
  // 'name'" — no longer 500s the app or blocks the good files. We commit only what
  // applied and leave failures staged so the merchant can discard/retry them.
  const { applied: appliedKeys, failed } = await pushWorkspaceChanges(ctx, themeId, dir, pending);
  const remaining = failed.map((f) => f.key);
  const failMsg = failed.length
    ? `${failed.length} file(s) couldn't be applied — ${failed.map((f) => `${f.key}: ${f.reason}`).join("; ")}`
    : undefined;

  // Nothing applied → leave everything staged, report why.
  if (appliedKeys.length === 0) {
    return Response.json({ applied: 0, total: pending.length, error: failMsg ?? "No changes were applied.", pending });
  }

  // Commit only the successfully-applied files (failures stay pending).
  await commitFiles(dir, appliedKeys, label);

  // Stamp the new version + timestamp onto the theme name so the merchant can tell
  // the latest edited version from the original duplicate in their Themes list.
  // Skipped when a custom DRIFT_THEME_NAME is pinned (we leave that name alone).
  let version: string | undefined;
  if (!process.env.DRIFT_THEME_NAME) {
    try {
      const n = Math.max(1, (await commitCount(dir)) - 1); // baseline = v1.0
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      version = `v1.${n}`;
      await renameTheme(ctx, themeId, `ShopHero | ${version} · ${stamp} UTC`);
    } catch {
      /* non-fatal — the version name is cosmetic */
    }
  }

  return Response.json({ applied: appliedKeys.length, total: pending.length, version, error: failMsg, pending: remaining });
}
