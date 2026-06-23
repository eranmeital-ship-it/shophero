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
  { key: "sh-faq", name: "FAQ Accordion", emoji: "❓", category: "Content", description: "Expandable frequently-asked-questions to handle objections and boost SEO/AEO (emits FAQ rich-result schema automatically).", variants: [{ value: "bordered", label: "Bordered" }, { value: "cards", label: "Cards" }] },
  { key: "sh-features", name: "Why Choose Us", emoji: "✨", category: "Conversion", description: "A 3-up benefits grid with icons — sell the value at a glance.", variants: [{ value: "cards", label: "Cards" }, { value: "plain", label: "Plain" }] },
  { key: "sh-promo", name: "Promo Banner", emoji: "📣", category: "Marketing", description: "A bold full-width banner with a headline and call-to-action button.", variants: [{ value: "gradient", label: "Gradient" }, { value: "solid", label: "Solid" }] },
  { key: "sh-comparison", name: "Comparison Table", emoji: "📊", category: "Conversion", description: "An \"us vs. the others\" table that makes your advantages obvious.", variants: [{ value: "clean", label: "Clean" }, { value: "card", label: "Card" }] },
  { key: "sh-testimonials", name: "Testimonials", emoji: "💬", category: "Trust", description: "Customer quotes in clean cards to build social proof.", variants: [{ value: "cards", label: "Cards" }, { value: "minimal", label: "Minimal" }] },
  { key: "sh-image-text", name: "Image + Text", emoji: "🖼️", category: "Content", description: "A two-column image-and-text block to tell your story or feature a product.", variants: [{ value: "standard", label: "Standard" }, { value: "framed", label: "Framed" }] },
  { key: "sh-about", name: "About / Story", emoji: "📖", category: "Content", description: "A brand-story block with a headline, paragraph and key stats.", variants: [{ value: "centered", label: "Centered" }, { value: "boxed", label: "Boxed" }] },
  { key: "sh-newsletter", name: "Newsletter Signup", emoji: "✉️", category: "Marketing", description: "An email-capture form to grow your list (saves subscribers to Shopify)." },
  { key: "sh-guarantee", name: "Guarantee", emoji: "✅", category: "Trust", description: "A reassuring satisfaction / money-back guarantee callout." },
  { key: "sh-stats", name: "Stats Bar", emoji: "📈", category: "Trust", description: "Big numbers that build credibility — customers, rating, years in business." },
  { key: "sh-logos", name: "Logo Bar", emoji: "🏷️", category: "Trust", description: "An \"as seen in\" strip of brand or press logos." },
  { key: "sh-gallery", name: "Image Gallery", emoji: "🖼️", category: "Content", description: "A responsive grid of images you pick in the editor — lookbooks, product shots, social proof.", variants: [] },
  { key: "sh-video", name: "Video", emoji: "🎬", category: "Content", description: "An embedded YouTube or Vimeo video with a heading and subtext." },
  { key: "sh-countdown", name: "Countdown Timer", emoji: "⏳", category: "Marketing", description: "A live countdown to a sale or launch deadline to drive urgency." },
  { key: "sh-richtext", name: "Rich Text + CTA", emoji: "📝", category: "Content", description: "A flexible heading, paragraph and button block — announcements, brand story, or promos." },
];

// Pages a section can be added to → template file name (Online Store 2.0 JSON).
export const SECTION_TARGETS: { label: string; template: string }[] = [
  { label: "Home page", template: "index" },
  { label: "Product pages", template: "product" },
  { label: "Collection pages", template: "collection" },
  { label: "Cart page", template: "cart" },
];
