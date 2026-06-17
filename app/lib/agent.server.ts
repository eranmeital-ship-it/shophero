import { query } from "@anthropic-ai/claude-agent-sdk";

/**
 * Wraps the Claude Agent SDK for a single chat turn.
 *
 * SAFETY MODEL (read this — it's the whole point of Drift):
 * The agent edits files inside a *scratch working copy* (`cwd`). That copy is
 * not the dev theme and definitely not the live theme. Because the working dir
 * is disposable, we let the agent edit freely there (`permissionMode:
 * "acceptEdits"`). Nothing touches the dev theme until the merchant explicitly
 * clicks "Apply" (see api.apply.ts), and there is no publish path at all.
 * That two-stage gate (scratch -> approve -> dev theme) is the "manual/approval"
 * behavior, enforced at the app layer rather than via SDK permission prompts.
 */

const MODEL = process.env.DRIFT_MODEL ?? "claude-sonnet-4-6";

const SCOPE_NOTE = `You are editing a copy of a Shopify theme on disk (Liquid, JSON
templates, sections, snippets, assets). Make the change the merchant asks for and
nothing else. Keep edits minimal and reviewable. Prefer editing existing section/
template files over inventing new ones unless asked. Never add code that publishes
or activates a theme. When you finish, briefly summarize what you changed and which
files the merchant can now tweak in the Shopify theme editor.`;

export interface AgentTurnResult {
  assistantText: string;
  toolEvents: string[];
}

export async function runAgentTurn(opts: {
  cwd: string;
  prompt: string;
  /** BYOK tier: the merchant's key. Omit to use the server's managed key. */
  apiKey?: string;
}): Promise<AgentTurnResult> {
  const { cwd, prompt, apiKey } = opts;

  let assistantText = "";
  const toolEvents: string[] = [];

  for await (const message of query({
    prompt,
    options: {
      cwd,
      model: MODEL,
      permissionMode: "acceptEdits",
      // Theme work only needs file + shell tools. No network/web tools in v0.
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      // Keep Claude Code's strong file-editing behavior, add our scoping.
      systemPrompt: { type: "preset", preset: "claude_code", append: SCOPE_NOTE },
      // BYOK: inject the merchant's key only for this run.
      ...(apiKey
        ? { env: { ...process.env, ANTHROPIC_API_KEY: apiKey } }
        : {}),
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          assistantText += block.text;
        } else if (block.type === "tool_use") {
          const target =
            (block.input as Record<string, unknown>)?.file_path ??
            (block.input as Record<string, unknown>)?.path ??
            "";
          toolEvents.push(`${block.name}${target ? ` ${target}` : ""}`);
        }
      }
    }
    // `result` messages carry final status/usage; we ignore them in v0.
  }

  return { assistantText: assistantText.trim(), toolEvents };
}

