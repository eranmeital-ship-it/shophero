import { query } from "@anthropic-ai/claude-agent-sdk";
import { modelChain } from "./model-router.server";
import { withShopLock } from "./shop-lock.server";
import { buildShopifyMcp, SHOPIFY_TOOL_NAME, type AdminCtx, type Deliverable } from "./shopify-tools.server";
import { orderedKeys, markFailed, markOk, keyFailureKind } from "./key-pool.server";
import { buildBrainMcp, BRAIN_TOOL_NAMES, BRAIN_LABELS, REMEMBER_TOOL_NAME } from "./knowledge-tools.server";

/**
 * Wraps the Claude Agent SDK for a single chat turn.
 *
 * SAFETY MODEL (read this — it's the whole point of Drift):
 * The agent edits files inside a *scratch working copy* (`cwd`). That copy is
 * not the dev theme and definitely not the live theme. Theme edits only reach
 * the dev theme when the merchant clicks "Apply" (api.apply.ts). The Shopify
 * Admin tool is the exception — its MUTATIONS write to the LIVE store at once;
 * the system prompt scopes that to explicit merchant requests only.
 *
 * MODEL ROUTING: each turn runs on the cheapest capable model (see
 * model-router). On a hard task it starts higher, and on failure it escalates
 * up the chain ("fallback to the best model").
 *
 * TOKEN ECONOMY: each message resumes the same per-shop session (`resume`), so
 * history + the explored theme stay cached (~0.1x input). `maxTurns` caps a
 * runaway turn.
 */

const MAX_TURNS = Number(process.env.DRIFT_MAX_TURNS ?? 16);
// Hard wall-clock cap per request — aborts a single runaway turn.
const REQUEST_TIMEOUT_MS = Number(process.env.DRIFT_REQUEST_TIMEOUT_MS ?? 240_000) || 240_000;
// "Quick" mode for small click-to-edit tweaks: bounded so a tweak can't grind to
// the 240s wall or escalate to a pricey re-run — it lands fast or fails fast.
const QUICK_MAX_TURNS = Number(process.env.DRIFT_QUICK_MAX_TURNS ?? 10);
const QUICK_TIMEOUT_MS = Number(process.env.DRIFT_QUICK_TIMEOUT_MS ?? 90_000) || 90_000;

// Cap concurrent agent turns per instance — each turn spawns a subprocess, so
// unbounded concurrency can exhaust RAM/CPU. Excess turns queue for a slot.
const MAX_CONCURRENT = Number(process.env.DRIFT_MAX_CONCURRENT ?? 4) || 4;
let activeTurns = 0;
const turnWaiters: (() => void)[] = [];
async function acquireSlot(): Promise<void> {
  if (activeTurns < MAX_CONCURRENT) {
    activeTurns++;
    return;
  }
  await new Promise<void>((resolve) => turnWaiters.push(resolve));
  activeTurns++;
}
function releaseSlot(): void {
  activeTurns = Math.max(0, activeTurns - 1);
  turnWaiters.shift()?.();
}


