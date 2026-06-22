import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Curated, theme-matched section library. Every section:
 *  - carries a `color_scheme` setting and renders inside the theme's own color
 *    scheme class, so it inherits the merchant's REAL background/text/button
 *    colors (with safe fallbacks for non-Dawn themes),
 *  - uses `font-family: inherit` so it picks up the theme's fonts,
 *  - is laid out with premium spacing/rounding/shadows so it looks designed,
 *  - and many offer `variant` design options.
 * Inserting one is deterministic (no AI), so it's free, instant, and always valid.
 */

interface SectionDef {
  liquid: string;
  settings: Record<string, unknown>;
}

// Shared CSS base injected into every section: theme-color binding + buttons.
const BASE = `
  .sh-sec{background:rgb(var(--color-background,255 255 255));color:rgb(var(--color-foreground,22 24 28));font-family:inherit}
  .sh-sec *{box-sizing:border-box}
  .sh-sec h2{font-family:inherit;letter-spacing:-.01em}
  .sh-btn{display:inline-block;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;background:rgb(var(--color-button,10 132 255));color:rgb(var(--color-button-text,255 255 255));transition:opacity .15s}
  .sh-btn:hover{opacity:.88}
  .sh-muted{color:rgb(var(--color-foreground,22 24 28));opacity:.72}
  .sh-card{background:rgb(var(--color-foreground,22 24 28)/.04);border:1px solid rgb(var(--color-foreground,22 24 28)/.08);border-radius:16px}
`;
const SCHEME = `{"type":"color_scheme","id":"color_scheme","label":"Color scheme","default":"scheme-1"}`;

// ── Trust Bar (variants: inline / cards / minimal) ────────────────────────────
const TRUST_BAR = `{%- style -%}${BASE}
  .sh-trust{padding:22px 16px}
  .sh-trust__row{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-around}
  .sh-trust__item{display:flex;align-items:center;gap:11px;font-size:14px}
  .sh-trust__item .ic{font-size:25px;line-height:1}
  .sh-trust__item strong{display:block;font-weight:700}
  .sh-trust__item small{opacity:.7}
  .sh-trust--cards .sh-trust__item{flex:1 1 200px;justify-content:center;padding:16px;border-radius:14px;background:rgb(var(--color-foreground,22 24 28)/.04)}
  .sh-trust--minimal .sh-trust__item small{display:none}
  .sh-trust--minimal .sh-trust__item{font-weight:600}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-trust sh-trust--{{ section.settings.variant }}">
  <div class="sh-trust__row">
    {%- for i in (1..4) -%}{%- assign ic = 'icon' | append: i -%}{%- assign t = 'title' | append: i -%}{%- assign x = 'text' | append: i -%}
      {%- if section.settings[t] != blank -%}
      <div class="sh-trust__item"><span class="ic">{{ section.settings[ic] }}</span><span><strong>{{ section.settings[t] }}</strong><small>{{ section.settings[x] }}</small></span></div>
      {%- endif -%}
    {%- endfor -%}
  </div>
</div>
{% schema %}
{ "name":"Trust Bar","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"inline","options":[{"value":"inline","label":"Inline"},{"value":"cards","label":"Cards"},{"value":"minimal","label":"Minimal"}]},
  {"type":"text","id":"icon1","label":"Icon 1","default":"🚚"},{"type":"text","id":"title1","label":"Title 1","default":"Free shipping"},{"type":"text","id":"text1","label":"Text 1","default":"On orders over $50"},
  {"type":"text","id":"icon2","label":"Icon 2","default":"🔒"},{"type":"text","id":"title2","label":"Title 2","default":"Secure checkout"},{"type":"text","id":"text2","label":"Text 2","default":"Encrypted & protected"},
  {"type":"text","id":"icon3","label":"Icon 3","default":"↩️"},{"type":"text","id":"title3","label":"Title 3","default":"Easy returns"},{"type":"text","id":"text3","label":"Text 3","default":"30-day money back"},
  {"type":"text","id":"icon4","label":"Icon 4","default":"⭐"},{"type":"text","id":"title4","label":"Title 4","default":"Loved by customers"},{"type":"text","id":"text4","label":"Text 4","default":"Rated & reviewed"}
],"presets":[{"name":"Trust Bar"}] }
{% endschema %}`;

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ = `{%- style -%}${BASE}
  .sh-faq{max-width:760px;margin:0 auto;padding:48px 16px}
  .sh-faq h2{text-align:center;font-size:30px;margin:0 0 26px}
  .sh-faq details{border-bottom:1px solid rgb(var(--color-foreground,22 24 28)/.12);padding:16px 0}
  .sh-faq summary{font-weight:600;font-size:16px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px}
  .sh-faq summary::-webkit-details-marker{display:none}
  .sh-faq summary::after{content:"+";font-size:22px;opacity:.6}
  .sh-faq details[open] summary::after{content:"–"}
  .sh-faq p{margin:12px 0 0;line-height:1.65;opacity:.78}
  .sh-faq--cards details{border:1px solid rgb(var(--color-foreground,22 24 28)/.12);background:rgb(var(--color-foreground,22 24 28)/.03);border-radius:14px;padding:15px 18px;margin-bottom:12px}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-faq sh-faq--{{ section.settings.variant }}">
  <h2>{{ section.settings.heading }}</h2>
  {%- for i in (1..5) -%}{%- assign q = 'q' | append: i -%}{%- assign a = 'a' | append: i -%}
    {%- if section.settings[q] != blank -%}<details><summary>{{ section.settings[q] }}</summary><p>{{ section.settings[a] }}</p></details>{%- endif -%}
  {%- endfor -%}
</div>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{%- assign sh_first = true -%}{%- for i in (1..5) -%}{%- assign q = 'q' | append: i -%}{%- assign a = 'a' | append: i -%}
{%- if section.settings[q] != blank -%}{%- unless sh_first %},{%- endunless -%}{"@type":"Question","name":{{ section.settings[q] | json }},"acceptedAnswer":{"@type":"Answer","text":{{ section.settings[a] | strip_html | json }}}}{%- assign sh_first = false -%}{%- endif -%}
{%- endfor -%}] }
</script>
{% schema %}
{ "name":"FAQ","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"bordered","options":[{"value":"bordered","label":"Bordered"},{"value":"cards","label":"Cards"}]},
  {"type":"text","id":"heading","label":"Heading","default":"Frequently asked questions"},
  {"type":"text","id":"q1","label":"Q1","default":"How long does shipping take?"},{"type":"textarea","id":"a1","label":"A1","default":"Most orders arrive within 3–7 business days."},
  {"type":"text","id":"q2","label":"Q2","default":"What is your return policy?"},{"type":"textarea","id":"a2","label":"A2","default":"Returns are accepted within 30 days, no questions asked."},
  {"type":"text","id":"q3","label":"Q3","default":"Is checkout secure?"},{"type":"textarea","id":"a3","label":"A3","default":"Yes — payments are encrypted and processed securely by Shopify."},
  {"type":"text","id":"q4","label":"Q4","default":"Do you offer support?"},{"type":"textarea","id":"a4","label":"A4","default":"Absolutely — reach out any time and we'll help."},
  {"type":"text","id":"q5","label":"Q5"},{"type":"textarea","id":"a5","label":"A5"}
],"presets":[{"name":"FAQ"}] }
{% endschema %}`;

