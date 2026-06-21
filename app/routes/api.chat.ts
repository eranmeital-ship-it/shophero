import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { runAgentTurn } from "../lib/agent.server";
import { changedFiles } from "../lib/workspace.server";
import { getActivePlan, settleUsage } from "../lib/billing.server";
import { buildBrandContext, getAgentSession, setAgentSession, clearAgentSession } from "../lib/brand.server";
import { decrypt } from "../lib/crypto.server";
import { checkSpend } from "../lib/spend-guard.server";
import { maybeScheduleBulk } from "../lib/jobs.server";
import { advanceDueJobs } from "../lib/job-runner.server";
import db from "../db.server";

/** Stream a single assistant message as NDJSON (matches the client parser). */
function messageStream(text: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(JSON.stringify({ type: "start" }) + "\n"));
      c.enqueue(enc.encode(JSON.stringify({ type: "done", assistantText: text, toolEvents: [], pending: [] }) + "\n"));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

const MAX_PROMPT_CHARS = 8000;

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };

  // ── Plan gate ────────────────────────────────────────────────────────────
  const activePlan = await getActivePlan(admin);
  if (!activePlan) {
    // No active subscription — send them to pricing
    return redirect("/app/pricing");
  }

  // ── Resolve API key ────────────────────────────────────────────────────────
  let apiKey: string | undefined;

  if (activePlan === "byok") {
    const record = await db.session.findFirst({ where: { shop: session.shop } });
    if (!record?.anthropicApiKey) {
      // BYOK plan but no key saved yet
      return Response.json(
        { error: "Add your Anthropic API key in Settings before using Drift." },
        { status: 402 }
      );
    }
    apiKey = decrypt(record.anthropicApiKey);
  }
  // managed plan: apiKey stays undefined — agent uses server's ANTHROPIC_API_KEY

  // ── Run agent ──────────────────────────────────────────────────────────────
  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(`Message too long (max ${MAX_PROMPT_CHARS} characters).`, { status: 413 });
  }
  // Set by the "Approve store changes" button — lets the agent run live mutations.
  const allowMutations = form.get("allowMutations") === "1";

  // Slow-release scope guard: a big bulk ask ("rewrite all 3,000 descriptions")
  // is scheduled to roll out over days instead of running all at once.
  if (!allowMutations) {
    const scheduled = await maybeScheduleBulk(prompt, admin, session.shop).catch(() => null);
    if (scheduled) {
      await db.appEvent
        .create({ data: { shop: session.shop, level: "info", type: "job_scheduled", message: scheduled.slice(0, 200) } })
        .catch(() => {});
      return messageStream(scheduled);
    }
  }

  // On-entry tick: advance one due scheduled job (no-op unless DRIFT_JOBS_AUTORUN=true).
  void advanceDueJobs(session.shop, ctx).catch(() => {});

  // Spend defense gate — block the turn if a daily/monthly/global cap is hit.
  const gate = await checkSpend(session.shop, activePlan);
  if (!gate.allowed) {
    await db.appEvent
      .create({ data: { shop: session.shop, level: "warn", type: "spend_cap", message: gate.reason ?? "cap reached" } })
      .catch(() => {});
    return new Response(gate.reason ?? "Usage limit reached.", { status: 402 });
  }

  const { dir } = await ensureReady(ctx);

  // Brand kit + remembered facts (on-brand output) and the DB-backed resume id.
  const brandContext = await buildBrandContext(session.shop).catch(() => "");
  const resumeSessionId = await getAgentSession(session.shop).catch(() => undefined);

  // Stream NDJSON: progress events keep the connection alive past Cloudflare's
  // ~100s timeout (a long campaign turn would otherwise 524) and show live work.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "start" }); // flush headers immediately
      try {
        const r = await runAgentTurn({
          cwd: dir,
          prompt,
          apiKey,
          shop: session.shop,
          admin: ctx, // enables the live Shopify Admin API tool
          allowMutations, // approved? agent may run live mutations
          brandContext, // brand kit + remembered facts
          resumeSessionId,
          onSessionId: (id) => void setAgentSession(session.shop, id),
          onResumeInvalid: () => void clearAgentSession(session.shop),
          onEvent: (ev) => send(ev), // {type:"tool"|"text", value}
        });
        const pending = await changedFiles(dir);
        console.log(
          `[chat] ${session.shop} model=${r.model} cost=$${(r.costUsd ?? 0).toFixed(4)} ` +
            `in=${r.usage?.inputTokens ?? "?"} out=${r.usage?.outputTokens ?? "?"} ` +
            `cacheRead=${r.usage?.cacheReadTokens ?? 0} cacheWrite=${r.usage?.cacheCreationTokens ?? 0}`,
        );
        // Persist usage for the admin console (billed = 3x raw on managed).
        await db.usageEvent
          .create({
            data: {
              shop: session.shop,
              plan: activePlan,
              model: r.model ?? null,
              kind: "chat",
              costUsd: r.costUsd ?? null,
              billedUsd: activePlan === "managed" ? (r.costUsd ?? 0) * 3 : 0,
              inputTokens: r.usage?.inputTokens ?? null,
              outputTokens: r.usage?.outputTokens ?? null,
              cacheReadTokens: r.usage?.cacheReadTokens ?? null,
            },
          })
          .catch(() => {});

        // Activity log — record the command so it shows in the Activity feed.
        await db.appEvent
          .create({ data: { shop: session.shop, level: "info", type: "command", message: prompt.slice(0, 300) } })
          .catch(() => {});

        // Meter usage + auto-bill $30 top-ups (managed plan only). Best-effort —
        // never let a billing hiccup break the chat response.
        let billing;
        if (activePlan === "managed") {
          billing = (await settleUsage(admin, session.shop).catch(() => null)) ?? undefined;
        }

        send({
          type: "done",
          assistantText: r.assistantText,
          toolEvents: r.toolEvents,
          pending,
          costUsd: r.costUsd,
          usage: r.usage,
          model: r.model,
          proposedMutations: r.proposedMutations,
          billing,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.appEvent
          .create({ data: { shop: session.shop, level: "error", type: "chat_error", message } })
          .catch(() => {});
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
