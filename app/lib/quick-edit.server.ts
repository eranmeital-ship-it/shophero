import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { complete } from "./llm.server";

/**
 * Quick visual edits — seconds and cents, NOT the agent.
 *
 * A click-to-edit request ("make this bigger / blue / centered / 2 rows") is
 * turned into a single SCOPED CSS rule by one cheap structured LLM call, then
 * injected into a ShopHero CSS snippet rendered in <head>. No theme reading, no
 * agent loop, no escalation — so a tweak costs ~$0.001 and lands in ~2-3s.
 *
 * Anything CSS can't express (changing text content, moving an element to a
 * different part of the page) returns `unsupported` so the caller can fall back
 * to the (bounded) agent.
 */

export const EDITS_SNIPPET = "snippets/sh-edits.liquid";
const RENDER_TAG = "{% render 'sh-edits' %}";

const SYS = `You convert a merchant's on-page visual edit into ONE scoped CSS rule.
Respond with ONLY JSON, no prose, no code fences:
{"css":"<css using the EXACT selector provided>","summary":"<=10 words","unsupported":false}

Rules:
- Target the provided CSS selector verbatim. Add !important to every declaration so it beats the theme's own styles.
- Translate natural language sensibly:
  bigger→larger font-size (e.g. 1.4em or a rem bump); smaller→smaller; a color name→a tasteful hex;
  center→text-align:center (add margin-left/right:auto for a block); bold→font-weight:700;
  "more space"/padding→padding or margin; rounded→border-radius; hide→display:none;
  "N per row"/"2 rows"→set the element to display:grid;grid-template-columns:repeat(N,1fr);gap:16px (pick N from the request, default 3 → 2 rows for ~6 items).
- Keep it to the few properties the request implies. Never restyle unrelated things.
- If the request changes TEXT CONTENT, MOVES the element to a different section/part of the page, or otherwise can't be done with CSS alone, return {"css":"","summary":"","unsupported":true}.`;

export interface QuickEditInput {
  selector: string;
  tag: string;
  text?: string;
  sectionType?: string;
  instruction: string;
  byokKey?: string;
}

export async function generateQuickCss(
  input: QuickEditInput,
): Promise<{ css: string; summary: string; unsupported: boolean; costUsd: number; model: string }> {
  const user =
    `Selector: ${input.selector}\n` +
    `Element: <${input.tag}> in section "${input.sectionType || "unknown"}"\n` +
    `Current text: "${(input.text || "").slice(0, 80)}"\n` +
    `Change requested: ${input.instruction}`;
  const res = await complete({ system: SYS, user, maxTokens: 400, tier: "cheap", byokKey: input.byokKey });
  let parsed: { css?: string; summary?: string; unsupported?: boolean } = {};
  try {
    let t = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    parsed = JSON.parse(t);
  } catch {
    parsed = {};
  }
  const css = (parsed.css ?? "").trim();
  return {
    css,
    summary: (parsed.summary ?? "").trim(),
    unsupported: !!parsed.unsupported || !css,
    costUsd: res.costUsd,
    model: res.model,
  };
}

/** Append the rule to the edits snippet (creating it + the <head> include if needed). */
export async function applyQuickCss(dir: string, css: string): Promise<string[]> {
  const snippetPath = path.join(dir, EDITS_SNIPPET);
  let body = await readFile(snippetPath, "utf8").catch(() => "");
  if (!body.includes("</style>")) {
    body = `{% comment %} ShopHero visual edits — scoped CSS from click-to-edit {% endcomment %}\n<style id="shophero-edits">\n</style>\n`;
  }
  body = body.replace(/<\/style>/, `${css}\n</style>`);
  await mkdir(path.dirname(snippetPath), { recursive: true });
  await writeFile(snippetPath, body, "utf8");
  const files = [EDITS_SNIPPET];

  // Make sure the snippet is rendered on the storefront (once).
  const layoutPath = path.join(dir, "layout", "theme.liquid");
  const layout = await readFile(layoutPath, "utf8").catch(() => null);
  if (layout && !layout.includes("sh-edits") && /<\/head>/i.test(layout)) {
    await writeFile(layoutPath, layout.replace(/<\/head>/i, `  ${RENDER_TAG}\n</head>`), "utf8");
    files.push("layout/theme.liquid");
  }
  return files;
}
