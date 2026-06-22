import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { PLANS, type PlanName } from "./plans";
import db from "../db.server";

// Re-export so existing server-side imports of PLANS/PlanName from this module
// keep working. The definitions live in ./plans (client-safe).
export { PLANS };
export type { PlanName };

// Shopify billing runs in TEST mode (no real money) unless explicitly disabled.
// Set DRIFT_BILLING_TEST=false in production.
const BILLING_TEST = process.env.DRIFT_BILLING_TEST !== "false";

/** The pilot/dev plan from DRIFT_DEV_PLAN. Forgiving: any non-empty value enables
 * the pilot (→ "managed"), except an explicit "byok". So "yes"/"true"/"1" don't
 * silently fall through to "no plan" and dead-end every task. */
export function devPlanOverride(): PlanName | null {
  const d = process.env.DRIFT_DEV_PLAN?.trim().toLowerCase();
  if (!d) return null;
  return d === "byok" ? "byok" : "managed";
}

/** Dev bypass active → no real Shopify subscription exists, so skip metering. */
export function billingBypassed(): boolean {
  return devPlanOverride() !== null;
}

/**
 * Check which active plan a shop has, or null if none.
 * Uses Shopify's billing API via the admin context.
 */
export async function getActivePlan(
  admin: AdminApiContext
): Promise<PlanName | null> {
  // Dev bypass: development apps can't use the Billing API
  // ("Apps without a public distribution cannot use the Billing API").
  // Set DRIFT_DEV_PLAN=managed|byok in .env to skip the live billing check
  // locally. Leave unset in production so real subscriptions are enforced.
  const devPlan = devPlanOverride();
  if (devPlan) return devPlan;

  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
        }
      }
    }
  `);
  const { data } = await response.json();
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const active = subs.find((s: { status: string }) => s.status === "ACTIVE");
  if (!active) return null;
  if (active.name === PLANS.managed.label) return "managed";
  if (active.name === PLANS.byok.label) return "byok";
  return null;
}

/**
 * Create a Shopify billing subscription and return the confirmation URL.
 * Redirect the merchant to this URL to approve.
 */
export async function createSubscription(
  admin: AdminApiContext,
  plan: PlanName,
  returnUrl: string
): Promise<string> {
  const p = PLANS[plan];
  // Optional usage fields exist only on the managed plan.
  const u = p as { usageCap?: number; usageTerms?: string };

  const lineItems: unknown[] = [
    {
      plan: {
        appRecurringPricingDetails: {
          price: { amount: p.amount, currencyCode: p.currencyCode },
          interval: p.interval,
        },
      },
    },
  ];
  // Managed AI: add a metered usage line capped at the monthly limit. The
  // merchant approves this cap ONCE; we then auto-bill $30 top-ups under it.
  if (u.usageCap && u.usageTerms) {
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          cappedAmount: { amount: u.usageCap, currencyCode: p.currencyCode },
          terms: u.usageTerms,
        },
      },
    });
  }

  const response = await admin.graphql(
    `mutation CreateSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean!) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
      ) {
        appSubscription { id status }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      variables: { name: p.label, returnUrl, trialDays: p.trialDays, test: BILLING_TEST, lineItems },
    }
  );
  const { data } = await response.json();
  const errors = data?.appSubscriptionCreate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e: {message: string}) => e.message).join(", "));
  return data.appSubscriptionCreate.confirmationUrl;
}

// ── Usage metering + auto top-ups ─────────────────────────────────────────────

export interface ManagedSubscription {
  usageLineItemId: string;
  balanceUsed: number; // $ of usage already billed this cycle (sum of top-ups)
  cappedAmount: number; // $ usage limit this cycle
  currentPeriodEnd: string; // ISO; cycle ends here
}

