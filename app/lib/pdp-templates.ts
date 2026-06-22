/**
 * PDP (product page) blueprints — pre-built, best-practice layouts assembled
 * from the curated section library. Applying one inserts a proven stack of
 * below-the-fold sections into the product template in the right order, in one
 * deterministic ($0) step — so merchants get a high-converting PDP instantly
 * instead of a long agent build.
 *
 * Based on the 2026 PDP playbook (Cartylabs 17-element audit): trust badges,
 * benefit bullets, comparison, social proof, FAQ, risk-reversal guarantee.
 * Above-the-fold / buy-box elements live in the theme's product section, so
 * those are surfaced as a checklist for the merchant to confirm.
 */
export interface PdpBlueprint {
  key: string;
  name: string;
  emoji: string;
  description: string;
  sections: { key: string; variant?: string }[]; // library keys, in display order
}

export const PDP_BLUEPRINTS: PdpBlueprint[] = [
  {
    key: "conversion",
    name: "High-Converting PDP",
    emoji: "🚀",
    description: "The full playbook: trust badges, benefit bullets, an us-vs-others comparison, reviews, FAQ and a money-back guarantee — in the proven order.",
    sections: [
      { key: "sh-trust-bar", variant: "inline" },
      { key: "sh-features", variant: "cards" },
      { key: "sh-comparison", variant: "clean" },
      { key: "sh-testimonials", variant: "cards" },
      { key: "sh-faq", variant: "bordered" },
      { key: "sh-guarantee" },
    ],
  },
  {
    key: "trust",
    name: "Trust-First PDP",
    emoji: "🛡️",
    description: "Lead with credibility: trust badges, guarantee, hard numbers and reviews, then FAQ. Best for newer brands and higher-priced products.",
    sections: [
      { key: "sh-trust-bar", variant: "inline" },
      { key: "sh-guarantee" },
      { key: "sh-stats" },
      { key: "sh-testimonials", variant: "cards" },
      { key: "sh-faq", variant: "bordered" },
    ],
  },
  {
    key: "story",
    name: "Brand-Story PDP",
    emoji: "📖",
    description: "Sell the why: a story block + image, benefits, social proof and FAQ. Best for distinctive or craft/lifestyle brands.",
    sections: [
      { key: "sh-trust-bar", variant: "minimal" },
      { key: "sh-image-text", variant: "standard" },
      { key: "sh-features", variant: "plain" },
      { key: "sh-testimonials", variant: "minimal" },
      { key: "sh-faq", variant: "bordered" },
    ],
  },
];

export const PDP_BLUEPRINT_MAP: Record<string, PdpBlueprint> = Object.fromEntries(PDP_BLUEPRINTS.map((b) => [b.key, b]));

/**
 * The 17-element best-practice checklist. `auto: true` = this blueprint adds it
 * for you; `auto: false` = it lives in your theme's product section / settings,
 * so confirm it yourself (we link the guidance).
 */
export const PDP_CHECKLIST: { label: string; auto: boolean }[] = [
  { label: "Clean product photo first in the gallery (not a lifestyle shot)", auto: false },
  { label: "Keyword-rich product title (not just a brand name)", auto: false },
  { label: "Bold price + strikethrough & savings if discounted", auto: false },
  { label: "Variant pickers as visible swatches/buttons (not dropdowns)", auto: false },
  { label: "Big, full-width “Add to Cart” (not “Buy”/“Submit”)", auto: false },
  { label: "Secondary “Buy Now” / express checkout", auto: false },
  { label: "Star rating + review count above the fold", auto: false },
  { label: "Honest stock urgency when truly low", auto: false },
  { label: "Gallery of 4–8 images including a 15–30s video", auto: false },
  { label: "Benefit bullet list", auto: true },
  { label: "Long-form description (150+ words)", auto: false },
  { label: "Sticky add-to-cart bar on mobile", auto: false },
  { label: "Comparison vs. alternatives", auto: true },
  { label: "Reviews / social proof section", auto: true },
  { label: "FAQ section (also emits FAQ schema)", auto: true },
  { label: "Trust badges (shipping, returns, secure checkout)", auto: true },
  { label: "Money-back guarantee / risk reversal", auto: true },
];