// ── Why Choose Us (variants: cards / plain) ───────────────────────────────────
const FEATURES = `{%- style -%}${BASE}
  .sh-feat{max-width:1100px;margin:0 auto;padding:50px 16px;text-align:center}
  .sh-feat h2{font-size:30px;margin:0 0 30px}
  .sh-feat__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  @media(max-width:749px){.sh-feat__grid{grid-template-columns:1fr}}
  .sh-feat__card{padding:24px}
  .sh-feat--cards .sh-feat__card{border-radius:16px;background:rgb(var(--color-foreground,22 24 28)/.04);border:1px solid rgb(var(--color-foreground,22 24 28)/.08)}
  .sh-feat__ic{font-size:36px}
  .sh-feat__card h3{font-size:18px;margin:12px 0 7px;font-family:inherit}
  .sh-feat__card p{line-height:1.6;margin:0;opacity:.75}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-feat sh-feat--{{ section.settings.variant }}">
  {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
  <div class="sh-feat__grid">
    {%- for i in (1..3) -%}{%- assign ic = 'icon' | append: i -%}{%- assign t = 'title' | append: i -%}{%- assign x = 'text' | append: i -%}
      <div class="sh-feat__card"><div class="sh-feat__ic">{{ section.settings[ic] }}</div><h3>{{ section.settings[t] }}</h3><p>{{ section.settings[x] }}</p></div>
    {%- endfor -%}
  </div>
</div>
{% schema %}
{ "name":"Why Choose Us","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"cards","options":[{"value":"cards","label":"Cards"},{"value":"plain","label":"Plain"}]},
  {"type":"text","id":"heading","label":"Heading","default":"Why choose us"},
  {"type":"text","id":"icon1","label":"Icon 1","default":"🏆"},{"type":"text","id":"title1","label":"Title 1","default":"Premium quality"},{"type":"textarea","id":"text1","label":"Text 1","default":"Built to last with materials we'd use ourselves."},
  {"type":"text","id":"icon2","label":"Icon 2","default":"⚡"},{"type":"text","id":"title2","label":"Title 2","default":"Fast delivery"},{"type":"textarea","id":"text2","label":"Text 2","default":"Quick dispatch and reliable shipping to your door."},
  {"type":"text","id":"icon3","label":"Icon 3","default":"💬"},{"type":"text","id":"title3","label":"Title 3","default":"Real support"},{"type":"textarea","id":"text3","label":"Text 3","default":"Friendly help whenever you need it."}
],"presets":[{"name":"Why Choose Us"}] }
{% endschema %}`;

