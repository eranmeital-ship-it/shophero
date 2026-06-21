import Anthropic from "@anthropic-ai/sdk";
import { orderedKeys } from "./key-pool.server";

/**
 * Structured-layer LLM router — for stateless "prompt → text/JSON" calls (store
 * report, content drafts, onboarding analysis). NOT for the agent (that's the
 * Claude Agent SDK, Anthropic-only).
 *
 *   ShopHero → complete() → Anthropic (primary) → OpenAI → Gemini → OpenRouter
 *
 * A provider is active only if its key env var is set; order is configurable via
 * DRIFT_LLM_PROVIDERS. On any error (rate limit, outage, 5xx) it fails over to the
 * next provider — the caller never knows. BYOK shops are pinned to Anthropic with
 * their own key (we never spend our other-provider credits for them).
 *
 * Env: ANTHROPIC_API_KEY / ANTHROPIC_API_KEYS, OPENAI_API_KEY, GEMINI_API_KEY,
 * OPENROUTER_API_KEY; optional *_MODEL overrides; DRIFT_LLM_PROVIDERS.
 */

export type Tier = "cheap" | "smart";

export interface CompleteOpts {
  system: string; // instruction prompt
  cachePrefix?: string; // large doc to cache (Anthropic) / prepend (others) — e.g. a brain
  user: string; // the user message
  maxTokens?: number;
  tier?: Tier;
  byokKey?: string; // merchant's Anthropic key → Anthropic-only, no cross-provider fallback
}

export interface CompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  provider: string;
  model: string;
}

const MODELS: Record<string, Record<Tier, string>> = {
  anthropic: { cheap: process.env.DRIFT_MODEL ?? "claude-haiku-4-5", smart: "claude-sonnet-4-6" },
  openai: { cheap: process.env.OPENAI_MODEL ?? "gpt-4o-mini", smart: "gpt-4o" },
  gemini: { cheap: process.env.GEMINI_MODEL ?? "gemini-1.5-flash", smart: "gemini-1.5-pro" },
  openrouter: { cheap: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini", smart: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o" },
};

// Rough $/1M [input, output] by model substring.
const PRICE: Record<string, [number, number]> = {
  "claude-haiku": [1, 5], "claude-sonnet": [3, 15], "claude-opus": [5, 25], "claude-fable": [10, 50],
  "gpt-4o-mini": [0.15, 0.6], "gpt-4o": [2.5, 10],
  "gemini-1.5-flash": [0.075, 0.3], "gemini-2.0-flash": [0.1, 0.4], "gemini-1.5-pro": [1.25, 5],
};
function priceFor(model: string): [number, number] {
  const k = Object.keys(PRICE).find((p) => model.includes(p));
  return k ? PRICE[k] : [1, 5];
}

function anthropicKey(byokKey?: string): string | undefined {
  return byokKey ?? orderedKeys()[0] ?? process.env.ANTHROPIC_API_KEY ?? undefined;
}

function providerAvailable(p: string, byokKey?: string): boolean {
  switch (p) {
    case "anthropic":
      return !!anthropicKey(byokKey);
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "gemini":
      return !!process.env.GEMINI_API_KEY;
    case "openrouter":
      return !!process.env.OPENROUTER_API_KEY;
    default:
      return false;
  }
}

function providerOrder(): string[] {
  return (process.env.DRIFT_LLM_PROVIDERS ?? "anthropic,openai,gemini,openrouter").split(",").map((s) => s.trim()).filter(Boolean);
}

type Adapter = (opts: CompleteOpts, model: string) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

const adapters: Record<string, Adapter> = {
  async anthropic(opts, model) {
    const key = anthropicKey(opts.byokKey);
    if (!key) throw new Error("no anthropic key");
    const client = new Anthropic({ apiKey: key });
    const system = opts.cachePrefix
      ? [
          { type: "text" as const, text: opts.cachePrefix, cache_control: { type: "ephemeral" as const } },
          { type: "text" as const, text: opts.system },
        ]
      : opts.system;
    const msg = await client.messages.create({ model, max_tokens: opts.maxTokens ?? 2000, system, messages: [{ role: "user", content: opts.user }] });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    return { text, inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 };
  },

  async openai(opts, model) {
    const sys = opts.cachePrefix ? `${opts.cachePrefix}\n\n${opts.system}` : opts.system;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 2000, messages: [{ role: "system", content: sys }, { role: "user", content: opts.user }] }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: d.choices?.[0]?.message?.content ?? "", inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 };
  },

  async gemini(opts, model) {
    const sys = opts.cachePrefix ? `${opts.cachePrefix}\n\n${opts.system}` : opts.system;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 2000 },
      }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return { text, inputTokens: d.usageMetadata?.promptTokenCount ?? 0, outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0 };
  },

  async openrouter(opts, model) {
    const sys = opts.cachePrefix ? `${opts.cachePrefix}\n\n${opts.system}` : opts.system;
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 2000, messages: [{ role: "system", content: sys }, { role: "user", content: opts.user }] }),
    });
    if (!r.ok) throw new Error(`openrouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: d.choices?.[0]?.message?.content ?? "", inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 };
  },
};

/** Run a structured completion with provider failover. Throws only if every provider fails. */
export async function complete(opts: CompleteOpts): Promise<CompleteResult> {
  const tier = opts.tier ?? "cheap";
  const order = opts.byokKey ? ["anthropic"] : providerOrder();
  const providers = order.filter((p) => providerAvailable(p, opts.byokKey));
  if (!providers.length) throw new Error("No LLM provider configured");

  let lastErr: unknown;
  for (const p of providers) {
    const model = MODELS[p]?.[tier];
    if (!model) continue;
    try {
      const r = await adapters[p](opts, model);
      if (!r.text.trim()) throw new Error(`${p} returned empty`);
      const [inP, outP] = priceFor(model);
      return { ...r, provider: p, model, costUsd: (r.inputTokens / 1e6) * inP + (r.outputTokens / 1e6) * outP };
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] ${p} failed, failing over:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr ?? new Error("All LLM providers failed");
}
