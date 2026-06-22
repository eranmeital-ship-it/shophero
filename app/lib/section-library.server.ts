import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * The actual Liquid for each library section + its default settings. Inserting a
 * section = write its .liquid file into the working theme and add an instance to
 * the chosen template's JSON. All deterministic — no model generation, so it's
 * free, instant, and always valid.
 */

interface SectionDef {
  liquid: string;
  settings: Record<string, unknown>; // default instance settings
}

const TRUST_BAR = `{%- style -%}
  .sh-trust{background:{{ section.settings.bg }};padding:20px 16px}
  .sh-trust__row{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:20px;justify-content:space-around}
  .sh-trust__item{display:flex;align-items:center;gap:10px;font-size:14px;color:{{ section.settings.text_color }}}
  .sh-trust__item .ic{font-size:24px;line-height:1}
  .sh-trust__item strong{display:block;font-weight:700}
  .sh-trust__item small{opacity:.7}
{%- endstyle -%}
<div class="sh-trust">
  <div class="sh-trust__row">
    <div class="sh-trust__item"><span class="ic">{{ section.settings.icon1 }}</span><span><strong>{{ section.settings.title1 }}</strong><small>{{ section.settings.text1 }}</small></span></div>
    <div class="sh-trust__item"><span class="ic">{{ section.settings.icon2 }}</span><span><strong>{{ section.settings.title2 }}</strong><small>{{ section.settings.text2 }}</small></span></div>
    <div class="sh-trust__item"><span class="ic">{{ section.settings.icon3 }}</span><span><strong>{{ section.settings.title3 }}</strong><small>{{ section.settings.text3 }}</small></span></div>
    <div class="sh-trust__item"><span class="ic">{{ section.settings.icon4 }}</span><span><strong>{{ section.settings.title4 }}</strong><small>{{ section.settings.text4 }}</small></span></div>
  </div>
</div>
{% schema %}
{
  "name": "Trust Bar",
  "tag": "section",
  "settings": [
    { "type": "color", "id": "bg", "label": "Background", "default": "#f7f8fa" },
    { "type": "color", "id": "text_color", "label": "Text", "default": "#16181c" },
    { "type": "text", "id": "icon1", "label": "Icon 1", "default": "🚚" }, { "type": "text", "id": "title1", "label": "Title 1", "default": "Free shipping" }, { "type": "text", "id": "text1", "label": "Text 1", "default": "On orders over $50" },
    { "type": "text", "id": "icon2", "label": "Icon 2", "default": "🔒" }, { "type": "text", "id": "title2", "label": "Title 2", "default": "Secure checkout" }, { "type": "text", "id": "text2", "label": "Text 2", "default": "Encrypted & protected" },
    { "type": "text", "id": "icon3", "label": "Icon 3", "default": "↩️" }, { "type": "text", "id": "title3", "label": "Title 3", "default": "Easy returns" }, { "type": "text", "id": "text3", "label": "Text 3", "default": "30-day money back" },
    { "type": "text", "id": "icon4", "label": "Icon 4", "default": "⭐" }, { "type": "text", "id": "title4", "label": "Title 4", "default": "Loved by customers" }, { "type": "text", "id": "text4", "label": "Text 4", "default": "Rated & reviewed" }
  ],
  "presets": [{ "name": "Trust Bar" }]
}
{% endschema %}`;

