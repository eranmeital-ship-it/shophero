import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { insertSection } from "../lib/section-library.server";

/**
 * Insert a curated library section into the working theme (staged for approval).
 * Deterministic — writes a known-good section file + adds it to the chosen
 * template. The merchant then previews and clicks Apply like any theme edit.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const form = await request.formData();
  const key = String(form.get("key") ?? "");
  const target = String(form.get("target") ?? "index");
  const variant = String(form.get("variant") ?? "") || undefined;

  const { dir } = await ensureReady(ctx);
  const res = await insertSection(dir, key, target, variant);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true });
}
