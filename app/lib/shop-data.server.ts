import { rm } from "node:fs/promises";
import db from "../db.server";
import { workspaceDir } from "./workspace.server";

/**
 * Erase everything ShopHero holds for a shop. Used by the mandatory `shop/redact`
 * compliance webhook (and safe to call on full uninstall cleanup). Deletes every
 * shop-scoped table plus the local theme workspace. Best-effort per resource so
 * one failure doesn't abort the rest.
 */
export async function purgeShopData(shop: string): Promise<void> {
  await Promise.allSettled([
    db.session.deleteMany({ where: { shop } }),
    db.usageEvent.deleteMany({ where: { shop } }),
    db.shopProfile.deleteMany({ where: { shop } }),
    db.storeReport.deleteMany({ where: { shop } }),
    db.contentPlan.deleteMany({ where: { shop } }),
    db.brainDoc.deleteMany({ where: { shop } }),
    db.appEvent.deleteMany({ where: { shop } }),
    db.job.deleteMany({ where: { shop } }),
  ]);
  // Remove the local theme workspace (a git repo of the pulled theme).
  try {
    await rm(workspaceDir(shop), { recursive: true, force: true });
  } catch {
    /* best-effort — the workspace may not exist */
  }
}