const FAQ = `{%- style -%}
  .sh-faq{max-width:760px;margin:0 auto;padding:40px 16px}
  .sh-faq h2{text-align:center;font-size:28px;margin:0 0 24px}
  .sh-faq details{border-bottom:1px solid #e6e9ef;padding:14px 0}
  .sh-faq summary{font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px}
  .sh-faq summary::-webkit-details-marker{display:none}
  .sh-faq summary::after{content:"+";font-size:20px;color:#0a84ff}
  .sh-faq details[open] summary::after{content:"–"}
  .sh-faq p{margin:10px 0 0;color:#5a6472;line-height:1.6}
{%- endstyle -%}
<div class="sh-faq">
  <h2>{{ section.settings.heading }}</h2>
  {%- for i in (1..5) -%}
    {%- assign q = 'q' | append: i -%}{%- assign a = 'a' | append: i -%}
    {%- assign qv = section.settings[q] -%}{%- assign av = section.settings[a] -%}
    {%- if qv != blank -%}
      <details><summary>{{ qv }}</summary><p>{{ av }}</p></details>
    {%- endif -%}
  {%- endfor -%}
</div>
{% schema %}
{
  "name": "FAQ",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Frequently asked questions" },
    { "type": "text", "id": "q1", "label": "Q1", "default": "How long does shipping take?" }, { "type": "textarea", "id": "a1", "label": "A1", "default": "Most orders arrive within 3–7 business days." },
    { "type": "text", "id": "q2", "label": "Q2", "default": "What is your return policy?" }, { "type": "textarea", "id": "a2", "label": "A2", "default": "Returns are accepted within 30 days, no questions asked." },
    { "type": "text", "id": "q3", "label": "Q3", "default": "Is checkout secure?" }, { "type": "textarea", "id": "a3", "label": "A3", "default": "Yes — payments are encrypted and processed securely by Shopify." },
    { "type": "text", "id": "q4", "label": "Q4", "default": "Do you offer support?" }, { "type": "textarea", "id": "a4", "label": "A4", "default": "Absolutely — reach out any time and we'll help." },
    { "type": "text", "id": "q5", "label": "Q5", "default": "" }, { "type": "textarea", "id": "a5", "label": "A5", "default": "" }
  ],
  "presets": [{ "name": "FAQ" }]
}
{% endschema %}`;

const FEATURES = `{%- style -%}
  .sh-feat{max-width:1100px;margin:0 auto;padding:44px 16px;text-align:center}
  .sh-feat h2{font-size:28px;margin:0 0 28px}
  .sh-feat__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  @media(max-width:749px){.sh-feat__grid{grid-template-columns:1fr}}
  .sh-feat__card{padding:20px}
  .sh-feat__ic{font-size:34px}
  .sh-feat__card h3{font-size:17px;margin:10px 0 6px}
  .sh-feat__card p{color:#5a6472;line-height:1.55;margin:0}
{%- endstyle -%}
<div class="sh-feat">
  {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
  <div class="sh-feat__grid">
    <div class="sh-feat__card"><div class="sh-feat__ic">{{ section.settings.icon1 }}</div><h3>{{ section.settings.title1 }}</h3><p>{{ section.settings.text1 }}</p></div>
    <div class="sh-feat__card"><div class="sh-feat__ic">{{ section.settings.icon2 }}</div><h3>{{ section.settings.title2 }}</h3><p>{{ section.settings.text2 }}</p></div>
    <div class="sh-feat__card"><div class="sh-feat__ic">{{ section.settings.icon3 }}</div><h3>{{ section.settings.title3 }}</h3><p>{{ section.settings.text3 }}</p></div>
  </div>
</div>
{% schema %}
{
  "name": "Why Choose Us",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Why choose us" },
    { "type": "text", "id": "icon1", "label": "Icon 1", "default": "🏆" }, { "type": "text", "id": "title1", "label": "Title 1", "default": "Premium quality" }, { "type": "textarea", "id": "text1", "label": "Text 1", "default": "Built to last with materials we'd use ourselves." },
    { "type": "text", "id": "icon2", "label": "Icon 2", "default": "⚡" }, { "type": "text", "id": "title2", "label": "Title 2", "default": "Fast delivery" }, { "type": "textarea", "id": "text2", "label": "Text 2", "default": "Quick dispatch and reliable shipping to your door." },
    { "type": "text", "id": "icon3", "label": "Icon 3", "default": "💬" }, { "type": "text", "id": "title3", "label": "Title 3", "default": "Real support" }, { "type": "textarea", "id": "text3", "label": "Text 3", "default": "Friendly help whenever you need it." }
  ],
  "presets": [{ "name": "Why Choose Us" }]
}
{% endschema %}`;

