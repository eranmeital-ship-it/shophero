/**
 * Plan definitions — pure data, safe to import from both client and server.
 *
 * Lives outside *.server.ts so route components (e.g. app.pricing.tsx) can read
 * labels/prices for display. The Shopify billing calls that consume these live
 * in billing.server.ts, which re-exports PLANS for server-side convenience.
 *
 * Two plans:
 *  - "managed"  : we supply the Anthropic key, merchant pays more per month
 *  - "byok"     : merchant supplies their own key, flat fee only
 *
 * Prices are placeholders — update before going live.
 */
export const PLANS = {
  managed: {
    name: "managed" as const,
    label: "Managed AI",
    amount: 49,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS" as const,
    trialDays: 0,
    description: "Claude AI included — no API key needed. $15 of usage built in each month, then automatic $50 top-ups.",
    // Usage-based billing layered on top of the monthly fee:
    includedUsage: 15, // $ of AI usage covered by the $49 each cycle
    topUp: 50, // $ auto top-up increment once the included usage is spent
    usageCap: 300, // $ usage LIMIT per cycle — a cap, NOT a charge — before re-approval
    usageTerms:
      "Includes $15 of AI usage/month. Beyond that, usage is billed automatically in $50 increments, up to a $300/month limit. $300 is a cap, not a charge — you only pay for what you actually use.",
  },
  byok: {
    name: "byok" as const,
    label: "Bring Your Own Key",
    amount: 19,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS" as const,
    trialDays: 0,
    description: "Flat monthly fee. Connect your own Anthropic API key.",
  },
} as const;

export type PlanName = keyof typeof PLANS;
