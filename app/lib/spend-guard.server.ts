import db from "../db.server";

/**
 * Spend defense gates — protect both you (the operator) and merchants from
 * runaway AI cost. Checked before every managed turn. All caps are USD and
 * env-tunable; set any to 0 to disable that gate.
 *
 *   DRIFT_CAP_SHOP_DAILY_USD    per-shop spend per day      (default 25)
 *   DRIFT_CAP_SHOP_MONTHLY_USD  per-shop spend per month    (default 250)
 *   DRIFT_CAP_GLOBAL_DAILY_USD  ALL managed spend per day   (default 200) — your backstop
 *
 * Metric: managed shops are measured by billed $ (what they pay); BYOK shops by
 * raw API cost (their own key/money). The global cap covers managed only, since
 * that's what draws on your Anthropic credits.
 */
function num(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

const CAPS = {
  shopDaily: num("DRIFT_CAP_SHOP_DAILY_USD", 25),
  shopMonthly: num("DRIFT_CAP_SHOP_MONTHLY_USD", 250),
  globalDaily: num("DRIFT_CAP_GLOBAL_DAILY_USD", 200),
};

async function shopSpend(shop: string, since: Date, byok: boolean): Promise<number> {
  const agg = await db.usageEvent.aggregate({
    where: { shop, createdAt: { gte: since } },
    _sum: { billedUsd: true, costUsd: true },
  });
  return (byok ? agg._sum.costUsd : agg._sum.billedUsd) ?? 0;
}

export async function checkSpend(
  shop: string,
  plan: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const byok = plan === "byok";

  if (CAPS.shopDaily > 0 && (await shopSpend(shop, dayStart, byok)) >= CAPS.shopDaily) {
    return { allowed: false, reason: `Daily usage limit reached ($${CAPS.shopDaily}). It resets at midnight.` };
  }
  if (CAPS.shopMonthly > 0 && (await shopSpend(shop, monthStart, byok)) >= CAPS.shopMonthly) {
    return { allowed: false, reason: `Monthly usage limit reached ($${CAPS.shopMonthly}).` };
  }
  if (!byok && CAPS.globalDaily > 0) {
    const agg = await db.usageEvent.aggregate({
      where: { plan: { not: "byok" }, createdAt: { gte: dayStart } },
      _sum: { costUsd: true },
    });
    if ((agg._sum.costUsd ?? 0) >= CAPS.globalDaily) {
      return { allowed: false, reason: "ShopHero is at capacity right now. Please try again shortly." };
    }
  }
  return { allowed: true };
}