// The "brain": appended to Claude Code's preset. Static => prompt-cached.
const SYSTEM = `You edit a disposable copy of a Shopify Online Store 2.0 theme on disk, and can also manage live store resources via the Shopify Admin API. Make ONLY the change the merchant asks for — nothing extra.

Theme map:
- layout/theme.liquid — root wrapper. templates/*.json — page templates listing section instances with per-section "settings"/"blocks" (most page content/config lives here). sections/*.liquid — markup + a {% schema %} of editable settings/blocks/presets; *-group.json wire sections into header/footer. snippets/*.liquid — partials ({% render %}). config/settings_schema.json — global settings; settings_data.json holds values + color schemes. assets/ — CSS/JS/images. locales/*.json — strings.

Making theme changes well:
- Change a section's content/options by editing its instance "settings" in templates/*.json or *-group.json — don't hardcode if a setting exists. New options go in the section {% schema %} so the merchant can tweak them in the theme editor. Reuse existing color_scheme/settings/snippets. Prefer editing existing files. Keep edits minimal and valid.
- Rich-text settings (type "richtext" — e.g. a section "description") must be HTML whose top-level nodes are <p>, <ul>, <ol>, or <h1>–<h6>. Wrap text as "<p>...</p>" — plain text is rejected when the theme is saved.
- Every file you write must be COMPLETE and VALID — never save an empty or half-written file. JSON files (templates/*.json, *-group.json, config/*.json, locales/*.json) must parse as valid JSON; a section-group file (*-group.json) must contain the keys "type", "name", "sections", and "order". Prefer enabling/editing an EXISTING section (e.g. the theme's announcement bar) over creating a new section group — only create a *-group.json when no suitable section exists, and write its full valid contents in one go.

Two DIFFERENT change models — know which you're using:
- THEME FILE edits are staged in this working copy and only go live when the merchant clicks Apply. Reversible.
- The \`${SHOPIFY_TOOL_NAME}\` tool runs Shopify Admin GraphQL for store resources (products, collections, pages, blogs/articles, navigation, metafields). Queries are safe to explore. MUTATIONS write to the LIVE store immediately and CANNOT be undone — only run a mutation the merchant explicitly asked for. For bulk creation (e.g. many blog posts), generate all the content first, then create each item.
- When you create or update a store resource, request \`id\`, \`handle\`, and \`title\` in the mutation response so it can be linked for the merchant (articles: also request the parent \`blog { handle }\`). PUBLISH content the merchant wants live — set the published state (e.g. an article's \`isPublished: true\`/\`publishedAt\`, a page's published state) so it actually appears on the storefront; only leave it a draft if they ask for a draft.
- Large multi-item asks (e.g. "for each of 15 products…"): don't attempt dozens in one turn — you'll run out of time and the merchant gets nothing. Do a solid handful well (≈5–8 items), then clearly tell the merchant how many you completed and that they can run it again for the next batch, or use the one-click bulk tools / scheduled jobs to process the whole catalog safely in the background.
- EMAIL / newsletters / campaigns: Shopify does NOT allow apps to send email through the Admin API, so you CANNOT create or send a campaign in Shopify Email, Klaviyo, Mailchimp or anywhere — and you must say so plainly up front. What you CAN do: PLAN the campaign, WRITE the copy (paste-ready), CAPTURE subscribers (add an email-signup section that saves to the Shopify customer list), and create a discount code (with approval). Then tell the merchant the one step that's theirs: paste the copy into their email tool and send it. Never imply you sent or scheduled an email.

Conversion edge: for any conversion, optimization, redesign, or "make it sell/convert better" task (hero, product page, CTAs, trust, urgency, offers, cart, mobile), FIRST call the cro_playbook tool and apply the relevant tactics — it's ShopHero's proven playbook, not generic advice.

Building product pages: when asked to build/rebuild a high-converting product page (PDP), call BOTH cro_playbook and page_kit first, then assemble the proven sections from the kit into the product template — reusing the theme's existing sections where possible. State a short plan, build, then summarize the sections added.

Brand & memory: if a BRAND KIT or REMEMBERED facts appear below, treat them as hard constraints — match the voice, reuse the brand colors/fonts, and follow the do/don't rules. When the merchant states a durable preference or decision (a brand rule, a do/don't, "always/never do X"), call the remember tool to persist it for future turns.

Tailor every task to THIS store: before executing, briefly analyze the relevant current state (read what already exists — products, collections, existing content, the theme) and design the smartest, most store-aligned solution — not a generic template.

Domain brains — call the matching one BEFORE the work: cro_playbook (conversion/design), page_kit (product pages), content_strategy (blog/content), seo_playbook (SEO), email_playbook (email copy/flows), aeo_playbook (AI-agent visibility / AEO), speed_playbook (site speed/performance). A brain may include THIS STORE'S CUSTOM knowledge — treat that custom section as the highest priority.

Token discipline: prefer the Edit tool (targeted string replacement) over rewriting a whole file — change only the lines that move. Don't re-read a file you already read earlier this session unless it changed; reuse what's in context. With the shopify tool, request only the fields you need.

Before editing/mutating: in one or two sentences, state your plan (what + why). After: briefly summarize what changed and (for theme work) which theme-editor settings the merchant can adjust. Never publish, activate, or change which theme is live.`;

