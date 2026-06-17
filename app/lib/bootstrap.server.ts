import { ensureWorkingTheme, pullThemeToWorkspace } from "./theme.server";
import {
  workspaceDir,
  isInitialized,
  ensureDir,
  commitBaseline,
} from "./workspace.server";

/**
 * Idempotent setup for a shop: guarantees there's a "Drift Working Copy" theme
 * and a local scratch repo seeded with its files. Safe to call on every request;
 * it only does real work the first time.
 *
 * Returns the working theme id and the workspace dir.
 */
export async function ensureReady(ctx: { shop: string; accessToken: string }) {
  const themeId = await ensureWorkingTheme(ctx);
  const dir = workspaceDir(ctx.shop);

  if (!(await isInitialized(dir))) {
    await ensureDir(dir);
    await pullThemeToWorkspace(ctx, themeId, dir);
    await commitBaseline(dir, "baseline: pulled working theme");
  }

  return { themeId, dir };
}