// ── Promo Banner (variants: solid / gradient) ─────────────────────────────────
const PROMO = `{%- style -%}${BASE}
  .sh-promo{text-align:center;padding:60px 20px}
  .sh-promo--solid{background:rgb(var(--color-foreground,11 16 32));color:rgb(var(--color-background,255 255 255))}
  .sh-promo--gradient{background:linear-gradient(135deg,rgb(var(--color-button,10 132 255)),rgb(var(--color-foreground,11 16 32)));color:#fff}
  .sh-promo h2{font-size:34px;margin:0 0 10px;font-weight:800}
  .sh-promo p{font-size:17px;opacity:.92;margin:0 0 24px}
  .sh-promo .sh-btn{background:#fff;color:#111}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-promo sh-promo--{{ section.settings.variant }}">
  <h2>{{ section.settings.heading }}</h2>
  {%- if section.settings.text != blank -%}<p>{{ section.settings.text }}</p>{%- endif -%}
  {%- if section.settings.btn_label != blank -%}<a class="sh-btn" href="{{ section.settings.btn_link }}">{{ section.settings.btn_label }}</a>{%- endif -%}
</div>
{% schema %}
{ "name":"Promo Banner","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"gradient","options":[{"value":"gradient","label":"Gradient"},{"value":"solid","label":"Solid"}]},
  {"type":"text","id":"heading","label":"Heading","default":"Limited-time offer"},
  {"type":"text","id":"text","label":"Subtext","default":"Save on your favorites — while stocks last."},
  {"type":"text","id":"btn_label","label":"Button label","default":"Shop now"},
  {"type":"url","id":"btn_link","label":"Button link","default":"/collections/all"}
],"presets":[{"name":"Promo Banner"}] }
{% endschema %}`;

// ── Comparison Table ──────────────────────────────────────────────────────────
const COMPARISON = `{%- style -%}${BASE}
  .sh-cmp{max-width:760px;margin:0 auto;padding:50px 16px}
  .sh-cmp h2{text-align:center;font-size:30px;margin:0 0 26px}
  .sh-cmp table{width:100%;border-collapse:collapse;font-size:14px}
  .sh-cmp th,.sh-cmp td{padding:13px 14px;border-bottom:1px solid rgb(var(--color-foreground,22 24 28)/.12);text-align:left}
  .sh-cmp th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;opacity:.6}
  .sh-cmp .us{font-weight:700;color:rgb(var(--color-button,10 132 255))}
  .sh-cmp td.c,.sh-cmp th.c{text-align:center}
  .sh-cmp--card table{border-collapse:separate;border-spacing:0;border:1px solid rgb(var(--color-foreground,22 24 28)/.12);border-radius:16px;overflow:hidden}
  .sh-cmp--card th{background:rgb(var(--color-foreground,22 24 28)/.05)}
  .sh-cmp--card td.us,.sh-cmp--card th.us{background:rgb(var(--color-button,10 132 255)/.07)}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-cmp sh-cmp--{{ section.settings.variant }}">
  <h2>{{ section.settings.heading }}</h2>
  <table><thead><tr><th>{{ section.settings.col_feature }}</th><th class="c us">{{ section.settings.col_us }}</th><th class="c">{{ section.settings.col_them }}</th></tr></thead>
  <tbody>{%- for i in (1..5) -%}{%- assign r = 'row' | append: i -%}{%- if section.settings[r] != blank -%}{%- assign u = 'us' | append: i -%}{%- assign t = 'them' | append: i -%}
    <tr><td>{{ section.settings[r] }}</td><td class="c us">{{ section.settings[u] }}</td><td class="c">{{ section.settings[t] }}</td></tr>
  {%- endif -%}{%- endfor -%}</tbody></table>
</div>
{% schema %}
{ "name":"Comparison Table","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"clean","options":[{"value":"clean","label":"Clean"},{"value":"card","label":"Card"}]},
  {"type":"text","id":"heading","label":"Heading","default":"Why we're the better choice"},
  {"type":"text","id":"col_feature","label":"Column: feature","default":"Feature"},{"type":"text","id":"col_us","label":"Column: us","default":"Us"},{"type":"text","id":"col_them","label":"Column: others","default":"Others"},
  {"type":"text","id":"row1","label":"Row 1","default":"Premium materials"},{"type":"text","id":"us1","label":"Us 1","default":"✓"},{"type":"text","id":"them1","label":"Them 1","default":"✕"},
  {"type":"text","id":"row2","label":"Row 2","default":"Free shipping"},{"type":"text","id":"us2","label":"Us 2","default":"✓"},{"type":"text","id":"them2","label":"Them 2","default":"✕"},
  {"type":"text","id":"row3","label":"Row 3","default":"30-day returns"},{"type":"text","id":"us3","label":"Us 3","default":"✓"},{"type":"text","id":"them3","label":"Them 3","default":"Sometimes"},
  {"type":"text","id":"row4","label":"Row 4","default":"Real human support"},{"type":"text","id":"us4","label":"Us 4","default":"✓"},{"type":"text","id":"them4","label":"Them 4","default":"✕"},
  {"type":"text","id":"row5","label":"Row 5"},{"type":"text","id":"us5","label":"Us 5"},{"type":"text","id":"them5","label":"Them 5"}
],"presets":[{"name":"Comparison Table"}] }
{% endschema %}`;

