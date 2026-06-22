import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { insertSections } from "../lib/section-library.server";
import { PDP_BLUEPRINT_MAP } from "../lib/pdp-templates";

/**
 * Apply a best-practice PDP blueprint — inserts its full section stack into the
 * product template in one deterministic ($0) pass, staged for approval.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const form = await request.formData();
  const blueprint = PDP_BLUEPRINT_MAP[String(form.get("blueprint") ?? "")];
  if (!blueprint) return Response.json({ error: "Unknown PDP template." }, { status: 400 });

  const { dir } = await ensureReady(ctx);
  const res = await insertSections(dir, "product", blueprint.sections);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true, files: res.files });
}