export interface AgentTurnResult {
  assistantText: string;
  toolEvents: string[];
  /** Real cost of this turn in USD, as reported by the Agent SDK. */
  costUsd?: number;
  /** Token usage for this turn, incl. cache hits (proof caching is working). */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  /** Which model actually produced the turn (after any escalation). */
  model?: string;
  /** Live store mutations the agent wants to run, held for merchant approval. */
  proposedMutations?: ProposedMutation[];
  /** Store resources created/updated this turn, with view links. */
  deliverables?: Deliverable[];
  /** Set when the turn failed/timed out — the caller still meters costUsd. */
  error?: string;
}

/** A live Admin mutation the agent wants to run — captured in full so the server
 * can REPLAY the exact operation on approval (not re-run the prompt). */
export interface ProposedMutation {
  summary: string;
  query: string;
  variables?: Record<string, unknown>;
}

/** Running cost across every attempt of a turn (escalation + route failover), so
 * spend is metered even when the turn ultimately fails/times out. */
interface CostAcc {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AgentTurnOpts {
  cwd: string;
  prompt: string;
  /** Keys the resumable session so the conversation persists across messages. */
  shop?: string;
  /** BYOK tier: the merchant's key. Omit to use the server's managed key. */
  apiKey?: string;
  /** Enables the Shopify Admin API tool (uses the merchant's OAuth token). */
  admin?: AdminCtx;
  /** When true, the agent may execute live Admin mutations (merchant approved). */
  allowMutations?: boolean;
  /** Brand kit + remembered facts, appended to the system prompt so output stays on-brand. */
  brandContext?: string;
  /** Resume id for this shop's conversation (DB-backed, survives restarts). */
  resumeSessionId?: string;
  /** Persist a new/updated session id for the shop. */
  onSessionId?: (id: string) => void;
  /** Called when a resume id is stale so the caller can clear it. */
  onResumeInvalid?: () => void;
  /** Streamed progress: fired per assistant text chunk + tool call as they happen. */
  onEvent?: (ev: { type: "tool" | "text"; value: string }) => void;
  /** Bounded mode for small visual edits — single cheap model, fewer turns, short
   *  timeout. Lands fast or fails fast instead of escalating to a 240s grind. */
  quick?: boolean;
}

/** Pull the mutation's field name (e.g. "collectionCreate") for a short label. */
function mutationLabel(q: string): string {
  const m = q.match(/mutation[^{]*\{\s*([A-Za-z0-9_]+)/);
  return m?.[1] ?? "graphql mutation";
}

/**
 * Agent ROUTES — different ways to reach the same Claude model, for capacity +
 * outage failover at scale. Primary: the Anthropic API key pool. Optional
 * fallbacks: Amazon Bedrock and Google Vertex (same model, separate quota pools).
 * Enable with env (plus the relevant cloud credentials):
 *   DRIFT_BEDROCK=1  DRIFT_BEDROCK_MODEL=<bedrock model id>  AWS_REGION=…  (+ AWS creds)
 *   DRIFT_VERTEX=1   DRIFT_VERTEX_MODEL=<vertex model id>   ANTHROPIC_VERTEX_PROJECT_ID=…  CLOUD_ML_REGION=…  (+ GCP creds)
 * BYOK shops use only the merchant's Anthropic key.
 */
interface AgentRoute {
  id: string;
  provider: "anthropic" | "bedrock" | "vertex";
  key?: string; // anthropic key, for cooldown bookkeeping
  modelId?: string; // fixed model id for cloud routes
  env: Record<string, string>; // SDK subprocess env overrides
}

function anthropicRoute(key?: string): AgentRoute {
  return { id: key ? `anthropic:…${key.slice(-6)}` : "anthropic:env", provider: "anthropic", key, env: key ? { ANTHROPIC_API_KEY: key } : {} };
}
function bedrockRoute(): AgentRoute | null {
  const modelId = process.env.DRIFT_BEDROCK_MODEL;
  if (process.env.DRIFT_BEDROCK !== "1" || !modelId) return null;
  return { id: "bedrock", provider: "bedrock", modelId, env: { CLAUDE_CODE_USE_BEDROCK: "1", AWS_REGION: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" } };
}
function vertexRoute(): AgentRoute | null {
  const modelId = process.env.DRIFT_VERTEX_MODEL;
  if (process.env.DRIFT_VERTEX !== "1" || !modelId || !process.env.ANTHROPIC_VERTEX_PROJECT_ID) return null;
  return {
    id: "vertex",
    provider: "vertex",
    modelId,
    env: { CLAUDE_CODE_USE_VERTEX: "1", ANTHROPIC_VERTEX_PROJECT_ID: process.env.ANTHROPIC_VERTEX_PROJECT_ID, CLOUD_ML_REGION: process.env.CLOUD_ML_REGION ?? "us-east5" },
  };
}

/** Ordered routes for this turn: Anthropic key-pool first, then Bedrock, then Vertex. */
function agentRoutes(opts: AgentTurnOpts): AgentRoute[] {
  if (opts.apiKey) return [anthropicRoute(opts.apiKey)]; // BYOK → Anthropic only
  const routes: AgentRoute[] = orderedKeys().map((k) => anthropicRoute(k));
  const b = bedrockRoute();
  if (b) routes.push(b);
  const v = vertexRoute();
  if (v) routes.push(v);
  if (!routes.length) routes.push(anthropicRoute(undefined)); // env default
  return routes;
}

// Only these env vars reach the agent subprocess. We deliberately do NOT pass the
// whole process.env — that holds SHOPIFY_API_SECRET, DATABASE_URL, the Anthropic
// key POOL, the cron + encryption secrets, etc., which a prompt-injected/jailbroken
// turn could otherwise exfiltrate. Tools run in the parent process and read
// process.env directly, so scrubbing the child env doesn't break them.
const AGENT_ENV_ALLOW = new Set([
  "PATH", "HOME", "SHELL", "TERM", "USER", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  "TMPDIR", "TEMP", "TMP", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
]);

/** Build the minimal, scrubbed SDK subprocess env for a route. */
function routeEnv(route: AgentRoute): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    // Allowlisted OS vars + the Claude Code / Anthropic SDK config it needs.
    if (AGENT_ENV_ALLOW.has(k) || /^(CLAUDE_CODE_|ANTHROPIC_)/.test(k)) base[k] = v;
  }
  delete base.ANTHROPIC_API_KEYS; // never leak the rotation pool — only the one route key
  delete base.CLAUDE_CODE_USE_BEDROCK;
  delete base.CLAUDE_CODE_USE_VERTEX;
  if (route.provider !== "anthropic") delete base.ANTHROPIC_API_KEY; // force the cloud provider
  return { ...base, ...route.env };
}

export async function runAgentTurn(opts: AgentTurnOpts): Promise<AgentTurnResult> {
  // Serialize per shop, then take a global slot (protects instance RAM/CPU).
  return withShopLock(opts.shop, async () => {
    await acquireSlot();
    const acc: CostAcc = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    const accUsage = () => ({ inputTokens: acc.inputTokens, outputTokens: acc.outputTokens, cacheReadTokens: acc.cacheReadTokens, cacheCreationTokens: acc.cacheCreationTokens });
    try {
      const result = await runTurnAcrossRoutes(opts, acc);
      // Report the TOTAL cost across attempts (not just the last), so metering is accurate.
      return { ...result, costUsd: acc.costUsd || result.costUsd, usage: accUsage() };
    } catch (err) {
      // Never throw away consumed cost: a turn that failed/aborted still burned
      // tokens. Return a failure result carrying the accumulated cost so the
      // caller meters it (the integrity gap behind "ran but wasn't billed").
      const message = err instanceof Error ? err.message : String(err);
      return {
        assistantText: "⚠️ This didn't finish — please try again. Anything not approved was not applied.",
        toolEvents: [],
        costUsd: acc.costUsd,
        usage: accUsage(),
        error: message,
      };
    } finally {
      releaseSlot();
    }
  });
}

/** Route failover + model escalation. On a rate/credit/overload error, fall to the next route. */
async function runTurnAcrossRoutes(opts: AgentTurnOpts, acc: CostAcc): Promise<AgentTurnResult> {
  const routes = agentRoutes(opts);
  let lastErr: unknown;
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    try {
      const result = await runTurnOnRoute(opts, route, i === 0, acc);
      if (route.key) markOk(route.key);
      return result;
    } catch (err) {
      lastErr = err;
      const kind = keyFailureKind(err);
      if (kind && i < routes.length - 1) {
        if (route.key) markFailed(route.key, kind);
        console.warn(`[agent] route ${route.id} failed (${kind}); failing over to next route`);
        continue;
      }
      throw err; // last route, or a non-retryable error → surface it
    }
  }
  throw lastErr ?? new Error("All agent routes are unavailable");
}

/** One turn on a route: Anthropic escalates cheap→strong; cloud routes use their fixed model. */
async function runTurnOnRoute(opts: AgentTurnOpts, route: AgentRoute, allowResume: boolean, acc: CostAcc): Promise<AgentTurnResult> {
  const fullChain = route.provider === "anthropic" ? modelChain(opts.prompt) : [route.modelId as string];
  // Quick edits never escalate — one cheap model, then fail fast.
  const chain = opts.quick ? fullChain.slice(0, 1) : fullChain;
  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const isLast = i === chain.length - 1;
    const resume = i === 0 && allowResume ? opts.resumeSessionId : undefined;

    try {
      const { result, ok, errorText } = await runQuery(opts, route, model, resume, acc);
      if (ok) return result;
      if (errorText && keyFailureKind(errorText)) throw new Error(errorText); // → route failover
      if (errorText?.startsWith("TIMEOUT")) return result; // don't escalate a timeout — it'd just time out again
      if (isLast) return result; // best effort
      lastErr = new Error(errorText ?? "model attempt failed");
    } catch (err) {
      if (keyFailureKind(err)) throw err; // bubble to the route-failover loop
      lastErr = err;
      // A stale/missing session id makes resume throw — retry this model fresh.
      if (resume) {
        opts.onResumeInvalid?.();
        try {
          const { result, ok, errorText } = await runQuery(opts, route, model, undefined, acc);
          if (ok) return result;
          if (errorText && keyFailureKind(errorText)) throw new Error(errorText);
          if (isLast) return result;
        } catch (err2) {
          if (keyFailureKind(err2)) throw err2;
          lastErr = err2;
        }
      }
    }
    // escalate to the next (stronger) model
  }

  throw lastErr ?? new Error("Agent turn failed");
}

async function runQuery(
  opts: AgentTurnOpts,
  route: AgentRoute,
  model: string,
  resume: string | undefined,
  acc: CostAcc,
): Promise<{ result: AgentTurnResult; ok: boolean; errorText?: string }> {
  const { cwd, prompt, admin } = opts;

  let assistantText = "";
  const toolEvents: string[] = [];
  let costUsd: number | undefined;
  let usage: AgentTurnResult["usage"];
  let sessionId: string | undefined;
  let ok = true;
  let errorText: string | undefined;
  const proposed: ProposedMutation[] = [];
  const delivered: Deliverable[] = [];

  // Bash = shell exec on the server (shared, multi-tenant process) — the biggest
  // attack surface, reachable via prompt injection from store content. OFF by
  // default; the theme tooling works fine with Read/Write/Edit/Glob/Grep. Opt in
  // with DRIFT_ALLOW_BASH=true only in an isolated/sandboxed deployment.
  const allowedTools = ["Read", "Write", "Edit", "Glob", "Grep"];
  if (process.env.DRIFT_ALLOW_BASH === "true") allowedTools.push("Bash");
  allowedTools.push(...BRAIN_TOOL_NAMES); // domain brains — always available
  if (opts.shop) allowedTools.push(REMEMBER_TOOL_NAME); // long-term memory
  if (admin) allowedTools.push(SHOPIFY_TOOL_NAME);

  // Append the per-shop brand kit + memory so output stays on-brand (static per
  // shop, so the resumed session still caches it).
  const systemAppend = SYSTEM + (opts.brandContext ? `\n\n${opts.brandContext}` : "");

  // Hard wall-clock cap — abort a runaway turn so one request can't run forever.
  // Quick visual edits get a much shorter leash.
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), opts.quick ? QUICK_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

