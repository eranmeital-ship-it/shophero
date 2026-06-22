import db from "../db.server";

/**
 * App-owned per-shop settings (BYOK key, theme token, stock key/provider, plan).
 * Kept OFF the Shopify-managed Session row so the merchant's config survives
 * uninstall/reinstall, reauth and token-exchange churn, and so reads are
 * deterministic (exactly one row per shop, not whichever Session row wins).
 */
export type ShopSettingsPatch = Partial<{
  plan: string | null;
  anthropicApiKey: string | null;
  themeToken: string | null;
  stockKey: string | null;
  stockProvider: string | null;
}>;

export function getShopSettings(shop: string) {
  return db.shopSettings.findUnique({ where: { shop } });
}

export async function setShopSettings(shop: string, patch: ShopSettingsPatch): Promise<void> {
  await db.shopSettings.upsert({ where: { shop }, create: { shop, ...patch }, update: patch });
}
