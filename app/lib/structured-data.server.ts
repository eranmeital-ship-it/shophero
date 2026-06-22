import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic JSON-LD structured data for SEO + AI agents (AEO). A Liquid
 * snippet emits Organization, WebSite and (on product pages) Product schema from
 * LIVE theme objects — so it's always accurate, valid, and costs zero AI. We
 * write the snippet and render it in <head> via layout/theme.liquid.
 */

const SNIPPET = `{%- comment -%} ShopHero structured data (JSON-LD) — SEO + AI agents {%- endcomment -%}
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Organization", "name": {{ shop.name | json }}, "url": {{ shop.url | json }}{% if shop.brand.logo %}, "logo": {{ shop.brand.logo | image_url: width: 400 | prepend: "https:" | json }}{% endif %} }
</script>
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebSite", "name": {{ shop.name | json }}, "url": {{ shop.url | json }} }
</script>
{%- if request.page_type == 'product' and product -%}
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Product", "name": {{ product.title | json }}, "description": {{ product.description | strip_html | truncate: 320 | json }}{% if product.featured_image %}, "image": [{{ product.featured_image | image_url: width: 1200 | prepend: "https:" | json }}]{% endif %}, "brand": { "@type": "Brand", "name": {{ product.vendor | json }} }, "offers": { "@type": "Offer", "price": {{ product.price | divided_by: 100.0 | json }}, "priceCurrency": {{ cart.currency.iso_code | json }}, "availability": "{% if product.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}", "url": {{ product.url | prepend: shop.url | json }} } }
</script>
{%- endif -%}
`;

const RENDER_TAG = "{% render 'sh-structured-data' %}";

/** Write the snippet + render it in <head>. Idempotent. */
export async function insertStructuredData(dir: string): Promise<{ ok: boolean; error?: string; alreadyPresent?: boolean }> {
  try {
    await mkdir(path.join(dir, "snippets"), { recursive: true });
    await writeFile(path.join(dir, "snippets", "sh-structured-data.liquid"), SNIPPET, "utf8");
  } catch (e) {
    return { ok: false, error: `Couldn't write the snippet: ${e instanceof Error ? e.message : e}` };
  }
  const layoutPath = path.join(dir, "layout", "theme.liquid");
  let layout: string;
  try {
    layout = await readFile(layoutPath, "utf8");
  } catch {
    return { ok: false, error: "Couldn't open layout/theme.liquid on this theme." };
  }
  if (layout.includes("sh-structured-data")) {
    return { ok: true, alreadyPresent: true };
  }
  if (!/<\/head>/i.test(layout)) {
    return { ok: false, error: "Couldn't find </head> in the theme layout." };
  }
  layout = layout.replace(/<\/head>/i, `  ${RENDER_TAG}\n</head>`);
  try {
    await writeFile(layoutPath, layout, "utf8");
  } catch (e) {
    return { ok: false, error: `Couldn't update the layout: ${e instanceof Error ? e.message : e}` };
  }
  return { ok: true };
}
