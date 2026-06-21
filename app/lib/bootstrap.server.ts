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

/**
 * First-time theme setup is slow (it copies the whole theme at Shopify's rate
 * limit), so we run it in the BACKGROUND and let the UI poll. Holding the request
 * for a minute+ risks an embedded-app timeout and a reload loop.
 */
type BootstrapState = { status: "running" | "error"; error?: string; startedAt: number };
const bootstraps = new Map<string, BootstrapState>();

export function bootstrapState(shop: string): BootstrapState | undefined {
  return bootstraps.get(shop);
}

/** True when the working theme + local workspace are already set up (fast check). */
export async function isReady(shop: string): Promise<boolean> {
  return isInitialized(workspaceDir(shop));
}

/** Kick off (or no-op if already running) the background theme bootstrap. */
export function startBootstrap(ctx: { shop: string; accessToken: string }): void {
  const cur = bootstraps.get(ctx.shop);
  if (cur?.status === "running") return;
  bootstraps.set(ctx.shop, { status: "running", startedAt: Date.now() });
  ensureReady(ctx)
    .then(() => bootstraps.delete(ctx.shop))
    .catch((e) => bootstraps.set(ctx.shop, { status: "error", error: e instanceof Error ? e.message : String(e), startedAt: Date.now() }));
}