// ── Testimonials (variants: cards / minimal) ──────────────────────────────────
const TESTIMONIALS = `{%- style -%}${BASE}
  .sh-tm{max-width:1100px;margin:0 auto;padding:50px 16px;text-align:center}
  .sh-tm h2{font-size:30px;margin:0 0 30px}
  .sh-tm__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  @media(max-width:749px){.sh-tm__grid{grid-template-columns:1fr}}
  .sh-tm__card{padding:24px;text-align:left}
  .sh-tm--cards .sh-tm__card{border-radius:16px;background:rgb(var(--color-foreground,22 24 28)/.04);border:1px solid rgb(var(--color-foreground,22 24 28)/.08)}
  .sh-tm__stars{color:#f5a623;margin-bottom:10px;letter-spacing:2px}
  .sh-tm__q{font-size:15px;line-height:1.6;margin:0 0 14px}
  .sh-tm__a{font-weight:700;font-size:13px;opacity:.85}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-tm sh-tm--{{ section.settings.variant }}">
  {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
  <div class="sh-tm__grid">
    {%- for i in (1..3) -%}{%- assign q = 'quote' | append: i -%}{%- assign a = 'author' | append: i -%}
      <div class="sh-tm__card"><div class="sh-tm__stars">★★★★★</div><p class="sh-tm__q">{{ section.settings[q] }}</p><div class="sh-tm__a">— {{ section.settings[a] }}</div></div>
    {%- endfor -%}
  </div>
</div>
{% schema %}
{ "name":"Testimonials","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"cards","options":[{"value":"cards","label":"Cards"},{"value":"minimal","label":"Minimal"}]},
  {"type":"text","id":"heading","label":"Heading","default":"What customers say"},
  {"type":"textarea","id":"quote1","label":"Quote 1","default":"Exactly what I needed — quality is excellent and shipping was fast."},{"type":"text","id":"author1","label":"Author 1","default":"Sarah M."},
  {"type":"textarea","id":"quote2","label":"Quote 2","default":"Better than I expected. I've already ordered again."},{"type":"text","id":"author2","label":"Author 2","default":"James T."},
  {"type":"textarea","id":"quote3","label":"Quote 3","default":"Great experience start to finish. Highly recommend."},{"type":"text","id":"author3","label":"Author 3","default":"Priya K."}
],"presets":[{"name":"Testimonials"}] }
{% endschema %}`;

// ── Image + Text ──────────────────────────────────────────────────────────────
const IMAGE_TEXT = `{%- style -%}${BASE}
  .sh-it{max-width:1100px;margin:0 auto;padding:50px 16px;display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
  .sh-it.rev .sh-it__media{order:2}
  @media(max-width:749px){.sh-it{grid-template-columns:1fr}}
  .sh-it__media{border-radius:16px;overflow:hidden;min-height:260px;background:rgb(var(--color-foreground,22 24 28)/.06)}
  .sh-it__media img{width:100%;height:100%;object-fit:cover;display:block}
  .sh-it h2{font-size:30px;margin:0 0 14px}
  .sh-it p{line-height:1.65;margin:0 0 20px;opacity:.78}
  .sh-it--framed .sh-it__media{border-radius:20px;border:1px solid rgb(var(--color-foreground,22 24 28)/.08);box-shadow:0 18px 44px rgb(var(--color-foreground,22 24 28)/.16)}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-it sh-it--{{ section.settings.variant }}{% if section.settings.reverse %} rev{% endif %}">
  <div class="sh-it__media">{%- if section.settings.image != blank -%}<img src="{{ section.settings.image | image_url: width: 1000 }}" alt="{{ section.settings.heading | escape }}" loading="lazy">{%- endif -%}</div>
  <div><h2>{{ section.settings.heading }}</h2><p>{{ section.settings.text }}</p>{%- if section.settings.btn_label != blank -%}<a class="sh-btn" href="{{ section.settings.btn_link }}">{{ section.settings.btn_label }}</a>{%- endif -%}</div>
</div>
{% schema %}
{ "name":"Image + Text","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"standard","options":[{"value":"standard","label":"Standard"},{"value":"framed","label":"Framed"}]},
  {"type":"image_picker","id":"image","label":"Image"},
  {"type":"checkbox","id":"reverse","label":"Image on right","default":false},
  {"type":"text","id":"heading","label":"Heading","default":"Crafted with care"},
  {"type":"textarea","id":"text","label":"Text","default":"Tell your story here — what makes your products special and why customers love them."},
  {"type":"text","id":"btn_label","label":"Button label","default":"Learn more"},
  {"type":"url","id":"btn_link","label":"Button link","default":"/pages/about"}
],"presets":[{"name":"Image + Text"}] }
{% endschema %}`;

