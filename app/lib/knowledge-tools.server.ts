import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import CRO from "../knowledge/cro.md?raw";
import PAGE_KIT from "../knowledge/page-kit.md?raw";
import CONTENT from "../knowledge/content.md?raw";
import SEO from "../knowledge/seo.md?raw";
import EMAIL from "../knowledge/email.md?raw";
import AEO from "../knowledge/aeo.md?raw";
import SPEED from "../knowledge/speed.md?raw";
import { addMemory } from "./brand.server";
import { getBrainDoc } from "./brain-docs.server";

/**
 * The agent's domain "brains" — expert knowledge loaded ON DEMAND via tools, so
 * it stays token-cheap (only enters the conversation when a task needs it, then
 * is cached by the resumable session). Each brain can be extended per-shop with a
 * custom "brain bible" (BrainDoc), appended as highest-priority context only when
 * that brain is called. Adding a brain = one entry below + a markdown file.
 */
interface BrainDef {
  name: string; // module key (also the BrainDoc.brain key)
  tool: string; // MCP tool name suffix
  title: string; // human title (Brains page)
  label: string; // activity-feed verb
  desc: string; // tool description (tells the agent when to call it)
  doc: string; // base knowledge
}

const BRAINS: BrainDef[] = [
  {
    name: "cro",
    tool: "cro_playbook",
    title: "CRO Playbook",
    label: "consulting CRO playbook",
    desc: "ShopHero's CRO playbook — proven conversion tactics (offer, hero, product page, trust, urgency, CTAs, cart/checkout, mobile, copy). Call BEFORE any conversion / optimization / design change.",
    doc: CRO,
  },
  {
    name: "page",
    tool: "page_kit",
    title: "Product Page Kit",
    label: "consulting page-build kit",
    desc: "Product-page section library (trust badges, icon guarantees, reasons to buy, key features, comparison table, social proof, reviews, FAQ, image-with-text, bundle, sticky add-to-cart) with placement, copy and theme-build steps. Call when building/rebuilding a product page.",
    doc: PAGE_KIT,
  },
  {
    name: "content",
    tool: "content_strategy",
    title: "Content Strategy",
    label: "planning content strategy",
    desc: "Content strategy — analyze existing content for gaps, prioritize by buying intent, build topic clusters, link posts to products/collections, SEO-optimize. Call for any content/blog task.",
    doc: CONTENT,
  },
  {
    name: "seo",
    tool: "seo_playbook",
    title: "SEO Playbook",
    label: "consulting SEO playbook",
    desc: "Deep SEO — technical + on-page + content SEO for Shopify (titles, metas, headings, structured data, canonicals, internal linking, keyword strategy, product/collection optimization). Call for any SEO task.",
    doc: SEO,
  },
  {
    name: "email",
    tool: "email_playbook",
    title: "Email Playbook",
    label: "consulting email playbook",
    desc: "Email marketing — core flows (welcome, abandoned checkout, post-purchase, win-back) and high-converting email copy + subject lines. Call when writing email copy or planning flows.",
    doc: EMAIL,
  },
  {
    name: "aeo",
    tool: "aeo_playbook",
    title: "AI-Agent (AEO) Playbook",
    label: "consulting AEO playbook",
    desc: "Agent Engine Optimization — make the store recommendable by AI shopping agents: rich product data + attributes (metafields), structured-data schema, AI-readable FAQs, comparison content, trust/review surfacing, clear policies, recommendation-prompt keywords. Call for any 'optimize for AI agents' task.",
    doc: AEO,
  },
  {
    name: "speed",
    tool: "speed_playbook",
    title: "Speed Playbook",
    label: "consulting speed playbook",
    desc: "Storefront speed — Core Web Vitals (LCP/INP/CLS) thresholds + fix-by-metric, cutting apps/residual code, image compression & sizing, lazy-load vs preload, defer/async scripts & CSS, fonts, theme choice. Call for any site-speed / performance task.",
    doc: SPEED,
  },
];

const tn = (t: string) => `mcp__brain__${t}`;
export const REMEMBER_TOOL_NAME = "mcp__brain__remember";
export const BRAIN_TOOL_NAMES = BRAINS.map((b) => tn(b.tool));
export const BRAIN_LABELS: Record<string, string> = Object.fromEntries(BRAINS.map((b) => [tn(b.tool), b.label]));
/** Lightweight metadata for the Brains page (no docs). */
export const BRAIN_INFO = BRAINS.map((b) => ({ name: b.name, title: b.title, desc: b.desc }));

export function buildBrainMcp(shop?: string) {
  const brainTools = BRAINS.map((b) =>
    tool(b.tool, b.desc, {}, async () => {
      let text = b.doc;
      if (shop) {
        const custom = await getBrainDoc(shop, b.name).catch(() => null);
        if (custom) {
          text += `\n\n=== THIS STORE'S CUSTOM ${b.title.toUpperCase()} (highest priority — follow this where it conflicts with the above) ===\n${custom}`;
        }
      }
      return { content: [{ type: "text" as const, text }] };
    }),
  );

  const remember = shop
    ? tool(
        "remember",
        "Save a durable fact or preference about THIS store for future turns (a brand rule, a do/don't, a recurring instruction, a decision). Call whenever the merchant states something that should persist. One concise sentence.",
        { fact: z.string().describe("One concise, durable fact or preference to remember.") },
        async ({ fact }) => {
          await addMemory(shop, fact);
          return { content: [{ type: "text" as const, text: `Remembered: ${fact}` }] };
        },
      )
    : null;

  const all = (remember ? [...brainTools, remember] : brainTools) as Parameters<typeof createSdkMcpServer>[0]["tools"];
  return createSdkMcpServer({ name: "brain", version: "0.1.0", tools: all });
}