/** Fetch the active Managed AI subscription's usage line + cap + period. */
export async function getManagedSubscription(admin: AdminApiContext): Promise<ManagedSubscription | null> {
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
          currentPeriodEnd
          lineItems {
            id
            plan {
              pricingDetails {
                __typename
                ... on AppUsagePricing {
                  balanceUsed { amount }
                  cappedAmount { amount }
                }
              }
            }
          }
        }
      }
    }
  `);
  const { data } = await response.json();
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const active = subs.find(
    (s: { status: string; name: string }) => s.status === "ACTIVE" && s.name === PLANS.managed.label,
  );
  if (!active) return null;
  const usageLine = (active.lineItems ?? []).find(
    (li: { plan?: { pricingDetails?: { __typename?: string } } }) => li.plan?.pricingDetails?.__typename === "AppUsagePricing",
  );
  if (!usageLine) return null;
  const pd = usageLine.plan.pricingDetails;
  return {
    usageLineItemId: usageLine.id,
    balanceUsed: Number(pd.balanceUsed?.amount ?? 0),
    cappedAmount: Number(pd.cappedAmount?.amount ?? 0),
    currentPeriodEnd: active.currentPeriodEnd,
  };
}

/** Bill a usage charge against the subscription's usage line. Returns true on success. */
export async function recordUsageCharge(
  admin: AdminApiContext,
  usageLineItemId: string,
  amount: number,
  description: string,
): Promise<boolean> {
  const response = await admin.graphql(
    `mutation($sub: ID!, $price: MoneyInput!, $desc: String!) {
      appUsageRecordCreate(subscriptionLineItemId: $sub, price: $price, description: $desc) {
        appUsageRecord { id }
        userErrors { field message }
      }
    }`,
    { variables: { sub: usageLineItemId, price: { amount, currencyCode: "USD" }, desc: description } },
  );
  const { data } = await response.json();
  const errors = data?.appUsageRecordCreate?.userErrors ?? [];
  if (errors.length) {
    console.warn("[billing] usage record failed:", errors.map((e: { message: string }) => e.message).join(", "));
    return false;
  }
  return true;
}

/** Raise the usage cap (+one limit's worth) → returns a confirmation URL to approve. */
export async function raiseUsageCap(admin: AdminApiContext, returnUrl: string): Promise<string | null> {
  const sub = await getManagedSubscription(admin);
  if (!sub) return null;
  const newCap = sub.cappedAmount + (PLANS.managed.usageCap ?? 150);
  const response = await admin.graphql(
    `mutation($id: ID!, $cap: MoneyInput!, $returnUrl: URL!) {
      appSubscriptionLineItemUpdate(id: $id, cappedAmount: $cap) {
        confirmationUrl
        userErrors { field message }
      }
    }`,
    { variables: { id: sub.usageLineItemId, cap: { amount: newCap, currencyCode: "USD" }, returnUrl } },
  );
  const { data } = await response.json();
  const errors = data?.appSubscriptionLineItemUpdate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e: { message: string }) => e.message).join(", "));
  return data.appSubscriptionLineItemUpdate.confirmationUrl ?? null;
}

export interface UsageSettlement {
  consumed: number; // $ of usage consumed this cycle (billed value)
  included: number; // $ included in the monthly fee
  balanceUsed: number; // $ of top-ups billed this cycle
  cap: number; // $ usage limit this cycle
  covered: number; // included + balanceUsed
  needsCapRaise: boolean; // hit the limit and couldn't auto top up
}

export interface CycleUsage {
  included: number; // $ included in the monthly fee
  topUp: number; // $ per top-up block
  cap: number; // $ usage limit this cycle
  maxBlocks: number; // number of $topUp blocks that fit under the cap
  consumed: number; // $ of usage consumed this cycle
  blocksBilled: number; // how many $topUp top-ups have been billed
  cycleEnd: string | null; // ISO; null if no live subscription
  live: boolean; // true when backed by a real Shopify subscription
}

/**
 * Build the per-cycle usage breakdown for the Usage & Billing UI: how much of the
 * included $15 is spent, and which $50 top-up blocks are billed vs. upcoming.
 * Works in dev (no subscription) by simulating the blocks from consumption.
 */
export async function getCycleUsage(admin: AdminApiContext, shop: string): Promise<CycleUsage> {
  const included = PLANS.managed.includedUsage ?? 0;
  const topUp = PLANS.managed.topUp ?? 50;
  const cap = PLANS.managed.usageCap ?? 150;
  const maxBlocks = Math.max(1, Math.floor(cap / topUp));

  let cycleEnd: string | null = null;
  let balanceUsed: number | null = null;
  let live = false;
  if (!billingBypassed()) {
    const sub = await getManagedSubscription(admin);
    if (sub) {
      live = true;
      cycleEnd = sub.currentPeriodEnd;
      balanceUsed = sub.balanceUsed;
    }
  }

  const now = new Date();
  const cycleStart = cycleEnd
    ? new Date(new Date(cycleEnd).getTime() - 30 * 864e5)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const agg = await db.usageEvent.aggregate({
    where: { shop, plan: "managed", createdAt: { gte: cycleStart } },
    _sum: { billedUsd: true },
  });
  const consumed = agg._sum.billedUsd ?? 0;

  // Live: trust Shopify's billed balance. Dev/no-sub: simulate the same ">=" rule
  // settleUsage uses (a block is billed the moment consumption reaches its start).
  const blocksBilled =
    balanceUsed != null
      ? Math.round(balanceUsed / topUp)
      : consumed < included
        ? 0
        : Math.min(maxBlocks, Math.floor((consumed - included) / topUp) + 1);

  return { included, topUp, cap, maxBlocks, consumed, blocksBilled, cycleEnd, live };
}

// In-process guard so two concurrent turns don't double-charge top-ups.
const settling = new Set<string>();

/**
 * Reconcile a shop's metered usage: auto-bill $30 top-ups (under the cap) so the
 * merchant's covered credit keeps up with what they've consumed this cycle.
 * The $49 fee covers the first $15; top-ups cover the rest, up to the $150 cap.
 */
export async function settleUsage(admin: AdminApiContext, shop: string): Promise<UsageSettlement | null> {
  if (billingBypassed() || settling.has(shop)) return null;
  settling.add(shop);
  try {
    const sub = await getManagedSubscription(admin);
    if (!sub) return null;

    const cycleStart = new Date(new Date(sub.currentPeriodEnd).getTime() - 30 * 864e5);
    const agg = await db.usageEvent.aggregate({
      where: { shop, plan: "managed", createdAt: { gte: cycleStart } },
      _sum: { billedUsd: true },
    });
    const consumed = agg._sum.billedUsd ?? 0;
    const included = PLANS.managed.includedUsage ?? 0;
    const topUp = PLANS.managed.topUp ?? 30;

    let balanceUsed = sub.balanceUsed;
    // Keep the merchant on POSITIVE credit: the moment consumption catches up to
    // their covered amount, bill another $topUp so coverage stays ahead. (>= not
    // > — we top up at zero credit, never wait for it to go negative.)
    while (consumed >= included + balanceUsed && balanceUsed + topUp <= sub.cappedAmount) {
      const ok = await recordUsageCharge(admin, sub.usageLineItemId, topUp, `ShopHero AI usage top-up ($${topUp})`);
      if (!ok) break;
      balanceUsed += topUp;
    }

    const covered = included + balanceUsed;
    // needsCapRaise: credit is no longer positive and we can't top up (cap reached).
    return { consumed, included, balanceUsed, cap: sub.cappedAmount, covered, needsCapRaise: consumed >= covered };
  } catch (e) {
    console.warn("[billing] settleUsage failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    settling.delete(shop);
  }
}