// ── About / Story ─────────────────────────────────────────────────────────────
const ABOUT = `{%- style -%}${BASE}
  .sh-ab{max-width:820px;margin:0 auto;padding:54px 16px;text-align:center}
  .sh-ab h2{font-size:32px;margin:0 0 14px}
  .sh-ab__body{line-height:1.75;font-size:16px;opacity:.82}
  .sh-ab__stats{display:flex;justify-content:center;gap:48px;margin-top:32px;flex-wrap:wrap}
  .sh-ab__stat strong{display:block;font-size:28px;color:rgb(var(--color-button,10 132 255))}
  .sh-ab__stat span{font-size:13px;opacity:.65}
  .sh-ab--boxed .sh-ab__inner{background:rgb(var(--color-foreground,22 24 28)/.04);border:1px solid rgb(var(--color-foreground,22 24 28)/.08);border-radius:24px;padding:44px 32px}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-ab sh-ab--{{ section.settings.variant }}">
  <div class="sh-ab__inner">
    <h2>{{ section.settings.heading }}</h2>
    <div class="sh-ab__body">{{ section.settings.body }}</div>
    <div class="sh-ab__stats">{%- for i in (1..3) -%}{%- assign n = 'stat' | append: i -%}{%- assign l = 'label' | append: i -%}{%- if section.settings[n] != blank -%}
      <div class="sh-ab__stat"><strong>{{ section.settings[n] }}</strong><span>{{ section.settings[l] }}</span></div>
    {%- endif -%}{%- endfor -%}</div>
  </div>
</div>
{% schema %}
{ "name":"About / Story","tag":"section","settings":[
  ${SCHEME},
  {"type":"select","id":"variant","label":"Style","default":"centered","options":[{"value":"centered","label":"Centered"},{"value":"boxed","label":"Boxed"}]},
  {"type":"text","id":"heading","label":"Heading","default":"Our story"},
  {"type":"richtext","id":"body","label":"Body","default":"<p>Share what your brand stands for, who it's for, and why you started. A genuine story builds trust and turns visitors into customers.</p>"},
  {"type":"text","id":"stat1","label":"Stat 1","default":"10k+"},{"type":"text","id":"label1","label":"Label 1","default":"Happy customers"},
  {"type":"text","id":"stat2","label":"Stat 2","default":"4.8★"},{"type":"text","id":"label2","label":"Label 2","default":"Average rating"},
  {"type":"text","id":"stat3","label":"Stat 3"},{"type":"text","id":"label3","label":"Label 3"}
],"presets":[{"name":"About / Story"}] }
{% endschema %}`;

// ── Newsletter ────────────────────────────────────────────────────────────────
const NEWSLETTER = `{%- style -%}${BASE}
  .sh-nl{max-width:640px;margin:0 auto;padding:54px 16px;text-align:center}
  .sh-nl h2{font-size:30px;margin:0 0 8px}
  .sh-nl p{opacity:.75;margin:0 0 22px}
  .sh-nl form{display:flex;gap:10px;max-width:460px;margin:0 auto;flex-wrap:wrap}
  .sh-nl input{flex:1 1 220px;padding:13px 16px;border-radius:10px;border:1px solid rgb(var(--color-foreground,22 24 28)/.25);font-size:15px;background:rgb(var(--color-background,255 255 255));color:inherit}
  .sh-nl small{display:block;margin-top:12px;opacity:.6;font-size:12px}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-nl">
  <h2>{{ section.settings.heading }}</h2>
  {%- if section.settings.text != blank -%}<p>{{ section.settings.text }}</p>{%- endif -%}
  {%- form 'customer' -%}
    <input type="hidden" name="contact[tags]" value="newsletter">
    <input type="email" name="contact[email]" placeholder="{{ section.settings.placeholder }}" required>
    <button type="submit" class="sh-btn">{{ section.settings.btn_label }}</button>
  {%- endform -%}
  {%- if section.settings.note != blank -%}<small>{{ section.settings.note }}</small>{%- endif -%}
</div>
{% schema %}
{ "name":"Newsletter","tag":"section","settings":[
  ${SCHEME},
  {"type":"text","id":"heading","label":"Heading","default":"Get 10% off your first order"},
  {"type":"text","id":"text","label":"Subtext","default":"Join our list for exclusive offers and new arrivals."},
  {"type":"text","id":"placeholder","label":"Input placeholder","default":"Enter your email"},
  {"type":"text","id":"btn_label","label":"Button label","default":"Subscribe"},
  {"type":"text","id":"note","label":"Fine print","default":"No spam. Unsubscribe anytime."}
],"presets":[{"name":"Newsletter"}] }
{% endschema %}`;

