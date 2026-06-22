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
}

export const SECTION_LIBRARY: SectionMeta[] = [
  { key: "sh-trust-bar", name: "Trust Bar", emoji: "🛡️", category: "Trust", description: "A row of trust badges (free shipping, secure checkout, easy returns, guarantee)." },
  { key: "sh-faq", name: "FAQ Accordion", emoji: "❓", category: "Content", description: "Expandable frequently-asked-questions to handle objections and boost SEO/AEO." },
  { key: "sh-features", name: "Why Choose Us", emoji: "✨", category: "Conversion", description: "A 3-up benefits grid with icons — sell the value at a glance." },
  { key: "sh-promo", name: "Promo Banner", emoji: "📣", category: "Marketing", description: "A bold full-width banner with a headline and call-to-action button." },
];

// Pages a section can be added to → template file name (Online Store 2.0 JSON).
export const SECTION_TARGETS: { label: string; template: string }[] = [
  { label: "Home page", template: "index" },
  { label: "Product pages", template: "product" },
  { label: "Collection pages", template: "collection" },
  { label: "Cart page", template: "cart" },
];
