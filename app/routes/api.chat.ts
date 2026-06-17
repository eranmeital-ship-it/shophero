import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { runAgentTurn } from "../lib/agent.server";
import { changedFiles } from "../lib/workspace.server";

/**
 * POST a { prompt } and Drift runs one agent turn against the scratch copy.
 * The agent's file edits stay local (uncommitted); we return them as the set of
 * pending changes for the merchant to review and Apply.
 *
 * v0 is non-streaming: it returns once the turn completes. Upgrade path: stream
 * SDK messages over SSE so tool activity shows live in the chat.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };

  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });

  const { dir } = await ensureReady(ctx);

  // BYOK tier: look up the merchant's stored key and pass it here. Managed tier
  // leaves apiKey undefined and the agent uses the server's ANTHROPIC_API_KEY.
  const { assistantText, toolEvents } = await runAgentTurn({ cwd: dir, prompt });

  const pending = await changedFiles(dir);

  return Response.json({ assistantText, toolEvents, pending });
}