// ── Guarantee ─────────────────────────────────────────────────────────────────
const GUARANTEE = `{%- style -%}${BASE}
  .sh-guar{max-width:680px;margin:0 auto;padding:52px 16px;text-align:center}
  .sh-guar__ic{font-size:48px;line-height:1}
  .sh-guar h2{font-size:28px;margin:12px 0 8px}
  .sh-guar p{opacity:.78;line-height:1.65;margin:0}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-guar">
  <div class="sh-guar__ic">{{ section.settings.icon }}</div>
  <h2>{{ section.settings.heading }}</h2>
  <p>{{ section.settings.text }}</p>
</div>
{% schema %}
{ "name":"Guarantee","tag":"section","settings":[
  ${SCHEME},
  {"type":"text","id":"icon","label":"Icon","default":"🛡️"},
  {"type":"text","id":"heading","label":"Heading","default":"100% satisfaction guarantee"},
  {"type":"textarea","id":"text","label":"Text","default":"Love it or your money back within 30 days — no questions asked. We stand behind everything we make."}
],"presets":[{"name":"Guarantee"}] }
{% endschema %}`;

// ── Stats Bar ─────────────────────────────────────────────────────────────────
const STATS = `{%- style -%}${BASE}
  .sh-stats{max-width:1000px;margin:0 auto;padding:46px 16px;display:flex;justify-content:space-around;gap:24px;flex-wrap:wrap;text-align:center}
  .sh-stats__n{font-size:36px;font-weight:800;color:rgb(var(--color-button,10 132 255))}
  .sh-stats__l{opacity:.7;font-size:13px;margin-top:2px}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-stats">
  {%- for i in (1..4) -%}{%- assign n = 'num' | append: i -%}{%- assign l = 'label' | append: i -%}
    {%- if section.settings[n] != blank -%}<div><div class="sh-stats__n">{{ section.settings[n] }}</div><div class="sh-stats__l">{{ section.settings[l] }}</div></div>{%- endif -%}
  {%- endfor -%}
</div>
{% schema %}
{ "name":"Stats Bar","tag":"section","settings":[
  ${SCHEME},
  {"type":"text","id":"num1","label":"Number 1","default":"10k+"},{"type":"text","id":"label1","label":"Label 1","default":"Orders shipped"},
  {"type":"text","id":"num2","label":"Number 2","default":"4.8★"},{"type":"text","id":"label2","label":"Label 2","default":"Average rating"},
  {"type":"text","id":"num3","label":"Number 3","default":"30-day"},{"type":"text","id":"label3","label":"Label 3","default":"Money-back guarantee"},
  {"type":"text","id":"num4","label":"Number 4","default":"24/7"},{"type":"text","id":"label4","label":"Label 4","default":"Customer support"}
],"presets":[{"name":"Stats Bar"}] }
{% endschema %}`;

// ── Logo Bar ──────────────────────────────────────────────────────────────────
const LOGOS = `{%- style -%}${BASE}
  .sh-logos{max-width:1000px;margin:0 auto;padding:38px 16px;text-align:center}
  .sh-logos h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.55;margin:0 0 20px}
  .sh-logos__row{display:flex;justify-content:center;align-items:center;gap:34px;flex-wrap:wrap}
  .sh-logos__row img{height:34px;width:auto;object-fit:contain;opacity:.7;filter:grayscale(1)}
{%- endstyle -%}
<div class="color-{{ section.settings.color_scheme }} sh-sec sh-logos">
  {%- if section.settings.heading != blank -%}<h3>{{ section.settings.heading }}</h3>{%- endif -%}
  <div class="sh-logos__row">
    {%- for i in (1..5) -%}{%- assign img = 'logo' | append: i -%}
      {%- if section.settings[img] != blank -%}<img src="{{ section.settings[img] | image_url: width: 240 }}" alt="logo" loading="lazy">{%- endif -%}
    {%- endfor -%}
  </div>
</div>
{% schema %}
{ "name":"Logo Bar","tag":"section","settings":[
  ${SCHEME},
  {"type":"text","id":"heading","label":"Heading","default":"As seen in"},
  {"type":"image_picker","id":"logo1","label":"Logo 1"},{"type":"image_picker","id":"logo2","label":"Logo 2"},{"type":"image_picker","id":"logo3","label":"Logo 3"},{"type":"image_picker","id":"logo4","label":"Logo 4"},{"type":"image_picker","id":"logo5","label":"Logo 5"}
],"presets":[{"name":"Logo Bar"}] }
{% endschema %}`;

