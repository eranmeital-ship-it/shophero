import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { executeApprovedMutations } from "../lib/shopify-tools.server";
import db from "../db.server";

/**
 * Execute the live Admin mutations the agent proposed last turn — the REAL
 * approval gate. We replay the exact stored operations (query + variables) for
 * this shop, rather than re-running the prompt or trusting a client flag, so what
 * runs is exactly what the merchant reviewed. Single-use: the pending set is
 * deleted before execution.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const row = await db.pendingMutation.findUnique({ where: { shop: session.shop } });
  if (!row) return Response.json({ ok: true, applied: 0, message: "Nothing to approve." });

  let mutations: { query: string; variables?: Record<string, unknown> }[] = [];
  try {
    const parsed = JSON.parse(row.mutations);
    if (Array.isArray(parsed)) mutations = parsed;
  } catch {
    mutations = [];
  }
  // Delete first → single-use, no double-apply on a double-click/replay.
  await db.pendingMutation.delete({ where: { shop: session.shop } }).catch(() => {});

  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const res = await executeApprovedMutations(ctx, mutations);
  await db.appEvent
    .create({ data: { shop: session.shop, level: res.failed ? "warn" : "info", type: "approve", message: `Approved ${res.applied} mutation(s)${res.failed ? `, ${res.failed} failed` : ""}` } })
    .catch(() => {});

  return Response.json({ ok: true, applied: res.applied, failed: res.failed, deliverables: res.deliverables, errors: res.errors });
}