  try {
  for await (const message of query({
    prompt,
    options: {
      cwd,
      model,
      maxTurns: opts.quick ? QUICK_MAX_TURNS : MAX_TURNS,
      permissionMode: "acceptEdits",
      abortController,
      ...(resume ? { resume } : {}),
      allowedTools,
      // Always give the agent the CRO "brain"; add live Admin API when available.
      mcpServers: {
        brain: buildBrainMcp(opts.shop),
        ...(admin
          ? {
              shopify: buildShopifyMcp(admin, {
                allowMutations: !!opts.allowMutations,
                onProposed: (m) => proposed.push({ summary: mutationLabel(m.query), query: m.query, variables: m.variables }),
                onDelivered: (d) => delivered.push(d),
              }),
            }
          : {}),
      },
      systemPrompt: { type: "preset", preset: "claude_code", append: systemAppend },
      env: routeEnv(route),
    },
  })) {
    const sid = (message as { session_id?: string }).session_id;
    if (sid) sessionId = sid;

    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          assistantText += block.text;
          opts.onEvent?.({ type: "text", value: block.text });
        } else if (block.type === "tool_use") {
          const input = block.input as Record<string, unknown>;
          const target = input?.file_path ?? input?.path ?? "";
          // Label the Shopify tool by op type rather than a (non-existent) path.
          const label =
            BRAIN_LABELS[block.name] ??
            (block.name === REMEMBER_TOOL_NAME
              ? "remembering for next time"
              : block.name === SHOPIFY_TOOL_NAME
                ? `shopify ${/\bmutation\b/.test(String(input?.query ?? "")) ? "mutation" : "query"}`
                : `${block.name}${target ? ` ${target}` : ""}`);
          toolEvents.push(label);
          opts.onEvent?.({ type: "tool", value: label });
        }
      }
    }
    // The final `result` message carries cost, usage, and a success/error subtype.
    if (message.type === "result") {
      const r = message as {
        subtype?: string;
        total_cost_usd?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      ok = r.subtype === "success";
      if (!ok) {
        const rr = message as { result?: unknown; error?: unknown };
        errorText = [r.subtype, typeof rr.result === "string" ? rr.result : "", typeof rr.error === "string" ? rr.error : ""]
          .filter(Boolean)
          .join(" ");
      }
      costUsd = r.total_cost_usd;
      usage = {
        inputTokens: r.usage?.input_tokens,
        outputTokens: r.usage?.output_tokens,
        cacheReadTokens: r.usage?.cache_read_input_tokens,
        cacheCreationTokens: r.usage?.cache_creation_input_tokens,
      };
      // Accumulate across attempts — even a failed/timed-out result burned tokens.
      acc.costUsd += r.total_cost_usd ?? 0;
      acc.inputTokens += r.usage?.input_tokens ?? 0;
      acc.outputTokens += r.usage?.output_tokens ?? 0;
      acc.cacheReadTokens += r.usage?.cache_read_input_tokens ?? 0;
      acc.cacheCreationTokens += r.usage?.cache_creation_input_tokens ?? 0;
    }
  }
  } catch (e) {
    // The wall-clock cap aborts via abortController — the SDK reports that as
    // "aborted by user", which is misleading. Turn it into a clear, actionable
    // message shown to the merchant, and mark it TIMEOUT so the caller doesn't
    // escalate to a pricier model (which would just time out again).
    if (abortController.signal.aborted) {
      ok = false;
      errorText = "TIMEOUT";
      const note =
        "⏱️ This took longer than the time limit and was stopped before finishing. Try fewer items at once (e.g. 5 products at a time), or use the one-click bulk tools / scheduled jobs for large batches — they run safely in the background. Anything not yet approved was not applied.";
      assistantText = assistantText ? `${assistantText}\n\n${note}` : note;
    } else {
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }

  if (sessionId) opts.onSessionId?.(sessionId);

  return {
    result: {
      assistantText: assistantText.trim(),
      toolEvents,
      costUsd,
      usage,
      model,
      proposedMutations: proposed.length ? proposed : undefined,
      deliverables: delivered.length ? delivered : undefined,
    },
    ok,
    errorText,
  };
}