const baseTrust = { color_scheme: "scheme-1", icon1: "🚚", title1: "Free shipping", text1: "On orders over $50", icon2: "🔒", title2: "Secure checkout", text2: "Encrypted & protected", icon3: "↩️", title3: "Easy returns", text3: "30-day money back", icon4: "⭐", title4: "Loved by customers", text4: "Rated & reviewed" };
const baseFaq = { color_scheme: "scheme-1", heading: "Frequently asked questions", q1: "How long does shipping take?", a1: "Most orders arrive within 3–7 business days.", q2: "What is your return policy?", a2: "Returns are accepted within 30 days, no questions asked.", q3: "Is checkout secure?", a3: "Yes — payments are encrypted and processed securely by Shopify.", q4: "Do you offer support?", a4: "Absolutely — reach out any time and we'll help.", q5: "", a5: "" };
const baseFeat = { color_scheme: "scheme-1", heading: "Why choose us", icon1: "🏆", title1: "Premium quality", text1: "Built to last with materials we'd use ourselves.", icon2: "⚡", title2: "Fast delivery", text2: "Quick dispatch and reliable shipping to your door.", icon3: "💬", title3: "Real support", text3: "Friendly help whenever you need it." };
const basePromo = { color_scheme: "scheme-1", heading: "Limited-time offer", text: "Save on your favorites — while stocks last.", btn_label: "Shop now", btn_link: "/collections/all" };
const baseCmp = { color_scheme: "scheme-1", heading: "Why we're the better choice", col_feature: "Feature", col_us: "Us", col_them: "Others", row1: "Premium materials", us1: "✓", them1: "✕", row2: "Free shipping", us2: "✓", them2: "✕", row3: "30-day returns", us3: "✓", them3: "Sometimes", row4: "Real human support", us4: "✓", them4: "✕", row5: "", us5: "", them5: "" };
const baseTm = { color_scheme: "scheme-1", heading: "What customers say", quote1: "Exactly what I needed — quality is excellent and shipping was fast.", author1: "Sarah M.", quote2: "Better than I expected. I've already ordered again.", author2: "James T.", quote3: "Great experience start to finish. Highly recommend.", author3: "Priya K." };
const baseIt = { color_scheme: "scheme-1", reverse: false, heading: "Crafted with care", text: "Tell your story here — what makes your products special and why customers love them.", btn_label: "Learn more", btn_link: "/pages/about" };
const baseAbout = { color_scheme: "scheme-1", heading: "Our story", body: "<p>Share what your brand stands for, who it's for, and why you started. A genuine story builds trust and turns visitors into customers.</p>", stat1: "10k+", label1: "Happy customers", stat2: "4.8★", label2: "Average rating", stat3: "", label3: "" };
const baseNl = { color_scheme: "scheme-1", heading: "Get 10% off your first order", text: "Join our list for exclusive offers and new arrivals.", placeholder: "Enter your email", btn_label: "Subscribe", note: "No spam. Unsubscribe anytime." };
const baseGuar = { color_scheme: "scheme-1", icon: "🛡️", heading: "100% satisfaction guarantee", text: "Love it or your money back within 30 days — no questions asked. We stand behind everything we make." };
const baseStats = { color_scheme: "scheme-1", num1: "10k+", label1: "Orders shipped", num2: "4.8★", label2: "Average rating", num3: "30-day", label3: "Money-back guarantee", num4: "24/7", label4: "Customer support" };
const baseLogos = { color_scheme: "scheme-1", heading: "As seen in" };

const SECTION_DEFS: Record<string, SectionDef> = {
  "sh-trust-bar": { liquid: TRUST_BAR, settings: { ...baseTrust, variant: "inline" } },
  "sh-faq": { liquid: FAQ, settings: { ...baseFaq, variant: "bordered" } },
  "sh-features": { liquid: FEATURES, settings: { ...baseFeat, variant: "cards" } },
  "sh-promo": { liquid: PROMO, settings: { ...basePromo, variant: "gradient" } },
  "sh-comparison": { liquid: COMPARISON, settings: { ...baseCmp, variant: "clean" } },
  "sh-testimonials": { liquid: TESTIMONIALS, settings: { ...baseTm, variant: "cards" } },
  "sh-image-text": { liquid: IMAGE_TEXT, settings: { ...baseIt, variant: "standard" } },
  "sh-about": { liquid: ABOUT, settings: { ...baseAbout, variant: "centered" } },
  "sh-newsletter": { liquid: NEWSLETTER, settings: baseNl },
  "sh-guarantee": { liquid: GUARANTEE, settings: baseGuar },
  "sh-stats": { liquid: STATS, settings: baseStats },
  "sh-logos": { liquid: LOGOS, settings: baseLogos },
};

/**
 * Insert several library sections into a template in one pass (reads/writes the
 * template JSON once, with collision-free ids). Used by PDP blueprints.
 */
