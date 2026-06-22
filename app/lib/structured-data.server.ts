import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic JSON-LD structured data for SEO + AI agents (AEO). One Liquid
 * snippet emits the full set of schema we can derive from LIVE theme objects —
 * so it's always accurate, valid, and costs zero AI:
 *   - Organization  (logo, description, sameAs social links)            — every page
 *   - WebSite       (+ SearchAction sitelinks search box)               — every page
 *   - BreadcrumbList                                                    — product / collection / article
 *   - Product       (image, brand, sku, gtin, aggregateRating, offers)  — product pages
 *   - CollectionPage + ItemList                                         — collection pages
 *   - BlogPosting   (author, publisher, image, dates)                   — article pages
 *   - WebPage                                                           — standard pages
 * We write the snippet and render it in <head> via layout/theme.liquid. The FAQ
 * section emits its own FAQPage schema, so FAQs are covered wherever they appear.
 */

const SNIPPET = `{%- comment -%} ShopHero structured data (JSON-LD) — SEO + AI agents (AEO) {%- endcomment -%}
{%- liquid
  assign sh_social = ''
  if settings.social_facebook_link != blank
    assign sh_social = sh_social | append: settings.social_facebook_link | append: '||'
  endif
  if settings.social_instagram_link != blank
    assign sh_social = sh_social | append: settings.social_instagram_link | append: '||'
  endif
  if settings.social_twitter_link != blank
    assign sh_social = sh_social | append: settings.social_twitter_link | append: '||'
  endif
  if settings.social_youtube_link != blank
    assign sh_social = sh_social | append: settings.social_youtube_link | append: '||'
  endif
  if settings.social_tiktok_link != blank
    assign sh_social = sh_social | append: settings.social_tiktok_link | append: '||'
  endif
  if settings.social_pinterest_link != blank
    assign sh_social = sh_social | append: settings.social_pinterest_link | append: '||'
  endif
  if settings.social_linkedin_link != blank
    assign sh_social = sh_social | append: settings.social_linkedin_link | append: '||'
  endif
-%}
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"Organization","name":{{ shop.name | json }},"url":{{ shop.url | json }}
{%- if shop.brand.logo %},"logo":{{ shop.brand.logo | image_url: width: 400 | prepend: "https:" | json }}{%- endif -%}
{%- if shop.brand.short_description != blank %},"description":{{ shop.brand.short_description | json }}{%- endif -%}
{%- if sh_social != blank %},"sameAs":{{ sh_social | split: '||' | json }}{%- endif -%} }
</script>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"WebSite","name":{{ shop.name | json }},"url":{{ shop.url | json }},"potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"{{ shop.url }}/search?q={search_term_string}"},"query-input":"required name=search_term_string"} }
</script>
{%- if request.page_type == 'product' and product -%}
{%- assign sh_col = product.collections.first -%}
{%- assign sh_var = product.selected_or_first_available_variant -%}
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":{{ shop.url | json }}}{%- if sh_col -%},{"@type":"ListItem","position":2,"name":{{ sh_col.title | json }},"item":{{ sh_col.url | prepend: shop.url | json }}}{%- endif -%},{"@type":"ListItem","position":{% if sh_col %}3{% else %}2{% endif %},"name":{{ product.title | json }}}] }
</script>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"Product","name":{{ product.title | json }},"description":{{ product.description | strip_html | truncate: 320 | json }},"url":{{ product.url | prepend: shop.url | json }}
{%- if product.featured_image %},"image":[{{ product.featured_image | image_url: width: 1200 | prepend: "https:" | json }}]{%- endif -%}
{%- if product.vendor != blank %},"brand":{"@type":"Brand","name":{{ product.vendor | json }}}{%- endif -%}
{%- if sh_var.sku != blank %},"sku":{{ sh_var.sku | json }}{%- endif -%}
{%- if sh_var.barcode != blank %},"gtin":{{ sh_var.barcode | json }}{%- endif -%}
{%- if product.metafields.reviews.rating.value != blank and product.metafields.reviews.rating_count.value > 0 -%},"aggregateRating":{"@type":"AggregateRating","ratingValue":{{ product.metafields.reviews.rating.value | json }},"reviewCount":{{ product.metafields.reviews.rating_count.value | json }}{%- if product.metafields.reviews.rating.value.scale_max %},"bestRating":{{ product.metafields.reviews.rating.value.scale_max | json }}{%- endif -%}}{%- endif -%},"offers":{%- if product.variants.size > 1 -%}{"@type":"AggregateOffer","priceCurrency":{{ cart.currency.iso_code | json }},"lowPrice":{{ product.price_min | divided_by: 100.0 | json }},"highPrice":{{ product.price_max | divided_by: 100.0 | json }},"offerCount":{{ product.variants.size | json }},"availability":"{% if product.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}","url":{{ product.url | prepend: shop.url | json }}}{%- else -%}{"@type":"Offer","price":{{ product.price | divided_by: 100.0 | json }},"priceCurrency":{{ cart.currency.iso_code | json }},"availability":"{% if product.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}","url":{{ product.url | prepend: shop.url | json }}}{%- endif -%} }
</script>
{%- endif -%}
{%- if request.page_type == 'collection' and collection -%}
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":{{ shop.url | json }}},{"@type":"ListItem","position":2,"name":{{ collection.title | json }},"item":{{ collection.url | prepend: shop.url | json }}}] }
</script>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"CollectionPage","name":{{ collection.title | json }},"url":{{ collection.url | prepend: shop.url | json }}{%- if collection.description != blank %},"description":{{ collection.description | strip_html | truncate: 320 | json }}{%- endif -%},"mainEntity":{"@type":"ItemList","numberOfItems":{{ collection.products_count | json }},"itemListElement":[{%- for p in collection.products limit: 12 -%}{%- unless forloop.first %},{%- endunless -%}{"@type":"ListItem","position":{{ forloop.index }},"name":{{ p.title | json }},"url":{{ p.url | prepend: shop.url | json }}}{%- endfor -%}]} }
</script>
{%- endif -%}
{%- if request.page_type == 'article' and article -%}
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":{{ shop.url | json }}},{"@type":"ListItem","position":2,"name":{{ blog.title | json }},"item":{{ blog.url | prepend: shop.url | json }}},{"@type":"ListItem","position":3,"name":{{ article.title | json }}}] }
</script>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"BlogPosting","headline":{{ article.title | json }},"url":{{ article.url | prepend: shop.url | json }},"datePublished":{{ article.published_at | date: '%Y-%m-%dT%H:%M:%S%z' | json }}{%- if article.image %},"image":[{{ article.image | image_url: width: 1200 | prepend: "https:" | json }}]{%- endif -%}{%- if article.author != blank %},"author":{"@type":"Person","name":{{ article.author | json }}}{%- endif -%},"publisher":{"@type":"Organization","name":{{ shop.name | json }}{%- if shop.brand.logo %},"logo":{"@type":"ImageObject","url":{{ shop.brand.logo | image_url: width: 400 | prepend: "https:" | json }}}{%- endif -%}}{%- if article.excerpt_or_content != blank %},"description":{{ article.excerpt_or_content | strip_html | truncate: 320 | json }}{%- endif -%} }
</script>
{%- endif -%}
{%- if request.page_type == 'page' and page -%}
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"WebPage","name":{{ page.title | json }},"url":{{ page.url | prepend: shop.url | json }}{%- if page.content != blank %},"description":{{ page.content | strip_html | truncate: 320 | json }}{%- endif -%} }
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
