/**
 * Curated section library (client-safe metadata). Each entry maps to a vetted,
 * ready-made theme section in section-library.server.ts. The app INSERTS these
 * known-good blocks instead of generating Liquid from scratch — faster, cheaper,
 * reliable, and visually polished.
 */
export interface SectionMeta {
  key: string; // matches the server def + the section file/type name
  name: string;
  emoji: string;
  category: string;
  description: string;
  variants?: { value: string; label: string }[]; // optional design options
}

export const SECTION_LIBRARY: SectionMeta[] = [
  { key: "sh-trust-bar", name: "Trust Bar", emoji: "🛡️", category: "Trust", description: "A row of trust badges (free shipping, secure checkout, easy returns, guarantee).", variants: [{ value: "inline", label: "Inline" }, { value: "cards", label: "Cards" }, { value: "minimal", label: "Minimal" }] },
  { key: "sh-faq", name: "FAQ Accordion", emoji: "❓", category: "Content", description: "Expandable frequently-asked-questions to handle objections and boost SEO/AEO." },
  { key: "sh-features", name: "Why Choose Us", emoji: "✨", category: "Conversion", description: "A 3-up benefits grid with icons — sell the value at a glance.", variants: [{ value: "cards", label: "Cards" }, { value: "plain", label: "Plain" }] },
  { key: "sh-promo", name: "Promo Banner", emoji: "📣", category: "Marketing", description: "A bold full-width banner with a headline and call-to-action button.", variants: [{ value: "gradient", label: "Gradient" }, { value: "solid", label: "Solid" }] },
  { key: "sh-comparison", name: "Comparison Table", emoji: "📊", category: "Conversion", description: "An \"us vs. the others\" table that makes your advantages obvious." },
  { key: "sh-testimonials", name: "Testimonials", emoji: "💬", category: "Trust", description: "Customer quotes in clean cards to build social proof.", variants: [{ value: "cards", label: "Cards" }, { value: "minimal", label: "Minimal" }] },
  { key: "sh-image-text", name: "Image + Text", emoji: "🖼️", category: "Content", description: "A two-column image-and-text block to tell your story or feature a product." },
  { key: "sh-about", name: "About / Story", emoji: "📖", category: "Content", description: "A brand-story block with a headline, paragraph and key stats." },
];

// Pages a section can be added to → template file name (Online Store 2.0 JSON).
export const SECTION_TARGETS: { label: string; template: string }[] = [
  { label: "Home page", template: "index" },
  { label: "Product pages", template: "product" },
  { label: "Collection pages", template: "collection" },
  { label: "Cart page", template: "cart" },
];
