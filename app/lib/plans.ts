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

/**
 * Customer-facing subscription TIERS — what the marketing site sells. These are
 * orthogonal to PlanName: every tier is "managed" (we supply Claude), so the AI
 * key/usage logic is unchanged. Tiers differ in price, included usage, and which
 * capabilities they unlock (content drip = Pro+, authority/PR = Authority).
 */
export const TIERS = {
  starter: {
    name: "starter" as const,
    label: "ShopHero Starter",
    amount: 49,
    currencyCode: "USD" as const,
    interval: "EVERY_30_DAYS" as const,
    trialDays: 3,
    tagline: "Get your store readable by AI.",
    includedUsage: 15,
    topUp: 50,
    usageCap: 150,
    dailyContent: false,
    productDescriptions: false,
    authority: false,
    features: [
      "AI-Readiness Score™ + ranked gaps",
      "Auto schema on every product (Product, Offer, Review, FAQ, Breadcrumb)",
      "Hosted llms.txt + AI-retrieval feed",
      "1 AI-answer article published per week",
      "AI-crawler analytics — see who's reading you",
      "Speed audit + safe fixes",
      "Approval-first · one-click rollback",
    ],
  },
  pro: {
    name: "pro" as const,
    label: "ShopHero Pro",
    amount: 149,
    currencyCode: "USD" as const,
    interval: "EVERY_30_DAYS" as const,
    trialDays: 3,
    tagline: "Stay ahead, automatically.",
    includedUsage: 50,
    topUp: 50,
    usageCap: 400,
    dailyContent: true,
    productDescriptions: true,
    authority: false,
    features: [
      "Everything in Starter, plus:",
      "A daily AI-answer article (vs 1/week on Starter)",
      "Product description rewrites across your whole catalog",
      "Live re-optimization as your catalog changes",
      "Brand-voice tuning for on-brand content",
      "Priority support",
    ],
  },
  authority: {
    name: "authority" as const,
    label: "ShopHero Authority",
    amount: 399,
    currencyCode: "USD" as const,
    interval: "EVERY_30_DAYS" as const,
    trialDays: 3,
    tagline: "Become the store AI cites everywhere.",
    includedUsage: 80,
    topUp: 50,
    usageCap: 600,
    dailyContent: true,
    productDescriptions: true,
    authority: true,
    features: [
      "Everything in Pro, plus:",
      "Monthly press release to 400+ news sites — Yahoo Finance, Benzinga, MarketWatch & more (via MediaFuse)",
      "High-authority backlinks from top-domain-authority sites",
      "Brand mentions on the sources AI trusts",
      "Dedicated authority manager",
    ],
  },
} as const;

export type TierName = keyof typeof TIERS;
export const TIER_ORDER: TierName[] = ["starter", "pro", "authority"];

/** Build the usage-billing terms string for a tier's Shopify usage line. */
export function tierUsageTerms(t: (typeof TIERS)[TierName]): string {
  return `Includes $${t.includedUsage} of AI usage/month. Beyond that, usage is billed automatically in $${t.topUp} increments, up to a $${t.usageCap}/month limit. The limit is a cap, not a charge — you only pay for what you actually use.`;
}