const PROMO = `{%- style -%}
  .sh-promo{background:{{ section.settings.bg }};color:{{ section.settings.fg }};text-align:center;padding:54px 20px}
  .sh-promo h2{font-size:32px;margin:0 0 10px;font-weight:800}
  .sh-promo p{font-size:17px;opacity:.92;margin:0 0 22px}
  .sh-promo a{display:inline-block;background:{{ section.settings.btn_bg }};color:{{ section.settings.btn_fg }};font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none}
{%- endstyle -%}
<div class="sh-promo">
  <h2>{{ section.settings.heading }}</h2>
  {%- if section.settings.text != blank -%}<p>{{ section.settings.text }}</p>{%- endif -%}
  {%- if section.settings.btn_label != blank -%}<a href="{{ section.settings.btn_link }}">{{ section.settings.btn_label }}</a>{%- endif -%}
</div>
{% schema %}
{
  "name": "Promo Banner",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Limited-time offer" },
    { "type": "text", "id": "text", "label": "Subtext", "default": "Save on your favorites — while stocks last." },
    { "type": "text", "id": "btn_label", "label": "Button label", "default": "Shop now" },
    { "type": "url", "id": "btn_link", "label": "Button link", "default": "/collections/all" },
    { "type": "color", "id": "bg", "label": "Background", "default": "#0b1020" },
    { "type": "color", "id": "fg", "label": "Text", "default": "#ffffff" },
    { "type": "color", "id": "btn_bg", "label": "Button background", "default": "#ffffff" },
    { "type": "color", "id": "btn_fg", "label": "Button text", "default": "#0b1020" }
  ],
  "presets": [{ "name": "Promo Banner" }]
}
{% endschema %}`;

const SECTION_DEFS: Record<string, SectionDef> = {
  "sh-trust-bar": { liquid: TRUST_BAR, settings: { bg: "#f7f8fa", text_color: "#16181c", icon1: "🚚", title1: "Free shipping", text1: "On orders over $50", icon2: "🔒", title2: "Secure checkout", text2: "Encrypted & protected", icon3: "↩️", title3: "Easy returns", text3: "30-day money back", icon4: "⭐", title4: "Loved by customers", text4: "Rated & reviewed" } },
  "sh-faq": { liquid: FAQ, settings: { heading: "Frequently asked questions", q1: "How long does shipping take?", a1: "Most orders arrive within 3–7 business days.", q2: "What is your return policy?", a2: "Returns are accepted within 30 days, no questions asked.", q3: "Is checkout secure?", a3: "Yes — payments are encrypted and processed securely by Shopify.", q4: "Do you offer support?", a4: "Absolutely — reach out any time and we'll help.", q5: "", a5: "" } },
  "sh-features": { liquid: FEATURES, settings: { heading: "Why choose us", icon1: "🏆", title1: "Premium quality", text1: "Built to last with materials we'd use ourselves.", icon2: "⚡", title2: "Fast delivery", text2: "Quick dispatch and reliable shipping to your door.", icon3: "💬", title3: "Real support", text3: "Friendly help whenever you need it." } },
  "sh-promo": { liquid: PROMO, settings: { heading: "Limited-time offer", text: "Save on your favorites — while stocks last.", btn_label: "Shop now", btn_link: "/collections/all", bg: "#0b1020", fg: "#ffffff", btn_bg: "#ffffff", btn_fg: "#0b1020" } },
};

/** Insert a library section into the working theme's chosen template. Deterministic. */
export async function insertSection(dir: string, key: string, target: string): Promise<{ ok: boolean; error?: string }> {
  const def = SECTION_DEFS[key];
  if (!def) return { ok: false, error: "Unknown section." };
  // 1) Write the section file.
  try {
    await mkdir(path.join(dir, "sections"), { recursive: true });
    await writeFile(path.join(dir, "sections", `${key}.liquid`), def.liquid, "utf8");
  } catch (e) {
    return { ok: false, error: `Couldn't write the section file: ${e instanceof Error ? e.message : e}` };
  }
  // 2) Add an instance to the target template JSON.
  const tplPath = path.join(dir, "templates", `${target}.json`);
  let json: { sections?: Record<string, unknown>; order?: string[] };
  try {
    json = JSON.parse(await readFile(tplPath, "utf8"));
  } catch {
    return { ok: false, error: `Couldn't open the "${target}" template — it may not exist on this theme.` };
  }
  json.sections = json.sections ?? {};
  json.order = json.order ?? [];
  const id = `${key}_${Date.now().toString(36)}`;
  json.sections[id] = { type: key, settings: def.settings };
  json.order.push(id);
  try {
    await writeFile(tplPath, JSON.stringify(json, null, 2), "utf8");
  } catch (e) {
    return { ok: false, error: `Couldn't update the template: ${e instanceof Error ? e.message : e}` };
  }
  return { ok: true };
}