export async function insertSections(
  dir: string,
  target: string,
  sections: { key: string; variant?: string }[],
): Promise<{ ok: boolean; error?: string; files: string[] }> {
  const files: string[] = [];
  try {
    await mkdir(path.join(dir, "sections"), { recursive: true });
    for (const s of sections) {
      const def = SECTION_DEFS[s.key];
      if (!def) return { ok: false, error: `Unknown section "${s.key}".`, files };
      await writeFile(path.join(dir, "sections", `${s.key}.liquid`), def.liquid, "utf8");
      files.push(`sections/${s.key}.liquid`);
    }
  } catch (e) {
    return { ok: false, error: `Couldn't write a section file: ${e instanceof Error ? e.message : e}`, files };
  }
  const resolved = await resolveTarget(dir, target);
  if (!resolved) {
    return { ok: false, error: `Couldn't open the "${target}" template — it may not exist on this theme.`, files };
  }
  const stamp = Date.now().toString(36);
  const uniqueKeys = [...new Set(sections.map((s) => s.key))];

  // Vintage .liquid template → append section tags (settings use schema defaults).
  if (resolved.kind === "liquid") {
    // Idempotent: strip any existing tags for these sections first, so re-running
    // a step never stacks duplicates, then append exactly one of each.
    let body = resolved.content;
    for (const k of uniqueKeys) {
      body = body.replace(new RegExp(`[ \\t]*\\{%-?\\s*section\\s*['"]${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*-?%\\}[ \\t]*\\n?`, "g"), "");
    }
    const next = appendToLiquidTemplate(body, sections.map((s) => s.key));
    try {
      await writeFile(path.join(dir, resolved.relPath), next, "utf8");
    } catch (e) {
      return { ok: false, error: `Couldn't update the template: ${e instanceof Error ? e.message : e}`, files };
    }
    files.push(resolved.relPath);
    return { ok: true, files };
  }

  // OS 2.0 JSON template → add section objects + order entries.
  let json: { sections?: Record<string, { type?: string }>; order?: string[] };
  try {
    json = JSON.parse(resolved.content);
  } catch {
    return { ok: false, error: `The "${target}" template isn't valid JSON — can't safely edit it.`, files };
  }
  json.sections = json.sections ?? {};
  json.order = json.order ?? [];
  // Idempotent: drop any existing instances of these section types first.
  for (const [id, s] of Object.entries(json.sections)) {
    if (s && typeof s === "object" && uniqueKeys.includes(String(s.type))) {
      delete json.sections[id];
      json.order = json.order.filter((o) => o !== id);
    }
  }
  const newIds = sections.map((s, i) => {
    const def = SECTION_DEFS[s.key];
    const id = `${s.key}_${stamp}_${i}`;
    json.sections![id] = { type: s.key, settings: { ...def.settings, ...(s.variant ? { variant: s.variant } : {}) } } as { type?: string };
    return id;
  });
  // Placement: on a product template, drop the new sections right AFTER the main
  // product section (i.e. below the buy button) instead of at the very bottom.
  const mainIdx = json.order.findIndex((o) => /(^|_)main-product(_|$)/.test(o) || json.sections?.[o]?.type === "main-product");
  if (target === "product" && mainIdx >= 0) json.order.splice(mainIdx + 1, 0, ...newIds);
  else json.order.push(...newIds);
  try {
    await writeFile(path.join(dir, resolved.relPath), JSON.stringify(json, null, 2), "utf8");
  } catch (e) {
    return { ok: false, error: `Couldn't update the template: ${e instanceof Error ? e.message : e}`, files };
  }
  files.push(resolved.relPath);
  return { ok: true, files };
}

async function readMaybe(p: string): Promise<string | null> {
  try { return await readFile(p, "utf8"); } catch { return null; }
}

/**
 * Append `{% section 'key' %}` tags to a vintage (.liquid) template, just before
 * its last closing tag if one exists, else at the end. Per-instance settings
 * can't be passed through a section tag, so the section renders with its schema
 * defaults (the variant default applies). Returns the written file key.
 */
function appendToLiquidTemplate(liquid: string, keys: string[]): string {
  const tags = keys.map((k) => `{% section '${k}' %}`).join("\n");
  return `${liquid.replace(/\s*$/, "")}\n${tags}\n`;
}

// Resolve the homepage/template target across OS 2.0 (.json) and vintage (.liquid)
// themes, and return what files to write. Returns null if the template is absent.
async function resolveTarget(dir: string, target: string): Promise<{ kind: "json" | "liquid"; relPath: string; content: string } | null> {
  const jsonRel = `templates/${target}.json`;
  const liquidRel = `templates/${target}.liquid`;
  const json = await readMaybe(path.join(dir, jsonRel));
  if (json != null) return { kind: "json", relPath: jsonRel, content: json };
  const liquid = await readMaybe(path.join(dir, liquidRel));
  if (liquid != null) return { kind: "liquid", relPath: liquidRel, content: liquid };
  return null;
}

/** Insert a library section (optionally a variant) into the chosen template. */
export async function insertSection(dir: string, key: string, target: string, variant?: string): Promise<{ ok: boolean; error?: string; files?: string[] }> {
  const r = await insertSections(dir, target, [{ key, variant }]);
  return { ok: r.ok, error: r.error, files: r.files };
}
